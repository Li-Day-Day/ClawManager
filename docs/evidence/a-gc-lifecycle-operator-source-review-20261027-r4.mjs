// A exact source review of the two tagged fixture repairs. Native/SQL remain separate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {lifecyclePlan} from './d-gc-full-lifecycle-source-20261026.mjs';
import {changesBetween} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const candidate='docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-r5.json';
const request='docs/evidence/d-gc-full-lifecycle-review-request-20261027-r5.json';
assert.equal(pin(candidate).sha256,'ab3dc8bb9460a92f85711a3a3d228c73aada7bd951b7bb9dda7039c33fc7c4b1');
assert.equal(pin(request).sha256,'f5bd7243705796ce4c094408de9341274323049f1776b5d9d6e1e9e2494e4861');
const c=json(candidate),q=json(request),{result,bytes}=lifecyclePlan(root);
const fields=['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'];
for(const k of fields)assert.deepEqual(c[k],result[k]);
assert.equal(result.original_source_sha256,'dc79d81f74d6d6c293372f6c5404b2a673c3f469da1c4d14d4adc763199efa8e');
assert.equal(result.source_sha256,'f3ed3894471df5b01166a68f6e20ca7e77e4cabfcdb6a9c03a55fd0886aabf62');
assert.equal(result.original_files.length,1720);assert.equal(result.files.length,1721);
const componentName='docs/evidence/a-gc-tagged-component-reviewed-20261027-r3.json',component=json(componentName);
assert.deepEqual(component.exact_current_input_composition.files,result.original_files);
assert.deepEqual(c.current_exact_component_review,pin(componentName));
const ownerReviewName=component.exact_current_input_composition.owner_source_review.path;
assert.deepEqual(pin(ownerReviewName),component.exact_current_input_composition.owner_source_review);
assert.equal(component.capsule_repair.reverse_sha256,'e9806c4892ac770ae2f3cf97e9bcb6ba2f123d125b6d5a00d9533e055d9bdf09');
const oldName='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json',old=json(oldName);
assert.deepEqual(changesBetween(old.original_files,result.original_files).map(p=>p.path),[
 'backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go',
 'backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go']);
assert.deepEqual(old.origin_harness_pins,result.origin_harness_pins);
assert.deepEqual(result.overlays,json(old.candidate.path).overlays);
for(const p of [...result.origin_harness_pins,...q.additional_harness_and_preparation_pins,...old.transitive_harness_inputs])assert.deepEqual(pin(p.path),p);
assert.equal(q.rendered_runner.sha256,'d94305ae3e06fbb2903717bbd6db5e663c28032bccb097e45302b00e8fa45f3b');
assert.ok(read(q.rendered_runner.path).equals(bytes.get('scripts/system-backup-a-evidence-validation.ps1')));
assert.deepEqual(q.cases,json('docs/evidence/d-gc-full-lifecycle-requirements-20261026.json').cases);assert.equal(q.cases.length,15);
const capsule=result.original_files.find(p=>p.path==='backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');
assert.equal(capsule.sha256,q.capsule.sha256);assert.deepEqual(pin(q.capsule_standalone_fix.failed_run.path),q.capsule_standalone_fix.failed_run);
const review={kind:'d_gc_full_lifecycle_source_review.v1',reviewer:'A',status:'accepted_exact_lifecycle_candidate_inputs',
 ...Object.fromEntries(fields.map(k=>[k,result[k]])),capsule_sha256:capsule.sha256,production_approved:false,
 candidate:pin(candidate),request:pin(request),previous_exact_source_review:pin(oldName),
 current_tagged_component_review:pin(componentName),owner_fixture_review:pin(ownerReviewName),
 transitive_harness_inputs:old.transitive_harness_inputs,
 exactly_two_tagged_deltas_verified:true,ordinary_native_input_bytes_unchanged:true,
 unchanged_origin_harness_and_seven_literal_overlays_verified:true,fifteen_case_catalog_and_actual_receiver_preserved:true,
 failed_detached_run_preserved:q.capsule_standalone_fix.failed_run,
 native_GC3_in_source_and_genuine_empty_cwd_pending:true,current_Linux_tagged_compile_pending:true,
 current_owner_actual_retry_passed:false,old_10_plus_new_1_composition_forbidden:true,
 collector_domain_authority:'synthetic_known_tasks',physical_report:'synthetic',
 complete_real_domain_authority:false,production_scale_approved:false,source_review_only:true,
 old_42_full_33_cold_7_recounted:false,new_Go_started_by_this_review:false,SSH:false,actual_SQL_cases:0,
 execution_coordination:'Exact-source review only. Human Owners currently has the sole Go window; do not start this operator concurrently. Its original local gates and genuine detached GC3 must pass before SQL can begin.',
 whole_goal_complete:false};
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r4.json',text=JSON.stringify(review,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
console.log(JSON.stringify({status:review.status,original:result.original_source_sha256,overlay:result.source_sha256,native_pending:true,SQL:0}));
