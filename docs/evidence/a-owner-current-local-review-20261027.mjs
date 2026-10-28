// Final local owner preparation intake. It cannot produce an acceptance until
// both private metrics windows are accepted and exact candidate bytes are live.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {frozenMigrationCatalog} from './a-download-owners-actual-review-20261020.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const manifest='docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2.source.json';
const m=json(manifest),expected='7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101';
assert.equal(m.source_sha256,expected);assert.equal(sourceDigest(m.files),expected);assert.equal(m.files.length,1718);
const requirements=[
 ['docs/evidence/a-current-entry-repair-native-reviewed-20261027-r1.json','accepted_exact_scope_for_local_supplement'],
 ['docs/evidence/a-current-fifteen-stage-reviewed-20261027-r1.json','accepted_exact_native_fifteen_stage_supplement_only'],
 ['docs/evidence/a-metrics-controller-candidate-source-reviewed-20261027-r1.json','reviewed_exact_eight_private_candidate_inputs_native_and_runtime_acceptance_pending'],
 ['docs/evidence/a-metrics-controller-native-reviewed-20261027-r1.json','accepted_exact_private_controller_native_seven_stages_only'],
 ['docs/evidence/a-metrics-tagged-security-native-reviewed-20261027-r1.json','accepted_exact_two_impacted_tagged_security_contexts_only'],
 ['docs/evidence/a-metrics-native-impact-reviewed-20261027-r1.json','exact_per_root_context_impact_reviewed_affected_tagged_security_validation_pending'],
 ['docs/evidence/a-owner-current-native-inventory-reviewed-20261027-r1.json','accepted_exact_4003_native_two_package_inventory_only']
];
const reviews=new Map();
for(const [p,status]of requirements){const r=json(p);assert.equal(r.status,status,p);reviews.set(p,r);}
const repair=reviews.get(requirements[0][0]),fifteen=reviews.get(requirements[1][0]);
assert.equal(repair.complete_parent_obligations_verified,true);assert.equal(repair.original_parent_status_preserved,'failed');
assert.equal(repair.original_final_postcheck_retroactively_claimed,false);assert.equal(repair.inventory.original_test_events_preserved,8546);
assert.equal(fifteen.source_sha256,m.base_source_sha256);assert.equal(fifteen.frozen_source_postcheck_verified,true);assert.equal(fifteen.owned_build_products_removed,true);
assert.equal(fifteen.successful_stages,13);assert.equal(fifteen.expected_assertion_failure_stages,2);
const full=reviews.get(requirements[3][0]),tagged=reviews.get(requirements[4][0]);
for(const r of [full,tagged]){
 assert.equal(r.source_sha256,expected);assert.equal(r.owner_independently_absent,true);
 assert.deepEqual(pin(r.native_receipt.path),r.native_receipt);assert.deepEqual(pin(r.source_manifest.path),r.source_manifest);
 const native=json(r.native_receipt.path);assert.equal(native.error,null);assert.ok(native.steps.every(s=>s.exit_code===0));
 assert.equal(native.source_postcheck,true);assert.equal(native.source_set_postcheck,true);assert.equal(native.owner_removed,true);assert.equal(fs.existsSync(native.owner),false);
 const nativeSource=json(r.source_manifest.path);assert.deepEqual(nativeSource.files,m.files);assert.deepEqual(nativeSource.changes,m.changes);
 for(const p of nativeSource.controls)assert.deepEqual(pin(p.path),p);
 for(const step of native.steps){assert.equal(pin(step.log).sha256,step.sha256);if(step.stderr){assert.equal(pin(step.stderr).sha256,step.stderr_sha256);assert.equal(read(step.stderr).length,0);}}
}
const impact=reviews.get(requirements[5][0]);assert.equal(impact.candidate_source_sha256,expected);assert.equal(impact.contexts.length,44);
assert.equal(impact.ordinary_contexts_unchanged,22);assert.equal(impact.tagged_contexts_unchanged,20);assert.equal(impact.affected_contexts.length,2);
assert.equal(tagged.contexts.length,2);assert.deepEqual(tagged.seed_names,['TestAAdminReadMySQLSeed']);
const scope='docs/evidence/a-owner-pre-thin-scope-reviewed-20261027-r1.json';
assert.equal(pin(scope).sha256,'c6510f8d1625c99233798b8b1d27c2c3af636579e817e3bd27f6bb44b22843d3');
const owner=reviews.get(requirements[6][0]);assert.deepEqual(pin(owner.events.path),owner.events);
const rows=read(owner.events.path).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const inventories=owner.packages.map(p=>{const tests=validateGoEvents(rows.filter(e=>e.Package===p.package).map(e=>JSON.stringify(e)).join('\n'),p.package);
 assert.equal(tests.length,p.pass_events);return {package:p.package,roots:tests.filter(n=>!n.includes('/')).length,pass_events:tests.length};});
assert.equal(owner.historical_5190_names_preserved,5190);assert.equal(owner.roots,703);assert.equal(owner.pass_events,5530);
// All eight bytes, plus the entire selected live input set, must now be the
// previously tested candidate. Source review alone never performs promotion.
for(const c of m.changes){assert.deepEqual(pin(c.candidate.path),c.candidate);assert.deepEqual(pin(c.path),c.after);}
assert.deepEqual(enumerate(root),m.files,'exact metrics candidate is not live; no final source acceptance');
const source={kind:'a_reviewed_owner_preparation_source.v1',source_sha256:expected,files:m.files,
 stable_copy_verified:true,dependencies_installed:false,production_approved:false,actual_SQL:false,
 tested_owner_source_sha256:owner.tested_source_sha256,
 composition_origin:'4003 complete ordinary native inventory and fifteen-stage preparation plus exact metrics controller and impacted tagged-security native supplements',
 source_manifest:pin(manifest),native_reviews:requirements.map(([p])=>pin(p)),
 original_5190_owner_names_preserved:true,remote_snapshot_gate_required:true,
 metrics_collector_or_PromQL_runtime_proven:false,whole_goal_complete:false};
const sourceName='docs/evidence/a-owner-current-reviewed-source-20261027.json';
const sourceBytes=JSON.stringify(source,null,2)+'\n';
const sourcePin={path:sourceName,size:Buffer.byteLength(sourceBytes),sha256:sha(Buffer.from(sourceBytes))};
const catalog=frozenMigrationCatalog(source);assert.equal(catalog.file_count,96);
const acceptance={kind:'a_owner_current_local_preparation_acceptance.v1',
 status:'complete_exact_current_local_owner_preparation_only',source_sha256:expected,source_files:1718,
 source:sourcePin,events:owner.events,events_origin:owner.events_origin,packages:inventories,
 owner_baseline:{main:703,all:5530},original_5190_tests_preserved:5190,
 local_preparation_reviews:requirements.map(([p])=>pin(p)),prior_4003_scope:pin(scope),
 metrics_native_stages:7,impacted_tagged_security_native_stages:4,
 original_fifteen_stage_obligations_preserved:true,expected_counterexample_assertions:2,
 tested_owner_source_sha256:owner.tested_source_sha256,current_candidate_source_sha256:expected,
 catalog,exact_current_bytes_and_file_set_verified:true,
 all_native_source_and_set_postchecks_recorded:true,all_accepted_native_owners_independently_absent:true,
 baseline_registration_performed_by_this_command:false,actual_SQL:false,SSH:false,
 metrics_PromQL_or_trusted_collector_proven:false,bootstrap_27_slots_cleared:false,
 dependencies_installed:false,production_approved:false,whole_goal_complete:false};
assert.deepEqual(enumerate(root),m.files,'source changed during final local review');
const outputs=[[sourceName,sourceBytes],['docs/evidence/a-owner-current-local-accepted-20261027.json',JSON.stringify(acceptance,null,2)+'\n']];
if(mode==='--write'){for(const [p]of outputs)assert.equal(fs.existsSync(path.resolve(root,p)),false);for(const [p,b]of outputs)fs.writeFileSync(path.resolve(root,p),b,{flag:'wx'});}
else for(const [p,b]of outputs)assert.equal(read(p).toString('utf8'),b);
console.log('A_CURRENT_OWNER_LOCAL_PREPARATION_ACCEPTED source=7c428878 files=1718 roots=703 events=5530 remote_SQL=not_run');
