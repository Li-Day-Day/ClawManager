// Offline review only: this component does not prove a complete GC policy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace,decode,sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw=p=>fs.readFileSync(path.join(workspace,p));
const read=p=>decode(raw(p));
const exact=(a,b)=>assert.deepEqual(a.slice().sort(),b.slice().sort());
const jsonLines=p=>read(p).trim().split('\n').filter(Boolean).map(JSON.parse);
const base='docs/evidence/d-download-gc-batch-20261020-r3';
const prefix='docs/evidence/d-download-gc-producer-20261021-r5';
const output='docs/evidence/d-download-gc-producer-preparation-20261021.json';
const rootPattern=/^TestDownloadRetentionGC(?:Producer|OriginalManifestAndCreation)/;
function sourceManifest(p){
  const s=JSON.parse(read(p+'-source.json'));
  assert.equal(s.stable_copy_verified,true);assert.equal(s.dependencies_installed,false);assert.equal(s.production_approved,false);
  assert.equal(new Set(s.files.map(f=>f.path)).size,s.files.length);
  for(const f of s.files){assert.match(f.path,/^(backend|contracts|scripts|docs)\//);assert.ok(!f.path.includes('\\')&&!f.path.split('/').some(p=>['..','.',''].includes(p)));assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(f.size)&&f.size>=0);}
  assert.equal(sha256(s.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),s.source_sha256);
  return s;
}
function native(p,expectedExit){
  const text=read(p+'-native.txt'),s=sourceManifest(p);
  const m=[...text.matchAll(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/gm)];assert.equal(m.length,1);
  assert.equal(Number(m[0][1]),s.files.length);assert.equal(m[0][2],s.source_sha256);
  const owner=m[0][3].trim();assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(owner),false);assert.match(text,/NATIVE_PARALLELISM build=1 gomaxprocs=1/);
  assert.match(text,/FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);assert.match(text,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);assert.match(text,/CLEANED snapshot=True/);
  const exits=[...text.matchAll(/^d_admission_native_exit=(\d+)$/gm)];assert.equal(exits.length,1);assert.equal(Number(exits[0][1]),expectedExit);
  assert.equal(raw(p+'-stderr.txt').length,0);
  return {text,source:s,record:{prefix:p,source_sha256:s.source_sha256,source_files:s.files.length,source_manifest_sha256:sha256(raw(p+'-source.json')),events_sha256:sha256(raw(p+'.jsonl')),native_sha256:sha256(raw(p+'-native.txt')),exit:expectedExit,owner,owner_absent:true,unit_postcheck:true,final_postcheck:true,default_vet:true}};
}
const failedRuns=[];
for(const [n,expected,reason] of [
  [1,['TestDownloadRetentionGCProducerReceiptFacts/null_version','TestDownloadRetentionGCProducerReceiptFacts/no_version','TestDownloadRetentionGCProducerReceiptFacts'],'invalid-version fixture was rejected by public typed encoder before entering component'],
  [2,['TestDownloadRetentionGCProducerReceiptFacts/null_version','TestDownloadRetentionGCProducerReceiptFacts/no_version','TestDownloadRetentionGCProducerReceiptFacts','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_eligible_run','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback'],'typed frame incorrectly treated as JSON, and paired history aging introduced non-SQL audit timestamp precision'],
  [3,['TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_eligible_run','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback'],'typed-frame fixture fixed; paired audit precision still invalid'],
  [4,['TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_eligible_run','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback'],'focused paired diagnostic located rejection at original audit verification; no GC writes']
]){
  const p=`docs/evidence/d-download-gc-producer-20261021-r${n}`,v=native(p,1),es=jsonLines(p+'.jsonl');
  assert.ok(!es.some(e=>['skip','build-fail'].includes(e.Action)));
  exact(es.filter(e=>e.Test&&e.Action==='fail').map(e=>e.Test),expected);
  assert.equal(es.filter(e=>!e.Test&&e.Action==='fail').length,1);
  failedRuns.push({...v.record,failed_tests:expected,reason});
}
const full=native(prefix,0),events=jsonLines(prefix+'.jsonl');
assert.ok(!events.some(e=>['fail','skip','build-fail'].includes(e.Action)));
assert.match(full.text,/NATIVE_EXIT full_packages=0 .*default_vet=yes/);
const packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer'];
exact(events.filter(e=>!e.Test&&e.Action==='pass').map(e=>e.Package),packages);
const baseline=jsonLines(base+'.jsonl');assert.ok(!baseline.some(e=>['fail','skip','build-fail'].includes(e.Action)));
const packageResults=[];
for(const p of packages){
  const names=events.filter(e=>e.Package===p&&e.Test&&e.Action==='pass').map(e=>e.Test);
  exact(events.filter(e=>e.Package===p&&e.Test&&e.Action==='run').map(e=>e.Test),names);assert.equal(new Set(names).size,names.length);
  const oldNames=baseline.filter(e=>e.Package===p&&e.Test&&e.Action==='pass').map(e=>e.Test);
  const added=names.filter(n=>!oldNames.includes(n));assert.ok(added.every(n=>rootPattern.test(n)));
  exact(names.filter(n=>!rootPattern.test(n)),oldNames);
  packageResults.push({package:p,main:names.filter(n=>!n.includes('/')).length,all:names.length,elapsed_seconds:events.find(e=>e.Package===p&&!e.Test&&e.Action==='pass').Elapsed});
}
const component=events.filter(e=>e.Test&&e.Action==='pass'&&rootPattern.test(e.Test)).map(e=>e.Test);
assert.equal(component.length,75);assert.equal(component.filter(n=>!n.includes('/')).length,8);
for(const mode of ['complete','late_eligible_run','late_expired_reference'])assert.ok(component.includes('TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/'+mode));
assert.equal(packageResults.reduce((n,p)=>n+p.main,0),754);assert.equal(packageResults.reduce((n,p)=>n+p.all,0),6242);
const seeds=jsonLines(prefix+'-tagged-seed.txt');assert.ok(!seeds.some(e=>['fail','skip','build-fail'].includes(e.Action)));
const seedNames=seeds.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test);assert.equal(seedNames.length,22);assert.equal(seedNames.filter(n=>!n.includes('/')).length,3);
exact(seeds.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test),seedNames);
exact(seedNames,jsonLines(base+'-tagged-seed.txt').filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test));
const detached=read(prefix+'-detached-seed.txt');exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]),seedNames);exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]),seedNames);assert.match(detached,/\nPASS\s*$/);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){assert.match(full.text,new RegExp('NATIVE_PROBE stage='+stage+' exit=0 actual_mysql=no'));assert.equal(raw(prefix+'-'+stage+'-stderr.txt').length,0);}
const binaries=[...full.text.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));exact(binaries.map(b=>b.name),['download-admission.test.exe','download-admission.test','system-backup-migrate']);
const cleanupPath='docs/evidence/d-download-gc-producer-cleanup-20261021.json',cleanup=JSON.parse(read(cleanupPath));assert.equal(cleanup.dependencies_installed,false);assert.equal(cleanup.remote_run,false);assert.equal(cleanup.paths.length,6);
for(const p of cleanup.paths){assert.equal(p.exists,false);assert.equal(fs.existsSync(p.path),false);}
for(const owner of [...failedRuns.map(r=>r.owner),full.record.owner])assert.ok(cleanup.paths.some(p=>p.path===owner));
const listPath='docs/evidence/d-download-gc-producer-current-files-20261021.txt';exact(read(listPath).trim().split('\n'),full.source.files.map(f=>f.path));
for(const f of full.source.files){const b=raw(f.path);assert.equal(b.length,f.size,f.path);assert.equal(sha256(b),f.sha256,f.path);}
const report={kind:'d_download_gc_producer_component_preparation',recorded_at:new Date().toISOString(),status:'local_component_preparation_only',source:{manifest:prefix+'-source.json',files:full.source.files.length,sha256:full.source.source_sha256,current_sources_match:true,current_file_list:listPath,current_file_list_sha256:sha256(raw(listPath))},full:{...full.record,packages:packageResults,main:754,all:6242},component:{main:8,all:75,names:component,sql_transport:'scripted',real_admission_and_result_methods:true,collector_rollback_cases:3,guards_keep_original_c1_rows:true},probes:{seed_roots:3,seed_checks:22,detached_checks:22,binaries,actual_mysql:false},failed_runs:failedRuns,cleanup:{path:cleanupPath,sha256:sha256(raw(cleanupPath)),owned_directories_absent:6},boundaries:{dependencies_installed:false,remote_run:false,actual_sql_cases:0,complete_policy:false,production_activation:false,provider_delete:false,immutable_version_proof:'consistent original C1 receipts only; deleted envelope has no independent physical-version field',remaining:['complete catalog/import/logical/bootstrap dependency lifecycle','GC role, full metadata visibility and DDL freeze','actual MySQL collector plans and locks','physical capacity and production assembly','durable batches and tombstone lifecycle','original six scopes']}};
if(process.argv.includes('--check')){const saved=JSON.parse(read(output));report.recorded_at=saved.recorded_at;assert.deepEqual(saved,report);console.log('PASS GC producer local component 8/75, full four packages 754/6242, original paired rollback, offline probes and six owned directories absent');}
else{assert.equal(fs.existsSync(path.join(workspace,output)),false);fs.writeFileSync(path.join(workspace,output),JSON.stringify(report,null,2)+'\n');console.log(output);}
