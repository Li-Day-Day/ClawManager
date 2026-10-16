import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupApiReadClient, BackupReadError } from '../src/pages/admin/backups/backupApiRead.ts';
import { readBackupLiveEvents } from '../src/pages/admin/backups/backupLiveEvents.ts';
import { createBackupPreview } from '../src/pages/admin/backups/backupPreview.ts';

const snapshot = createBackupPreview('ready');
const signal = () => new AbortController().signal;
const isError = (code) => (error) => error instanceof BackupReadError && error.code === code;
function fixture(kind = 'backups') {
  const task = snapshot[kind][0].task;
  return {
    selection: { kind, public_id: task.public_id, origin_installation_id: task.origin_installation_id, row_version: task.row_version },
    event: { ...snapshot.events[0], target_type: task.task_type, target_public_id: task.public_id },
    headers: { 'X-System-Backup-Data-Source': 'live', 'X-System-Backup-Origin-Installation-ID': task.origin_installation_id,
      'X-System-Backup-Task-Row-Version': String(task.row_version) },
  };
}
function response(event, headers, cursor = null) {
  return new Response(JSON.stringify({ items: [event], next_cursor: cursor, consistency: 'stable_cutoff' }), { headers });
}

test('events for all four kinds paginate without requiring full task detail', async (t) => {
  for (const kind of ['backups', 'drills', 'preflights', 'verifications']) await t.test(kind, async () => {
    const { selection, event, headers } = fixture(kind);
    const paths = [];
    const client = createBackupApiReadClient(async (path) => {
      assert.match(path, /\/events\?/);
      paths.push(path);
      return response(event, headers, paths.length === 1 ? 'opaque +/&=' : null);
    });
    const first = await readBackupLiveEvents(client, selection, signal());
    const last = await readBackupLiveEvents(client, selection, signal(), first);
    assert.deepEqual(last.items, [event, event]);
    assert.equal(first.items.length, 1);
    assert.equal(last.next_cursor, null);
    assert.equal(new URL(paths[1], 'https://test.invalid').searchParams.get('cursor'), 'opaque +/&=');
    assert.equal(await readBackupLiveEvents(client, selection, signal(), last), last);
    assert.equal(paths.length, 2);
  });
});

test('event context rejects missing, foreign and regressing transport identities', async (t) => {
  const { selection, event, headers } = fixture();
  for (const [name, changes, code] of [
    ['source missing', { 'X-System-Backup-Data-Source': '' }, 'invalid_response'],
    ['fixture', { 'X-System-Backup-Data-Source': 'fixture' }, 'fixture_source'],
    ['installation missing', { 'X-System-Backup-Origin-Installation-ID': '' }, 'installation_changed'],
    ['foreign installation', { 'X-System-Backup-Origin-Installation-ID': 'installation_other' }, 'installation_changed'],
    ...['', '0', '01', '-1', '1.5', '9007199254740992', String(selection.row_version - 1)].map((v) =>
      [`version ${v}`, { 'X-System-Backup-Task-Row-Version': v }, 'snapshot_changed']),
  ]) await t.test(name, async () => {
    const client = createBackupApiReadClient(async () => response(event, { ...headers, ...changes }));
    await assert.rejects(readBackupLiveEvents(client, selection, signal()), isError(code));
  });
});

test('permission and unavailable responses retain their errors without context headers', async (t) => {
  for (const [status, code] of [[401, 'authentication_required'], [403, 'permission_denied'], [503, 'not_ready']]) await t.test(code, async () => {
    const client = createBackupApiReadClient(async () => new Response(JSON.stringify({ code }), { status }));
    await assert.rejects(readBackupLiveEvents(client, fixture().selection, signal()), isError(code));
  });
});

test('continuation scope, cursor loops and consistency changes reject before publication', async (t) => {
  const { selection, event, headers } = fixture();
  const client = createBackupApiReadClient(async () => response(event, headers, 'next'));
  const first = await readBackupLiveEvents(client, selection, signal());
  await assert.rejects(readBackupLiveEvents(client, selection, signal(), first), isError('cursor_loop'));
  const changed = createBackupApiReadClient(async () => new Response(JSON.stringify({ items: [event], next_cursor: null, consistency: 'eventual' }), { headers }));
  await assert.rejects(readBackupLiveEvents(changed, selection, signal(), first), isError('consistency_changed'));
  for (const key of ['kind', 'public_id', 'origin_installation_id', 'row_version']) await t.test(key, async () => {
    const next = { ...selection, [key]: key === 'row_version' ? selection.row_version + 1 : 'changed' };
    await assert.rejects(readBackupLiveEvents({ activity() { assert.fail('invalid continuation fetched'); } }, next, signal(), first), isError('invalid_activity_continuation'));
  });
  assert.equal(first.items.length, 1);
});

test('event selection is frozen before await and late cancellation cannot publish', async () => {
  const { selection, event } = fixture();
  const original = { ...selection };
  const controller = new AbortController();
  const client = { async activity(kind, id, channel, _signal, options) {
    assert.equal(kind, original.kind); assert.equal(id, original.public_id); assert.equal(channel, 'events');
    assert.deepEqual(options.context, { origin_installation_id: original.origin_installation_id, minimum_row_version: original.row_version });
    selection.public_id = 'changed'; controller.abort();
    return { items: [event], next_cursor: null, consistency: 'stable_cutoff' };
  } };
  await assert.rejects(readBackupLiveEvents(client, selection, controller.signal), { name: 'AbortError' });
});
