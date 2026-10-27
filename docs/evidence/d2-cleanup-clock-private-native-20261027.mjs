import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const [mode,manifestName,ownerName]=process.argv.slice(2);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return {path:p,size:b.length,sha256:sha(b)}};
assert.match(manifestName??'',/^docs\/evidence\/d2-cleanup-clock-native-[a-f0-9]{32}\.source\.json$/);
const manifestPath=path.resolve(root,manifestName);
const self='docs/evidence/d2-cleanup-clock-private-native-20261027.mjs';
const driver='docs/evidence/d2-cleanup-clock-private-native-20261027.ps1';
const mappings=[
 ['docs/evidence/d2-cleanup-clock-candidate-20261027.go.txt','backend/internal/systembackupcleanup/clock.go'],
 ['docs/evidence/d2-cleanup-clock-tests-candidate-20261027.go.txt','backend/internal/systembackupcleanup/clock_test.go']
];
function physical(base){
 const out=[];function walk(rel){for(const e of fs.readdirSync(path.join(base,rel),{withFileTypes:true})){
  const name=rel?rel+'/'+e.name:e.name,abs=path.join(base,name);assert.equal(fs.lstatSync(abs).isSymbolicLink(),false,'redirected source: '+name);
  if(e.isDirectory())walk(name);else {assert.ok(e.isFile(),'nonregular source');const b=fs.readFileSync(abs);out.push({path:name,size:b.length,sha256:sha(b)});}
 }}walk('');return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function check(m){
 assert.match(m.owner,/^\.tmp-d-cleanup-clock-[a-f0-9]{32}$/);
 for(const p of m.controls)assert.deepEqual(pin(p.path),p,'native control changed');
 for(const p of m.candidates)assert.deepEqual(pin(p.path),p,'candidate changed');
 const source=path.join(root,m.owner,'source');assert.equal(fs.lstatSync(source).isSymbolicLink(),false);
 assert.deepEqual(physical(source),m.files,'complete private source bytes/file set changed');
 assert.equal(sourceDigest(m.files),m.source_sha256);
}
function goObjects(text){
 const values=[];let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(start<0){if(/\s/.test(c))continue;assert.equal(c,'{');start=i;depth=1;continue}
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
  if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']')depth--;
  if(depth===0){values.push(JSON.parse(text.slice(start,i+1)));start=-1;}
 }
 assert.equal(start,-1,'truncated actual go-list output');assert.ok(values.length>0);return values;
}
if(mode==='--prepare'){
 assert.match(ownerName??'',/^\.tmp-d-cleanup-clock-[a-f0-9]{32}$/);
 assert.equal(ownerName.slice(-32),manifestName.match(/native-([a-f0-9]{32})/)[1]);
 assert.equal(fs.existsSync(manifestPath),false);assert.equal(fs.existsSync(path.join(root,ownerName)),false);
 const accepted=json('docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json');
 const base=enumerate(root);assert.deepEqual(base,accepted.files);assert.equal(sourceDigest(base),accepted.source_sha256);
 const candidates=mappings.map(([p])=>pin(p));
 const controls=[self,driver,'docs/evidence/a-owner-pre-thin-target-20261026.mjs','docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json'].map(pin);
 const source=path.join(root,ownerName,'source');fs.mkdirSync(source,{recursive:true});
 for(const p of base){const target=path.join(source,p.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,read(p.path),{flag:'wx'});}
 for(const [from,to]of mappings){assert.equal(base.some(p=>p.path===to),false);const target=path.join(source,to);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,read(from),{flag:'wx'});}
 const files=physical(source);assert.equal(files.length,base.length+2);assert.deepEqual(enumerate(root),base);
 const manifest={kind:'d2_cleanup_clock_private_source.v1',owner:ownerName,base_source_sha256:accepted.source_sha256,base_files:base.length,source_sha256:sourceDigest(files),files,candidates,controls,scope:'New internal clock package only; no live application, SQL installation, writer, reader or production authority claimed.'};
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});check(manifest);
 console.log(JSON.stringify({prepared:true,owner:ownerName,files:files.length,source_sha256:manifest.source_sha256,Go_started:false}));
}else if(mode==='--check'){
 const m=json(manifestName);check(m);console.log(JSON.stringify({source_and_complete_physical_set_verified:true,files:m.files.length}));
}else if(mode==='--inventory'){
 const m=json(manifestName);check(m);const prefix=manifestPath.replace(/\.source\.json$/,'');
 const pkg='clawreef/internal/systembackupcleanup', closure={};
 for(const platform of ['windows','linux']){
  const packages=goObjects(fs.readFileSync(prefix+'.'+platform+'.go-list.jsonl','utf8').replace(/^\uFEFF/,''));
  const selected=packages.find(p=>p.ImportPath===pkg&&!p.ForTest);assert.ok(selected);
  assert.deepEqual(selected.GoFiles,['clock.go']);assert.deepEqual(selected.TestGoFiles,['clock_test.go']);
  assert.equal(path.resolve(selected.Dir),path.join(root,m.owner,'source/backend/internal/systembackupcleanup'));
  const sourceNames=new Set();
  for(const p of packages){assert.ok(!p.Error&&!(p.DepsErrors?.length),'go-list dependency error');
   if(p.Module?.Main){assert.equal(path.resolve(p.Module.Dir),path.join(root,m.owner,'source/backend'));
    if(p.Dir)for(const key of ['GoFiles','CgoFiles','CFiles','CXXFiles','HFiles','SFiles','SysoFiles','EmbedFiles','TestGoFiles','XTestGoFiles','TestEmbedFiles','XTestEmbedFiles'])for(const name of p[key]??[]){
     const abs=path.resolve(p.Dir,name),rel=path.relative(path.join(root,m.owner,'source'),abs).replaceAll('\\','/');
     assert.ok(!rel.startsWith('../')&&!path.isAbsolute(rel));const input=m.files.find(f=>f.path===rel);assert.ok(input,'unlisted actual dependency '+rel);sourceNames.add(rel);
    }
   }
  }
  closure[platform]=[...sourceNames].sort();
 }
 const events=fs.readFileSync(prefix+'.test.jsonl','utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>JSON.parse(line));
 const runs=new Set(),passes=new Set();
 for(const e of events){assert.equal(e.Package,pkg);assert.notEqual(e.Action,'fail');assert.notEqual(e.Action,'skip');if(e.Test&&e.Action==='run'){assert.equal(runs.has(e.Test),false);runs.add(e.Test)}if(e.Test&&e.Action==='pass'){assert.equal(passes.has(e.Test),false);passes.add(e.Test)}}
 const roots=[...runs].filter(n=>!n.includes('/')).sort();
 assert.deepEqual(roots,['TestAutomaticCleanupClockUsesOriginalAtomicStart','TestCleanupBudgetRejectsMissingOrAlteredSnapshot','TestCleanupReplayRejectsZeroAndInvalidClocks','TestExplicitCleanupClockPreservesOperationQueueWindow','TestOperationCleanupWindowMatchesOriginalConfigBounds'].sort());
 assert.deepEqual([...runs].sort(),[...passes].sort());assert.equal(passes.size,24);
 assert.equal(events.filter(e=>!e.Test&&e.Action==='pass').length,1);
 const binary=fs.readFileSync(path.join(root,m.owner,'binary','cleanup-clock.linux.test'));
 assert.equal(binary.subarray(0,6).toString('hex'),'7f454c460201');assert.equal(binary.readUInt16LE(18),62);
 console.log(JSON.stringify({roots:roots.length,pass_events:passes.size,actual_selected_closures:closure,default_vet:true,count:1,linux_ELF64:{size:binary.length,sha256:sha(binary)},Linux_executed:false,SQL:false}));
}else throw Error('unknown mode');
