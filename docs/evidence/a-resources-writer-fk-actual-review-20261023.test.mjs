import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {cases,validateFKTranscript,reviewFK} from './a-resources-writer-fk-actual-review-20261023.mjs';
const hash='a'.repeat(64),other='b'.repeat(64);
const receipt={binary_sha256:hash,migration_binary_sha256:hash,inputs_sha256:hash,owner:path.resolve('.tmp-d-index-cache-'+'a'.repeat(32))};
const ns='sbk-mig-261023140000-abcd',uid='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const probe='TestAResourcesWriteFKMySQL';
const input=()=>[
 `RUN namespace=${ns} uid=${uid} app_image=image@sha256:${hash} mysql_image=mysql:8.4 mysql_version=8.4.8`,
 `PASS pinned-migration-runner binary_sha256=${hash} catalog_sha256=${hash}`,
 'PASS fresh-migration-replay=001..096 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',
 `=== RUN   ${probe}`,
 '    fixture.go:1: RESOURCES_FIXTURE mysql=8.4.8 migrations=96 tables=44 clone=LIKE foreign_key_proof=no synthetic_registry=yes',
 '    fixture.go:2: FK_SCHEMA canonical_and_owned=matched job_relations=2 cascade=yes checks=1',
 ...cases.flatMap(c=>[`=== RUN   ${probe}/${c}`,`    --- PASS: ${probe}/${c} (0.01s)`]),
 '    fixture.go:3: PASS a-resources-write-fk-mysql cases=10 declared_job_fks=2 checks=1 synthetic_proofs=yes production=no',
 '    fixture.go:4: CLEANED resources-mysql-owned-database-and-user=yes',
 `--- PASS: ${probe} (1.00s)`,'PASS',
 `PASS a-resources-write-fk-mysql cases=10 binary_sha256=${hash} inputs_sha256=${hash} synthetic_proofs=yes full_restore=no production=no`,
 `CLEANED namespace=${ns} uid=${uid}`,'CLEANED resources-remote-scratch=yes',
 `CLEANED resources-local-owner=${receipt.owner} removed=True`,
].join('\n');
const check=s=>validateFKTranscript(s,receipt,{migrationCount:96,lastMigration:'096',catalogHash:hash});
test('complete synthetic text tests parser only, BOM/CRLF accepted',()=>assert.equal(check('\uFEFF'+input().replaceAll('\n','\r\n')).remote_cases,10));
const mutations={
 'missing FK observation':s=>s.replace(/^.*FK_SCHEMA.*\n/m,''),
 'wrong FK count':s=>s.replace('job_relations=2','job_relations=1'),
 'disabled FK checks':s=>s.replace('checks=1','checks=0'),
 'case missing':s=>s.split('\n').filter(l=>!l.includes('/reparent_both')).join('\n'),
 'duplicate pass':s=>s+'\n    --- PASS: '+probe+'/reparent_both (0.01s)',
 'wrong case same count':s=>s.replaceAll('/reparent_both','/unreviewed_case'),
 'case failed':s=>s.replace('--- PASS: '+probe+'/reparent_both','--- FAIL: '+probe+'/reparent_both'),
 'case skipped':s=>s.replace('--- PASS: '+probe+'/reparent_both','--- SKIP: '+probe+'/reparent_both'),
 'root absent':s=>s.replace('=== RUN   '+probe+'\n',''),
 'root failed':s=>s.replace('--- PASS: '+probe+' (','--- FAIL: '+probe+' ('),
 'root omitted':s=>s.replace('--- PASS: '+probe+' (1.00s)\n',''),
 'no native completion':s=>s.replace('\nPASS\n','\n'),
 'mixed remote roots':s=>s+'\n=== RUN   TestDResourcesReadbackMySQL',
 'wrong binary':s=>s.replace('cases=10 binary_sha256='+hash,'cases=10 binary_sha256='+other),
 'wrong inputs':s=>s.replace('inputs_sha256='+hash,'inputs_sha256='+other),
 'wrong migrations':s=>s.replace('applied=96','applied=95'),
 'wrong catalog':s=>s.replace('catalog_sha256='+hash,'catalog_sha256='+other),
 'wrong namespace UID':s=>s.replace('CLEANED namespace='+ns+' uid='+uid,'CLEANED namespace='+ns+' uid='+('b'.repeat(36))),
 'pending cleanup':s=>s+'\nCLEANUP_PENDING test',
 'database cleanup missing':s=>s.replace(/^.*owned-database-and-user=yes\n/m,''),
 'scratch cleanup missing':s=>s.replace('CLEANED resources-remote-scratch=yes\n',''),
 'owner cleanup missing':s=>s.replace(/^CLEANED resources-local-owner=.*$/m,''),
 'truncated success':s=>s.slice(0,s.indexOf('CLEANED namespace=')),
 'case before FK check':s=>{const line='=== RUN   '+probe+'/reparent_both';return line+'\n'+s.replace(line+'\n','');},
};
for(const [name,mutate] of Object.entries(mutations))test('reject '+name,()=>assert.throws(()=>check(mutate(input()))));
test('real local preparation cannot be received as actual FK SQL; no receipt written',()=>{
 const before=fs.readdirSync('docs/evidence').filter(p=>p.startsWith('a-resources-writer-fk-actual-accepted'));
 assert.throws(()=>reviewFK('docs/evidence/d-resources-mysql-20261023-143137-e4157ca2.json'));
 assert.deepEqual(fs.readdirSync('docs/evidence').filter(p=>p.startsWith('a-resources-writer-fk-actual-accepted')),before);
});

test('synthetic file-level FK receipt binds current sources, native logs and old inventory; files removed',()=>{
 // Parser integration only: all remote text remains synthetic. No actual SQL
 // acceptance file is written, and every temporary fixture is removed below.
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const decode=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
 const prior=decode('docs/evidence/d-resources-mysql-20261023-144631-d78c1bb2.json');
 const latestSource='docs/evidence/a-writer-fk-final-20261023-145605-7d41cb5f-source.json';
 const latestSeed='docs/evidence/a-writer-fk-final-20261023-145605-7d41cb5f-seed.jsonl';
 const prefix=path.resolve('docs/evidence/d-resources-mysql-00000000-000000-'+crypto.randomBytes(4).toString('hex'));
 const files=[];
 const put=(p,b)=>{fs.writeFileSync(p,b,{flag:'wx'});files.push(p);};
 try{
  const source=decode(latestSource),capsule=fs.readFileSync('backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json');
  const catalog=/ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(fs.readFileSync('backend/internal/systembackupcontroller/bootstrap.go','utf8'))[1];
  const fixture={...prior,remote_requested:true,remote_scratch_removed:true,owner:receipt.owner,binary_sha256:hash,migration_binary_sha256:hash,inputs_sha256:sha(capsule),source:prefix+'-source.json'};
  fixture.steps=prior.steps.map((step,i)=>({...step,command:step.command.map(v=>v.startsWith(prior.owner)?v.replace(prior.owner,receipt.owner):v),log:prefix+'-step-'+i+'.jsonl'}));
  fixture.steps.forEach((step,i)=>{const bytes=fs.readFileSync(i===1?latestSeed:prior.steps[i].log);step.log_sha256=sha(bytes);put(step.log,bytes);});
  put(fixture.source,JSON.stringify(source));
  const capsuleObject=JSON.parse(capsule.toString('utf8'));
  const text=input().replace('catalog_sha256='+hash,'catalog_sha256='+catalog).replace('inputs_sha256='+hash,'inputs_sha256='+fixture.inputs_sha256)
   .replace('fresh-migration-replay=001..096 applied=96','fresh-migration-replay=001..'+capsuleObject.migrations.at(-1).name.split('_')[0]+' applied='+capsuleObject.migrations.length)
   .replace('migrations=96 tables=44','migrations='+capsuleObject.migrations.length+' tables=44');
  put(prefix+'.txt',text);put(prefix+'.json',JSON.stringify(fixture));
  const accepted=reviewFK(prefix+'.json');assert.equal(accepted.remote_cases,10);assert.equal(accepted.old_pass_events_preserved,843);assert.equal(accepted.production_approved,false);
  const original=fs.readFileSync(fixture.steps[0].log);
  fs.appendFileSync(fixture.steps[0].log,' ');assert.throws(()=>reviewFK(prefix+'.json'));fs.writeFileSync(fixture.steps[0].log,original);
  const seedBytes=fs.readFileSync(fixture.steps[1].log);
  const seedEvents=seedBytes.toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse).filter(e=>e.Test!=='TestAResourcesWriteFKMySQLSeed');
  const twoSeeds=Buffer.from(seedEvents.map(e=>JSON.stringify(e)).join('\n')+'\n');fs.writeFileSync(fixture.steps[1].log,twoSeeds);
  fixture.steps[1].log_sha256=sha(twoSeeds);fs.writeFileSync(prefix+'.json',JSON.stringify(fixture));assert.throws(()=>reviewFK(prefix+'.json'));
  fs.writeFileSync(fixture.steps[1].log,seedBytes);fixture.steps[1].log_sha256=sha(seedBytes);fs.writeFileSync(prefix+'.json',JSON.stringify(fixture));
  const changed=structuredClone(source);changed.files.find(p=>p.path.endsWith('/restore_write_fk_mysql_test.go')).sha256='0'.repeat(64);
  changed.source_sha256=sha(changed.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');fs.writeFileSync(fixture.source,JSON.stringify(changed));assert.throws(()=>reviewFK(prefix+'.json'));
  fs.writeFileSync(fixture.source,JSON.stringify(source));assert.equal(reviewFK(prefix+'.json').remote_cases,10);
 }finally{for(const file of files)fs.unlinkSync(file);for(const file of files)assert.equal(fs.existsSync(file),false);}
});
