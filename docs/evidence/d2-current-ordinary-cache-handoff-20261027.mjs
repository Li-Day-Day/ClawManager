import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// The source owner must first offer its completed Windows-seed/Linux window.
// Read immutable CAS entries only, never its source/tmp or test result evidence.
assert.ok([3,4].includes(process.argv.length),'Usage: cache-handoff EXACT_A2_SUPPLEMENT_OWNER [EXACT_PREPARED_OWNER]');
const root=path.resolve(import.meta.dirname,'../..'),sourceOwner=path.resolve(process.argv[2]);
assert.equal(path.dirname(sourceOwner),root);assert.match(path.basename(sourceOwner),/^\.tmp-a-reference-supplement-[a-f0-9]{32}$/);
const plain=file=>{assert.equal(fs.realpathSync(file),file);assert.equal(fs.lstatSync(file).isSymbolicLink(),false);};
const missedCodes=new Set(['ENOENT','EACCES','EPERM','EBUSY']);
try{plain(sourceOwner);assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8'),path.basename(sourceOwner));plain(path.join(sourceOwner,'cache'));}
catch(e){if(missedCodes.has(e.code)){console.log(JSON.stringify({sourceOwner,status:'source_unavailable_no_owner_created',entries:0,Go_started:false}));process.exit(0);}throw e;}
const free=()=>{const s=fs.statfsSync(root,{bigint:true});return s.bavail*s.bsize;};
const floor=8n*1024n*1024n*1024n;
if(free()<=floor){console.log(JSON.stringify({status:'space_floor_no_owner_created',entries:0,Go_started:false}));process.exit(0);}
const update=!!process.argv[3],id=crypto.randomUUID().replaceAll('-','');
const owner=update?path.resolve(process.argv[3]):path.join(root,'.tmp-d-index-cache-'+id),cache=path.join(owner,'cache');
let preparation;
if(update){
  assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);plain(owner);plain(cache);
  assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
  preparation=JSON.parse(fs.readFileSync(path.join(owner,'preparation.json'),'utf8'));
  assert.equal(preparation.kind,'d2_current_ordinary_compilation_cache_handoff.v1');assert.equal(preparation.owner,owner);assert.equal(preparation.tests_started,false);assert.equal(fs.existsSync(path.join(owner,'source')),false);
}else{fs.mkdirSync(owner);fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});fs.mkdirSync(cache);}
const report={kind:'d2_current_ordinary_compilation_cache_handoff.v1',sourceOwner,owner,update,source_read_only:true,existing_entries_overwritten:false,existing_entries_skipped:0,entries:[],source_misses:0,space_limited:false,error:null,Go_started:false,tests_started:false,test_result_reuse:false,dependencies_installed:false,owner_removed:false};
try{
  const names=[];
  for(const dir of fs.readdirSync(path.join(sourceOwner,'cache'),{withFileTypes:true})){
    if(!dir.isDirectory()||!/^[a-f0-9]{2}$/.test(dir.name))continue;
    const directory=path.join(sourceOwner,'cache',dir.name);plain(directory);
    try{for(const file of fs.readdirSync(directory,{withFileTypes:true}))if(file.isFile()&&/^[a-f0-9]{64}-[ad]$/.test(file.name))names.push(dir.name+'/'+file.name);}
    catch(e){if(missedCodes.has(e.code)){report.source_misses++;continue;}throw e;}
  }
  for(const name of names.sort()){
    const target=path.join(cache,name);
    if(fs.existsSync(target)){plain(target);report.existing_entries_skipped++;continue;}
    let bytes;const source=path.join(sourceOwner,'cache',name);
    try{plain(source);bytes=fs.readFileSync(source);}catch(e){if(missedCodes.has(e.code)){report.source_misses++;continue;}throw e;}
    if(free()-BigInt(bytes.length)<floor){report.space_limited=true;break;}
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),sha256);
    report.entries.push({name,size:bytes.length,sha256});
  }
}catch(e){if(missedCodes.has(e.code))report.source_misses++;else{report.error=e.message;process.exitCode=1;}}
const output=path.join(root,'docs/evidence/d2-current-ordinary-cache-handoff-'+id+'.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const reportSHA=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
if(update){preparation.updates??=[];preparation.updates.push({report:output,report_sha256:reportSHA});}
else preparation={kind:report.kind,owner,report:output,report_sha256:reportSHA,updates:[],cache_only:true,tests_started:false,test_result_reuse:false};
fs.writeFileSync(path.join(owner,'preparation.json'),JSON.stringify(preparation,null,2)+'\n',{flag:update?'w':'wx'});
console.log(JSON.stringify({owner,report:output,entries:report.entries.length,bytes:report.entries.reduce((a,e)=>a+e.size,0),space_limited:report.space_limited,source_misses:report.source_misses,error:report.error,Go_started:false}));
