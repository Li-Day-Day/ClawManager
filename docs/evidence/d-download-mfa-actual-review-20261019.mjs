import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base='docs/evidence/a-download-mfa-mysql-remote-20261019-153234-9c7cba5d';
const sourceName='docs/evidence/a-download-mfa-mysql-remote-source-20261019-153234-9c7cba5d.json';
const raw=p=>fs.readFileSync(path.join(root,p));
const text=p=>raw(p).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const log=text(base+'.txt'),source=JSON.parse(text(sourceName));
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
assert.equal(sha(Buffer.from(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),source.source_sha256);
assert.equal(source.files.length,1399);assert.equal(new Set(source.files.map(f=>f.path)).size,1399);
assert.ok(source.files.every(f=>!path.isAbsolute(f.path)&&!f.path.split('/').includes('..')));
assert.ok(log.includes(`source_sha256=${source.source_sha256} files=1399`));
assert.ok(!/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^.*CLEANUP_PENDING/m.test(log));
const stages=[];let offset=0;
for(const m of log.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)){
  const segment=log.slice(offset,m.index);offset=m.index+m[0].length;
  const ran=[...segment.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]);
  const passed=[...segment.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
  assert.equal(ran.length,new Set(ran).size);assert.equal(passed.length,new Set(passed).size);
  assert.deepEqual([...ran].sort(),[...passed].sort());
  stages.push({package:m[1],main:passed.filter(p=>!p.includes('/')).length,all:passed.length});
}
assert.deepEqual(stages.map(s=>s.package),['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupevidence']);
assert.equal(stages[2].main,1);assert.equal(stages[2].all,8);
const detached=log.slice(offset,log.indexOf('LOCAL_PASS config-standalone-seed=yes',offset));
assert.equal((detached.match(/^=== RUN /gm)||[]).length,8);assert.equal((detached.match(/^\s*--- PASS: /gm)||[]).length,8);
for(const marker of ['-DownloadMFAOnly -Remote -BuildParallelism 2','LOCAL_PASS isolated-go-telemetry=off','LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent','PASS download-mfa-dispatch:','PASS evidence remote dispatch: 11 cases;','bundle.tar: OK','CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True','a_download_mfa_mysql_remote_exit=0','Windows PowerShell 脚本结束'])assert.ok(log.includes(marker),marker);
const runs=[...log.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm)];assert.equal(runs.length,1);
const run=runs[0];assert.equal(run[1],'sbk-mig-261019074200-5d04');assert.equal(run[2],'85af61d4-eec0-42c5-9627-0ca132621fdb');assert.equal(run[5],'8.4.8');
for(const image of [run[3],run[4]])assert.match(image,/@sha256:[a-f0-9]{64}$/);
const compiled=log.match(/^LOCAL_PASS a-download-mfa-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/m);assert.ok(compiled);
const pins=new Map(source.files.map(f=>[f.path,f]));
assert.equal(compiled[2],pins.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json').sha256);
assert.ok(log.includes(`PASS a-download-mfa-mysql binary_sha256=${compiled[1]} inputs_sha256=${compiled[2]} new_cases=9 synthetic_owner_issuer_material=yes human_mfa=no provider_read=no production_approval=no`));
const runner=log.match(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/m);assert.ok(runner);
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);
assert.ok(log.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
assert.ok(log.includes('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes'));
const migration=JSON.parse(log.match(/^\{"config_activated":false,.*"migration_count":95,"result":"PASS"\}$/m)[0]);
assert.equal(migration.migration_catalog_sha256,catalog.hash);assert.equal(migration.human_mfa_verified,false);assert.equal(migration.historical_equivalence_verified,false);
const remote=log.slice(run.index),testRoot='TestASensitiveDownloadMFAMySQL';
const leaves=['http_issue_step_replay','concurrent_step_once','final_owner_revocation_rollback','final_manifest_change_rollback','audit_failure_rollback','unknown_actual_commit_no_proof','late_actual_commit_no_proof','original_material_expiry','observed_L0_wait_original_expiry'];
const expected=[testRoot,...leaves.map(s=>testRoot+'/'+s)].sort();
assert.deepEqual([...remote.matchAll(/^=== RUN\s+(\S+)$/gm)].map(m=>m[1]).sort(),expected);
assert.deepEqual([...remote.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]).sort(),expected);
assert.ok(remote.includes('PASS actual download MFA MySQL cases=9 synthetic_owner_issuer_material=yes human_mfa=no provider_read=no admission_nonce_consumed=no production_approval=no'));
const databases=[...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})/g)].map(m=>m[1]);assert.equal(databases.length,9);assert.equal(new Set(databases).size,9);
assert.ok(remote.includes(`CLEANED namespace=${run[1]} uid=${run[2]}`));
const owner=log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();
assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(log.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
const currentDrift=[];
for(const pin of source.files){const p=path.resolve(root,pin.path);assert.ok(p.startsWith(root+path.sep));if(!fs.existsSync(p)){currentDrift.push({path:pin.path,reason:'missing'});continue;}const b=fs.readFileSync(p);if(b.length!==pin.size||sha(b)!==pin.sha256)currentDrift.push({path:pin.path,reason:'changed'});}
const focus=source.files.filter(p=>/^backend\/internal\/systembackupsecurity\//.test(p.path)||/^backend\/internal\/db\/migrations\//.test(p.path)||/^backend\/internal\/systembackupevidence\/(?:sensitive_download|download_(?:actor_context|authority|task_owner|producer_owner|admission_content|admission_binding)|sql\.go|types\.go|testdata\/)/.test(p.path)||/^scripts\/system-backup-a-download-mfa/.test(p.path));
const focusDrift=currentDrift.filter(d=>focus.some(p=>p.path===d.path));
assert.equal(focusDrift.length,0,'Current MFA focus must not inherit an old frozen proof after changes');
// Guarded cleanup logs are emitted only after source UUID and SCHEMATA absence
// checks; verify those exact implementation bytes still match this frozen run.
for(const p of ['backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go','scripts/system-backup-a-download-mfa-phase.sh'])assert.equal(sha(raw(p)),pins.get(p).sha256,p);
const cleanupCode=text('backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go');
assert.ok(cleanupCode.includes('current != uuid'));assert.ok(cleanupCode.includes('SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?'));
const result={kind:'d_independent_mfa_nine_actual_mysql_acceptance',status:'accepted_frozen_mfa_issuance_nine_only',recorded_at:new Date().toISOString(),
  log:base+'.txt',log_sha256:sha(raw(base+'.txt')),source:sourceName,source_manifest_sha256:sha(raw(sourceName)),source_files:source.files.length,source_sha256:source.source_sha256,
  local_stages:stages,ordinary_main:stages[0].main+stages[1].main,ordinary_all:stages[0].all+stages[1].all,seed_all:8,detached_seed_all:8,
  namespace:run[1],namespace_uid:run[2],mysql_version:run[5],probe_sha256:compiled[1],inputs_sha256:compiled[2],migration_runner_sha256:runner[1],catalog,
  actual_case_names:leaves,actual_case_count:9,cleaned_databases:databases,local_owner:owner,local_owner_absent:true,current_mfa_focus_files:focus.length,current_mfa_focus_drift:focusDrift,current_pinned_drift:currentDrift,
  newer_inputs_not_covered:true,actual_mysql:true,human_mfa:false,provider_read:false,admission_nonce_consumed:false,dependencies_installed_by_D:false,production_approved:false,
  limitations:'Executed synthetic MFA issuer/owner/material on actual isolated MySQL and original 95 migration catalog. Does not accept full download admission/result/retention group, newer D group reader, deployed providers, physical capacity, formal grants/GC, human MFA, production or original six scopes.'};
fs.writeFileSync(path.join(root,'docs/evidence/d-download-mfa-actual-accepted-20261019.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({actual_cases:9,source_files:source.files.length,local_main:result.ordinary_main,local_all:result.ordinary_all,mfa_focus_drift:focusDrift,other_drift:currentDrift,source_owner_absent:true}));
