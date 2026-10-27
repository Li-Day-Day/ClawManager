import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const previous=path.join(root,'.tmp-d-index-cache-53f39288bb914e1ca2f2bd9287e7874a');
const owner=path.join(root,'.tmp-d-index-cache-a9b3f627a8134e5798ca12b34880d1af');
assert.equal(fs.realpathSync(previous),previous);
assert.equal(fs.readFileSync(path.join(previous,'owner.txt'),'utf8'),path.basename(previous));
assert.equal(fs.existsSync(owner),false);
fs.mkdirSync(path.join(owner,'cache'),{recursive:true});
fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner),{flag:'wx'});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const capsule={kind:'d_gc_finalizer_predecessor_sources.v1',source_manifest:'docs/evidence/d-local-closeout-53f39288bb914e1ca2f2bd9287e7874a-source.json',files:[]};
for(const name of ['download_retention_gc.go','download_retention_gc_freeze.go','download_retention_gc_freeze_test.go','download_retention_gc_freeze_a_test.go','download_retention_gc_work_test.go']){
  const rel='backend/internal/systembackupevidence/'+name;
  const b=fs.readFileSync(path.join(previous,'source',rel));
  capsule.files.push({path:rel,sha256:hash(b),bytes_base64:b.toString('base64')});
}
fs.writeFileSync(path.join(root,'docs/evidence/d-gc-finalizer-predecessor-source-20261026.json'),JSON.stringify(capsule,null,2)+'\n',{flag:'wx'});
const source=path.join(previous,'cache'),target=path.join(owner,'cache');
const names=[];
for(const dir of fs.readdirSync(source,{withFileTypes:true}))if(dir.isDirectory() && /^[a-f0-9]{2}$/.test(dir.name)){
  const folder=path.join(source,dir.name);assert.equal(fs.lstatSync(folder).isSymbolicLink(),false);
  for(const item of fs.readdirSync(folder,{withFileTypes:true}))if(item.isFile() && /^[a-f0-9]{64}-[ad]$/.test(item.name))names.push(`${dir.name}/${item.name}`);
}
names.sort((a,b)=>Number(a.endsWith('-a'))-Number(b.endsWith('-a')) || a.localeCompare(b));
const report={kind:'d_gc_finalizer_preparation.v1',owner,previous,source,target,source_read_only:true,test_result_reuse:false,dependencies_installed:false,entries:[],kept:0};
for(const name of names){
  const to=path.join(target,name);if(fs.existsSync(to)){report.kept++;continue;}
  const data=fs.readFileSync(path.join(source,name));fs.mkdirSync(path.dirname(to),{recursive:true});
  const temp=path.join(owner,`.cache-${crypto.randomUUID()}`);
  try{fs.writeFileSync(temp,data,{flag:'wx'});try{fs.linkSync(temp,to);report.entries.push({name,size:data.length,sha256:hash(data)});}catch(e){if(e.code!=='EEXIST')throw e;report.kept++;}}finally{fs.unlinkSync(temp);}
}
const output=path.join(root,'docs/evidence/d-gc-finalizer-preparation-20261026.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(owner,'preparation.json'),JSON.stringify({kind:report.kind,owner,report:output}),{flag:'wx'});
console.log(`FINALIZER_PREPARED copied=${report.entries.length} predecessor_source_capsule=yes source_unmodified=yes`);
