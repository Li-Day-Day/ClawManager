import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewAuditCollection } from './system-backup-a-live-audit.mjs';

// Startup-only evidence never satisfies the 17-case SQL reviewer below.
export function reviewMySQLStartupTranscript(text) {
  assert.ok(Buffer.byteLength(text)>0&&Buffer.byteLength(text)<=2000000);
  assert.ok(!/A_AUDIT_SQL_PASS|A_AUDIT_SAMPLE|TestAuditCollectorMySQL|absent=unverified|--- FAIL:|^FAIL\s*$|^panic:/m.test(text));
  const runs=[...text.matchAll(/^A_AUDIT_RUN namespace=(aaudit-[0-9]{14}-[a-f0-9]{8}) uid=([a-f0-9-]{36}) image=\S+ binary_sha256=(0{64})$/gm)];
  assert.equal(runs.length,1);
  const [,namespace,namespace_uid,binary_sha256]=runs[0];
  const markers=[
    'A_AUDIT_STARTUP_PASS readiness=yes image_pull_policy=Never sql_cases=not_run migrations=not_run',
    `A_AUDIT_CLEANUP namespace=${namespace} uid=${namespace_uid} absent=yes`,
    'A_AUDIT_UPLOAD_CLEANUP absent=yes','A_AUDIT_REMOTE_EXIT=0',
  ];
  const lines=text.split(/\r?\n/);
  let previous=-1;
  for(const marker of markers){assert.equal(lines.filter(line=>line===marker).length,1);const at=lines.indexOf(marker);assert.ok(at>previous);previous=at;}
  for(const prefix of ['A_AUDIT_CLEANUP ','A_AUDIT_UPLOAD_CLEANUP ','A_AUDIT_REMOTE_EXIT='])assert.equal(lines.filter(line=>line.startsWith(prefix)).length,1);
  return {kind:'a_live_audit_mysql_startup_review.v1',status:'isolated_mysql_startup_passed',namespace,namespace_uid,binary_sha256,cleanup_verified:true,sql_cases_verified:false};
}

export function reviewMySQLTranscript(text) {
  assert.ok(Buffer.byteLength(text) <= 2000000);
  assert.ok(!/--- FAIL:|^FAIL\s*$|^panic:/m.test(text));
  const names = ['success','wrong_server','wrong_database','wrong_user','wrong_role','wrong_operation','permission_denied','observer_cannot_write','server_enforces_readonly','missing_join','malformed_body','unknown_body','duplicate_rows','broken_link','broken_nonce','broken_digest','final_success'];
  assert.equal([...text.matchAll(/^\s*--- PASS: TestAuditCollectorMySQL\/[^\s]+ \(/gm)].length,names.length);
  for (const name of names) {
    const matches = [...text.matchAll(new RegExp(`^\\s*--- PASS: TestAuditCollectorMySQL/${name} \\(`,'gm'))];
    assert.equal(matches.length,1,`missing or repeated case: ${name}`);
  }
  assert.match(text,/^--- PASS: TestAuditCollectorMySQL \(/m);
  assert.match(text,/^A_AUDIT_SQL_PASS transport=unix fixture=synthetic_selected_columns http=synthetic migrations=not_run production_approval=no$/m);
  const run = [...text.matchAll(/^A_AUDIT_RUN namespace=(aaudit-[0-9]{14}-[a-f0-9]{8}) uid=([a-f0-9-]{36}) image=\S+ binary_sha256=([a-f0-9]{64})$/gm)];
  assert.equal(run.length,1);
  assert.ok(text.includes(`A_AUDIT_CLEANUP namespace=${run[0][1]} uid=${run[0][2]} absent=yes`));
  assert.match(text,/^A_AUDIT_REMOTE_EXIT=0$/m);
  assert.match(text,/^A_AUDIT_UPLOAD_CLEANUP absent=yes$/m);
  const samples = [...text.matchAll(/A_AUDIT_SAMPLE (\{[^\r\n]+\})/g)].map(m=>JSON.parse(m[1]));
  assert.equal(samples.length,5);
  const expected = new Map([['success',true],['broken_link',false],['broken_nonce',false],['broken_digest',false],['final_success',true]]);
  for(const s of samples) {
    const name=s.case.replace('TestAuditCollectorMySQL/','');
    assert.ok(expected.has(name)); assert.equal(s.expect_review,expected.get(name)); expected.delete(name);
    const args=[s.receipt,s.request,s.collection].map(v=>Buffer.from(JSON.stringify(v)));
    // Go marshals original requests in sorted map/struct order. JSON.parse then
    // JSON.stringify preserves that order, including the exact bound raw bytes.
    if(s.expect_review) assert.equal(reviewAuditCollection(...args).review.status,'LIVE_HTTP_AUDIT_LINKS_PASSED');
    else assert.throws(()=>reviewAuditCollection(...args));
  }
  assert.equal(expected.size,0);
  return {kind:'a_live_audit_collector_mysql_review.v1',status:'isolated_mysql_collector_passed',cases:names.length,namespace:run[0][1],namespace_uid:run[0][2],binary_sha256:run[0][3],cleanup_verified:true,transport:'unix',fixture:'synthetic_selected_columns',real_http_verified:false,application_migrations_verified:false,tls_verified:false,production_approved:false};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const startup=process.argv[2]==='--startup';assert.equal(process.argv.length,startup?4:3);
    console.log(JSON.stringify((startup?reviewMySQLStartupTranscript:reviewMySQLTranscript)(readFileSync(process.argv[startup?3:2],'utf8'))));
  }
  catch { console.error('isolated MySQL collector receipt rejected'); process.exitCode=1; }
}
