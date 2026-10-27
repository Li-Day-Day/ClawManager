import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:read(p).length,sha256:hash(read(p))});
const [mode,...args]=process.argv.slice(2);
if(mode==='prepare'){
 assert.equal(args.length,0);
 const gateName='docs/evidence/d1-gate-budget-source-ready-20261027-r3.json',gate=json(gateName);
 const before=enumerate(root);assert.equal(sourceDigest(before),gate.base_source_sha256);assert.equal(before.length,1720);
 const id=crypto.randomUUID().replaceAll('-',''),owner=path.join(root,'.tmp-d-index-cache-'+id),source=path.join(owner,'source');
 const prefix='docs/evidence/d1-joint-native-'+id;assert.equal(fs.existsSync(owner),false);fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(owner,'owner.txt'),path.basename(owner));
 const changes=[...gate.changes];
 for(const [from,to]of [['d2-cleanup-clock-candidate-20261027.go.txt','clock.go'],['d2-cleanup-reader-candidate-20261027.go.txt','reader.go'],['d2-cleanup-recorder-candidate-20261027.go.txt','recorder.go'],['d2-cleanup-clock-tests-candidate-20261027.go.txt','clock_test.go'],['d2-cleanup-database-tests-candidate-20261027.go.txt','database_test.go']]){
  const p='docs/evidence/'+from,b=read(p);changes.push({path:'backend/internal/systembackupcleanup/'+to,before:null,after:{path:'backend/internal/systembackupcleanup/'+to,size:b.length,sha256:hash(b)},candidate:pin(p)});
 }
 try{
  for(const p of before){const b=read(p.path);assert.equal(b.length,p.size);assert.equal(hash(b),p.sha256);assert.equal(fs.lstatSync(path.join(root,p.path)).isSymbolicLink(),false);const out=path.join(source,p.path);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,b,{flag:'wx'});}
  for(const c of changes){assert.deepEqual(pin(c.candidate.path),c.candidate);const out=path.join(source,c.path);if(c.before)assert.equal(hash(fs.readFileSync(out)),c.before.sha256);else assert.equal(fs.existsSync(out),false);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,read(c.candidate.path));}
  assert.deepEqual(enumerate(root),before,'live source changed during copy');
  const files=enumerate(source),m={kind:'d1_joint_gate_cleanup_native_source.v1',owner,source,base_files:before.length,base_source_sha256:sourceDigest(before),files,source_sha256:sourceDigest(files),changes,gate_review_source:pin(gateName),controls:[pin('docs/evidence/d1-joint-native-source-20261027.mjs'),pin('docs/evidence/a-owner-pre-thin-target-20261026.mjs'),pin('docs/evidence/d1-joint-native-run-20261027.ps1')],live_sources_modified:false,dependencies_installed:false};
  const manifest=prefix+'.source.json';fs.writeFileSync(path.join(root,manifest),JSON.stringify(m,null,2)+'\n',{flag:'wx'});
  const handle={kind:'d1_joint_native_prepared.v1',status:'prepared_no_Go',owner,source,prefix,manifest,source_sha256:m.source_sha256,source_files:files.length};const name=prefix+'.prepared.json';fs.writeFileSync(path.join(root,name),JSON.stringify(handle,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({handle:name,...handle}));
 }catch(e){console.log(JSON.stringify({owner,prefix,preparation_failed:true,error:e.message}));throw e;}
}else if(mode==='check'){
 assert.equal(args.length,1);const m=json(args[0]);assert.equal(m.kind,'d1_joint_gate_cleanup_native_source.v1');assert.equal(path.dirname(m.owner),root);assert.match(path.basename(m.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.readFileSync(path.join(m.owner,'owner.txt'),'utf8'),path.basename(m.owner));assert.equal(fs.realpathSync(m.source),m.source);
 assert.deepEqual(enumerate(m.source),m.files,'private native source bytes or path set changed');assert.equal(sourceDigest(m.files),m.source_sha256);for(const p of m.controls)assert.deepEqual(pin(p.path),p);console.log(JSON.stringify({source_postcheck:true,source_files:m.files.length,source_sha256:m.source_sha256}));
}else if(mode==='finish'){
 assert.equal(args.length,2);const m=json(args[0]),steps=json(args[1]);assert.equal(steps.length,9);for(const s of steps){assert.equal(s.exit_code,0);assert.equal(hash(read(s.log)),s.sha256);}
 const events=read(steps[1].log).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);assert.ok(!events.some(e=>['fail','skip','build-fail'].includes(e.Action)));
 const packages=['clawreef/internal/systembackupcontroller','clawreef/internal/systembackupcleanup'];const inventories=[];
 for(const pkg of packages){const rows=events.filter(e=>e.Package===pkg),ran=rows.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test).sort(),passed=rows.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test).sort();assert.ok(ran.length>0);assert.deepEqual(ran,passed);assert.equal(rows.filter(e=>!e.Test&&e.Action==='pass').length,1);inventories.push({package:pkg,roots:passed.filter(n=>!n.includes('/')).length,pass_events:passed.length,names:passed});}
 const expected=m.changes.filter(c=>c.path.endsWith('_test.go')).flatMap(c=>[...read(path.join(m.source,c.path)).toString('utf8').matchAll(/^func (Test\w+)\(/gm)].map(x=>x[1]));for(const name of expected)assert.ok(inventories.some(p=>p.names.includes(name)),name);
 const binaries=[];for(const name of ['controller.exe','controller.test','cleanup.test','controller-linux']){const b=fs.readFileSync(path.join(m.owner,'binary',name)),linux=name!=='controller.exe';assert.ok(b.length>1024);if(linux){assert.equal(b.subarray(0,7).toString('hex'),'7f454c46020101');assert.equal(b.readUInt16LE(18),62);}else assert.equal(b.subarray(0,2).toString(),'MZ');binaries.push({name,size:b.length,sha256:hash(b),header64_hex:b.subarray(0,64).toString('hex'),executed:false});}
 const result={kind:'d1_joint_native_inventory.v1',source_sha256:m.source_sha256,steps:9,packages:inventories,required_new_test_roots:expected,binaries,actual_SQL:false,production_approved:false};fs.writeFileSync(path.resolve(root,args[1].replace(/\.steps\.json$/,'.inventory.json')),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({roots:inventories.map(p=>p.roots),pass:inventories.map(p=>p.pass_events),binaries:4,actual_SQL:false}));
}else throw new Error('Expected prepare, check MANIFEST, or finish MANIFEST STEPS');
