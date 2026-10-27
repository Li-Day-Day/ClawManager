import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const safe=f=>{assert.ok(typeof f==='string'&&!path.isAbsolute(f)&&!f.includes('\\')&&!f.split('/').some(p=>['..','.',''].includes(p)));const p=path.resolve(root,f);assert.ok(p.startsWith(root+path.sep));assert.ok(!fs.lstatSync(p).isSymbolicLink());return p;};
export const read=f=>fs.readFileSync(safe(f));
export const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const pin=f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};};
const events=f=>read(f).toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse);
export function reviewFrozenRun({token,request,inputs,roots,passes,sourceInputs,priorLog,priorCount,requiredLeaves}){
  assert.match(token,/^[a-f0-9]{32}$/);
  const prefix='docs/evidence/d-resources-rules-local-'+token;
  const receipt=json(prefix+'.json'),source=json(prefix+'-source.json'),r=json(request);
  assert.equal(receipt.exit_code,0);assert.equal(receipt.error,null);
  for(const k of ['frozen_inputs_stable','current_inputs_stable','owner_removed','default_vet'])assert.equal(receipt[k],true);
  for(const k of ['dependencies_installed','actual_mysql','production_wired'])assert.equal(receipt[k],false);
  assert.equal(path.dirname(receipt.owner),root);assert.equal(path.basename(receipt.owner),'.tmp-d-resources-rules-'+token);assert.equal(fs.existsSync(receipt.owner),false);
  assert.equal(source.inputs.length,sourceInputs);assert.equal(new Set(source.inputs.map(p=>p.path)).size,sourceInputs);
  for(const p of source.inputs){const b=Buffer.from(p.bytes_base64,'base64');assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);assert.deepEqual(pin(p.path),{path:p.path,size:p.size,sha256:p.sha256});}
  assert.equal(r.source_files.length,inputs);assert.equal(new Set(r.source_files.map(p=>p.path)).size,inputs);
  for(const p of r.source_files)assert.deepEqual(pin(p.path),p);
  const e=events(prefix+'.jsonl'),expectedPackage='_/'+receipt.owner.replaceAll('\\','/').replace(':','_')+'/source/backend/internal/systembackupresources';
  assert.ok(e.every(v=>v.Package===expectedPackage));assert.equal(e.filter(v=>['fail','skip','build-fail'].includes(v.Action)).length,0);
  assert.equal(e.filter(v=>v.Action==='start').length,1);assert.equal(e.filter(v=>v.Action==='pass'&&!v.Test).length,1);
  assert.equal(e.at(-1).Action,'pass');assert.equal(e.at(-1).Test,undefined);
  const passed=e.filter(v=>v.Action==='pass'&&v.Test),ran=e.filter(v=>v.Action==='run'&&v.Test);
  assert.equal(passed.length,passes);assert.equal(new Set(passed.map(v=>v.Test)).size,passes);
  assert.deepEqual(ran.map(v=>v.Test).sort(),passed.map(v=>v.Test).sort());assert.equal(passed.filter(v=>!v.Test.includes('/')).length,roots);
  for(const [prefix,count] of Object.entries(requiredLeaves))assert.equal(passed.filter(v=>v.Test.startsWith(prefix+'/')).length,count);
  const prior=events(priorLog).filter(v=>v.Action==='pass'&&v.Test),names=new Set(passed.map(v=>v.Test));
  assert.equal(prior.length,priorCount);assert.ok(prior.every(v=>names.has(v.Test)));
  return {request:pin(request),source_digest:r.source_digest,request_inputs:inputs,frozen_inputs:sourceInputs,roots,pass_events:passes,prior_checks_preserved:priorCount,required_leaves:requiredLeaves,default_vet:true,owner:receipt.owner,owner_independently_absent:true,cleanup_reported:true,evidence:[prefix+'.json',prefix+'.jsonl',prefix+'-source.json',priorLog].map(pin)};
}
