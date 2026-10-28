import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSmoke, SmokeFailure } from './system-backup-d-api-smoke.mjs';

const fail = stage => { throw new SmokeFailure(stage); };
const keyPattern = /^[A-Za-z0-9._:-]{16,128}$/;
const validJSON = value => {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 65536) return false;
  try { JSON.parse(value); return true; } catch { return false; }
};

// This orchestrates two REAL runs only when explicitly invoked. It never
// substitutes a model result for a live result or automatically retries a
// failed/unknown create. Inputs for both rounds are checked before either POST.
export async function runRounds(options, { run = runSmoke, emit = () => {} } = {}) {
  const { common, successKey, failureKey, successRequest, failureRequest, failureCategory } = options;
  if (!common || !['real', 'model'].includes(common.mode) || !['acceptance', 'execution'].includes(common.scope) ||
      !keyPattern.test(successKey ?? '') || !keyPattern.test(failureKey ?? '') || successKey === failureKey ||
      !validJSON(successRequest) || !validJSON(failureRequest) ||
      typeof failureCategory !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(failureCategory) || failureCategory === 'none') fail('round-inputs');
  const rounds = [];
  for (const [name, key, requestJSON, expectedStatus] of [
    ['success', successKey, successRequest, 'succeeded'], ['failure', failureKey, failureRequest, 'failed'],
  ]) {
    let acceptedTask;
    let result;
    try {
      result = await run({ ...common, key, requestJSON, expectedStatus,
        expectedFailureCategory: expectedStatus === 'failed' ? failureCategory : undefined,
        onAccepted: task => { acceptedTask = task; } });
      const expectedRunStatus = common.scope === 'acceptance' ? `${common.mode}_chain_passed` : `${common.mode}_execution_observed`;
      if (result?.status !== expectedRunStatus || result.mode !== common.mode || result.scope !== common.scope ||
          result.outcome !== expectedStatus || result.installationID !== common.installationID ||
          result.executionObserved !== true || result.sameKeySingleEnqueue !== true || result.permissionSessionRejected !== true ||
          result.crossInstallation !== (common.scope === 'acceptance' ? 'rejected' : 'not_tested') ||
          (expectedStatus === 'failed' && result.failureCategory !== failureCategory)) fail('round-result');
      if (rounds.length && (rounds[0].publicID === result.publicID || rounds[0].configVersion !== result.configVersion)) fail('round-binding');
      rounds.push(result);
      emit({ round: name, result });
    } catch (error) {
      const failure = error instanceof SmokeFailure ? { stage: error.stage, code: error.code } : { stage: 'local-input-or-observer', code: 'not_ready' };
      emit({ round: name, status: 'failed', ...failure, ...(acceptedTask ? { acceptedTask } : {}) });
      throw error;
    }
  }
  return { status: common.scope === 'acceptance' ? `${common.mode}_two_rounds_passed` : `${common.mode}_two_rounds_execution_observed`,
    scope: common.scope, installationID: common.installationID, configVersion: rounds[0].configVersion,
    successPublicID: rounds[0].publicID, failurePublicID: rounds[1].publicID, failureCategory };
}

async function main() {
  const e = process.env;
  if (!e.SBK_SMOKE_OBSERVER || !e.SBK_SMOKE_SUCCESS_REQUEST_FILE || !e.SBK_SMOKE_FAILURE_REQUEST_FILE) fail('required-files');
  const observer = await import(pathToFileURL(resolve(e.SBK_SMOKE_OBSERVER)).href);
  const [successRequest, failureRequest] = await Promise.all([
    readFile(e.SBK_SMOKE_SUCCESS_REQUEST_FILE, 'utf8'), readFile(e.SBK_SMOKE_FAILURE_REQUEST_FILE, 'utf8'),
  ]);
  const result = await runRounds({
    common: { mode: 'real', scope: e.SBK_SMOKE_SCOPE || 'acceptance', baseURL: e.SBK_SMOKE_BASE_URL,
      kind: e.SBK_SMOKE_KIND || 'preflight', accessToken: e.SBK_SMOKE_ACCESS_TOKEN,
      username: e.SBK_SMOKE_USERNAME, password: e.SBK_SMOKE_PASSWORD, deniedToken: e.SBK_SMOKE_DENIED_TOKEN,
      foreignToken: e.SBK_SMOKE_FOREIGN_TOKEN, foreignBaseURL: e.SBK_SMOKE_FOREIGN_BASE_URL,
      installationID: e.SBK_OBSERVER_INSTALLATION_ID, foreignInstallationID: e.SBK_SMOKE_FOREIGN_INSTALLATION_ID,
      timeoutMS: Number(e.SBK_SMOKE_TIMEOUT_MS || 120000), observe: observer.observeTask },
    successKey: e.SBK_SMOKE_SUCCESS_KEY, failureKey: e.SBK_SMOKE_FAILURE_KEY,
    successRequest, failureRequest, failureCategory: e.SBK_SMOKE_EXPECT_FAILURE,
  }, { emit: item => process.stdout.write(`${JSON.stringify(item)}\n`) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const failure = error instanceof SmokeFailure ? { stage: error.stage, code: error.code } : { stage: 'local-input-or-observer', code: 'not_ready' };
    process.stderr.write(`${JSON.stringify({ status: 'failed', ...failure })}\n`); process.exitCode = 1;
  });
}
