import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Read-only supplement to the already-running candidate. Never rewrites its
// captured helper, manifest, sources, logs, cache, or terminal receipt.
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'.tmp-d-index-cache-e08fbb1a239c4e48a05f97e7c2614616/source');
const prefix=path.join(root,'docs/evidence/d2-metrics-controller-candidate-e08f-20261027');
const output=prefix+'.file-set-supplement.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=fs.readFileSync(p);return{path:path.relative(root,p).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const digest=p=>sha(Buffer.from(p.map(r=>r.path+'\0'+r.sha256+'\0'+r.size).join('\n')+'\n'));
assert.equal(fs.existsSync(output),false);
const manifest=json(prefix+'.source.json');
const basePath=path.join(root,manifest.base_snapshot.path),base=json(basePath);
assert.equal(new Set(base.files.map(p=>p.path)).size,1718);
assert.equal(digest(base.files),base.source_sha256);
assert.equal(base.source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
const report={kind:'d2_metrics_controller_exact_file_set_supplement.v1',status:'observing_running_native',
  original_check_limitation:'Captured native helper verifies recorded pins but does not enumerate unexpected files. This separate observer provides actual complete set observations.',
  source_manifest:pin(prefix+'.source.json'),base_manifest:pin(basePath),base_digest_independently_recomputed:true,
  observer:pin(path.join(root,'docs/evidence/d2-metrics-controller-file-set-observer-20261027.mjs')),
  source_read_only:true,Go_started:false,source_mutated:false,observations:[],error:null};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
function observe(phase){
 const expected=[...manifest.files,...manifest.node_extra_inputs];assert.equal(new Set(expected.map(p=>p.path)).size,expected.length);
 const found=[];
 function walk(dir){
  assert.equal(fs.realpathSync(dir),dir);assert.equal(fs.lstatSync(dir).isSymbolicLink(),false);
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,e.name);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);
   if(e.isDirectory())walk(file);else{assert.ok(e.isFile());found.push(path.relative(source,file).replaceAll('\\','/'));}
  }
 }
 walk(source);found.sort();assert.deepEqual(found,expected.map(p=>p.path).sort(),'Unexpected, missing or escaping candidate input');
 for(const p of expected){const b=fs.readFileSync(path.join(source,p.path));assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256,p.path);}
 assert.equal(digest(manifest.files),manifest.source_sha256);
 return{phase,observed_at:new Date().toISOString(),selected_files:manifest.files.length,node_extra_inputs:manifest.node_extra_inputs.length,
  actual_physical_files:found.length,complete_file_set_verified:true,all_input_bytes_match:true,paths_sha256:sha(Buffer.from(found.join('\n')+'\n')),source_sha256:manifest.source_sha256};
}
try{
 report.observations.push(observe('after_full_Windows_test_while_Linux_compile_running'));save();
 console.log(JSON.stringify({status:'first_complete_set_observed',files:report.observations[0].actual_physical_files}));
 const deadline=Date.now()+60*60*1000;
 while(!fs.existsSync(prefix+'.inventory.json')){
  if(!fs.existsSync(source)||fs.existsSync(prefix+'.json'))throw new Error('Native source removed before final complete-set observation');
  if(Date.now()>deadline)throw new Error('Native inventory wait expired');
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 const inventory=json(prefix+'.inventory.json');assert.equal(inventory.steps,7);
 report.observations.push(observe('after_all_seven_native_stages_before_owned_cleanup'));
 report.native_inventory=pin(prefix+'.inventory.json');report.status='complete_sets_observed_waiting_for_terminal';save();
 while(!fs.existsSync(prefix+'.json')){if(Date.now()>deadline)throw new Error('Terminal wait expired');await new Promise(resolve=>setTimeout(resolve,250));}
 const native=json(prefix+'.json');assert.equal(native.status,'passed_private_controller_candidate');assert.equal(native.error,null);assert.equal(native.owner_removed,true);
 report.native_receipt=pin(prefix+'.json');report.status='passed_actual_complete_set_supplement';
}catch(e){report.status='failed_or_observation_incomplete';report.error=e.message;process.exitCode=1;}
finally{save();}
console.log(JSON.stringify({status:report.status,observations:report.observations.length,error:report.error,Go_started:false}));
