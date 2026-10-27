import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupApiReadClient } from '../src/pages/admin/backups/backupApiRead.ts';
import { labPath, labDownload, labInstallation } from '../src/pages/admin/backups/verificationLab.ts';

test('lab read adapter allows only verification lists and exact detail IDs', () => {
  const root = '/api/v1/admin/system-backup-artifact-verifications';
  assert.equal(labPath(root), '/verification-lab/tasks');
  assert.equal(labPath(root + '/sav_00000000-0000-4000-8000-000000000001'), '/verification-lab/tasks/sav_00000000-0000-4000-8000-000000000001');
  for (const path of ['/api/v1/auth/login', root + '/../../auth', root + '?cursor=x', root + '/fake', root + '/sav_00000000-0000-4000-8000-000000000001/logs']) assert.throws(() => labPath(path));
});

test('lab report download refuses business credentials and installation mismatch', async () => {
  const download = labDownload('a'.repeat(64));
  await assert.rejects(download({ evidenceId: 'unused', installation: 'installation_other' }, new AbortController().signal));
  await assert.rejects(download({ evidenceId: 'unused', installation: labInstallation, credentials: { password: 'never-send', code: '123456' } }, new AbortController().signal));
});

test('live lab: real A success, mismatch, missing proof, shared read contracts, download and reset', { skip: !process.env.VERIFICATION_LAB_URL }, async () => {
  const origin = process.env.VERIFICATION_LAB_URL;
  assert.equal(origin, 'http://127.0.0.1:19031');
  const realFetch = globalThis.fetch;
  // Browser-relative lab fetches in the reusable download adapter.
  globalThis.fetch = (path, init) => realFetch(new URL(path, origin), init);
  const signal = new AbortController().signal;
  const request = async (path, body) => {
    const response = await realFetch(origin + '/verification-lab' + path, body === undefined ? {} : {
      method: 'POST', headers: { Origin: 'http://127.0.0.1:19032', 'Content-Type': 'application/json', 'X-Verification-Lab': '1' }, body: JSON.stringify(body),
    });
    assert.ok(response.ok, `${path}: ${response.status}`);
    return response.json();
  };
  const client = createBackupApiReadClient((path, signal) => realFetch(origin + labPath(path), { signal }));
  try {
    await request('/reset', {});
    for (const scenario of ['match', 'mismatch', 'missing-proof']) {
      const prepared = await request('/prepare', { scenario });
      const accepted = await request('/execute', { id: prepared.id });
      let detail;
      for (let attempt = 0; attempt < 100; attempt++) {
        detail = await client.detail('verifications', accepted.task.public_id, signal);
        if (detail.task.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(detail.task.status, scenario === 'match' ? 'succeeded' : 'failed');
      const page = await client.list('verifications', signal);
      assert.equal(page.items[0].public_id, detail.task.public_id);
      const checks = await request('/tasks/' + detail.task.public_id + '/checks');
      assert.equal(checks.length, scenario === 'missing-proof' ? 0 : 20);
      assert.equal(checks.filter(item => item.status === 'failed').length, scenario === 'mismatch' ? 1 : 0);
      const ref = detail.verifier_summary.report_evidence;
      const file = await labDownload(ref.sha256)({ evidenceId: ref.public_id, installation: labInstallation }, signal);
      const report = JSON.parse(await file.blob.text());
      assert.equal(report.task_public_id, detail.task.public_id);
      assert.deepEqual(report.checks, checks);
      assert.equal(report.verifier, 'systembackupbusinessa.VerifyBackupSnapshot');
      assert.equal(report.data_source, 'synthetic-input-real-A-verifier');
      assert.equal(report.failure_category, scenario === 'missing-proof' ? 'evidence_incomplete' : scenario === 'mismatch' ? 'validation_failed' : 'none');
      await assert.rejects(labDownload('0'.repeat(64))({ evidenceId: ref.public_id, installation: labInstallation }, signal));
      assert.equal(detail.usable_after, false);
      await request('/reset', {});
      assert.equal((await client.list('verifications', signal)).items.length, 0);
      assert.equal((await realFetch(origin + '/verification-lab/reports/' + ref.public_id)).status, 404);
    }
  } finally { globalThis.fetch = realFetch; await request('/reset', {}); }
});
