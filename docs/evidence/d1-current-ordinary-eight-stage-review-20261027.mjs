import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {describeOrdinaryScope} from './d2-current-ordinary-go-scope-20261027.mjs';
import {remainingOrdinaryPackages,validateOrdinaryInventory,validateBootstrapRepairSeeds} from './d2-current-ordinary-inventory-20261027.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const local=p=>{const v=path.resolve(root,p);assert.ok(v.startsWith(root+path.sep));return v;};
const raw=p=>fs.readFileSync(local(p));
const text=b=>b.toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rel=p=>path.relative(root,local(p)).replaceAll('\\','/');
assert.ok(process.argv.slice(2).every(x=>x==='--check')&&process.argv.slice(2).length<=1);
const prefix='docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b';
const native=prefix+'.json',r=json(native);
assert.equal(r.kind,'d2_current_ordinary_complete_native.v1');assert.equal(r.status,'passed_selected_complete_ordinary_packages');assert.equal(r.error,null);
for(const k of ['Go_started','tests_started','source_precheck','go_list_source_postcheck','windows_source_postcheck','bootstrap_seed_source_postcheck','frozen_source_unchanged','owner_removed'])assert.equal(r[k],true,k);
for(const k of ['dependencies_installed','remote_contacted','actual_mysql','production_approved','source_scope_accepted'])assert.equal(r[k],false,k);
assert.equal(path.dirname(r.owner),root);assert.equal(path.basename(r.owner),'.tmp-d-index-cache-01cb9a3a3e1d48d7b56da8ffa138bc9b');assert.equal(fs.existsSync(r.owner),false);
assert.deepEqual(r.packages,remainingOrdinaryPackages);assert.equal(r.steps.length,8);
assert.equal(sha(raw(r.source_manifest)),r.source_manifest_sha256);const manifest=json(r.source_manifest);
assert.equal(manifest.kind,'d_local_closeout_snapshot.v1');assert.equal(manifest.files.length,1718);assert.equal(sourceDigest(manifest.files),'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');assert.equal(manifest.source_sha256,sourceDigest(manifest.files));
assert.deepEqual(enumerate(root),manifest.files,'current byte set differs from the tested snapshot');
const helperPins=[['docs/evidence/d2-current-ordinary-complete-validation-20261027.ps1','driver_sha256'],['docs/evidence/d-local-closeout-snapshot-20261023.mjs','snapshotter_sha256'],['docs/evidence/d2-current-ordinary-inventory-20261027.mjs','inventory_sha256'],['docs/evidence/d2-current-ordinary-go-scope-20261027.mjs','scope_reader_sha256'],['docs/evidence/a2-reference-capability-go-scope-20261026.mjs','go_list_parser_sha256'],['docs/evidence/d-resources-mysql-actual-review-20261023.mjs','native_event_reader_sha256'],['docs/evidence/a2-reference-capability-supplement-review-20261027-r2.mjs','parity_composition_validator_sha256']];
for(const [p,k]of helperPins)assert.equal(sha(raw(p)),r[k],k);
const packages=r.packages.map(p=>'./'+p),scope=json(r.actual_go_scope);assert.equal(sha(raw(r.actual_go_scope)),r.actual_go_scope_sha256);assert.equal(scope.captures.length,4);assert.deepEqual(scope.requested_packages,r.packages);
const source=path.join(r.owner,'source');
function recordedInput(p){const name=path.relative(source,p).replaceAll('\\','/');assert.ok(name.startsWith('backend/')&&!name.split('/').includes('..'));return raw(name);}
for(let i=0;i<4;i++){
 const os=i<2?'windows':'linux',tags=i%2?'systembackup_mysql':'ordinary',s=r.steps[i],capture=scope.captures[i];
 assert.equal(s.platform,os);assert.equal(s.tags,tags);assert.deepEqual(s.command,['go','list','-deps','-test','-json',...(tags==='ordinary'?[]:['-tags','systembackup_mysql']),...packages]);
 const b=raw(s.log);assert.equal(sha(b),s.sha256);assert.equal(sha(raw(s.stderr)),s.stderr_sha256);assert.equal(text(raw(s.stderr)).trim(),'');assert.equal(s.exit_code,0);
 assert.equal(capture.goos_label,os);assert.equal(capture.tags_label,tags);assert.equal(sha(b),capture.input.sha256);assert.equal(b.length,capture.input.size);
 const selected=describeOrdinaryScope(parseGoList(text(b)),r.packages,source,manifest.files,recordedInput);for(const [k,v]of Object.entries(selected))assert.deepEqual(capture[k],v,k);
}
const parent='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.full.jsonl';
assert.deepEqual(r.steps[4].command,['go','test','-json','-count=1','-timeout=2700s',...packages]);assert.equal(r.steps[4].platform,'windows');
const inventory=validateOrdinaryInventory(text(raw(r.steps[4].log)),r.packages,text(raw(parent)));assert.deepEqual(r.native_inventory,inventory);
const roots=inventory.packages.reduce((n,p)=>n+p.roots,0),passes=inventory.packages.reduce((n,p)=>n+p.pass_events,0);assert.equal(roots,974);assert.equal(passes,8256);
assert.deepEqual(r.steps[5].command,['go','test','-json','-tags','systembackup_mysql','-run','^TestDBootstrap(Consumer|ConsumerRanges|Entry)MySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupevidence']);assert.equal(r.steps[5].platform,'windows');
assert.deepEqual(validateBootstrapRepairSeeds(text(raw(r.steps[5].log))),r.bootstrap_seed_inventory);
for(const s of r.steps){assert.equal(s.exit_code,0);assert.equal(sha(raw(s.log)),s.sha256);}
assert.equal(r.linux_binaries.length,2);
for(let i=0;i<2;i++){
 const program=i?'system-backup-bootstrap':'server',pkg=i?'./cmd/system-backup-bootstrap':'./cmd/server',s=r.steps[6+i],b=r.linux_binaries[i];
 assert.equal(s.platform,'linux');assert.deepEqual(s.command,['go','build','-buildvcs=false','-o',path.join(r.owner,'binary',program),pkg]);
 assert.equal(b.program,program);assert.equal(b.format,'ELF');assert.equal(b.executed,false);assert.equal(b.removed,true);assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.ok(b.size>100000);assert.equal(fs.existsSync(path.join(r.owner,'binary',program)),false);
}
for(const checkpoint of [prefix+'.windows-postcheck.json',prefix+'.bootstrap-seeds-postcheck.json']){const c=json(checkpoint);assert.equal(c.source_postcheck,true);assert.equal(c.source_manifest_sha256,r.source_manifest_sha256);}
for(const p of r.prerequisites)assert.equal(sha(raw(p.path)),p.sha256);
const files=[native,r.source_manifest,r.actual_go_scope,parent,...r.steps.flatMap(s=>[s.log,...s.stderr?[s.stderr]:[]]),prefix+'.windows-postcheck.json',prefix+'.bootstrap-seeds-postcheck.json',...r.prerequisites.map(p=>p.path),...helperPins.map(p=>p[0]),'docs/evidence/a-owner-pre-thin-target-20261026.mjs','docs/evidence/d1-current-ordinary-eight-stage-review-20261027.mjs'];
const result={kind:'d1_current_ordinary_eight_stage_independent_review.v1',status:'accepted_exact_six_complete_packages_and_bootstrap_preparation_only',native_receipt:native,source_files:1718,source_sha256:manifest.source_sha256,current_source_bytes_and_set_match:true,actual_platform_tag_go_list_captures:4,actual_selected_source_metadata_rederived:true,complete_packages:inventory.packages,root_tests:roots,pass_events:passes,bootstrap_seed_roots:r.bootstrap_seed_inventory.names,linux_programs:r.linux_binaries,all_eight_stage_exits_zero:true,source_postchecks:{go_list:true,complete_windows:true,bootstrap_seed:true,final_frozen:true},owner_independently_absent:true,all_run_build_products_removed:true,failed_parent_reclassified:false,parent_scope_accepted:false,Root_fifteen_stage_complete:false,whole_current_baseline_accepted:false,formal_GC_operator_source_accepted:false,actual_mysql:false,production_approved:false,dependencies_installed:false,tests_repeated_by_D1:false,whole_goal_complete:false,artifacts:[...new Set(files.map(rel))].map(p=>({path:p,sha256:sha(raw(p))}))};
const output=path.join(root,'docs/evidence/d1-current-ordinary-eight-stage-reviewed-20261027-01cb.json');
if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),result);else fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('CURRENT_ORDINARY_EIGHT_STAGE_REVIEWED source=4003f0f0 inputs=1718 packages=6 roots=974 pass=8256 seeds=3 linux=2 cleanup=yes whole_baseline=no');
