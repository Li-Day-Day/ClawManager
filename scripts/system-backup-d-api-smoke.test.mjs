import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runSmoke, SmokeFailure } from './system-backup-d-api-smoke.mjs';
import { runRounds } from './system-backup-d-two-round-smoke.mjs';

// Every provider/SQL/executor observation below is synthetic. These tests
// validate the reusable harness, not a deployed backup or a B/C implementation.
function model(change = {}) {
	const manifest={schema_version:'model-manifest.v1'};
	const manifestSHA=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  let creates = 0, polls = 0, observations = 0;
  const path = change.backup ? '/api/v1/admin/system-backups' : '/api/v1/admin/system-backup-preflights';
  const task = { schema_version: 'system-backup-task.v1', public_id: `${change.backup ? 'sbk_' : 'spf_'}${change.taskUUID || '11111111-2222-3333-4444-555555555555'}`,
    task_type: change.backup ? 'backup' : 'preflight', actor_type: 'admin', actor_id: '7', origin_installation_id: 'installation_model', endpoint: change.backup ? 'createSystemBackup' : 'createSystemBackupPreflight',
    config_version: 1, row_version: 1, status: 'pending', failure_category: 'none',
    idempotency_key: change.key || 'model-key-123456789', request_hash: 'a'.repeat(64), created_at: '2026-10-26T08:00:00Z', deadline_at: '2026-10-26T08:01:00Z' };
  const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'X-System-Backup-Data-Source': change.fixture ? 'fixture' : 'live', ...headers } });
  return {
    options: { baseURL: 'http://127.0.0.1', mode: 'model', kind: task.task_type, key: task.idempotency_key, requestJSON: '{}',
      username: 'model-admin', password: 'model-password', deniedToken: 'denied', foreignToken: 'foreign', pollMS: 1, timeoutMS: 2000,
      installationID: 'installation_model', foreignInstallationID: 'installation_foreign', foreignBaseURL: 'http://127.0.0.1:8081',
      expectedStatus: change.failed ? 'failed' : 'succeeded', expectedFailureCategory: change.failed ? 'runner_failed' : undefined,
      fetchImpl: async (url, init) => {
        if (url.pathname === '/api/v1/auth/login') return reply({ data: { access_token: 'model-admin-token' } });
        if (url.pathname === '/api/v1/auth/me') {
          if (change.invalidNegative && init.headers.Authorization === 'Bearer denied') return reply({ code: 'authentication_required' }, 401);
          if (change.invalidForeign && url.port === '8081') return reply({ code: 'authentication_required' }, 401);
          return reply({ data: { id: 7 } });
        }
        if (url.pathname.endsWith('/system-backup-config')) return reply({ version: 1, effective_enabled: !change.disabled,
          origin_installation_id: url.port === '8081' ? (change.foreignWrongPin ? 'installation_wrong' : 'installation_foreign') : (change.targetWrongPin ? 'installation_wrong' : 'installation_model') });
        const auth = init.headers.Authorization;
        if (auth !== 'Bearer model-admin-token') {
          if (change.foreignAllowed) return reply({ task: { ...task, status: 'succeeded' } });
          if (change.sessionExpires && auth === 'Bearer denied') return reply({ code: 'authentication_required' }, 403);
          return reply({ code: 'permission_denied' }, 403);
        }
        if (init.method === 'POST') {
          creates++;
          if (change.notReady) return reply({ code: 'not_ready' }, 503);
          return reply({ ...task, ...(creates > 1 && change.replayChanged ? { request_hash: 'b'.repeat(64) } : {}) }, 202,
            { Location: `${path}/${task.public_id}`, 'Retry-After': '1' });
        }
        if (url.pathname.endsWith('/manifest')) return change.manifestMissing ? reply({ code: 'not_ready' },503) : reply(change.manifestDrift?{...manifest,extra:true}:manifest,200,{'X-System-Backup-Manifest-SHA256':manifestSHA});
        polls++;
        const status = change.stuck || polls === 1 ? change.backup ? 'preparing' : 'running' : change.failed ? 'failed' : 'succeeded';
        return reply({ schema_version: change.backup ? 'system-backup-backup-detail.v1' : 'system-backup-preflight-detail.v1', task: { ...task, status, row_version: polls + 1, failure_category: status === 'failed' ? 'runner_failed' : 'none' },
          report_evidence: { public_id: 'sev_11111111-2222-3333-4444-555555555555', sha256: 'c'.repeat(64) }, verifier_summary: { failed: 0 }, report_validity_reason: 'valid',
          artifact_state: 'committed', artifact_usable: true, acceptance_ready: true, checksums: { manifest: manifestSHA } });
      },
      observe: async input => {
        observations++;
        assert.equal(input.actorID, '7');
        assert.equal(input.keySHA256, createHash('sha256').update(task.idempotency_key).digest('hex'));
        if (change.observerHangs) return new Promise(() => {});
        return { publicID: input.publicID, installationID: input.installationID, configVersion: 1, tupleBound: !change.badTuple,
          taskCount: 1, installationKeyCount: change.otherActorTask && observations > 1 ? 2 : 1, enqueueCount: change.doubleQueue ? 2 : 1, claimCount: change.noClaim ? 0 : 1, attemptCount: 1,
          jobCount: change.noJob ? 0 : change.partialRelay ? 2 : 1, relayObservationCount: change.noRelay ? 0 : 1,
          latestCaptureJobCount: change.partialRelay ? 2 : 1, latestCaptureCompletedRelayCount: change.onlyOldJobs ? 0 : 1,
          status: change.failed ? 'failed' : 'succeeded', failureCategory: change.failed ? 'runner_failed' : 'none',
          resultPublicID: 'sev_11111111-2222-3333-4444-555555555555', resultSHA256: (change.resultDrift ? 'e' : 'c').repeat(64), manifestSHA256: manifestSHA };
      } },
    counts: () => ({ creates, polls, observations }),
  };
}

test('model: login, config, creation/replay, negative sessions, progress and independent execution result', async () => {
  const m = model(); const result = await runSmoke(m.options);
  assert.equal(result.status, 'model_chain_passed');
  assert.equal(result.publicID, 'spf_11111111-2222-3333-4444-555555555555');
  assert.equal(result.installationID, 'installation_model');
  assert.equal(result.configVersion, 1);
  assert.equal(result.claimCount, 1);
  assert.equal(result.attemptCount, 1);
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
  ['fixture data', { fixture: true }, 'foreign-config-live-source'],
  ['unwired runtime', { notReady: true }, 'create'],
  ['replay hash drift', { replayChanged: true }, 'replay-request_hash'],
  ['duplicate durable queue', { doubleQueue: true }, 'observe-after-replay-identity-and-uniqueness'],
  ['SQL tuple mismatch', { badTuple: true }, 'observe-after-replay-identity-and-uniqueness'],
  ['rejected actor created another task with the same key', { otherActorTask: true }, 'observe-terminal-identity-and-uniqueness'],
  ['foreign visibility', { foreignAllowed: true }, 'permission-read-rejection'],
  ['expired permission session', { sessionExpires: true }, 'permission-read-rejection'],
  ['no executor claim', { noClaim: true }, 'observe-execution-terminal'],
  ['successful backup without job', { backup: true, noJob: true }, 'observe-job-relay'],
  ['successful backup without relay', { backup: true, noRelay: true }, 'observe-job-relay'],
  ['successful backup with only old completed relay', { backup: true, onlyOldJobs: true }, 'observe-latest-capture'],
  ['successful backup with incomplete current relay set', { backup: true, partialRelay: true }, 'observe-latest-capture'],
  ['result reference drift', { resultDrift: true }, 'observe-result-binding'],
  ['unwired backup manifest', { backup: true, manifestMissing: true }, 'manifest'],
  ['manifest byte drift', {backup:true,manifestDrift:true},'manifest-checksum'],
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
test('invalid negative sessions and wrong foreign installation fail before creation', async () => {
  for (const [change, stage] of [[{ invalidNegative: true }, 'permission-session'], [{ invalidForeign: true }, 'foreign-session'],
    [{ foreignWrongPin: true }, 'foreign-installation-pin'], [{ targetWrongPin: true }, 'installation-pin']]) {
    const m = model(change);
    await assert.rejects(runSmoke(m.options), error => error instanceof SmokeFailure && error.stage === stage);
    assert.equal(m.counts().creates, 0);
  }
  const m = model();
  await assert.rejects(runSmoke({ ...m.options, foreignBaseURL: m.options.baseURL }), /foreign-base-url/);
  await assert.rejects(runSmoke({ ...m.options, foreignToken: m.options.deniedToken }), /negative-session-inputs/);
  assert.equal(m.counts().creates, 0);
});
test('execution-only scope records cross-installation as not tested', async () => {
  for (const failed of [false, true]) {
    const m = model({ failed });
    const result = await runSmoke({ ...m.options, scope: 'execution', foreignToken: undefined, foreignInstallationID: undefined, foreignBaseURL: undefined });
    assert.equal(result.status, 'model_execution_observed');
    assert.equal(result.outcome, failed ? 'failed' : 'succeeded');
    assert.equal(result.crossInstallation, 'not_tested');
    assert.equal(result.permissionSessionRejected, true);
    assert.equal(result.negativeSessionsRejected, undefined);
  }
});
test('two-round orchestrator executes the actual model harness for both outcomes', async () => {
  const success = model({ key: 'model-success-key-12345' });
  const failure = model({ failed: true, key: 'model-failure-key-12345', taskUUID: '22222222-2222-3333-4444-555555555555' });
  const records = [];
  const summary = await runRounds({ common: { ...success.options, scope: 'acceptance' },
    successKey: success.options.key, failureKey: failure.options.key, successRequest: '{}', failureRequest: '{}', failureCategory: 'runner_failed' },
  { emit: x => records.push(x), run: options => runSmoke({ ...(options.expectedStatus === 'failed' ? failure.options : success.options), ...options,
    fetchImpl: (options.expectedStatus === 'failed' ? failure.options : success.options).fetchImpl,
    observe: (options.expectedStatus === 'failed' ? failure.options : success.options).observe }) });
  assert.equal(summary.status, 'model_two_rounds_passed');
  assert.equal(records[0].result.outcome, 'succeeded');
  assert.equal(records[1].result.outcome, 'failed');
  assert.deepEqual(success.counts(), { creates: 2, polls: 2, observations: 2 });
  assert.deepEqual(failure.counts(), { creates: 2, polls: 2, observations: 2 });
});
test('model refuses coerced observer execution counts', async () => {
  const m = model();
  const observe = m.options.observe;
  m.options.observe = async input => ({ ...await observe(input), claimCount: '1' });
  await assert.rejects(runSmoke(m.options), error => error instanceof SmokeFailure && error.stage === 'observe-execution-terminal');
});
test('validated accepted task remains identifiable when later observation fails', async () => {
  const m = model({ doubleQueue: true });
  let accepted;
  m.options.onAccepted = value => { accepted = value; };
  await assert.rejects(runSmoke(m.options), error => error instanceof SmokeFailure && error.stage === 'observe-after-replay-identity-and-uniqueness');
  assert.deepEqual(accepted, { publicID: 'spf_11111111-2222-3333-4444-555555555555', installationID: 'installation_model', configVersion: 1 });
});
