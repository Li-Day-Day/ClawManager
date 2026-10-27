import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const prefix='docs/evidence/d2-metrics-tagged-security-candidate-73d13ff796d44907bc4079ef728c983e-20261027';
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const output='docs/evidence/a-metrics-tagged-security-native-reviewed-20261027-r1.json';
const r=json(prefix+'.json');assert.equal(r.kind,'d2_metrics_tagged_security_private_native.v1');
assert.equal(r.status,'passed_private_tagged_security_candidate');assert.equal(r.error,null);
for(const key of ['Go_started','tests_started','source_precheck','source_set_precheck','source_postcheck','source_set_postcheck','owner_removed'])assert.equal(r[key],true,key);
for(const key of ['actual_SQL','remote_contacted','dependencies_installed','production_approved','live_sources_promoted','collector_and_automatic_clock_bindings_approved'])assert.equal(r[key],false,key);
const owner=path.join(root,'.tmp-d-index-cache-73d13ff796d44907bc4079ef728c983e');assert.equal(r.owner,owner);assert.equal(fs.existsSync(owner),false);
assert.equal(r.source_manifest,path.resolve(root,prefix+'.source.json'));assert.equal(pin(r.source_manifest).sha256,r.source_manifest_sha256);
const m=json(r.source_manifest),controllerPrefix='docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2';
const controller=json(controllerPrefix+'.source.json'),priorName='docs/evidence/a-metrics-controller-native-reviewed-20261027-r1.json',prior=json(priorName);
const base=json(controller.base_snapshot.path);assert.deepEqual(pin(controller.base_snapshot.path),controller.base_snapshot);
assert.equal(sourceDigest(base.files),controller.base_source_sha256);
assert.equal(prior.status,'accepted_exact_private_controller_native_seven_stages_only');assert.deepEqual(prior.native_receipt,pin(controllerPrefix+'.json'));
assert.deepEqual(m.files,controller.files);assert.deepEqual(m.changes,controller.changes);
assert.equal(sourceDigest(m.files),m.source_sha256);assert.equal(m.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
for(const p of m.controls)assert.deepEqual(pin(p.path),p);
assert.equal(pin('docs/evidence/d2-metrics-tagged-security-candidate-native-20261027.ps1').sha256,r.runner_sha256);
for(const c of m.changes)assert.deepEqual(pin(c.candidate.path),c.candidate);
assert.equal(r.steps.length,4);const pkg='./internal/systembackupsecurity',qualified='clawreef/internal/systembackupsecurity';
for(const s of r.steps){assert.equal(s.exit_code,0);assert.equal(s.tags,'systembackup_mysql');assert.equal(pin(s.log).sha256,s.sha256);if(s.stderr){assert.equal(pin(s.stderr).sha256,s.stderr_sha256);assert.equal(read(s.stderr).length,0);}}
const historicalName='docs/evidence/a-current-entry-repair-closure-reviewed-20261027-r1.json',historical=json(historicalName);
const contexts=[],dependencies=new Set(['backend/go.mod','backend/go.sum']),pins=new Map(m.files.map(p=>[p.path,p]));
for(const [i,platform]of ['windows','linux'].entries()){
 const step=r.steps[i];assert.equal(step.platform,platform);assert.deepEqual(step.command,['go','list','-deps','-test','-json','-tags','systembackup_mysql',pkg]);
 const log=prefix+'.'+platform+'.systembackup_mysql.go-list.jsonl';assert.ok(read(log).equals(read(step.log)));
 const rows=parseGoList(read(log).toString('utf8')),selected=selectedGoClosure(rows,[qualified]);
 for(const row of rows)if(row.Module?.Path==='clawreef')assert.equal(path.resolve(row.Module.Dir),path.join(owner,'source/backend'));
 const old=historical.variants.find(v=>v.goos===platform&&v.tags==='systembackup_mysql');assert.deepEqual(pin(old.log.path),old.log);
 const oldSelected=selectedGoClosure(parseGoList(read(old.log.path).toString('utf8')),[qualified]);
 assert.deepEqual(selected.files,oldSelected.files);checkSelectedPackageSets(selected.directories,base.files,m.files);
 const oldPins=new Map(historical.source_files.map(p=>[p.path,p]));
 assert.deepEqual(selected.files.filter(p=>JSON.stringify(pins.get(p))!==JSON.stringify(oldPins.get(p))),['backend/internal/systembackupcontroller/controller_state_alerts.go']);
 for(const p of selected.files){assert.ok(pins.has(p));dependencies.add(p);}
 contexts.push({platform,tags:'systembackup_mysql',actual_go_list:pin(log),source_files:selected.files.length,changed_dependency:'backend/internal/systembackupcontroller/controller_state_alerts.go'});
}
assert.equal(r.steps[2].platform,'windows');assert.deepEqual(r.steps[2].command,['go','test','-json','-tags','systembackup_mysql','-run','^TestAAdminReadMySQLSeed$','-count=1','-timeout=2700s',pkg]);
const names=validateGoEvents(read(r.steps[2].log).toString('utf8'),qualified);assert.deepEqual(names,['TestAAdminReadMySQLSeed']);
assert.equal(r.steps[3].platform,'linux');assert.deepEqual(r.steps[3].command,['go','test','-c','-tags','systembackup_mysql','-o',path.join(owner,'binary/security.systembackup_mysql.test'),pkg]);
const inventory=json(prefix+'.inventory.json');assert.deepEqual(inventory,r.native_inventory);assert.equal(inventory.steps,4);assert.deepEqual(inventory.seed_names,names);
assert.deepEqual(inventory.complete_source_file_set,m.complete_source_file_set);assert.equal(inventory.complete_source_file_set.physical_files,1719);
const binary=inventory.binary;assert.equal(binary.executed,false);assert.ok(binary.size>100000);assert.match(binary.sha256,/^[a-f0-9]{64}$/);
const header=Buffer.from(binary.header64_hex,'hex');assert.equal(header.length,64);assert.equal(header.subarray(0,7).toString('hex'),'7f454c46020101');assert.equal(header.readUInt16LE(18),62);assert.equal(header.readUInt16LE(52),64);
const result={kind:'a_metrics_tagged_security_private_native_review.v1',reviewer:'A1',
 status:'accepted_exact_two_impacted_tagged_security_contexts_only',native_receipt:pin(prefix+'.json'),source_manifest:pin(r.source_manifest),controller_native_review:pin(priorName),
 source_sha256:m.source_sha256,files:1718,contexts,dependency_files:[...dependencies].sort().map(p=>pins.get(p)),
 seed_names:names,recorded_Linux_binary:binary,recorded_ELF_header_checked:true,binary_bytes_reinspected_after_cleanup:false,
 exact_candidate_and_complete_source_sets_match_controller_window:true,recorded_source_and_set_pre_post_checks:true,owner_independently_absent:true,
 native_log_hashes_verified:true,Go_repeated_by_A1:false,dependencies_installed:false,actual_SQL:false,actual_PromQL_executed:false,
 collector_or_automatic_clock_proven:false,live_source_promoted:false,current_baseline_accepted:false,production_approved:false,whole_goal_complete:false};
const encoded=JSON.stringify(result,null,2)+'\n';if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(read(output).toString('utf8'),encoded);
console.log('A_METRICS_TAGGED_SECURITY_ACCEPTED contexts=2 stages=4 Admin_seed=1 Linux_tagged_compile=1 cleanup=yes');
