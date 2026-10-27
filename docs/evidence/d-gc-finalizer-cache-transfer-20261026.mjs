import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourceOwner=path.join(root,'.tmp-d-index-cache-a9b3f627a8134e5798ca12b34880d1af');
assert.equal(fs.realpathSync(sourceOwner),sourceOwner);
assert.equal(fs.readFileSync(path.join(sourceOwner,'owner.txt'),'utf8'),path.basename(sourceOwner));
const owner=path.join(root,'.tmp-d-index-cache-'+crypto.randomUUID().replaceAll('-',''));
const source=path.join(sourceOwner,'cache'),target=path.join(owner,'cache');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});
const report={kind:'d_gc_finalizer_preparation.v1',owner,sourceOwner,source,target,peer_source_read_only:true,test_result_reuse:false,dependencies_installed:false,entries:[],source_disappeared:0};
const names=[];
for(const d of fs.readdirSync(source,{withFileTypes:true}))if(d.isDirectory() && /^[a-f0-9]{2}$/.test(d.name)){
 assert.equal(fs.lstatSync(path.join(source,d.name)).isSymbolicLink(),false);
 for(const f of fs.readdirSync(path.join(source,d.name),{withFileTypes:true}))if(f.isFile() && /^[a-f0-9]{64}-[ad]$/.test(f.name))names.push(`${d.name}/${f.name}`);
}
names.sort((a,b)=>Number(a.endsWith('-a'))-Number(b.endsWith('-a')) || a.localeCompare(b));
for(const name of names){
 let b;try{b=fs.readFileSync(path.join(source,name));}catch(e){if(e.code==='ENOENT'){report.source_disappeared++;continue;}throw e;}
 const to=path.join(target,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,b,{flag:'wx'});
 report.entries.push({name,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});
}
const output=path.join(root,'docs/evidence/d-gc-finalizer-cache-transfer-20261026.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(owner,'preparation.json'),JSON.stringify({kind:report.kind,owner,report:output})+'\n',{flag:'wx'});
console.log(JSON.stringify({owner,entries:report.entries.length,source_read_only:true,test_result_reuse:false}));
