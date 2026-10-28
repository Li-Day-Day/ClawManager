import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourceOwner=path.join(root,'.tmp-d-index-cache-becb8b4d45194f83bcd50d6423f8e8b4');
const owner=path.join(root,'.tmp-d-index-cache-c182ef28424d4b999793f44fd8f8f153');
const source=path.join(sourceOwner,'cache'), target=path.join(owner,'cache');
assert.equal(fs.realpathSync(sourceOwner),sourceOwner);
assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8'),path.basename(sourceOwner));
assert.equal(fs.realpathSync(source),source);
assert.equal(fs.existsSync(owner),false);
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});
const report={kind:'d_local_closeout_prepared_cache.v1',owner,sourceOwner,source,target,peer_source_read_only:true,existing_entries_overwritten:false,test_result_reuse:false,dependencies_installed:false,entries:[],skipped_existing:0,source_disappeared:0};
const names=[];
for(const dir of fs.readdirSync(source,{withFileTypes:true}))if(dir.isDirectory() && /^[a-f0-9]{2}$/.test(dir.name)) {
  const folder=path.join(source,dir.name);assert.equal(fs.lstatSync(folder).isSymbolicLink(),false);
  for(const file of fs.readdirSync(folder,{withFileTypes:true}))if(file.isFile() && /^[a-f0-9]{64}-[ad]$/.test(file.name))names.push(`${dir.name}/${file.name}`);
}
names.sort((a,b)=>Number(a.endsWith('-a'))-Number(b.endsWith('-a')) || a.localeCompare(b));
for(const name of names) {
  const to=path.join(target,name);let data;
  try{data=fs.readFileSync(path.join(source,name));}catch(e){if(e.code==='ENOENT'){report.source_disappeared++;continue;}throw e;}
  fs.mkdirSync(path.dirname(to),{recursive:true});
  const temp=path.join(owner,`.cache-${crypto.randomUUID()}`);
  try {fs.writeFileSync(temp,data,{flag:'wx'});try{fs.linkSync(temp,to);report.entries.push({name,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}catch(e){if(e.code!=='EEXIST')throw e;report.skipped_existing++;}}finally{fs.unlinkSync(temp);}
}
const output=path.join(root,'docs/evidence/d-local-closeout-cache-handoff-20261023.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(owner,'prepared-cache.json'),JSON.stringify({kind:report.kind,owner,report:output},null,2),{flag:'wx'});
console.log(`LOCAL_PREPARED_CACHE copied=${report.entries.length} source_read_only=yes target_owned=yes tests_not_started=yes`);
