import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupApiReadClient, BackupReadError } from '../src/pages/admin/backups/backupApiRead.ts';
import { backupActivityExpired, readBackupLiveActivity } from '../src/pages/admin/backups/backupLiveActivity.ts';
import { createBackupPreview } from '../src/pages/admin/backups/backupPreview.ts';

const snapshot = createBackupPreview('ready');
const kinds = ['backups', 'drills', 'preflights', 'verifications'];
const signal = () => new AbortController().signal;
function fixture(kind, channel) {
  const detail = snapshot[kind][0];
  const selection = { kind, public_id: detail.task.public_id, origin_installation_id: detail.task.origin_installation_id, row_version: detail.task.row_version };
  const item = channel === 'events'
    ? { ...snapshot.events[0], target_type: detail.task.task_type, target_public_id: detail.task.public_id }
    : { ...snapshot.logs[0], task_type: detail.task.task_type, task_public_id: detail.task.public_id,
      phase: { backups: 'capture', drills: 'restore', preflights: 'preflight', verifications: 'verify' }[kind] };
  return { detail, selection, item };
}
const readError = (code) => (error) => error instanceof BackupReadError && error.code === code;

test('all four task activity channels fetch only requested pages with task checks on both sides', async (t) => {
  for (const kind of kinds) for (const channel of ['events', 'logs']) await t.test(`${kind}/${channel}`, async () => {
    const { detail, selection, item } = fixture(kind, channel);
    const calls = [];
    const cursor = 'opaque +/&?=Ω';
    const client = createBackupApiReadClient(async (path) => {
      const url = new URL(path, 'https://test.invalid');
      const activity = url.pathname.endsWith(`/${channel}`);
      calls.push(activity ? { channel, limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor') } : 'detail');
      return new Response(JSON.stringify(activity ? {
        items: [item], next_cursor: url.searchParams.has('cursor') ? null : cursor, consistency: 'stable_cutoff',
      } : detail));
    });
    const first = await readBackupLiveActivity(client, selection, channel, signal());
    assert.equal(first.items.length, 1);
    assert.deepEqual(calls, ['detail', { channel, limit: '50', cursor: null }, 'detail']);
    const next = await readBackupLiveActivity(client, selection, channel, signal(), first);
    assert.deepEqual(next.items, [item, item], 'identical diagnostic items must not be silently deduplicated');
    assert.equal(next.next_cursor, null);
    assert.deepEqual(calls.slice(3), ['detail', { channel, limit: '50', cursor }, 'detail']);
    assert.equal(first.items.length, 1, 'continuation must not mutate the displayed page');
    assert.equal(await readBackupLiveActivity(client, selection, channel, signal(), next), next);
    assert.equal(calls.length, 6, 'end of collection issues no further requests');
  });
});

test('activity continuations cannot move across a task, installation, kind, version or channel', async (t) => {
  const { detail, selection, item } = fixture('backups', 'events');
  const client = { async detail() { return detail; }, async activity() { return { items: [item], next_cursor: 'next', consistency: 'stable_cutoff' }; } };
  const current = await readBackupLiveActivity(client, selection, 'events', signal());
  for (const [name, selected, channel] of [
    ['task', { ...selection, public_id: 'another_task' }, 'events'],
    ['installation', { ...selection, origin_installation_id: 'installation_other' }, 'events'],
    ['kind', { ...selection, kind: 'drills' }, 'events'],
    ['version', { ...selection, row_version: selection.row_version + 1 }, 'events'],
    ['channel', selection, 'logs'],
  ]) await t.test(name, async () => {
    const unreachable = { async detail() { assert.fail('invalid continuation fetched detail'); }, async activity() { assert.fail('invalid continuation fetched activity'); } };
    await assert.rejects(readBackupLiveActivity(unreachable, selected, channel, signal(), current), readError('invalid_activity_continuation'));
  });
});

test('cursor loops and consistency changes reject the whole new page', async (t) => {
  for (const reason of ['cursor_loop', 'consistency_changed']) await t.test(reason, async () => {
    const { detail, selection, item } = fixture('backups', 'events');
    let pageNumber = 0;
    const client = { async detail() { return detail; }, async activity() {
      pageNumber += 1;
      return { items: [item], next_cursor: pageNumber === 1 || reason === 'cursor_loop' ? 'next' : null,
        consistency: pageNumber === 2 && reason === 'consistency_changed' ? 'eventual' : 'stable_cutoff' };
    } };
    const current = await readBackupLiveActivity(client, selection, 'events', signal());
    await assert.rejects(readBackupLiveActivity(client, selection, 'events', signal(), current), readError(reason));
    assert.equal(current.items.length, 1);
  });
});

test('a task moving installations or regressing its row version during the page prevents publication', async (t) => {
  for (const reason of ['installation_changed', 'snapshot_changed']) await t.test(reason, async () => {
    const { detail, selection, item } = fixture('backups', 'events');
    let reads = 0;
    const client = { async detail() {
      reads += 1;
      return reads === 1 ? detail : { ...detail, task: { ...detail.task,
        ...(reason === 'installation_changed' ? { origin_installation_id: 'installation_other' } : { row_version: selection.row_version - 1 }),
      } };
    }, async activity() { return { items: [item], next_cursor: null, consistency: 'stable_cutoff' }; } };
    await assert.rejects(readBackupLiveActivity(client, selection, 'events', signal()), readError(reason));
    assert.equal(reads, 2);
  });
});

test('a mismatched task before the page cannot fetch its activity', async () => {
  const { detail, selection } = fixture('backups', 'events');
  await assert.rejects(readBackupLiveActivity({ async detail() {
    return { ...detail, task: { ...detail.task, origin_installation_id: 'installation_other' } };
  }, async activity() { assert.fail('wrong installation read activity'); } }, selection, 'events', signal()), readError('installation_changed'));
});

test('cancellation at any stage rejects late results even for an uncooperative client', async (t) => {
  for (const stage of [0, 1, 2, 3]) await t.test(String(stage), async () => {
    const { detail, selection, item } = fixture('backups', 'events');
    const controller = new AbortController();
    let step = 0;
    const tick = () => { step += 1; if (step === stage) controller.abort(); };
    const client = { async detail() { tick(); return detail; }, async activity() {
      tick(); return { items: [item], next_cursor: null, consistency: 'stable_cutoff' };
    } };
    if (stage === 0) controller.abort();
    await assert.rejects(readBackupLiveActivity(client, selection, 'events', controller.signal), { name: 'AbortError' });
    assert.equal(step, stage);
  });
});

test('permission, readiness and expiry errors never become empty or complete activity pages', async (t) => {
  for (const [status, code] of [[401, 'authentication_required'], [403, 'permission_denied'], [503, 'not_ready'], [410, 'logs_expired']]) await t.test(String(status), async () => {
    const { detail, selection } = fixture('backups', 'logs');
    const client = createBackupApiReadClient(async (path) => path.includes('/logs?')
      ? new Response(JSON.stringify({ code }), { status }) : new Response(JSON.stringify(detail)));
    await assert.rejects(readBackupLiveActivity(client, selection, 'logs', signal()),
      (error) => error instanceof BackupReadError && error.status === status && error.code === code);
  });
});

test('expiry presentation is limited to the logs code and never masks authentication errors', () => {
  assert.equal(backupActivityExpired('logs', new BackupReadError(410, 'logs_expired')), true);
  for (const [channel, status, code] of [['events', 410, 'logs_expired'], ['logs', 401, 'logs_expired'],
    ['logs', 403, 'logs_expired'], ['logs', 500, 'logs_expired'], ['logs', 410, 'not_found']]) {
    assert.equal(backupActivityExpired(channel, new BackupReadError(status, code)), false);
  }
  assert.equal(backupActivityExpired('logs', new Error('logs_expired')), false);
});

test('a later page failure or final permission failure cannot publish a successful collection', async (t) => {
  for (const mode of ['later-page', 'final-permission']) await t.test(mode, async () => {
    const { detail, selection, item } = fixture('backups', 'events');
    let detailReads = 0;
    let activityReads = 0;
    const client = createBackupApiReadClient(async (path) => {
      if (path.includes('/events?')) {
        activityReads += 1;
        if (activityReads === 2) return new Response(JSON.stringify({ code: 'not_ready' }), { status: 503 });
        return new Response(JSON.stringify({ items: [item], next_cursor: 'next', consistency: 'stable_cutoff' }));
      }
      detailReads += 1;
      return mode === 'final-permission' && detailReads === 2
        ? new Response(JSON.stringify({ code: 'permission_denied' }), { status: 403 })
        : new Response(JSON.stringify(detail));
    });
    if (mode === 'final-permission') {
      await assert.rejects(readBackupLiveActivity(client, selection, 'events', signal()), readError('permission_denied'));
    } else {
      const current = await readBackupLiveActivity(client, selection, 'events', signal());
      await assert.rejects(readBackupLiveActivity(client, selection, 'events', signal(), current), readError('not_ready'));
      assert.deepEqual(current.items, [item]);
      assert.equal(current.next_cursor, 'next');
    }
  });
});

test('activity retains the existing closed DTO and target validation', async (t) => {
  for (const channel of ['events', 'logs']) await t.test(channel, async () => {
    const { detail, selection, item } = fixture('backups', channel);
    for (const altered of [{ ...item, private_owner_payload: 'withheld' },
      channel === 'events' ? { ...item, target_public_id: snapshot.drills[0].task.public_id }
        : { ...item, task_public_id: snapshot.drills[0].task.public_id }]) {
      const client = createBackupApiReadClient(async (path) => new Response(JSON.stringify(path.includes(`/${channel}?`)
        ? { items: [altered], next_cursor: null, consistency: 'stable_cutoff' } : detail)));
      await assert.rejects(readBackupLiveActivity(client, selection, channel, signal()), readError('invalid_response'));
    }
  });
});

test('selection identity is fixed before a page awaits its first task read', async () => {
  const { detail, selection, item } = fixture('backups', 'events');
  const client = { async detail() { selection.public_id = 'changed'; return detail; }, async activity(_kind, id) {
    assert.equal(id, detail.task.public_id);
    return { items: [item], next_cursor: null, consistency: 'stable_cutoff' };
  } };
  const result = await readBackupLiveActivity(client, selection, 'events', signal());
  assert.equal(result.selection.public_id, detail.task.public_id);
});
