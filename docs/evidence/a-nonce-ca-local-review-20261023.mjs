// Local preparation receiver only. This never approves production or peer review.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function local(p){assert.equal(typeof p,'string');assert.ok(!path.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').includes('..'));return path.join(root,p);}
function bytes(p){return fs.readFileSync(local(p));}
function pin(p){const b=bytes(p);return {path:p,size:b.length,sha256:sha(b)};}
function walk(p){return fs.readdirSync(local(p),{withFileTypes:true}).flatMap(e=>{const f=p+'/'+e.name;assert.ok(!e.isSymbolicLink(),'redirected source '+f);return e.isDirectory()?walk(f):[f];});}

export function currentInputs(){
 const base=['backend/internal/systembackupsecurity','backend/internal/systembackupread','backend/internal/systembackupcontract','backend/internal/systembackupbootstrapsecurity','backend/cmd/system-backup-bootstrap','backend/internal/db/migrations','contracts/system-backup/v12'];
 const selected=base.flatMap(walk).filter(p=>(p.endsWith('.go')&&(!p.endsWith('_test.go')||/\/systembackup(?:security|bootstrapsecurity)\//.test(p)||p.startsWith('backend/cmd/system-backup-bootstrap/')))||(/^backend\/internal\/systembackupsecurity\/testdata\//.test(p)&&/\.(json|sql)$/.test(p))||(/^backend\/internal\/db\/migrations\//.test(p)&&p.endsWith('.sql'))||(/^contracts\/system-backup\/v12\//.test(p)&&p.endsWith('.json')));
 selected.push(...['backend/internal/systembackupnoncebootstrap','backend/internal/systembackupcatrust'].flatMap(walk).filter(p=>p.endsWith('.go')));
 selected.push('backend/go.mod','backend/go.sum','backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql','scripts/system-backup-a-nonce-bootstrap-validation.ps1','scripts/system-backup-a-bootstrap-source.ps1','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-d-index-source-snapshot.ps1');
 return [...new Set(selected)].sort();
}

export function review(receiptPath,transcriptPath){
 const receipt=JSON.parse(bytes(receiptPath).toString('utf8').replace(/^\uFEFF/,''));
 const log=bytes(transcriptPath).toString('utf8').replace(/\r/g,'');
 assert.equal(receipt.kind,'a_nonce_bootstrap_candidate_validation.v1');
 assert.equal(receipt.status,'candidate_tests_and_linux_compile_passed_actual_materials_and_review_pending');
 assert.deepEqual(receipt.packages,['clawreef/internal/systembackupnoncebootstrap','clawreef/internal/systembackupcatrust']);
 assert.equal(receipt.test_exit,0);
 for(const f of ['linux_build','frozen_inputs_match','current_inputs_match','cleanup_verified','default_vet','synthetic_SQL_driver','synthetic_loopback_TLS'])assert.equal(receipt[f],true,f);
 for(const f of ['dependencies_installed','external_provider_contacted','production_linked','production_approved'])assert.equal(receipt[f],false,f);
 assert.match(log,/^NONCE_CA_FINAL_EXIT=0\s*$/m,'terminal exit required');
 assert.match(log,/^End time: \d{14}\s*$/m,'closed transcript required');
 assert.doesNotMatch(log,/^\s*--- (FAIL|SKIP):|^FAIL\s|^panic:|^fatal error:/m);
 const frozen=[...log.matchAll(/^NONCE_FROZEN source_sha256=([a-f0-9]{64}) files=(\d+) owner=(.+)\s*$/gm)];
 assert.equal(frozen.length,1);assert.equal(frozen[0][1],receipt.source_sha256);assert.equal(Number(frozen[0][2]),receipt.files.length);assert.equal(frozen[0][3].trim(),receipt.owner);
 const announcements=[...log.matchAll(/^NONCE_RECEIPT (.+)\s*$/gm)];assert.equal(announcements.length,1);assert.equal(path.resolve(announcements[0][1].trim()),path.resolve(local(receiptPath)));
 assert.ok(log.includes('NONCE_CLEANUP verified=True owner='+receipt.owner)||log.includes('NONCE_CLEANUP verified=true owner='+receipt.owner));
 const owner=path.resolve(receipt.owner);assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-a-evidence-[a-f0-9]{32}$/);
 assert.throws(()=>fs.lstatSync(owner),e=>e.code==='ENOENT','exact owner still present');
 assert.deepEqual([...new Set(receipt.files.map(p=>p.path))].sort(),currentInputs(),'source set differs');
 assert.equal(new Set(receipt.files.map(p=>p.path)).size,receipt.files.length,'duplicate pins');
 for(const p of receipt.files)assert.deepEqual(pin(p.path),p,'current source differs '+p.path);
 assert.equal(sha(Buffer.from(receipt.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n')),receipt.source_sha256);
 const tests=[];
 for(const file of ['backend/internal/systembackupnoncebootstrap/nonce_test.go','backend/internal/systembackupcatrust/ca_test.go']){
  for(const m of bytes(file).toString('utf8').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)){
   const re=new RegExp('^--- PASS: '+m[1]+' \\([0-9.]+s\\)\\s*$','gm');assert.equal([...log.matchAll(re)].length,1,'missing or duplicated test '+m[1]);tests.push(m[1]);
  }
 }
 assert.equal(tests.length,8);
 for(const pkg of receipt.packages){const matches=log.split('\n').filter(l=>/^ok\s+/.test(l)&&l.split(/\s+/)[1]===pkg);assert.equal(matches.length,1,'package completion '+pkg);}
 return {kind:'a_nonce_ca_local_acceptance.v1',status:'exact_local_preparation_only',receipt:pin(receiptPath),transcript:pin(transcriptPath),source_sha256:receipt.source_sha256,source_files:receipt.files.length,tests,exact_owner_absent:true,default_vet:true,Linux_builds:['nonce-bootstrap.test','ca-trust.test'],current_source_set_and_bytes_match:true,actual_SQL:false,external_provider:false,non_implementer_review:false,production_linked:false,production_approved:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert.equal(args.length,4,'usage: RECEIPT TRANSCRIPT --write|--check OUTPUT');
 const [receipt,log,mode,out]=args;assert.ok(['--write','--check'].includes(mode));const report=review(receipt,log);
 report.receiver=pin('docs/evidence/a-nonce-ca-local-review-20261023.mjs');
 if(mode==='--write')fs.writeFileSync(local(out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});else assert.deepEqual(JSON.parse(bytes(out)),report);
 console.log('NONCE_CA_LOCAL_ACCEPTED source_files='+report.source_files+' actual_SQL=no peer_review=no');
}
