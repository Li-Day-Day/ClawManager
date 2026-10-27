// Preserve the real nine-pass / one-fail role attempt; never grant approval.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,exact} from './a-frozen-validation-utils-20261021.mjs';
import {localStages,canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
const logPath='docs/evidence/a-download-gc-role-mysql-remote-20261021-142757-6ad9fc5f.txt',sourcePath='docs/evidence/a-download-gc-role-mysql-remote-source-20261021-142757-6ad9fc5f.json';
const bytes=raw(logPath),log=decode(bytes),source=manifest(sourcePath);
assert.ok(log.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=${source.files.length}`));
const runs=[...log.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm)];assert.equal(runs.length,1);const run=runs[0],remote=log.slice(run.index),root='TestADownloadGCRoleMySQL';
const local=localStages(log.slice(0,run.index));assert.deepEqual(local.map(s=>s.names.length),[2011,3008,9]);
const proof=json('docs/evidence/a-check-evidence-binding-accepted-20261021-r2.json');assert.equal(sha256(raw(proof.events)),proof.events_sha256);const es=decode(raw(proof.events)).trim().split('\n').map(JSON.parse);
for(const stage of local.slice(0,2))exact(stage.names.map(canonicalLocalName),es.filter(e=>e.Test&&e.Action==='pass'&&e.Package===stage.package).map(e=>e.Test));
const passed=[...remote.matchAll(/^\s*--- PASS: TestADownloadGCRoleMySQL\/(\S+) /gm)].map(m=>m[1]),failed=[...remote.matchAll(/^\s*--- FAIL: TestADownloadGCRoleMySQL\/(\S+) /gm)].map(m=>m[1]);
assert.equal(passed.length,9);exact(failed,['metadata_drift']);assert.match(remote,/^--- FAIL: TestADownloadGCRoleMySQL \(/m);assert.doesNotMatch(remote,/^--- PASS: TestADownloadGCRoleMySQL \(/m);
const start=remote.indexOf(`=== RUN   ${root}/metadata_drift\n`);assert.ok(start>=0);assert.match(remote.slice(start),/download_gc_role_a_mysql_test\.go:297: GC role SQL stage=owned-metadata-drift mysql_errno=1146/);
const accounts=[...remote.matchAll(/CLEANED GC role owned account (a_gc_[a-f0-9]{20})\b/g)].map(m=>m[1]),databases=[...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)].map(m=>m[1]);
assert.equal(accounts.length,10);assert.equal(new Set(accounts).size,10);assert.equal(databases.length,10);assert.equal(new Set(databases).size,10);
for(const marker of [`CLEANED namespace=${run[1]} uid=${run[2]}`,'CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True'])assert.ok(remote.includes(marker));
const owner=log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owner),false);assert.ok(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.match(remote,/^a_download_gc_role_mysql_remote_exit=1$/m);assert.match(remote,/Windows PowerShell 脚本结束\n结束时间: \d+/);assert.doesNotMatch(remote,/^CLEANUP_PENDING/m);
const probe='backend/internal/systembackupevidence/download_gc_role_a_mysql_test.go',current=decode(raw(probe));
// Reconstruct the original frozen bytes by removing only this fixture repair.
let original=current.replace('// This table is created by the formal capsule in every isolated role database.\n// The role fixture does not create the MFA owner\'s separate synthetic table.\nconst aGCRoleMetadataDriftSQL = "ALTER TABLE system_backup_configs ADD COLUMN gc_role_probe INT NULL"\n\n','');
original=original.replace('\tif !strings.Contains(aGCRoleMetadataDriftSQL, "ALTER TABLE system_backup_configs ADD COLUMN") {\n\t\tt.Fatal("GC role drift must alter an existing formal fixture table")\n\t}\n','');
original=original.replace('"owned-metadata-drift", aGCRoleMetadataDriftSQL)','"owned-metadata-drift", "ALTER TABLE synthetic_download_mfa_owner ADD COLUMN gc_role_probe INT NULL")');
original=original.replace('\t\t\t\tchanged := aGCRoleMetadata(t, x.ctx, x.root)\n\t\t\t\tif changed.Columns == x.c.Metadata.Columns {\n\t\t\t\t\tt.Fatal("owned DDL did not change the privileged column pin")\n\t\t\t\t}\n','');
original=original.replace('x.c.Metadata = changed','x.c.Metadata = aGCRoleMetadata(t, x.ctx, x.root)');
original=original.replace('\t\t\t\tt.Log("OBSERVED privileged column metadata drift; original pin rejected; isolated repin accepted")\n','');
assert.equal(sha256(original),source.files.find(f=>f.path===probe).sha256);
assert.equal(original.split('\n').findIndex(l=>l.includes('"owned-metadata-drift"'))+1,297);
const ddl='backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql';assert.equal(sha256(raw(ddl)),source.files.find(f=>f.path===ddl).sha256);assert.ok(decode(raw(ddl)).includes('CREATE TABLE IF NOT EXISTS system_backup_configs'));
const record={kind:'a_gc_role_actual_mysql_metadata_drift_failure_review',status:'failed_not_accepted',log:logPath,log_sha256:sha256(bytes),source:sourcePath,source_manifest_sha256:sha256(raw(sourcePath)),source_sha256:source.source_sha256,source_files:source.files.length,namespace:run[1],namespace_uid:run[2],mysql_version:run[5],actual_sql_started:true,local_complete_checks:5019,packaged_seed_checks:9,passed_cases:passed,failed_cases:failed,sql_stage:'owned-metadata-drift',mysql_error:1146,diagnosis:'Fixture ALTER targeted synthetic_download_mfa_owner, which this role fixture never creates; rejection and re-pin checks were not reached',original_probe_sha256:sha256(original),repaired_probe_sha256:sha256(raw(probe)),repair:'Alter existing formal system_backup_configs in the disposable case; require privileged column pin change, old pin rejection, and isolated re-pin success',formal_existing_table_ddl:ddl,cleaned_accounts:accounts,cleaned_databases:databases,namespace_and_remote_cleanup:'reported_in_original_log_not_independently_reconnected',local_owner:owner,local_owner_independently_absent:true,final_exit:1,actual_suite_accepted:false,role_approved:false,production_approved:false,dependencies_installed:false,shared_schema_changed:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-download-gc-role-drift-failure-reviewed-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(json(output),record);
else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,passed:9,failed:1,mysql_error:1146,actual_suite_accepted:false,local_owner_absent:true}));
