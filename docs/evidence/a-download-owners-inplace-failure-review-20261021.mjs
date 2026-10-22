// Read-only classification of the completed ten-pass / one-fail actual run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace, decode, sha256, ownerCases, localStages, loadReviewedOwnerBaseline, canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
const raw=p=>fs.readFileSync(path.join(workspace,p));
const logPath='docs/evidence/a-download-owners-mysql-remote-20261021-134326-f36b8b74.txt';
const sourcePath='docs/evidence/a-download-owners-mysql-remote-source-20261021-134326-f36b8b74.json';
const logBytes=raw(logPath),sourceBytes=raw(sourcePath),log=decode(logBytes),source=JSON.parse(decode(sourceBytes));
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);
assert.equal(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
assert.ok(log.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=${source.files.length}`));
const runs=[...log.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm)];
assert.equal(runs.length,1);const run=runs[0],remote=log.slice(run.index),root='TestASQLTaskDownloadOwnersMySQL';
const local=localStages(log.slice(0,run.index)),baseline=loadReviewedOwnerBaseline(sourceBytes);
for(const stage of local.slice(0,2))assert.deepEqual(stage.names.map(canonicalLocalName).sort(),baseline.baselineEvents.filter(e=>e.Test&&e.Package===stage.package&&e.Action==='pass').map(e=>e.Test).sort());
assert.deepEqual(local.map(s=>s.names.length),[2011,3008,13]);
const passed=[...remote.matchAll(/^\s*--- PASS: TestASQLTaskDownloadOwnersMySQL\/(\S+) /gm)].map(m=>m[1]);
const failed=[...remote.matchAll(/^\s*--- FAIL: TestASQLTaskDownloadOwnersMySQL\/(\S+) /gm)].map(m=>m[1]);
assert.deepEqual(failed,['missing_reference_column']);assert.deepEqual(passed.slice().sort(),ownerCases.filter(n=>n!==failed[0]).sort());
assert.match(remote,/^--- FAIL: TestASQLTaskDownloadOwnersMySQL \(/m);assert.doesNotMatch(remote,/^--- PASS: TestASQLTaskDownloadOwnersMySQL \(/m);
const start=remote.indexOf(`=== RUN   ${root}/missing_reference_column\n`),end=remote.indexOf('=== RUN',start+10);
assert.ok(start>=0);const segment=remote.slice(start,end);
assert.deepEqual([...segment.matchAll(/MySQL error number=(\d+)/g)].map(m=>Number(m[1])),[1846]);
assert.match(segment,/download_task_owner_a_mysql_test\.go:229:/);
for(const [name,table] of [['original_owner_lock','system_backups'],['empty_reference_range','system_backup_dependency_health']]){
  const begin=remote.indexOf(`=== RUN   ${root}/${name}\n`),next=remote.indexOf('=== RUN',begin+10);
  assert.ok(begin>=0);assert.ok(remote.slice(begin,next<0?undefined:next).includes('OBSERVED actual SQL owner/reference lock wait '+table));
}
const databases=[...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)].map(m=>m[1]);
assert.equal(databases.length,11);assert.equal(new Set(databases).size,11);
assert.ok(remote.includes(`CLEANED namespace=${run[1]} uid=${run[2]}`));
for(const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True'])assert.ok(remote.includes(marker));
const owner=log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();
assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
assert.match(remote,/^a_download_owners_mysql_remote_exit=1$/m);assert.match(remote,/Windows PowerShell 脚本结束\n结束时间: \d+/);
assert.doesNotMatch(remote,/^CLEANUP_PENDING/m);assert.ok(!remote.includes('LOCAL_PASS config-writer-frozen-postcheck=yes'));
const record={kind:'a_owner_actual_mysql_inplace_fixture_failure_review',status:'failed_not_accepted',log:logPath,log_sha256:sha256(logBytes),source:sourcePath,source_manifest_sha256:sha256(sourceBytes),source_sha256:source.source_sha256,source_files:source.files.length,local_packages:local.slice(0,2).map(s=>({package:s.package,all:s.names.length})),packaged_seed_checks:13,actual_sql_started:true,mysql_version:run[5],namespace:run[1],namespace_uid:run[2],passed_cases:passed,failed_cases:failed,observed_error:1846,failed_fixture_source_line:229,diagnosis:'Missing-column fixture rename failed before production Preview; algorithm compatibility must be fixed and all eleven actual cases rerun',actual_lock_probes_passed:true,cleaned_databases:databases,remote_cleanup:'reported_in_original_log_not_independently_reconnected',local_owner:owner,local_owner_independently_absent:true,final_exit:1,actual_suite_accepted:false,production_approved:false,dependencies_installed:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-download-owners-inplace-failure-reviewed-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(JSON.parse(decode(raw(output))),record);
else {assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,passed:10,failed:1,fixture_error:1846,actual_suite_accepted:false,local_owner_absent:true}));
