import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix=process.argv[2];
assert.match(prefix??'',/^d-download-result-retention-packages-20261019-r\d+$/);
const rel='docs/evidence/'+prefix;
const bytes=p=>fs.readFileSync(path.join(root,p));
const text=p=>bytes(p).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=json(rel+'-source.json'),native=text(rel+'-native.txt');
assert.equal(manifest.stable_copy_verified,true);
assert.equal(manifest.dependencies_installed,false);
assert.equal(sha(Buffer.from(manifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),manifest.source_sha256);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/internal\/systembackupproducer,\.\/cmd\/server default_vet=yes/);
assert.match(native,/NATIVE_TIME_BUDGET package_timeout_seconds=900 request_deadlines_unchanged=yes/);
assert.match(native,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native,/CLEANED snapshot=True/);
assert.match(native,/d_admission_native_exit=0/);
assert.equal(bytes(rel+'-stderr.txt').length,0);
const events=text(rel+'.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(events.filter(e=>['fail','build-fail','skip'].includes(e.Action)).length,0);
const expectedPackages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer','clawreef/cmd/server'];
const packages=expectedPackages.map(pkg=>{
  const ends=events.filter(e=>e.Package===pkg&&!e.Test&&['pass','fail'].includes(e.Action));
  assert.equal(ends.length,1,pkg);assert.equal(ends[0].Action,'pass');
  const pass=events.filter(e=>e.Package===pkg&&e.Action==='pass'&&e.Test);
  assert.equal(pass.length,new Set(pass.map(e=>e.Test)).size);
  for(const p of pass)assert.equal(events.filter(e=>e.Package===pkg&&e.Test===p.Test&&e.Action==='run').length,1,p.Test);
  return {package:pkg,main:pass.filter(e=>!e.Test.includes('/')).length,all:pass.length};
});
const newRoots=[...text('backend/internal/systembackupevidence/download_result_retention_test.go').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]);
assert.equal(newRoots.length,4);
const newPass=events.filter(e=>e.Package==='clawreef/internal/systembackupevidence'&&e.Action==='pass'&&e.Test&&newRoots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
for(const r of newRoots)assert.equal(newPass.filter(e=>e.Test===r).length,1,r);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  assert.ok(native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`),stage);
  assert.equal(bytes(`${rel}-${stage}-stderr.txt`).length,0,stage);
}
const seedEvents=text(rel+'-tagged-seed.txt').trim().split('\n').map(JSON.parse);
assert.equal(seedEvents.filter(e=>['fail','build-fail','skip'].includes(e.Action)).length,0);
const seedPass=seedEvents.filter(e=>e.Test&&e.Action==='pass');
assert.equal(seedPass.filter(e=>!e.Test.includes('/')).length,2);
for(const r of ['TestADownloadAdmissionMySQLSeed','TestASensitiveDownloadMFAMySQLSeed'])assert.equal(seedPass.filter(e=>e.Test===r).length,1);
const detached=text(rel+'-detached-seed.txt');
assert.equal((detached.match(/--- PASS: /g)??[]).length,seedPass.length);
assert.match(detached,/(?:^|\n)PASS\n?$/);
const binaries=[...native.matchAll(/NATIVE_PROBE_BINARY name=([^\n ]+) sha256=([a-f0-9]{64})/g)].map(m=>({name:m[1],sha256:m[2]}));
assert.equal(binaries.length,3);
const capsule=json('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');
assert.equal(sha(Buffer.from(text('docs/system-backup-d-download-admission-schema-proposal-20261019.sql'))),capsule.ownership_sha256);
assert.equal(capsule.ownership_ddl,text('docs/system-backup-d-download-admission-schema-proposal-20261019.sql'));
assert.equal(capsule.migration_files.length,95);
const phase=text('scripts/system-backup-a-download-admission-phase.sh');
assert.ok(phase.includes('-test.run "^Test(ADownloadAdmissionMySQL|DDownloadResultRetentionMySQL)$"'));
assert.ok(phase.includes('new_cases=13 result_retention_cases=8'));
const actualSQLSource=text('backend/internal/systembackupevidence/download_result_retention_mysql_test.go');
assert.match(actualSQLSource,/^\/\/go:build systembackup_mysql/);
const actualSQLCases=[...actualSQLSource.match(/for _, name := range \[\]string\{([^}]+)\}/)[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);
assert.equal(actualSQLCases.length,8);assert.equal(new Set(actualSQLCases).size,8);
const exempt=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const include=p=>(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/i.test(p)||exempt.has(p))&&!/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i.test(p)&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(p);
// rg is invoked by the terminal immediately before this review. Windows
// sandbox denies node child_process spawn (EPERM), so no subprocess fallback.
const currentList=text(rel+'-current-files.txt');
const current=new Set(currentList.trim().split('\n').map(p=>p.replaceAll('\\','/')).filter(include));
const expected=new Set(manifest.files.map(f=>f.path)),drift=[];
for(const p of current)if(!expected.has(p))drift.push({path:p,reason:'new'});
for(const pin of manifest.files){
  const p=path.resolve(root,pin.path);assert.ok(p.startsWith(root+path.sep));
  if(!current.has(pin.path)||!fs.existsSync(p)){drift.push({path:pin.path,reason:'missing'});continue;}
  const b=fs.readFileSync(p),currentHash=sha(b);if(b.length!==pin.size||currentHash!==pin.sha256)drift.push({path:pin.path,reason:'changed',frozen_sha256:pin.sha256,current_sha256:currentHash,frozen_size:pin.size,current_size:b.length});
}
const cleanup=json('docs/evidence/d-download-result-retention-cleanup-20261019.json');
assert.equal(cleanup.all_absent,true);
for(const d of cleanup.directories){assert.equal(path.dirname(d.path).toLowerCase(),root.toLowerCase());assert.equal(d.exists,false);assert.equal(fs.existsSync(d.path),false);}
const attempts=cleanup.runs.map(run=>{
  const p='docs/evidence/'+run,log=text(p+'-native.txt');
  assert.match(log,/CLEANED snapshot=True/);
  const exit=Number(log.match(/d_admission_native_exit=(\d+)/)[1]);
  return {prefix:run,exit,source_sha256:json(p+'-source.json').source_sha256,log_sha256:sha(bytes(p+'.jsonl'))};
});
assert.ok(attempts.some(a=>a.prefix===prefix&&a.exit===0));
const result={kind:'d_download_result_retention_frozen_review',prefix,source_files:manifest.files.length,source_sha256:manifest.source_sha256,
  frozen_validation_passed:true,
  packages,main:packages.reduce((n,p)=>n+p.main,0),all:packages.reduce((n,p)=>n+p.all,0),new_roots:newRoots,new_all:newPass.length,
  tagged_seed_main:2,tagged_seed_all:seedPass.length,detached_seed_all:seedPass.length,probe_binaries:binaries,
  actual_mysql_result_retention_cases_prepared:actualSQLCases,actual_mysql_admission_cases_prepared:13,
  ownership_sha256:capsule.ownership_sha256,catalog_sha256:capsule.catalog_sha256,current_source_drift:drift,current_sources_match:drift.length===0,
  current_inputs_except_remote_driver_match:drift.every(d=>d.path==='scripts/system-backup-fresh-migration-smoke.sh'&&d.reason==='changed'),
  current_file_list_sha256:sha(bytes(rel+'-current-files.txt')),
  cleanup:cleanup.directories,attempts,dependencies_installed:false,actual_mysql:false,formal_schema_or_grants_installed:false,
  production_main_enabled:false,retention_group_gc_implemented:false,current_server_rerun:true,original_six_scopes_complete:false,
  limitations:'Scripted SQL/rows/material/capacity plus real local HTTP/encryption code. Eight actual InnoDB result-retention leaves compiled, not executed. No deployed provider/physical capacity, reviewed grants/group GC, other owner bindings, production assembly, historical activation or original six-scope completion.'};
fs.writeFileSync(path.join(root,rel+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main:result.main,all:result.all,new_all:newPass.length,seed:seedPass.length,source_files:manifest.files.length,drift,cleaned:cleanup.directories.length}));
if(drift.length)process.exitCode=1;
