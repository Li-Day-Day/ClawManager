// Read-only seed from an explicit existing workspace build cache. Test results
// are never reused: the caller still runs go test -count=1 and owns cleanup.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]);
assert.ok(fileURLToPath(import.meta.url).startsWith(root+path.sep));
const [sourceArg,targetArg,reportArg]=process.argv.slice(3);
const sourceOwner=path.resolve(sourceArg),targetOwner=path.resolve(targetArg),out=path.resolve(reportArg);
for(const owner of [sourceOwner,targetOwner])assert.equal(path.dirname(owner),root);
assert.equal(fs.realpathSync(targetOwner),targetOwner);assert.equal(fs.lstatSync(targetOwner).isSymbolicLink(),false);
assert.match(path.basename(sourceOwner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.match(path.basename(targetOwner),/^\.tmp-a-evidence-[a-f0-9]{32}$/);
assert.equal(fs.readFileSync(path.join(targetOwner,'.nonce-ca-owner'),'utf8'),path.basename(targetOwner));
assert.notEqual(sourceOwner,targetOwner);assert.equal(path.dirname(out),path.join(root,'docs/evidence'));
const source=path.join(sourceOwner,'cache'),target=path.join(targetOwner,'cache');
assert.equal(fs.realpathSync(target),target);assert.equal(fs.lstatSync(target).isSymbolicLink(),false);
const report={kind:'a_compilation_cache_seed.v1',source,target,source_read_only:true,source_available:true,existing_entries_overwritten:false,dependencies_installed:false,test_result_reuse:false,target_compiler_not_started:true,entries:[],skipped_existing:0,skipped_disappeared:0,skipped_locked:0};
function copyAvailableSource(){
let directories;
try{
 assert.equal(fs.realpathSync(sourceOwner),sourceOwner);assert.equal(fs.lstatSync(sourceOwner).isSymbolicLink(),false);
 assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8'),path.basename(sourceOwner));
 assert.equal(fs.realpathSync(source),source);assert.equal(fs.lstatSync(source).isSymbolicLink(),false);
 directories=fs.readdirSync(source,{withFileTypes:true});
}catch(e){if(['ENOENT','EPERM','EACCES','EBUSY'].includes(e.code)){report.source_available=false;report.unavailable_reason=e.code;return;}throw e;}
const names=[];
for(const dir of directories){
 if(!dir.isDirectory()||!/^[a-f0-9]{2}$/.test(dir.name))continue;
 let items;try{assert.equal(fs.lstatSync(path.join(source,dir.name)).isSymbolicLink(),false);items=fs.readdirSync(path.join(source,dir.name),{withFileTypes:true});}catch(e){if(e.code==='ENOENT'){report.skipped_disappeared++;continue;}if(['EPERM','EACCES','EBUSY'].includes(e.code)){report.skipped_locked++;continue;}throw e;}
 for(const item of items)if(item.isFile()&&/^[a-f0-9]{64}-[ad]$/.test(item.name))names.push(dir.name+'/'+item.name);
}
names.sort((a,b)=>Number(a.endsWith('-a'))-Number(b.endsWith('-a'))||a.localeCompare(b));
for(const name of names){
 const from=path.join(source,name),to=path.join(target,name);
 if(fs.existsSync(to)){report.skipped_existing++;continue;}
 let raw;try{assert.equal(fs.lstatSync(from).isSymbolicLink(),false);raw=fs.readFileSync(from);}catch(e){if(e.code==='ENOENT'){report.skipped_disappeared++;continue;}if(['EPERM','EACCES','EBUSY'].includes(e.code)){report.skipped_locked++;continue;}throw e;}
 fs.mkdirSync(path.dirname(to),{recursive:true});
 // The runner invokes this BEFORE starting its Go compiler. A partial seed
 // failure aborts and cleans the owner; entries are never consumed mid-copy.
 try{fs.writeFileSync(to,raw,{flag:'wx'});report.entries.push({name,size:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});}catch(e){if(e.code!=='EEXIST')throw e;report.skipped_existing++;}
}
}
copyAvailableSource();
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('NONCE_CACHE_SEED copied='+report.entries.length+' source_read_only=yes overwrite=no result_reuse=no install=no');
