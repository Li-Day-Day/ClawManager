import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateScopeStructure} from './a-owner-pre-thin-scope-review-20261027.mjs';
import {checkTarget,enumerate,gcPaths,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json';
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
const parentGo=new Set(['backend/cmd/server/main.go','backend/cmd/server/system_backup_read_live.go',
  'backend/cmd/server/system_backup_api_tls.go','backend/cmd/server/system_backup_api_tls_test.go',
  'backend/cmd/server/system_backup_tasks_live.go','backend/cmd/server/system_backup_tasks_live_test.go',
  'backend/internal/systembackupsecurity/action_scope.go','backend/internal/systembackupsecurity/action_scope_test.go',
  'backend/internal/systembackupsecurity/read_scope.go']);
const parityGo=new Set(['backend/cmd/system-backup-bootstrap/materials.go','backend/cmd/system-backup-bootstrap/materials_test.go',
  'backend/internal/systembackupbootstrapmaterials/inputs.go','backend/internal/systembackupbootstrapmaterials/materials.go',
  'backend/internal/systembackupbootstrapmaterials/materials_test.go','backend/internal/systembackupcatrust/inputs.go',
  'backend/internal/systembackupbootstrapsecurity/reference.go','backend/internal/systembackupbootstrapsecurity/reference_contract_parity_test.go']);
const apiGo=new Set(['backend/internal/systembackupapi/tasks.go','backend/internal/systembackupapi/tasks_test.go',
  'backend/internal/systembackupapi/submission.go','backend/internal/systembackupapi/submission_test.go']);

export function proofForDelta(row){
  if(gcPaths.includes(row.path))return'gc_two_components';
  if(parentGo.has(row.path))return'current_entry_repair';
  if(parityGo.has(row.path))return'a2_promoted_parity';
  if(apiGo.has(row.path))return'd_api_transport';
  assert.ok(!row.path.startsWith('contracts/')&&!/^backend\/.*\.go$|^backend\/go\.(mod|sum)$/.test(row.path),
    'Unreviewed Go/module/contract change needs a new exact native proof: '+row.path);
  return row.after===null?'support_omissions':'support_retained';
}
function derive(){
  const target=json(targetName),parent=json(target.parent_receipt.path);
  checkTarget(target,enumerate(root),[...parent.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0));
  const configs=[
    ['current_entry_repair','entry_complete_or_exact_repaired_scope','a-current-entry-repair-native-reviewed-20261027-r1.json','a-current-entry-repair-closure-reviewed-20261027-r1.json'],
    ['a2_promoted_parity','a2_reference_capability_parity','a-a2-promoted-native-scope-reviewed-20261027-r1.json','a-a2-promoted-dependency-closure-reviewed-20261027-r1.json'],
    ['d_api_transport','api_d_task_server_cli','a-d-api-native-scope-reviewed-20261027-r1.json','a-d-api-dependency-closure-reviewed-20261027-r1.json'],
    ['gc_two_components','gc_two_tagged_components_only','a-gc-tagged-component-reviewed-20261027-r2.json',null],
    ['support_omissions','support_input_delta','a-owner-support-omissions-scope-reviewed-20261027-r1.json',null],
    ['support_retained','support_input_delta','a-owner-support-retained-scope-reviewed-20261027-r1.json',null]
  ];
  const reviews=new Map(),closures=new Map();
  const proofs=configs.map(([id,profile,name,closureName])=>{
    const file='docs/evidence/'+name,review=json(file);reviews.set(id,review);
    let validator;
    if(profile==='gc_two_tagged_components_only'){
      assert.deepEqual(pin(file),target.gc_component_review);assert.equal(review.ordinary_scope_review_complete,false);
      validator=pin('docs/evidence/a-gc-tagged-component-rename-review-20261027.mjs');
    }else{
      assert.equal(review.profile,profile);validator=pin(review.review_validator.path);assert.deepEqual(validator,review.review_validator);
      if(profile==='support_input_delta'){
        assert.equal(review.executed_input_inventory_complete,true);assert.equal(review.not_functional_acceptance,true);
        for(const input of review.native_execution_inputs)assert.deepEqual(pin(input.path),input);
        for(const log of review.receiver_test_logs)assert.deepEqual(pin(log.path),log);
      }else{
        assert.equal(review.kind,'a_owner_pre_thin_native_scope_proof.v1');assert.equal(review.status,'accepted_exact_scope_for_local_supplement');
        assert.equal(review.source_role,'target');assert.equal(review.native_source_stability_verified,true);assert.equal(review.cleanup_verified,true);
        const closure=json('docs/evidence/'+closureName);closures.set(id,closure);
        assert.equal(closure.kind,'a_owner_pre_thin_dependency_closure_review.v1');assert.equal(closure.status,'complete_exact_native_dependency_scope');
        assert.equal(closure.profile,profile);assert.equal(closure.source_role,'target');assert.equal(sourceDigest(closure.source_files),closure.source_sha256);
        const files=new Map(target.target_files.map(p=>[p.path,p]));
        for(const p of closure.source_files){assert.deepEqual(files.get(p.path),p);assert.deepEqual(pin(p.path),p);}
        assert.equal(closure.variants.length,4);assert.equal(new Set(closure.variants.map(v=>v.goos+':'+v.tags)).size,4);
        for(const variant of closure.variants){assert.equal(variant.exit_code,0);assert.deepEqual(pin(variant.log.path),variant.log);}
        for(const log of review.native_logs)assert.deepEqual(pin(log.path),log);
      }
      assert.equal(review.actual_sql,false);assert.equal(review.production_authorized,false);
      for(const receipt of review.native_receipts)assert.deepEqual(pin(receipt.path),receipt);
    }
    return{id,profile,native_receipts:review.native_receipts??[],independent_review:pin(file),review_validator:validator,
      dependency_closure_review:closureName?pin('docs/evidence/'+closureName):null};
  });
  const coverage=target.deltas.map(({path,before,after})=>({path,before,after,proof_ids:[proofForDelta({path,before,after})]}));
  const complete=reviews.get('current_entry_repair');assert.equal(complete.complete_parent_obligations_verified,true);
  assert.deepEqual([...complete.complete_parent_packages].sort(),[...parent.package_passes].sort());
  for(const [id,review] of reviews){
    const rows=coverage.filter(row=>row.proof_ids.includes(id));
    if(id.startsWith('support_'))assert.deepEqual(review.deltas,rows.map(({path,before,after})=>({path,before,after})));
    else if(closures.has(id)){
      const mapped=new Map(closures.get(id).source_files.map(p=>[p.path,p]));
      for(const row of rows){assert.ok(row.after,'Unexpected removed ordinary input');assert.deepEqual(mapped.get(row.path),row.after);}
    }
  }
  const scope={kind:'a_owner_pre_thin_scope_review.v1',status:'ready_for_fifteen_stage_local_supplement_only',
    target_manifest:pin(targetName),target_sha256:target.target_sha256,parent_scope_proof_ids:['current_entry_repair'],
    coverage,proofs,blockers:[],post_target_obligations:target.post_target_obligations,
    native_start_authorized:true,current_baseline_ready:false,actual_sql_authorized:false};
  validateScopeStructure(target,scope);return scope;
}
function main(){
  const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
  const output='docs/evidence/a-owner-pre-thin-scope-reviewed-20261027-r1.json',scope=derive();
  if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(scope,null,2)+'\n',{flag:'wx'});
  else assert.deepEqual(json(output),scope);
  // Assembly never mutates the closed A approval registry. The real intake
  // must still refuse this exact file until A registers its full hash.
  console.log(JSON.stringify({mode,scope:pin(output),deltas:scope.coverage.length,proofs:scope.proofs.length,
    registration_performed:false,native_start_authorized_by_this_command:false,current_baseline_ready:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
