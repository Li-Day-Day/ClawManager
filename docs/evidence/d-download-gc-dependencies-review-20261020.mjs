import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const raw = p => fs.readFileSync(path.join(root, p));
const read = p => {const b=raw(p); return b.toString(b[0]===255 && b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replaceAll('\r','');};
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function source(p) {
  const s=JSON.parse(read(p));
  assert.equal(s.stable_copy_verified,true); assert.equal(s.dependencies_installed,false); assert.equal(s.production_approved,false);
  assert.equal(new Set(s.files.map(f=>f.path)).size,s.files.length);
  assert.equal(sha(Buffer.from(s.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),s.source_sha256);
  return s;
}
const events = p => read(p).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
const passed = es => es.filter(e=>e.Test && e.Action==='pass');
function counts(es) {const p=passed(es); return {main:p.filter(e=>!e.Test.includes('/')).length,all:p.length};}
function goodEvents(es) {
  assert.ok(!es.some(e=>['fail','build-fail','skip'].includes(e.Action)));
  assert.deepEqual(es.filter(e=>e.Test && e.Action==='run').map(e=>e.Package+'/'+e.Test).sort(),passed(es).map(e=>e.Package+'/'+e.Test).sort());
}
function run(stem, success) {
  const p='docs/evidence/'+stem, s=source(p+'-source.json'), log=read(p+'-native.txt'), es=events(p+'.jsonl');
  for(const m of ['default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes','CLEANED snapshot=True',`d_admission_native_exit=${success?0:1}`]) assert.ok(log.includes(m),stem+': '+m);
  assert.equal(read(p+'-stderr.txt'),'');
  const owner=log.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)$/m)[1].trim();
  assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase()); assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/); assert.equal(fs.existsSync(owner),false);
  if(success) goodEvents(es);
  else {assert.ok(es.some(e=>e.Action==='fail' && !e.Test)); assert.ok(es.filter(e=>e.Test && e.Action==='fail').every(e=>e.Test.startsWith('TestDownloadRetentionGCTaskCollectorLateArtifactDependenciesRollback'))); assert.ok(read(p+'.jsonl').includes('concrete dependency guard/target write not exercised'));}
  return {p,s,log,es,record:{prefix:p,source_sha256:s.source_sha256,source_files:s.files.length,manifest_sha256:sha(raw(p+'-source.json')),events_sha256:sha(raw(p+'.jsonl')),native_sha256:sha(raw(p+'-native.txt')),exit:success?0:1,...counts(es),failed:es.filter(e=>e.Test && e.Action==='fail').map(e=>e.Test),packages:es.filter(e=>!e.Test && e.Action==='pass').map(e=>e.Package).sort(),default_vet:true,source_postchecks:true,owner,owner_absent:true}};
}
const initial=run('d-download-gc-dependencies-20261020-r1',false);
const focused=run('d-download-gc-dependencies-20261020-r2',true);
const priorFull=run('d-download-gc-dependencies-20261020-r3',true);
const clock=run('d-download-producer-clock-20261020-r1',true);
const final=run('d-download-gc-dependencies-20261020-r4',true);
assert.equal(final.s.source_sha256,'04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df');
assert.ok(final.log.includes('NATIVE_PARALLELISM build=1 gomaxprocs=1'));
assert.deepEqual(final.record.packages,['clawreef/internal/systembackupevidence','clawreef/internal/systembackupproducer','clawreef/internal/systembackupread','clawreef/internal/systembackupsecurity'].sort());
function changes(a,b) {const m=new Map(a.files.map(f=>[f.path,f.sha256])); assert.deepEqual(a.files.map(f=>f.path),b.files.map(f=>f.path)); return b.files.filter(f=>m.get(f.path)!==f.sha256).map(f=>f.path);}
assert.deepEqual(changes(focused.s,priorFull.s),['backend/internal/systembackupevidence/download_retention_gc_dependencies_test.go']);
assert.deepEqual(changes(priorFull.s,final.s),['backend/internal/systembackupevidence/download_producer_owner_test.go','scripts/system-backup-d-download-admission-native-validation.ps1']);
assert.deepEqual(changes(clock.s,final.s),['scripts/system-backup-d-download-admission-native-validation.ps1']);
const priorNames=new Set(passed(priorFull.es).map(e=>e.Package+'/'+e.Test)), finalNames=new Set(passed(final.es).map(e=>e.Package+'/'+e.Test));
assert.ok([...priorNames].every(n=>finalNames.has(n)));
assert.deepEqual([...finalNames].filter(n=>!priorNames.has(n)).sort(),['normal','sql_clock_advances_after_six_seconds'].map(n=>'clawreef/internal/systembackupevidence/TestProducerDownloadActualAdmissionProviderAndRevokedResult/'+n));
assert.ok(passed(focused.es).every(e=>finalNames.has(e.Package+'/'+e.Test)));
for(const r of [clock,final]) for(const n of ['TestProducerDownloadActualAdmissionProviderAndRevokedResult/normal','TestProducerDownloadActualAdmissionProviderAndRevokedResult/sql_clock_advances_after_six_seconds']) assert.ok(passed(r.es).some(e=>e.Test===n));
const dependencyTests=passed(final.es).filter(e=>e.Test.startsWith('TestDownloadRetentionGCTask')||e.Test.startsWith('TestDownloadRetentionGCCollectorLateArtifactDependencies'));
assert.ok(dependencyTests.some(e=>e.Test.endsWith('later_expired_task')));
const probeRecords=[];
for(const r of [priorFull,final]) {
  for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']) {assert.ok(r.log.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`)); assert.equal(read(r.p+'-'+stage+'-stderr.txt'),'');}
  const seed=events(r.p+'-tagged-seed.txt'); goodEvents(seed); assert.deepEqual(counts(seed),{main:3,all:22});
  const detached=read(r.p+'-detached-seed.txt'); assert.equal((detached.match(/^\s*--- PASS:/gm)||[]).length,22); assert.ok(!detached.includes('--- FAIL:')); assert.match(detached.trimEnd(),/PASS$/);
  const binaries=[...r.log.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]})); assert.equal(binaries.length,3);
  probeRecords.push({prefix:r.p,seeds:22,detached:22,binaries});
}
const failedPath='docs/evidence/d-download-producer-remote-20261020-152115.txt', old=read(failedPath), oldSource=source('docs/evidence/d-download-producer-remote-20261020-152115-source.json');
assert.equal(oldSource.source_sha256,'b9e29a7d5dc749665d391381ef349f7693d804abb7296b1ca05ee8932e763252');
const oldPins=new Map(oldSource.files.map(f=>[f.path,f.sha256])), finalPins=new Map(final.s.files.map(f=>[f.path,f.sha256]));
assert.ok(oldSource.files.every(f=>finalPins.has(f.path)));
const changedSinceOperator=final.s.files.filter(f=>oldPins.get(f.path)!==f.sha256).map(f=>f.path);
assert.deepEqual(changedSinceOperator.slice().sort(),['backend/internal/systembackupevidence/download_producer_owner_test.go','backend/internal/systembackupevidence/download_retention_gc_dependencies_test.go','backend/internal/systembackupevidence/download_retention_gc_task.go','backend/internal/systembackupevidence/download_retention_gc_task_test.go','scripts/system-backup-d-download-admission-native-validation.ps1'].sort());
const oldFailures=[...old.matchAll(/^\s*--- FAIL: (\S+) /gm)].map(m=>m[1]); assert.deepEqual(oldFailures,['TestProducerDownloadActualAdmissionProviderAndRevokedResult']);
assert.ok(old.includes('producer exact-object stat permission_denied')); assert.ok(old.includes('(5.46s)')); assert.ok(old.includes('remote validation has not started')); assert.ok(!/^RUN namespace=|^PASS d-download-producer-mysql/m.test(old)); assert.match(old.trimEnd(),/download_producer_exit=1$/);
const oldOwner=old.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim(); assert.equal(fs.existsSync(oldOwner),false); assert.ok(old.includes(`LOCAL_CLEANUP config-writer-source-owned=${oldOwner} removed=True`)); assert.ok(old.includes('CLEANED local-registration-build-cache=True'));
const currentList='docs/evidence/d-download-gc-dependencies-current-files-20261020.txt'; assert.deepEqual(read(currentList).trim().split('\n'),final.s.files.map(f=>f.path));
for(const f of final.s.files) {const b=raw(f.path); assert.equal(b.length,f.size,f.path); assert.equal(sha(b),f.sha256,f.path);}
const capsule='backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json'; assert.equal(sha(raw(capsule)),'a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0');
const cleanupPath='docs/evidence/d-download-gc-dependencies-cleanup-20261020.json', cleanup=JSON.parse(read(cleanupPath));
assert.equal(cleanup.dependencies_installed,false); assert.equal(cleanup.remote_run,false); assert.equal(cleanup.paths.length,6);
for(const e of cleanup.paths) {assert.equal(e.absent,true); assert.equal(fs.existsSync(e.path),false);}
for(const r of [initial,focused,priorFull,clock,final]) assert.ok(cleanup.paths.some(e=>e.path===r.record.owner));
const record={kind:'d_gc_task_dependency_and_producer_clock_local_review',recorded_at:new Date().toISOString(),operator_failure:{log:failedPath,sha256:sha(raw(failedPath)),source_sha256:oldSource.source_sha256,failed_tests:oldFailures,exit:1,remote_started:false,actual_producer_cases:0,source_owner:oldOwner,source_and_cache_cleaned:true,root_cause:'Success fixture kept a frozen simulated SQL clock; Stat crossed the unchanged five-second production clock-skew check. Sample only actual SQL time queries after commit, retaining original proof, request, claim, capacity and retention deadlines.'},changed_since_operator:changedSinceOperator,initial_failed:initial.record,initial_failure_reason:'Rollback tests checked a write in the read-query recorder. Assertions now use exact writes; original exit 1 preserved. Absence-only sibling prototype superseded to avoid mutually blocking expired metadata groups.',focused:focused.record,prior_full_before_clock_fix:priorFull.record,clock_control:clock.record,final_serial:final.record,gc_task_checks:counts(dependencyTests),probes:probeRecords,current_input_list:currentList,current_pinned_sources_match:true,cleanup:cleanupPath,dependencies_installed:false,remote_run:false,actual_producer_cases:0,production_approved:false,scope:'Local models, default vet, frozen sources and offline probe preparation. Original MySQL eighteen cases, full GC policy, catalog/import dependencies, actual locks/permissions/DDL freeze and original six scopes remain pending.'};
const output=path.join(root,'docs/evidence/d-download-gc-dependencies-accepted-20261020.json');
if(process.argv.includes('--check')) {const saved=JSON.parse(fs.readFileSync(output,'utf8')); record.recorded_at=saved.recorded_at; assert.deepEqual(record,saved);} else {assert.equal(fs.existsSync(output),false);fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({final_serial:final.record,clock_control:clock.record,gc_task_checks:record.gc_task_checks,remote_run:false,cleaned_directories:cleanup.paths.length}));
