import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {lifecyclePlan} from './d-gc-full-lifecycle-source-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const candidate='docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-r4.json';
const request='docs/evidence/d-gc-full-lifecycle-review-request-20261027-r4.json';
const output='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json';
assert.equal(pin(candidate).sha256,'cbbd28eb2c925d5134fe89d7717e0e0378ecc4b38ed006adf7bee52a51c70faa');
assert.equal(pin(request).sha256,'643a8b0f06e0c84f0ff43742f13353dcbda93657dce03196cb0fcd26af74a583');
const c=json(candidate),q=json(request),{result,bytes}=lifecyclePlan(root);
const fields=['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'];
for(const field of fields)assert.deepEqual(c[field],result[field],field);
assert.equal(result.original_source_sha256,'6bf973bd11709b14fa04c13175aadfbd126020be3a10a8c514596b5dd29cb9ca');
assert.equal(result.source_sha256,'46bcb2758c1aabb0839f2b6452aec53c2642b136d1f0f55601ef31118b4156f5');
assert.equal(result.original_files.length,1720);assert.equal(result.files.length,1721);
const supportName='docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json',support=json(supportName);
assert.equal(support.status,'complete_exact_current_input_composition_with_source_only_PromQL_preparer');assert.deepEqual(support.files,result.original_files);
assert.equal(support.source_sha256,result.original_source_sha256);assert.equal(support.backend_and_contracts_byte_sets_unchanged,true);
assert.equal(support.mock_tests_executed_by_A1,true);assert.deepEqual(pin(support.actual_mock_test_log.path),support.actual_mock_test_log);
const oldCandidate=json('docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-r3.json');
const oldReviewName='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r2.json',oldReview=json(oldReviewName);
for(const field of fields)assert.deepEqual(oldReview[field],oldCandidate[field]);
const previous=new Map(oldCandidate.original_files.map(p=>[p.path,p])),current=new Map(result.original_files.map(p=>[p.path,p]));
assert.deepEqual(result.original_files.filter(p=>!previous.has(p.path)),support.only_added_inputs);
assert.equal(support.only_added_inputs.length,2);
for(const [name,p]of previous)assert.deepEqual(current.get(name),p,'old accepted input changed');
assert.deepEqual(result.origin_harness_pins,oldCandidate.origin_harness_pins);
for(const p of [...result.origin_harness_pins,...q.additional_harness_and_preparation_pins,...oldReview.transitive_harness_inputs])assert.deepEqual(pin(p.path),p);
assert.equal(q.rendered_runner.sha256,'d94305ae3e06fbb2903717bbd6db5e663c28032bccb097e45302b00e8fa45f3b');
assert.deepEqual(pin(q.rendered_runner.path),q.rendered_runner);assert.ok(read(q.rendered_runner.path).equals(bytes.get('scripts/system-backup-a-evidence-validation.ps1')));
assert.deepEqual(result.overlays,oldCandidate.overlays);assert.equal(q.cases.length,15);assert.deepEqual(q.cases,json('docs/evidence/d-gc-full-lifecycle-requirements-20261026.json').cases);
const registrationName='docs/evidence/a-owner-current-baseline-registered-reviewed-20261027.json',registration=json(registrationName);
assert.equal(registration.status,'current_owner_baseline_registered_and_original_snapshot_preflight_ready');
assert.deepEqual(registration.current_complete_source,pin(supportName));assert.equal(registration.current_complete_source_sha256,result.original_source_sha256);
assert.equal(registration.current_owner_roots,703);assert.equal(registration.current_owner_pass_events,5530);assert.equal(registration.Node_failed,0);
assert.deepEqual(pin(registration.receiver_after.path),registration.receiver_after);assert.deepEqual(pin(registration.regression_log.path),registration.regression_log);
for(const p of registration.preflight_outputs){assert.deepEqual(pin(p.path),p);assert.equal(json(p.path).status,'ready_for_original_snapshot_gate');}
const capsule=current.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');assert.equal(capsule.sha256,q.capsule.sha256);
const review={kind:'d_gc_full_lifecycle_source_review.v1',reviewer:'A',status:'accepted_exact_lifecycle_candidate_inputs',
 ...Object.fromEntries(fields.map(k=>[k,result[k]])),capsule_sha256:capsule.sha256,production_approved:false,
 candidate:pin(candidate),request:pin(request),previous_exact_source_review:pin(oldReviewName),
 current_full_source_composition:pin(supportName),current_owner_baseline_registration:pin(registrationName),
 additional_source_only_support_inputs:support.only_added_inputs,actual_support_mock_test:support.actual_mock_test_log,
 transitive_harness_inputs:oldReview.transitive_harness_inputs,
 unchanged_original_1718_native_input_bytes_verified:true,unchanged_origin_harness_and_seven_literal_overlays_verified:true,
 current_owner_baseline_registered:true,namespace_UID_and_input_hash_guards_preserved:true,
 fifteen_case_catalog_and_actual_receiver_preserved:true,
 collector_domain_authority:'synthetic_known_tasks',physical_report:'synthetic',
 complete_real_domain_authority:false,production_scale_approved:false,source_review_only:true,
 original_failed_parent_reclassified:false,old_42_full_33_cold_7_recounted:false,
 new_Go_started_by_this_review:false,SSH:false,actual_SQL_cases:0,actual_PromQL_executed:false,
 trusted_metrics_collector_or_automatic_clock_proven:false,
 execution_coordination:'This source review does not schedule operator execution. The exact-source capture gate and original remote permissions remain mandatory.',
 whole_goal_complete:false};
const encoded=JSON.stringify(review,null,2)+'\n';if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_GC_LIFECYCLE_CURRENT_SOURCE_REVIEWED original=6bf973bd overlay=46bcb275 files=1720/1721 actual_SQL=0 production=no');
