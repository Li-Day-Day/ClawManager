import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { basename, dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditQuery, digest, liveChainTemplate, makeLiveTransport, reviewLiveAudit, runLiveChain, validateLivePlan } from './system-backup-a-live-chain.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const eid = 'sev_11111111-2222-3333-4444-555555555555', opid = 'sop_11111111-2222-3333-4444-555555555555';
const password = 'PRIVATE-TEST-PASSWORD', code = '123456', content = Buffer.from('TEST-ONLY-CONTENT');
const token = 'e30.' + Buffer.from(JSON.stringify({ user_id: 42, token_type: 'access' })).toString('base64url') + '.test-signature';
const key = 'a-live-fixed-test-001';
function fixture() {
  const target = () => ({ origin: 'https://127.0.0.1:19443', server_name: 'a-live.test', ca_file: 'synthetic-ca', ca_sha256: 'a'.repeat(64) });
  const plan = { ...liveChainTemplate(), login: target(), download: target(), installation_id: 'installation_live_test',
    server_uuid: '11111111-2222-3333-4444-555555555555', database: 'isolated_test', user_id: 42,
    evidence_id: eid, evidence_sha256: digest(content), evidence_bytes: content.length, runtime_sha256: 'b'.repeat(64) };
  const state = { calls: [], credentials: 0, codes: 0 };
  const proof = Buffer.from(JSON.stringify({ payload: { audience: plan.installation_id, subject: 'user:42', session: digest(token), endpoint: 'getSystemBackupEvidence', idempotency_key: key, request_hash: 'c'.repeat(64) } })).toString('base64');
  const reply = call => {
    if (call.path.endsWith('/ready')) return { status: 204, bytes: 0, headers: { 'x-system-backup-download-runtime-sha256': plan.runtime_sha256 } };
    if (call.path.endsWith('/login')) return { status: 200, headers: {}, json: { success: true, data: { access_token: token, refresh_token: 'PRIVATE-REFRESH' } } };
    if (call.path.endsWith('/proof')) return { status: 200, headers: {}, json: { header_name: 'X-Strong-Auth-Proof', header_value: proof } };
    if (!call.headers.Authorization) return { status: 401, headers: {}, json: { code: 'authentication_required' } };
    if (!call.headers['X-Strong-Auth-Proof']) return { status: 401, headers: {}, json: { code: 'strong_auth_required' } };
    return { status: 200, headers: { 'x-system-backup-operation-id': opid, 'content-length': String(content.length), etag: '"' + digest(content) + '"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, bytes: content.length, sha256: digest(content) };
  };
  const deps = { key, getCredentials: async () => { state.credentials++; return { username: 'test-user', password }; },
    getCode: async () => { state.codes++; return code; }, request: async c => { state.calls.push(structuredClone(c)); return reply(c); } };
  return { plan, state, deps, reply, proof };
}
function assertNoSecrets(value, proof) {
  const encoded = JSON.stringify(value);
  for (const secret of [password, token, proof, 'PRIVATE-REFRESH', content.toString()]) assert.ok(!encoded.includes(secret));
}
function auditFixture(receipt) {
  const common = { operation_public_id: opid, origin_installation_id: receipt.installation_id, evidence_id: eid,
    evidence_row_version: 7, request_hash: receipt.request_hash, claim_sha256: 'd'.repeat(64), range_present: false, range_start: 0, range_end: content.length - 1 };
  const result = { server_uuid: receipt.server_uuid, database: receipt.database,
    operation: { id: 11, public_id: opid, installation_id: receipt.installation_id, actor_id: '42', operation_type: 'evidence_download_admission', endpoint: 'getSystemBackupEvidence', status: 'succeeded', idempotency_key: receipt.idempotency_key, request_hash: receipt.request_hash, evidence_id: eid },
    admission: { operation_id: 11, operation_public_id: opid, installation_id: receipt.installation_id, evidence_id: eid, intent_audit_id: 12,
      body: { ...common, schema_version: 'system-backup-evidence-download-admission.v1', intent_audit_id: 12, subject_sha256: receipt.subject_sha256, session_sha256: receipt.session_sha256, manifest_sha256: 'e'.repeat(64), admitted_at: '2026-10-21T08:00:01Z', claim_expires_at: '2026-10-21T08:00:31Z' } },
    intent: { id: 12, user_id: 42, action: 'system_backup.evidence_download.intent', resource_type: 'system_backup', resource_id: null,
      body: { ...common, schema_version: 'system-backup-evidence-download-intent.v1', manifest_sha256: 'e'.repeat(64), intent_at: '2026-10-21T08:00:00Z' } },
    result: { id: 13, user_id: 42, action: 'system_backup.evidence_download.result', resource_type: 'system_backup', resource_id: null,
      body: { ...common, schema_version: 'system-backup-evidence-download-result.v1', intent_audit_id: 12, outcome: 'local_write_complete', bytes_written: content.length, result_at: '2026-10-21T08:00:02Z', retain_until: '2026-11-21T08:00:00Z' } },
    result_link: { operation_id: 11, operation_public_id: opid, installation_id: receipt.installation_id, evidence_id: eid, intent_audit_id: 12, result_audit_id: 13 }, nonce_count: 1 };
  // Intent/result do not carry every field of the admission body.
  const canonical = obj => JSON.stringify(Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]])));
  for (const [body, link] of [[result.admission.body, result.admission], [result.result.body, result.result_link]]) {
    const encoded = canonical(body); link.size_bytes = Buffer.byteLength(encoded); link.sha256 = digest(encoded);
  }
  return result;
}
const buffer = x => Buffer.from(JSON.stringify(x));

test('real-endpoint sequence prompts TOTP only after login, preserves operation and emits no secrets/plaintext', async () => {
  const f = fixture(), r = await runLiveChain(f.plan, f.deps);
  assert.equal(r.status, 'HTTP_PASSED_AUDIT_PENDING'); assert.equal(r.audit_verified, false);
  assert.equal(r.operation_public_id, opid); assert.equal(r.session_sha256, digest(digest(token)));
  assert.deepEqual(f.state.calls.map(c => c.path.split('/').at(-1)), ['ready', eid, 'login', eid, 'proof', eid]);
  assert.equal(f.state.credentials, 1); assert.equal(f.state.codes, 1);
  assertNoSecrets(r, f.proof);
});

test('real HTTPS failures retain only public progress, stop the chain and never retry', { timeout: 120000 }, async t => {
  const owned = mkdtempSync(join(root, '.tmp-a-live-chain-faults-'));
  let server, fault, f, issuedProof;
  let calls, prompts;
  const timers = new Set();
  const later = fn => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, 40); timers.add(timer); };
  try {
    const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
    const generated = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=a-live.test',
      '-addext', 'subjectAltName=DNS:a-live.test', '-keyout', join(owned, 'key.pem'), '-out', join(owned, 'ca.pem')], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(generated.status, 0, 'existing OpenSSL fault-test certificate generation failed');
    const ca = readFileSync(join(owned, 'ca.pem'));
    server = https.createServer({ key: readFileSync(join(owned, 'key.pem')), cert: ca }, (req, res) => {
      const stage = req.url.endsWith('/ready') ? 'readiness' : req.url.endsWith('/login') ? 'real_login'
        : req.url.endsWith('/proof') ? 'human_totp_proof' : req.headers['x-strong-auth-proof'] ? 'plaintext_download'
          : req.headers.authorization ? 'missing_proof_denied' : 'anonymous_denied';
      calls.push(stage);
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        let body;
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined; }
        finally { for (const chunk of chunks) chunk.fill(0); }
        if (fault.stage === stage && fault.mode === 'no_headers') { req.socket.destroy(); return; }
        if (fault.stage === stage && fault.mode === 'timeout_no_headers') return;
        if (fault.stage === stage && fault.mode === 'invalid_json') { res.writeHead(200); res.end('{PRIVATE-RESPONSE-DETAIL'); return; }
        const reply = f.reply({ path: req.url, headers: { Authorization: req.headers.authorization, 'X-Strong-Auth-Proof': req.headers['x-strong-auth-proof'] } });
        if (stage === 'human_totp_proof') {
          const p = JSON.parse(Buffer.from(f.proof, 'base64')); p.payload.idempotency_key = body.idempotency_key;
          issuedProof = Buffer.from(JSON.stringify(p)).toString('base64'); reply.json.header_value = issuedProof;
        }
        if (stage === 'plaintext_download' && fault.stage === stage) {
          const headers = { ...reply.headers };
          if (fault.mode === 'chunked_short') delete headers['content-length'];
          if (fault.mode === 'overflow') headers['content-length'] = String(content.length + 1);
          if (fault.mode === 'invalid_operation') headers['x-system-backup-operation-id'] = 'PRIVATE-OPERATION-HEADER';
          res.writeHead(200, headers); res.flushHeaders();
          if (fault.mode === 'timeout_headers') return;
          if (fault.mode === 'wrong_hash') { res.end(Buffer.alloc(content.length, 'x')); return; }
          if (fault.mode === 'overflow') { res.end(Buffer.concat([content, Buffer.from('x')])); return; }
          if (fault.mode === 'short_body' || fault.mode === 'chunked_short') { res.end(content.subarray(0, 4)); return; }
          res.write(content.subarray(0, 4));
          if (fault.mode === 'timeout_body') return;
          later(() => res.destroy()); return;
        }
        res.writeHead(reply.status, reply.headers); res.end(reply.json ? JSON.stringify(reply.json) : undefined);
      });
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const reset = value => {
      fault = value; f = fixture(); issuedProof = ''; calls = []; prompts = { credentials: 0, code: 0 };
      for (const target of [f.plan.login, f.plan.download]) Object.assign(target, {
        origin: 'https://127.0.0.1:' + server.address().port, ca_file: join(owned, 'ca.pem'), ca_sha256: digest(ca) });
    };
    const check = (receipt, stage, { operation = stage === 'plaintext_download', bytes, failureCode } = {}) => {
      assert.equal(receipt.status, 'BLOCKED'); assert.equal(receipt.audit_verified, false); assert.equal(receipt.blocked_stage, stage);
      assert.ok(receipt.finished_at); assert.equal(receipt.plaintext_written, false); assert.equal(receipt.secrets_written, false);
      assert.equal(receipt.operation_public_id, operation ? opid : undefined);
      assert.match(receipt.failure_code, /^(timeout|request_error|response_error|response_aborted|response_incomplete|body_too_large|invalid_response|validation_failed)$/);
      if (failureCode) assert.equal(receipt.failure_code, failureCode);
      if (bytes !== undefined) assert.equal(receipt.partial_received_bytes ?? receipt.received_bytes, bytes);
      assert.equal(Object.hasOwn(receipt, 'received_sha256'), false);
      assert.equal(calls.filter(s => s === 'real_login').length, stage === 'readiness' ? 0 : 1);
      assert.equal(calls.filter(s => s === 'human_totp_proof').length, ['human_totp_proof', 'plaintext_download'].includes(stage) ? 1 : 0);
      assert.equal(calls.filter(s => s === 'plaintext_download').length, stage === 'plaintext_download' ? 1 : 0);
      assertNoSecrets(receipt, issuedProof || f.proof);
      const text = JSON.stringify(receipt);
      for (const secret of ['PRIVATE-RESPONSE-DETAIL', 'PRIVATE-OPERATION-HEADER', content.subarray(0, 4).toString()]) assert.ok(!text.includes(secret));
    };
    for (const scenario of [
      { mode: 'no_headers', operation: false, bytes: 0 },
      { mode: 'reset_body', bytes: 4 },
      { mode: 'short_body', bytes: 4 },
      { mode: 'chunked_short', bytes: 4, failureCode: 'validation_failed' },
      { mode: 'wrong_hash', bytes: content.length, failureCode: 'validation_failed' },
      { mode: 'overflow', bytes: content.length + 1, failureCode: 'body_too_large' },
      { mode: 'timeout_headers', bytes: 0, failureCode: 'timeout' },
      { mode: 'timeout_body', bytes: 4, failureCode: 'timeout' },
      { mode: 'invalid_operation', operation: false, bytes: 4 },
      { stage: 'readiness', mode: 'timeout_no_headers', bytes: 0, failureCode: 'timeout' },
      { stage: 'real_login', mode: 'timeout_no_headers', bytes: 0, failureCode: 'timeout' },
      { stage: 'human_totp_proof', mode: 'timeout_no_headers', bytes: 0, failureCode: 'timeout' },
      { stage: 'real_login', mode: 'invalid_json', failureCode: 'invalid_response' },
    ]) {
      await t.test((scenario.stage ?? 'plaintext_download') + '/' + scenario.mode, async () => {
        const stage = scenario.stage ?? 'plaintext_download'; reset({ ...scenario, stage });
        const result = await runLiveChain(f.plan, { key: f.deps.key, request: makeLiveTransport(f.plan, { timeoutMs: 2000 }),
          getCredentials: async () => { prompts.credentials++; return { username: 'test-user', password }; }, getCode: async () => { prompts.code++; return code; } });
        check(result, stage, scenario);
        assert.equal(prompts.credentials, stage === 'readiness' ? 0 : 1);
        assert.equal(prompts.code, ['human_totp_proof', 'plaintext_download'].includes(stage) ? 1 : 0);
        // Keep a blocked receipt from being used to create an audit query.
        assert.throws(() => auditQuery(result));
      });
    }
    await t.test('actual CLI persists a blocked receipt at the default 20s deadline without credential retries', { timeout: 40000 }, async () => {
      reset({ stage: 'plaintext_download', mode: 'timeout_body' });
      const planFile = join(owned, 'plan.json'), receiptFile = join(owned, 'blocked.json');
      writeFileSync(planFile, JSON.stringify(f.plan));
      const started = Date.now();
      const cli = await new Promise((done, fail) => {
        const child = spawn(process.execPath, [resolve(root, 'scripts/system-backup-a-live-chain.mjs'), '--plan', planFile, '--receipt', receiptFile], { windowsHide: true, signal: AbortSignal.timeout(35000) });
        let stdout = '', stderr = '', markers = '';
        child.stdin.on('error', fail);
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => {
          stderr += chunk; markers += chunk;
          if (markers.includes('A_LIVE_CHAIN_CREDENTIALS_READY\n')) { markers = markers.replace('A_LIVE_CHAIN_CREDENTIALS_READY\n', ''); child.stdin.write(JSON.stringify({ username: 'test-user', password }) + '\n'); }
          if (markers.includes('A_LIVE_CHAIN_TOTP_READY\n')) { markers = markers.replace('A_LIVE_CHAIN_TOTP_READY\n', ''); child.stdin.end(JSON.stringify({ code }) + '\n'); }
        });
        child.on('error', fail); child.on('close', status => done({ status, stdout, stderr }));
      });
      assert.equal(cli.status, 2); assert.ok(Date.now() - started >= 19000);
      const receipt = JSON.parse(readFileSync(receiptFile));
      check(receipt, 'plaintext_download', { bytes: 4, failureCode: 'timeout' });
      assert.deepEqual(JSON.parse(cli.stdout), receipt);
      assert.equal(cli.stderr, 'A_LIVE_CHAIN_CREDENTIALS_READY\nA_LIVE_CHAIN_TOTP_READY\n');
      assertNoSecrets(cli.stdout + cli.stderr, issuedProof);
      // An old receipt is immutable even after a failed HTTP attempt.
      const before = readFileSync(receiptFile);
      const retry = spawnSync(process.execPath, [resolve(root, 'scripts/system-backup-a-live-chain.mjs'), '--plan', planFile, '--receipt', receiptFile], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
      assert.equal(retry.status, 1); assert.deepEqual(readFileSync(receiptFile), before);
      assert.equal(calls.filter(s => s === 'real_login').length, 1); assert.equal(calls.filter(s => s === 'plaintext_download').length, 1);
    });
    assert.throws(() => makeLiveTransport(f.plan, { timeoutMs: 20001 }));
    assert.throws(() => makeLiveTransport(f.plan, { timeoutMs: 0 }));
  } finally {
    for (const timer of timers) clearTimeout(timer);
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    assert.equal(dirname(resolve(owned)), resolve(root)); assert.ok(basename(owned).startsWith('.tmp-a-live-chain-faults-'));
    rmSync(owned, { recursive: true, force: true }); assert.equal(existsSync(owned), false);
  }
});
test('readiness/anonymous failures do not prompt credentials or proceed to login', async () => {
  for (const index of [0, 1]) {
    const f = fixture(), original = f.deps.request;
    f.deps.request = c => f.state.calls.length === index ? (f.state.calls.push(c), { status: 503, bytes: 0, headers: {} }) : original(c);
    const r = await runLiveChain(f.plan, f.deps);
    assert.equal(r.status, 'BLOCKED'); assert.equal(f.state.credentials, 0); assert.equal(f.state.calls.length, index + 1);
  }
});
test('login, proof and payload mismatches fail once without automatic credential retries', async () => {
  for (const target of ['real_login', 'human_totp_proof', 'plaintext_download']) {
    const f = fixture(); f.deps.request = async c => {
      f.state.calls.push(structuredClone(c)); const r = f.reply(c);
      if (target === 'real_login' && c.path.endsWith('/login')) r.status = 401;
      if (target === 'human_totp_proof' && c.path.endsWith('/proof')) r.json.header_name = 'Unexpected';
      if (target === 'plaintext_download' && c.binary) r.sha256 = '0'.repeat(64);
      return r;
    };
    const r = await runLiveChain(f.plan, f.deps);
    assert.equal(r.status, 'BLOCKED'); assert.equal(r.blocked_stage, target);
    assert.equal(f.state.credentials, 1); assertNoSecrets(r, f.proof);
  }
});
test('public plans reject blanks, plaintext origins, credential URLs, unknown keys, oversized target and unsafe SQL identity', () => {
  assert.throws(() => validateLivePlan(liveChainTemplate()));
  for (const mutate of [p => p.login.origin = 'http://example.invalid', p => p.login.origin = 'https://u:p@example.invalid',
    p => p.password = password, p => p.database = 'db;DROP', p => p.evidence_bytes = 8388609, p => p.user_id = 0,
    p => p.login.origin += '/path', p => p.download.ca_sha256 = 'invalid']) {
    const f = fixture(); mutate(f.plan); assert.throws(() => validateLivePlan(f.plan));
  }
});
test('audit joins require exact operation, original intent/result and nonce rather than HTTP success alone', async () => {
  const f = fixture(), r = await runLiveChain(f.plan, f.deps), a = auditFixture(r);
  const accepted = reviewLiveAudit(r, buffer(a));
  assert.equal(accepted.status, 'LIVE_HTTP_AUDIT_LINKS_PASSED'); assert.equal(accepted.full_recovery_e2e_verified, false);
  for (const mutate of [a => a.server_uuid = 'wrong', a => a.database = 'wrong', a => a.operation.actor_id = '43',
    a => a.operation.request_hash = 'f'.repeat(64), a => a.admission = null, a => a.result.body.outcome = 'interrupted',
    a => a.result.body.bytes_written--, a => a.result_link.result_audit_id++, a => a.intent.user_id++,
    a => a.admission.body.session_sha256 = 'f'.repeat(64), a => a.nonce_count = 0, a => a.nonce_count = 2,
    a => a.result.body.claim_sha256 = 'f'.repeat(64), a => a.intent.body.range_present = true]) {
    const changed = structuredClone(a); mutate(changed); assert.throws(() => reviewLiveAudit(r, buffer(changed)));
  }
  assert.throws(() => reviewLiveAudit(r, Buffer.from(JSON.stringify(a) + '\n' + JSON.stringify(a))));
  assertNoSecrets(accepted, f.proof);
});

test('Windows final CRLF is removed from transport bytes and the sanitized Bash payload parses', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  // Inspect bytes rather than infer Linux's CR parsing from Git Bash behavior.
  const source = 'printf INVENTORY_COMPLETE\\n\\r\\n';
  const old = spawnSync(bash, ['-c', `printf '${source}' | od -An -t x1`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(old.status, 0); assert.match(old.stdout, /\b0d\b/);
  const fixed = spawnSync(bash, ['-c', `printf '${source}' | tr -d '\\015' | od -An -t x1`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(fixed.status, 0); assert.equal(fixed.stderr, ''); assert.doesNotMatch(fixed.stdout, /\b0d\b/);
  const transport = spawnSync(bash, ['-c', `printf '${source}' | tr -d '\\015' | bash -s -- isolated-test`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(transport.status, 0);
  const syntax = spawnSync(bash, ['-n', resolve(root, 'scripts/system-backup-a-live-chain-inventory.sh')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(syntax.status, 0);
});
test('audit query is one bounded SELECT with no raw authentication material or write statements', async () => {
  const f = fixture(), r = await runLiveChain(f.plan, f.deps), sql = auditQuery(r);
  assert.ok(sql.startsWith('SELECT JSON_OBJECT(')); assert.ok(sql.endsWith('LIMIT 2;\n'));
  assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|GRANT|DROP)\b/.test(sql));
  for (const s of [password, token, f.proof]) assert.ok(!sql.includes(s));
  assert.throws(() => auditQuery({ ...r, operation_public_id: "sop_';DROP" }));
  assert.throws(() => auditQuery({ ...r, status: 'BLOCKED' }));
});

test('actual inventory shell uses only public metadata reads and reports an expired lab CA as a blocker', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const fakeTools = `
kubectl() {
  case " $* " in *" get secret "*|*" exec "*|*" apply "*|*" delete "*) return 66;; esac
  case " $* " in *" get "*|*" config current-context "*) ;; *) return 67;; esac
  printf 'PUBLIC_METADATA_ONLY\\n'
}
openssl() {
  case " $* " in *" x509 "*) ;; *) return 68;; esac
  cat >/dev/null
  case " $* " in *" -checkend 0 "*) return 1;; esac
  printf 'PUBLIC_CA_DATES_ONLY\\n'
}
`;
  const script = readFileSync(resolve(root, 'scripts/system-backup-a-live-chain-inventory.sh'), 'utf8').replace(/\r/g, '');
  const result = spawnSync(bash, ['-s', '--', 'sbk-provider-test'], { input: fakeTools + script, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('BLOCKED lab_ca_expired_or_invalid=true'));
  assert.ok(result.stdout.includes('INVENTORY_COMPLETE live_chain_verified=false'));
});

test('database observer binds namespace/Pod UID, issues SELECT metadata only and rejects drift before exec', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const fake = `set -eu
a_live_db_ns=isolated-test
a_live_db_ns_uid=namespace-test
a_live_db_pod=mysql-test
a_live_db_pod_uid=pod-test
a_live_db_name=isolated_db
kubectl() {
  case " $* " in
    *" get namespace "*) printf namespace-test;;
    *" get pod "*) printf pod-test;;
    *" exec "*)
      payload=$(cat)
      case "$payload" in *INSERT*|*UPDATE*|*DELETE*|*CREATE*|*ALTER*|*GRANT*|*DROP*) return 66;; esac
      printf 'OBSERVER_SELECT_ONLY\\n';;
    *) return 67;;
  esac
}
`;
  const script = readFileSync(resolve(root, 'scripts/system-backup-a-live-chain-db-inventory.sh'), 'utf8').replace(/\r/g, '');
  const run = prefix => spawnSync(bash, ['-s'], { input: prefix + script, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const valid = run(fake); assert.equal(valid.status, 0, valid.stderr); assert.ok(valid.stdout.includes('OBSERVER_SELECT_ONLY'));
  const drifted = run(fake + 'a_live_db_ns_uid=wrong\n');
  assert.notEqual(drifted.status, 0); assert.ok(!drifted.stdout.includes('OBSERVER_SELECT_ONLY'));
});

test('state-only observation binds database UUID, preserves missing-adapter blockers and stops on app UID drift', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const fake = `set -eu
a_live_db_ns=isolated-test
a_live_db_server=server-test
a_live_app_pod=app-test
a_live_app_uid=app-uid
a_live_db_identity() { :; }
a_live_db_read() {
  payload=$(cat)
  case "$payload" in
    'SELECT @@server_uuid;') printf server-test;;
    *INSERT*|*UPDATE*|*DELETE*|*ALTER*|*CREATE*|*GRANT*) return 66;;
    *) printf 'STATE_METADATA_ONLY\\n';;
  esac
}
kubectl() {
  case " $* " in
    *" get pod "*"metadata.uid"*) printf app-uid;;
    *" get pod "*) printf 'APP_IMAGE_METADATA_ONLY\\n';;
    *" exec "*) printf '{"status":"blocked","missing_adapters":["reference:evidence_read"]}\\nBOOTSTRAP_REQUIREMENTS_EXIT=2\\n';;
    *) return 67;;
  esac
}
`;
  const script = readFileSync(resolve(root, 'scripts/system-backup-a-live-chain-state.sh'), 'utf8').replace(/\r/g, '');
  const run = prefix => spawnSync(bash, ['-s'], { input: prefix + script, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const valid = run(fake); assert.equal(valid.status, 0, valid.stderr);
  assert.ok(valid.stdout.includes('BOOTSTRAP_REQUIREMENTS_EXIT=2')); assert.ok(valid.stdout.includes('no_runtime_started=true'));
  const wrongDB = run(fake + 'a_live_db_server=wrong\n'); assert.notEqual(wrongDB.status, 0);
  assert.ok(!wrongDB.stdout.includes('STATE_METADATA_ONLY'));
  const wrongApp = run(fake + 'a_live_app_uid=wrong\n'); assert.notEqual(wrongApp.status, 0);
  assert.ok(!wrongApp.stdout.includes('BOOTSTRAP_REQUIREMENTS_EXIT'));
  const body = script.match(/exec "\$a_live_app_pod" -- sh -c '([\s\S]*?)'\n/)[1];
  for (const enabled of ['true', 'false']) {
    // Do not invoke installed binaries in this local shell branch test.
    const localBody = 'test() { if [ "$1" = -x ]; then return 1; else builtin test "$@"; fi; };\n' + body;
    const env = { ...process.env, SYSTEM_BACKUP_READ_SESSIONS_ENABLED: enabled, SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID: 'PRIVATE-INSTALLATION-NOT-FOR-OUTPUT' };
    const actual = spawnSync(bash, ['-c', localBody], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(actual.status, 0, actual.stderr);
    assert.ok(actual.stdout.includes('LOGIN_SESSION_RECORDER_ENABLED=' + enabled));
    assert.ok(actual.stdout.includes('LOGIN_INSTALLATION_CONFIGURED=true'));
    assert.ok(!actual.stdout.includes(env.SYSTEM_BACKUP_REGISTRATION_INSTALLATION_ID));
  }
});

test('actual HTTPS transport verifies CA/hostname, streams plaintext hash, rejects redirects and oversize', async () => {
  const owned = mkdtempSync(join(root, '.tmp-a-live-chain-tests-'));
  let server;
  try {
    const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
    const generated = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=a-live.test',
      '-addext', 'subjectAltName=DNS:a-live.test', '-keyout', join(owned, 'key.pem'), '-out', join(owned, 'ca.pem')], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(generated.status, 0, 'existing OpenSSL test certificate generation failed');
    const ca = readFileSync(join(owned, 'ca.pem'));
    const f = fixture();
    server = https.createServer({ key: readFileSync(join(owned, 'key.pem')), cert: ca }, (req, res) => {
      if (req.url === '/redirect') { res.writeHead(302, { Location: 'https://example.invalid/' }); res.end('{}'); return; }
      if (req.url === '/json') { res.end('{"valid":true}'); return; }
      if (req.url.startsWith('/api/') || req.url.endsWith('/ready')) {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
          const response = f.reply({ path: req.url, headers: { Authorization: req.headers.authorization, 'X-Strong-Auth-Proof': req.headers['x-strong-auth-proof'] } });
          if (req.url.endsWith('/proof')) {
            const p = JSON.parse(Buffer.from(f.proof, 'base64'));
            p.payload.idempotency_key = body.idempotency_key;
            response.json.header_value = Buffer.from(JSON.stringify(p)).toString('base64');
          }
          res.writeHead(response.status, response.headers);
          res.end(response.json ? JSON.stringify(response.json) : response.status === 200 ? content : undefined);
        });
        return;
      }
      res.writeHead(200, { 'Content-Length': content.length }); res.end(content);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    for (const t of [f.plan.login, f.plan.download]) Object.assign(t, { origin: 'https://127.0.0.1:' + server.address().port, ca_file: join(owned, 'ca.pem'), ca_sha256: digest(ca) });
    const request = makeLiveTransport(f.plan);
    const value = await request({ target: f.plan.download, path: '/binary', binary: true, maxBytes: content.length });
    assert.equal(value.sha256, digest(content)); assert.equal(value.bytes, content.length); assert.ok(!Object.hasOwn(value, 'json'));
    assert.equal((await request({ target: f.plan.download, path: '/json' })).json.valid, true);
    assert.equal((await request({ target: f.plan.download, path: '/redirect' })).status, 302);
    await assert.rejects(request({ target: f.plan.download, path: '/binary', binary: true, maxBytes: 1 }));
    // Execute the actual CLI, including both private stdin prompts, against the
    // local TLS server. It must persist only its closed public receipt.
    const planFile = join(owned, 'plan.json'), receiptFile = join(owned, 'receipt.json');
    writeFileSync(planFile, JSON.stringify(f.plan));
    const script = resolve(root, 'scripts/system-backup-a-live-chain.mjs');
    const cli = await new Promise((done, fail) => {
      const child = spawn(process.execPath, [script, '--plan', planFile, '--receipt', receiptFile], { windowsHide: true, signal: AbortSignal.timeout(30000) });
      let stdout = '', stderr = '', prompts = '';
      child.stdout.on('data', c => { stdout += c; });
      child.stderr.on('data', c => {
        stderr += c; prompts += c;
        if (prompts.includes('A_LIVE_CHAIN_CREDENTIALS_READY\n')) {
          prompts = prompts.replace('A_LIVE_CHAIN_CREDENTIALS_READY\n', '');
          child.stdin.write(JSON.stringify({ username: 'test-user', password }) + '\n');
        }
        if (prompts.includes('A_LIVE_CHAIN_TOTP_READY\n')) {
          prompts = prompts.replace('A_LIVE_CHAIN_TOTP_READY\n', '');
          child.stdin.end(JSON.stringify({ code }) + '\n');
        }
      });
      child.on('error', fail); child.on('close', status => done({ status, stdout, stderr }));
    });
    assert.equal(cli.status, 0, cli.stderr);
    const actual = JSON.parse(readFileSync(receiptFile));
    assert.equal(actual.status, 'HTTP_PASSED_AUDIT_PENDING'); assertNoSecrets(actual, f.proof);
    assertNoSecrets(cli.stdout + cli.stderr, f.proof);
    const sqlFile = join(owned, 'audit.sql');
    const query = spawnSync(process.execPath, [script, '--query', receiptFile, '--output', sqlFile], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(query.status, 0); assert.ok(readFileSync(sqlFile, 'utf8').startsWith('SELECT JSON_OBJECT('));
    const auditFile = join(owned, 'audit.json'); writeFileSync(auditFile, JSON.stringify(auditFixture(actual)));
    const review = spawnSync(process.execPath, [script, '--audit', auditFile, '--receipt', receiptFile], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(review.status, 0); assert.equal(JSON.parse(review.stdout).status, 'LIVE_HTTP_AUDIT_LINKS_PASSED');
    const overwrite = spawnSync(process.execPath, [script, '--plan', planFile, '--receipt', receiptFile], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(overwrite.status, 1); assert.deepEqual(JSON.parse(readFileSync(receiptFile)), actual);
    f.plan.download.server_name = 'wrong.example';
    await assert.rejects(request({ target: f.plan.download, path: '/json' }));
    f.plan.download.ca_sha256 = 'f'.repeat(64); assert.throws(() => makeLiveTransport(f.plan));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    assert.equal(dirname(resolve(owned)), resolve(root)); assert.ok(basename(owned).startsWith('.tmp-a-live-chain-tests-'));
    rmSync(owned, { recursive: true, force: true }); assert.equal(existsSync(owned), false);
  }
});
