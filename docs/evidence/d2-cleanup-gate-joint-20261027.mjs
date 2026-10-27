import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure} from './a-native-selected-go-closure-20261027.mjs';
const root=path.resolve(import.meta.dirname,'../..'),leaf='.tmp-d-index-cache-c6e41c5d9a4548c1afa7b154def28ebd',owner=path.join(root,leaf),source=path.join(owner,'source');
const prefix=path.join(root,'docs/evidence/d2-cleanup-gate-joint-c6e41-20261027'),manifestPath=prefix+'.source.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.resolve(root,p)),json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)}};
const controls=['docs/evidence/d2-cleanup-gate-joint-20261027.mjs','docs/evidence/d2-cleanup-gate-joint-20261027.ps1','docs/evidence/a-owner-pre-thin-target-20261026.mjs','docs/evidence/a2-reference-capability-go-scope-20261026.mjs','docs/evidence/a-native-selected-go-closure-20261027.mjs','docs/evidence/d2-cleanup-full-candidate-source-ready-20261027.json','docs/evidence/d1-gate-budget-source-ready-20261027-r3.json'];
function physical(){const out=[];function walk(rel){for(const e of fs.readdirSync(path.join(source,rel),{withFileTypes:true})){const p=rel?rel+'/'+e.name:e.name,a=path.join(source,p);assert.equal(fs.lstatSync(a).isSymbolicLink(),false);if(e.isDirectory())walk(p);else{assert.ok(e.isFile());const b=fs.readFileSync(a);out.push({path:p,size:b.length,sha256:sha(b)})}}}walk('');return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)}
function check(m){assert.equal(m.owner,leaf);for(const p of m.controls)assert.deepEqual(pin(p.path),p);for(const p of m.candidates)assert.deepEqual(pin(p.path),p);assert.deepEqual(physical(),m.physical_files);assert.equal(sourceDigest(m.files),m.source_sha256)}
const mode=process.argv[2];
if(mode==='--prepare'){
 assert.equal(fs.realpathSync(owner),owner);assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8').trim(),leaf);assert.equal(fs.existsSync(source),false);assert.equal(fs.existsSync(manifestPath),false);
 const base=enumerate(root);assert.equal(base.length,1720);assert.equal(sourceDigest(base),'dc79d81f74d6d6c293372f6c5404b2a673c3f469da1c4d14d4adc763199efa8e');
 const cleanup=json('docs/evidence/d2-cleanup-full-candidate-source-ready-20261027.json'),gate=json('docs/evidence/d1-gate-budget-source-ready-20261027-r3.json');assert.equal(gate.base_source_sha256,sourceDigest(base));
 const mappings=[...cleanup.mappings,...gate.changes.map(c=>({target:c.path,candidate:c.candidate}))];assert.equal(mappings.length,9);
 const candidates=mappings.map(c=>{assert.deepEqual(pin(c.candidate.path),c.candidate);return c.candidate});
 fs.mkdirSync(source);for(const p of base){const to=path.join(source,p.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,read(p.path),{flag:'wx'})}
 for(const c of mappings){const to=path.join(source,c.target);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,read(c.candidate.path))}
 const plan='docs/system-backup-restore-division-plan.md';fs.mkdirSync(path.join(source,'docs'),{recursive:true});fs.writeFileSync(path.join(source,plan),read(plan),{flag:'wx'});
 const physical_files=physical(),files=physical_files.filter(p=>p.path!==plan);assert.equal(files.length,1727);assert.deepEqual(enumerate(root),base);
 const manifest={kind:'d2_cleanup_gate_private_joint_source.v1',owner:leaf,base_source_sha256:sourceDigest(base),source_sha256:sourceDigest(files),files,physical_files,candidates,controls:controls.map(pin),extra_inputs:[pin(plan)],declared_cleanup_roots:cleanup.declared_test_roots,scope:'Gate implementation plus the new cleanup timing/recorder/reader package. SQL ledger installation and real provider residual source are not claimed.'};
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});check(manifest);fs.writeFileSync(path.join(owner,'adoption.json'),JSON.stringify({owner:leaf,runner:'Root joint Windows/native',manifest:manifestPath,tests_started:false})+'\n',{flag:'wx'});
 console.log(JSON.stringify({prepared:true,source_files:files.length,physical_files:physical_files.length,source_sha256:manifest.source_sha256}));
}else if(mode==='--check'){const m=json(manifestPath);check(m);console.log(JSON.stringify({whole_private_source_and_set_verified:true,source_files:m.files.length}))}
else if(mode==='--windows-inventory'){
 const m=json(manifestPath);check(m);const rows=parseGoList(fs.readFileSync(prefix+'.windows.list.jsonl','utf8'));const selected=selectedGoClosure(rows,['clawreef/internal/systembackupcleanup','clawreef/internal/systembackupcontroller']);for(const f of selected.files)assert.ok(m.files.some(p=>p.path===f),'Unlisted actual dependency '+f);
 const events=fs.readFileSync(prefix+'.windows.tests.jsonl','utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(l=>JSON.parse(l));const outputs={};
 for(const pkg of ['clawreef/internal/systembackupcleanup','clawreef/internal/systembackupcontroller']){
  const run=new Set(),pass=new Set();let terminal=0;for(const e of events.filter(e=>e.Package===pkg)){assert.ok(!['fail','skip'].includes(e.Action));if(e.Test&&e.Action==='run'){assert.equal(run.has(e.Test),false);run.add(e.Test)}if(e.Test&&e.Action==='pass'){assert.equal(pass.has(e.Test),false);pass.add(e.Test)}if(!e.Test&&e.Action==='pass')terminal++}
  assert.equal(terminal,1);assert.deepEqual([...run].sort(),[...pass].sort());const roots=[...run].filter(n=>!n.includes('/')).sort();
  if(pkg.endsWith('/systembackupcleanup')){assert.deepEqual(roots,m.declared_cleanup_roots);assert.equal(pass.size,60)}else{
   const old='docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2.step-4.jsonl';const previous=read(old).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(l=>JSON.parse(l));for(const e of previous)if(e.Test&&!e.Test.includes('/')&&e.Action==='pass')assert.ok(pass.has(e.Test),'Lost original controller root '+e.Test);
   assert.equal(roots.length,155);
  }outputs[pkg]={roots:roots.length,pass_events:pass.size,names:[...pass].sort()};
 }
 console.log(JSON.stringify({packages:outputs,actual_selected_closure:selected,source_postcheck:true,default_vet:true,count:1,SQL:false}));
}else throw Error('unknown mode');
