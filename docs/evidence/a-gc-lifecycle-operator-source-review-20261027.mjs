import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {lifecyclePlan} from './d-gc-full-lifecycle-source-20261026.mjs';
import {requireCompleteCurrentOrdinary} from './a-current-entry-repair-native-review-20261027.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const candidate='docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-r2.json';
const request='docs/evidence/d-gc-full-lifecycle-review-request-20261027-r2.json';
const output='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json';
assert.equal(pin(candidate).sha256,'955b7d7fc9b61280693ce50fee6fb3bcaea1032a525617c1d32c24507f6083c8');
assert.equal(pin(request).sha256,'6a49320833855a54f36ff20ed336ac81b42bff03172454a653a00c750ea2b267');
const c=json(candidate),q=json(request),{result,bytes}=lifecyclePlan(root);
for(const field of ['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'])assert.deepEqual(c[field],result[field],field);
assert.equal(result.original_source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
assert.equal(result.source_sha256,'44a3bca859a3da2b199bc8348234ad68c8be912f04924dc29b90b5deb7037e1d');
assert.equal(result.original_files.length,1718);assert.equal(result.files.length,1719);
assert.deepEqual(result.original_files,json('docs/evidence/a-owner-pre-thin-target-20261027-r2.json').target_files);
for(const p of [...q.additional_harness_and_preparation_pins,...result.origin_harness_pins])assert.deepEqual(pin(p.path),p);
assert.deepEqual(pin(q.rendered_runner.path),q.rendered_runner);
assert.ok(read(q.rendered_runner.path).equals(bytes.get('scripts/system-backup-a-evidence-validation.ps1')));
const ordinaryName='docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b.json';
const ordinary=json(ordinaryName);requireCompleteCurrentOrdinary(ordinary);assert.equal(fs.existsSync(ordinary.owner),false);
assert.deepEqual(json(ordinary.source_manifest).files,result.original_files);
const repairName='docs/evidence/a-current-entry-repair-native-reviewed-20261027-r1.json';
const repair=json(repairName);assert.equal(repair.inventory.original_test_events_preserved,8546);
assert.equal(repair.original_parent_status_preserved,'failed');assert.equal(repair.original_final_postcheck_retroactively_claimed,false);
const fifteenName='docs/evidence/a-current-fifteen-stage-reviewed-20261027-r1.json';
const fifteen=json(fifteenName);assert.equal(fifteen.status,'accepted_exact_native_fifteen_stage_supplement_only');
assert.equal(fifteen.source_sha256,result.original_source_sha256);assert.equal(fifteen.frozen_source_postcheck_verified,true);
assert.equal(fifteen.owned_build_products_removed,true);assert.equal(fifteen.strict_peer_validator_exit,0);
assert.deepEqual(fifteen.GC_seed_names,q.cases.length===15?['TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullLifecycleMySQLSeed','TestDDownloadGCFullProfileMySQLSeed']:[]);
const scopeName='docs/evidence/a-owner-pre-thin-scope-reviewed-20261027-r1.json';
assert.equal(pin(scopeName).sha256,'c6510f8d1625c99233798b8b1d27c2c3af636579e817e3bd27f6bb44b22843d3');
const selectorName='docs/evidence/a-gc-lifecycle-selector-fix-reviewed-20261027-r2.json';
assert.equal(json(selectorName).status,'selector_conflict_fixed_source_preparation_only');
// Record the complete local JS import graph for the source/harness helpers.
const imports=new Set();
function visit(p){
  p=path.resolve(root,p);assert.ok(p.startsWith(root+path.sep));if(imports.has(p))return;
  assert.equal(fs.lstatSync(p).isSymbolicLink(),false);imports.add(p);
  if(p.endsWith('.mjs'))for(const m of read(p).toString('utf8').matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+\.mjs)['"]/g))visit(path.resolve(path.dirname(p),m[1]));
}
for(const p of result.origin_harness_pins)visit(p.path);
const review={kind:'d_gc_full_lifecycle_source_review.v1',reviewer:'A',
  status:'accepted_exact_lifecycle_candidate_inputs',
  ...Object.fromEntries(['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'].map(k=>[k,result[k]])),
  capsule_sha256:q.capsule.sha256,production_approved:false,
  review_scope:'Exact 4003 original inventory plus seven literal runner substitutions and the new lifecycle phase; a source review, not an actual SQL receipt.',
  candidate:pin(candidate),request:pin(request),
  prerequisite_reviews:[ordinaryName,repairName,fifteenName,scopeName,selectorName].map(pin),
  transitive_harness_inputs:[...imports].sort().map(pin),
  seven_runner_substitutions_reviewed:true,namespace_UID_and_input_hash_guards_reviewed:true,
  fifteen_case_catalog_and_native_receiver_reviewed:true,
  old_42_full_33_cold_7_recounted:false,original_failed_parent_reclassified:false,
  new_Go_started_by_this_review:false,SSH:false,actual_SQL_cases:0,
  collector_domain_authority:'synthetic_known_tasks',physical_report:'synthetic',
  complete_real_domain_authority:false,production_scale_approved:false,
  current_whole_baseline_accepted:false,
  execution_coordination:'Root owns the sole current Go window. This review does not schedule an operator run. Recompute a new candidate and A review after any source or harness change.',
  whole_goal_complete:false};
const encoded=JSON.stringify(review,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_GC_LIFECYCLE_SOURCE_REVIEWED original=4003f0f0 files=1718 overlay=44a3bca8 files=1719 actual_SQL=0 production=no');
