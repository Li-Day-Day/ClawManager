#!/usr/bin/env node
// Test-environment HTTP exercise. Secrets and plaintext never enter receipts.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { openSync, closeSync, readSync, writeFileSync, readFileSync } from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { decodeDownloadInput } from './system-backup-a-download-deployment.mjs';
import { capacityTimeNS } from './system-backup-a-capacity-material-review.mjs';

export const digest = raw => createHash('sha256').update(raw).digest('hex');
export const liveAuditSQL = readFileSync(new URL('../backend/cmd/system-backup-audit-collect/audit.sql', import.meta.url), 'utf8');
const hash = /^[0-9a-f]{64}$/;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const evidenceID = new RegExp(`^sev_${uuid}$`), operationID = new RegExp(`^sop_${uuid}$`);
const proofPath = '/api/v1/admin/system-backup-strong-auth/proof';
const downloadPath = id => '/api/v1/admin/system-backup-evidence/' + id;
const readyPath = '/internal/system-backup-download/ready';
const transportFailureCodes = new Set(['timeout', 'request_error', 'response_error', 'response_aborted', 'response_incomplete', 'body_too_large', 'invalid_response']);
const fields = (obj, keys) => { assert.ok(obj && typeof obj === 'object' && !Array.isArray(obj)); assert.deepEqual(Object.keys(obj).sort(), [...keys].sort()); };
export function liveChainTemplate() {
  const target = () => ({ origin: '', server_name: '', ca_file: '', ca_sha256: '' });
  return { schema_version: 'a_live_download_plan.v1', login: target(), download: target(), installation_id: '',
    server_uuid: '', database: '', user_id: 0, evidence_id: '', evidence_sha256: '', evidence_bytes: 0, runtime_sha256: '' };
}
export function validateLivePlan(plan) {
  fields(plan, Object.keys(liveChainTemplate()));
  assert.equal(plan.schema_version, 'a_live_download_plan.v1');
  for (const target of [plan.login, plan.download]) {
    fields(target, ['origin', 'server_name', 'ca_file', 'ca_sha256']);
    const u = new URL(target.origin);
    assert.ok(u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash);
    assert.equal(target.origin, u.origin);
    assert.match(target.server_name, /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/);
    assert.ok(typeof target.ca_file === 'string' && target.ca_file.length > 0);
    assert.match(target.ca_sha256, hash);
  }
  assert.match(plan.installation_id, /^installation_[A-Za-z0-9_-]{1,115}$/);
  assert.match(plan.server_uuid, new RegExp(`^${uuid}$`));
  assert.match(plan.database, /^[A-Za-z0-9_]{1,64}$/);
  assert.ok(Number.isSafeInteger(plan.user_id) && plan.user_id > 0 && plan.user_id <= 2147483647);
  assert.match(plan.evidence_id, evidenceID); assert.match(plan.evidence_sha256, hash); assert.match(plan.runtime_sha256, hash);
  assert.ok(Number.isSafeInteger(plan.evidence_bytes) && plan.evidence_bytes > 0 && plan.evidence_bytes <= 8 * 1024 * 1024);
  return plan;
}
export function readLiveFile(path, maxBytes) {
  const fd = openSync(resolve(path), 'r'), buffer = Buffer.alloc(maxBytes + 1);
  try {
    let n, size = 0;
    while (size < buffer.length && (n = readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += n;
    assert.ok(size > 0 && size <= maxBytes);
    return Buffer.from(buffer.subarray(0, size));
  } finally { buffer.fill(0); closeSync(fd); }
}
const json = buffer => decodeDownloadInput(buffer);

export function makeLiveTransport(plan, { timeoutMs = 20000 } = {}) {
  validateLivePlan(plan);
  // Tests may shorten the real deadline; callers cannot extend the 20s bound.
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000);
  const trusted = new Map();
  for (const target of [plan.login, plan.download]) {
    const ca = readLiveFile(target.ca_file, 1048576);
    assert.equal(digest(ca), target.ca_sha256);
    trusted.set(target, ca);
  }
  return async ({ target, path, method = 'GET', headers = {}, body, binary = false, maxBytes = 65536 }) => {
    assert.ok(trusted.has(target));
    const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
    try {
      return await new Promise((done, fail) => {
        let req, response, size = 0, settled = false, ended = false;
        const chunks = [], hasher = createHash('sha256');
        const cleanup = () => { clearTimeout(timer); for (const c of chunks) c.fill(0); chunks.length = 0; hasher.destroy(); };
        const rejectTransport = code => {
          if (settled) return;
          settled = true;
          const failure = { code, received_bytes: size };
          const operation = response?.headers['x-system-backup-operation-id'];
          if (typeof operation === 'string' && operationID.test(operation)) failure.operation_public_id = operation;
          const error = new Error('live_transport_failed'); error.liveFailure = failure;
          cleanup(); response?.destroy(); req?.destroy(); fail(error);
        };
        const timer = setTimeout(() => rejectTransport('timeout'), timeoutMs);
        try { req = https.request(new URL(path, target.origin), {
          method, headers: { ...headers, ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}) },
          ca: trusted.get(target), servername: target.server_name, rejectUnauthorized: true,
          checkServerIdentity: (_host, cert) => tls.checkServerIdentity(target.server_name, cert),
          minVersion: 'TLSv1.2', agent: false,
        }, res => {
          response = res;
          if (settled) { res.destroy(); return; }
          const isBinary = binary && res.statusCode === 200;
          const peer = res.socket.getPeerCertificate();
          res.on('data', chunk => {
            if (settled) { chunk.fill(0); return; }
            size += chunk.length;
            if (size > maxBytes) { chunk.fill(0); rejectTransport('body_too_large'); return; }
            if (isBinary) { hasher.update(chunk); chunk.fill(0); }
            else chunks.push(chunk);
          });
          res.on('aborted', () => rejectTransport('response_aborted'));
          res.on('error', () => rejectTransport('response_error'));
          res.on('close', () => { if (!ended) rejectTransport('response_incomplete'); });
          res.on('end', () => {
            ended = true;
            if (settled) return;
            if (!res.complete) { rejectTransport('response_incomplete'); return; }
            let combined;
            try {
              const result = { status: res.statusCode, headers: res.headers, bytes: size,
                peer_sha256: peer.raw ? digest(peer.raw) : null };
              if (isBinary) result.sha256 = hasher.digest('hex');
              else if (size) { combined = Buffer.concat(chunks); result.json = json(combined); }
              settled = true;
              done(result);
            } catch { rejectTransport('invalid_response'); }
            finally { combined?.fill(0); cleanup(); }
          });
        }); } catch { rejectTransport('request_error'); return; }
        req.on('error', () => rejectTransport('request_error'));
        try { req.end(encoded ?? undefined); } catch { rejectTransport('request_error'); }
      });
    } finally { encoded?.fill(0); }
  };
}

// getCredentials is called only after read-only readiness and anonymous denial.
// The caller prompts for a fresh human code; it does not read or generate TOTP seeds.
export async function runLiveChain(plan, { getCredentials, getCode, request = makeLiveTransport(plan), key = 'a-live-' + randomUUID() } = {}) {
  validateLivePlan(plan);
  assert.match(key, /^[A-Za-z0-9._:-]{16,128}$/);
  const receipt = { schema_version: 'a_live_download_http_receipt.v1', status: 'BLOCKED',
    plan_sha256: digest(JSON.stringify(plan)), installation_id: plan.installation_id, server_uuid: plan.server_uuid,
    database: plan.database, user_id: plan.user_id, evidence_id: plan.evidence_id,
    expected_sha256: plan.evidence_sha256, expected_bytes: plan.evidence_bytes, runtime_sha256: plan.runtime_sha256,
    idempotency_key: key, started_at: new Date().toISOString(), checks: [], audit_verified: false,
    schema_changed: false, grants_changed: false, secrets_written: false, plaintext_written: false };
  let stage = 'readiness', credentials, token, proof, code;
  const check = (name, ok) => { receipt.checks.push({ name, passed: !!ok }); assert.ok(ok); };
  try {
    const ready = await request({ target: plan.download, path: readyPath });
    check(stage, ready.status === 204 && ready.bytes === 0 && ready.headers['x-system-backup-download-runtime-sha256'] === plan.runtime_sha256);
    receipt.download_peer_sha256 = ready.peer_sha256;
    stage = 'anonymous_denied';
    const anonymous = await request({ target: plan.download, path: downloadPath(plan.evidence_id), headers: { 'Idempotency-Key': key } });
    check(stage, anonymous.status === 401 && !anonymous.headers['x-system-backup-operation-id'] && anonymous.json?.code === 'authentication_required');
    stage = 'human_credentials';
    credentials = await getCredentials();
    fields(credentials, ['username', 'password']);
    assert.ok(typeof credentials.username === 'string' && credentials.username.length > 0 && credentials.username.length <= 128);
    assert.ok(typeof credentials.password === 'string' && credentials.password.length > 0 && Buffer.byteLength(credentials.password) <= 1024);
    stage = 'real_login';
    const login = await request({ target: plan.login, path: '/api/v1/auth/login', method: 'POST', body: { username: credentials.username, password: credentials.password } });
    check(stage, login.status === 200 && login.json?.success === true && typeof login.json.data?.access_token === 'string');
    token = login.json.data.access_token;
    assert.ok(token.length <= 8192 && token.split('.').length === 3);
    const claims = json(Buffer.from(token.split('.')[1], 'base64url'));
    check('login_actor_matches_plan', claims.user_id === plan.user_id && claims.token_type === 'access');
    // Decoded claims are only correlation facts; the server validates the JWT.
    receipt.subject_sha256 = digest('user:' + plan.user_id);
    receipt.session_sha256 = digest(digest(token));
    receipt.login_peer_sha256 = login.peer_sha256;
    stage = 'missing_proof_denied';
    const auth = { Authorization: 'Bearer ' + token, 'Idempotency-Key': key };
    const denied = await request({ target: plan.download, path: downloadPath(plan.evidence_id), headers: auth });
    check(stage, denied.status === 401 && !denied.headers['x-system-backup-operation-id'] && denied.json?.code === 'strong_auth_required');
    stage = 'human_totp_proof';
    code = await getCode();
    assert.match(code, /^[0-9]{6}$/);
    const issued = await request({ target: plan.download, path: proofPath, method: 'POST', headers: { Authorization: auth.Authorization },
      body: { password: credentials.password, code, endpoint: 'getSystemBackupEvidence', idempotency_key: key, request: { evidence_id: plan.evidence_id } } });
    check(stage, issued.status === 200 && issued.json?.header_name === 'X-Strong-Auth-Proof' && typeof issued.json.header_value === 'string');
    proof = issued.json.header_value;
    assert.ok(proof.length <= 32768 && Buffer.from(proof, 'base64').toString('base64') === proof);
    const p = json(Buffer.from(proof, 'base64')).payload;
    check('issued_binding_matches', p.audience === plan.installation_id && p.subject === 'user:' + plan.user_id && p.session === digest(token) && p.endpoint === 'getSystemBackupEvidence' && p.idempotency_key === key && hash.test(p.request_hash));
    receipt.request_hash = p.request_hash;
    stage = 'plaintext_download';
    const downloaded = await request({ target: plan.download, path: downloadPath(plan.evidence_id), headers: { ...auth, 'X-Strong-Auth-Proof': proof }, binary: true, maxBytes: plan.evidence_bytes });
    const operation = downloaded.headers['x-system-backup-operation-id'];
    if (typeof operation === 'string' && operationID.test(operation)) receipt.operation_public_id = operation;
    receipt.received_bytes = downloaded.bytes;
    check(stage, downloaded.status === 200 && receipt.operation_public_id && downloaded.bytes === plan.evidence_bytes && downloaded.sha256 === plan.evidence_sha256
      && downloaded.headers['content-length'] === String(plan.evidence_bytes) && downloaded.headers.etag === '"' + plan.evidence_sha256 + '"'
      && downloaded.headers['cache-control'] === 'no-store' && downloaded.headers['x-content-type-options'] === 'nosniff');
    receipt.received_bytes = downloaded.bytes; receipt.received_sha256 = downloaded.sha256;
    receipt.status = 'HTTP_PASSED_AUDIT_PENDING';
  } catch (error) {
    receipt.blocked_stage = stage;
    receipt.failure_code = 'validation_failed';
    const f = error?.liveFailure;
    if (transportFailureCodes.has(f?.code)) {
      receipt.failure_code = f.code;
      if (Number.isSafeInteger(f.received_bytes) && f.received_bytes >= 0 && f.received_bytes <= 8 * 1024 * 1024 + 65536) receipt.partial_received_bytes = f.received_bytes;
      if (stage === 'plaintext_download' && typeof f.operation_public_id === 'string' && operationID.test(f.operation_public_id)) receipt.operation_public_id = f.operation_public_id;
    }
  } finally {
    if (credentials) { credentials.username = ''; credentials.password = ''; }
    token = ''; proof = ''; code = ''; receipt.finished_at = new Date().toISOString();
  }
  return receipt;
}

export function auditQuery(receipt) {
  assert.equal(receipt.status, 'HTTP_PASSED_AUDIT_PENDING');
  assert.match(receipt.operation_public_id, operationID); assert.match(receipt.evidence_id, evidenceID);
  // No credentials, nonce HMAC, raw claim, provider locator or request/proof.
  assert.equal((liveAuditSQL.match(/\?/g) ?? []).length, 1);
  return liveAuditSQL.replace('?', `'${receipt.operation_public_id}'`);
}

export function reviewLiveAudit(receipt, raw) {
  assert.equal(receipt.status, 'HTTP_PASSED_AUDIT_PENDING');
  const observed = json(raw);
  fields(observed, ['server_uuid', 'database', 'operation', 'admission', 'intent', 'result', 'result_link', 'nonce_count']);
  assert.equal(observed.server_uuid, receipt.server_uuid); assert.equal(observed.database, receipt.database);
  const { operation: o, admission: a, intent: i, result: r, result_link: l } = observed;
  for (const obj of [o, a, i, r, l]) assert.ok(obj && typeof obj === 'object');
  assert.ok(Number.isSafeInteger(o.id) && o.id > 0);
  assert.equal(o.public_id, receipt.operation_public_id); assert.equal(o.actor_id, String(receipt.user_id));
  assert.equal(o.operation_type, 'evidence_download_admission'); assert.equal(o.endpoint, 'getSystemBackupEvidence'); assert.equal(o.status, 'succeeded');
  assert.equal(o.idempotency_key, receipt.idempotency_key); assert.equal(o.request_hash, receipt.request_hash);
  for (const obj of [o, a, l]) { assert.equal(obj.installation_id, receipt.installation_id); assert.equal(obj.evidence_id, receipt.evidence_id); }
  for (const obj of [a, l]) { assert.equal(obj.operation_id, o.id); assert.equal(obj.operation_public_id, o.public_id); }
  assert.ok(Number.isSafeInteger(i.id) && i.id > 0 && Number.isSafeInteger(r.id) && r.id > 0 && r.id !== i.id);
  assert.equal(a.intent_audit_id, i.id); assert.equal(l.intent_audit_id, i.id); assert.equal(l.result_audit_id, r.id);
  for (const [obj, action] of [[i, 'intent'], [r, 'result']]) {
    assert.equal(obj.user_id, receipt.user_id); assert.equal(obj.action, 'system_backup.evidence_download.' + action);
    assert.equal(obj.resource_type, 'system_backup'); assert.equal(obj.resource_id, null);
  }
  const ab = a.body, ib = i.body, rb = r.body;
  fields(ab, ['schema_version', 'operation_public_id', 'origin_installation_id', 'evidence_id', 'evidence_row_version', 'subject_sha256', 'session_sha256', 'request_hash', 'claim_sha256', 'claim_expires_at', 'manifest_sha256', 'range_present', 'range_start', 'range_end', 'admitted_at', 'intent_audit_id']);
  fields(ib, ['schema_version', 'operation_public_id', 'origin_installation_id', 'evidence_id', 'evidence_row_version', 'request_hash', 'manifest_sha256', 'claim_sha256', 'range_present', 'range_start', 'range_end', 'intent_at']);
  fields(rb, ['schema_version', 'operation_public_id', 'origin_installation_id', 'intent_audit_id', 'evidence_id', 'evidence_row_version', 'claim_sha256', 'request_hash', 'range_start', 'range_end', 'range_present', 'outcome', 'bytes_written', 'result_at', 'retain_until']);
  assert.equal(ab.schema_version, 'system-backup-evidence-download-admission.v1');
  assert.equal(ib.schema_version, 'system-backup-evidence-download-intent.v1');
  assert.equal(rb.schema_version, 'system-backup-evidence-download-result.v1');
  for (const b of [ab, ib, rb]) {
    assert.equal(b.operation_public_id, o.public_id); assert.equal(b.origin_installation_id, receipt.installation_id);
    assert.equal(b.evidence_id, receipt.evidence_id); assert.equal(b.request_hash, receipt.request_hash);
    assert.equal(b.range_present, false); assert.equal(b.range_start, 0); assert.equal(b.range_end, receipt.expected_bytes - 1);
    assert.ok(Number.isSafeInteger(b.evidence_row_version) && b.evidence_row_version > 0);
    assert.match(b.claim_sha256, hash); assert.equal(b.claim_sha256, ab.claim_sha256);
    assert.equal(b.evidence_row_version, ab.evidence_row_version);
  }
  assert.equal(ab.intent_audit_id, i.id); assert.equal(rb.intent_audit_id, i.id);
  assert.equal(ab.subject_sha256, receipt.subject_sha256); assert.equal(ab.session_sha256, receipt.session_sha256);
  assert.match(ab.manifest_sha256, hash); assert.equal(ib.manifest_sha256, ab.manifest_sha256);
  assert.equal(rb.outcome, 'local_write_complete'); assert.equal(rb.bytes_written, receipt.received_bytes);
  const canonical = obj => JSON.stringify(Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]])));
  for (const [body, link] of [[ab, a], [rb, l]]) {
    const bytes = canonical(body);
    assert.equal(Buffer.byteLength(bytes), link.size_bytes); assert.equal(digest(bytes), link.sha256);
  }
  const admitted = capacityTimeNS(ab.admitted_at), resultAt = capacityTimeNS(rb.result_at), retain = capacityTimeNS(rb.retain_until);
  assert.ok(capacityTimeNS(ib.intent_at) <= admitted && admitted <= resultAt && resultAt < retain);
  assert.ok(admitted < capacityTimeNS(ab.claim_expires_at) && capacityTimeNS(ab.claim_expires_at) < retain);
  assert.equal(observed.nonce_count, 1);
  return { schema_version: 'a_live_download_audit_review.v1', status: 'LIVE_HTTP_AUDIT_LINKS_PASSED',
    http_receipt_sha256: digest(JSON.stringify(receipt)), audit_export_sha256: digest(raw),
    operation_public_id: o.public_id, intent_audit_id: i.id, result_audit_id: r.id,
    provenance: 'operator_export_requires_source_review', full_recovery_e2e_verified: false };
}

export async function liveChainCLI(args = process.argv.slice(2)) {
  const opts = {};
  assert.ok(args.length > 0 && args.length % 2 === 0);
  for (let i = 0; i < args.length; i += 2) { assert.ok(!Object.hasOwn(opts, args[i])); opts[args[i]] = args[i + 1]; }
  if (opts['--template']) {
    fields(opts, ['--template']); writeFileSync(resolve(opts['--template']), JSON.stringify(liveChainTemplate(), null, 2) + '\n', { flag: 'wx' }); return;
  }
  if (opts['--query']) {
    fields(opts, ['--query', '--output']);
    writeFileSync(resolve(opts['--output']), auditQuery(json(readLiveFile(opts['--query'], 65536))), { flag: 'wx' }); return;
  }
  if (opts['--audit']) {
    fields(opts, ['--audit', '--receipt']);
    console.log(JSON.stringify(reviewLiveAudit(json(readLiveFile(opts['--receipt'], 65536)), readLiveFile(opts['--audit'], 65536)), null, 2)); return;
  }
  fields(opts, ['--plan', '--receipt']);
  const plan = validateLivePlan(json(readLiveFile(opts['--plan'], 65536)));
  // Reserve receipt before any network side effects. Never overwrite an old run.
  const fd = openSync(resolve(opts['--receipt']), 'wx'); closeSync(fd);
  const lines = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  let secretBytes = 0;
  const boundedInput = c => { secretBytes += c.length; if (secretBytes > 8192) process.stdin.destroy(new Error('bounded_input')); };
  process.stdin.on('data', boundedInput);
  const readSecret = async marker => {
    process.stderr.write(marker + '\n');
    const next = await iterator.next(); assert.ok(!next.done && Buffer.byteLength(next.value) <= 8192);
    return json(Buffer.from(next.value));
  };
  let result;
  try {
    result = await runLiveChain(plan, {
      getCredentials: () => readSecret('A_LIVE_CHAIN_CREDENTIALS_READY'),
      getCode: async () => { const value = await readSecret('A_LIVE_CHAIN_TOTP_READY'); fields(value, ['code']); return value.code; },
    });
  } finally { lines.close(); process.stdin.off('data', boundedInput); process.stdin.destroy(); }
  writeFileSync(resolve(opts['--receipt']), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'HTTP_PASSED_AUDIT_PENDING') process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  liveChainCLI().catch(() => { console.error('Live-chain input/transport rejected; retain public receipt; no secret or raw driver output emitted.'); process.exitCode = 1; });
}
