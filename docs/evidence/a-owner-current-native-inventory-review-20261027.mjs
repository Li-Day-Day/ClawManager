import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {requireCompleteCurrentOrdinary} from './a-current-entry-repair-native-review-20261027.mjs';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const receipt='docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b.json';
const r=json(receipt);requireCompleteCurrentOrdinary(r);assert.equal(fs.existsSync(r.owner),false);
assert.equal(pin(r.source_manifest).sha256,r.source_manifest_sha256);
const m=json(r.source_manifest);assert.equal(sourceDigest(m.files),'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
const full=r.steps[4];assert.equal(pin(full.log).sha256,full.sha256);assert.equal(full.exit_code,0);
const packageNames=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
const parse=p=>read(p).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>({line,event:JSON.parse(line)}));
const originalName='docs/evidence/a-owner-final-native-20261026.jsonl',original=parse(originalName),current=parse(full.log);
const packages=[];let preserved=0;
for(const pkg of packageNames){
 const rows=current.filter(x=>x.event.Package===pkg),old=original.filter(x=>x.event.Package===pkg);
 const tests=validateGoEvents(rows.map(x=>x.line).join('\n'),pkg),prior=validateGoEvents(old.map(x=>x.line).join('\n'),pkg);
 const names=new Set(tests);for(const name of prior)assert.ok(names.has(name),'historical owner test omitted '+pkg+'/'+name);
 preserved+=prior.length;packages.push({package:pkg,roots:tests.filter(n=>!n.includes('/')).length,pass_events:tests.length,previous_names_preserved:prior.length});
}
assert.equal(preserved,5190);assert.deepEqual(packages.map(p=>[p.roots,p.pass_events]),[[304,2302],[399,3228]]);
// Original event lines, grouped only by the receiver's historical two-package
// order. No event is invented, renamed or converted from a summary.
const events=packageNames.flatMap(pkg=>current.filter(x=>x.event.Package===pkg).map(x=>x.line)).join('\n')+'\n';
const eventName='docs/evidence/a-owner-current-native-20261027.jsonl';
const eventPin={path:eventName,size:Buffer.byteLength(events),sha256:sha(Buffer.from(events))};
const result={kind:'a_owner_current_native_inventory_review.v1',reviewer:'A1',
 status:'accepted_exact_4003_native_two_package_inventory_only',
 original_full_native_receipt:pin(receipt),original_full_native_log:pin(full.log),
 tested_source:pin(r.source_manifest),tested_source_sha256:m.source_sha256,
 historical_owner_events:pin(originalName),events:eventPin,
 events_origin:'original_native_JSON_lines_selected_from_complete_six_package_run_no_test_rerun',
 packages,roots:703,pass_events:5530,historical_5190_names_preserved:5190,
 frozen_source_postcheck_recorded:true,owner_independently_absent:true,
 metrics_candidate_ordinary_dependency_reuse_not_claimed_by_this_artifact:true,
 current_baseline_registered:false,current_preflight_ready:false,actual_SQL:false,
 Go_repeated_by_A1:false,dependencies_installed:false,production_approved:false,whole_goal_complete:false};
const output='docs/evidence/a-owner-current-native-inventory-reviewed-20261027-r1.json';
const encoded=JSON.stringify(result,null,2)+'\n';
if(mode==='--write'){
 for(const name of [eventName,output])assert.equal(fs.existsSync(path.resolve(root,name)),false);
 fs.writeFileSync(path.resolve(root,eventName),events,{flag:'wx'});fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});
}else{assert.equal(read(eventName).toString('utf8'),events);assert.equal(read(output).toString('utf8'),encoded);}
console.log('A_CURRENT_OWNER_NATIVE_INVENTORY_REVIEWED roots=703 events=5530 original5190=preserved source=4003f0f0 baseline=unregistered');
