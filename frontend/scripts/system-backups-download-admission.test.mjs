import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBackupApiReadClient, BackupReadError } from '../src/pages/admin/backups/backupApiRead.ts';
import { readBackupOperation, readBackupOperations } from '../src/pages/admin/backups/backupLiveOperations.ts';

const vector = JSON.parse(readFileSync(new URL('../../contracts/system-backup/v12/download-admission-public-vector.json', import.meta.url))).operation;
const signal = () => new AbortController().signal;
const clientFor = (value, calls = []) => createBackupApiReadClient(async path => {
  calls.push(path);
  const body = path.includes(`/${vector.public_id}`) ? value : { items: [value], next_cursor: null, consistency: 'stable_cutoff' };
  return new Response(JSON.stringify(body), { headers: { 'X-System-Backup-Data-Source': 'live' } });
});
test('public admission list and detail accept the producer vector without issuing a download', async () => {
  const calls = [];
  const client = clientFor(vector, calls);
  const page = await readBackupOperations(client, null, signal());
  assert.deepEqual(page.items, [vector]);
  assert.deepEqual(await readBackupOperation(client, page.items[0], signal()), vector);
  assert.ok(calls.every(path => path.startsWith('/api/v1/admin/system-backup-operations')));
  assert.equal(calls.length, 2);
  // Its original one-microsecond deadline is earlier than wall-clock now.
  // A read-only historical record remains visible; it is not a credential.
  assert.equal(vector.http_status, 200);
});
for (const [name, change] of [
  ['wrong type for evidence', { operation_type: 'cleanup' }],
  ['wrong target', { target_type: 'backup', target_public_id: 'sbk_00000000-0000-4000-8000-000000000002' }],
  ['wrong evidence ID', { target_public_id: 'sev_bad' }], ['wrong endpoint', { endpoint: 'updateSystemBackupConfig' }],
  ['system actor', { actor_type: 'system', actor_id: 'system:controller' }], ['zero actor', { actor_id: '0' }],
  ['actor alias', { actor_id: '042' }], ['actor overflow', { actor_id: '2147483648' }],
  ['pending', { status: 'pending', started_at: null, finished_at: null, http_status: null }],
  ['running', { status: 'running', finished_at: null, http_status: null }],
  ['failed', { status: 'failed', failure_category: 'internal_error', http_status: 500 }],
  ['partial transport status', { http_status: 206 }], ['missing status', { http_status: null }], ['retryable', { retryable: true }],
  ['failure', { failure_category: 'internal_error' }], ['failure text', { failure_message: 'PRIVATE message' }],
  ['resource result', { result_resource_public_id: vector.target_public_id }], ['config result', { result_config_version: 2 }],
  ['missing start', { started_at: null }], ['missing finish', { finished_at: null }],
  ['sub-microsecond finish replacement', { finished_at: '2026-10-19T02:00:00.000001001Z' }],
  ['sub-microsecond update replacement', { updated_at: '2026-10-19T02:00:00.000001001Z' }],
  ['equal deadline', { deadline_at: vector.created_at }], ['earlier deadline', { deadline_at: '2026-10-19T02:00:00Z' }],
  ['invalid calendar', { created_at: '2026-02-30T02:00:00Z' }],
  ['private receipt', { admission_receipt: { claim_digest: 'a'.repeat(64) } }], ['raw claim', { claim_owner: 'PRIVATE claim' }],
]) test(`public admission rejects ${name} in list and detail`, async () => {
  const client = clientFor({ ...vector, ...change });
  const invalid = error => error instanceof BackupReadError && error.code === 'invalid_response';
  await assert.rejects(client.operations(signal()), invalid);
  await assert.rejects(client.operation(vector.public_id, signal()), invalid);
});
