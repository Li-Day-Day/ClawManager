import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {writerCases,validateWriterTranscript,validateFKTranscript,reviewWriter} from './a-resources-writer-fk-actual-review-20261023.mjs';
const h='a'.repeat(64),ns='sbk-mig-261023140000-abcd',uid='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',probe='TestDResourcesWriteMySQL';
const r={binary_sha256:h,migration_binary_sha256:h,inputs_sha256:h,owner:path.resolve('.tmp-d-index-cache-'+'b'.repeat(32))};
const meta={migrationCount:96,lastMigration:'096',catalogHash:h};
const input=()=>[
 `RUN namespace=${ns} uid=${uid} app_image=image@sha256:${h} mysql_image=mysql:8.4 mysql_version=8.4.8`,
 `PASS pinned-migration-runner binary_sha256=${h} catalog_sha256=${h}`,
 'PASS fresh-migration-replay=001..096 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',
 `=== RUN   ${probe}`,
 '    fixture.go:1: RESOURCES_FIXTURE mysql=8.4.8 migrations=96 tables=44 clone=LIKE foreign_key_proof=no synthetic_registry=yes',
 ...writerCases.flatMap(c=>[`=== RUN   ${probe}/${c}`,`    --- PASS: ${probe}/${c} (0.01s)`]),
 '    fixture.go:2: PASS resources-write-mysql cases=9 tables=9 independent_select_only=yes synthetic_proofs=yes foreign_key_proof=no ddl_freeze_proof=no production=no',
 '    fixture.go:3: CLEANED resources-mysql-owned-database-and-user=yes',
 `--- PASS: ${probe} (1.00s)`,'PASS',
 `PASS d-resources-write-mysql cases=9 binary_sha256=${h} inputs_sha256=${h} synthetic_proofs=yes full_restore=no production=no`,
 `CLEANED namespace=${ns} uid=${uid}`,'CLEANED resources-remote-scratch=yes',`CLEANED resources-local-owner=${r.owner} removed=True`,
].join('\n');
test('nine-case synthetic transcript tests parser only',()=>assert.equal(validateWriterTranscript(input(),r,meta).remote_cases,9));
test('ordinary writer success cannot qualify actual FK tests',()=>assert.throws(()=>validateFKTranscript(input(),r,meta)));
for(const [name,change] of Object.entries({
 'missing lock case':s=>s.split('\n').filter(l=>!l.includes('/empty_primary_range_lock')).join('\n'),
 'wrong case count':s=>s.replaceAll('cases=9','cases=8'),
 'duplicate root':s=>s+'\n--- PASS: '+probe+' (1.00s)',
 'skipped case':s=>s.replace('--- PASS: '+probe+'/late_sql_failure_rollback','--- SKIP: '+probe+'/late_sql_failure_rollback'),
 'root missing':s=>s.replace('--- PASS: '+probe+' (1.00s)\n',''),
 'mixed roots':s=>s+'\n=== RUN   TestAResourcesWriteFKMySQL',
 'missing native PASS':s=>s.replace('\nPASS\n','\n'),
 'wrong binary':s=>s.replace('cases=9 binary_sha256='+h,'cases=9 binary_sha256='+('b'.repeat(64))),
 'UID changed':s=>s.replace('CLEANED namespace='+ns+' uid='+uid,'CLEANED namespace='+ns+' uid='+('b'.repeat(36))),
 'no cleanup':s=>s.replace('CLEANED resources-remote-scratch=yes','CLEANUP_PENDING remote'),
 'truncated log':s=>s.slice(0,s.indexOf('CLEANED namespace=')),
}))test('reject '+name,()=>assert.throws(()=>validateWriterTranscript(change(input()),r,meta)));
test('failed real writer wrapper is not an actual success',()=>assert.throws(()=>reviewWriter('docs/evidence/d-resources-mysql-20261023-133349-3a76dbde.json')));
