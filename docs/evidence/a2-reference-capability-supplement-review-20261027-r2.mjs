import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {parseGoList, affectedScope} from './a2-reference-capability-go-scope-20261026.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const oldPrefix = path.join(root, 'docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7');
const decoder = 'backend/internal/systembackupbootstrapsecurity/reference.go';
const regression = 'backend/internal/systembackupbootstrapsecurity/reference_contract_parity_test.go';
const lifecycle = 'backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go';
const peerDriver = 'scripts/system-backup-d-bootstrap-entry-linux-supplement.ps1';
const runtime = ['clawreef/cmd/system-backup-bootstrap','clawreef/internal/systembackupbootstrapmaterials','clawreef/internal/systembackupbootstrapsecurity','clawreef/internal/systembackupcatrust','clawreef/internal/systembackupnoncebootstrap'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(path.resolve(root, p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const pin = p => {const b = read(p); return {path:p,size:b.length,sha256:sha(b)};};
const sorted = xs => [...xs].sort();
function pinMap(pins) {
  const map = new Map();
  for (const p of pins) {
    assert.ok(typeof p.path === 'string' && !p.path.includes('\\') && !p.path.startsWith('/') && !p.path.split('/').includes('..'));
    assert.match(p.sha256, /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(p.size) && p.size >= 0);
    assert.ok(!map.has(p.path), 'duplicate source pin'); map.set(p.path,p);
  }
  return map;
}
function checkArtifacts(review) {
  for (const p of review.artifacts) assert.equal(sha(read(p.path)), p.sha256, 'reviewed artifact changed: '+p.path);
}
export function acceptedWindows() {
  const reviewPath = 'docs/evidence/d1-a2-reference-capability-windows-reviewed-20261027-9c2f.json';
  assert.equal(sha(read(reviewPath)), '38552e72c8044b892a17e6bae9e24d370261e76c8e650a09f78617ff19fd04a9');
  const w = json(reviewPath); checkArtifacts(w);
  assert.equal(w.status,'passed_exact_windows_counterfactual_and_runtime5_only');
  assert.equal(w.parent_status,'failed'); assert.equal(w.complete_candidate_run_accepted,false);
  for (const k of ['snapshot_postcheck','reviewed_inputs_postcheck','driver_unchanged','owner_independently_absent','run_artifacts_cleaned']) assert.equal(w[k],true,k);
  assert.equal(w.old_native_exit,1); assert.equal(w.fixed_native_exit,0); assert.equal(w.full_native_exit,0);
  assert.deepEqual(w.full,{roots:42,pass_events:347}); assert.deepEqual(w.runtime_packages,runtime);
  const old = json(oldPrefix+'.json'); assert.equal(old.status,'failed'); assert.equal(fs.existsSync(old.owner),false);
  const gcPath='docs/evidence/a-gc-tagged-component-reviewed-20261027-r2.json';
  assert.equal(sha(read(gcPath)),'48be9d08eaed5bfe348b0c58551acd0da6654dc54a03648e0af76d0840b7a6b0');
  return {old,windows_review:pin(reviewPath),gc_component_review:pin(gcPath)};
}
// Reuse only the independently received Windows phases. All captured source
// paths must still exist; the two explicit deltas cannot affect ordinary Go.
export function compareInputs(input, accepted, sourceRoot) {
  const old=pinMap(accepted.old.files), now=pinMap(input.files);
  assert.deepEqual(sorted(now.keys()),sorted(old.keys()),'source path set changed');
  assert.deepEqual(now.get(decoder),old.get(decoder)); assert.deepEqual(now.get(regression),old.get(regression));
  const changes=[];
  for(const [p,before] of old) if(JSON.stringify(before)!==JSON.stringify(now.get(p))) changes.push({path:p,before,after:now.get(p)});
  assert.deepEqual(sorted(changes.map(p=>p.path)),sorted([lifecycle,peerDriver]),'unreviewed source delta');
  const life=changes.find(p=>p.path===lifecycle);
  assert.equal(life.before.sha256,'cac6c2bc0be61f48d28835828b26f17d92fe9f97deeea4dea3a87c7b5354a7e2');
  assert.equal(life.after.sha256,'c05714705f0e489f13004095ca9648f90edd5e2786fed1b182400083913f3e55');
  assert.equal(life.before.size,32901); assert.equal(life.after.size,32957);
  const script=changes.find(p=>p.path===peerDriver);
  assert.equal(script.after.sha256,'c396995dc65b80389d2daa5b801090976b7b0209d6ab2c6082f4068301452bea');
  if(sourceRoot) {
    for(const p of input.files) {const b=fs.readFileSync(path.join(sourceRoot,p.path));assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);}
    const after=fs.readFileSync(path.join(sourceRoot,lifecycle),'utf8');
    assert.equal((after.match(/\bdGCFullLifecyclePool\b/g)||[]).length,2);
    assert.equal((after.match(/\bdGCFullLifecycleReleased\b/g)||[]).length,12);
    const inverse=after.replace(/\bdGCFullLifecyclePool\b/g,'dGCLifecyclePool').replace(/\bdGCFullLifecycleReleased\b/g,'dGCLifecycleReleased');
    assert.equal(sha(Buffer.from(inverse)),life.before.sha256);
  }
  return changes;
}
export function compareScopes(prefix) {
  const old=json(oldPrefix+'.scope.json'), fresh=json(prefix+'.scope.json');
  assert.deepEqual(fresh.runtime_union,runtime); assert.deepEqual(fresh.additional_ordinary_test_callers,[]);
  assert.deepEqual(fresh.additional_mysql_test_callers,['clawreef/internal/systembackupevidence']);
  assert.equal(fresh.captures.length,4);
  for(let i=0;i<4;i++) {
    const cap=fresh.captures[i], b=read(cap.input.path); assert.equal(b.length,cap.input.size); assert.equal(sha(b),cap.input.sha256);
    const actual=affectedScope(parseGoList(b.toString('utf8')));
    for(const [k,v] of Object.entries(actual)) assert.deepEqual(cap[k],v);
    const omitDirs = c => ({goos:c.goos_label,tags:c.tags_label,runtime:c.runtime_affected,extra:c.additional_test_callers,selected:c.selected_files.map(({directory,...v})=>v)});
    assert.deepEqual(omitDirs(cap),omitDirs(old.captures[i]),'selected Go inputs or callers changed');
    const evidence=cap.selected_files.find(p=>p.package==='clawreef/internal/systembackupevidence');
    if(cap.tags_label==='ordinary') assert.equal(evidence,undefined,'GC tagged source entered ordinary caller scope');
    else assert.ok(evidence.test_files.includes(path.basename(lifecycle)),'new lifecycle source excluded');
  }
  return pin(prefix+'.scope.json');
}
function successfulSeed(prefix) {
  assert.equal(read(prefix+'.tagged_seed.stderr.txt').toString().trim(),'');
  const rows=read(prefix+'.tagged_seed.jsonl').toString().trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(!rows.some(r=>['fail','build-fail','skip'].includes(r.Action)));
  const expected='TestDBootstrapOriginalMaterialsMySQLSeed';
  for(const action of ['run','pass']) assert.deepEqual(rows.filter(r=>r.Action===action&&r.Test).map(r=>[r.Package,r.Test]),[['clawreef/internal/systembackupevidence',expected]]);
  assert.deepEqual(rows.filter(r=>r.Action==='pass'&&!r.Test).map(r=>r.Package),['clawreef/internal/systembackupevidence']);
}
export function compose(prefix) {
  const accepted=acceptedWindows(), r=json(prefix+'.json');
  assert.equal(r.kind,'a2_reference_capability_supplement_native.v1'); assert.equal(r.status,'passed_exact_candidate_supplement');
  for(const k of ['Go_started','tests_started','snapshot_unchanged','reviewed_inputs_unchanged','cleanup','ordinary_reuse_verified','scope_reuse_verified']) assert.equal(r[k],true,k);
  for(const k of ['live_source_modified','dependencies_installed','actual_SQL','production_approved','ordinary_tests_repeated']) assert.equal(r[k],false,k);
  assert.equal(path.dirname(r.owner),root); assert.equal(path.basename(r.owner),'.tmp-a-reference-supplement-'+r.id); assert.equal(fs.existsSync(r.owner),false);
  assert.equal(sha(read('docs/evidence/a2-reference-capability-supplement-20261027-r2.ps1')),r.driver_sha256);
  for(const p of r.input_pins) assert.deepEqual(pin(p.path),p);
  const changes=compareInputs(r,accepted), scope=compareScopes(prefix);
  const phaseNames=['windows.ordinary','windows.systembackup_mysql','linux.ordinary','linux.systembackup_mysql','tagged_seed',...runtime.map(p=>'linux_'+p.split('/').at(-1)),'linux_tagged_evidence'];
  assert.deepEqual(r.phases.map(p=>p.phase),phaseNames); assert.ok(r.phases.every(p=>p.exit===0&&!p.expected_failure));
  for(const p of r.phases) {
    if(p.phase.includes('.')) {
      const [os,tags]=p.phase.split('.'); assert.equal(p.goos,os);
      assert.deepEqual(p.arguments,['list','-deps','-test','-json',...(tags==='ordinary'?[]:['-tags','systembackup_mysql']),'./...']);
    } else if(p.phase==='tagged_seed') {
      assert.equal(p.goos,'windows');
      assert.deepEqual(p.arguments,['test','-json','-count=1','-timeout=2700s','-tags','systembackup_mysql','-run','^TestDBootstrapOriginalMaterialsMySQLSeed$','./internal/systembackupevidence']);
    } else {
      assert.equal(p.goos,'linux');
      const tagged=p.phase==='linux_tagged_evidence';
      const pkg=tagged?'clawreef/internal/systembackupevidence':runtime.find(v=>'linux_'+v.split('/').at(-1)===p.phase);
      const binary=path.join(r.owner,tagged?'tagged-evidence.test':pkg.split('/').at(-1)+'.test');
      assert.deepEqual(p.arguments,['test','-c',...(tagged?['-tags','systembackup_mysql']:[]),'-o',binary,'./'+pkg.replace(/^clawreef\//,'')]);
    }
  }
  assert.equal(r.tagged_seed_pass_events,1); successfulSeed(prefix);
  assert.deepEqual(r.linux_binaries.map(b=>b.package),runtime);
  for(const b of [...r.linux_binaries,r.linux_tagged_evidence]) {assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.ok(b.size>100000);assert.equal(b.elf_magic,'7f454c46');}
  const artifacts=[pin(prefix+'.json'),scope,...r.phases.flatMap(p=>[pin(prefix+'.'+p.phase+'.jsonl'),pin(prefix+'.'+p.phase+'.stderr.txt')]),accepted.windows_review,accepted.gc_component_review,pin('docs/evidence/a2-reference-capability-supplement-review-20261027-r2.mjs')];
  return {kind:'a2_reference_capability_composed_candidate_review.v1',status:'passed_exact_candidate_windows_and_supplement',failed_parent_preserved:pin(oldPrefix+'.json'),windows_source_postcheck:true,windows_full_packages:runtime,windows_full_roots:42,windows_full_pass_events:347,ordinary_tests_repeated:false,supplement_source_deltas:changes,tagged_original_materials_seed_pass_events:1,linux_test_programs:6,linux_test_programs_executed:false,source_files:r.files,candidate_delta:accepted.old.files.filter(p=>[decoder,regression].includes(p.path)),snapshot_postcheck:true,reviewed_inputs_postcheck:true,owners_independently_absent:true,live_patch_promoted:false,current_whole_baseline_accepted:false,actual_SQL:false,production_approved:false,goal_complete:false,artifacts};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const [mode,prefix,...extra]=process.argv.slice(2); assert.ok(['--inputs','--scope','--write','--check'].includes(mode)&&prefix&&!extra.length);
  if(mode==='--inputs') {const input=json(prefix+'.inputs.json');const changes=compareInputs(input,acceptedWindows(),input.source);console.log(JSON.stringify({ordinary_reuse_verified:true,changes}));}
  else if(mode==='--scope') {compareScopes(prefix);console.log('SCOPE_REUSE_VERIFIED');}
  else {const result=compose(prefix), output=prefix+'.composed.json';if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});else assert.deepEqual(json(output),result);console.log(JSON.stringify({status:result.status,output:pin(output)}));}
}
