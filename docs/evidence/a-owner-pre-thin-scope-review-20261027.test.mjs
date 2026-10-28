import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedScopePins,checkApprovedScopePin,validateScopeStructure} from './a-owner-pre-thin-scope-review-20261027.mjs';
import {obligations,gcPaths} from './a-owner-pre-thin-target-20261026.mjs';
const pin=(name='docs/evidence/mock.json')=>({path:name,size:1,sha256:'a'.repeat(64)});
const proof=(id,profile)=>({id,profile,native_receipts:profile==='gc_two_tagged_components_only'?[]:[pin()],
  independent_review:pin(),review_validator:pin('docs/evidence/mock.mjs'),
  dependency_closure_review:profile==='gc_two_tagged_components_only'?null:pin('docs/evidence/closure.json')});
function fixture(){
  const target={target_sha256:'a'.repeat(64),deltas:[{path:'backend/a.go',before:null,after:pin('backend/a.go')},
    {path:gcPaths[0],before:null,after:pin(gcPaths[0])}]};
  const scope={kind:'a_owner_pre_thin_scope_review.v1',status:'ready_for_fifteen_stage_local_supplement_only',
    target_manifest:pin(),target_sha256:target.target_sha256,parent_scope_proof_ids:['parent'],
    coverage:target.deltas.map(d=>({...d,proof_ids:[d.path==='backend/a.go'?'api':'gc']})),
    proofs:[proof('parent','entry_complete_or_exact_repaired_scope'),proof('api','api_a_security_materials'),proof('gc','gc_two_tagged_components_only')],
    blockers:[],post_target_obligations:obligations,native_start_authorized:true,current_baseline_ready:false,actual_sql_authorized:false};
  return {target,scope};
}
test('synthetic shape is not authority: unknown scope stays rejected',()=>{
  assert.equal(validateScopeStructure(...Object.values(fixture())).size,3);
  assert.ok(Object.isFrozen(approvedScopePins));assert.throws(()=>checkApprovedScopePin(pin()),/not been independently reviewed/);
});
test('missing or duplicate delta coverage rejected',()=>{
  for(const change of [s=>s.coverage.pop(),s=>s.coverage.push(s.coverage[0])]){
    const {target,scope}=fixture();change(scope);assert.throws(()=>validateScopeStructure(target,scope));
  }
});
test('same path different after bytes is rejected',()=>{
  const {target,scope}=fixture();scope.coverage[0].after={...scope.coverage[0].after,sha256:'b'.repeat(64)};
  assert.throws(()=>validateScopeStructure(target,scope));
});
test('GC proof cannot waive ordinary source coverage',()=>{
  const {target,scope}=fixture();scope.coverage[0].proof_ids=['gc'];scope.proofs=scope.proofs.filter(p=>p.id!=='api');
  assert.throws(()=>validateScopeStructure(target,scope),/GC component review/);
});
test('unresolved unused and duplicate proof IDs rejected',()=>{
  for(const change of [s=>s.coverage[0].proof_ids=['missing'],s=>s.proofs.push(proof('unused','support_input_delta')),s=>s.proofs.push(s.proofs[0])]){
    const {target,scope}=fixture();change(scope);assert.throws(()=>validateScopeStructure(target,scope));
  }
});
test('parent cannot be replaced by a material helper or omitted',()=>{
  for(const ids of [[],['api'],['missing'],['parent','parent']]){
    const {target,scope}=fixture();scope.parent_scope_proof_ids=ids;assert.throws(()=>validateScopeStructure(target,scope));
  }
});
test('proof needs native evidence and closure except exact GC',()=>{
  for(const change of [s=>s.proofs[1].native_receipts=[],s=>s.proofs[1].dependency_closure_review=null,s=>s.proofs[2].native_receipts=[pin()]]){
    const {target,scope}=fixture();change(scope);assert.throws(()=>validateScopeStructure(target,scope));
  }
});
test('extra green field, baseline, SQL and pending blockers rejected',()=>{
  for(const change of [s=>s.passed=true,s=>s.current_baseline_ready=true,s=>s.actual_sql_authorized=true,s=>s.blockers=['not ready']]){
    const {target,scope}=fixture();change(scope);assert.throws(()=>validateScopeStructure(target,scope));
  }
});
test('target mismatch and lost future obligations rejected',()=>{
  for(const change of [s=>s.target_sha256='b'.repeat(64),s=>s.post_target_obligations=[]]){
    const {target,scope}=fixture();change(scope);assert.throws(()=>validateScopeStructure(target,scope));
  }
});
test('support preparation cannot masquerade as ordinary Go proof',()=>{
  const {target,scope}=fixture();scope.proofs[1]={...proof('api','support_input_delta'),dependency_closure_review:null};
  assert.throws(()=>validateScopeStructure(target,scope),/Support audit cannot cover ordinary Go/);
});
test('source-only support shape is pending evidence and cannot self-register',()=>{
  const {target,scope}=fixture();
  target.deltas[0]={path:'scripts/control.ps1',before:null,after:pin('scripts/control.ps1')};
  scope.coverage[0]={...target.deltas[0],proof_ids:['api']};
  scope.proofs[1]={...proof('api','support_input_delta'),native_receipts:[],dependency_closure_review:null};
  assert.equal(validateScopeStructure(target,scope).size,3);
  assert.throws(()=>checkApprovedScopePin(scope.target_manifest));
});
