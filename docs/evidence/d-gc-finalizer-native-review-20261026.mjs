import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [mode,supplementArg,outputArg]=process.argv.slice(2);
assert.ok(['--write','--check','--write-frozen','--check-frozen'].includes(mode) && supplementArg && outputArg,'--write/--check or --write-frozen/--check-frozen <terminal validation receipt> <new review receipt>');
const frozenOnly=mode.endsWith('-frozen');
const resolve=p=>path.resolve(root,p),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(resolve(p),'utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(read(p));
const pin=p=>({path:path.relative(root,resolve(p)).replaceAll('\\','/'),sha256:hash(fs.readFileSync(resolve(p)))});
const primaryArg='docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af.json';
const primary=json(primaryArg),supplement=json(supplementArg);
const segmented=resolve(primaryArg)!==resolve(supplementArg);
const checkpointArg='docs/evidence/d-gc-finalizer-first-segment-checkpoint-20261026.json',checkpoint=json(checkpointArg);
const inputs=new Set([primaryArg,supplementArg,checkpointArg,checkpoint.log,'docs/evidence/d-gc-finalizer-native-review-20261026.mjs']);
for(const r of (segmented?[primary,supplement]:[primary])){
 assert.equal(r.kind,'d_local_closeout_validation.v1');
 for(const k of ['dependencies_installed','remote_contacted','actual_mysql','production_approved'])assert.equal(r[k],false);
 assert.equal(r.owner_removed,true);assert.equal(fs.existsSync(r.owner),false);
 assert.equal(pin(r.runner).sha256,r.runner_sha256);inputs.add(r.runner);inputs.add(r.source);
 assert.equal(pin('docs/evidence/d-local-closeout-snapshot-20261023.mjs').sha256,r.snapshotter_sha256);
 assert.equal(pin('docs/evidence/d-gc-finalizer-counterexamples-prepare-20261026.mjs').sha256,r.counterexample_helper_sha256);
 for(const s of r.steps){assert.equal(pin(s.log).sha256,s.sha256);inputs.add(s.log);for(const a of s.attempts??[]){assert.equal(pin(a.log).sha256,a.sha256);inputs.add(a.log);}}
}
assert.equal(primary.runner_profile,'finalizer_diagnostics_six_packages_three_seeds_owner_packaged_detached_linux_five_builds_standalone_two_predecessor_counterexamples');
if(segmented){
 assert.equal(primary.error,'Detached owner seeds failed');
 assert.equal(primary.steps.length,13);assert.equal(primary.steps[12].exit_code,2);
 assert.match(read(primary.steps[12].log),/flag provided but not defined: -test/);
 assert.equal(primary.frozen_postcheck,false);
}else{
 assert.equal(primary.error,null);assert.equal(primary.steps.length,23);assert.equal(primary.frozen_postcheck,true);
}
assert.equal(checkpoint.kind,'d_gc_finalizer_source_checkpoint.v1');assert.equal(checkpoint.native_exit,0);
assert.deepEqual(checkpoint.after_completed_stages,Array.from({length:11},(_,i)=>i));
assert.equal(pin(checkpoint.log).sha256,checkpoint.log_sha256);assert.match(read(checkpoint.log),/LOCAL_SOURCE frozen_postcheck=yes/);
if(segmented){
 assert.equal(supplement.runner_profile,'finalizer_same_source_supplement_after_primary_stages_0_to_10');
 assert.equal(supplement.error,null);assert.equal(supplement.frozen_postcheck,true);assert.equal(supplement.steps.length,13);
}
const manifest=json(primary.source),second=json(supplement.source);
assert.deepEqual(second,manifest,'Both segments must use byte-identical complete source snapshots');
assert.equal(manifest.source_sha256,'41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16');
assert.equal(manifest.stable_copy_verified,true);
assert.equal(hash(manifest.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),manifest.source_sha256);
const rgArg='docs/evidence/d-gc-finalizer-rg-inputs-20261026.txt';inputs.add(rgArg);
const extras=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
function currentFiles(){
 const result=[];
 function walk(rel){
  assert.equal(fs.lstatSync(resolve(rel)).isSymbolicLink(),false,`Redirected current source: ${rel}`);
  for(const e of fs.readdirSync(resolve(rel),{withFileTypes:true})){
   const name=rel+'/'+e.name;
   assert.equal(e.isSymbolicLink(),false,`Redirected current source: ${name}`);
   if(e.isDirectory()){
    if(!['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name))walk(name);
   }else if(e.isFile() && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name) && (!name.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(name) || extras.has(name)))result.push(name);
  }
 }
 for(const rel of ['backend','contracts','scripts','docs'])walk(rel);
 return result.sort();
}
const currentBefore=currentFiles();
assert.deepEqual(currentBefore,manifest.files.map(p=>p.path).sort(),'Current complete source set differs from frozen source');
const currentPins=[],currentDrift=[];
for(const p of manifest.files){
 const b=fs.readFileSync(resolve(p.path)),actual={path:p.path,size:b.length,sha256:hash(b)};
 currentPins.push(actual);
 if(actual.size!==p.size || actual.sha256!==p.sha256)currentDrift.push({path:p.path,frozen_size:p.size,frozen_sha256:p.sha256,current_size:actual.size,current_sha256:actual.sha256});
}
if(frozenOnly){
 // This mode certifies ONLY the completed immutable run. It cannot publish
 // current whole-tree acceptance. The separately owned tagged HTTP repair
 // must provide its own current seed/build/source/cleanup acceptance.
 assert.deepEqual(currentDrift.map(p=>p.path),['backend/cmd/server/system_backup_read_drill_history_mysql_test.go']);
 assert.equal(currentDrift[0].frozen_sha256,'04ff3f7266b9b99c72cd024b1c189e34fbb13c613231f7da41a1b1d63b09be9b');
 assert.equal(currentDrift[0].current_sha256,'e8df47f25eb1765cb354a7f88a1dc2952bc56b699129d7ac8ba604c91b3e21b7');
 assert.ok(read(currentDrift[0].path).startsWith('//go:build systembackup_mysql\n') || read(currentDrift[0].path).startsWith('//go:build systembackup_mysql\r\n'));
 inputs.add(currentDrift[0].path);
}else assert.deepEqual(currentDrift,[],'Current source bytes differ; no current acceptance can be published');
assert.deepEqual(currentFiles(),currentBefore,'Current source set changed during review');
const selected=read(rgArg).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).filter(p=>(!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || extras.has(p)) && !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p) && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p));
assert.deepEqual(selected.sort(),manifest.files.map(p=>p.path).sort());
// Discard primary's unexecuted Admin seed (wrong package) and failed detached
// pair. The same-source supplement runs the REAL Admin seed and every stage
// after the retained packaged owner seeds, including the correct Linux probe.
if(segmented){
 const emptySeed=read(primary.steps[9].log);assert.match(emptySeed,/no tests to run/);
 assert.equal(primary.steps[9].command.at(-1),'./internal/db');
}
const stages=segmented?[...primary.steps.slice(0,9),supplement.steps[0],primary.steps[10],...supplement.steps.slice(1)]:primary.steps;
assert.equal(stages.length,23);
function events(s,expectedFail=''){
 assert.equal(s.exit_code,expectedFail?1:0);assert.equal(s.expected_failure_test??'',expectedFail);
 const e=read(s.log).split(/\r?\n/).filter(l=>l.trim().startsWith('{')).map(l=>JSON.parse(l));
 assert.ok(e.length>0);
 assert.equal(e.filter(x=>x.Action==='skip'||x.Action==='build-fail').length,0);
 if(!expectedFail)assert.equal(e.filter(x=>x.Action==='fail').length,0);
 for(const attempt of (s.attempts??[]).slice(0,-1)){assert.equal(attempt.known_tool_crash,true);assert.equal(attempt.assertion_failure,false);assert.notEqual(attempt.exit_code,0);}
 assert.ok((s.attempts??[]).length<=3);
 return e;
}
const finalizerRoots=['TestDownloadGCFinalizerClosedBindingAndSingleUse','TestDownloadGCFinalizerConcurrentCopiesConsumeOnce','TestDownloadGCFinalizerRejectsDynamicallyIncomparableContext','TestDownloadGCFinalizerDeadlineZeroAndOutput','TestDownloadGCFinalizerProtectedCandidate','TestDownloadGCFinalizerCapturedFactsCannotBeRebound','TestDownloadGCFreezeFinalizationFollowsTicket'];
const diagnosticRoots=['TestAdmittedHTTPFixtureStillRejectsStaleSQLClock','TestAdmittedDownloadHTTPCompleteRangeAuditAndNoReplay','TestAdmittedDownloadHTTPInterruptionRevocationAndResultFailure','TestAdmittedDownloadHTTPPublicInternalAndClassificationRace','TestADownloadNativeBufferedOutputKeepsOriginalDeadline','TestGCProducerResultCapacitySamplingDoesNotRenewAdmission','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback',...finalizerRoots];
const roots=e=>e.filter(x=>x.Action==='pass'&&x.Test&&!x.Test.includes('/')).map(x=>x.Test).sort();
const names=e=>e.filter(x=>x.Action==='pass'&&x.Test).map(x=>x.Test).sort();
assert.deepEqual(roots(events(stages[0])),diagnosticRoots.sort());
const packages=['internal/systembackupevidence','internal/systembackupproducer','internal/systembackupresources','internal/systembackupread','internal/systembackupsecurity','cmd/server'].map(p=>'clawreef/'+p);
const full=stages.slice(1,7).map((s,i)=>{
 assert.equal(s.platform,'windows');assert.ok(!s.command.includes('-run')&&!s.command.includes('-tags'));assert.ok(s.command.includes('-count=1'));
 assert.equal(s.command.at(-1),packages[i].replace('clawreef/','./'));
 const e=events(s);assert.deepEqual(e.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package),[packages[i]]);return e;
});
const oldInventoryArg='docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json';inputs.add(oldInventoryArg);
const old=json(oldInventoryArg);let preserved=0;
for(const p of old.packages){const current=new Set(names(full[packages.indexOf(p.package)]));for(const t of p.tests){assert.ok(current.has(t),`Original owner test missing: ${p.package}/${t}`);preserved++;}}
assert.equal(preserved,5138);
let previousNative=0;
for(const [i,stage] of [[0,1],[4,5]]){
 const log=`docs/evidence/d-local-closeout-53f39288bb914e1ca2f2bd9287e7874a-step-${stage}.log`;inputs.add(log);
 const original=read(log).split(/\r?\n/).filter(l=>l.trim().startsWith('{')).map(l=>JSON.parse(l));
 const current=new Set(names(full[i]));for(const t of names(original)){assert.ok(current.has(t),`Previous current test missing: ${t}`);previousNative++;}
}
assert.equal(previousNative,5148);
const passed=new Set(names(full[0]));for(const t of [...finalizerRoots,'TestAFreezeTypedNilConnectorBoundary','TestDownloadRetentionGCUnknownCommitIsNotRetried','TestDownloadRetentionGCProtectedWorkWithFreezeOwner','TestDownloadRetentionGCProtectedWorkRejectsUnboundContext'])assert.ok(passed.has(t));
const modes=['commit','clock_advance','worker_claim','worker_fence','worker_deadline','authority','early_reference','direct_reference','grant_revoked','capacity','capacity_overflow','capacity_sample','clock_backwards','clock_intermediate_rollback','until_equality','config','envelope','tombstone','absent_key','callback_changes_worker'];
for(const t of modes)assert.ok(passed.has('TestDownloadGCFinalizerProtectedCandidate/'+t));
const seedRoots=[['TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed'],['TestDDrillDetailHTTPSeed'],['TestAAdminReadMySQLSeed']];
for(let i=0;i<3;i++)assert.deepEqual(roots(events(stages[i+7])),seedRoots[i].sort());
assert.equal(stages[9].command.at(-1),'./internal/systembackupsecurity');
const oldSeedsArg='docs/evidence/a-owner-profile-supplement-a1af4a2e2f5645c79fadfade1051f398-reviewed.json';inputs.add(oldSeedsArg);
const oldSeeds=json(oldSeedsArg);
assert.deepEqual(names(events(stages[10])),oldSeeds.packaged_seed_names);
assert.equal(stages[11].platform,'windows');assert.equal(stages[11].exit_code,0);assert.ok(stages[11].command.includes('-c'));
const detached=stages[12];assert.equal(detached.exit_code,0);assert.equal(detached.initial_directory_empty,true);
const detachedText=read(detached.log);assert.ok(!/^\s*--- (FAIL|SKIP):/m.test(detachedText));assert.match(detachedText,/(?:^|\r?\n)PASS(?:\r?\n|$)/);
const detachedNames=[...detachedText.matchAll(/^\s*--- PASS: (\S+) \(/gm)].map(m=>m[1]).sort();
assert.deepEqual(detachedNames,oldSeeds.detached_seed_names);
assert.ok(detached.command.includes('-test.run') && detached.command.includes('-test.count=1'));
for(const s of stages.slice(13,19)){assert.equal(s.platform,'linux');assert.equal(s.exit_code,0);assert.ok(s.command.includes('-c')||s.command.includes('build'));}
assert.equal(stages[13].command.at(-1),'./internal/systembackupevidence');
assert.equal(stages[17].command.at(-1),'./cmd/system-backup-migrate');
assert.equal(stages[18].command.at(-1),'./cmd/server');
assert.equal(stages[16].command.at(-1),'./internal/systembackupsecurity');
const standalone=events(stages[19]);assert.equal(stages[19].platform,'windows');assert.equal(stages[19].command.at(-1),'.');
const standaloneFiles=['download_retention_gc_freeze.go','download_retention_gc_freeze_test.go','download_retention_gc_freeze_a_test.go','download_retention_gc_finalize.go','download_retention_gc_finalize_test.go'];
const validator=read('scripts/system-backup-d-gc-freeze-candidate-validation.ps1');inputs.add('scripts/system-backup-d-gc-freeze-candidate-validation.ps1');
for(const f of standaloneFiles)assert.ok(validator.includes("'backend/internal/systembackupevidence/"+f+"'"));
const standaloneTests=standaloneFiles.filter(f=>f.endsWith('_test.go')).flatMap(f=>[...read('backend/internal/systembackupevidence/'+f).matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]));
assert.deepEqual(roots(standalone),standaloneTests.sort());
assert.equal(stages[20].platform,'linux');assert.equal(stages[20].exit_code,0);assert.equal(stages[20].command.at(-1),'.');
const counterArg=`docs/evidence/d-gc-finalizer-counterexamples-${path.basename(supplement.owner).slice('.tmp-d-index-cache-'.length)}.json`;inputs.add(counterArg);
const counter=json(counterArg);assert.equal(counter.records.length,2);
for(let i=0;i<2;i++){
 const r=counter.records[i],s=stages[i+21],e=events(s,r.test);
 assert.ok(s.command.includes('-overlay'));assert.ok(s.command.includes(r.overlay));assert.equal(s.platform,'windows');
 assert.equal(hash(Buffer.from(r.replacement_bytes_base64,'base64')),r.replacement_sha256);
 const file=path.basename(r.original),originalPin=manifest.files.find(p=>p.path==='backend/internal/systembackupevidence/'+file);assert.equal(r.original_sha256,originalPin.sha256);
 assert.deepEqual(e.filter(x=>x.Action==='fail'&&x.Test).map(x=>x.Test).sort(),['TestDownloadGCFinalizerProtectedCandidate',r.test].sort());
 const text=e.filter(x=>x.Output).map(x=>x.Output).join('');assert.match(text,/post-ticket failure escaped exact shared rollback/);assert.match(text,/Transaction:committed/);
}
assert.deepEqual(supplement.binaries.map(b=>b.name).sort(),['owner-seeds.exe','owners.test','resources.test','drill-http.test','admin-read.test','system-backup-migrate','server','freeze-finalizer.test'].sort());
for(const b of supplement.binaries)assert.match(b.sha256,/^[a-f0-9]{64}$/);
const receiverArg='docs/evidence/d-readiness-receivers-current-20261026.json',receivers=json(receiverArg);inputs.add(receiverArg);
assert.equal(receivers.error,null);assert.equal(receivers.inputs_stable,true);assert.deepEqual(receivers.steps.map(s=>s.tests),[64,58,27,14]);
for(const p of receivers.inputs){assert.equal(pin(p.path).sha256,p.sha256);inputs.add(p.path);}
for(const s of receivers.steps){assert.equal(s.exit_code,0);assert.equal(pin(s.log.path).sha256,s.log.sha256);inputs.add(s.log.path);}
for(const p of ['docs/evidence/d-gc-finalizer-preparation-20261026.json','docs/evidence/d-gc-finalizer-cache-transfer-20261026.json']){
 const cache=json(p);assert.equal(cache.dependencies_installed,false);assert.equal(cache.test_result_reuse,false);assert.equal(fs.existsSync(cache.owner),false);inputs.add(p);
}
const recoveryArg='docs/evidence/d-local-closeout-interruption-recovery-20261026.json',recovery=json(recoveryArg);inputs.add(recoveryArg);
assert.equal(recovery.old_gate_accepted,false);assert.equal(fs.existsSync(recovery.original_owner),false);
for(const p of ['docs/evidence/d-local-closeout-snapshot-20261023.mjs','docs/evidence/d-gc-finalizer-counterexamples-prepare-20261026.mjs','docs/evidence/d-gc-finalizer-cache-transfer-20261026.mjs','docs/evidence/d-gc-finalizer-first-segment-checkpoint-20261026.ps1'])inputs.add(p);
const result={kind:'d_gc_finalizer_native_acceptance.v1',status:frozenOnly?'complete_exact_frozen_native_scope_current_tagged_drill_delta_pending':'complete_exact_local_native_scope_peer_acceptance_pending',goal_complete:false,source_sha256:manifest.source_sha256,source_files:manifest.files.length,primary_validation:pin(primaryArg),supplement_validation:segmented?pin(supplementArg):null,stage_map:stages.map((s,i)=>({stage:i,segment:!segmented||i<9||i===10?'primary':'supplement',native_exit:s.exit_code,log:pin(s.log),command:s.command})),packages:packages.map((p,i)=>({package:p,roots:roots(full[i]).length,pass_events:names(full[i]).length})),old_5138_preserved:preserved,previous_5148_preserved:previousNative,finalizer_model_modes:modes,owner_packaged_seed_names:names(events(stages[10])),owner_detached_seed_names:detachedNames,standalone_roots:roots(standalone),standalone_pass_events:names(standalone).length,binaries:supplement.binaries,single_defect_overlay_failures:counter.records.map(r=>r.test),receiver_passes:163,historical_receiver_passes:157,source_current_bytes_and_set_match:currentDrift.length===0,source_current_set_match:true,current_input_drift:currentDrift,current_source_sha256_at_review:hash(currentPins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),current_tagged_HTTP_scope_accepted:!frozenOnly,first_segment_source_postcheck:pin(checkpointArg),terminal_source_postcheck:true,owners_removed:[primary.owner,supplement.owner,recovery.original_owner],primary_wrapper_failure_preserved:segmented,ordinary_packages_repeated:false,dependencies_installed:false,remote_contacted:false,actual_mysql:false,production_freeze_wired:false,production_approved:false,pending:[...(frozenOnly?['current tagged drill seed and Linux HTTP repair acceptance']:[]),'same-version independent F1–F10 and A owner profile acceptance','final handoff consistency','external actual SQL, joint grants/protocol, physical facts and B/C domain inputs remain excluded'],inputs:[...inputs].sort().map(pin)};
assert.equal(path.dirname(resolve(outputArg)),resolve('docs/evidence'));
if(mode.startsWith('--write'))fs.writeFileSync(resolve(outputArg),JSON.stringify(result,null,2)+'\n',{flag:'wx'});else assert.deepEqual(json(outputArg),result);
console.log(`FINALIZER_NATIVE_ACCEPTED scope=${frozenOnly?'immutable_frozen_run_current_tagged_drill_delta_pending':'current'} stages=23 packages=6 source_files=${manifest.files.length} prior_preserved=5148 production=no`);
