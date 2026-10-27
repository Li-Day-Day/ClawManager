import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkPins,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const parse=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
const sorted=a=>[...a].sort();
const packages=['internal/systembackupproducer','internal/systembackupsecurity','internal/systembackupbootstrapsecurity',
  'internal/systembackupevidence','internal/systembackupresources','internal/systembackupread','cmd/server',
  'internal/systembackupnoncebootstrap','internal/systembackupcatrust','cmd/system-backup-bootstrap'].map(p=>'clawreef/'+p);

export function reviewGoEvents(text,expectedPackages,requiredRoots=[]) {
  const events=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(events.length>0,'Empty native log');
  assert.equal(events.filter(e=>['fail','build-fail','skip'].includes(e.Action)).length,0,'Native failure/skip');
  const ran=events.filter(e=>e.Action==='run' && e.Test),passed=events.filter(e=>e.Action==='pass' && e.Test);
  const key=e=>e.Package+'\0'+e.Test;
  assert.ok(passed.length>0,'No actual test events');
  assert.equal(new Set(ran.map(key)).size,ran.length,'Duplicate native run');
  assert.equal(new Set(passed.map(key)).size,passed.length,'Duplicate native pass');
  assert.deepEqual(sorted(ran.map(key)),sorted(passed.map(key)),'Incomplete native test execution');
  assert.deepEqual(sorted(events.filter(e=>e.Action==='pass' && !e.Test).map(e=>e.Package)),sorted(expectedPackages),'Wrong package inventory');
  for(const e of passed) assert.ok(expectedPackages.includes(e.Package),'Unrequested test package');
  const roots=passed.filter(e=>!e.Test.includes('/'));
  for(const name of requiredRoots) assert.equal(roots.filter(e=>e.Test===name).length,1,'Missing required root '+name);
  return {packages:sorted(expectedPackages),roots:roots.length,passed_events:passed.length,
    root_names:sorted(roots.map(e=>e.Package+'::'+e.Test))};
}
function pin(name) {
  assert.match(name,/^docs\/evidence\/[A-Za-z0-9_.-]+$/);
  const absolute=path.join(root,name);assert.equal(fs.lstatSync(absolute).isSymbolicLink(),false);
  const b=fs.readFileSync(absolute);return {path:name,size:b.length,sha256:sha(b)};
}
function json(name){return parse(fs.readFileSync(path.join(root,name)));}
export function derivePhaseObservation(nativeName) {
  const match=nativeName.match(/^docs\/evidence\/d-bootstrap-entry-native-([a-f0-9]{32})\.json$/);assert.ok(match);
  const native=json(nativeName),id=match[1];
  assert.equal(native.kind,'d_bootstrap_entry_native.v1');assert.equal(native.status,'failed');
  assert.equal(native.error,'Entry Linux build/compile failed: server');
  assert.equal(native.tests_started,true);assert.equal(native.snapshot_verified,true);assert.equal(native.cleaned,true);
  assert.equal(native.dependencies_installed,false);assert.equal(native.actual_mysql_executed,false);
  assert.equal(native.actual_sql_cases_executed,0);assert.equal(native.production_approved,false);
  assert.equal(native.snapshot_unchanged,undefined,'This observer is specifically for the missing final postcheck');
  assert.equal(fs.existsSync(path.join(root,'.tmp-d-bootstrap-entry-'+id)),false);
  const source=[...native.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);checkPins(source);
  const sourceMap=new Map(source.map(p=>[p.path,p]));
  const readyName='docs/evidence/a-bootstrap-entry-source-ready-20261026-r2.json',ready=json(readyName);
  assert.equal(ready.kind,'a_bootstrap_entry_source_ready.v1');assert.equal(ready.revision,2);
  assert.equal(ready.files.length,7);assert.equal(ready.new_roots.length,9);
  for(const p of ready.files) assert.deepEqual(p,sourceMap.get(p.path),'A1 r2 bytes differ from observed native source');
  const seedRoots=['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed',
    'TestDBootstrapOriginalMaterialsMySQLSeed','TestDBootstrapEntryMySQLSeed'];
  const stages={};
  for(const [name,pkg,required] of [
    ['targeted',['clawreef/internal/systembackupproducer','clawreef/internal/systembackupsecurity','clawreef/cmd/system-backup-bootstrap'],
      [...native.required_roots,...ready.new_roots,'TestBootstrapCandidateAttemptBudgetStartsBeforePreparation']],
    ['full',packages,ready.new_roots],['seeds',['clawreef/internal/systembackupevidence'],seedRoots]]) {
    assert.equal(native[name+'_exit'],0);
    const log=nativeName.replace(/\.json$/,'.'+name+'.jsonl');
    stages[name]={log:pin(log),...reviewGoEvents(fs.readFileSync(path.join(root,log),'utf8'),pkg,[...new Set(required)])};
  }
  assert.equal(stages.targeted.passed_events,native.targeted_pass_events);
  assert.equal(stages.full.passed_events,native.full_pass_events);
  assert.deepEqual(sorted(native.package_passes),sorted(packages));
  const linuxLog=nativeName.replace(/\.json$/,'.linux-server.txt');
  assert.match(fs.readFileSync(path.join(root,linuxLog),'utf8'),/There is not enough space on the disk/);
  return {kind:'a_bootstrap_entry_native_stage_observation.v1',status:'observed_native_stages_only_original_run_still_failed',
    native_receipt:pin(nativeName),source_files:source.length,source_sha256:sourceDigest(source),
    A1_r2_source:pin(readyName),stages,failed_linux_log:pin(linuxLog),
    original_initial_snapshot_verified:true,original_final_postcheck_observed:false,
    original_run_accepted:false,strict_source_stability_accepted:false,
    cleanup_verified:true,linux_accepted:false,actual_sql:false,production_authorized:false,
    pre_thin_ready:false,current_baseline_ready:false,
    remaining_proof:'New exact Linux evidence proves its own pre/post interval only; obtain actual stable-source native coverage for still-uncovered current packages before strict scope approval'};
}
function main(){
  const [mode,nativeName,output]=process.argv.slice(2);
  assert.ok(['--write','--check'].includes(mode) && nativeName && output);
  const review=derivePhaseObservation(nativeName);
  if(mode==='--write') {assert.match(output,/^docs\/evidence\/a-bootstrap-entry-phase-observed-[a-z0-9-]+\.json$/);fs.writeFileSync(path.join(root,output),JSON.stringify(review,null,2)+'\n',{flag:'wx'});}
  else assert.deepEqual(json(output),review);
  console.log(JSON.stringify({mode,output,roots:review.stages.full.roots,full_pass_events:review.stages.full.passed_events,
    original_final_postcheck_observed:false,pre_thin_ready:false,current_baseline_ready:false}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
