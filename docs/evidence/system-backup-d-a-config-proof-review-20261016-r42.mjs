import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { computeMigrationCatalog } from '../../scripts/system-backup-contract-check.mjs';

const root=new URL('../../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root));
const hash=(raw)=>createHash('sha256').update(raw).digest('hex');
const logPath='docs/evidence/a-config-proof-mysql-remote-20261016-110614-b99f5f47.txt';
const sourcePath='docs/evidence/a-config-proof-mysql-remote-source-20261016-110614-b99f5f47.json';
const raw=read(logPath),log=raw.toString('utf8'),lines=log.split(/\r?\n/);
const sourceBytes=read(sourcePath),source=JSON.parse(sourceBytes);
assert.equal(source.files.length,1292);assert.equal(new Set(source.files.map((pin)=>pin.path)).size,1292);
const digest=hash(source.files.map((pin)=>`${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n')+'\n');
assert.equal(digest,source.source_sha256);assert.ok(log.includes(`LOCAL_SOURCE config-proof-frozen=yes source_sha256=${digest} files=1292`));
const cases=['https_updateSystemBackupConfig','https_rollbackSystemBackupConfig','same_totp_concurrent_once','missing_session','revoked_session',
  'shortened_session','revoked_at_issue','inactive_user','password_changed','unconfirmed_totp','signer_failure','audit_failure_rollback',
  'commit_reply_lost','observed_config_lock_revocation','session_expires_in_signer'];
for(const name of cases){
  assert.equal(lines.filter((line)=>line===`=== RUN   TestAConfigProofMySQL/${name}`).length,1);
  assert.equal(lines.filter((line)=>line.startsWith(`    --- PASS: TestAConfigProofMySQL/${name} (`)).length,1);
}
assert.equal(lines.filter((line)=>line.startsWith('--- PASS: TestAConfigProofMySQL (')).length,1);
assert.doesNotMatch(log,/^\s*--- FAIL:|^panic:|^fatal error:|CLEANUP_PENDING/m);
const local=log.match(/LOCAL_PASS config-proof-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})/);
const executed=log.match(/^PASS a-config-proof-mysql binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64})$/m);
assert.ok(local&&executed);assert.equal(local[1],executed[1]);assert.equal(local[2],executed[2]);
const runner=log.match(/LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})/);assert.ok(runner);
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);
assert.ok(log.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
const run=log.match(/^RUN namespace=(sbk-mig-[0-9]{12}-[0-9a-f]{4}) uid=([0-9a-f-]{36}) app_image=(\S+) mysql_image=(\S+) mysql_version=8\.4\.8$/m);assert.ok(run);
assert.match(run[2],/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const migrationResult=lines.filter((line)=>line.startsWith('{')).map((line)=>{try{return JSON.parse(line)}catch{return null}}).find((item)=>item?.migration_count===95);
assert.ok(migrationResult);assert.equal(migrationResult.migration_catalog_sha256,catalog.hash);assert.equal(migrationResult.result,'PASS');
assert.equal(migrationResult.config_activated,false);assert.equal(migrationResult.human_mfa_verified,false);assert.equal(migrationResult.historical_equivalence_verified,false);
for(const marker of ['PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes',
  'OBSERVED session lock wait table=system_backup_installation_state','OBSERVED session lock wait table=system_backup_configs',
  'SCOPE config-proof real_mysql=yes https_jwt=yes current_config_rbac=yes totp_single_use=yes real_row_wait=yes commit_loss=synthetic_after_real_commit human_mfa=no production_grant=no config_write=no backfill=no',
  `CLEANED namespace=${run[1]} uid=${run[2]}`,'CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True',
  'LOCAL_PASS config-proof-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'])assert.ok(log.includes(marker),marker);
assert.equal(lines.filter((line)=>line.includes('CLEANED config-proof owned installation/user/credentials/sessions/revocations/audit')).length,15);
assert.equal(lines.filter((line)=>line==='a_config_proof_mysql_exit=0').length,1);
assert.match(log,/结束时间: [0-9]{14}/);
const owner=log.match(/LOCAL_CLEANUP config-proof-source-owned=([^\r\n]+) removed=True/);assert.ok(owner);
const ownerURL=new URL('file:///'+owner[1].replaceAll('\\','/'));assert.equal(existsSync(ownerURL),false);
const earlier=JSON.parse(read('docs/evidence/a-config-proof-mysql-local-review-20261016.json'));
const names=[...new Set([...earlier.current_focused_pins.map((pin)=>pin.path),
  'backend/internal/systembackupsecurity/config_proof_mysql_test.go','backend/internal/systembackupsecurity/login_sessions_mysql_test.go',
  'scripts/system-backup-a-config-proof-source.ps1','scripts/system-backup-a-config-proof-source.test.ps1'])];
const focused=names.map((path)=>{
  const pin=source.files.find((pin)=>pin.path===path);assert.ok(pin,path);const current=read(path);
  assert.equal(current.length,pin.size,path);assert.equal(hash(current),pin.sha256,path);return pin;
});
const drift=source.files.flatMap((pin)=>{
  if(!existsSync(new URL(pin.path,root)))return[{path:pin.path,state:'missing'}];
  const current=read(pin.path);return hash(current)===pin.sha256&&current.length===pin.size?[]:[{path:pin.path,state:'changed'}];
});
const scope=read('backend/internal/systembackupsecurity/config_proof_mysql_test.go').toString('utf8');
assert.match(scope,/actualFiles, inputs\.Filenames/);assert.match(scope,/real COMMIT was not preserved/);
assert.match(scope,/unknown COMMIT released a proof/);assert.match(scope,/expiry was not actually observed in signer/);
const result={kind:'d_independent_a_config_proof_mysql_review',recorded_at:new Date().toISOString(),status:'accepted_frozen_fifteen_case_proof_only',
  raw_log:logPath,raw_log_sha256:hash(raw),source_manifest:sourcePath,source_manifest_sha256:hash(sourceBytes),frozen_files:1292,source_sha256:digest,
  cases,leaf_pass:15,root_pass:true,actual_database:'MySQL 8.4.8',namespace:run[1],namespace_uid:run[2],app_image:run[3],mysql_image:run[4],
  binary_sha256:executed[1],capsule_sha256:executed[2],migration_runner_sha256:runner[1],migration_catalog:catalog,
  two_server_row_waits_reported:true,owned_fixture_cleanup_markers:15,namespace_exact_uid_cleanup_reported:true,
  remote_scratch_cleanup_reported:true,local_cache_cleanup_reported:true,local_owned_root_checked_absent:owner[1],
  focused_matching_inputs:focused,current_other_frozen_input_drift:drift,
  socket_diagnostics:(log.match(/close - IO is still pending on closed socket/g)??[]).length,
  socket_diagnostic_disposition:'Retained; all cases, exact cleanup, postcheck and explicit exit 0 follow.',
  acceptance_basis:'Operator-provided terminal transcript and frozen manifest; reviewer checked raw pins, source and local absence without SSH or rerunning tests.',
  d_executed_remote:false,dependencies_installed_by_reviewer:false,config_write_verified:false,backfill_verified:false,human_mfa_verified:false,
  production_grant_verified:false,maintenance_holder_verified:false,control_health_seven_case_root_verified:false,
  current_tree_or_formal_schema_approved:false,production_approval:false,goal_complete:false};
writeFileSync(new URL('./system-backup-d-a-config-proof-review-20261016-r42.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,cases:15,focused:focused.length,current_drift:drift.length,local_owned_root_absent:true,goal_complete:false}));
