import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='d-download-producer-packages-20261020-r59',rel='docs/evidence/'+prefix;
const bytes=p=>fs.readFileSync(path.join(root,p));
const text=p=>bytes(p).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const events=p=>text(p).trim().split('\n').map(JSON.parse);
const manifest=json(rel+'-source.json'),native=text(rel+'-native.txt');
assert.equal(manifest.stable_copy_verified,true);assert.equal(manifest.dependencies_installed,false);
assert.equal(sha(Buffer.from(manifest.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')),manifest.source_sha256);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/internal\/systembackupproducer,\.\/cmd\/server default_vet=yes/);
for(const marker of ['FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no','FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no','CLEANED snapshot=True','d_admission_native_exit=0'])assert.ok(native.includes(marker),marker);
assert.equal(bytes(rel+'-stderr.txt').length,0);
function verifyEvents(es,pkgs){
  assert.deepEqual(es.filter(e=>['fail','skip','build-fail'].includes(e.Action)),[]);
  const runs=new Map(),passes=new Map();
  for(const e of es){if(!e.Test)continue;const key=e.Package+'\0'+e.Test;if(e.Action==='run')runs.set(key,(runs.get(key)||0)+1);if(e.Action==='pass')passes.set(key,(passes.get(key)||0)+1);}
  for(const [key,n] of passes){assert.equal(n,1,key);assert.equal(runs.get(key),1,key);}
  return pkgs.map(pkg=>{
    assert.equal(es.filter(e=>e.Package===pkg&&!e.Test&&e.Action==='pass').length,1,pkg);
    const ts=es.filter(e=>e.Package===pkg&&e.Test&&e.Action==='pass');assert.ok(ts.length>0,pkg);
    return {package:pkg,main:ts.filter(e=>!e.Test.includes('/')).length,all:ts.length};
  });
}
const packages=verifyEvents(events(rel+'.jsonl'),['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer','clawreef/cmd/server']);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  assert.ok(native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));assert.equal(bytes(`${rel}-${stage}-stderr.txt`).length,0);
}
const seed=verifyEvents(events(rel+'-tagged-seed.txt'),['clawreef/internal/systembackupevidence']);
assert.equal(seed[0].main,3);assert.equal(seed[0].all,22);
assert.equal((text(rel+'-detached-seed.txt').match(/--- PASS: /g)||[]).length,22);
assert.match(text(rel+'-detached-seed.txt'),/(?:^|\n)PASS\n?$/);
const binaries=[...native.matchAll(/NATIVE_PROBE_BINARY name=([^\n ]+) sha256=([a-f0-9]{64})/g)].map(m=>({name:m[1],sha256:m[2]}));assert.equal(binaries.length,3);
const capsulePath='backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json';
assert.equal(sha(bytes(capsulePath)),'a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0');
const capsule=json(capsulePath);assert.equal(sha(Buffer.from(capsule.admission_inputs)),capsule.admission_sha256);assert.equal(capsule.admission_sha256,'c76f218ff8e440707249ec829401514da1def8305a8778fe22a89ea499b54b0f');
assert.equal(capsule.kind,'d_download_producer_probe_inputs.v2');
assert.deepEqual(capsule.capability_evidence,json('contracts/system-backup/v12/a-owned-redacted-examples.json').capability_evidence);
assert.equal(Buffer.from(capsule.admission_inputs).compare(bytes('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json')),0);
assert.equal(sha(Buffer.from(capsule.producer_ddl)),capsule.producer_ddl_sha256);
assert.equal(capsule.producer_ddl,text('contracts/system-backup/v12/producer-authority-candidate.sql'));
const base=JSON.parse(capsule.admission_inputs);assert.equal(base.migration_files.length,95);
const source=text('backend/internal/systembackupevidence/download_producer_owner_mysql_test.go');
const actualBody=source.slice(source.indexOf('func TestDProducerDownloadOwnersMySQL(t *testing.T)'));
const cases=[...actualBody.match(/for _, mode := range \[\]string\{([^}]+)\}/)[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);assert.equal(cases.length,18);assert.equal(new Set(cases).size,18);
const phase=text('scripts/system-backup-d-download-producer-phase.sh');assert.ok(phase.includes('-test.run "^TestDProducerDownloadOwnersMySQL$"'));assert.ok(phase.includes('new_cases=18 owner_adapter=SQLDownloadOwners'));
const failed55=events('docs/evidence/d-download-producer-seed-20261019-r55.jsonl');
assert.deepEqual(failed55.filter(e=>e.Action==='fail'&&e.Test).map(e=>e.Test).sort(),['TestDProducerDownloadOwnersMySQLSeed','TestDProducerDownloadOwnersMySQLSeed/actual_scope_projections_encrypted_object']);
const failed56=events('docs/evidence/d-download-producer-seed-20261019-r56.jsonl');
assert.equal(failed56.filter(e=>e.Test&&['run','pass','fail'].includes(e.Action)).length,0);
assert.ok(failed56.some(e=>e.Output?.includes('compile.exe: exit status 0xc000026b')));assert.ok(failed56.some(e=>e.Output?.includes('vet.exe: exit status 0xc000026b')));
const source56=json('docs/evidence/d-download-producer-seed-20261019-r56-source.json');
const source57=json('docs/evidence/d-download-producer-packages-20261020-r57-source.json');
const source58=json('docs/evidence/d-download-producer-packages-20261020-r58-source.json');
assert.equal(source56.source_sha256,source57.source_sha256);assert.equal(source57.source_sha256,source58.source_sha256);
const failed57=events('docs/evidence/d-download-producer-packages-20261020-r57.jsonl');assert.equal(failed57.filter(e=>e.Test&&e.Action==='fail').length,0);assert.ok(failed57.some(e=>e.Output?.includes('vet.exe: exit status 0xc0000043')));
const packages58=verifyEvents(events('docs/evidence/d-download-producer-packages-20261020-r58.jsonl'),packages.map(p=>p.package));assert.deepEqual(packages58,packages);
const detached58=text('docs/evidence/d-download-producer-packages-20261020-r58-detached-seed.txt');
assert.ok(detached58.includes('a-owned-redacted-examples.json'));assert.deepEqual([...detached58.matchAll(/--- FAIL: ([^\s(]+)/g)].map(m=>m[1]).sort(),['TestDProducerDownloadOwnersMySQLSeed','TestDProducerDownloadOwnersMySQLSeed/actual_scope_projections_encrypted_object']);
const pins58=new Map(source58.files.map(p=>[p.path,p]));assert.equal(source58.files.length,manifest.files.length);
const changedSince58=manifest.files.filter(p=>pins58.get(p.path)?.sha256!==p.sha256).map(p=>p.path);
assert.deepEqual(changedSince58,['backend/internal/systembackupevidence/download_producer_owner_mysql_test.go','backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json','scripts/system-backup-d-download-admission-native-validation.ps1','scripts/system-backup-d-download-producer-dispatch.test.ps1','scripts/system-backup-d-download-producer-inputs.mjs']);
const interrupted=json('docs/evidence/d-download-producer-interrupted-r56-cleanup-20261020.json');assert.equal(interrupted.full_source_postcheck_pass,false);assert.equal(interrupted.exists,false);assert.equal(interrupted.remaining_manifest_files_byte_pins_match+interrupted.missing_manifest_files.length,manifest.files.length);
const cleanup=json('docs/evidence/d-download-producer-cleanup-20261020.json');assert.equal(cleanup.all_absent,true);assert.equal(cleanup.directories.length,6);
for(const dir of cleanup.directories){assert.equal(path.dirname(dir.path).toLowerCase(),root.toLowerCase());assert.equal(dir.exists,false);assert.equal(fs.existsSync(dir.path),false);}
const exempt=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const currentFiles=text(rel+'-current-files.txt').trim().split('\n').map(p=>p.replaceAll('\\','/')).filter(p=>(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(p)||exempt.has(p))&&!/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p)&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p));
const pins=new Map(manifest.files.map(p=>[p.path,p])),currentSet=new Set(currentFiles);
const added=currentFiles.filter(p=>!pins.has(p)).map(p=>({path:p,current_sha256:sha(bytes(p)),kind:'added_not_validated'}));
const drift=[...added];
for(const pin of manifest.files){
  if(!currentSet.has(pin.path)||!fs.existsSync(path.join(root,pin.path))){drift.push({path:pin.path,kind:'removed_not_validated'});continue;}
  const actual=bytes(pin.path),digest=sha(actual);
  if(actual.length!==pin.size||digest!==pin.sha256)drift.push({path:pin.path,kind:'changed_not_validated',frozen_sha256:pin.sha256,current_sha256:digest});
}
// A frozen successful candidate remains a scoped result. Concurrent additions
// are reported, never exempted or called current-source validation. Only the
// prepared probe/payload/dispatch inputs are required to retain these exact pins.
const preparedInputs=['backend/internal/systembackupevidence/download_producer_owner_mysql_test.go','backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-download-producer-phase.sh','scripts/system-backup-d-download-producer-inputs.mjs','scripts/system-backup-d-download-producer-dispatch.test.ps1'];
for(const p of preparedInputs){assert.equal(sha(bytes(p)),pins.get(p).sha256,p);assert.equal(bytes(p).length,pins.get(p).size,p);}
const result={kind:'d_producer_download_local_preparation_review',prefix,frozen_validation_passed:true,source_files:manifest.files.length,source_sha256:manifest.source_sha256,current_source_drift:drift,current_sources_match:drift.length===0,prepared_probe_payload_and_dispatch_pins_match:true,packages,main:packages.reduce((n,p)=>n+p.main,0),all:packages.reduce((n,p)=>n+p.all,0),seed_main:3,seed_all:22,detached_seed_all:22,binaries,actual_sql_cases_prepared:cases,actual_producer_mysql_executed:false,cleanup:cleanup.directories,failed_seed_r55_preserved:true,interrupted_r56_preserved:true,r56_full_frozen_postcheck_not_claimed:true,failed_vet_r57_preserved:true,failed_detached_r58_preserved:true,changed_since_r58:changedSince58,producer_probe_capsule_kind:capsule.kind,dependencies_installed:false,remote_executed_by_d:false,formal_catalog_files:95,formal_migrations_or_grants_installed:false,production_enabled:false,provider_transport:'synthetic',physical_capacity_or_personal_mfa_proved:false,full_gc_or_tombstone_implemented:false,original_six_scopes_complete:false};
fs.writeFileSync(path.join(root,rel+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main:result.main,all:result.all,seed:22,source_files:manifest.files.length,actual_cases_prepared:18,cleaned:6,actual_mysql:false,frozen_validation_passed:true,current_drift:drift.map(p=>p.path)}));
if(drift.length)process.exitCode=1;
