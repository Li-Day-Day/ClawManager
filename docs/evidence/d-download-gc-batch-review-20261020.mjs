// Offline review only; no test runner, network, dependency install or cleanup.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,decode,sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw=p=>fs.readFileSync(path.join(workspace,p));
const read=p=>decode(raw(p));
const events=p=>read(p).trim().split('\n').filter(Boolean).map(JSON.parse);
const exact=(a,b)=>{assert.equal(new Set(a).size,a.length);assert.deepEqual(a.slice().sort(),b.slice().sort());};
function inspect(stem,packages,batchRoots=6) {
  const prefix='docs/evidence/'+stem,source=JSON.parse(read(prefix+'-source.json')),native=read(prefix+'-native.txt'),es=events(prefix+'.jsonl');
  assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
  assert.equal(new Set(source.files.map(f=>f.path)).size,source.files.length);
  assert.equal(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
  assert.ok(!es.some(e=>['fail','build-fail','skip'].includes(e.Action)));
  const passed=es.filter(e=>e.Test&&e.Action==='pass');
  exact(es.filter(e=>e.Test&&e.Action==='run').map(e=>e.Package+'/'+e.Test),passed.map(e=>e.Package+'/'+e.Test));
  exact(es.filter(e=>!e.Test&&e.Action==='pass').map(e=>e.Package),packages);
  assert.match(native,/NATIVE_EXIT (?:focused|full)_packages=0 .*default_vet=yes/);
  assert.match(native,/FROZEN_UNIT_POSTCHECK pass=yes/);assert.match(native,/FROZEN_POSTCHECK pass=yes/);assert.match(native,/d_admission_native_exit=0/);
  assert.match(native,/NATIVE_PARALLELISM build=1 gomaxprocs=1/);assert.match(native,/NATIVE_TIME_BUDGET package_timeout_seconds=900 request_deadlines_unchanged=yes/);
  const owner=[...native.matchAll(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/gm)];assert.equal(owner.length,1);
  assert.equal(Number(owner[0][1]),source.files.length);assert.equal(owner[0][2],source.source_sha256);
  const owned=owner[0][3].trim();assert.equal(path.dirname(path.resolve(owned)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(owned),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owned),false);assert.match(native,/CLEANED snapshot=True/);
  const stages=[];
  for(const name of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
    assert.ok(native.includes(`NATIVE_PROBE stage=${name} exit=0 actual_mysql=no`));
    const output=prefix+'-'+name+'.txt',stderr=prefix+'-'+name+'-stderr.txt';assert.equal(raw(stderr).length,0);
    stages.push({stage:name,output_sha256:sha256(raw(output)),stderr_sha256:sha256(raw(stderr))});
  }
  const seed=events(prefix+'-tagged-seed.txt');assert.ok(!seed.some(e=>['fail','build-fail','skip'].includes(e.Action)));
  const seedNames=seed.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test);assert.equal(seedNames.length,22);assert.equal(seedNames.filter(n=>!n.includes('/')).length,3);
  exact(seed.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test),seedNames);
  const detached=read(prefix+'-detached-seed.txt');exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]),seedNames);exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]),seedNames);assert.match(detached,/\nPASS\s*$/);assert.doesNotMatch(detached,/--- FAIL:|--- SKIP:|panic:/);
  const binary=[...native.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));exact(binary.map(b=>b.name),['download-admission.test.exe','download-admission.test','system-backup-migrate']);
  const batch=passed.filter(e=>/^TestDownloadRetentionGCBatch/.test(e.Test));assert.equal(batch.filter(e=>!e.Test.includes('/')).length,batchRoots);
  return {source,names:passed.map(e=>e.Package+'/'+e.Test),batch_names:batch.map(e=>e.Test),record:{prefix,source_files:source.files.length,source_sha256:source.source_sha256,source_manifest_sha256:sha256(raw(prefix+'-source.json')),events_sha256:sha256(raw(prefix+'.jsonl')),native_sha256:sha256(raw(prefix+'-native.txt')),main:passed.filter(e=>!e.Test.includes('/')).length,all:passed.length,batch_main:batchRoots,batch_all:batch.length,packages,default_vet:true,exit:0,owner:owned,owner_absent:true,seed_checks:22,detached_checks:22,probe_stages:stages,binaries:binary}};
}
function interruptedFocused() {
  const prefix='docs/evidence/d-download-gc-batch-20261020-r2',source=JSON.parse(read(prefix+'-source.json')),es=events(prefix+'.jsonl'),native=read(prefix+'-native.txt');
  const preflightPath='docs/evidence/d-download-gc-batch-r2-interruption-preflight-20261021.json',interruptionPath='docs/evidence/d-download-gc-batch-r2-interruption-20261021.json';
  const preflight=JSON.parse(read(preflightPath)),interruption=JSON.parse(read(interruptionPath));
  assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);
  assert.equal(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),source.source_sha256);
  assert.equal(source.source_sha256,preflight.source_sha256);assert.equal(source.files.length,preflight.source_files);
  for(const [field,file] of [['source_manifest_sha256',prefix+'-source.json'],['native_sha256',prefix+'-native.txt'],['events_sha256',prefix+'.jsonl'],['tagged_seed_sha256',prefix+'-tagged-seed.txt']])assert.equal(preflight[field],sha256(raw(file)));
  assert.ok(!es.some(e=>['fail','build-fail','skip'].includes(e.Action)));const passed=es.filter(e=>e.Test&&e.Action==='pass');
  exact(es.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test),passed.map(e=>e.Test));assert.equal(passed.length,42);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,6);
  exact(es.filter(e=>!e.Test&&e.Action==='pass').map(e=>e.Package),['clawreef/internal/systembackupevidence']);
  assert.match(native,/NATIVE_EXIT focused_packages=0 .*default_vet=yes/);assert.match(native,/FROZEN_UNIT_POSTCHECK pass=yes/);assert.match(native,/NATIVE_PROBE stage=tagged-seed exit=0/);assert.match(native,/NATIVE_PROBE stage=windows-probe exit=0/);
  assert.doesNotMatch(native,/FROZEN_POSTCHECK pass=yes|d_admission_native_exit=|CLEANED snapshot=True/);
  assert.equal(preflight.original_final_exit,null);assert.equal(preflight.original_final_postcheck,false);assert.equal(preflight.owned_source_all_pins_match,true);
  assert.equal(interruption.status,'interrupted_after_focused_and_windows_probe');assert.equal(interruption.original_final_exit,null);assert.equal(interruption.original_final_postcheck,false);assert.equal(interruption.tool_handle_missing,true);assert.deepEqual(interruption.matching_processes,[]);assert.equal(interruption.exists,false);assert.equal(interruption.owner,preflight.owner);assert.equal(fs.existsSync(interruption.owner),false);assert.equal(interruption.preflight_sha256,sha256(raw(preflightPath)));
  return {source,batch_names:passed.map(e=>e.Test),record:{prefix,source_files:source.files.length,source_sha256:source.source_sha256,source_manifest_sha256:sha256(raw(prefix+'-source.json')),events_sha256:sha256(raw(prefix+'.jsonl')),native_sha256:sha256(raw(prefix+'-native.txt')),main:6,all:42,batch_main:6,batch_all:42,default_vet:true,unit_exit:0,original_final_exit:null,original_final_postcheck:false,interrupted:true,owner:interruption.owner,owner_absent:true,post_interruption_source_pins_match:true,seed_checks:22,detached_checks:0,windows_compile_reported_exit:0,interruption:interruptionPath,interruption_sha256:sha256(raw(interruptionPath)),preflight:preflightPath,preflight_sha256:sha256(raw(preflightPath))}};
}
const prototype=inspect('d-download-gc-batch-20261020-r1',['clawreef/internal/systembackupevidence'],5);
const focused=interruptedFocused();
const full=inspect('d-download-gc-batch-20261020-r3',['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer']);
exact(focused.batch_names,full.batch_names);
for(const p of ['backend/internal/systembackupevidence/download_retention_gc_batch.go','backend/internal/systembackupevidence/download_retention_gc_batch_test.go']){
  const f=full.source.files.find(f=>f.path===p),b=raw(p);assert.ok(f);assert.equal(sha256(b),f.sha256);assert.equal(b.length,f.size);
}
const cleanupPath='docs/evidence/d-download-gc-batch-cleanup-20261020.json',cleanup=JSON.parse(read(cleanupPath));
assert.equal(cleanup.dependencies_installed,false);assert.equal(cleanup.remote_run,false);assert.equal(cleanup.paths.length,4);
for(const p of cleanup.paths){assert.equal(p.exists,false);assert.equal(fs.existsSync(p.path),false);}
for(const owner of [prototype.record.owner,focused.record.owner,full.record.owner])assert.ok(cleanup.paths.some(p=>p.path===owner));
const currentList='docs/evidence/d-download-gc-batch-current-files-20261020.txt';
const currentNames=read(currentList).trim().split('\n').filter(Boolean);exact(currentNames,full.source.files.map(f=>f.path));
for(const f of full.source.files){const b=raw(f.path);assert.equal(b.length,f.size,f.path);assert.equal(sha256(b),f.sha256,f.path);}
const record={kind:'d_download_retention_gc_batch_local_preparation',recorded_at:new Date().toISOString(),prototype_before_schema_prerequisite:prototype.record,focused:focused.record,full:full.record,exact_focused_batch_inventory:true,current_sources_match:true,current_list:currentList,current_list_sha256:sha256(raw(currentList)),cleanup:cleanupPath,cleanup_sha256:sha256(raw(cleanupPath)),dependencies_installed:false,remote_run:false,actual_sql_cases:0,production_approved:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url))),scope:'Bounded candidate page and counters, candidate enum prerequisite fails closed on formal schema without proposal, fresh full collector per group, current-policy rejection, canceled/failed work and unknown commit stop without retry. SQL transport/policy/physical capacity remain scripted; actual scan plans, InnoDB, complete policy, roles, tombstone expiry, durable scheduler and original six scopes remain pending.'};
const output=path.join(workspace,'docs/evidence/d-download-gc-batch-preparation-20261020.json');
if(process.argv.includes('--check')){const saved=JSON.parse(fs.readFileSync(output,'utf8'));record.recorded_at=saved.recorded_at;assert.deepEqual(record,saved);}else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:'accepted_local_preparation',focused:[record.focused.main,record.focused.all],full:[record.full.main,record.full.all],source_files:record.full.source_files,actual_sql_cases:0,cleanup_paths:4}));
