// D owns these shared-gate fixture defects. No SQL/SSH or task messaging.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace,decode,sha256,canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
const raw=p=>fs.readFileSync(path.join(workspace,p));
const read=p=>decode(raw(p));
const logPath='docs/evidence/a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt';
const sourcePath='docs/evidence/a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json';
const fixedPrefix='docs/evidence/d-download-gc-producer-20261021-r5';
const fixedReceipt='docs/evidence/d-download-gc-producer-preparation-20261021.json';
const output='docs/evidence/d-download-owner-shared-gate-failure-20261021-100630.json';
const exact=(a,b)=>assert.deepEqual(a.slice().sort(),b.slice().sort());
const names=(t,re)=>[...t.matchAll(re)].map(m=>canonicalLocalName(m[1]));
const log=read(logPath),source=JSON.parse(read(sourcePath)),fixed=JSON.parse(read(fixedReceipt));
assert.equal(sha256(raw(logPath)),'e60ea7fc55e28b215e5c972feed2bc089a7fa5b1c32ecd49265393bc593f6a5c');
assert.equal(sha256(raw(sourcePath)),'d5b9a1c8952f26f0fc0d52468168dc17b833dc5efa7508acf4815e06f85e0e15');
assert.equal(source.source_sha256,'35c60b8d6eab12abee02d6949d6f9110c2952ef2c469895af533300ae4849390');assert.equal(source.files.length,1457);
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
assert.equal(new Set(source.files.map(f=>f.path)).size,1457);assert.equal(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
const one=re=>{const m=[...log.matchAll(re)];assert.equal(m.length,1,String(re));return m[0];};
const binding=one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm);assert.equal(binding[1],source.source_sha256);assert.equal(Number(binding[2]),1457);
const failed=['TestDownloadRetentionGCProducerReceiptFacts','TestDownloadRetentionGCProducerReceiptFacts/null_version','TestDownloadRetentionGCProducerReceiptFacts/no_version','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_eligible_run','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference'];
exact(names(log,/^\s*--- FAIL: (\S+) /gm),failed);assert.doesNotMatch(log,/^\s*--- SKIP:|^panic:|CLEANUP_PENDING/m);
assert.equal([...log.matchAll(/download_retention_gc_producer_test\.go:291: invalid character 'o' looking for beginning of value/g)].length,2);
assert.match(log,/concrete original producer guard not composed internal_error \[\]/);assert.equal([...log.matchAll(/late C1 facts did not roll back whole group internal_error \[\]/g)].length,2);
const fixedSource=JSON.parse(read(fixedPrefix+'-source.json'));assert.equal(fixed.full.exit,0);assert.equal(fixed.full.default_vet,true);assert.equal(fixed.source.sha256,fixedSource.source_sha256);
exact(source.files.map(f=>f.path),fixedSource.files.map(f=>f.path));
const changed=source.files.filter(f=>!fixedSource.files.some(g=>f.path===g.path&&f.sha256===g.sha256&&f.size===g.size)).map(f=>f.path);exact(changed,['backend/internal/systembackupevidence/download_retention_gc_producer_test.go']);
const events=read(fixedPrefix+'.jsonl').trim().split('\n').map(JSON.parse);assert.ok(!events.some(e=>['fail','skip','build-fail'].includes(e.Action)));assert.equal(sha256(raw(fixedPrefix+'.jsonl')),fixed.full.events_sha256);
for(const name of failed)assert.equal(events.filter(e=>e.Test===name&&e.Action==='pass').length,1);
const summaries=[...log.matchAll(/^(ok|FAIL)\s+(clawreef\/\S+)\s+([0-9.]+s)$/gm)];assert.equal(summaries.length,2);const stages=[];let start=0;
for(const [n,m] of summaries.entries()){
  assert.equal(m[1],n===0?'ok':'FAIL');assert.equal(m[2],n===0?'clawreef/internal/systembackupsecurity':'clawreef/internal/systembackupevidence');
  const segment=log.slice(start,m.index);start=m.index+m[0].length;
  const ran=names(segment,/^=== RUN\s+(\S+)\s*$/gm),passed=names(segment,/^\s*--- PASS: (\S+) /gm),denied=names(segment,/^\s*--- FAIL: (\S+) /gm);
  assert.equal(new Set(ran).size,ran.length);exact(ran,[...passed,...denied]);exact(denied,n===0?[]:failed);exact(ran,events.filter(e=>e.Package===m[2]&&e.Test&&e.Action==='pass').map(e=>e.Test));
  stages.push({package:m[2],main:ran.filter(s=>!s.includes('/')).length,all:ran.length,passed:passed.length,failed:denied.length,elapsed:m[3],status:m[1]});
}
assert.equal(stages[0].all,2011);assert.equal(stages[1].all,2928);
assert.doesNotMatch(log,/^RUN namespace=|^PASS fresh-migration-replay|^PASS a-download-owners-mysql|^=== RUN\s+TestASQLTaskDownloadOwnersMySQL(?:\/|$)/m);assert.match(log,/remote validation has not started; dependencies will not be installed/);
const owner=one(/^LOCAL_OWNER config-writer-source=(.+)$/gm)[1].trim();assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(log.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);assert.ok(log.includes('CLEANED local-registration-build-cache=True'));
assert.equal(one(/^a_download_owners_mysql_remote_exit=(-?\d+)$/gm)[1],'1');
const report={kind:'d_shared_gate_failure_independent_review',recorded_at:new Date().toISOString(),status:'local_d_fixture_defects_fixed_in_reviewed_source',log:logPath,log_sha256:sha256(raw(logPath)),source_manifest:sourcePath,source_manifest_sha256:sha256(raw(sourcePath)),source_sha256:source.source_sha256,source_files:1457,stages,failed_tests:failed,failed_leaves:5,defect_owner:'D',causes:['C1 typed frame was parsed as JSON in two invalid-version fixtures','paired historical aging used a fractional delta incompatible with audit_logs DATETIME(0)'],remote_started:false,actual_sql_cases:0,outer_exit:1,fixed:{receipt:fixedReceipt,receipt_sha256:sha256(raw(fixedReceipt)),source_sha256:fixedSource.source_sha256,changed_files:changed,production_and_gate_inputs_unchanged:true,full_main:754,full_all:6242,default_vet:true,exit:0,all_failed_tests_now_pass:true},cleanup:{local_source:owner,independently_absent:true,local_build_cache_reported:true},boundaries:{a_eleven_actual_cases_not_accepted_by_this_review:true,prior_a_actual_failure_preserved:true,d_producer_eighteen_actual_acceptance_unchanged:true,d_gc_task_eighteen_still_pending:true,dependencies_installed:false,remote_executed_by_reviewer:false,other_threads_messaged:false,production_approved:false}};
if(process.argv.includes('--check')){const saved=JSON.parse(read(output));report.recorded_at=saved.recorded_at;assert.deepEqual(saved,report);console.log('PASS shared A gate: five D fixture leaves fixed by reviewed same production source; original exit one preserved, remote not started');}
else{assert.equal(fs.existsSync(path.join(workspace,output)),false);fs.writeFileSync(path.join(workspace,output),JSON.stringify(report,null,2)+'\n');console.log(output);}
