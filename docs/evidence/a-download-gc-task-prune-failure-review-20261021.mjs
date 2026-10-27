// Independently preserve the failed actual GC task run and its schema conflict.
// Read-only: no SQL, schema mutation, build, dependency install or cleanup.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,exact} from './a-frozen-validation-utils-20261021.mjs';
import {localStages,canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
const prefix='docs/evidence/d-download-gc-task-remote-20261021-134319-dfd8756c';
const bytes=raw(prefix+'.txt'),log=decode(bytes).replace(/\x1b\[[0-9;]*m/g,''),source=manifest(prefix+'-source.json');
assert.ok(log.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=${source.files.length}`));
const runs=[...log.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm)];assert.equal(runs.length,1);const run=runs[0],remote=log.slice(run.index);
const local=localStages(log.slice(0,run.index));assert.deepEqual(local.map(s=>s.names.length),[2011,3008,13]);
const ordinaryPath='docs/evidence/a-check-evidence-binding-accepted-20261021-r2.json',ordinary=json(ordinaryPath);
assert.equal(sha256(raw(ordinary.events)),ordinary.events_sha256);const ordinaryEvents=decode(raw(ordinary.events)).trim().split('\n').map(JSON.parse);
for(const stage of local.slice(0,2))exact(stage.names.map(canonicalLocalName),ordinaryEvents.filter(e=>e.Test&&e.Action==='pass'&&e.Package===stage.package).map(e=>e.Test));
const root='TestDDownloadGCTaskMySQL';
const passed=[...remote.matchAll(/^\s*--- PASS: TestDDownloadGCTaskMySQL\/(\S+) /gm)].map(m=>m[1]);
const failed=[...remote.matchAll(/^\s*--- FAIL: TestDDownloadGCTaskMySQL\/(\S+) /gm)].map(m=>m[1]);
exact(failed,['prune_reference','empty_prune_range','late_prune_reference']);assert.equal(passed.length,15);
const probe='backend/internal/systembackupevidence/download_gc_task_mysql_test.go',probeBytes=raw(probe);assert.equal(sha256(probeBytes),source.files.find(f=>f.path===probe).sha256);
const names=[...decode(probeBytes).match(/var dGCTaskMySQLCases = \[\]string\{([\s\S]*?)\n\}/)[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);exact([...passed,...failed],names);
assert.match(remote,/^--- FAIL: TestDDownloadGCTaskMySQL \(/m);assert.doesNotMatch(remote,/^--- PASS: TestDDownloadGCTaskMySQL \(/m);
for(const name of failed){const start=remote.indexOf(`=== RUN   ${root}/${name}\n`),end=remote.indexOf('=== RUN',start+10);assert.ok(start>=0);const text=remote.slice(start,end<0?undefined:end);assert.match(text,name==='empty_prune_range'?/Error 3819 .*chk_sb_prune_item_identity/:/MySQL error number=3819/);}
const databases=[...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)].map(m=>m[1]);assert.equal(databases.length,18);assert.equal(new Set(databases).size,18);
for(const marker of [`CLEANED namespace=${run[1]} uid=${run[2]}`,'CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True'])assert.ok(remote.includes(marker));
const owner=log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owner),false);assert.ok(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.match(remote,/^download_gc_task_exit=1$/m);assert.doesNotMatch(remote,/^CLEANUP_PENDING/m);
const backupDDL='backend/internal/db/migrations/067_add_system_backup_task_execution_core.sql',pruneDDL='backend/internal/db/migrations/070_add_system_backup_prune_authority.sql';
for(const p of [backupDDL,pruneDDL])assert.equal(sha256(raw(p)),source.files.find(f=>f.path===p).sha256);
const backup=decode(raw(backupDDL)),prune=decode(raw(pruneDDL));
const backupPattern=backup.match(/AND public_id REGEXP '(\^sbk_[^']+)'/)[1];
const constraint=prune.match(/CONSTRAINT chk_sb_prune_item_identity CHECK \(([\s\S]*?)\n  \),/)[1];
const prunePattern=constraint.match(/artifact_public_id REGEXP '([^']+)'/)[1];
assert.equal((backupPattern.match(/\[0-9a-f\]/g)||[]).length,5);assert.equal((prunePattern.match(/\[0-9a-f\]/g)||[]).length,4);
const validBackup='sbk_11111111-2222-4333-8444-555555555555',shortBackup='sbk_11111111-2222-4333-555555555555';
assert.ok(new RegExp(backupPattern).test(validBackup));assert.ok(!new RegExp(prunePattern).test(validBackup));assert.ok(!new RegExp(backupPattern).test(shortBackup));assert.ok(new RegExp(prunePattern).test(shortBackup));
assert.ok(prune.includes('CONSTRAINT fk_sb_prune_item_backup FOREIGN KEY (origin_installation_id, artifact_public_id) REFERENCES system_backups(origin_installation_id, public_id) ON DELETE RESTRICT'));
const record={kind:'a_gc_task_actual_mysql_prune_schema_failure_review',status:'failed_not_accepted',log:prefix+'.txt',log_sha256:sha256(bytes),source:prefix+'-source.json',source_manifest_sha256:sha256(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,namespace:run[1],namespace_uid:run[2],mysql_version:run[5],actual_sql_started:true,local_complete_checks:5019,packaged_seed_checks:13,passed_cases:passed,failed_cases:failed,observed_error:3819,prune_check:'chk_sb_prune_item_identity',backup_pattern:backupPattern,prune_artifact_pattern:prunePattern,schema_conflict:'Backup identity accepts five UUID groups, prune artifact identity accepts four; the same backup FK identity cannot satisfy both',schema_sources:[backupDDL,pruneDDL].map(p=>({path:p,sha256:sha256(raw(p))})),misleading_pass_text_ignored:true,cleaned_databases:databases,namespace_and_remote_cleanup:'reported_in_original_log_not_independently_reconnected',local_owner:owner,local_owner_independently_absent:true,final_exit:1,actual_suite_accepted:false,production_approved:false,shared_schema_changed:false,dependencies_installed:false,test_build_artifacts_created:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-download-gc-task-prune-failure-reviewed-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(json(output),record);
else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,passed:15,failed:3,actual_suite_accepted:false,schema_conflict:true,local_owner_absent:true}));
