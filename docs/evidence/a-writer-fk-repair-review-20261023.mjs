import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return {path:p,size:b.length,sha256:sha(b)};};
const events=p=>read(p).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const stem='docs/evidence/a-writer-fk-20261023-134215-75d1f525';
const r=json(stem+'.json'),source=json(stem+'-source.json');
assert.equal(r.kind,'a_writer_FK_regression_validation.v1');assert.equal(r.passed,true);assert.equal(r.error,null);
assert.equal(r.old_exit,1);assert.equal(r.fixed_exit,0);
for(const k of ['cleanup','frozen_and_current_postcheck','default_vet'])assert.equal(r[k],true);
for(const k of ['dependencies_installed','actual_MySQL','production_approved'])assert.equal(r[k],false);
assert.equal(path.dirname(r.owner),root);assert.match(path.basename(r.owner),/^\.tmp-a-writer-fk-[a-f0-9]{32}$/);assert.equal(fs.existsSync(r.owner),false);
assert.equal(source.inputs.length,43);assert.equal(new Set(source.inputs.map(p=>p.path)).size,43);
for(const p of source.inputs){const b=Buffer.from(p.bytes_base64,'base64');assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);if(process.argv.includes('--write')||process.argv.includes('--check-current'))assert.deepEqual(pin(p.path),{path:p.path,size:p.size,sha256:p.sha256});}
const beforeRoot='TestARestoreWriterReparentsBeforeParentDeletion';
const expectedFailures=[beforeRoot,...['items','reports','both','existing_parent'].map(s=>beforeRoot+'/'+s)].sort();
const old=events(stem+'-old.jsonl'),fixed=events(stem+'-fixed.jsonl');
assert.deepEqual(old.filter(e=>e.Action==='fail'&&e.Test).map(e=>e.Test).sort(),expectedFailures);
assert.deepEqual(r.original_failed_tests,expectedFailures);assert.equal(old.filter(e=>e.Action==='fail'&&!e.Test).length,1);
assert.equal(fixed.some(e=>['fail','skip','build-fail'].includes(e.Action)),false);
assert.equal(fixed.filter(e=>e.Action==='pass'&&!e.Test).length,1);assert.equal(fixed.at(-1).Action,'pass');
assert.equal(new Set(fixed.map(e=>e.Package)).size,1);
const passed=fixed.filter(e=>e.Action==='pass'&&e.Test),names=passed.map(e=>e.Test).sort();
assert.equal(names.length,843);assert.equal(new Set(names).size,843);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,71);
assert.equal(r.roots,71);assert.equal(r.pass_events,843);
assert.deepEqual(fixed.filter(e=>e.Action==='run'&&e.Test).map(e=>e.Test).sort(),names);
const priorStem='docs/evidence/d-resources-rules-local-d25149d0a27c4a7395680767a8f40802';
const prior=events(priorStem+'.jsonl').filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test);
assert.equal(prior.length,826);assert.ok(prior.every(n=>names.includes(n)));
const additions=names.filter(n=>!prior.includes(n));assert.equal(additions.length,17);
assert.ok(additions.every(n=>[beforeRoot,'TestARestoreWriterDeletesChildrenExplicitly','TestARestoreWriterReparentFailureRollsBack'].includes(n.split('/')[0])));
assert.equal(additions.filter(n=>n.startsWith(beforeRoot+'/')).length,4);
assert.equal(additions.filter(n=>n.startsWith('TestARestoreWriterReparentFailureRollsBack/')).length,10);
const writer='backend/internal/systembackupresources/restore_write.go';
const originalJSON=source.inputs.find(p=>p.path==='docs/evidence/a-writer-fk-original-20261023.json');
const original=JSON.parse(Buffer.from(originalJSON.bytes_base64,'base64').toString('utf8'));
const originalBytes=Buffer.from(original.bytes_base64,'base64');assert.equal(sha(originalBytes),original.sha256);assert.equal(originalBytes.length,original.size);
assert.equal(original.sha256,r.original_writer_sha256);assert.equal(source.inputs.find(p=>p.path===writer).sha256,r.fixed_writer_sha256);
const priorSource=json(priorStem+'-source.json');
assert.equal(priorSource.inputs.find(p=>p.path===writer).sha256,original.sha256);
const changed=priorSource.inputs.filter(p=>source.inputs.find(q=>q.path===p.path)?.sha256!==p.sha256).map(p=>p.path);
assert.deepEqual(changed,[writer]);
// D's tagged writer fixture was added after the reference ordinary run and was
// already present before this repair. It is source-pinned, not compiled/run by
// the GO111MODULE=off ordinary test profile; no tagged coverage is inherited.
assert.deepEqual(source.inputs.filter(p=>!priorSource.inputs.some(q=>q.path===p.path)).map(p=>p.path).sort(),['backend/internal/systembackupresources/restore_write_fk_a_test.go','backend/internal/systembackupresources/restore_write_mysql_test.go','docs/evidence/a-writer-fk-original-20261023.json','docs/evidence/a-writer-fk-validation-20261023.ps1'].sort());
const result={kind:'a_writer_FK_repair_acceptance.v1',date:'2026-10-23',status:'declared_scan_job_FK_reparenting_repaired_and_complete_offline_package_verified',finding:'A-WRITER-FK-01',frozen_inputs:43,old_failure_leaves:4,old_failure_root:true,roots:71,pass_events:843,prior_pass_names_preserved:826,added_Go_test_events:17,fault_leaves:10,original_writer_sha256:original.sha256,fixed_writer_sha256:r.fixed_writer_sha256,default_vet:true,frozen_and_current_postcheck:true,owner_independently_absent:true,dependencies_installed:false,tagged_writer_compiled_or_run:false,actual_MySQL:false,real_FK_server_observation_pending:true,B_C_domain_rules_approved:false,generic_FK_UNIQUE_planner:false,production_approved:false,scope:'migration-063 job_id CASCADE relations only; synthetic driver calls actual Go writer; per-side row budgets unchanged, physical reservation must account for parent overlap',inputs:[stem+'.json',stem+'-source.json',stem+'-old.jsonl',stem+'-fixed.jsonl',priorStem+'.jsonl',priorStem+'-source.json','docs/evidence/a-writer-fk-repair-review-20261023.mjs'].map(pin)};
const output='docs/evidence/a-writer-fk-repair-accepted-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_WRITER_FK_REPAIR roots=71 events=843 prior=826 old_failed_leaves=4 cleanup=yes actual_MySQL=no');
