// Synthetic receiver cases only; no actual acceptance is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {review,currentInputs} from './a-nonce-ca-r2-local-review-20261023.mjs';
test('r2 receiver preserves old failures and requires complete new evidence (synthetic only)',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const scratch=path.join(root,'.tmp-a-nonce-r2-review-'+crypto.randomBytes(16).toString('hex'));
 const owner=path.join(root,'.tmp-a-evidence-'+crypto.randomBytes(16).toString('hex'));
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 fs.mkdirSync(scratch);
 const rp=path.join(scratch,'synthetic.json'),lp=path.join(scratch,'synthetic.txt'),oldp=path.join(scratch,'old.jsonl'),seedp=path.join(scratch,'seed.json');
 const rel=p=>path.relative(root,p).replaceAll('\\','/');
 try{
  const files=currentInputs().map(p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,size:b.length,sha256:sha(b)};});
  const digest=sha(Buffer.from(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'));
  const binding='TestCATrustBindingNeverFormatsOrSerializesDeploymentPins';
  const cases=['value','pointer'].flatMap(v=>['default','detailed','Go','json'].map(f=>binding+'/'+v+'/'+f));
  const original=fs.readFileSync(path.join(root,'docs/evidence/a-nonce-ca-final-local-20261023-153722.txt'),'utf8');
  const passes=[...original.matchAll(/^\s*--- PASS: ([^\s]+) /gm)].map(m=>m[1]).concat(binding,cases);
  assert.equal(passes.length,63);
  const baseline={kind:'a_nonce_bootstrap_candidate_validation.v2',status:'candidate_tests_and_linux_compile_passed_actual_materials_and_review_pending',packages:['clawreef/internal/systembackupnoncebootstrap','clawreef/internal/systembackupcatrust'],test_exit:0,linux_build:true,frozen_inputs_match:true,current_inputs_match:true,cleanup_verified:true,default_vet:true,synthetic_SQL_driver:true,synthetic_loopback_TLS:true,dependencies_installed:false,external_provider_contacted:false,production_linked:false,production_approved:false,owner,files,source_sha256:digest,original_counterexample_verified:true,counterexample_exit:1,counterexample_log:oldp,cache_seed_audit:seedp};
  const old=[binding,...cases].map(Test=>({Action:'fail',Test,Package:'clawreef/internal/systembackupcatrust'})).concat({Action:'fail',Package:'clawreef/internal/systembackupcatrust'});
  const seed={kind:'a_compilation_cache_seed.v1',source:path.join(root,'.tmp-d-index-cache-'+('0'.repeat(32)),'cache'),target:path.join(owner,'cache'),source_read_only:true,source_available:true,target_compiler_not_started:true,existing_entries_overwritten:false,dependencies_installed:false,test_result_reuse:false,entries:[]};
  const transcript=['NONCE_CACHE_SEED copied=0 source_read_only=yes overwrite=no result_reuse=no install=no','NONCE_FROZEN source_sha256='+digest+' files='+files.length+' owner='+owner,...passes.map(n=>'--- PASS: '+n+' (0.01s)'),...baseline.packages.map(n=>'ok  \t'+n+'\t0.01s'),'NONCE_CLEANUP verified=True owner='+owner,'NONCE_RECEIPT '+rp,'NONCE_CA_R2_EXIT=0','End time: 20261023170000',''].join('\n');
  function run(r=baseline,l=transcript,o=old,s=seed){fs.writeFileSync(rp,JSON.stringify(r));fs.writeFileSync(lp,l);fs.writeFileSync(oldp,o.map(e=>JSON.stringify(e)).join('\n')+'\n');fs.writeFileSync(seedp,JSON.stringify(s));return review(rel(rp),rel(lp));}
  const accepted=run();assert.equal(accepted.tests.length,9);assert.equal(accepted.pass_events,63);assert.equal(accepted.old_failed_boundaries,8);assert.equal(accepted.actual_SQL,false);assert.equal(accepted.non_implementer_review,false);
  const noCache=run(baseline,transcript.replace('NONCE_CACHE_SEED copied=0 source_read_only=yes overwrite=no result_reuse=no install=no',''),old,{...seed,source_available:false,unavailable_reason:'ENOENT'});assert.equal(noCache.pass_events,63);
  const mutations=[
   ['failed final exit',r=>{},l=>l.replace('NONCE_CA_R2_EXIT=0','NONCE_CA_R2_EXIT=1'),o=>o,s=>s,/terminal exit/],
   ['open transcript',r=>{},l=>l.replace('End time: 20261023170000',''),o=>o,s=>s,/closed transcript/],
   ['failed native test',r=>{},l=>l+'--- FAIL: Injected (0.01s)\n',o=>o,s=>s,/expected to not match/],
   ['missing Binding child',r=>{},l=>l.replace('--- PASS: '+cases[0]+' (0.01s)',''),o=>o,s=>s,/complete final event/],
   ['missing root',r=>{},l=>l.replace('--- PASS: '+binding+' (0.01s)',''),o=>o,s=>s,/missing or duplicated test/],
   ['missing old failure',r=>{},l=>l,o=>o.slice(1),s=>s,/old source must fail/],
   ['old compile error',r=>{r.counterexample_exit=2;},l=>l,o=>o,s=>s,/strictly equal/],
   ['old reproduction missing',r=>{r.original_counterexample_verified=false;},l=>l,o=>o,s=>s,/strictly equal/],
   ['skipped old test',r=>{},l=>l,o=>o.concat({Action:'skip',Test:'Injected'}),s=>s,/strictly equal/],
   ['cache overwrite',r=>{},l=>l,o=>o,s=>({...s,existing_entries_overwritten:true}),/strictly equal/],
   ['cache test result reuse',r=>{},l=>l,o=>o,s=>({...s,test_result_reuse:true}),/strictly equal/],
   ['unavailable cache contains input',r=>{},l=>l,o=>o,s=>({...s,source_available:false,unavailable_reason:'ENOENT',entries:[{name:'aa/'+('b'.repeat(64))+'-a',size:0,sha256:'c'.repeat(64)}]}),/strictly equal/],
   ['unavailable cache claims copied input',r=>{},l=>l.replace('NONCE_CACHE_SEED copied=0','NONCE_CACHE_SEED copied=1'),o=>o,s=>({...s,source_available:false,unavailable_reason:'ENOENT'}),/expected to not match/],
   ['replaced old assertion',r=>{},l=>l.replace(passes.find(n=>n.includes('/'))+' (0.01s)','TestReplaced/unknown (0.01s)'),o=>o,s=>s,/original test inventory/],
   ['missing linux',r=>{r.linux_build=false;},l=>l,o=>o,s=>s,/linux_build/],
   ['no cleanup',r=>{r.cleanup_verified=false;},l=>l,o=>o,s=>s,/cleanup_verified/],
   ['source drift',r=>{r.current_inputs_match=false;},l=>l,o=>o,s=>s,/current_inputs_match/],
   ['production claim',r=>{r.production_approved=true;},l=>l,o=>o,s=>s,/production_approved/]
  ];
  for(const [name,change,changeLog,changeOld,changeSeed,message] of mutations){const receipt=structuredClone(baseline);change(receipt);assert.throws(()=>run(receipt,changeLog(transcript),changeOld(structuredClone(old)),changeSeed(structuredClone(seed))),message,name);}
  fs.mkdirSync(owner);assert.throws(()=>run(),/exact owner still present/);fs.rmdirSync(owner);
  console.log('R2_SYNTHETIC_RECEIVER_ONLY positive=2 rejections=19 actual_SQL=no acceptance_written=no');
 }finally{
  assert.equal(path.dirname(scratch),root);assert.match(path.basename(scratch),/^\.tmp-a-nonce-r2-review-[a-f0-9]{32}$/);assert.equal(fs.realpathSync(scratch),scratch);assert.equal(fs.lstatSync(scratch).isSymbolicLink(),false);fs.rmSync(scratch,{recursive:true});
  if(fs.existsSync(owner)){assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-a-evidence-[a-f0-9]{32}$/);fs.rmdirSync(owner);}
  assert.equal(fs.existsSync(scratch),false);assert.equal(fs.existsSync(owner),false);
 }
});
