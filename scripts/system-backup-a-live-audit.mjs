#!/usr/bin/env node
// Public request preparation and bounded collector envelope review. No DSN input.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDownloadInput } from './system-backup-a-download-deployment.mjs';
import { auditQuery, digest, liveAuditSQL, readLiveFile, reviewLiveAudit } from './system-backup-a-live-chain.mjs';
import { capacityTimeNS } from './system-backup-a-capacity-material-review.mjs';

const fields = (o, keys) => { assert.ok(o && typeof o === 'object' && !Array.isArray(o)); assert.deepEqual(Object.keys(o).sort(), [...keys].sort()); };
const hash = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export function prepareAuditRequest(receiptRaw, observer) {
  const receipt = decodeDownloadInput(receiptRaw);
  auditQuery(receipt);
  assert.match(receipt.server_uuid, uuid); assert.match(receipt.database, /^[A-Za-z0-9_]{1,64}$/);
  fields(observer, ['current_user', 'current_role', 'transport']);
  assert.match(observer.current_user, /^[^@\x00\r\n]{1,128}@[^@\x00\r\n]{1,127}$/);
  assert.ok(typeof observer.current_role === 'string' && observer.current_role.length > 0 && Buffer.byteLength(observer.current_role) <= 1024 && !/[\x00\r\n]/.test(observer.current_role));
  fields(observer.transport, ['mode', 'server_name', 'ca_sha256']);
  const t = observer.transport;
  if (t.mode === 'unix') { assert.equal(t.server_name, ''); assert.equal(t.ca_sha256, ''); }
  else { assert.equal(t.mode, 'tls'); assert.match(t.server_name, /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/); assert.match(t.ca_sha256, hash); }
  return { schema_version: 'a_live_download_audit_request.v1', server_uuid: receipt.server_uuid, database: receipt.database,
    current_user: observer.current_user, current_role: observer.current_role, transport: structuredClone(t),
    operation_public_id: receipt.operation_public_id, http_receipt_sha256: digest(receiptRaw) };
}
export function reviewAuditCollection(receiptRaw, requestRaw, collectionRaw) {
  assert.ok(receiptRaw.length <= 65536 && requestRaw.length <= 65536 && collectionRaw.length <= 100000);
  const r = decodeDownloadInput(requestRaw), c = decodeDownloadInput(collectionRaw);
  const expected = prepareAuditRequest(receiptRaw, { current_user: r.current_user, current_role: r.current_role, transport: r.transport });
  assert.deepEqual(r, expected);
  fields(c, ['schema_version', 'request_sha256', 'http_receipt_sha256', 'query_sha256', 'operation_public_id', 'identity_before', 'identity_after', 'readonly', 'rolled_back', 'audit_export_sha256', 'audit_export_base64']);
  assert.equal(c.schema_version, 'a_live_download_audit_collection.v1');
  assert.equal(c.request_sha256, digest(requestRaw)); assert.equal(c.http_receipt_sha256, digest(receiptRaw));
  assert.equal(c.query_sha256, digest(liveAuditSQL)); assert.equal(c.operation_public_id, r.operation_public_id);
  assert.equal(c.readonly, true); assert.equal(c.rolled_back, true);
  for (const v of [c.identity_before, c.identity_after]) {
    fields(v, ['server_uuid', 'database', 'current_user', 'current_role', 'connection_id', 'sql_time']);
    for (const key of ['server_uuid', 'database', 'current_user', 'current_role']) assert.equal(v[key], r[key]);
    assert.ok(Number.isSafeInteger(v.connection_id) && v.connection_id > 0);
    capacityTimeNS(v.sql_time);
  }
  assert.equal(c.identity_before.connection_id, c.identity_after.connection_id);
  assert.ok(capacityTimeNS(c.identity_before.sql_time) <= capacityTimeNS(c.identity_after.sql_time));
  assert.ok(typeof c.audit_export_base64 === 'string' && c.audit_export_base64.length <= 87384);
  const raw = Buffer.from(c.audit_export_base64, 'base64');
  assert.ok(raw.length > 0 && raw.length <= 65536); assert.equal(raw.toString('base64'), c.audit_export_base64);
  assert.equal(digest(raw), c.audit_export_sha256);
  const review = reviewLiveAudit(decodeDownloadInput(receiptRaw), raw);
  assert.ok(capacityTimeNS(decodeDownloadInput(raw).result.body.result_at) <= capacityTimeNS(c.identity_after.sql_time));
  return { raw, review: { ...review, provenance: 'operator_collector_envelope_requires_binary_and_transport_source_review',
    collection_sha256: digest(collectionRaw), request_sha256: digest(requestRaw), original_http_receipt_sha256: digest(receiptRaw), observer_identity_bound: true } };
}
export function liveAuditCLI(args = process.argv.slice(2)) {
  const opts = {};
  assert.ok(args.length > 0 && args.length % 2 === 0);
  for (let i = 0; i < args.length; i += 2) { assert.ok(!Object.hasOwn(opts, args[i])); opts[args[i]] = args[i + 1]; }
  if (opts['--request']) {
    fields(opts, ['--request', '--observer', '--output']);
    const r = prepareAuditRequest(readLiveFile(opts['--request'], 65536), decodeDownloadInput(readLiveFile(opts['--observer'], 65536)));
    writeFileSync(resolve(opts['--output']), JSON.stringify(r) + '\n', { flag: 'wx' }); return;
  }
  fields(opts, ['--collection', '--receipt', '--request-file', '--output']);
  const { raw, review } = reviewAuditCollection(readLiveFile(opts['--receipt'], 65536), readLiveFile(opts['--request-file'], 65536), readLiveFile(opts['--collection'], 100000));
  writeFileSync(resolve(opts['--output']), raw, { flag: 'wx' });
  console.log(JSON.stringify(review, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { liveAuditCLI(); } catch { console.error('live audit collection input or review rejected; no passing review'); process.exitCode = 1; }
}
