import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure} from './a-native-selected-go-closure-20261027.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const token='6eb295fa53fa4b299fc506a66bc76960';
const prefix='docs/evidence/d2-metrics-controller-candidate-'+token+'-20261027-r2';
const oldPrefix='docs/evidence/d2-metrics-controller-candidate-e08f-20261027';
const output='docs/evidence/a2-metrics-strict-native-reviewed-20261027-r2.json';
const raw=p=>fs.readFileSync(path.isAbsolute(p)?p:path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const verifyPin=p=>{assert.equal(raw(p.path).length,p.size);assert.equal(sha(raw(p.path)),p.sha256);};
const digest=pins=>sha(Buffer.from(pins.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'));
const j=json(prefix+'.json'),m=json(prefix+'.source.json'),inventory=json(prefix+'.inventory.json'),scope=json(prefix+'.go-scope.json');
assert.equal(j.kind,'d2_metrics_controller_private_native.v1');
assert.equal(j.status,'passed_private_controller_candidate');assert.equal(j.error,null);
for(const key of ['source_precheck','source_postcheck','owner_removed','Go_started','tests_started'])assert.equal(j[key],true,key);
for(const key of ['actual_SQL','remote_contacted','dependencies_installed','production_approved','live_sources_promoted','collector_and_automatic_clock_bindings_approved'])assert.equal(j[key],false,key);
const owner=path.join(root,'.tmp-d-index-cache-'+token);
assert.equal(j.owner,owner);assert.equal(fs.existsSync(owner),false);
assert.equal(j.source_manifest_sha256,sha(raw(prefix+'.source.json')));
assert.equal(m.kind,'d2_metrics_controller_private_candidate_snapshot.v1');
assert.equal(m.files.length,1718);assert.equal(m.node_extra_inputs.length,1);
assert.equal(m.node_extra_inputs[0].path,'docs/system-backup-restore-division-plan.md');
assert.equal(m.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
assert.equal(digest(m.files),m.source_sha256);
assert.deepEqual(m.files.map(p=>p.path),[...m.files.map(p=>p.path)].sort());
assert.equal(new Set(m.files.map(p=>p.path)).size,1718);
const basePath='docs/evidence/d2-metrics-controller-candidate-'+token+'-base-source-20261027-r2.json';
verifyPin(m.base_snapshot);assert.equal(m.base_snapshot.sha256,sha(raw(basePath)));
const base=json(basePath);assert.equal(base.files.length,1718);assert.equal(digest(base.files),base.source_sha256);
assert.equal(base.source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
const expectedPaths=[
  'backend/internal/systembackupcontroller/controller_state_alerts.go',
  'backend/internal/systembackupcontroller/controller_state_alerts_test.go','scripts/system-backup-metrics-registry.mjs',
  'contracts/system-backup/v12/metrics-alert-registry.json','contracts/system-backup/v12/prometheus-alert-rules.yaml',
  'scripts/system-backup-prometheus-rules.test.mjs','scripts/system-backup-contract-artifacts.test.mjs','contracts/system-backup/v12/README.md'];
assert.deepEqual(m.changes.map(p=>p.path),expectedPaths);
const before=new Map(base.files.map(p=>[p.path,p])),after=new Map(m.files.map(p=>[p.path,p]));
for(const c of m.changes){verifyPin(c.candidate);assert.deepEqual(c.before,before.get(c.path));assert.deepEqual(c.after,after.get(c.path));
  assert.equal(c.after.sha256,c.candidate.sha256);assert.equal(c.after.size,c.candidate.size);}
for(const p of base.files.filter(p=>!expectedPaths.includes(p.path)))assert.deepEqual(after.get(p.path),p);
for(const p of [...m.controls,...m.node_extra_inputs])verifyPin(p);
assert.equal(j.runner_sha256,m.controls.find(p=>p.path==='docs/evidence/d2-metrics-controller-candidate-native-20261027-r2.ps1').sha256);
const physicalPaths=[...m.files,...m.node_extra_inputs].map(p=>p.path).sort();
assert.equal(new Set(physicalPaths).size,1719);
const pathDigest=sha(Buffer.from(physicalPaths.join('\n')+'\n'));
const complete={selected_files:1718,node_extra_inputs:1,physical_files:1719,paths_sha256:pathDigest};
assert.deepEqual(m.complete_source_file_set,complete);
assert.deepEqual(inventory.complete_source_file_set,complete);
assert.equal(inventory.source_sha256,m.source_sha256);assert.equal(inventory.steps,7);
assert.deepEqual(j.native_inventory,inventory);
assert.equal(j.steps.length,7);assert.ok(j.steps.every(s=>s.exit_code===0));
for(const s of j.steps){assert.equal(sha(raw(s.log)),s.sha256);if(s.stderr){assert.equal(sha(raw(s.stderr)),s.stderr_sha256);assert.equal(raw(s.stderr).length,0);}}
assert.equal(scope.variants.length,4);verifyPin(scope.source_manifest);
assert.equal(scope.source_manifest.sha256,sha(raw(prefix+'.source.json')));
const scopeResults=[];let index=0;
for(const platform of ['windows','linux'])for(const tags of ['ordinary','systembackup_mysql']){
  const step=j.steps[index++],command=['go','list','-deps','-test','-json'];
  if(tags!=='ordinary')command.push('-tags',tags);command.push('./internal/systembackupcontroller');
  assert.deepEqual(step.command,command);assert.equal(step.platform,platform);assert.equal(step.tags,tags);
  const variant=scope.variants.find(v=>v.platform===platform&&v.tags===tags);assert.ok(variant);verifyPin(variant.log);
  assert.equal(sha(raw(variant.log.path)),step.sha256);
  const rows=parseGoList(raw(variant.log.path).toString('utf8'));
  const closure=selectedGoClosure(rows,['clawreef/internal/systembackupcontroller']);
  assert.deepEqual(variant.source_files,closure.files.map(name=>after.get(name)));
  assert.deepEqual(variant.directories,closure.directories);
  scopeResults.push({platform,tags,source_files:closure.files.length,log:variant.log});
}
assert.deepEqual(j.steps[4].command,['go','test','-json','-count=1','-timeout=2700s','./internal/systembackupcontroller']);
assert.equal(j.steps[4].platform,'windows');
const names=validateGoEvents(raw(j.steps[4].log).toString('utf8'),'clawreef/internal/systembackupcontroller');
const old=json(oldPrefix+'.json');assert.equal(old.status,'failed');
const oldNames=validateGoEvents(raw(old.steps[4].log).toString('utf8'),'clawreef/internal/systembackupcontroller');
assert.deepEqual([...names].sort(),[...oldNames].sort());
assert.equal(names.length,237);assert.equal(names.filter(n=>!n.includes('/')).length,147);
assert.equal(inventory.pass_events,names.length);assert.equal(inventory.roots,147);
for(const name of inventory.required_roots_preserved)assert.ok(names.includes(name));
assert.equal(inventory.binaries.length,2);
for(const [i,tags]of [[5,'ordinary'],[6,'systembackup_mysql']]){
  const step=j.steps[i],binary=path.join(owner,'binary/controller.'+tags+'.test');
  const command=['go','test','-c'];if(tags!=='ordinary')command.push('-tags',tags);command.push('-o',binary,'./internal/systembackupcontroller');
  assert.deepEqual(step.command,command);assert.equal(step.platform,'linux');assert.equal(step.tags,tags);
  const b=inventory.binaries.find(b=>b.tags===tags);assert.ok(b);assert.equal(b.platform,'linux');assert.equal(b.executed,false);
  assert.ok(Number.isSafeInteger(b.size)&&b.size>64);assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.match(b.header64_hex,/^[a-f0-9]{128}$/);
  const header=Buffer.from(b.header64_hex,'hex');assert.equal(header.subarray(0,7).toString('hex'),'7f454c46020101');
  assert.ok([2,3].includes(header.readUInt16LE(16)));assert.equal(header.readUInt16LE(18),62);assert.equal(header.readUInt32LE(20),1);assert.equal(header.readUInt16LE(52),64);
}
const sourceReview=json('docs/evidence/a2-metrics-controller-registry-reviewed-20261027-r3.json');
for(const p of sourceReview.inputs)verifyPin(p);
const report={kind:'a2_metrics_strict_controller_private_native_review.v1',status:'passed_exact_private_eight_file_candidate_scope',
  receipt:pin(prefix+'.json'),source_manifest:pin(prefix+'.source.json'),scope:pin(prefix+'.go-scope.json'),inventory:pin(prefix+'.inventory.json'),
  candidate_source_sha256:m.source_sha256,base_source_sha256:base.source_sha256,
  physical_source_set:complete,recorded_pre_and_post_complete_set_checks:true,all_control_pins_currently_match:true,
  exact_changed_files:expectedPaths,unchanged_base_files:1710,Go_scope_variants:scopeResults,
  Windows:{package:'clawreef/internal/systembackupcontroller',roots:147,pass_events:237,old_failed_window_names_preserved:true},
  Linux:{ordinary_and_tagged_build_exits:[0,0],binaries:inventory.binaries,
    recorded_headers_independently_validated:true,deleted_binaries_reconstructed_or_reread:false,executed:false},
  old_failed_e08f_receipt_preserved:true,owner_independently_absent:true,
  ready_for_exact_eight_file_application:true,whole_baseline_accepted:false,
  limitations:['The full binary bytes were hashed and headers checked by the pinned runner inventory before cleanup; A2 independently verifies those retained records and actual build exits.',
    'This permits exact candidate application, not whole baseline registration, collector authority, automatic-cleanup clock mapping, real residual-volume classification or production use.',
    'PromQL fixtures remain prepared but unexecuted; B cross-review and four frozen singleton gate metric projections remain open.'],
  Go_executed_by_A2:false,SQL_executed:false,PromQL_executed:false,dependencies_installed:false,
  live_sources_modified_by_A2:false,production_approved:false};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered,{flag:'wx'});
else{assert.equal(process.argv[2],'--check');assert.deepEqual(json(output),report);}
console.log(JSON.stringify({output,status:report.status,Windows_roots:147,Windows_events:237,linux_builds:2,source_paths:1719,owner_absent:true,whole_baseline:false}));
