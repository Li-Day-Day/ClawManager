import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkTarget, checkPins, enumerate, gcPaths, obligations, sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
// Add only AFTER independent native/log/source/closure review. No draft, mock,
// test observer, Linux-only repair, or user-supplied boolean registers itself.
// Old approved entries must remain immutable when a later target is reviewed.
export const approvedScopePins = Object.freeze([
  {path:'docs/evidence/a-owner-pre-thin-scope-reviewed-20261027-r1.json',size:38525,
    sha256:'c6510f8d1625c99233798b8b1d27c2c3af636579e817e3bd27f6bb44b22843d3'}
]);
const profiles = new Set(['entry_complete_or_exact_repaired_scope','api_a_security_materials',
  'api_d_task_server_cli','a2_reference_capability_parity','support_input_delta','gc_two_tagged_components_only']);
const sorted = values => [...values].sort();
const sameNames = (actual, expected, message) => assert.deepEqual(sorted(actual), sorted(expected), message);
function keys(value, names) { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); sameNames(Object.keys(value),names,'Unknown or missing field'); }
function artifactName(name) {
  assert.match(name,/^docs\/evidence\/[A-Za-z0-9_.-]+$/,'Evidence must be a direct workspace artifact');
}
function noRedirect(base, name) {
  let current=base;
  assert.equal(fs.lstatSync(current).isSymbolicLink(),false);
  for (const part of name.split('/')) { assert.ok(part && part!=='.' && part!=='..'); current=path.join(current,part); assert.equal(fs.lstatSync(current).isSymbolicLink(),false,'Redirected input'); }
  return current;
}
function pinAt(base,name) {
  const bytes=fs.readFileSync(noRedirect(base,name)); return {path:name,size:bytes.length,sha256:sha(bytes)};
}
function readJSON(pin) {
  artifactName(pin.path); assert.deepEqual(pinAt(workspace,pin.path),pin,'Evidence pin drift: '+pin.path);
  return JSON.parse(fs.readFileSync(path.join(workspace,pin.path),'utf8').replace(/^\uFEFF/,''));
}
function pinShape(pin) {checkPins([pin]);}

// Shape/edge checks are exported for synthetic regression tests. They never
// authorize execution. Only checkScopeFiles performs anchored real intake.
export function validateScopeStructure(target,scope) {
  keys(scope,['kind','status','target_manifest','target_sha256','parent_scope_proof_ids',
    'coverage','proofs','blockers','post_target_obligations','native_start_authorized','current_baseline_ready','actual_sql_authorized']);
  assert.equal(scope.kind,'a_owner_pre_thin_scope_review.v1');
  assert.equal(scope.status,'ready_for_fifteen_stage_local_supplement_only');
  pinShape(scope.target_manifest);
  assert.equal(scope.target_sha256,target.target_sha256);
  assert.deepEqual(scope.blockers,[]);
  assert.deepEqual(scope.post_target_obligations,obligations);
  assert.equal(scope.native_start_authorized,true);
  assert.equal(scope.current_baseline_ready,false);
  assert.equal(scope.actual_sql_authorized,false);
  assert.ok(Array.isArray(scope.proofs) && scope.proofs.length>0);
  const proofs=new Map();
  for (const proof of scope.proofs) {
    keys(proof,['id','profile','native_receipts','independent_review','review_validator','dependency_closure_review']);
    assert.match(proof.id,/^[a-z0-9_-]+$/); assert.ok(!proofs.has(proof.id),'Duplicate proof ID');
    assert.ok(profiles.has(proof.profile),'Unknown proof profile');
    proofs.set(proof.id,proof); pinShape(proof.independent_review); pinShape(proof.review_validator);
    assert.ok(Array.isArray(proof.native_receipts));
    for (const p of proof.native_receipts) pinShape(p);
    if (proof.profile==='gc_two_tagged_components_only') {
      assert.deepEqual(proof.native_receipts,[]); assert.equal(proof.dependency_closure_review,null);
    } else if(proof.profile==='support_input_delta') {
      // Source preparation does not claim execution of future Go stages.
      assert.equal(proof.dependency_closure_review,null);
    } else {
      assert.ok(proof.native_receipts.length>0,'Native evidence missing'); pinShape(proof.dependency_closure_review);
    }
  }
  assert.ok(Array.isArray(scope.parent_scope_proof_ids) && scope.parent_scope_proof_ids.length>0);
  assert.equal(new Set(scope.parent_scope_proof_ids).size,scope.parent_scope_proof_ids.length);
  const used=new Set(scope.parent_scope_proof_ids);
  for(const id of used) assert.equal(proofs.get(id)?.profile,'entry_complete_or_exact_repaired_scope','No complete parent scope proof');
  sameNames(scope.coverage.map(c=>c.path),target.deltas.map(c=>c.path),'Every delta must have exactly one coverage row');
  assert.equal(new Set(scope.coverage.map(c=>c.path)).size,scope.coverage.length,'Duplicate delta coverage');
  const deltas=new Map(target.deltas.map(d=>[d.path,d]));
  for(const row of scope.coverage) {
    keys(row,['path','before','after','proof_ids']); const delta=deltas.get(row.path);
    assert.deepEqual(row.before,delta.before); assert.deepEqual(row.after,delta.after);
    assert.ok(Array.isArray(row.proof_ids) && row.proof_ids.length>0);
    assert.equal(new Set(row.proof_ids).size,row.proof_ids.length);
    for(const id of row.proof_ids) {
      const proof=proofs.get(id); assert.ok(proof,'Unresolved proof reference'); used.add(id);
      assert.equal(proof.profile==='gc_two_tagged_components_only',gcPaths.includes(row.path),
        'GC component review cannot cover ordinary changes, and needs its own exact proof');
      if(proof.profile==='support_input_delta') assert.ok(!row.path.startsWith('contracts/') &&
        !/^backend\/.*\.go$|^backend\/go\.(mod|sum)$/.test(row.path),'Support audit cannot cover ordinary Go or contract changes');
    }
  }
  sameNames([...used],[...proofs.keys()],'Unused/unreferenced proof');
  return proofs;
}

function checkClosure(proof,target,parent,review) {
  const closure=readJSON(proof.dependency_closure_review);
  assert.equal(closure.kind,'a_owner_pre_thin_dependency_closure_review.v1');
  assert.equal(closure.status,'complete_exact_native_dependency_scope');
  assert.equal(closure.profile,proof.profile);
  assert.equal(closure.source_role,review.source_role);
  const reference=review.source_role==='parent' ? parent.files : target.target_files;
  const sourceMap=new Map(reference.map(p=>[p.path,p]));
  checkPins(closure.source_files);
  assert.equal(sourceDigest(closure.source_files),closure.source_sha256);
  for(const p of closure.source_files) assert.deepEqual(p,sourceMap.get(p.path),'Dependency bytes outside reviewed source');
  const roles=new Set();
  assert.ok(Array.isArray(closure.variants) && closure.variants.length===4,'Four real platform/tag closure variants required');
  for(const variant of closure.variants) {
    assert.ok(['windows','linux'].includes(variant.goos));
    assert.ok(['','systembackup_mysql'].includes(variant.tags));
    const role=variant.goos+':'+variant.tags; assert.ok(!roles.has(role),'Duplicate closure variant'); roles.add(role);
    assert.equal(variant.exit_code,0);
    assert.ok(Array.isArray(variant.command) && variant.command[0]==='go' && variant.command[1]==='list');
    for(const flag of ['-deps','-test','-json']) assert.ok(variant.command.includes(flag),'Incomplete actual go-list command');
    if(variant.tags) assert.ok(variant.command.some((arg,i)=>arg==='-tags' && variant.command[i+1]==='systembackup_mysql') || variant.command.includes('-tags=systembackup_mysql'));
    else assert.ok(!variant.command.some(arg=>arg==='-tags' || arg.startsWith('-tags=')));
    assert.ok(Array.isArray(variant.root_packages) && variant.root_packages.length>0);
    for(const pkg of variant.root_packages) assert.ok(variant.command.includes(pkg),'Closure roots absent from actual command');
    readJSONOrLog(variant.log);
  }
  return closure;
}
function readJSONOrLog(pin) {pinShape(pin); artifactName(pin.path); assert.deepEqual(pinAt(workspace,pin.path),pin,'Native log/evidence drift');}
export function checkApprovedScopePin(pin) {
  assert.ok(approvedScopePins.some(p=>p.path===pin.path && p.size===pin.size && p.sha256===pin.sha256),
    'Scope has not been independently reviewed and registered by A; no native start');
}

export function checkScopeFiles({targetName,scopeName,sourceRoot=workspace}) {
  artifactName(targetName); artifactName(scopeName);
  const targetPin=pinAt(workspace,targetName), scopePin=pinAt(workspace,scopeName);
  // A closed approval list prevents a self-authored green receipt or arbitrary
  // replacement review validator from acquiring authority by JSON shape alone.
  checkApprovedScopePin(scopePin);
  const target=readJSON(targetPin),scope=readJSON(scopePin);
  assert.deepEqual(scope.target_manifest,targetPin);
  const base=path.resolve(sourceRoot);
  assert.ok(base===workspace || base.startsWith(workspace+path.sep),'Source root outside workspace');
  if(base!==workspace) noRedirect(workspace,path.relative(workspace,base).replaceAll('\\','/'));
  const parent=readJSON(target.parent_receipt);
  assert.equal(parent.kind,'d_bootstrap_entry_native.v1');
  for(const p of [target.snapshotter,target.gc_component_review]) readJSONOrLog(p);
  const parentFiles=[...parent.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.equal(target.parent_source_sha256,sourceDigest(parentFiles));
  checkTarget(target,enumerate(base),parentFiles);
  const proofs=validateScopeStructure(target,scope);
  const targetMap=new Map(target.target_files.map(p=>[p.path,p]));
  const parentMap=new Map(parentFiles.map(p=>[p.path,p]));
  for(const proof of proofs.values()) {
    readJSONOrLog(proof.review_validator);
    const review=readJSON(proof.independent_review);
    for(const p of proof.native_receipts) readJSON(p);
    if(proof.profile==='gc_two_tagged_components_only') {
      assert.deepEqual(proof.independent_review,target.gc_component_review);
      assert.equal(review.kind,'a_gc_tagged_component_scope_review.v1');
      assert.equal(review.ordinary_scope_review_complete,false);
      sameNames(review.changes.map(c=>c.path),gcPaths,'GC component set differs');
      for(const change of review.changes) {
        assert.deepEqual(change.after,targetMap.get(change.path));
        assert.deepEqual(change.before,parentMap.get(change.path)??null);
      }
      continue;
    }
    if(proof.profile==='support_input_delta') {
      assert.equal(review.kind,'a_owner_pre_thin_support_scope_proof.v1');
      assert.equal(review.profile,'support_input_delta');
      assert.ok(['byte_bound_outside_native_execution_scope','source_control_prepared_for_pending_native_execution'].includes(review.status));
      assert.equal(review.executed_input_inventory_complete,true);
      assert.equal(review.not_functional_acceptance,true);
      assert.equal(review.actual_sql,false); assert.equal(review.production_authorized,false);
      assert.deepEqual(review.native_receipts,proof.native_receipts);
      assert.deepEqual(review.review_validator,proof.review_validator);
      const coveredRows=scope.coverage.filter(c=>c.proof_ids.includes(proof.id)).map(({path,before,after})=>({path,before,after}));
      assert.deepEqual(review.deltas,coveredRows,'Support scope before/after differs');
      assert.ok(Array.isArray(review.native_execution_inputs) && review.native_execution_inputs.length>0);
      checkPins(review.native_execution_inputs);
      for(const input of review.native_execution_inputs) {
        const inputBase=targetMap.has(input.path) ? base : workspace;
        if(targetMap.has(input.path)) assert.deepEqual(targetMap.get(input.path),input);
        assert.deepEqual(pinAt(inputBase,input.path),input,'Execution-control input changed');
      }
      const executed=new Set(review.native_execution_inputs.map(p=>p.path));
      for(const row of coveredRows) {
        if(review.status==='byte_bound_outside_native_execution_scope') assert.ok(!executed.has(row.path),'Executed input cannot claim exclusion');
        else if(row.after) assert.ok(executed.has(row.path),'Pending control is absent from actual execution inventory');
      }
      assert.ok(Array.isArray(review.receiver_test_logs));
      if(review.status==='source_control_prepared_for_pending_native_execution') assert.ok(review.receiver_test_logs.length>0,'Pending executable controls require actual receiver checks');
      for(const log of review.receiver_test_logs) readJSONOrLog(log);
      continue;
    }
    assert.equal(review.kind,'a_owner_pre_thin_native_scope_proof.v1');
    assert.equal(review.status,'accepted_exact_scope_for_local_supplement');
    assert.equal(review.profile,proof.profile);
    assert.ok(['parent','target'].includes(review.source_role));
    assert.equal(review.native_source_stability_verified,true,'Observed native passes alone do not close provenance');
    assert.equal(review.cleanup_verified,true);
    assert.equal(review.actual_sql,false); assert.equal(review.production_authorized,false);
    assert.deepEqual(review.native_receipts,proof.native_receipts);
    assert.deepEqual(review.review_validator,proof.review_validator);
    for(const log of review.native_logs) readJSONOrLog(log);
    const closure=checkClosure(proof,target,{files:parentFiles},review);
    const covered=new Map(closure.source_files.map(p=>[p.path,p]));
    for(const row of scope.coverage.filter(c=>c.proof_ids.includes(proof.id))) {
      if(row.after) assert.deepEqual(covered.get(row.path),row.after,'Changed file absent from native dependency proof');
      else assert.ok(review.explicit_removed_target_paths?.includes(row.path),'Omitted target input not explicitly reviewed');
    }
    if(scope.parent_scope_proof_ids.includes(proof.id)) {
      assert.deepEqual(sorted(review.complete_parent_packages),sorted(parent.package_passes));
      assert.equal(review.complete_parent_obligations_verified,true);
    }
  }
  return {kind:'a_owner_pre_thin_scope_check.v1',status:'ready_for_fifteen_stage_local_supplement_only',
    target_manifest:targetPin,scope_review:scopePin,target_sha256:target.target_sha256,
    source_root:base,files:target.target_files.length,deltas:target.deltas.length,
    native_start_authorized:true,current_baseline_ready:false,actual_sql_authorized:false};
}
function main() {
  const args=process.argv.slice(2);
  assert.equal(args[0],'--check');
  assert.deepEqual(args.slice(1).filter((_,i)=>i%2===0),['--target','--scope','--source-root'],
    'Use --check --target <target.json> --scope <scope.json> --source-root <workspace-or-frozen-source>');
  assert.equal(args.length,7);
  console.log(JSON.stringify(checkScopeFiles({targetName:args[2],scopeName:args[4],sourceRoot:args[6]})));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
