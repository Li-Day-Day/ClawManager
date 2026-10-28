import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const helper='docs/evidence/d2-metrics-controller-candidate-review-20261027-r2.mjs';
const driver='docs/evidence/d2-metrics-controller-candidate-native-20261027-r2.ps1';
const output='docs/evidence/a2-metrics-file-set-counterexamples-reviewed-20261027.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=fs.readFileSync(path.join(root,p));return{path:p,size:b.length,sha256:hash(b)};};
const helperBytes=fs.readFileSync(path.join(root,helper)),driverBytes=fs.readFileSync(path.join(root,driver));
const text=helperBytes.toString('utf8');
const start=text.indexOf('function verifyCompleteFileSet(m){'),end=text.indexOf('\nfunction verify(){',start);
assert.ok(start>=0&&end>start);
const functionSource=text.slice(start,end);
assert.match(driverBytes.toString('utf8'),/\[IO.File\]::WriteAllText\(\$metricsLog,''\)/);
assert.ok(driverBytes.toString('utf8').indexOf("[IO.File]::WriteAllText($metricsLog,'')")<driverBytes.toString('utf8').indexOf('& go @GoArguments'));
const token=crypto.randomUUID().replaceAll('-','');
const scratch=path.join(root,'.tmp-a2-source-set-'+token),source=path.join(scratch,'source');
assert.equal(path.dirname(scratch),root);assert.match(path.basename(scratch),/^\.tmp-a2-source-set-[a-f0-9]{32}$/);
fs.mkdirSync(source,{recursive:true});
const manifest={files:[{path:'backend/pkg/main.go'},{path:'contracts/schema.json'},{path:'docs/evidence/frozen-vector.json'},{path:'scripts/build.mjs'}],
  node_extra_inputs:[{path:'docs/plan.md'}]};
const plain=p=>{assert.equal(fs.realpathSync(p),p);assert.equal(fs.lstatSync(p).isSymbolicLink(),false);};
const verify=new Function('fs','path','assert','plain','source','sha',functionSource+'\nreturn verifyCompleteFileSet;')
  (fs,path,assert,plain,source,hash);
const write=(relative,content='fixture')=>{const p=path.join(source,relative);assert.ok(p.startsWith(source+path.sep));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);return p;};
for(const p of [...manifest.files,...manifest.node_extra_inputs])write(p.path);
const observations=[];
let report;
function rejection(name,mutate,restore){
  let changed;
  try{changed=mutate();let error;try{verify(changed??manifest);}catch(e){error=e;}assert.ok(error,name+' was accepted');observations.push({case:name,rejected:true,error:String(error)});}
  finally{restore();assert.equal(verify(manifest).physical_files,5);}
}
try{
  const positive=verify(manifest);assert.equal(positive.physical_files,5);
  for(const [name,file]of [['extra_go','backend/pkg/unregistered.go'],['extra_root','unregistered.go'],
    ['extra_docs','docs/unknown.json'],['extra_testdata','backend/pkg/testdata/unknown.json']]){
    rejection(name,()=>{write(file);},()=>fs.unlinkSync(path.join(source,file)));
  }
  const missing=path.join(source,'backend/pkg/main.go'),held=path.join(scratch,'held-main.go');
  rejection('missing_input',()=>fs.renameSync(missing,held),()=>fs.renameSync(held,missing));
  rejection('duplicate_expected_input',()=>({...manifest,files:[...manifest.files,manifest.files[0]]}),()=>{});
  rejection('escaping_expected_input',()=>({...manifest,node_extra_inputs:[...manifest.node_extra_inputs,{path:'../outside.go'}]}),()=>{});
  assert.equal(observations.length,7);
  assert.equal(hash(fs.readFileSync(path.join(root,helper))),hash(helperBytes));
  assert.equal(hash(fs.readFileSync(path.join(root,driver))),hash(driverBytes));
  report={kind:'a2_metrics_strict_namespace_checker_counterexamples.v1',status:'passed_isolated_source_namespace_counterexamples',
    helper:pin(helper),driver:pin(driver),extracted_function_sha256:hash(Buffer.from(functionSource)),
    actual_original_function_executed:true,scope:'Exact new verifyCompleteFileSet function, injected only with an A2-owned minimal filesystem root and the original standard-library dependencies',
    positive:{physical_files:5,manifest_docs_input_included:true,node_extra_plan_input_included:true},counterexamples:observations,
    restored_positive_after_each_case:true,empty_log_precreation_source_order_verified:true,
    PowerShell_pipeline_or_Go_command_executed:false,symlink_or_junction_rejection_executed:false,
    Root_actual_1719_file_snapshot_or_native_receipt_accepted:false,peer_files_modified:false,
    Go_executed:false,SQL_executed:false,PromQL_executed:false,dependencies_installed:false,whole_baseline_accepted:false};
}finally{
  assert.equal(path.dirname(scratch),root);assert.match(path.basename(scratch),/^\.tmp-a2-source-set-[a-f0-9]{32}$/);
  assert.equal(fs.realpathSync(scratch),scratch);
  function rejectRedirects(p){assert.equal(fs.lstatSync(p).isSymbolicLink(),false);if(fs.lstatSync(p).isDirectory())for(const n of fs.readdirSync(p))rejectRedirects(path.join(p,n));}
  rejectRedirects(scratch);fs.rmSync(scratch,{recursive:true});assert.equal(fs.existsSync(scratch),false);
}
report.scratch_removed_and_independently_absent=true;
fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,positive:5,rejections:7,scratch_removed:true,Root_native_accepted:false,Go_executed:false}));
