import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const logPath='docs/evidence/a-download-admission-mysql-remote-20261019-161645-0ba9ed8f.txt';
const sourcePath='docs/evidence/a-download-admission-mysql-remote-source-20261019-161645-0ba9ed8f.json';
const raw=p=>fs.readFileSync(path.join(root,p));
const text=p=>raw(p).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const log=text(logPath),source=JSON.parse(text(sourcePath));
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
assert.equal(source.files.length,1402);assert.equal(new Set(source.files.map(f=>f.path)).size,1402);
assert.equal(sha(Buffer.from(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),source.source_sha256);
assert.ok(source.files.every(f=>!path.isAbsolute(f.path)&&!f.path.split('/').includes('..')));
assert.ok(log.includes(`source_sha256=${source.source_sha256} files=1402`));
assert.ok(!/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^.*CLEANUP_PENDING/m.test(log));
let offset=0;const stages=[];
for(const m of log.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)){
  const segment=log.slice(offset,m.index);offset=m.index+m[0].length;
  const ran=[...segment.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]);
  const pass=[...segment.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
  assert.equal(new Set(ran).size,ran.length);assert.equal(new Set(pass).size,pass.length);assert.deepEqual([...ran].sort(),[...pass].sort());
  stages.push({package:m[1],main:pass.filter(p=>!p.includes('/')).length,all:pass.length});
}
assert.deepEqual(stages.map(s=>s.package),['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupevidence']);
assert.equal(stages[2].main,2);assert.equal(stages[2].all,12);
const detached=log.slice(offset,log.indexOf('LOCAL_PASS config-standalone-seed=yes',offset));
assert.equal((detached.match(/^=== RUN /gm)||[]).length,12);assert.equal((detached.match(/^\s*--- PASS: /gm)||[]).length,12);
for(const marker of ['-DownloadAdmissionOnly -Remote -BuildParallelism 2','LOCAL_PASS isolated-go-telemetry=off','LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent','PASS download-admission-dispatch:','PASS evidence remote dispatch: 11 cases;','bundle.tar: OK','CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True','a_download_admission_mysql_remote_exit=0','Windows PowerShell 脚本结束'])assert.ok(log.includes(marker),marker);
const runs=[...log.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm)];assert.equal(runs.length,1);
const run=runs[0];assert.equal(run[1],'sbk-mig-261019082949-1133');assert.equal(run[2],'9fccc9d1-07ec-40c3-9034-649a0ea9c8be');assert.equal(run[5],'8.4.8');
for(const image of [run[3],run[4]])assert.match(image,/@sha256:[a-f0-9]{64}$/);
const compiled=log.match(/^LOCAL_PASS a-download-admission-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/m);assert.ok(compiled);
const pins=new Map(source.files.map(f=>[f.path,f]));assert.equal(compiled[2],pins.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json').sha256);
assert.ok(log.includes(`PASS a-download-admission-mysql binary_sha256=${compiled[1]} inputs_sha256=${compiled[2]} new_cases=13 result_retention_cases=11 synthetic_owner_issuer_material=yes human_mfa=no provider_transport=synthetic sql_authority=actual production_approval=no`));
const runner=log.match(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/m);assert.ok(runner);
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);
assert.ok(log.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
assert.ok(log.includes('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes'));
const migration=JSON.parse(log.match(/^\{"config_activated":false,.*"migration_count":95,"result":"PASS"\}$/m)[0]);
assert.equal(migration.migration_catalog_sha256,catalog.hash);assert.equal(migration.human_mfa_verified,false);assert.equal(migration.historical_equivalence_verified,false);
const admissionRoot='TestADownloadAdmissionMySQL',resultRoot='TestDDownloadResultRetentionMySQL';
const admissionLeaves=['http_admit_provider_result','concurrent_key_once','retained_hmac_replay','final_owner_rollback','final_manifest_rollback','final_nonce_rollback','intent_insert_rollback','unknown_actual_commit','late_actual_commit','observed_L0_wait_original_expiry','result_after_revocation','result_insert_rollback','result_unknown_actual_commit'];
const resultLeaves=['result_audit_delete_restrict','admission_delete_restrict','parent_retention_update_restrict','retention_group_fk','intent_group_fk','installation_group_fk','link_insert_rollback','duplicate_result_rejected','cold_group_after_revocation','cold_group_duplicate_nonce','cold_group_corrupt_intent'];
const expected=[admissionRoot,resultRoot,...admissionLeaves.map(s=>admissionRoot+'/'+s),...resultLeaves.map(s=>resultRoot+'/'+s)].sort();
const remote=log.slice(run.index);
assert.deepEqual([...remote.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]).sort(),expected);
assert.deepEqual([...remote.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]).sort(),expected);
const databases=[...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})/g)].map(m=>m[1]);assert.equal(databases.length,24);assert.equal(new Set(databases).size,24);
assert.ok(remote.includes(`CLEANED namespace=${run[1]} uid=${run[2]}`));
const owner=log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(log.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
const drift=[];
for(const pin of source.files){const p=path.resolve(root,pin.path);assert.ok(p.startsWith(root+path.sep));assert.ok(fs.existsSync(p));const b=fs.readFileSync(p);if(b.length!==pin.size||sha(b)!==pin.sha256)drift.push({path:pin.path,reason:'changed',frozen_sha256:pin.sha256,current_sha256:sha(b)});}
assert.deepEqual(drift.map(d=>d.path),['backend/internal/systembackupevidence/download_retention_group_test.go']);
const changed=text(drift[0].path);let reversals=0;
const restored=changed.replace(/t\.Error\(err\)\n\s*return nil/g,()=>{reversals++;return 't.Fatal(err)';});
assert.equal(reversals,3);assert.equal(sha(Buffer.from(restored)),pins.get(drift[0].path).sha256,'Only three ordinary unit-test error branches may differ; production/SQL probe must match');
// These exact helpers emit cleanup only after UUID and SCHEMATA absence checks.
for(const p of ['backend/internal/systembackupevidence/download_result_retention_mysql_test.go','backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go','scripts/system-backup-a-download-admission-phase.sh'])assert.equal(sha(raw(p)),pins.get(p).sha256,p);
const cleanupCode=text('backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go');assert.ok(cleanupCode.includes('current != uuid'));assert.ok(cleanupCode.includes('SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?'));
const local=jsonLocal();
function jsonLocal(){return JSON.parse(text('docs/evidence/d-download-retention-group-packages-20261019-r52-review.json'));}
assert.equal(local.frozen_validation_passed,true);assert.equal(local.current_sources_match,true);assert.equal(local.new_all,109);
const result={kind:'d_independent_download_admission_and_retention_actual_mysql_acceptance',status:'accepted_frozen_thirteen_admission_plus_eleven_result_group_cases',recorded_at:new Date().toISOString(),
  log:logPath,log_sha256:sha(raw(logPath)),source:sourcePath,source_manifest_sha256:sha(raw(sourcePath)),source_files:source.files.length,source_sha256:source.source_sha256,
  local_stages:stages,ordinary_main:stages[0].main+stages[1].main,ordinary_all:stages[0].all+stages[1].all,seed_all:12,detached_seed_all:12,
  namespace:run[1],namespace_uid:run[2],mysql_version:run[5],probe_sha256:compiled[1],inputs_sha256:compiled[2],migration_runner_sha256:runner[1],catalog,
  admission_case_names:admissionLeaves,result_group_case_names:resultLeaves,actual_case_count:24,actual_root_count:2,cleaned_databases:databases,local_owner:owner,local_owner_absent:true,
  current_pinned_drift:drift,current_production_and_sql_probe_pins_match:true,unit_test_error_branch_reversals:3,current_local_validation_source_sha256:local.source_sha256,
  actual_mysql:true,human_mfa:false,provider_transport:'synthetic',owner_rows:'synthetic',capacity_materials:'synthetic',dependencies_installed_by_D:false,production_approved:false,group_gc_delete_implemented:false,original_six_scopes_complete:false,
  limitations:'Actual isolated MySQL transactions, constraints, rollback/concurrency/unknown commit and cold persisted group checks. Does not accept four-task/producer real owner/ref InnoDB ranges, deployed STS/KMS/human MFA, physical capacity/grants, complete group GC/tombstones, production main, historical activation or original six scopes.'};
fs.writeFileSync(path.join(root,'docs/evidence/d-download-admission-actual-accepted-20261019.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({actual_cases:24,roots:2,source_files:source.files.length,local_main:result.ordinary_main,local_all:result.ordinary_all,current_drift:drift.map(d=>d.path),production_sql_probe_pins_match:true,owned_databases_cleaned:24,source_owner_absent:true}));
