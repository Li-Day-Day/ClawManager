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
const candidate='docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-r3.json';
const request='docs/evidence/d-gc-full-lifecycle-review-request-20261027-r3.json';
const output='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r2.json';
assert.equal(pin(candidate).sha256,'609e726f9b68749e07dc3547f0c0e027b04402cccd290e8a047e46d293ea005a');
assert.equal(pin(request).sha256,'32e90190b871a0adb748311803ca4411425bfb764f00b626709f55f931a70d29');
const c=json(candidate),q=json(request),{result,bytes}=lifecyclePlan(root);
const fields=['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'];
for(const field of fields)assert.deepEqual(c[field],result[field],field);
assert.equal(result.original_source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
assert.equal(result.source_sha256,'18811c56a96b8fedbe5fc6e325d61bd20bdb44a6c42e084a6970ef5fcf372037');
assert.equal(result.original_files.length,1718);assert.equal(result.files.length,1719);
const sourceName='docs/evidence/a-owner-current-reviewed-source-20261027.json',source=json(sourceName);
const acceptanceName='docs/evidence/a-owner-current-local-accepted-20261027.json',acceptance=json(acceptanceName);
assert.deepEqual(source.files,result.original_files);assert.equal(source.source_sha256,result.original_source_sha256);
assert.equal(acceptance.status,'complete_exact_current_local_owner_preparation_only');assert.deepEqual(acceptance.source,pin(sourceName));
assert.equal(acceptance.owner_baseline.main,703);assert.equal(acceptance.owner_baseline.all,5530);assert.equal(acceptance.original_5190_tests_preserved,5190);
const previousCandidate=json('docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-r2.json');
const previousReviewName='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json',previousReview=json(previousReviewName);
assert.equal(pin(previousReviewName).sha256,'554a500d7ae5cf71a2bb2f073315536bfe909e2840d0509ebeab991ab4547600');
assert.deepEqual(result.origin_harness_pins,previousCandidate.origin_harness_pins);
const composedName='docs/evidence/a-metrics-current-candidate-composed-reviewed-20261027-r1.json',composed=json(composedName);
assert.equal(composed.ready_for_exact_eight_file_application,true);assert.equal(composed.source_sha256,result.original_source_sha256);
const oldMap=new Map(previousCandidate.original_files.map(p=>[p.path,p])),nowMap=new Map(result.original_files.map(p=>[p.path,p]));
assert.deepEqual([...oldMap.keys()].sort(),[...nowMap.keys()].sort());
const differences=[...nowMap.keys()].filter(p=>JSON.stringify(oldMap.get(p))!==JSON.stringify(nowMap.get(p))).sort();
assert.deepEqual(differences,composed.changes.map(p=>p.path).sort());assert.equal(differences.length,8);
for(const c of composed.changes){assert.deepEqual(oldMap.get(c.path),c.before);assert.deepEqual(nowMap.get(c.path),c.after);assert.deepEqual(pin(c.path),c.after);}
for(const p of [...q.additional_harness_and_preparation_pins,...result.origin_harness_pins,...previousReview.transitive_harness_inputs])assert.deepEqual(pin(p.path),p);
assert.deepEqual(pin(q.rendered_runner.path),q.rendered_runner);assert.equal(q.rendered_runner.sha256,'d94305ae3e06fbb2903717bbd6db5e663c28032bccb097e45302b00e8fa45f3b');
assert.ok(read(q.rendered_runner.path).equals(bytes.get('scripts/system-backup-a-evidence-validation.ps1')));
assert.deepEqual(result.overlays,previousCandidate.overlays);assert.deepEqual(q.cases,json('docs/evidence/d-gc-full-lifecycle-requirements-20261026.json').cases);assert.equal(q.cases.length,15);
const capsule=nowMap.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');assert.equal(capsule.sha256,q.capsule.sha256);
const preflightName='docs/evidence/a-owner-current-preflight-registered-20261027.json',preflight=json(preflightName);
assert.equal(preflight.status,'ready_for_original_snapshot_gate');assert.equal(preflight.reviewed_source_sha256,result.original_source_sha256);assert.equal(preflight.actual_sql,false);
const review={kind:'d_gc_full_lifecycle_source_review.v1',reviewer:'A',status:'accepted_exact_lifecycle_candidate_inputs',
 ...Object.fromEntries(fields.map(k=>[k,result[k]])),capsule_sha256:capsule.sha256,production_approved:false,
 candidate:pin(candidate),request:pin(request),previous_source_review:pin(previousReviewName),
 final_owner_source:pin(sourceName),final_owner_local_preparation:pin(acceptanceName),
 current_preflight:pin(preflightName),exact_metrics_composition:pin(composedName),
 original_inventory_changes_from_previous_review:composed.changes,
 transitive_harness_inputs:previousReview.transitive_harness_inputs,
 unchanged_origin_harness_pins_and_seven_literal_overlays_verified:true,
 namespace_UID_and_input_hash_guards_preserved:true,fifteen_case_catalog_and_actual_receiver_preserved:true,
 original_failed_parent_reclassified:false,old_42_full_33_cold_7_recounted:false,
 collector_domain_authority:'synthetic_known_tasks',physical_report:'synthetic',
 complete_real_domain_authority:false,production_scale_approved:false,
 source_review_only:true,new_Go_started_by_this_review:false,SSH:false,actual_SQL_cases:0,
 execution_coordination:'This exact source review does not schedule an operator run. Preserve sole native ownership, inspect final registration checks and remote prerequisites before execution.',
 trusted_metrics_collector_or_automatic_clock_or_PromQL_proven:false,whole_goal_complete:false};
const encoded=JSON.stringify(review,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_GC_LIFECYCLE_CURRENT_SOURCE_REVIEWED original=7c428878 overlay=18811c56 files=1718/1719 actual_SQL=0 production=no');
