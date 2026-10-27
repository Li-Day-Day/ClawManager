// Synthetic receiver regressions; these are never actual validation receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {review,currentInputs} from './a-nonce-ca-local-review-20261023.mjs';

test('nonce/CA receiver requires complete exact local evidence (synthetic only)',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const scratch=path.join(root,'.tmp-a-nonce-review-'+crypto.randomBytes(16).toString('hex'));
 const owner=path.join(root,'.tmp-a-evidence-'+crypto.randomBytes(16).toString('hex'));
 fs.mkdirSync(scratch);
 const rel=p=>path.relative(root,p).replaceAll('\\','/');
 const rp=rel(path.join(scratch,'synthetic.json')),lp=rel(path.join(scratch,'synthetic.txt'));
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 try{
  const files=currentInputs().map(p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,size:b.length,sha256:sha(b)};});
  const digest=sha(Buffer.from(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'));
  const baseline={kind:'a_nonce_bootstrap_candidate_validation.v1',status:'candidate_tests_and_linux_compile_passed_actual_materials_and_review_pending',packages:['clawreef/internal/systembackupnoncebootstrap','clawreef/internal/systembackupcatrust'],test_exit:0,linux_build:true,frozen_inputs_match:true,current_inputs_match:true,cleanup_verified:true,default_vet:true,synthetic_SQL_driver:true,synthetic_loopback_TLS:true,dependencies_installed:false,external_provider_contacted:false,production_linked:false,production_approved:false,owner,files,source_sha256:digest};
  const roots=['backend/internal/systembackupnoncebootstrap/nonce_test.go','backend/internal/systembackupcatrust/ca_test.go'].flatMap(p=>[...fs.readFileSync(path.join(root,p),'utf8').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]));
  const transcript=['NONCE_FROZEN source_sha256='+digest+' files='+files.length+' owner='+owner,...roots.map(n=>'--- PASS: '+n+' (0.01s)'),...baseline.packages.map(n=>'ok  \t'+n+'\t0.01s'),'NONCE_CLEANUP verified=True owner='+owner,'NONCE_RECEIPT '+path.join(root,rp),'NONCE_CA_FINAL_EXIT=0','End time: 20261023160000',''].join('\n');
  function run(receipt=baseline,log=transcript){fs.writeFileSync(path.join(root,rp),JSON.stringify(receipt));fs.writeFileSync(path.join(root,lp),log);return review(rp,lp);}
  const positive=run();assert.equal(positive.actual_SQL,false);assert.equal(positive.non_implementer_review,false);assert.equal(positive.production_approved,false);assert.equal(positive.tests.length,8);
  const mutations=[
   ['terminal exit',r=>{},l=>l.replace('NONCE_CA_FINAL_EXIT=0','NONCE_CA_FINAL_EXIT=1'),/terminal exit/],
   ['open transcript',r=>{},l=>l.replace('End time: 20261023160000',''),/closed transcript/],
   ['test failure',r=>{},l=>l+'--- FAIL: TestInjected (0.01s)\n',/expected to not match/],
   ['test skipped',r=>{},l=>l+'--- SKIP: TestInjected (0.01s)\n',/expected to not match/],
   ['missing test',r=>{},l=>l.replace('--- PASS: '+roots[0]+' (0.01s)',''),/missing or duplicated test/],
   ['missing package',r=>{},l=>l.replace('ok  \t'+baseline.packages[1]+'\t0.01s',''),/package completion/],
   ['missing linux',r=>{r.linux_build=false;},l=>l,/linux_build/],
   ['source drift flag',r=>{r.current_inputs_match=false;},l=>l,/current_inputs_match/],
   ['disabled vet',r=>{r.default_vet=false;},l=>l,/default_vet/],
   ['no cleanup',r=>{r.cleanup_verified=false;},l=>l,/cleanup_verified/],
   ['wrong transcript receipt',r=>{},l=>l.replace(path.join(root,rp),path.join(root,'other.json')),/strictly equal/],
   ['omitted source',r=>{r.files=r.files.slice(1);},l=>l.replace('files='+files.length,'files='+(files.length-1)),/source set differs/],
   ['changed source',r=>{r.files[0].sha256='0'.repeat(64);},l=>l,/current source differs/],
   ['production claim',r=>{r.production_approved=true;},l=>l,/production_approved/],
  ];
  for(const [name,mutate,changeLog,message] of mutations){const receipt=structuredClone(baseline);mutate(receipt);assert.throws(()=>run(receipt,changeLog(transcript)),message,name);}
  fs.mkdirSync(owner);assert.throws(()=>run(),/exact owner still present/);fs.rmdirSync(owner);
  console.log('SYNTHETIC_RECEIVER_ONLY positive=1 rejections=15 actual_SQL=no acceptance_written=no');
 }finally{
  assert.equal(path.dirname(scratch),root);assert.match(path.basename(scratch),/^\.tmp-a-nonce-review-[a-f0-9]{32}$/);assert.equal(fs.realpathSync(scratch),scratch);assert.equal(fs.lstatSync(scratch).isSymbolicLink(),false);
  fs.rmSync(scratch,{recursive:true});
  if(fs.existsSync(owner)){assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-a-evidence-[a-f0-9]{32}$/);fs.rmdirSync(owner);}
  assert.equal(fs.existsSync(scratch),false);assert.equal(fs.existsSync(owner),false);
 }
});
