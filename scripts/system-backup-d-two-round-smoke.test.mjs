import test from 'node:test';
import assert from 'node:assert/strict';
import { runRounds } from './system-backup-d-two-round-smoke.mjs';
import { SmokeFailure } from './system-backup-d-api-smoke.mjs';

const options = () => ({ common: { mode: 'model', scope: 'acceptance', installationID: 'installation_test' },
  successKey: 'success-key-12345678', failureKey: 'failure-key-12345678',
  successRequest: '{}', failureRequest: '{}', failureCategory: 'runner_failed' });
const result = (outcome, id, scope = 'acceptance') => ({ status: scope === 'acceptance' ? 'model_chain_passed' : 'model_execution_observed',
  mode: 'model', scope, publicID: id, installationID: 'installation_test', configVersion: 2,
  outcome, failureCategory: outcome === 'failed' ? 'runner_failed' : 'none', executionObserved: true,
  sameKeySingleEnqueue: true, permissionSessionRejected: true, crossInstallation: scope === 'acceptance' ? 'rejected' : 'not_tested' });

test('both validated rounds produce distinct task identities and one summary', async () => {
  const calls = [], records = [];
  const summary = await runRounds(options(), { emit: x => records.push(x), run: async o => {
    calls.push(o); return result(o.expectedStatus, o.expectedStatus === 'succeeded' ? 'success-task' : 'failure-task');
  } });
  assert.deepEqual(calls.map(x => x.key), ['success-key-12345678', 'failure-key-12345678']);
  assert.deepEqual(calls.map(x => x.expectedStatus), ['succeeded', 'failed']);
  assert.equal(summary.status, 'model_two_rounds_passed');
  assert.equal(summary.successPublicID, 'success-task');
  assert.equal(summary.failurePublicID, 'failure-task');
  assert.equal(records.length, 2);
});

test('invalid second-round inputs do not run the first round', async () => {
  for (const change of [{ failureKey: 'success-key-12345678' }, { failureRequest: '{' }, { failureCategory: 'none' }]) {
    let calls = 0;
    await assert.rejects(runRounds({ ...options(), ...change }, { run: async () => { calls++; } }), /round-inputs/);
    assert.equal(calls, 0);
  }
});

test('failure after task acceptance is reported once and is not retried', async () => {
  let calls = 0; const records = [];
  await assert.rejects(runRounds(options(), { emit: x => records.push(x), run: async o => {
    calls++;
    if (calls === 1) return result('succeeded', 'success-task');
    o.onAccepted({ publicID: 'failure-task', installationID: 'installation_test', configVersion: 2 });
    throw new SmokeFailure('observe-terminal', 'deadline_exceeded');
  } }), /observe-terminal/);
  assert.equal(calls, 2);
  assert.equal(records[1].acceptedTask.publicID, 'failure-task');
  assert.equal(records[1].code, 'deadline_exceeded');
});

test('mismatched config or task reuse cannot pass two-round acceptance', async () => {
  for (const variant of ['task', 'config']) {
    let count = 0;
    await assert.rejects(runRounds(options(), { run: async () => {
      count++;
      const x = result(count === 1 ? 'succeeded' : 'failed', variant === 'task' ? 'same' : `task-${count}`);
      if (variant === 'config' && count === 2) x.configVersion = 3;
      return x;
    } }), /round-binding/);
  }
});

test('execution-only summary cannot claim full acceptance', async () => {
  const o = options(); o.common.scope = 'execution'; let count = 0;
  const summary = await runRounds(o, { run: async () => result(++count === 1 ? 'succeeded' : 'failed', `task-${count}`, 'execution') });
  assert.equal(summary.status, 'model_two_rounds_execution_observed');
});
