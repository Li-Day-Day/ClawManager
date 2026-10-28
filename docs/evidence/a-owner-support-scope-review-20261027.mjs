import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkPins,checkTarget,enumerate} from './a-owner-pre-thin-target-20261026.mjs';
import {requireCompleteCurrentOrdinary} from './a-current-entry-repair-native-review-20261027.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json';
const nativePrefix='docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b';
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
export const executionControlPaths=[
  'docs/evidence/d2-current-ordinary-complete-validation-20261027.ps1',
  'docs/evidence/d-local-closeout-snapshot-20261023.mjs',
  'docs/evidence/d2-current-ordinary-inventory-20261027.mjs',
  'docs/evidence/d2-current-ordinary-go-scope-20261027.mjs',
  'docs/evidence/a2-reference-capability-go-scope-20261026.mjs',
  'docs/evidence/a2-reference-capability-supplement-review-20261027-r2.mjs',
  'docs/evidence/d-resources-mysql-actual-review-20261023.mjs',
  'docs/evidence/d2-owner-current-baseline-supplement-20261027.ps1',
  'docs/evidence/d2-owner-current-supplement-inventory-20261027.mjs',
  'docs/evidence/d2-owner-entry-supplement-inventory-20261026.mjs',
  'docs/evidence/a-owner-entry-counterexamples-prepare-20261026.mjs',
  'docs/evidence/a-owner-finalizer-native-20261026.mjs',
  'docs/evidence/a-owner-pre-thin-target-20261026.mjs'
].sort();
export function splitSupportDeltas(deltas){
  const rows=deltas.filter(row=>!row.path.startsWith('contracts/')&&!/^backend\/.*\.go$|^backend\/go\.(mod|sum)$/.test(row.path))
    .map(({path,before,after})=>({path,before,after}));
  assert.equal(new Set(rows.map(p=>p.path)).size,rows.length);
  return{omitted:rows.filter(p=>p.after===null),retained:rows.filter(p=>p.after!==null)};
}
function derive(){
  const native=json(nativePrefix+'.json');requireCompleteCurrentOrdinary(native);assert.equal(fs.existsSync(native.owner),false);
  const parentProofName='docs/evidence/a-current-entry-repair-native-reviewed-20261027-r1.json',parentProof=json(parentProofName);
  assert.equal(parentProof.profile,'entry_complete_or_exact_repaired_scope');assert.equal(parentProof.complete_parent_obligations_verified,true);
  assert.equal(parentProof.native_source_stability_verified,true);assert.equal(parentProof.cleanup_verified,true);
  const target=json(targetName),parent=json(target.parent_receipt.path),manifest=json(native.source_manifest);
  checkTarget(target,enumerate(root),[...parent.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0));
  assert.equal(pin(native.source_manifest).sha256,native.source_manifest_sha256);assert.deepEqual(manifest.files,target.target_files);
  const {omitted,retained}=splitSupportDeltas(target.deltas);assert.equal(omitted.length,51);assert.equal(retained.length,10);
  for(const row of omitted)assert.deepEqual(pin(row.path),row.before,'Excluded original input was physically changed');
  assert.deepEqual(retained.map(p=>p.path),[
    'docs/system-backup-d-config-canonical-081-proposal-20261014.sql',
    'docs/system-backup-d-config-canonical-candidate-20261012.sql',
    'docs/system-backup-d-control-health-proposal-20261016.sql',
    'docs/system-backup-restore-schema-inventory.json',
    'scripts/system-backup-a-api-linux-supplement.ps1',
    'scripts/system-backup-a-api-readiness-validation.ps1',
    'scripts/system-backup-d-api-smoke.mjs',
    'scripts/system-backup-d-api-smoke.test.mjs',
    'scripts/system-backup-d-api-validation.ps1',
    'scripts/system-backup-d-bootstrap-entry-linux-supplement.ps1']);
  const inputs=new Map(target.target_files.map(p=>[p.path,p]));
  for(const name of executionControlPaths)inputs.set(name,pin(name));
  const inventory=[...inputs.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);checkPins(inventory);
  for(const row of omitted)assert.equal(inputs.has(row.path),false);
  for(const row of retained)assert.deepEqual(inputs.get(row.path),row.after);
  const summary=json('docs/system-backup-restore-schema-inventory.json');assert.ok(summary&&typeof summary==='object'&&!Array.isArray(summary));
  const common={kind:'a_owner_pre_thin_support_scope_proof.v1',profile:'support_input_delta',
    native_receipts:[pin(nativePrefix+'.json')],review_validator:pin('docs/evidence/a-owner-support-scope-review-20261027.mjs'),
    native_execution_inputs:inventory,executed_input_inventory_complete:true,not_functional_acceptance:true,
    receiver_test_logs:[pin('docs/evidence/a-owner-support-scope-receiver-tests-20261027.txt'),
      pin('docs/evidence/a-owner-pre-thin-tests-20261027-r3.txt'),pin(nativePrefix+'.console.log')],
    target_manifest:pin(targetName),complete_current_native_prerequisite:pin(parentProofName),
    scope_boundary:'Conservative inventory of every project source/fixture copied for current eight and pending fifteen Go steps, plus their static dispatch/receiver modules; inclusion does not mean every copied file was executed or functionally accepted',
    separately_bound_intake_boundary:{excluded_scope_approval_trust_anchor:'docs/evidence/a-owner-pre-thin-scope-review-20261027.mjs',
      reason:'The approval registry contains the final scope hash and cannot hash-bind itself through that scope; the runner must pin the full checker bytes after A registers the scope and verify them again on exit',
      approval_artifacts_and_review_inputs:'Bound by the strict intake and owning native receipts; generated outputs and toolchain dependencies are outside this project source/control inventory'},
    actual_sql:false,production_authorized:false,current_baseline_ready:false};
  return{omitted:{...common,status:'byte_bound_outside_native_execution_scope',deltas:omitted,
    physical_original_files_unchanged:true,excluded_deployment_and_Python_functional_acceptance:false},
    retained:{...common,status:'source_control_prepared_for_pending_native_execution',deltas:retained,
      source_copy_and_hash_binding_verified:true,SQL_DDL_executed_by_this_review:false,
      remote_wrappers_or_API_smoke_executed_by_this_review:false}};
}
function main(){
  const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
  const result=derive(),outputs=[['a-owner-support-omissions-scope-reviewed-20261027-r1.json',result.omitted],
    ['a-owner-support-retained-scope-reviewed-20261027-r1.json',result.retained]];
  if(mode==='--write')for(const [name] of outputs)assert.equal(fs.existsSync(path.join(root,'docs/evidence',name)),false);
  for(const [name,value] of outputs){const output='docs/evidence/'+name;
    if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    else assert.deepEqual(json(output),value);}
  console.log(JSON.stringify({mode,omitted:51,retained:10,functional_acceptance:false,current_baseline_ready:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
