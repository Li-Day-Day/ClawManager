import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// One-shot continuation of Root's already-running current ordinary window.
// No Go invocation, peer owner, source mutation, or test-result reuse occurs.
const root=path.resolve(import.meta.dirname,'../..');
const sourceOwner=path.join(root,'.tmp-d-index-cache-01cb9a3a3e1d48d7b56da8ffa138bc9b');
const prefix=path.join(root,'docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b');
const checkpoint=prefix+'.windows-postcheck.json';
const reportPath=path.join(root,'docs/evidence/d2-owner-thin-cache-after-current-20261027.json');
assert.equal(fs.existsSync(reportPath),false,'One-shot cache continuation already exists');
const token=crypto.randomUUID().replaceAll('-','');
const owner=path.join(root,'.tmp-d-index-cache-'+token);
const report={kind:'d2_owner_thin_cache_continuation.v1',status:'waiting_for_actual_windows_checkpoint',node_pid:process.pid,
  sourceOwner,owner,owner_created:false,source_read_only:true,source_mutated:false,Go_started:false,tests_started:false,
  test_result_reuse:false,dependencies_installed:false,entries:[],source_misses:0,space_limited:false,error:null};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const plain=file=>{assert.equal(fs.realpathSync(file),file);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const free=()=>{const s=fs.statfsSync(root,{bigint:true});return s.bavail*s.bsize;};
const floor=8n*1024n*1024n*1024n;
const misses=new Set(['ENOENT','EACCES','EPERM','EBUSY']);
save();console.log(JSON.stringify({status:report.status,node_pid:process.pid,proposed_owner:owner,Go_started:false}));
try{
  const deadline=Date.now()+90*60*1000;
  while(!fs.existsSync(checkpoint)){
    if(!fs.existsSync(sourceOwner)||fs.existsSync(prefix+'.json')){report.status='source_ended_without_copy';save();process.exit(0);}
    if(Date.now()>=deadline){report.status='wait_expired_without_copy';save();process.exit(0);}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  const checkpointBytes=fs.readFileSync(checkpoint),value=json(checkpoint);
  assert.equal(value.kind,'d2_current_ordinary_windows_checkpoint.v1');
  assert.equal(value.source_precheck,true);assert.equal(value.source_postcheck,true);
  assert.equal(value.native_inventory.all_selected_packages_complete,true);assert.equal(value.native_inventory.packages.length,6);
  assert.equal(value.steps.length,5);assert.ok(value.steps.every(s=>s.exit_code===0));
  assert.equal(value.source_manifest,prefix+'.source.json');assert.equal(sha(fs.readFileSync(value.source_manifest)),value.source_manifest_sha256);
  report.checkpoint={path:checkpoint,size:checkpointBytes.length,sha256:sha(checkpointBytes)};
  if(!fs.existsSync(sourceOwner)){report.status='source_cleaned_before_copy';save();process.exit(0);}
  plain(sourceOwner);assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8'),path.basename(sourceOwner));plain(path.join(sourceOwner,'cache'));
  if(free()<=floor){report.status='space_floor_no_copy';save();process.exit(0);}
  fs.mkdirSync(owner);fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});fs.mkdirSync(path.join(owner,'cache'));
  report.owner_created=true;report.status='copying_completed_CAS_only';save();
  const names=[];
  for(const dir of fs.readdirSync(path.join(sourceOwner,'cache'),{withFileTypes:true})){
    if(!dir.isDirectory()||!/^[a-f0-9]{2}$/.test(dir.name))continue;
    const folder=path.join(sourceOwner,'cache',dir.name);plain(folder);
    try{for(const file of fs.readdirSync(folder,{withFileTypes:true}))if(file.isFile()&&/^[a-f0-9]{64}-[ad]$/.test(file.name))names.push(dir.name+'/'+file.name);}
    catch(e){if(misses.has(e.code)){report.source_misses++;continue;}throw e;}
  }
  for(const name of names.sort()){
    let bytes;const from=path.join(sourceOwner,'cache',name);
    try{plain(from);bytes=fs.readFileSync(from);}catch(e){if(misses.has(e.code)){report.source_misses++;continue;}throw e;}
    if(free()-BigInt(bytes.length)<floor){report.space_limited=true;break;}
    const to=path.join(owner,'cache',name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{flag:'wx'});
    const hash=sha(bytes);assert.equal(sha(fs.readFileSync(to)),hash);report.entries.push({name,size:bytes.length,sha256:hash});
  }
  report.status='prepared_compiler_cache_only';
}catch(e){report.error=e.message;report.status=misses.has(e.code)?'source_disappeared_during_copy':'failed';if(report.status==='failed')process.exitCode=1;}
finally{
  report.prepared_bytes=report.entries.reduce((sum,e)=>sum+e.size,0);save();
  if(report.owner_created){
    fs.writeFileSync(path.join(owner,'preparation.json'),JSON.stringify({kind:'d2_owner_thin_compilation_cache_preparation.v1',owner,
      report:reportPath,report_sha256:sha(fs.readFileSync(reportPath)),cache_only:true,tests_started:false,test_result_reuse:false},null,2)+'\n',{flag:'wx'});
  }
}
console.log(JSON.stringify({status:report.status,owner,entries:report.entries.length,bytes:report.prepared_bytes,source_misses:report.source_misses,error:report.error,Go_started:false}));
