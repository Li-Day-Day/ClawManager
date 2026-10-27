// Partial Windows native intake; explicitly does not approve Linux/runtime/schema integration.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const prefix='docs/evidence/d1-joint-native-7cff48608d7249aead59a1f0e8123e06';
const manifest=json(prefix+'.source.json'),native=json(prefix+'.windows.json');
assert.equal(native.status,'passed_Windows_packages_pending_Linux_and_cmd_compilation');
assert.equal(native.source_postcheck,true);assert.equal(native.source_sha256,manifest.source_sha256);
assert.equal(sourceDigest(manifest.files),manifest.source_sha256);assert.equal(manifest.files.length,1727);
assert.deepEqual(enumerate(manifest.source),manifest.files);
for(const c of manifest.changes)assert.deepEqual(pin(c.candidate.path),c.candidate);
assert.equal(native.steps.length,2);for(const s of native.steps){assert.equal(s.exit_code,0);assert.equal(pin(s.log).sha256,s.sha256);}
const events=read(native.steps[1].log).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
assert.ok(!events.some(e=>['fail','skip','build-fail'].includes(e.Action)));
const packages=[];
for(const [name,roots,count] of [['systembackupcleanup',14,60],['systembackupcontroller',155,284]]){
 const pkg='clawreef/internal/'+name,es=events.filter(e=>e.Package===pkg);
 const ran=es.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test).sort(),passed=es.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test).sort();
 assert.deepEqual(ran,passed);assert.equal(new Set(passed).size,passed.length);assert.equal(passed.length,count);assert.equal(passed.filter(n=>!n.includes('/')).length,roots);
 assert.equal(es.filter(e=>!e.Test&&e.Action==='pass').length,1);packages.push({package:pkg,roots,pass_events:count,names:passed});
}
const cleanupReady='docs/evidence/d2-cleanup-full-candidate-source-ready-20261027.json',cleanup=json(cleanupReady);
for(const m of cleanup.mappings)assert.deepEqual(manifest.files.find(p=>p.path===m.target),{...m.candidate,path:m.target});
for(const name of cleanup.declared_test_roots)assert.ok(packages[0].names.includes(name));
const gateReview='docs/evidence/a-gate-budget-source-reviewed-20261027-r2.json';
for(const name of json(gateReview).tests)assert.ok(packages[1].names.includes(name));
const result={kind:'a_cleanup_gate_Windows_partial_native_review.v1',status:'accepted_exact_Windows_packages_only_Linux_and_runtime_pending',
 source:pin(prefix+'.source.json'),source_sha256:manifest.source_sha256,source_files:1727,
 native:pin(prefix+'.windows.json'),steps:native.steps.map(s=>({command:s.command,exit:s.exit_code,log:pin(s.log)})),packages,
 cleanup_source:pin(cleanupReady),gate_source_review:pin(gateReview),source_postcheck:true,
 original_controller_command_build_pending:true,Linux_compilation_pending:true,
 schema_migration_catalog_grants_integration_pending:true,real_residual_provider_adapter_pending:true,
 source_owner_still_active_for_continuation:true,owner_removed_claimed:false,
 dependencies_installed:false,actual_SQL:false,production_approved:false,whole_goal_complete:false};
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-cleanup-gate-windows-reviewed-20261027.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
console.log(JSON.stringify({status:result.status,roots:[14,155],pass_events:[60,284],Linux:false,SQL:false}));
