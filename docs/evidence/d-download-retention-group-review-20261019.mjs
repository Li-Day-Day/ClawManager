import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='d-download-retention-group-packages-20261019-r52',rel='docs/evidence/'+prefix;
const bytes=p=>fs.readFileSync(path.join(root,p));
const text=p=>bytes(p).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const m=json(rel+'-source.json'),native=text(rel+'-native.txt');
assert.equal(m.stable_copy_verified,true);assert.equal(m.dependencies_installed,false);
assert.equal(sha(Buffer.from(m.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),m.source_sha256);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/internal\/systembackupproducer default_vet=yes/);
assert.match(native,/NATIVE_TIME_BUDGET package_timeout_seconds=900 request_deadlines_unchanged=yes/);
assert.match(native,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native,/CLEANED snapshot=True/);assert.match(native,/d_admission_native_exit=0/);
assert.equal(bytes(rel+'-stderr.txt').length,0);
const events=text(rel+'.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(events.filter(e=>['skip','fail','build-fail'].includes(e.Action)).length,0);
const packages=['security','evidence','read','producer'].map(s=>{
  const pkg='clawreef/internal/systembackup'+s;
  const ends=events.filter(e=>e.Package===pkg&&!e.Test&&['pass','fail'].includes(e.Action));assert.equal(ends.length,1);assert.equal(ends[0].Action,'pass');
  const tests=events.filter(e=>e.Package===pkg&&e.Test&&e.Action==='pass');assert.equal(tests.length,new Set(tests.map(e=>e.Test)).size);
  for(const test of tests)assert.equal(events.filter(e=>e.Package===pkg&&e.Test===test.Test&&e.Action==='run').length,1,test.Test);
  return {package:pkg,main:tests.filter(e=>!e.Test.includes('/')).length,all:tests.length};
});
const roots=[...text('backend/internal/systembackupevidence/download_retention_group_test.go').matchAll(/^func (TestDownloadRetentionGroup\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]);assert.equal(roots.length,7);
const newPass=events.filter(e=>e.Package==='clawreef/internal/systembackupevidence'&&e.Action==='pass'&&e.Test&&roots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
for(const r of roots)assert.equal(newPass.filter(e=>e.Test===r).length,1,r);
assert.equal(newPass.length,109);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  assert.ok(native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));assert.equal(bytes(`${rel}-${stage}-stderr.txt`).length,0);
}
const seed=text(rel+'-tagged-seed.txt').trim().split('\n').map(JSON.parse);
assert.equal(seed.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const seedPass=seed.filter(e=>e.Action==='pass'&&e.Test);assert.equal(seedPass.length,12);assert.equal(seedPass.filter(e=>!e.Test.includes('/')).length,2);
assert.equal((text(rel+'-detached-seed.txt').match(/--- PASS: /g)||[]).length,12);assert.match(text(rel+'-detached-seed.txt'),/(?:^|\n)PASS\n?$/);
const binaries=[...native.matchAll(/NATIVE_PROBE_BINARY name=([^\n ]+) sha256=([a-f0-9]{64})/g)].map(m=>({name:m[1],sha256:m[2]}));assert.equal(binaries.length,3);
const capsule=json('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');assert.equal(capsule.ownership_ddl,text('docs/system-backup-d-download-admission-schema-proposal-20261019.sql'));assert.equal(sha(Buffer.from(capsule.ownership_ddl)),capsule.ownership_sha256);assert.equal(capsule.migration_files.length,95);
const actualSQL=text('backend/internal/systembackupevidence/download_result_retention_mysql_test.go');assert.match(actualSQL,/^\/\/go:build systembackup_mysql/);
const cases=[...actualSQL.match(/for _, name := range \[\]string\{([^}]+)\}/)[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);assert.equal(cases.length,11);assert.equal(new Set(cases).size,11);
const phase=text('scripts/system-backup-a-download-admission-phase.sh');assert.ok(phase.includes('-test.run "^Test(ADownloadAdmissionMySQL|DDownloadResultRetentionMySQL)$"'));assert.ok(phase.includes('new_cases=13 result_retention_cases=11'));
const cleanup=json('docs/evidence/d-download-retention-group-cleanup-20261019.json');assert.equal(cleanup.all_absent,true);
for(const d of cleanup.directories){assert.equal(path.dirname(d.path).toLowerCase(),root.toLowerCase());assert.equal(d.exists,false);assert.equal(fs.existsSync(d.path),false);}
const attempts=cleanup.runs.map(run=>{const p='docs/evidence/'+run,log=text(p+'-native.txt');assert.match(log,/CLEANED snapshot=True/);return {prefix:run,exit:Number(log.match(/d_admission_native_exit=(\d+)/)[1]),source_sha256:json(p+'-source.json').source_sha256,raw_go_sha256:sha(bytes(p+'.jsonl'))};});
assert.deepEqual(attempts.map(a=>a.exit),[1,0,1,0,0]);
const windowsFailure=text('docs/evidence/d-download-retention-group-packages-20261019-r50.jsonl').trim().split('\n').map(JSON.parse);
assert.ok(windowsFailure.some(e=>e.Action==='build-output'&&e.Output?.includes('compile.exe: exit status 0xc0000043')));
assert.equal(windowsFailure.filter(e=>e.Action==='fail'&&e.Test).length,0);
const failed=text('docs/evidence/d-download-retention-group-focused-20261019-r48.jsonl').trim().split('\n').map(JSON.parse).filter(e=>e.Action==='fail'&&e.Test).map(e=>e.Test).sort();assert.deepEqual(failed,['TestDownloadRetentionGroupReconstructsWithoutOriginalCapability','TestDownloadRetentionGroupReconstructsWithoutOriginalCapability/expired_original_authority']);
const focused=json('docs/evidence/d-download-retention-group-focused-20261019-r49-source.json');
const priorFull=json('docs/evidence/d-download-retention-group-packages-20261019-r51-source.json');assert.equal(focused.source_sha256,priorFull.source_sha256);
const focusedPins=new Map(focused.files.map(f=>[f.path,f]));
const subsequentInputs=m.files.filter(f=>focusedPins.get(f.path)?.sha256!==f.sha256).map(f=>f.path);
assert.equal(focused.files.length,m.files.length);assert.deepEqual(subsequentInputs,['backend/internal/systembackupevidence/download_retention_group_test.go']);
const exempt=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const include=p=>(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/i.test(p)||exempt.has(p))&&!/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i.test(p)&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(p);
const current=new Set(text(rel+'-current-files.txt').trim().split('\n').map(p=>p.replaceAll('\\','/')).filter(include));
const expected=new Set(m.files.map(f=>f.path)),drift=[];
for(const p of current)if(!expected.has(p))drift.push({path:p,reason:'new'});
for(const pin of m.files){const p=path.resolve(root,pin.path);assert.ok(p.startsWith(root+path.sep));if(!current.has(pin.path)||!fs.existsSync(p)){drift.push({path:pin.path,reason:'missing'});continue;}const b=fs.readFileSync(p);if(b.length!==pin.size||sha(b)!==pin.sha256)drift.push({path:pin.path,reason:'changed',frozen_sha256:pin.sha256,current_sha256:sha(b)});}
const result={kind:'d_download_retention_group_frozen_review',prefix,frozen_validation_passed:true,source_files:m.files.length,source_sha256:m.source_sha256,packages,main:packages.reduce((n,p)=>n+p.main,0),all:packages.reduce((n,p)=>n+p.all,0),new_roots:roots,new_all:newPass.length,
  seed_main:2,seed_all:12,detached_seed_all:12,binaries,actual_sql_cases_prepared:cases,admission_cases_prepared:13,actual_sql_prepared_total:24,ownership_sha256:capsule.ownership_sha256,catalog_sha256:capsule.catalog_sha256,cleanup:cleanup.directories,attempts,current_source_drift:drift,current_sources_match:drift.length===0,
  post_r51_input_changes:subsequentInputs,post_r51_change_reason:'Three SQL-driver test callback parse/encode failure branches record Error and return instead of Goexit while database/sql holds its connection lock. Current complete packages/seed/probes rerun; production inputs unchanged.',
  dependencies_installed:false,new_retention_group_actual_mysql_executed:false,current_server_rerun:false,production_enabled:false,formal_schema_or_grants_installed:false,group_gc_delete_implemented:false,original_six_scopes_complete:false,
  separate_mfa_mysql_acceptance:'docs/evidence/d-download-mfa-actual-accepted-20261019.json',limitations:'Bounded persisted group reconstruction and result transaction checks on scripted SQL/rows/materials/capacity. Eleven result/group InnoDB leaves compiled, not executed; old MFA nine is separately accepted only for its frozen issuance scope. No group deletion/tombstone/grants/physical capacity, other owner binding, production assembly, historical activation or full original six-scope completion.'};
fs.writeFileSync(path.join(root,rel+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main:result.main,all:result.all,new_main:roots.length,new_all:newPass.length,seed:12,source_files:m.files.length,drift,cleaned:cleanup.directories.length}));
if(drift.length)process.exitCode=1;
