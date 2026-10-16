import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBackupApiReadClient, BackupReadError } from '../src/pages/admin/backups/backupApiRead.ts';
import { readBackupConfigHistory, readBackupConfigVersion } from '../src/pages/admin/backups/backupLiveConfig.ts';

const values = JSON.parse(readFileSync(new URL('../../contracts/system-backup/v12/admin-control-redacted-examples.json', import.meta.url))).config_update_request.config;
const signal = () => new AbortController().signal;
function resource(version, active = version === 120) {
  return { schema_version: 'system-backup-config.v1', origin_installation_id: 'installation_fixture', version,
    row_version: 1, active, effective_enabled: false, config: values,
    created_by: '42', change_reason: null, created_at: '2026-10-12T00:00:00Z' };
}
const currentConfig = () => resource(120);
const pageItems = (top, count) => Array.from({ length: count }, (_, index) => resource(top - index));
const errorCode = (code) => (error) => error instanceof BackupReadError && error.code === code;

test('history reads only requested pages, preserves descending versions and carries opaque cursors', async () => {
  const calls = [];
  const cursors = ['first +/&?=Ω', 'second :/?'];
  const client = createBackupApiReadClient(async (path) => {
    const url = new URL(path, 'https://test.invalid');
    if (!url.pathname.endsWith('/versions')) { calls.push('current'); return new Response(JSON.stringify(currentConfig())); }
    const cursor = url.searchParams.get('cursor');
    calls.push({ limit: url.searchParams.get('limit'), cursor });
    const index = cursor === null ? 0 : cursors.indexOf(cursor) + 1;
    return new Response(JSON.stringify({ items: pageItems(120 - index * 50, index === 2 ? 20 : 50),
      next_cursor: cursors[index] ?? null, consistency: 'stable_cutoff' }));
  });
  const first = await readBackupConfigHistory(client, currentConfig(), signal());
  assert.equal(first.items.length, 50);
  assert.deepEqual(calls, ['current', { limit: '50', cursor: null }, 'current']);
  const second = await readBackupConfigHistory(client, currentConfig(), signal(), first);
  const third = await readBackupConfigHistory(client, currentConfig(), signal(), second);
  assert.deepEqual(third.items.map((item) => item.version), Array.from({ length: 120 }, (_, index) => 120 - index));
  assert.deepEqual(calls.filter((item) => typeof item === 'object'), [
    { limit: '50', cursor: null }, { limit: '50', cursor: cursors[0] }, { limit: '50', cursor: cursors[1] },
  ]);
  assert.equal(first.items.length, 50);
  assert.equal(await readBackupConfigHistory(client, currentConfig(), signal(), third), third);
  assert.equal(calls.length, 9, 'no request beyond the terminal cursor');
});

test('single-version reads bind the exact version and current configuration on both sides', async () => {
  const calls = [];
  const client = createBackupApiReadClient(async (path) => {
    calls.push(path);
    return new Response(JSON.stringify(path.endsWith('/versions/7') ? resource(7) : currentConfig()));
  });
  assert.deepEqual(await readBackupConfigVersion(client, currentConfig(), 7, 1, signal()), resource(7));
  assert.deepEqual(calls, ['/api/v1/admin/system-backup-config', '/api/v1/admin/system-backup-config/versions/7', '/api/v1/admin/system-backup-config']);
});

test('continuations reject installation, active version, row version and effective-state changes before a request', async (t) => {
  const client = { async config() { return currentConfig(); }, async configVersions() {
    return { items: pageItems(120, 50), next_cursor: 'next', consistency: 'stable_cutoff' };
  } };
  const first = await readBackupConfigHistory(client, currentConfig(), signal());
  for (const changed of [{ origin_installation_id: 'installation_other' }, { version: 121 }, { row_version: 2 }, { effective_enabled: true }]) {
    await t.test(Object.keys(changed)[0], async () => {
      const unreachable = { async config() { assert.fail('invalid continuation issued a request'); } };
      await assert.rejects(readBackupConfigHistory(unreachable, { ...currentConfig(), ...changed }, signal(), first), errorCode('invalid_config_continuation'));
    });
  }
});

test('history rejects loops, cross-page overlaps and foreign installation rows', async (t) => {
  for (const reason of ['loop', 'overlap', 'foreign']) await t.test(reason, async () => {
    let reads = 0;
    const client = createBackupApiReadClient(async (path) => {
      if (!path.includes('/versions?')) return new Response(JSON.stringify(currentConfig()));
      reads += 1;
      let items = pageItems(reads === 1 ? 120 : reason === 'overlap' ? 71 : 70, 50);
      if (reads === 2 && reason === 'foreign') items = items.map((item) => ({ ...item, origin_installation_id: 'installation_other' }));
      return new Response(JSON.stringify({ items, next_cursor: reads === 1 || reason === 'loop' ? 'next' : 'later', consistency: 'stable_cutoff' }));
    });
    const first = await readBackupConfigHistory(client, currentConfig(), signal());
    await assert.rejects(readBackupConfigHistory(client, currentConfig(), signal(), first),
      errorCode(reason === 'foreign' ? 'snapshot_changed' : 'invalid_config_continuation'));
    assert.equal(first.items.length, 50);
  });
});

test('history activation flags and active row version must agree with the workspace baseline', async (t) => {
  for (const changed of [{ active: false }, { row_version: 2 }, { effective_enabled: true, config: { ...values, enabled: true } }]) {
    await t.test(Object.keys(changed)[0], async () => {
      const client = createBackupApiReadClient(async (path) => new Response(JSON.stringify(path.includes('/versions?')
        ? { items: [{ ...currentConfig(), ...changed }], next_cursor: null, consistency: 'stable_cutoff' } : currentConfig())));
      await assert.rejects(readBackupConfigHistory(client, currentConfig(), signal()), errorCode('snapshot_changed'));
    });
  }
});

test('current-configuration drift before or after a page cannot publish that page', async (t) => {
  for (const stage of ['before', 'after']) await t.test(stage, async () => {
    let currentReads = 0;
    let pages = 0;
    const client = { async config() {
      currentReads += 1;
      return stage === 'before' || currentReads === 2 ? { ...currentConfig(), version: 121 } : currentConfig();
    }, async configVersions() { pages += 1; return { items: [currentConfig()], next_cursor: null, consistency: 'stable_cutoff' }; } };
    await assert.rejects(readBackupConfigHistory(client, currentConfig(), signal()), errorCode('snapshot_changed'));
    assert.equal(pages, stage === 'before' ? 0 : 1);
  });
});

test('an empty first history is not reported when the active configuration exists', async () => {
  const client = { async config() { return currentConfig(); }, async configVersions() {
    return { items: [], next_cursor: null, consistency: 'stable_cutoff' };
  } };
  await assert.rejects(readBackupConfigHistory(client, currentConfig(), signal()), errorCode('invalid_config_continuation'));
});

test('single-version rows reject a different installation, wrong version, stale row or wrong activation', async (t) => {
  for (const changed of [{ origin_installation_id: 'installation_other' }, { version: 8 }, { row_version: 0 }, { active: true }]) {
    await t.test(Object.keys(changed)[0], async () => {
      const client = { async config() { return currentConfig(); }, async configVersion() { return { ...resource(7), ...changed }; } };
      await assert.rejects(readBackupConfigVersion(client, currentConfig(), 7, 1, signal()), errorCode('snapshot_changed'));
    });
  }
});

test('both config reads discard canceled results at every request stage', async (t) => {
  for (const mode of ['history', 'version']) for (const stage of [0, 1, 2, 3]) await t.test(`${mode}/${stage}`, async () => {
    const controller = new AbortController();
    let step = 0;
    const tick = () => { step += 1; if (step === stage) controller.abort(); };
    const client = {
      async config() { tick(); return currentConfig(); },
      async configVersions() { tick(); return { items: [currentConfig()], next_cursor: null, consistency: 'stable_cutoff' }; },
      async configVersion() { tick(); return resource(7); },
    };
    if (stage === 0) controller.abort();
    const pending = mode === 'history' ? readBackupConfigHistory(client, currentConfig(), controller.signal)
      : readBackupConfigVersion(client, currentConfig(), 7, 1, controller.signal);
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(step, stage);
  });
});

test('invalid version selection cannot issue a request', async () => {
  const client = { async config() { assert.fail('invalid version issued a request'); } };
  for (const [version, minimum] of [[0, 1], [-1, 1], [Number.MAX_SAFE_INTEGER + 1, 1], [7, 0]]) {
    await assert.rejects(readBackupConfigVersion(client, currentConfig(), version, minimum, signal()), errorCode('invalid_version'));
  }
});

test('config failures and unreviewed fields never fall back to an empty history or preview', async (t) => {
  for (const status of [401, 403, 503]) await t.test(String(status), async () => {
    const client = createBackupApiReadClient(async (path) => path.includes('/versions')
      ? new Response(JSON.stringify({ code: 'not_ready' }), { status }) : new Response(JSON.stringify(currentConfig())));
    for (const read of [() => readBackupConfigHistory(client, currentConfig(), signal()), () => readBackupConfigVersion(client, currentConfig(), 7, 1, signal())]) {
      await assert.rejects(read, (error) => error instanceof BackupReadError && error.status === status);
    }
  });
  const client = createBackupApiReadClient(async (path) => new Response(JSON.stringify(path.includes('/versions')
    ? { items: [{ ...currentConfig(), canonical_config_json: 'private bytes' }], next_cursor: null, consistency: 'stable_cutoff' }
    : currentConfig())));
  await assert.rejects(readBackupConfigHistory(client, currentConfig(), signal()), errorCode('invalid_response'));
});

test('the baseline is captured before awaiting external reads', async () => {
  const selected = currentConfig();
  const client = { async config() { selected.version = 121; return currentConfig(); }, async configVersions() {
    return { items: [currentConfig()], next_cursor: null, consistency: 'stable_cutoff' };
  } };
  const result = await readBackupConfigHistory(client, selected, signal());
  assert.equal(result.baseline.version, 120);
});
