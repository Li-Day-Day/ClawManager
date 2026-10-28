import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const invariant = (ok, stage) => { if (!ok) throw new SmokeFailure(stage); };
export class SmokeFailure extends Error {
  constructor(stage, code = 'assertion_failed') { super(`system-backup smoke: ${stage} (${code})`); this.stage = stage; this.code = code; }
}
const routes = {
  backup: ['/api/v1/admin/system-backups', 'sbk_', 'createSystemBackup'],
  preflight: ['/api/v1/admin/system-backup-preflights', 'spf_', 'createSystemBackupPreflight'],
};
const terminal = new Set(['succeeded', 'failed', 'canceled']);
const tokenPattern = /^[A-Za-z0-9._:-]{16,128}$/;

// observe is a deployment-supplied read-only SQL/executor observer, NOT another
// HTTP-200 check. It receives no bearer/password. A real run requires this hook.
// It must return the independently observed task identity, config version,
// taskCount/enqueueCount, claimCount/attemptCount and persisted status/category.
export async function runSmoke(options) {
  const { baseURL, kind = 'preflight', requestJSON, key, observe, mode = 'real',
    timeoutMS = 120_000, pollMS = 500, requestTimeoutMS = 10_000, fetchImpl = fetch,
    expectedStatus = 'succeeded', expectedFailureCategory, deniedToken, foreignToken } = options;
  invariant(mode === 'real' || mode === 'model', 'mode');
  invariant(routes[kind] && tokenPattern.test(key) && typeof observe === 'function', 'inputs');
  invariant(Number.isInteger(timeoutMS) && timeoutMS >= 1 && timeoutMS <= 600_000 && pollMS >= 1 && requestTimeoutMS >= 1, 'bounds');
  invariant(typeof requestJSON === 'string' && Buffer.byteLength(requestJSON) <= 65536, 'request-size');
  try { JSON.parse(requestJSON); } catch { throw new SmokeFailure('request-json'); }
  invariant(expectedStatus === 'succeeded' || expectedStatus === 'failed', 'expected-outcome');
  if (expectedStatus === 'failed') invariant(typeof expectedFailureCategory === 'string' && expectedFailureCategory !== 'none', 'expected-failure');
  invariant(deniedToken && foreignToken, 'negative-session-inputs');
  const origin = new URL(baseURL);
  invariant(!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash &&
    (origin.protocol === 'https:' || origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)), 'base-url');
  const deadline = Date.now() + timeoutMS;
  const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new SmokeFailure('deadline', 'deadline_exceeded'); return ms; };
  const bounded = async (fn, stage) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(requestTimeoutMS, remaining())));
	const signal = controller.signal;
    let onAbort;
    try {
      return await Promise.race([Promise.resolve().then(() => fn(signal)), new Promise((_, reject) => {
        onAbort = () => reject(new SmokeFailure(stage, 'deadline_exceeded'));
        signal.addEventListener('abort', onAbort, { once: true });
      })]);
    } finally { clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); }
  };
  let access = options.accessToken;
  const call = async (path, { method = 'GET', body, token = access, stage, live = true, headers = {} } = {}) => bounded(async signal => {
    let response;
    try { response = await fetchImpl(new URL(path, origin), { method, body, signal, redirect: 'error',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }); }
    catch { throw new SmokeFailure(stage, 'transport_failed'); }
    // Bound the streamed body too; Content-Length alone is not authoritative.
    let bytes = 0; const chunks = [];
    if (response.body) for await (const chunk of response.body) {
      bytes += chunk.length; invariant(bytes <= 8 * 1024 * 1024, `${stage}-response-size`); chunks.push(chunk);
    }
    let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new SmokeFailure(stage, 'invalid_json'); }
    if (response.ok && live) invariant(response.headers.get('x-system-backup-data-source') === 'live', `${stage}-live-source`);
    return { response, data };
  }, stage);
  const success = (result, status, stage) => {
    if (result.response.status !== status) {
      const code = typeof result.data?.code === 'string' && /^[a-z_]{1,64}$/.test(result.data.code) ? result.data.code : 'unexpected_status';
      throw new SmokeFailure(stage, code);
    }
  };
  if (!access) {
    invariant(options.username && options.password, 'login-inputs');
    const login = await call('/api/v1/auth/login', { method: 'POST', token: undefined, body: JSON.stringify({ username: options.username, password: options.password }), stage: 'login', live: false });
    success(login, 200, 'login'); access = login.data?.data?.access_token;
    invariant(typeof access === 'string' && access.length > 0, 'login-token');
  }
  const me = await call('/api/v1/auth/me', { stage: 'session', live: false });
  success(me, 200, 'session'); invariant(me.data?.data?.id, 'session-user');
  const config = await call('/api/v1/admin/system-backup-config', { stage: 'config' });
  success(config, 200, 'config');
  invariant(config.data?.effective_enabled === true && Number.isSafeInteger(config.data.version) && config.data.version >= 1, 'effective-config');
  const [path, prefix, endpoint] = routes[kind];
  const submit = () => call(path, { method: 'POST', body: requestJSON, headers: { 'Idempotency-Key': key }, stage: 'create' });
  const first = await submit(); success(first, 202, 'create');
  const task = first.data;
  invariant(task.schema_version === 'system-backup-task.v1' && task.task_type === kind && task.endpoint === endpoint &&
    typeof task.public_id === 'string' && new RegExp(`^${prefix}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).test(task.public_id) &&
    /^installation_[A-Za-z0-9._:-]{1,115}$/.test(task.origin_installation_id) && task.idempotency_key === key &&
    task.actor_type === 'admin' && task.actor_id === String(me.data.data.id) &&
    /^[0-9a-f]{64}$/.test(task.request_hash) && task.config_version === config.data.version && Number.isSafeInteger(task.row_version) && task.row_version >= 1, 'accepted-task');
  const location = `${path}/${task.public_id}`;
  invariant(first.response.headers.get('location') === location && /^[1-9][0-9]*$/.test(first.response.headers.get('retry-after') ?? ''), 'async-headers');
  const replay = await submit(); success(replay, 202, 'replay');
  for (const field of ['public_id', 'origin_installation_id', 'task_type', 'endpoint', 'idempotency_key', 'request_hash', 'config_version', 'created_at', 'deadline_at']) invariant(replay.data[field] === task[field], `replay-${field}`);
  const observation = async stage => {
    const value = await bounded(signal => observe({ stage, mode, kind, publicID: task.public_id,
      installationID: task.origin_installation_id, configVersion: task.config_version, signal }), `observe-${stage}`);
    invariant(value && value.publicID === task.public_id && value.installationID === task.origin_installation_id &&
      value.configVersion === task.config_version && value.taskCount === 1 && value.enqueueCount === 1, `observe-${stage}-identity-and-uniqueness`);
    return value;
  };
  await observation('after-replay');
  for (const [label, token] of [['permission', deniedToken], ['foreign-installation', foreignToken]]) {
    const rejected = await call(location, { token, stage: label });
    invariant((label === 'permission' ? [403] : [401, 403, 404]).includes(rejected.response.status) && ['authentication_required', 'permission_denied', 'not_found'].includes(rejected.data?.code), `${label}-read-rejection`);
    const createRejected = await call(path, { method: 'POST', body: requestJSON, token,
      headers: { 'Idempotency-Key': key }, stage: `${label}-create` });
    invariant((label === 'permission' ? [403] : [401, 403]).includes(createRejected.response.status) && ['authentication_required', 'permission_denied'].includes(createRejected.data?.code), `${label}-create-rejection`);
  }
  let detail; let previousVersion = task.row_version;
  for (;;) {
    const result = await call(location, { stage: 'poll' }); success(result, 200, 'poll'); detail = result.data;
    const current = detail?.task;
    invariant(current?.public_id === task.public_id && current.origin_installation_id === task.origin_installation_id && current.task_type === kind &&
      current.config_version === task.config_version && Number.isSafeInteger(current.row_version) && current.row_version >= previousVersion, 'poll-task');
    previousVersion = current.row_version;
    if (terminal.has(current.status)) break;
    invariant((kind === 'backup' ? ['pending','preparing','ready_for_capture','acquiring_gate','capturing','validating','publishing','finalization_unknown','canceling'] : ['pending','running','canceling']).includes(current.status), 'poll-status');
    await new Promise(resolve => setTimeout(resolve, Math.min(pollMS, remaining())));
  }
  invariant(detail.task.status === expectedStatus, 'terminal-outcome');
  if (expectedStatus === 'failed') invariant(detail.task.failure_category === expectedFailureCategory, 'terminal-failure');
  else {
    invariant(detail.task.failure_category === 'none', 'terminal-success-category');
    if (kind === 'preflight') invariant(/^sev_[0-9a-f-]{36}$/.test(detail.report_evidence?.public_id ?? '') && /^[0-9a-f]{64}$/.test(detail.report_evidence?.sha256 ?? '') && detail.verifier_summary?.failed === 0 && detail.report_validity_reason === 'valid', 'preflight-result');
    else {
      invariant(detail.artifact_state === 'committed' && detail.artifact_usable === true && detail.acceptance_ready === true && /^[0-9a-f]{64}$/.test(detail.checksums?.manifest), 'backup-result');
      const manifest = await call(`${location}/manifest`, { stage: 'manifest' }); success(manifest, 200, 'manifest');
      invariant(manifest.data && typeof manifest.data === 'object' && Object.keys(manifest.data).length > 0, 'manifest-result');
    }
  }
  const final = await observation('terminal');
  invariant(final.claimCount >= 1 && final.attemptCount >= 1 && final.status === detail.task.status &&
    final.failureCategory === detail.task.failure_category, 'observe-execution-terminal');
  if (expectedStatus === 'succeeded') {
    if (kind === 'preflight') invariant(final.resultPublicID === detail.report_evidence.public_id && final.resultSHA256 === detail.report_evidence.sha256, 'observe-result-binding');
    else invariant(final.manifestSHA256 === detail.checksums.manifest, 'observe-result-binding');
  }
  return { status: mode === 'real' ? 'real_chain_passed' : 'model_chain_passed', mode, kind,
    outcome: detail.task.status, failureCategory: detail.task.failure_category, executionObserved: true,
    negativeSessionsRejected: true, sameKeySingleEnqueue: true };
}

async function main() {
  const env = process.env;
  invariant(env.SBK_SMOKE_OBSERVER && env.SBK_SMOKE_REQUEST_FILE, 'required-files');
  const observer = await import(pathToFileURL(resolve(env.SBK_SMOKE_OBSERVER)).href);
  const result = await runSmoke({ baseURL: env.SBK_SMOKE_BASE_URL, kind: env.SBK_SMOKE_KIND,
    key: env.SBK_SMOKE_KEY, requestJSON: await readFile(env.SBK_SMOKE_REQUEST_FILE, 'utf8'),
    accessToken: env.SBK_SMOKE_ACCESS_TOKEN, username: env.SBK_SMOKE_USERNAME, password: env.SBK_SMOKE_PASSWORD,
    deniedToken: env.SBK_SMOKE_DENIED_TOKEN, foreignToken: env.SBK_SMOKE_FOREIGN_TOKEN,
    expectedStatus: env.SBK_SMOKE_EXPECT_STATUS, expectedFailureCategory: env.SBK_SMOKE_EXPECT_FAILURE,
    timeoutMS: Number(env.SBK_SMOKE_TIMEOUT_MS || 120000), observe: observer.observeTask });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Deliberately omit error.message/stack from fetch, SQL and observer code.
    const result = error instanceof SmokeFailure ? { status: 'failed', stage: error.stage, code: error.code } : { status: 'failed', stage: 'local-input-or-observer', code: 'not_ready' };
    process.stderr.write(`${JSON.stringify(result)}\n`); process.exitCode = 1;
  });
}
