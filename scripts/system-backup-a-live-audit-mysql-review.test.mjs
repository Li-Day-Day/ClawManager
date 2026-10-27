import assert from 'node:assert/strict';
import {transcript} from './system-backup-a-live-audit-mysql-fixture.mjs';
import test from 'node:test';
import {digest} from './system-backup-a-live-chain.mjs';

import {reviewMySQLTranscript,reviewMySQLStartupTranscript} from './system-backup-a-live-audit-mysql-review.mjs';

test('MySQL transcript reviewer requires all 17 cases and reviews actual collection bytes',()=>{
  const reviewed=reviewMySQLTranscript(transcript());
  assert.equal(reviewed.cases,17);assert.equal(reviewed.cleanup_verified,true);assert.equal(reviewed.real_http_verified,false);
});
test('MySQL transcript reviewer refuses partial, duplicated, failed or cleanup-unverified runs',()=>{
  const original=transcript();
  for(const text of [original.replace(/.*wrong_role.*\n/,''),original+'\n    --- PASS: TestAuditCollectorMySQL/success (0s)',original.replace('absent=yes','absent=unverified'),original.replace('A_AUDIT_REMOTE_EXIT=0','A_AUDIT_REMOTE_EXIT=1'),original+'\n--- FAIL: other (0s)',original.replace('"readonly":true','"readonly":false'),original.replace('"expect_review":false','"expect_review":true'),original.replace(/.*A_AUDIT_SQL_PASS.*\n/,'')])assert.throws(()=>reviewMySQLTranscript(text));
});
test('a repaired outer envelope cannot hide SQL JSON or body digest changes',()=>{
  const original=transcript();
  const text=original.replace(/A_AUDIT_SAMPLE (\{[^\n]+\})/,(_,raw)=>{
    const s=JSON.parse(raw),a=JSON.parse(Buffer.from(s.collection.audit_export_base64,'base64'));
    a.admission.body.request_hash='0'.repeat(64);
    const b=Buffer.from(JSON.stringify(a));s.collection.audit_export_base64=b.toString('base64');s.collection.audit_export_sha256=digest(b);
    return 'A_AUDIT_SAMPLE '+JSON.stringify(s);
  });
  assert.throws(()=>reviewMySQLTranscript(text));
});

test('startup review requires readiness, matching identity, zero exit and cleanup; never counts as SQL acceptance',()=>{
  const run='aaudit-20261022000000-12345678',uid='11111111-2222-3333-4444-555555555555';
  const text=[`A_AUDIT_RUN namespace=${run} uid=${uid} image=mysql@sha256:${'a'.repeat(64)} binary_sha256=${'0'.repeat(64)}`,
    'A_AUDIT_STARTUP_PASS readiness=yes image_pull_policy=Never sql_cases=not_run migrations=not_run',
    `A_AUDIT_CLEANUP namespace=${run} uid=${uid} absent=yes`,'A_AUDIT_UPLOAD_CLEANUP absent=yes','A_AUDIT_REMOTE_EXIT=0'].join('\n');
  assert.equal(reviewMySQLStartupTranscript(text).status,'isolated_mysql_startup_passed');
  assert.equal(reviewMySQLStartupTranscript(text).sql_cases_verified,false);
  assert.throws(()=>reviewMySQLTranscript(text));
  assert.throws(()=>reviewMySQLStartupTranscript(transcript()));
  for(const broken of [text.replace('readiness=yes','readiness=no'),text.replace('absent=yes','absent=unverified'),text.replace('REMOTE_EXIT=0','REMOTE_EXIT=1'),text.replace(`uid=${uid} absent=yes`,'uid=99999999-2222-3333-4444-555555555555 absent=yes'),text+'\nA_AUDIT_REMOTE_EXIT=1',text+'\nA_AUDIT_SAMPLE {}',text.replace(/.*A_AUDIT_UPLOAD_CLEANUP.*\n/,'')])assert.throws(()=>reviewMySQLStartupTranscript(broken));
});
