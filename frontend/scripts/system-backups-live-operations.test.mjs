import assert from 'node:assert/strict';
import test from 'node:test';
import { readBackupOperation, readBackupOperations } from '../src/pages/admin/backups/backupLiveOperations.ts';
import { BackupReadError, createBackupApiReadClient } from '../src/pages/admin/backups/backupApiRead.ts';

const signal = () => new AbortController().signal;
const operation = (id = 1) => ({
  schema_version: 'system-backup-operation.v1', public_id: `sop_00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  origin_installation_id: 'installation_test', operation_type: 'config_update', target_type: 'system', target_public_id: 'installation_test',
  actor_type: 'admin', actor_id: '42', endpoint: 'config_update', idempotency_key: 'operation-test-key-123', request_hash: 'a'.repeat(64),
  status: 'succeeded', result_resource_public_id: null, result_config_version: 2, retryable: false, failure_category: 'none',
  failure_message: null, http_status: 200, row_version: 3, deadline_at: '2026-10-16T02:05:00Z',
  started_at: '2026-10-16T02:00:00Z', finished_at: '2026-10-16T02:00:01Z', created_at: '2026-10-16T02:00:00Z', updated_at: '2026-10-16T02:00:01Z',
});
const response = (items, cursor = null, consistency = 'stable_cutoff') => ({ items, next_cursor: cursor, consistency });
const baseline = () => ({ ...response([operation()], 'next +/&?'), origin_installation_id: 'installation_test', requested_cursors: ['next +/&?'], limit: 50 });
const rejects = (code) => (error) => error instanceof BackupReadError && error.code === code;

test('operations use actual read-client endpoints independently of overview/config and preserve cursor encoding', async () => {
  const calls = [];
  const client = createBackupApiReadClient(async (path) => {
    const url = new URL(path, 'https://test.invalid'); calls.push(url);
    assert.match(url.pathname, /\/system-backup-operations(?:\/sop_.*)?$/);
    const body = url.pathname.endsWith(operation().public_id) ? operation() : response([operation(2)]);
    return new Response(JSON.stringify(body), { headers: { 'X-System-Backup-Data-Source': 'live' } });
  });
  const first = await readBackupOperations(client, null, signal());
  assert.equal(first.origin_installation_id, 'installation_test');
  const next = await readBackupOperations(client, 'installation_test', signal(), baseline());
  assert.deepEqual(next.items.map((item) => item.public_id), [operation().public_id, operation(2).public_id]);
  assert.equal(calls[1].searchParams.get('cursor'), baseline().next_cursor);
  assert.equal(calls[1].searchParams.get('limit'), '50');
  assert.equal((await readBackupOperation(client, operation(), signal())).row_version, 3);
});

test('empty operations do not infer installation or health and terminal page makes no request', async () => {
  const empty = await readBackupOperations({ operations: async () => response([]) }, null, signal());
  assert.equal(empty.origin_installation_id, null);
  assert.equal(Object.hasOwn(empty, 'overview'), false);
  assert.equal(await readBackupOperations({ operations: () => assert.fail('unexpected read') }, null, signal(), empty), empty);
});

for (const [name, page, code] of [
  ['duplicate across pages', response([operation()]), 'duplicate_resource'],
  ['duplicate within page', response([operation(2), operation(2)]), 'duplicate_resource'],
  ['foreign installation', response([{ ...operation(2), origin_installation_id: 'installation_other' }]), 'installation_changed'],
  ['cursor loop', response([operation(2)], baseline().next_cursor), 'cursor_loop'],
  ['consistency drift', response([operation(2)], null, 'eventual'), 'consistency_changed'],
]) test(`rejects ${name} without a partial result`, async () => {
  await assert.rejects(readBackupOperations({ operations: async () => page }, 'installation_test', signal(), baseline()), rejects(code));
});

for (const [name, changed] of [
  ['wrong ID', { public_id: operation(2).public_id }], ['foreign installation', { origin_installation_id: 'installation_other' }],
  ['stale row version', { row_version: 2 }],
]) test(`detail rejects ${name}`, async () => {
  await assert.rejects(readBackupOperation({ operation: async () => ({ ...operation(), ...changed }) }, operation(), signal()), rejects('snapshot_changed'));
});

test('a changed parent installation rejects even a completed old page', async () => {
  await assert.rejects(readBackupOperations({ operations: () => assert.fail('unexpected read') }, 'installation_other', signal(),
    { ...baseline(), next_cursor: null }), rejects('installation_changed'));
});

test('permissions, missing adapters and network errors propagate instead of becoming empty records', async () => {
  for (const error of [new BackupReadError(403, 'permission_denied'), new BackupReadError(503, 'not_ready'), new Error('offline')]) {
    await assert.rejects(readBackupOperations({ operations: async () => { throw error; } }, null, signal()), (actual) => actual === error);
  }
});

test('cancellation rejects late page and detail responses', async () => {
  for (const kind of ['page', 'detail']) {
    const controller = new AbortController();
    const late = async () => { controller.abort(); return kind === 'page' ? response([operation()]) : operation(); };
    await assert.rejects(kind === 'page'
      ? readBackupOperations({ operations: late }, null, controller.signal)
      : readBackupOperation({ operation: late }, operation(), controller.signal), { name: 'AbortError' });
  }
});

test('identity and cursor baselines are fixed before awaiting an uncooperative reader', async () => {
  const selected = operation();
  await assert.rejects(readBackupOperation({ operation: async () => {
    selected.row_version = 1;
    return { ...operation(), row_version: 2 };
  } }, selected, signal()), rejects('snapshot_changed'));
  const previous = baseline();
  await assert.rejects(readBackupOperations({ operations: async () => {
    previous.requested_cursors.length = 0;
    previous.consistency = 'eventual';
    return response([operation(2)], 'next +/&?');
  } }, null, signal(), previous), rejects('cursor_loop'));
});
