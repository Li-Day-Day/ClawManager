import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const manifestName='docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2.source.json';
const closureName='docs/evidence/a-current-entry-repair-closure-reviewed-20261027-r1.json';
const repairName='docs/evidence/a-current-entry-repair-native-reviewed-20261027-r1.json';
const m=json(manifestName),base=json(m.base_snapshot.path),closure=json(closureName),repair=json(repairName);
assert.equal(m.base_source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
assert.equal(sourceDigest(base.files),m.base_source_sha256);assert.equal(sourceDigest(m.files),m.source_sha256);
assert.equal(m.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
const before=new Map(base.files.map(p=>[p.path,p])),after=new Map(m.files.map(p=>[p.path,p]));
for(const p of closure.source_files)assert.deepEqual(before.get(p.path),p,'historical closure not on current base');
const changed=new Set(m.changes.map(p=>p.path));
for(const p of m.changes)assert.deepEqual(pin(p.candidate.path),p.candidate);
const roots=[...closure.selected_test_roots].sort();assert.equal(roots.length,11);
assert.deepEqual(roots,[...repair.inventory.current_complete_packages].sort());
const contexts=[];
for(const variant of closure.variants){
 assert.deepEqual(pin(variant.log.path),variant.log);assert.equal(variant.exit_code,0);
 const rows=parseGoList(read(variant.log.path).toString('utf8'));
 for(const pkg of roots){
  const selected=selectedGoClosure(rows,[pkg]);checkSelectedPackageSets(selected.directories,base.files,m.files);
  for(const p of selected.files)assert.ok(before.has(p)&&after.has(p),'unmapped selected input '+p);
  const intersection=selected.files.filter(p=>changed.has(p));
  const expected=variant.tags==='systembackup_mysql'&&pkg==='clawreef/internal/systembackupsecurity'
   ?['backend/internal/systembackupcontroller/controller_state_alerts.go']:[];
  assert.deepEqual(intersection,expected,'unexpected affected root/context');
  contexts.push({platform:variant.goos,tags:variant.tags||'ordinary',root:pkg,
   selected_source_files:selected.files.length,changed_selected_inputs:intersection,
   actual_go_list:variant.log});
 }
}
assert.equal(contexts.length,44);assert.equal(contexts.filter(c=>c.changed_selected_inputs.length).length,2);
const output='docs/evidence/a-metrics-native-impact-reviewed-20261027-r1.json';
const result={kind:'a_metrics_actual_native_dependency_impact_review.v1',reviewer:'A1',
 status:'exact_per_root_context_impact_reviewed_affected_tagged_security_validation_pending',
 candidate_source:pin(manifestName),prior_dependency_closure:pin(closureName),prior_native_repair:pin(repairName),
 base_source_sha256:m.base_source_sha256,candidate_source_sha256:m.source_sha256,
 contexts,ordinary_contexts_unchanged:22,tagged_contexts_unchanged:20,
 affected_contexts:contexts.filter(c=>c.changed_selected_inputs.length),
 non_Go_candidate_targets_require_separate_contract_validation:m.changes.filter(c=>!c.path.endsWith('.go')).map(c=>c.path),
 original_compile_and_seed_obligations_not_waived:true,
 required_new_evidence:['complete controller native seven-stage receipt',
 'Windows tagged security actual dependency list and exact Admin seed',
 'Linux tagged security actual dependency list and test compilation',
 'exact same candidate source, source byte and complete-set postchecks, owned product cleanup'],
 new_Go_executed_by_this_review:false,live_source_modified:false,
 current_baseline_accepted:false,actual_SQL:false,dependencies_installed:false,production_approved:false,whole_goal_complete:false};
const encoded=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_METRICS_NATIVE_IMPACT_REVIEWED contexts=44 ordinary_unchanged=22 tagged_unchanged=20 tagged_security_affected=2');
