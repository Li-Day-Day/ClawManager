import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure} from './a-native-selected-go-closure-20261027.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const owner=path.join(root,'.tmp-d-index-cache-6eb295fa53fa4b299fc506a66bc76960');
const source=path.join(owner,'source');
const prefix=path.join(root,'docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2');
const manifestPath=prefix+'.source.json';
const basePath=path.join(root,'docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-base-source-20261027-r2.json');
const raw=p=>fs.readFileSync(path.isAbsolute(p)?p:path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Same ordinal path/NUL/hash/NUL/size digest as the target manifest, without
// depending on its mutable approval-registry implementation.
const sourceDigest=pins=>sha(Buffer.from(pins.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'));
const pin=p=>{const b=raw(p);return{path:path.relative(root,p).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const plain=p=>{assert.equal(fs.realpathSync(p),p);assert.equal(fs.lstatSync(p).isSymbolicLink(),false);};
const mappings=[
 ['d2-controller-state-alerts-candidate-20261027-r2.go.txt','backend/internal/systembackupcontroller/controller_state_alerts.go'],
 ['d2-controller-state-alerts-test-candidate-20261027-r2.go.txt','backend/internal/systembackupcontroller/controller_state_alerts_test.go'],
 ['d2-metrics-controller-registry-generator-candidate-20261027-r3.mjs.txt','scripts/system-backup-metrics-registry.mjs'],
 ['d2-metrics-controller-registry-candidate-20261027-r3.json','contracts/system-backup/v12/metrics-alert-registry.json'],
 ['d2-metrics-controller-rules-candidate-20261027-r3.yaml','contracts/system-backup/v12/prometheus-alert-rules.yaml'],
 ['d2-metrics-prometheus-tests-candidate-20261027-r3.mjs.txt','scripts/system-backup-prometheus-rules.test.mjs'],
 ['d2-metrics-contract-tests-candidate-20261027-r3.mjs.txt','scripts/system-backup-contract-artifacts.test.mjs'],
 ['d2-metrics-contract-readme-candidate-20261027-r3.md.txt','contracts/system-backup/v12/README.md'],
].map(([from,to])=>[path.join(root,'docs/evidence',from),to]);
function controls(){
 const selected=new Set();
 function visit(file){
  file=path.resolve(file);if(selected.has(file))return;assert.ok(file.startsWith(root+path.sep));plain(file);selected.add(file);
  if(!file.endsWith('.mjs'))return;
  for(const match of raw(file).toString('utf8').matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+\.mjs)['"]/g))visit(path.resolve(path.dirname(file),match[1]));
 }
 visit(path.join(root,'docs/evidence/d2-metrics-controller-candidate-review-20261027-r2.mjs'));
 visit(path.join(root,'docs/evidence/d2-metrics-controller-candidate-native-20261027-r2.ps1'));
 return [...selected].sort().map(pin);
}
function verifyCompleteFileSet(m){
 const expected=[...m.files,...m.node_extra_inputs];assert.equal(new Set(expected.map(p=>p.path)).size,expected.length);
 const actual=[];
 function walk(dir){plain(dir);for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);
  if(entry.isDirectory())walk(file);else{assert.ok(entry.isFile(),'Non-file source input');actual.push(path.relative(source,file).replaceAll('\\','/'));}
 }}
 walk(source);actual.sort();assert.deepEqual(actual,expected.map(p=>p.path).sort(),'Extra, missing, duplicate or escaping source input');
 return {selected_files:m.files.length,node_extra_inputs:m.node_extra_inputs.length,physical_files:actual.length,paths_sha256:sha(Buffer.from(actual.join('\n')+'\n'))};
}
function verify(){
 plain(owner);plain(source);assert.equal(raw(path.join(owner,'owner.txt')).toString(),path.basename(owner));
 const m=json(manifestPath);assert.equal(m.kind,'d2_metrics_controller_private_candidate_snapshot.v1');
 verifyCompleteFileSet(m);
 for(const p of m.files){const file=path.join(source,p.path);plain(file);const b=raw(file);assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256,p.path);}
 assert.equal(sourceDigest(m.files),m.source_sha256);
 for(const p of m.node_extra_inputs){const b=raw(path.join(source,p.path));assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);}
 for(const p of m.controls)assert.deepEqual(pin(path.join(root,p.path)),p);
 for(const p of m.changes)assert.deepEqual(pin(path.join(root,p.candidate.path)),p.candidate);
 return m;
}
const [mode,...args]=process.argv.slice(2);assert.equal(args.length,0);
if(mode==='--capture'){
 assert.equal(fs.existsSync(manifestPath),false);plain(owner);plain(source);
 assert.equal(raw(path.join(owner,'owner.txt')).toString(),path.basename(owner));
 const base=json(basePath);assert.equal(base.kind,'d_local_closeout_snapshot.v1');assert.equal(base.stable_copy_verified,true);
 assert.equal(base.files.length,1718);assert.equal(new Set(base.files.map(p=>p.path)).size,1718);assert.equal(sourceDigest(base.files),base.source_sha256);assert.equal(base.source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
 const byPath=new Map(base.files.map(p=>[p.path,p]));const changes=mappings.map(([from,to])=>{
  const before=byPath.get(to);assert.ok(before);assert.deepEqual(raw(path.join(source,to)),raw(from));
  assert.equal(raw(path.join(root,to)).length,before.size);assert.equal(sha(raw(path.join(root,to))),before.sha256,'Live base changed '+to);
  const b=raw(from);return{path:to,before,after:{path:to,size:b.length,sha256:sha(b)},candidate:pin(from)};
 });
 const changed=new Map(changes.map(p=>[p.path,p.after]));
 const files=base.files.map(p=>{const expected=changed.get(p.path)??p;const b=raw(path.join(source,p.path));assert.equal(b.length,expected.size);assert.equal(sha(b),expected.sha256,p.path);return expected;}).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const extra='docs/system-backup-restore-division-plan.md';assert.deepEqual(raw(path.join(source,extra)),raw(path.join(root,extra)));
 const m={kind:'d2_metrics_controller_private_candidate_snapshot.v1',source_root:source,base_snapshot:pin(basePath),base_source_sha256:base.source_sha256,
  source_sha256:sourceDigest(files),files,changes,node_extra_inputs:[{path:extra,size:raw(path.join(source,extra)).length,sha256:sha(raw(path.join(source,extra)))}],
  controls:controls(),profile:'private_candidate_only_not_live_or_production',live_sources_modified:false,collector_and_automatic_clock_bindings_approved:false};
 m.complete_source_file_set=verifyCompleteFileSet(m);
 fs.writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({manifest:pin(manifestPath),files:files.length,changes:changes.length,source_sha256:m.source_sha256}));
}else if(mode==='--check'){
 const m=verify();console.log(JSON.stringify({source_unchanged:true,source_paths_unchanged:true,physical_files:verifyCompleteFileSet(m).physical_files,files:m.files.length,source_sha256:m.source_sha256}));
}else if(mode==='--scope'){
 const m=verify(),pins=new Map(m.files.map(p=>[p.path,p])),variants=[];
 for(const platform of ['windows','linux'])for(const tags of ['ordinary','systembackup_mysql']){
  const log=prefix+'.'+platform+'.'+tags+'.go-list.jsonl';const rows=parseGoList(raw(log).toString('utf8'));
  for(const row of rows){
   assert.equal(row.Error,undefined);assert.ok(!row.Incomplete&&!row.DepsErrors?.length);
   if(row.Module?.Path==='clawreef'){assert.equal(row.Module.Main,true);assert.equal(path.resolve(row.Module.Dir),path.join(source,'backend'));}
  }
  const closure=selectedGoClosure(rows,['clawreef/internal/systembackupcontroller']);
  for(const name of closure.files){assert.ok(pins.has(name),'Selected input outside candidate '+name);assert.equal(sha(raw(path.join(source,name))),pins.get(name).sha256);}
  variants.push({platform,tags,log:pin(log),packages:rows.length,source_files:closure.files.map(name=>pins.get(name)),directories:closure.directories});
 }
 const result={kind:'d2_metrics_controller_actual_go_scope.v1',source_manifest:pin(manifestPath),root:'clawreef/internal/systembackupcontroller',variants,source_scope_acceptance_claimed:false};
 fs.writeFileSync(prefix+'.go-scope.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({variants:4,selected_root:result.root,source_bound:true}));
}else if(mode==='--inventory'){
 const m=verify(),steps=json(path.join(owner,'native-stages.json'));assert.equal(steps.length,7);assert.ok(steps.every(s=>s.exit_code===0));
 for(const step of steps){assert.equal(sha(raw(step.log)),step.sha256);if(step.stderr){assert.equal(sha(raw(step.stderr)),step.stderr_sha256);assert.equal(raw(step.stderr).length,0);}}
 let listIndex=0;
 for(const platform of ['windows','linux'])for(const tags of ['ordinary','systembackup_mysql']){
  const step=steps[listIndex++],command=['go','list','-deps','-test','-json'];if(tags!=='ordinary')command.push('-tags',tags);command.push('./internal/systembackupcontroller');
  assert.deepEqual(step.command,command);assert.equal(step.platform,platform);assert.equal(step.tags,tags);
 }
 assert.deepEqual(steps[4].command,['go','test','-json','-count=1','-timeout=2700s','./internal/systembackupcontroller']);
 assert.equal(steps[4].platform,'windows');
 const names=validateGoEvents(raw(steps[4].log).toString('utf8'),'clawreef/internal/systembackupcontroller');
 const required=['TestControllerStateAlertsFixedClockAndProfile','TestControllerStateAlertsExactBoundariesAndMissingSeries','TestControllerStateAlertsRejectInvalidInputs','TestControllerCleanupUsesEachImmutableDeadline','TestControllerCleanupRejectsUnknownPartialOrInvalidCollections','TestControllerResidualVolumeUsesEachImmutableDeadline','TestControllerCleanupRejectsUnknownResidualVolumeFacts'];
 for(const name of required)assert.ok(names.includes(name),'Missing previous/new root '+name);
 const binaries=[];
 for(const [i,tags]of [[5,'ordinary'],[6,'systembackup_mysql']]){
  const s=steps[i];assert.equal(s.platform,'linux');const binary=path.join(owner,'binary/controller.'+tags+'.test');
  const command=['go','test','-c'];if(tags!=='ordinary')command.push('-tags',tags);command.push('-o',binary,'./internal/systembackupcontroller');assert.deepEqual(s.command,command);
  const b=raw(binary);assert.ok(b.length>=64);assert.equal(b.subarray(0,7).toString('hex'),'7f454c46020101');assert.ok([2,3].includes(b.readUInt16LE(16)));assert.equal(b.readUInt16LE(18),62);assert.equal(b.readUInt32LE(20),1);assert.equal(b.readUInt16LE(52),64);
  binaries.push({platform:'linux',tags,sha256:sha(b),size:b.length,header64_hex:b.subarray(0,64).toString('hex'),executed:false});
 }
 const result={kind:'d2_metrics_controller_candidate_native_inventory.v1',source_sha256:m.source_sha256,complete_source_file_set:verifyCompleteFileSet(m),steps:7,roots:names.filter(n=>!n.includes('/')).length,pass_events:names.length,required_roots_preserved:required,binaries,actual_SQL:false,production_approved:false};
 fs.writeFileSync(prefix+'.inventory.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}else throw new Error('Expected --capture, --check, --scope, or --inventory');
