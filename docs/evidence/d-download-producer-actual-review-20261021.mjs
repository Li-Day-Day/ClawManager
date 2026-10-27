// Offline review of this exact operator run; never connects to Kubernetes/SQL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, decode, sha256, localStages, canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';

const prefix='docs/evidence/d-download-producer-remote-20261021-091802';
const baseline='docs/evidence/d-download-gc-batch-20261020-r3';
const receiptPath='docs/evidence/d-download-producer-actual-accepted-20261021.json';
const raw=p=>fs.readFileSync(path.join(workspace,p));
const read=p=>decode(raw(p));
const exact=(a,b)=>assert.deepEqual(a.slice().sort(),b.slice().sort());
const runs=t=>[...t.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]);
const passes=t=>[...t.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
const logBytes=raw(prefix+'.txt'),log=decode(logBytes);
const source=JSON.parse(read(prefix+'-source.json'));
const old=JSON.parse(read(baseline+'-source.json'));
assert.equal(sha256(logBytes),'9efa731e941518b2e9598bdb4469af7a0ca41459f07b30673ad40fef6204bf33');
assert.equal(sha256(raw(prefix+'-source.json')),'70ba3043184f012cc0278762d4e03a509ab41e05c1bad674766b608a6cede1ef');
assert.equal(sha256(raw(baseline+'.jsonl')),'fd7bc902bae8ee7028adeae48cc05e7873397b44bb979e996d31fcd1cf0617fb');
assert.deepEqual(source.files,old.files);
assert.equal(source.files.length,1455);
assert.equal(source.source_sha256,'d9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542');
assert.equal(source.stable_copy_verified,true);
assert.equal(source.dependencies_installed,false);
assert.equal(source.production_approved,false);
assert.equal(new Set(source.files.map(f=>f.path)).size,source.files.length);
for(const f of source.files){assert.match(f.path,/^(backend|contracts|scripts|docs)\//);assert.ok(!f.path.includes('\\')&&!f.path.split('/').some(p=>['..','.',''].includes(p)));assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(f.size)&&f.size>=0);}
assert.equal(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
function one(re,t=log){const ms=[...t.matchAll(re)];assert.equal(ms.length,1,String(re));return ms[0];}
assert.doesNotMatch(log,/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|CLEANUP_PENDING/m);
const frozen=one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm);
assert.equal(frozen[1],source.source_sha256);assert.equal(Number(frozen[2]),source.files.length);
const run=one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm);
assert.equal(run[1],'sbk-mig-261021015533-01f1');assert.equal(run[2],'73689a41-d102-4274-b8a8-067a36ab3fe5');assert.equal(run[5],'8.4.8');
for(const p of [run[3],run[4]])assert.match(p,/@sha256:[a-f0-9]{64}$/);
const local=log.slice(0,run.index),remote=log.slice(run.index),stages=localStages(local);
const inventory=read(baseline+'.jsonl').trim().split('\n').map(JSON.parse);
assert.ok(!inventory.some(e=>['fail','skip','build-fail'].includes(e.Action)));
for(const stage of stages.slice(0,2)){
  const expected=inventory.filter(e=>e.Package===stage.package&&e.Test&&e.Action==='pass').map(e=>e.Test);
  exact(inventory.filter(e=>e.Package===stage.package&&e.Test&&e.Action==='run').map(e=>e.Test),expected);
  assert.equal(inventory.filter(e=>e.Package===stage.package&&!e.Test&&e.Action==='pass').length,1);
  exact(stage.names.map(canonicalLocalName),expected);
}
const seeds=read(baseline+'-tagged-seed.txt').trim().split('\n').map(JSON.parse);
assert.ok(!seeds.some(e=>['fail','skip','build-fail'].includes(e.Action)));
const seedNames=seeds.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test);
assert.equal(seedNames.length,22);assert.equal(seedNames.filter(n=>!n.includes('/')).length,3);
exact(seeds.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test),seedNames);exact(stages[2].names,seedNames);
const detachedAt=local.indexOf('LOCAL_PASS config-standalone-seed=yes',stages[2].end);assert.ok(detachedAt>stages[2].end);
const detached=local.slice(stages[2].end,detachedAt);exact(runs(detached),seedNames);exact(passes(detached),seedNames);assert.match(detached,/\nPASS\s*$/);
assert.ok(local.includes('bundle.tar: OK'));assert.ok(local.includes('LOCAL_PASS isolated-go-telemetry=off'));
const probe=one(/^LOCAL_PASS d-download-producer-owner-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm);
assert.equal(probe[1],'a3ef9e3677cc5b385585b38c64d0e3063f9a747dcfbae9a40d1fad23123e337f');
assert.equal(probe[2],'a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0');
assert.equal(probe[2],source.files.find(f=>f.path.endsWith('/download_producer_probe_inputs.json')).sha256);
const runner=one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm);
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);
assert.ok(remote.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
assert.ok(remote.includes('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes'));
const migration=JSON.parse(one(/^\{"config_activated":false,.*"result":"PASS"\}\s*$/gm,remote)[0]);
assert.equal(migration.migration_count,95);assert.equal(migration.migration_catalog_sha256,catalog.hash);assert.equal(migration.human_mfa_verified,false);assert.equal(migration.historical_equivalence_verified,false);
const cases=['http_result','expired_owner_write_read','superseded_run','wrong_root','run_projection','history_manifest','receipt_manifest','receipt_version','foreign_reference','partial_schema','missing_history','original_run_lock','original_history_lock','empty_receipt_range','empty_hold_range','revoked_result','result_link_rollback','late_history_rollback'];
const root='TestDProducerDownloadOwnersMySQL',expected=[root,...cases.map(n=>root+'/'+n)];
exact(runs(remote),expected);exact(passes(remote),expected);assert.equal(new Set(runs(remote)).size,19);
const locks={original_run_lock:'system_backup_producer_runs',original_history_lock:'system_backup_producer_evidence_bindings',empty_receipt_range:'system_backup_producer_result_receipts',empty_hold_range:'system_backup_producer_evidence_refs'};
const databases=[],observedLocks=[];
for(const name of cases){
  const start=remote.indexOf('=== RUN   '+root+'/'+name+'\n');assert.ok(start>=0);
  const next=remote.indexOf('=== RUN',start+10),segment=remote.slice(start,next<0?remote.length:next);
  const db=one(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g,segment)[1];databases.push({case:name,database:db});
  if(locks[name]){
    const m=one(/OBSERVED exact task reference lock table=(\S+) holder=(\d+) writer=(\d+) writer_rolled_back=yes/g,segment);
    assert.equal(m[1],locks[name]);assert.ok(Number(m[2])>0&&Number(m[3])>0&&m[2]!==m[3]);observedLocks.push({case:name,table:m[1],holder:Number(m[2]),writer:Number(m[3]),writer_rolled_back:true});
  }
}
assert.equal(new Set(databases.map(d=>d.database)).size,18);assert.equal([...remote.matchAll(/CLEANED download MFA owned database amfa_[a-f0-9]{32}\b/g)].length,18);
assert.equal([...remote.matchAll(/OBSERVED exact task reference lock /g)].length,4);
assert.ok(remote.includes('PASS actual producer download owner cases=18 owner_adapter=SQLDownloadOwners provider_transport=synthetic production_approval=no'));
assert.equal(one(/^--- PASS: TestDProducerDownloadOwnersMySQL \(([0-9.]+)s\)$/gm,remote)[1],'90.81');
assert.equal([...remote.matchAll(/^PASS$/gm)].length,1);
assert.ok(remote.includes(`PASS d-download-producer-owner-mysql binary_sha256=${probe[1]} inputs_sha256=${probe[2]} new_cases=18 owner_adapter=SQLDownloadOwners production_tasks=no human_mfa=no provider_transport=synthetic production_approval=no`));
const cleaned=one(/^CLEANED namespace=(\S+) uid=(\S+)$/gm,remote);assert.equal(cleaned[1],run[1]);assert.equal(cleaned[2],run[2]);
const owner=one(/^LOCAL_OWNER config-writer-source=(.+)$/gm)[1].trim();
assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
for(const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'])one(new RegExp('^'+marker+'$','gm'),remote);
assert.equal(one(/^download_producer_exit=(-?\d+)$/gm,remote)[1],'0');assert.match(log.trimEnd(),/download_producer_exit=0$/);
const socketWarnings=[...log.matchAll(/^close - IO is still pending on closed socket\. read:1, write:0, io:[0-9A-F]+$/gm)].map(m=>m[0]);assert.equal(socketWarnings.length,4);
const drift=source.files.filter(f=>{try{const b=raw(f.path);return b.length!==f.size||sha256(b)!==f.sha256;}catch{return true;}}).map(f=>f.path);
const currentList='docs/evidence/d-download-producer-actual-current-files-20261021.txt';
const currentNames=read(currentList).trim().split('\n');assert.equal(new Set(currentNames).size,currentNames.length);
const added=currentNames.filter(p=>!source.files.some(f=>f.path===p));const removed=source.files.map(f=>f.path).filter(p=>!currentNames.includes(p));assert.deepEqual(removed,[]);
exact(drift,['backend/internal/systembackupevidence/download_retention_gc_test.go','backend/internal/systembackupevidence/download_retention_gc.go','backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go']);
exact(added,['backend/internal/systembackupevidence/download_retention_gc_producer.go','backend/internal/systembackupevidence/download_retention_gc_producer_test.go']);
const report={kind:'d_download_producer_owners_actual_mysql_review',recorded_at:new Date().toISOString(),status:'accepted_exact_eighteen_producer_owner_cases_only',
  log:prefix+'.txt',log_sha256:sha256(logBytes),source_manifest:prefix+'-source.json',source_manifest_sha256:sha256(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,
  baseline:baseline,baseline_events_sha256:sha256(raw(baseline+'.jsonl')),local_stages:stages.map(s=>({package:s.package,main:s.names.filter(n=>!n.includes('/')).length,all:s.names.length,elapsed:s.elapsed})),detached_seed_checks:22,
  actual:{mysql:run[5],namespace:run[1],namespace_uid:run[2],app_image:run[3],mysql_image:run[4],binary_sha256:probe[1],inputs_sha256:probe[2],migration_binary_sha256:runner[1],catalog_sha256:catalog.hash,migrations:95,root,cases,main:1,leaves:18,elapsed_seconds:90.81,databases,observed_locks:observedLocks},
  cleanup:{local_owner:owner,local_owner_independently_absent:true,namespace_exact_uid_reported:true,remote_scratch_reported:true,local_build_cache_reported:true},final_postcheck:true,default_vet:true,outer_exit:0,dependencies_installed:false,
  current:{matches_frozen:false,changed:drift,added,removed,list:currentList,list_sha256:sha256(raw(currentList)),scope:'current GC producer component and A tagged fixture repairs are not covered by this historical frozen run'},
  socket_warnings:{count:socketWarnings.length,assessment:'SSH client warnings retained; subsequent payload PASS, cleanup, frozen postcheck and final exit zero are independently present'},
  boundaries:{owner_adapter:'SQLDownloadOwners',provider_transport:'synthetic',production_tasks:false,human_mfa:false,production_approval:false,gc_accepted:false,six_scope_complete:false,prior_twelve_task_cases_rerun:false,remote_executed_by_reviewer:false}};
if(process.argv.includes('--check')){const saved=JSON.parse(read(receiptPath));report.recorded_at=saved.recorded_at;assert.deepEqual(saved,report);console.log('PASS producer actual MySQL eighteen leaves, four exact lock observations, pins, cleanup and exit zero; current GC changes excluded');}
else{assert.equal(fs.existsSync(path.join(workspace,receiptPath)),false);fs.writeFileSync(path.join(workspace,receiptPath),JSON.stringify(report,null,2)+'\n');console.log(receiptPath);}
