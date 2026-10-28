// Combine unchanged ordinary inputs with the independently finished latest
// tagged compile/seed run. This never receives actual MySQL or domain approval.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateGoEvents,validateManifest} from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const stem='docs/evidence/a-writer-fk-final-20261023-145605-7d41cb5f';
const r=json(stem+'.json'),source=json(r.source);
assert.equal(r.kind,'a_resources_latest_tagged_preparation.v1');assert.equal(r.error,null);
for(const key of ['ordinary_inputs_unchanged','latest_tagged_source_postchecked','owner_removed','default_vet'])assert.equal(r[key],true,key);
for(const key of ['dependencies_installed','actual_mysql','production_approved'])assert.equal(r[key],false,key);
assert.equal(path.dirname(r.owner),root);assert.match(path.basename(r.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(r.owner),false);
assert.match(r.binary_sha256,/^[a-f0-9]{64}$/);validateManifest(source);
assert.deepEqual(r.steps.map(s=>[s.stage,s.exit]),[['latest_tagged_seeds_default_vet',0],['latest_linux_tagged_probe',0]]);
assert.equal(sha(read(r.steps[0].log)),r.steps[0].sha256);
const seedNames=validateGoEvents(read(r.steps[0].log).toString('utf8'));
assert.deepEqual(seedNames,['TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed']);
assert.equal(sha(read(r.prior_complete_preparation)),r.prior_receipt_sha256);
const prior=json(r.prior_complete_preparation),old=json(prior.source);validateManifest(old);
assert.equal(prior.error,null);assert.equal(prior.remote_requested,false);assert.equal(prior.owner_removed,true);assert.equal(fs.existsSync(prior.owner),false);assert.equal(prior.steps.length,4);
for(const step of prior.steps){assert.equal(step.exit_code,0);assert.equal(sha(read(step.log)),step.log_sha256);}
const names=validateGoEvents(read(prior.steps[0].log).toString('utf8'));
const baseline='docs/evidence/a-writer-fk-20261023-134215-75d1f525-fixed.jsonl',baselineBytes=read(baseline);
assert.equal(sha(baselineBytes),'53900185217d620cc37a4839fcc524e685274d912f7172134298427c38585a83');
const original=validateGoEvents(baselineBytes.toString('utf8'),JSON.parse(baselineBytes.toString('utf8').split(/\r?\n/)[0]).Package);
assert.equal(original.length,843);assert.deepEqual(names,original);
const ordinary=s=>s.files.filter(p=>/^(backend|contracts)\//.test(p.path)&&!p.path.endsWith('_mysql_test.go')).map(p=>`${p.path}\0${p.size}\0${p.sha256}`).sort();
assert.deepEqual(ordinary(source),ordinary(old),'ordinary inputs changed');
const selected=p=>/^(backend|contracts)\//.test(p)||['scripts/system-backup-a-writer-fk-final-validation.ps1','scripts/system-backup-d-resources-mysql-validation.ps1','scripts/system-backup-d-resources-readback-phase.sh','scripts/system-backup-d-resources-mysql-inputs.mjs','scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-config-proof-source.ps1'].includes(p);
const inputs=source.files.filter(p=>selected(p.path));
for(const p of inputs)assert.deepEqual(pin(p.path),p,'current selected input drift '+p.path);
const fixture='backend/internal/systembackupresources/restore_write_fk_mysql_test.go',code=read(fixture).toString('utf8');
for(const token of ['SELECT @@session.foreign_key_checks','me.Number != 1452','me.Number != 1062','FK_SCHEMA canonical_and_owned=matched','PASS a-resources-write-fk-mysql cases=10'])assert.ok(code.includes(token));
const report={kind:'a_writer_fk_latest_local_preparation_acceptance.v1',status:'latest_FK_seed_and_linux_probe_accepted_actual_MySQL_pending',ordinary_roots:names.filter(n=>!n.includes('/')).length,ordinary_pass_events:names.length,all_prior_names_preserved:true,ordinary_inputs_unchanged:true,seed_names:seedNames,latest_linux_probe_sha256:r.binary_sha256,source_sha256:source.source_sha256,current_selected_pins_match:true,latest_tagged_source:fixture,cleanup_owners_independently_absent:[r.owner,prior.owner],default_vet:true,dependencies_installed:false,actual_mysql:false,generic_FK_UNIQUE_accepted:false,B_C_rules_accepted:false,physical_capacity_accepted:false,production_approved:false,inputs,evidence:[stem+'.json',r.source,r.steps[0].log,r.prior_complete_preparation,prior.source,...prior.steps.map(s=>s.log),baseline,'docs/evidence/a-resources-writer-fk-receiver-tests-20261023-r1-failed.txt','docs/evidence/a-resources-writer-fk-receiver-tests-20261023-r2.txt','docs/evidence/a-resources-writer-receiver-tests-20261023.txt','docs/evidence/a-readback-receiver-compatibility-20261023.txt','docs/evidence/a-writer-fk-final-review-20261023.mjs'].map(p=>pin(path.relative(root,path.resolve(root,p)).replaceAll('\\','/')))};
const output='docs/evidence/a-writer-fk-final-accepted-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),report);}
console.log('A_WRITER_FK_FINAL_ACCEPTED ordinary='+names.length+' seeds=3 linux=yes cleanup=yes actual_mysql=no');
