import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupApiReadClient, BackupReadError } from '../src/pages/admin/backups/backupApiRead.ts';
import { readBackupLiveDetail } from '../src/pages/admin/backups/backupLiveDetail.ts';
import { createBackupPreview } from '../src/pages/admin/backups/backupPreview.ts';

const snapshot = createBackupPreview('ready');
const resources = Object.fromEntries(['backups', 'drills', 'preflights', 'verifications'].map((kind) => [kind, snapshot[kind][0]]));
const paths = { backups: 'system-backups', drills: 'system-restore-drills', preflights: 'system-backup-preflights', verifications: 'system-backup-artifact-verifications' };
const selection = (kind, detail = resources[kind]) => ({ kind, public_id: detail.task.public_id,
  origin_installation_id: detail.task.origin_installation_id, row_version: detail.task.row_version });
const signal = () => new AbortController().signal;

test('all four live details use the validated read client and preserve distinct decisions', async (t) => {
  for (const [kind, detail] of Object.entries(resources)) await t.test(kind, async () => {
    const calls = [];
    const client = createBackupApiReadClient(async (path, requestSignal) => {
      calls.push({ path, requestSignal });
      return new Response(JSON.stringify(detail));
    });
    const requestSignal = signal();
    assert.deepEqual(await readBackupLiveDetail(client, selection(kind), requestSignal), detail);
    assert.deepEqual(calls, [{ path: `/api/v1/admin/${paths[kind]}/${detail.task.public_id}`, requestSignal }]);
  });
});

test('detail reads allow a newer task row and reject an older one for every task kind', async (t) => {
  for (const [kind, detail] of Object.entries(resources)) await t.test(kind, async () => {
    const client = { async detail() { return detail; } };
    const newer = { ...detail, task: { ...detail.task, row_version: detail.task.row_version + 1 } };
    assert.equal(await readBackupLiveDetail({ async detail() { return newer; } }, selection(kind), signal()), newer);
    await assert.rejects(readBackupLiveDetail(client, { ...selection(kind), row_version: detail.task.row_version + 1 }, signal()),
      (error) => error instanceof BackupReadError && error.code === 'snapshot_changed');
  });
});

test('a well-formed detail from another installation cannot replace the selected task', async () => {
  const detail = structuredClone(resources.backups);
  detail.task.origin_installation_id = 'installation_other';
  const client = createBackupApiReadClient(async () => new Response(JSON.stringify(detail)));
  await assert.rejects(readBackupLiveDetail(client, selection('backups'), signal()),
    (error) => error instanceof BackupReadError && error.code === 'installation_changed');
  const wrongId = { async detail() { return { ...detail, task: { ...detail.task, public_id: 'another_task' } }; } };
  await assert.rejects(readBackupLiveDetail(wrongId, selection('backups'), signal()),
    (error) => error instanceof BackupReadError);
});

test('detail errors and leaked owner fields never fall back to preview data', async (t) => {
  for (const status of [401, 403, 503]) await t.test(String(status), async () => {
    const client = createBackupApiReadClient(async () => new Response(JSON.stringify({ code: 'not_ready' }), { status }));
    await assert.rejects(readBackupLiveDetail(client, selection('backups'), signal()),
      (error) => error instanceof BackupReadError && error.status === status);
  });
  for (const body of [{ ...resources.backups, raw_job_status: 'private' },
    { ...resources.backups, execution: { ...resources.backups.execution, job_uid: 'private' } }]) {
    const client = createBackupApiReadClient(async () => new Response(JSON.stringify(body)));
    await assert.rejects(readBackupLiveDetail(client, selection('backups'), signal()),
      (error) => error instanceof BackupReadError && error.code === 'invalid_response');
  }
});

test('canceled detail selection does not issue a request', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readBackupLiveDetail({ async detail() { assert.fail('canceled request issued'); } }, selection('backups'), controller.signal), { name: 'AbortError' });
});

test('late detail completion cannot publish after cancellation even when transport ignores abort', async () => {
  let finish;
  const controller = new AbortController();
  const client = { detail() { return new Promise((resolve) => { finish = resolve; }); } };
  const pending = readBackupLiveDetail(client, selection('backups'), controller.signal);
  controller.abort();
  finish(resources.backups);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(await readBackupLiveDetail({ async detail() { return resources.drills; } }, selection('drills'), signal()), resources.drills);
});

test('the requested identity is frozen before awaiting the client', async () => {
  const selected = selection('backups');
  let finish;
  const pending = readBackupLiveDetail({ detail() { return new Promise((resolve) => { finish = resolve; }); } }, selected, signal());
  selected.public_id = 'changed_after_request';
  selected.origin_installation_id = 'installation_other';
  selected.row_version += 100;
  finish(resources.backups);
  assert.equal(await pending, resources.backups);
});
