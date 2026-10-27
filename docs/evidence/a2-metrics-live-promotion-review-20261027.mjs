import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output='docs/evidence/a2-metrics-live-promotion-reviewed-20261027-r4.json';
const promotionPath='docs/evidence/d2-metrics-controller-live-promotion-20261027.json';
const composedPath='docs/evidence/a-metrics-current-candidate-composed-reviewed-20261027-r1.json';
const taggedPath='docs/evidence/d2-metrics-tagged-security-candidate-73d13ff796d44907bc4079ef728c983e-20261027.json';
const raw=p=>fs.readFileSync(path.isAbsolute(p)?p:path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:hash(raw(p))});
const verifyPin=p=>{assert.equal(raw(p.path).length,p.size);assert.equal(hash(raw(p.path)),p.sha256);};
const promotion=json(promotionPath),composed=json(composedPath),tagged=json(taggedPath);
assert.equal(promotion.status,'promoted_exact_eight_file_candidate');assert.equal(promotion.error,null);
for(const key of ['source_before_complete_set_verified','source_after_complete_set_verified','live_sources_promoted'])assert.equal(promotion[key],true,key);
for(const key of ['rollback_performed','current_baseline_accepted','contract_frozen','collector_and_automatic_clock_bindings_approved',
  'PromQL_executed','actual_SQL','dependencies_installed','production_approved'])assert.equal(promotion[key],false,key);
assert.equal(promotion.before_source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
assert.equal(promotion.after_source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
verifyPin(promotion.A_exact_composition);assert.equal(promotion.A_exact_composition.sha256,pin(composedPath).sha256);
verifyPin(promotion.candidate_manifest);const manifest=json(promotion.candidate_manifest.path);
assert.equal(composed.status,'accepted_exact_eight_file_application_after_controller_and_impacted_security_native_composition');
assert.equal(composed.source_sha256,promotion.after_source_sha256);
assert.equal(tagged.status,'passed_private_tagged_security_candidate');assert.equal(tagged.error,null);
for(const key of ['source_precheck','source_postcheck','source_set_precheck','source_set_postcheck','owner_removed'])assert.equal(tagged[key],true,key);
assert.equal(fs.existsSync(tagged.owner),false);assert.equal(tagged.steps.length,4);assert.ok(tagged.steps.every(s=>s.exit_code===0));
for(const step of tagged.steps){assert.equal(hash(raw(step.log)),step.sha256);if(step.stderr)assert.equal(hash(raw(step.stderr)),step.stderr_sha256);}
assert.equal(tagged.native_inventory.source_sha256,manifest.source_sha256);
assert.equal(tagged.native_inventory.complete_source_file_set.physical_files,1719);
assert.deepEqual(tagged.native_inventory.seed_names,['TestAAdminReadMySQLSeed']);
assert.equal(tagged.native_inventory.binary.executed,false);
const live=enumerate(root);assert.equal(live.length,1718);assert.deepEqual(live,manifest.files);
assert.equal(sourceDigest(live),promotion.after_source_sha256);
assert.equal(manifest.changes.length,8);
for(const c of manifest.changes){const b=raw(c.path);assert.equal(b.length,c.after.size);assert.equal(hash(b),c.after.sha256);
  verifyPin(c.candidate);assert.equal(c.candidate.sha256,c.after.sha256);}
const owners=promotion.test_build_owners_independently_absent;
assert.equal(owners.length,6);
for(const o of owners){assert.match(o.owner,/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(o.absent,true);assert.equal(fs.existsSync(path.join(root,o.owner)),false);}
const report={kind:'a2_metrics_exact_live_application_composed_review.v1',status:'exact_eight_file_application_independently_verified',
  promotion:pin(promotionPath),A1_exact_composition:pin(composedPath),tagged_security_receipt:pin(taggedPath),
  controller_leaf:pin('docs/evidence/a2-metrics-strict-native-reviewed-20261027-r2.json'),
  earlier_leaf_scope_limitation:pin('docs/evidence/a2-metrics-strict-native-scope-20261027-r3.json'),
  base_source_sha256:promotion.before_source_sha256,current_source_sha256:promotion.after_source_sha256,
  current_source_files:1718,current_complete_input_set_and_bytes_match_tested_manifest:true,
  exact_changed_files:manifest.changes.map(c=>c.path),current_eight_files_match_reviewed_candidates:true,
  new_tagged_security_requirement_now_received:true,earlier_controller_leaf_ready_flag_not_used_alone:true,
  A2_replayed_commands:[['node','docs/evidence/a-metrics-tagged-security-native-review-20261027.mjs','--check'],
    ['node','docs/evidence/a-metrics-current-candidate-composition-review-20261027.mjs','--check']],A2_replay_exits:[0,0],
  Root_six_build_owners_independently_absent:true,live_code_written_by_A2:false,
  whole_baseline_registration_accepted:false,collector_and_automatic_clock_bindings_approved:false,
  four_frozen_gate_projections_proven:false,PromQL_executed:false,remote_execution_owner:'human user',
  agent_SSH_performed:false,SQL_executed:false,dependencies_installed:false,production_approved:false,
  remaining_scope:'This accepts the eight-file source application only. Global baseline, bootstrap original authority/mappings, collector authority and actual first chain remain separate requirements.'};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered,{flag:'wx'});
else{assert.equal(process.argv[2],'--check');assert.deepEqual(json(output),report);}
console.log(JSON.stringify({output,status:report.status,current_files:1718,changed_files:8,tagged_security_received:true,build_owners_absent:6,whole_baseline:false}));
