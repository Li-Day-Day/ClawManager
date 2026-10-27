import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const logName='a-download-mfa-mysql-remote-20261019-153234-9c7cba5d.txt';
const sourceName='a-download-mfa-mysql-remote-source-20261019-153234-9c7cba5d.json';
const read=name=>fs.readFileSync(path.join(root,'docs/evidence',name));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const logBytes=read(logName),sourceBytes=read(sourceName);
const log=logBytes.toString('utf8').replaceAll('\r\n','\n');
const source=JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/,''));
const checks=[];
function check(name,condition){assert(condition,name);checks.push(name);}
function matches(re){return [...log.matchAll(re)];}
function one(re,name){const m=matches(re);check(name,m.length===1);return m[0];}
check('stable frozen snapshot without dependency installation or production approval',source.stable_copy_verified===true&&source.dependencies_installed===false&&source.production_approved===false);
check('logical snapshot SHA recomputed',sha(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===source.source_sha256);
check('safe unique source paths',new Set(source.files.map(p=>p.path)).size===source.files.length&&source.files.every(p=>!path.isAbsolute(p.path)&&!p.path.split('/').includes('..')&&/^[a-f0-9]{64}$/.test(p.sha256)));
check('raw log bound to exact frozen snapshot',log.includes(`source_sha256=${source.source_sha256} files=${source.files.length}`));
check('no failed or skipped Go tests, panic or pending cleanup',!/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^.*CLEANUP_PENDING/m.test(log));
const summaries=matches(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm);
check('two full packages and one tagged seed package completed',JSON.stringify(summaries.map(m=>m[1]))===JSON.stringify(['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupevidence']));
let offset=0;
const stages=summaries.map((m,index)=>{
  const segment=log.slice(offset,m.index);offset=m.index+m[0].length;
  const ran=[...segment.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]);
  const passed=[...segment.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
  check(`stage ${index} unique RUN/PASS paired`,new Set(ran).size===ran.length&&new Set(passed).size===passed.length&&JSON.stringify([...ran].sort())===JSON.stringify([...passed].sort()));
  return {package:m[1],kind:index<2?'ordinary_full_package':'tagged_seed',main_pass:passed.filter(p=>!p.includes('/')).length,all_pass:passed.length,elapsed:m[2]};
});
check('tagged MFA seed has eight checks',stages[2].main_pass===1&&stages[2].all_pass===8);
const standalone=log.slice(offset,log.indexOf('LOCAL_PASS config-standalone-seed=yes',offset));
check('detached seed has eight RUN/PASS checks',(standalone.match(/^=== RUN\s+/gm)||[]).length===8&&(standalone.match(/^\s*--- PASS: /gm)||[]).length===8);
for(const marker of ['LOCAL_PASS isolated-go-telemetry=off','LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent','PASS download-mfa-dispatch:','PASS evidence remote dispatch: 11 cases;','bundle.tar: OK','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True','CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','a_download_mfa_mysql_remote_exit=0','Windows PowerShell 脚本结束'])check(marker,log.includes(marker));
check('exclusive MFA profile requested',log.includes('-DownloadMFAOnly -Remote -BuildParallelism 2'));
const run=one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm,'one owned run with exact images');
check('isolated expected MySQL 8.4.8 namespace',run[1]==='sbk-mig-261019074200-5d04'&&run[2]==='85af61d4-eec0-42c5-9627-0ca132621fdb'&&run[5]==='8.4.8'&&[run[3],run[4]].every(p=>/@sha256:[a-f0-9]{64}$/.test(p)));
const pins=new Map(source.files.map(p=>[p.path,p]));
const compiled=one(/^LOCAL_PASS a-download-mfa-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm,'local Linux probe and inputs compiled');
check('compiled inputs equal frozen capsule bytes',compiled[2]===pins.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json')?.sha256);
check('remote PASS equals local binary and input hashes',log.includes(`PASS a-download-mfa-mysql binary_sha256=${compiled[1]} inputs_sha256=${compiled[2]} new_cases=9 synthetic_owner_issuer_material=yes human_mfa=no provider_read=no production_approval=no`));
const runner=one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm,'migration runner compiled');
const catalog=computeMigrationCatalog();
check('remote runner hash and complete catalog match',log.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
check('all 95 exact filenames migrated',catalog.file_count===95&&log.includes('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes'));
const migration=one(/^\{"config_activated":false,.*"migration_count":95,"result":"PASS"\}$/gm,'runner did not activate config or verify human MFA');
const migrationResult=JSON.parse(migration[0]);
check('runner catalog and synthetic approval boundary',migrationResult.migration_catalog_sha256===catalog.hash&&migrationResult.human_mfa_verified===false&&migrationResult.historical_equivalence_verified===false);
const testRoot='TestASensitiveDownloadMFAMySQL';
const leaves=['http_issue_step_replay','concurrent_step_once','final_owner_revocation_rollback','final_manifest_change_rollback','audit_failure_rollback','unknown_actual_commit_no_proof','late_actual_commit_no_proof','original_material_expiry','observed_L0_wait_original_expiry'];
const remote=log.slice(log.indexOf(run[0]));
const names=[testRoot,...leaves.map(p=>testRoot+'/'+p)].sort();
check('exact nine remote leaves and root each RUN once',JSON.stringify([...remote.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]).sort())===JSON.stringify(names));
check('exact nine remote leaves and root each PASS once',JSON.stringify([...remote.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]).sort())===JSON.stringify(names));
check('actual MFA synthetic boundary explicit',remote.includes('PASS actual download MFA MySQL cases=9 synthetic_owner_issuer_material=yes human_mfa=no provider_read=no admission_nonce_consumed=no production_approval=no'));
const databases=[...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})/g)].map(m=>m[1]);
check('nine distinct owned databases cleaned by guarded DROP and absence check',databases.length===9&&new Set(databases).size===9);
check('original namespace UID cleaned',remote.includes(`CLEANED namespace=${run[1]} uid=${run[2]}`));
const owner=one(/^LOCAL_OWNER config-writer-source=(.+)$/gm,'one local source owner')[1].trim();
check('owned local source parent/name exact',path.dirname(path.resolve(owner))===root&&/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)));
check('exact source owner cleaned and independently absent',log.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`)&&!fs.existsSync(owner));
const drift=[];
for(const p of source.files){const file=path.resolve(root,p.path);if(!fs.existsSync(file))drift.push({path:p.path,reason:'missing'});else {const bytes=fs.readFileSync(file);if(bytes.length!==p.size||sha(bytes)!==p.sha256)drift.push({path:p.path,reason:'changed'});}}
// This receipt accepts the executed frozen run. Later receipt/result changes
// are explicitly excluded, even though they live in the same Go package.
const excludedCurrentChanges=['backend/internal/systembackupevidence/download_admission_records.go','backend/internal/systembackupevidence/download_admission_transaction_model_test.go','backend/internal/systembackupevidence/download_result.go','backend/internal/systembackupevidence/download_result_retention_test.go'];
check('current drift limited to four explicitly excluded admission/result files',drift.length===4&&drift.every(d=>excludedCurrentChanges.includes(d.path)));
const focus=source.files.filter(p=>!excludedCurrentChanges.includes(p.path)&&(/^(backend\/internal\/systembackup(security|evidence)\/|backend\/internal\/db\/migrations\/)/.test(p.path)||/^scripts\/system-backup-(a-download-mfa|a-evidence|d-config-writer-validation|fresh-migration-smoke|smoke-contract)/.test(p.path)));
check('remaining current MFA/security/evidence/SQL/transport focus matches frozen bytes',!focus.some(p=>drift.some(d=>d.path===p.path)));
const report={kind:'a_download_mfa_actual_mysql_independent_acceptance',status:'accepted_exact_nine_mfa_issuance_cases_only',recorded_at:new Date().toISOString(),checks_passed:checks.length,checks,log:'docs/evidence/'+logName,log_sha256:sha(logBytes),source:'docs/evidence/'+sourceName,source_manifest_sha256:sha(sourceBytes),source_files:source.files.length,source_sha256:source.source_sha256,stages,ordinary_main:stages.slice(0,2).reduce((s,p)=>s+p.main_pass,0),ordinary_all:stages.slice(0,2).reduce((s,p)=>s+p.all_pass,0),detached_seed_all:8,namespace:run[1],namespace_uid:run[2],app_image:run[3],mysql_image:run[4],mysql_version:run[5],probe_sha256:compiled[1],inputs_sha256:compiled[2],migration_runner_sha256:runner[1],catalog:{hash:catalog.hash,file_count:catalog.file_count},actual_case_count:9,actual_case_names:leaves,cleaned_databases:databases,local_source_owner:owner,local_source_owner_exists:false,current_focus_files:focus.length,current_pinned_drift:drift,current_new_inputs_not_covered:true,actual_mysql:true,human_mfa:false,provider_read:false,admission_nonce_consumed:false,production_approved:false,dependencies_installed:false};
fs.writeFileSync(path.join(root,'docs/evidence/a-download-mfa-mysql-accepted-sbk-mig-261019074200-5d04.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,checks:checks.length,source_files:report.source_files,ordinary_main:report.ordinary_main,ordinary_all:report.ordinary_all,focus:focus.length,drift,cleanup_absent:true}));
