import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const stem='docs/evidence/d-drill-http-source-20261023-r1.json';
const source=json(stem),result=json(stem+'.result.json');
assert.equal(result.kind,'d_drill_detail_validation.v1');assert.equal(result.child_exit,0);assert.equal(result.source_postcheck,true);
assert.equal(result.error,null);assert.equal(result.remote_requested,false);assert.equal(result.actual_mysql_results_accepted,false);
assert.equal(result.dependencies_installed,false);assert.equal(result.cleanup.removed,true);assert.equal(result.cleanup.test_build_artifacts_removed,true);
assert.equal(path.dirname(result.cleanup.owner),root);assert.match(path.basename(result.cleanup.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(result.cleanup.owner),false);
assert.equal(sha(source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),source.source_sha256);assert.equal(result.source_sha256,source.source_sha256);
const selected=p=>/^backend\/internal\/systembackup(read|security|contract)\//.test(p)||/^contracts\/system-backup\/v12\//.test(p)||/^backend\/cmd\/server\/system_backup_read_(live|cursor_key|drill_history_mysql_test)/.test(p)||['backend/go.mod','backend/go.sum','scripts/system-backup-d-drill-detail-validation.ps1','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-a-admin-read-phase.sh'].includes(p);
const wrapper='scripts/system-backup-d-drill-detail-validation.ps1';
const pins=source.files.filter(p=>selected(p.path)&&p.path!==wrapper);assert.ok(pins.length>0);
for(const p of pins)assert.deepEqual(pin(p.path),p,'selected source changed '+p.path);
// Review the unchanged Go projection/HTTP probe and its original preparation.
// A later wrapper's logging changes do not inherit the old execution evidence.
const runnerMetadataDelta={tested:source.files.find(p=>p.path===wrapper),current:pin(wrapper),current_wrapper_execution_accepted:false};
for(const p of ['backend/internal/systembackupread/drill_detail.go','backend/internal/systembackupread/drill_detail_test.go','backend/cmd/server/system_backup_read_drill_history_mysql_test.go'])assert.ok(pins.some(f=>f.path===p));
const logPath='docs/evidence/d-drill-http-preparation-20261023-r1.txt',log=read(logPath).toString('utf8');
assert.doesNotMatch(log,/^FAIL(?:\s|$)|^\s*--- (?:FAIL|SKIP):|^panic:|CLEANUP_PENDING/m);
assert.match(log,/^ok\s+clawreef\/internal\/systembackupread\s+[0-9.]+s$/m);
assert.match(log,/^ok\s+clawreef\/internal\/systembackupsecurity\s+[0-9.]+s$/m);
assert.match(log,/^--- PASS: TestDDrillDetailHTTPSeed \([0-9.]+s\)$/m);
assert.match(log,/PASS drill-history-http-seed synthetic_cases=19/);
for(const s of ['LOCAL_PASS a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes','LOCAL_PASS pinned-migration-runner-compiled=yes','LOCAL_PASS d-admin-read-http-probe-compiled=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS drill-detail-frozen-postcheck=yes freeze-only=False dependencies-installed=no remote-requested=False','LOCAL_CLEANUP drill-detail-source-owned='+result.cleanup.owner+' removed=True'])assert.ok(log.includes(s));
const code=read('backend/internal/systembackupread/drill_detail.go').toString('utf8');
for(const s of ['readTaskCheckEvidenceControlInTransaction','version != header.RowVersion','check.AttemptNumber != current','schema != "system-backup-evidence.v1"','owner != header.PublicID','hash != refs[id].hash','FailureMessage: nil','Index: nil, Marker: nil'])assert.ok(code.includes(s));
const report={kind:'a_drill_detail_local_security_review.v1',decision:'historical_projection_and_local_preparation_reviewed_actual_HTTP_MySQL_pending',selected_input_files:pins.length,selected_current_pins_match:true,checks:['original_single_RR_authorization_and_final_recheck','historical_source_checksums_and_target_hash_only','attempt_specific_checks_counts_and_progress','task_bound_report_owner_hash_cutoff','missing_or_ambiguous_fields_remain_null','no_report_body_or_target_configuration_leak','no_current_provider_or_cleanup_authority_from_history'],synthetic_seed_cases:19,actual_mysql:false,B_target_accepted:false,physical_cleanup_accepted:false,download_authority_accepted:false,formal_registry_approved:false,production_approved:false,dependencies_installed:false,cleanup_verified:true,inputs:pins,evidence:[stem,stem+'.result.json',logPath,'docs/evidence/a-drill-detail-local-review-20261023.mjs'].map(pin)};
report.runner_metadata_delta=runnerMetadataDelta;
const out='docs/evidence/a-drill-detail-locally-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(out),report);}
console.log('A_DRILL_LOCAL_REVIEW synthetic_seed_cases=19 actual_mysql=no production=no');
