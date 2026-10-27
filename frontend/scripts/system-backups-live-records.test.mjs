import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBackupApiReadClient, BackupReadError } from '../src/pages/admin/backups/backupApiRead.ts';
import { createBackupLiveSource, nextBackupReadDelay } from '../src/pages/admin/backups/backupLiveSource.ts';
import { createBackupPreview } from '../src/pages/admin/backups/backupPreview.ts';

const preview = createBackupPreview('ready');
const values = JSON.parse(readFileSync(new URL('../../contracts/system-backup/v12/admin-control-redacted-examples.json', import.meta.url))).config_update_request.config;
const kinds = ['backups', 'drills', 'preflights', 'verifications'];
const paths = { backups: 'system-backups', drills: 'system-restore-drills', preflights: 'system-backup-preflights', verifications: 'system-backup-artifact-verifications' };
const signal = () => new AbortController().signal;
const config = () => ({ schema_version: 'system-backup-config.v1', origin_installation_id: preview.overview.origin_installation_id,
  version: preview.overview.config_version, row_version: 1, active: true, effective_enabled: false,
  config: values, created_by: '42', change_reason: null, created_at: '2026-10-12T00:00:00Z' });
const json = (body, status = 200, source = 'live') => new Response(JSON.stringify(body), { status, headers: { 'X-System-Backup-Data-Source': source } });
const unavailable = () => json({ code: 'not_ready' }, 503);
const page = (items = [], next_cursor = null, consistency = 'stable_cutoff') => json({ items, next_cursor, consistency });
function harness(options = {}) {
  const calls = [];
  let configReads = 0;
  const client = createBackupApiReadClient(async (path, requestSignal) => {
    const url = new URL(path, 'https://test.invalid');
    calls.push({ path: url.pathname, cursor: url.searchParams.get('cursor'), limit: url.searchParams.get('limit') });
    if (url.pathname.endsWith('/system-backup-overview')) return options.overview?.() ?? unavailable();
    if (url.pathname.endsWith('/system-backup-config')) return options.config?.(++configReads, requestSignal) ?? json(config());
    const kind = kinds.find((key) => url.pathname.endsWith(`/${paths[key]}`));
    assert.ok(kind, `unexpected read: ${path}`);
    return options.list?.(kind, url.searchParams.get('cursor'), requestSignal) ?? page([preview[kind][0].task]);
  });
  return { calls, source: createBackupLiveSource(client) };
}

test('the current server overview 503 no longer blocks independently available real records', async () => {
  const { source, calls } = harness();
  const result = await source.read(signal());
  assert.equal(result.kind, 'records');
  assert.equal(result.data.config.kind, 'ready');
  for (const kind of kinds) assert.deepEqual(result.data[kind].value.items, [preview[kind][0].task]);
  assert.equal(result.data.origin_installation_id, config().origin_installation_id);
  assert.equal(calls.filter((item) => item.path.endsWith('/system-backup-config')).length, 2);
  assert.equal(calls.filter((item) => item.path.endsWith('/system-backup-overview')).length, 1);
  for (const field of ['overview', 'backup_recovery_readiness', 'active_task_count', 'database_health']) {
    assert.equal(Object.hasOwn(result.data, field), false, `${field} must not be fabricated`);
  }
  assert.equal(nextBackupReadDelay(result, 0), 30_000);
});

test('unavailable config or task resources stay unavailable without invented empty pages', async (t) => {
  for (const mode of ['lists-only', 'config-only']) await t.test(mode, async () => {
    const { source } = harness({ config: () => mode === 'lists-only' ? unavailable() : json(config()),
      list: (kind) => mode === 'lists-only' && kind === 'backups' ? page([preview.backups[0].task]) : unavailable() });
    const result = await source.read(signal());
    assert.equal(result.kind, 'records');
    assert.equal(result.data.config.kind, mode === 'lists-only' ? 'unavailable' : 'ready');
    assert.deepEqual(result.data.drills, { kind: 'unavailable' });
    if (mode === 'config-only') assert.deepEqual(result.data.backups, { kind: 'unavailable' });
    else assert.equal(result.data.backups.value.items.length, 1);
  });
});

test('authenticated empty lists preserve unknown installation and do not imply global health', async () => {
  const { source } = harness({ config: unavailable, list: () => page() });
  const result = await source.read(signal());
  assert.equal(result.kind, 'records');
  assert.equal(result.data.origin_installation_id, null);
  for (const kind of kinds) {
    assert.equal(result.data[kind].kind, 'ready');
    assert.deepEqual(result.data[kind].value.items, []);
  }
  assert.equal(Object.hasOwn(result.data, 'overview'), false);
});

test('no available endpoints retains the unavailable view', async () => {
  assert.deepEqual(await harness({ config: unavailable, list: unavailable }).source.read(signal()), { kind: 'unavailable' });
});

test('only the exact overview not_ready error enables records mode', async (t) => {
  for (const [status, code, expected] of [[401, 'authentication_required', 'error'], [403, 'permission_denied', 'error'],
    [500, 'internal_error', 'error'], [503, 'internal_error', 'error']]) await t.test(`${status}/${code}`, async () => {
    const { source, calls } = harness({ overview: () => json({ code }, status) });
    assert.deepEqual(await source.read(signal()), { kind: expected });
    assert.equal(calls.length, 1);
  });
  const { source, calls } = harness({ overview: () => json({}, 200, 'fixture') });
  assert.deepEqual(await source.read(signal()), { kind: 'unavailable' });
  assert.equal(calls.length, 1, 'fixture overview must not silently switch sources');
});

test('authorization, malformed DTO and fixture failures never publish partial records', async (t) => {
  for (const mode of ['401', '403', 'invalid', 'fixture']) await t.test(mode, async () => {
    const { source } = harness({ list: (kind) => {
      if (kind !== 'drills') return page([preview[kind][0].task]);
      if (mode === 'invalid') return page([{ ...preview.drills[0].task, private_payload: 'withheld' }]);
      if (mode === 'fixture') return json({}, 200, 'fixture');
      return json({ code: 'permission_denied' }, Number(mode));
    } });
    assert.deepEqual(await source.read(signal()), { kind: mode === 'fixture' ? 'unavailable' : 'error' });
  });
});

test('cross-installation records are rejected with or without an available config', async (t) => {
  for (const configReady of [true, false]) await t.test(String(configReady), async () => {
    const { source } = harness({ config: () => configReady ? json(config()) : unavailable(),
      list: (kind) => page([{ ...preview[kind][0].task,
        origin_installation_id: kind === 'drills' ? 'installation_other' : config().origin_installation_id }]) });
    assert.deepEqual(await source.read(signal()), { kind: 'error' });
  });
});

test('config identity, version, row-version, effective-state and availability cannot change across records reads', async (t) => {
  for (const mode of ['installation', 'version', 'row-version', 'effective', 'becomes-unavailable', 'becomes-available']) await t.test(mode, async () => {
    const { source } = harness({ config: (count) => {
      if (mode === 'becomes-unavailable') return count === 1 ? json(config()) : unavailable();
      if (mode === 'becomes-available') return count === 1 ? unavailable() : json(config());
      const later = { ...config(), ...(mode === 'installation' ? { origin_installation_id: 'installation_other' }
        : mode === 'version' ? { version: 4 } : mode === 'row-version' ? { row_version: 2 }
          : { effective_enabled: true, config: { ...values, enabled: true } }) };
      return json(count === 1 ? config() : later);
    } });
    assert.deepEqual(await source.read(signal()), { kind: 'error' });
  });
});

test('records pagination requests one cursor at a time with config checks and no overview dependency', async () => {
  const cursor = 'opaque +/&?=Ω';
  const { source, calls } = harness({ list: (kind, token) => kind === 'backups'
    ? page([preview.backups[token === null ? 0 : 1].task], token === null ? cursor : null) : page() });
  const first = await source.read(signal());
  const next = await source.loadMoreRecords('backups', first.data, signal());
  assert.equal(next.backups.value.items.length, 2);
  assert.equal(first.data.backups.value.items.length, 1);
  assert.deepEqual(calls.slice(-3), [
    { path: '/api/v1/admin/system-backup-config', cursor: null, limit: null },
    { path: '/api/v1/admin/system-backups', cursor, limit: '50' },
    { path: '/api/v1/admin/system-backup-config', cursor: null, limit: null },
  ]);
  const count = calls.length;
  assert.equal(await source.loadMoreRecords('backups', next, signal()), next);
  assert.equal(calls.length, count);
});

test('a first nonempty continuation establishes installation without a placeholder identity', async () => {
  const { source } = harness({ config: unavailable, list: (kind, cursor) => kind === 'backups'
    ? page(cursor === null ? [] : [preview.backups[0].task], cursor === null ? 'next' : null) : page() });
  const first = await source.read(signal());
  assert.equal(first.data.origin_installation_id, null);
  const next = await source.loadMoreRecords('backups', first.data, signal());
  assert.equal(next.origin_installation_id, preview.backups[0].task.origin_installation_id);
});

test('unsafe record continuations are rejected without mutating already displayed pages', async (t) => {
  for (const mode of ['installation', 'duplicate', 'cursor-loop', 'consistency', 'config']) await t.test(mode, async () => {
    let current = 0;
    const { source } = harness({ config: () => json({ ...config(), version: mode === 'config' && current > 0 ? 4 : config().version }),
      list: (kind, cursor) => {
        if (kind !== 'backups') return page();
        if (cursor === null) return page([preview.backups[0].task], 'next');
        current += 1;
        const item = { ...preview.backups[mode === 'duplicate' ? 0 : 1].task,
          ...(mode === 'installation' ? { origin_installation_id: 'installation_other' } : {}) };
        return page([item], mode === 'cursor-loop' ? 'next' : null, mode === 'consistency' ? 'eventual' : 'stable_cutoff');
      } });
    const first = await source.read(signal());
    await assert.rejects(source.loadMoreRecords('backups', first.data, signal()), (error) => error instanceof BackupReadError);
    assert.equal(first.data.backups.value.items.length, 1);
    assert.equal(first.data.backups.value.next_cursor, 'next');
  });
});

test('an unavailable record group cannot be paginated', async () => {
  const { source, calls } = harness({ list: unavailable });
  const first = await source.read(signal());
  const count = calls.length;
  await assert.rejects(source.loadMoreRecords('backups', first.data, signal()), (error) => error.code === 'unavailable_resource');
  assert.equal(calls.length, count);
});

test('cancellation discards initial and continued record results', async (t) => {
  for (const mode of ['initial', 'continuation']) await t.test(mode, async () => {
    const controller = new AbortController();
    const { source } = harness({ list: (kind, cursor) => {
      if (mode === 'initial' || cursor !== null) controller.abort();
      return page([preview[kind][cursor === null ? 0 : Math.min(1, preview[kind].length - 1)].task], cursor === null ? 'next' : null);
    } });
    if (mode === 'initial') await assert.rejects(source.read(controller.signal), { name: 'AbortError' });
    else {
      const first = await source.read(signal());
      await assert.rejects(source.loadMoreRecords('backups', first.data, controller.signal), { name: 'AbortError' });
      assert.equal(first.data.backups.value.items.length, 1);
    }
  });
});

test('available overview automatically restores the full existing read path', async () => {
  let ready = false;
  const { source } = harness({ overview: () => ready ? json({ ...preview.overview, effective_enabled: false }) : unavailable() });
  assert.equal((await source.read(signal())).kind, 'records');
  ready = true;
  const result = await source.read(signal());
  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.data.overview, { ...preview.overview, effective_enabled: false });
});

test('config comparison snapshots primitives before independent list callbacks', async () => {
  const resource = config();
  const source = createBackupLiveSource({ async overview() { throw new BackupReadError(503, 'not_ready'); },
    async config() { return resource; }, async list() { resource.version += 1; return { items: [], next_cursor: null, consistency: 'stable_cutoff' }; } });
  assert.deepEqual(await source.read(signal()), { kind: 'error' });
});
