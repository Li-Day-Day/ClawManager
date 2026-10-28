import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const prefix='docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2';
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const output='docs/evidence/a-metrics-controller-native-reviewed-20261027-r1.json';
// No output is possible without the exact terminal native receipt.
const r=json(prefix+'.json');assert.equal(r.kind,'d2_metrics_controller_private_native.v1');
assert.equal(r.status,'passed_private_controller_candidate');assert.equal(r.error,null);
for(const field of ['Go_started','tests_started','source_precheck','source_set_precheck','source_postcheck','source_set_postcheck','owner_removed'])assert.equal(r[field],true,field);
for(const field of ['actual_SQL','remote_contacted','dependencies_installed','production_approved','live_sources_promoted','collector_and_automatic_clock_bindings_approved'])assert.equal(r[field],false,field);
const owner=path.join(root,'.tmp-d-index-cache-6eb295fa53fa4b299fc506a66bc76960');
assert.equal(r.owner,owner);assert.equal(fs.existsSync(owner),false);
assert.equal(r.source_manifest,path.resolve(root,prefix+'.source.json'));
assert.equal(pin(prefix+'.source.json').sha256,r.source_manifest_sha256);
const m=json(prefix+'.source.json'),base=json(m.base_snapshot.path),reviewName='docs/evidence/a-metrics-controller-candidate-source-reviewed-20261027-r1.json',review=json(reviewName);
assert.equal(m.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
assert.equal(sourceDigest(m.files),m.source_sha256);assert.equal(m.files.length,1718);assert.equal(m.changes.length,8);
assert.deepEqual(pin(m.base_snapshot.path),m.base_snapshot);
assert.deepEqual(enumerate(root),base.files,'live base changed before native intake');
assert.equal(review.candidate_source_sha256,m.source_sha256);assert.deepEqual(review.source_manifest,pin(prefix+'.source.json'));
assert.equal(review.status,'reviewed_exact_eight_private_candidate_inputs_native_and_runtime_acceptance_pending');
for(const p of m.controls)assert.deepEqual(pin(p.path),p);
assert.equal(pin('docs/evidence/d2-metrics-controller-candidate-native-20261027-r2.ps1').sha256,r.runner_sha256);
for(const c of m.changes)assert.deepEqual(pin(c.candidate.path),c.candidate);
assert.equal(r.steps.length,7);const pkg='./internal/systembackupcontroller',qualified='clawreef/internal/systembackupcontroller';
const variants=[],dependencies=new Set(['backend/go.mod','backend/go.sum']);
let index=0;
for(const platform of ['windows','linux'])for(const tags of ['ordinary','systembackup_mysql']){
 const s=r.steps[index++],command=['go','list','-deps','-test','-json'];if(tags!=='ordinary')command.push('-tags',tags);command.push(pkg);
 assert.deepEqual(s.command,command);assert.equal(s.platform,platform);assert.equal(s.tags,tags);assert.equal(s.exit_code,0);
 assert.equal(pin(s.log).sha256,s.sha256);assert.equal(pin(s.stderr).sha256,s.stderr_sha256);assert.equal(read(s.stderr).length,0);
 const named=prefix+'.'+platform+'.'+tags+'.go-list.jsonl';assert.ok(read(named).equals(read(s.log)));
 const rows=parseGoList(read(named).toString('utf8')),closure=selectedGoClosure(rows,[qualified]);
 for(const row of rows)if(row.Module?.Path==='clawreef')assert.equal(path.resolve(row.Module.Dir),path.join(owner,'source/backend'));
 checkSelectedPackageSets(closure.directories,m.files,base.files);
 for(const p of closure.files)dependencies.add(p);
 variants.push({platform,tags,log:pin(named),selected_source_files:closure.files.length});
}
for(const [i,s]of r.steps.entries()){assert.equal(s.exit_code,0);assert.equal(pin(s.log).sha256,s.sha256);if(i>=4)assert.equal(s.tags,i===4?'ordinary':i===5?'ordinary':'systembackup_mysql');}
assert.deepEqual(r.steps[4].command,['go','test','-json','-count=1','-timeout=2700s',pkg]);assert.equal(r.steps[4].platform,'windows');
const names=validateGoEvents(read(r.steps[4].log).toString('utf8'),qualified);
const oldName='docs/evidence/d2-metrics-controller-candidate-e08f-20261027.json',old=json(oldName);
assert.equal(old.status,'failed');assert.equal(old.owner_removed,true);assert.equal(old.steps[4].exit_code,0);
const oldNames=validateGoEvents(read(old.steps[4].log).toString('utf8'),qualified);assert.deepEqual([...names].sort(),[...oldNames].sort(),'same candidate lost ordinary tests');
assert.equal(names.filter(n=>!n.includes('/')).length,147);assert.equal(names.length,237);
const inventory=json(prefix+'.inventory.json');assert.deepEqual(r.native_inventory,inventory);
assert.equal(inventory.source_sha256,m.source_sha256);assert.equal(inventory.steps,7);assert.equal(inventory.roots,147);assert.equal(inventory.pass_events,237);
assert.deepEqual(inventory.complete_source_file_set,m.complete_source_file_set);assert.equal(inventory.complete_source_file_set.physical_files,1719);
for(const [i,tags]of [[5,'ordinary'],[6,'systembackup_mysql']]){
 const command=['go','test','-c'];if(tags!=='ordinary')command.push('-tags',tags);command.push('-o',path.join(owner,'binary/controller.'+tags+'.test'),pkg);
 assert.deepEqual(r.steps[i].command,command);assert.equal(r.steps[i].platform,'linux');
 const b=inventory.binaries.find(b=>b.tags===tags);assert.ok(b);assert.equal(b.executed,false);assert.ok(b.size>100000);assert.match(b.sha256,/^[a-f0-9]{64}$/);
 const header=Buffer.from(b.header64_hex,'hex');assert.equal(header.length,64);assert.equal(header.subarray(0,7).toString('hex'),'7f454c46020101');assert.equal(header.readUInt16LE(18),62);assert.equal(header.readUInt16LE(52),64);
}
const pins=new Map(m.files.map(p=>[p.path,p]));const sourceFiles=[...dependencies].sort().map(p=>{assert.ok(pins.has(p),p);return pins.get(p);});
const result={kind:'a_metrics_controller_private_native_review.v1',reviewer:'A1',status:'accepted_exact_private_controller_native_seven_stages_only',
 native_receipt:pin(prefix+'.json'),source_manifest:pin(prefix+'.source.json'),source_review:pin(reviewName),
 source_sha256:m.source_sha256,base_source_sha256:m.base_source_sha256,source_files:1718,changes:m.changes,
 variants,dependency_files:sourceFiles,ordinary_roots:147,ordinary_pass_events:237,old_partial_test_names_preserved:true,
 recorded_linux_binaries:inventory.binaries,recorded_ELF_headers_checked:true,binary_bytes_reinspected_after_cleanup:false,
 complete_source_file_set_pre_and_post_checks_recorded:true,source_and_helper_pins_verified:true,owner_independently_absent:true,
 logs:r.steps.map(s=>pin(s.log)),old_failed_e08f_reclassified:false,Go_repeated_by_A1:false,
 dependencies_installed:false,actual_SQL:false,actual_PromQL_executed:false,live_source_promoted:false,
 trusted_collector_or_automatic_clock_proven:false,current_baseline_accepted:false,production_approved:false,whole_goal_complete:false};
const encoded=JSON.stringify(result,null,2)+'\n';if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_METRICS_CONTROLLER_NATIVE_ACCEPTED stages=7 roots=147 events=237 cleanup=yes candidate_only=yes');
