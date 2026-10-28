import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const fullName='docs/evidence/a-metrics-controller-native-reviewed-20261027-r1.json';
const taggedName='docs/evidence/a-metrics-tagged-security-native-reviewed-20261027-r1.json';
const impactName='docs/evidence/a-metrics-native-impact-reviewed-20261027-r1.json';
const sourceName='docs/evidence/a-metrics-controller-candidate-source-reviewed-20261027-r1.json';
const full=json(fullName),tagged=json(taggedName),impact=json(impactName),source=json(sourceName);
assert.equal(full.status,'accepted_exact_private_controller_native_seven_stages_only');
assert.equal(tagged.status,'accepted_exact_two_impacted_tagged_security_contexts_only');
const m=json(full.source_manifest.path),t=json(tagged.source_manifest.path);
assert.deepEqual(m.files,t.files);assert.deepEqual(m.changes,t.changes);assert.deepEqual(source.changes,m.changes);
assert.equal(m.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');assert.equal(sourceDigest(m.files),m.source_sha256);
assert.equal(impact.candidate_source_sha256,m.source_sha256);assert.equal(impact.ordinary_contexts_unchanged,22);assert.equal(impact.tagged_contexts_unchanged,20);
assert.deepEqual(impact.affected_contexts.map(c=>[c.platform,c.tags,c.root]),tagged.contexts.map(c=>[c.platform,c.tags,'clawreef/internal/systembackupsecurity']));
for(const [review,stages]of [[full,7],[tagged,4]]){
 assert.equal(review.source_sha256,m.source_sha256);assert.equal(review.owner_independently_absent,true);
 assert.deepEqual(pin(review.native_receipt.path),review.native_receipt);assert.deepEqual(pin(review.source_manifest.path),review.source_manifest);
 const receipt=json(review.native_receipt.path);assert.equal(receipt.error,null);assert.equal(receipt.steps.length,stages);assert.ok(receipt.steps.every(s=>s.exit_code===0));
 assert.equal(receipt.source_postcheck,true);assert.equal(receipt.source_set_postcheck,true);assert.equal(receipt.owner_removed,true);assert.equal(fs.existsSync(receipt.owner),false);
 for(const step of receipt.steps){assert.equal(pin(step.log).sha256,step.sha256);if(step.stderr)assert.equal(pin(step.stderr).sha256,step.stderr_sha256);}
}
for(const p of [...m.controls,...t.controls])assert.deepEqual(pin(p.path),p);
for(const c of m.changes)assert.deepEqual(pin(c.candidate.path),c.candidate);
const result={kind:'a_metrics_current_candidate_native_composition_review.v1',reviewer:'A1',
 status:'accepted_exact_eight_file_application_after_controller_and_impacted_security_native_composition',
 source_sha256:m.source_sha256,base_source_sha256:m.base_source_sha256,source_files:1718,
 candidate_manifest:pin(full.source_manifest.path),changes:m.changes,
 independent_reviews:[sourceName,fullName,taggedName,impactName].map(pin),
 controller_native_stages:7,tagged_security_native_stages:4,ordinary_roots:147,ordinary_pass_events:237,
 Admin_seed_checks:1,Linux_controller_compiles:2,Linux_tagged_security_compiles:1,
 source_and_complete_set_postchecks_verified:true,all_native_owners_independently_absent:true,
 ordinary_contexts_with_identical_selected_dependencies:22,tagged_contexts_with_identical_selected_dependencies:20,
 both_changed_tagged_security_contexts_supplemented:true,
 ready_for_exact_eight_file_application:true,application_performed_by_this_command:false,
 current_whole_baseline_accepted:false,production_approved:false,actual_SQL:false,
 actual_PromQL_executed:false,trusted_collector_or_automatic_cleanup_clock_proven:false,
 dependencies_installed:false,new_Go_executed_by_A1:false,whole_goal_complete:false,
 application_constraints:['Apply only the eight exact candidate bytes after full live-before inventory verification.',
 'Verify complete live source bytes and set equal the tested candidate after application.',
 'Keep all historical scope helpers and receipts unchanged; register a new owner baseline separately.',
 'Regenerate the GC operator source candidate and A source review after these source changes.']};
const output='docs/evidence/a-metrics-current-candidate-composed-reviewed-20261027-r1.json',encoded=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_METRICS_COMPOSITION_ACCEPTED controller_stages=7 tagged_security_stages=4 exact_files=8 application_ready=yes whole_baseline=no');
