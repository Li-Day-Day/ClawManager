import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { digest, liveAuditSQL, auditQuery, reviewLiveAudit } from './system-backup-a-live-chain.mjs';
import { liveAuditCLI, prepareAuditRequest, reviewAuditCollection } from './system-backup-a-live-audit.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const encode = v => Buffer.from(JSON.stringify(v));
function fixture() {
  const raw = readFileSync(new URL('../backend/cmd/system-backup-audit-collect/testdata/audit.json', import.meta.url));
  const a = JSON.parse(raw), o = a.operation;
  const receipt = { status: 'HTTP_PASSED_AUDIT_PENDING', server_uuid: a.server_uuid, database: a.database, operation_public_id: o.public_id,
    evidence_id: o.evidence_id, installation_id: o.installation_id, user_id: 42, idempotency_key: o.idempotency_key, request_hash: o.request_hash,
    subject_sha256: a.admission.body.subject_sha256, session_sha256: a.admission.body.session_sha256, expected_bytes: 17, received_bytes: 17 };
  const receiptRaw = encode(receipt);
  const observer = { current_user: 'observer@localhost', current_role: 'NONE', transport: { mode: 'unix', server_name: '', ca_sha256: '' } };
  const request = prepareAuditRequest(receiptRaw, observer), requestRaw = encode(request);
  const identity = { server_uuid: a.server_uuid, database: a.database, current_user: observer.current_user, current_role: observer.current_role, connection_id: 17, sql_time: '2026-10-21T08:00:03Z' };
  const collection = { schema_version: 'a_live_download_audit_collection.v1', request_sha256: digest(requestRaw), http_receipt_sha256: digest(receiptRaw),
    query_sha256: digest(liveAuditSQL), operation_public_id: o.public_id, identity_before: { ...identity }, identity_after: { ...identity },
    readonly: true, rolled_back: true, audit_export_sha256: digest(raw), audit_export_base64: raw.toString('base64') };
  return { receipt, receiptRaw, observer, request, requestRaw, collection, raw };
}
test('request binds original HTTP bytes, operation, database, account, role and transport', () => {
  const f = fixture(); assert.equal(f.request.http_receipt_sha256, digest(f.receiptRaw));
  assert.equal(f.request.operation_public_id, f.receipt.operation_public_id);
  const tcp = { ...f.observer, transport: { mode: 'tls', server_name: 'mysql.test', ca_sha256: 'a'.repeat(64) } };
  assert.equal(prepareAuditRequest(f.receiptRaw, tcp).transport.server_name, 'mysql.test');
  for (const observer of [{ ...f.observer, password: 'PRIVATE' }, { ...f.observer, current_user: 'observer' }, { ...f.observer, current_role: '' },
    { ...f.observer, transport: { mode: 'unix', server_name: '', ca_sha256: 'a'.repeat(64) } }, { ...tcp, transport: { ...tcp.transport, mode: 'skip-verify' } }]) {
    assert.throws(() => prepareAuditRequest(f.receiptRaw, observer));
  }
  assert.throws(() => prepareAuditRequest(encode({ ...f.receipt, operation_public_id: "sop_';DROP" }), f.observer));
});
test('collected raw SQL JSON keeps exact bytes and feeds the existing audit reviewer', () => {
  const f = fixture(), reviewed = reviewAuditCollection(f.receiptRaw, f.requestRaw, encode(f.collection));
  assert.deepEqual(reviewed.raw, f.raw); assert.equal(reviewed.review.status, 'LIVE_HTTP_AUDIT_LINKS_PASSED');
  assert.equal(reviewed.review.observer_identity_bound, true); assert.equal(reviewed.review.full_recovery_e2e_verified, false);
  assert.equal(reviewLiveAudit(f.receipt, reviewed.raw).audit_export_sha256, digest(f.raw));
  assert.equal(auditQuery(f.receipt), liveAuditSQL.replace('?', `'${f.receipt.operation_public_id}'`));
});
test('collection rejects identity, role, connection and clock drift', () => {
  const f = fixture();
  for (const change of [v => v.identity_after.server_uuid = 'a'.repeat(36), v => v.identity_after.database = 'other', v => v.identity_after.current_user = 'other@localhost',
    v => v.identity_after.current_role = 'new-role', v => v.identity_after.connection_id++, v => v.identity_after.sql_time = '2026-10-20T08:00:03Z',
    v => { v.identity_before.sql_time = '2026-10-21T08:00:01Z'; v.identity_after.sql_time = '2026-10-21T08:00:01Z'; }]) {
    const v = structuredClone(f.collection); change(v); assert.throws(() => reviewAuditCollection(f.receiptRaw, f.requestRaw, encode(v)));
  }
});
test('collection rejects request, receipt, query, rollback, unknown-member and encoding tampering', () => {
  const f = fixture();
  for (const change of [v => v.request_sha256 = '0'.repeat(64), v => v.http_receipt_sha256 = '0'.repeat(64), v => v.query_sha256 = '0'.repeat(64),
    v => v.readonly = false, v => v.rolled_back = false, v => v.password = 'PRIVATE', v => v.audit_export_sha256 = '0'.repeat(64),
    v => v.audit_export_base64 += '\n', v => v.audit_export_base64 = Buffer.from('{}').toString('base64')]) {
    const v = structuredClone(f.collection); change(v); assert.throws(() => reviewAuditCollection(f.receiptRaw, f.requestRaw, encode(v)));
  }
  assert.throws(() => reviewAuditCollection(Buffer.concat([f.receiptRaw, Buffer.from(' ')]), f.requestRaw, encode(f.collection)));
  assert.throws(() => reviewAuditCollection(f.receiptRaw, encode({ ...f.request, extra: true }), encode(f.collection)));
  assert.throws(() => reviewAuditCollection(f.receiptRaw, f.requestRaw, Buffer.alloc(100001)));
});
test('a self-consistent collector envelope cannot approve broken SQL audit links', () => {
  const f = fixture(), bad = JSON.parse(f.raw); bad.nonce_count = 0;
  const raw = encode(bad), c = { ...f.collection, audit_export_base64: raw.toString('base64'), audit_export_sha256: digest(raw) };
  assert.throws(() => reviewAuditCollection(f.receiptRaw, f.requestRaw, encode(c)));
});
test('CLI never overwrites a request/export and writes no export for a rejected collection', () => {
  const owned = mkdtempSync(join(root, '.tmp-a-live-audit-'));
  try {
    const f = fixture(), receipt = join(owned, 'http.json'), observer = join(owned, 'observer.json'), request = join(owned, 'request.json');
    writeFileSync(receipt, f.receiptRaw); writeFileSync(observer, encode(f.observer));
    liveAuditCLI(['--request', receipt, '--observer', observer, '--output', request]);
    assert.throws(() => liveAuditCLI(['--request', receipt, '--observer', observer, '--output', request]));
    const bad = join(owned, 'bad.json'), out = join(owned, 'export.json'); writeFileSync(bad, '{}');
    assert.throws(() => liveAuditCLI(['--collection', bad, '--receipt', receipt, '--request-file', request, '--output', out]));
    assert.equal(existsSync(out), false);
    const reqRaw = readFileSync(request); f.collection.request_sha256 = digest(reqRaw);
    writeFileSync(bad, encode(f.collection)); writeFileSync(out, 'prior-result');
    assert.throws(() => liveAuditCLI(['--collection', bad, '--receipt', receipt, '--request-file', request, '--output', out]));
    assert.equal(readFileSync(out, 'utf8'), 'prior-result');
    unlinkSync(out);
    const priorLog = console.log; let review;
    try {
      console.log = text => { review = JSON.parse(text); };
      liveAuditCLI(['--collection', bad, '--receipt', receipt, '--request-file', request, '--output', out]);
    } finally { console.log = priorLog; }
    assert.deepEqual(readFileSync(out), f.raw); assert.equal(review.status, 'LIVE_HTTP_AUDIT_LINKS_PASSED');
  } finally {
    assert.equal(dirname(resolve(owned)), resolve(root)); assert.ok(owned.startsWith(join(root, '.tmp-a-live-audit-')));
    rmSync(owned, { recursive: true, force: true });
  }
});
test('both application image recipes build and copy the isolated collector', () => {
  for (const path of ['Dockerfile', 'backend/deployments/docker/Dockerfile']) {
    const source = readFileSync(join(root, path), 'utf8');
    assert.match(source, /go build[^\n]+\.\/cmd\/system-backup-audit-collect/);
    assert.match(source, /COPY --from=[^\n]+system-backup-audit-collect/);
  }
});
