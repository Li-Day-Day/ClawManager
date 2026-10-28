import test from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke, SmokeFailure } from './system-backup-d-api-smoke.mjs';

// Every provider/SQL/executor observation below is synthetic. These tests
// validate the reusable harness, not a deployed backup or a B/C implementation.
function model(change = {}) {
  let creates = 0, polls = 0, observations = 0;
  const path = change.backup ? '/api/v1/admin/system-backups' : '/api/v1/admin/system-backup-preflights';
  const task = { schema_version: 'system-backup-task.v1', public_id: `${change.backup ? 'sbk_' : 'spf_'}11111111-2222-3333-4444-555555555555`,
    task_type: change.backup ? 'backup' : 'preflight', actor_type: 'admin', actor_id: '7', origin_installation_id: 'installation_model', endpoint: change.backup ? 'createSystemBackup' : 'createSystemBackupPreflight',
    config_version: 1, row_version: 1, status: 'pending', failure_category: 'none',
    idempotency_key: 'model-key-123456789', request_hash: 'a'.repeat(64), created_at: '2026-10-26T08:00:00Z', deadline_at: '2026-10-26T08:01:00Z' };
  const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'X-System-Backup-Data-Source': change.fixture ? 'fixture' : 'live', ...headers } });
  return {
    options: { baseURL: 'http://127.0.0.1', mode: 'model', kind: task.task_type, key: task.idempotency_key, requestJSON: '{}',
      username: 'model-admin', password: 'model-password', deniedToken: 'denied', foreignToken: 'foreign', pollMS: 1, timeoutMS: 2000,
      expectedStatus: change.failed ? 'failed' : 'succeeded', expectedFailureCategory: change.failed ? 'runner_failed' : undefined,
      fetchImpl: async (url, init) => {
        if (url.pathname === '/api/v1/auth/login') return reply({ data: { access_token: 'model-admin-token' } });
        if (url.pathname === '/api/v1/auth/me') return reply({ data: { id: 7 } });
        if (url.pathname.endsWith('/system-backup-config')) return reply({ version: 1, effective_enabled: !change.disabled });
        const auth = init.headers.Authorization;
        if (auth !== 'Bearer model-admin-token') {
          if (change.foreignAllowed) return reply({ task: { ...task, status: 'succeeded' } });
          return reply({ code: 'permission_denied' }, 403);
        }
        if (init.method === 'POST') {
          creates++;
          if (change.notReady) return reply({ code: 'not_ready' }, 503);
          return reply({ ...task, ...(creates > 1 && change.replayChanged ? { request_hash: 'b'.repeat(64) } : {}) }, 202,
            { Location: `${path}/${task.public_id}`, 'Retry-After': '1' });
        }
        if (url.pathname.endsWith('/manifest')) return change.manifestMissing ? reply({ code: 'not_ready' },503) : reply({ schema_version: 'model-manifest.v1' });
        polls++;
        const status = change.stuck || polls === 1 ? change.backup ? 'preparing' : 'running' : change.failed ? 'failed' : 'succeeded';
        return reply({ schema_version: change.backup ? 'system-backup-backup-detail.v1' : 'system-backup-preflight-detail.v1', task: { ...task, status, row_version: polls + 1, failure_category: status === 'failed' ? 'runner_failed' : 'none' },
          report_evidence: { public_id: 'sev_11111111-2222-3333-4444-555555555555', sha256: 'c'.repeat(64) }, verifier_summary: { failed: 0 }, report_validity_reason: 'valid',
          artifact_state: 'committed', artifact_usable: true, acceptance_ready: true, checksums: { manifest: 'd'.repeat(64) } });
      },
      observe: async input => {
        observations++;
        if (change.observerHangs) return new Promise(() => {});
        return { publicID: input.publicID, installationID: input.installationID, configVersion: 1,
          taskCount: 1, enqueueCount: change.doubleQueue ? 2 : 1, claimCount: change.noClaim ? 0 : 1, attemptCount: 1,
          status: change.failed ? 'failed' : 'succeeded', failureCategory: change.failed ? 'runner_failed' : 'none',
          resultPublicID: 'sev_11111111-2222-3333-4444-555555555555', resultSHA256: (change.resultDrift ? 'e' : 'c').repeat(64), manifestSHA256: 'd'.repeat(64) };
      } },
    counts: () => ({ creates, polls, observations }),
  };
}

test('model: login, config, creation/replay, negative sessions, progress and independent execution result', async () => {
  const m = model(); const result = await runSmoke(m.options);
  assert.equal(result.status, 'model_chain_passed');
  assert.deepEqual(m.counts(), { creates: 2, polls: 2, observations: 2 });
});
test('model: failed execution is inspected through HTTP 200 and persisted category', async () => {
  const m = model({ failed: true }); const result = await runSmoke(m.options);
  assert.equal(result.outcome, 'failed'); assert.equal(result.failureCategory, 'runner_failed');
});
test('model: backup reads manifest and binds independent result checksum', async () => {
  const result = await runSmoke(model({ backup: true }).options);
  assert.equal(result.kind, 'backup'); assert.equal(result.status, 'model_chain_passed');
});
for (const [label, change, stage] of [
  ['disabled config', { disabled: true }, 'effective-config'],
  ['fixture data', { fixture: true }, 'config-live-source'],
  ['unwired runtime', { notReady: true }, 'create'],
  ['replay hash drift', { replayChanged: true }, 'replay-request_hash'],
  ['duplicate durable queue', { doubleQueue: true }, 'observe-after-replay-identity-and-uniqueness'],
  ['foreign visibility', { foreignAllowed: true }, 'permission-read-rejection'],
  ['no executor claim', { noClaim: true }, 'observe-execution-terminal'],
  ['result reference drift', { resultDrift: true }, 'observe-result-binding'],
  ['unwired backup manifest', { backup: true, manifestMissing: true }, 'manifest'],
]) test(`model refuses ${label}`, async () => {
  const m = model(change);
  await assert.rejects(runSmoke(m.options), error => error instanceof SmokeFailure && error.stage === stage);
});
test('model refuses endless pending and hanging observer with bounded waits', async () => {
  for (const change of [{ stuck: true }, { observerHangs: true }]) {
    const m = model(change);
    await assert.rejects(runSmoke({ ...m.options, timeoutMS: 100, requestTimeoutMS: 50 }), error => error instanceof SmokeFailure && error.code === 'deadline_exceeded');
  }
});
test('missing SQL/executor observer and unsupported public HTTP origin fail before any mutation', async () => {
  const m = model();
  await assert.rejects(runSmoke({ ...m.options, observe: undefined }), /inputs/);
  await assert.rejects(runSmoke({ ...m.options, baseURL: 'http://remote.example' }), /base-url/);
  assert.equal(m.counts().creates, 0);
});
