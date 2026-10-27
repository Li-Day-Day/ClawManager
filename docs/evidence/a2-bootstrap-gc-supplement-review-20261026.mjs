import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0,'Expected --write or --check');
const run='2775832f44dc48d28bc8c68c88c74d4b';
const prefix='docs/evidence/d-gc-full-supplement-'+run;
const output='docs/evidence/a2-bootstrap-gc-supplement-reviewed-20261026.json';
const root=process.cwd(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p),text=p=>read(p).toString('utf8').replace(/^\uFEFF/,''),json=p=>JSON.parse(text(p));
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const receipt=json(prefix+'.json');
assert.equal(receipt.kind,'d_gc_full_supplement_validation.v1');assert.equal(receipt.error,null);
for(const k of ['frozen_inputs_stable','owner_removed','staging_cleanup_requested','staging_owner_removed','binary_removed'])assert.equal(receipt[k],true,k);
for(const k of ['dependencies_installed','actual_mysql','production_approved'])assert.equal(receipt[k],false,k);
assert.equal(receipt.bootstrap_original_local_seed_only,true);assert.equal(receipt.bootstrap_actual_cases_executed,0);
const source=json(prefix+'-source.json');
assert.equal(path.resolve(receipt.source_manifest),path.resolve(prefix+'-source.json'));
assert.equal(source.kind,'d_gc_full_frozen_source.v1');assert.equal(source.stable_copy_verified,true);
assert.equal(source.ordinary_backend_from_joint_only,true);assert.equal(source.dependencies_installed,false);
assert.equal(source.files.length,1679);
assert.equal(source.source_sha256,'aeb5bd66f14a8e081c177eb0d63ae77a0a4d32f8ae7e5f0a131e0d9b1c3966c3');
assert.deepEqual(source.files.map(p=>p.path),source.files.map(p=>p.path).toSorted());
assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
for(const p of source.files){
 assert.deepEqual(Object.keys(p).sort(),['path','sha256','size']);assert.match(p.path,/^(backend|contracts|scripts|docs)\//);
 assert.ok(!p.path.includes('\\')&&!p.path.split('/').some(s=>['..','.',''].includes(s)));
 assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);assert.match(p.sha256,/^[a-f0-9]{64}$/);
}
assert.equal(sha(Buffer.from(source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n')),source.source_sha256);
const sourceMap=new Map(source.files.map(p=>[p.path,p]));
const oldName='docs/evidence/d-bootstrap-consumer-native-a2e7cbc234ca4e0e9ea79ec7adce1f49.json';
const old=json(oldName);assert.equal(old.status,'failed');assert.equal(old.test_exit,1);assert.equal(old.snapshot_unchanged,undefined);
const oldMap=new Map(old.files.map(p=>[p.path,p]));
const originalTag='backend/internal/systembackupevidence/bootstrap_original_materials_mysql_test.go';
for(const p of old.files.filter(p=>p.path.startsWith('backend/')&&/\.(go|mod|sum)$/.test(p.path)))assert.ok(sourceMap.has(p.path),p.path);
const backendChanges=source.files.filter(p=>p.path.startsWith('backend/')&&(oldMap.get(p.path)?.sha256!==p.sha256||oldMap.get(p.path)?.size!==p.size));
assert.deepEqual(backendChanges,[{path:originalTag,size:25537,sha256:'19b1c83160c3cc93f707ed90dfbe06155e2ae6a5f04d727a8d1e3e97496ee2ad'}]);
const allowedScripts=new Set(['system-backup-a-evidence-validation.ps1','system-backup-d-config-writer-validation.ps1','system-backup-d-download-gc-full-profile-phase.sh','system-backup-d-download-gc-full-profile-dispatch.test.ps1','system-backup-d-download-gc-full-collect-phase.sh','system-backup-d-download-gc-full-collect-dispatch.test.ps1','system-backup-d-gc-full-collect-receiver.mjs','system-backup-d-gc-full-collect-receiver.test.mjs','system-backup-d-gc-full-profile-prepare.ps1','system-backup-d-gc-frozen-supplement-snapshot.mjs'].map(p=>'scripts/'+p));
for(const d of source.explicit_preparation_delta){assert.ok(d.path===originalTag||allowedScripts.has(d.path));assert.deepEqual(sourceMap.get(d.path),d.after);}
const fixtures=['docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/system-backup-d-config-maintenance-082-proposal-20261015.sql','docs/system-backup-d-admin-read-index-candidate-20261012.sql','docs/system-backup-d-download-admission-schema-proposal-20261019.sql'];
for(const p of fixtures)assert.deepEqual(sourceMap.get(p),oldMap.get(p),p);
const ev='clawreef/internal/systembackupevidence',md='clawreef/internal/systembackupgcmetadata';
function native(log,packages){
 const es=text(log).trimEnd().split(/\r?\n/).map(JSON.parse);
 assert.equal(es.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
 const key=e=>e.Package+'\0'+e.Test;
 const ran=es.filter(e=>e.Action==='run'&&e.Test).map(key).sort(),passed=es.filter(e=>e.Action==='pass'&&e.Test).map(key).sort();
 assert.equal(new Set(ran).size,ran.length);assert.deepEqual(ran,passed);
 assert.deepEqual(es.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package).sort(),[...packages].sort());
 assert.equal(es.at(-1).Action,'pass');assert.equal(es.at(-1).Test,undefined);
 return{log:pin(log),roots:es.filter(e=>e.Action==='pass'&&e.Test&&!e.Test.includes('/')).map(key),names:passed,es};
}
const evidence=native(prefix+'-evidence.jsonl',[ev]),metadata=native(prefix+'-metadata.jsonl',[md]),seeds=native(prefix+'-seeds.jsonl',[ev]);
assert.equal(evidence.roots.length,399);assert.equal(evidence.names.length,3228);
assert.equal(metadata.roots.length,13);assert.equal(metadata.names.length,281);
assert.deepEqual(seeds.names.map(n=>n.split('\0')[1]),['TestDBootstrapOriginalMaterialsMySQLSeed','TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullProfileMySQLSeed']);
const seedOutput=seeds.es.filter(e=>e.Action==='output').map(e=>e.Output).join('');
assert.match(seedOutput,/ORIGINAL_PREPARE branch=physical tls_total=2 material_apis=real/);
assert.match(seedOutput,/nonce_material=actual_owned_bytes ca_tls=actual_loopback handshakes=2 actual_mysql=not_run production=no/);
const previous=native('docs/evidence/d-gc-full-local-0f34460abce44e279a1f2c92d19bb11c-complete.jsonl',[ev,md]);
assert.equal(previous.names.length,3493);
const completeNames=new Set([...evidence.names,...metadata.names]);
for(const name of previous.names)assert.ok(completeNames.has(name),'Old accepted model missing: '+name);
const steps=['evidence','metadata','seeds','linux-tagged','linux-server','linux-bootstrap','linux-nonce','linux-ca'];
assert.deepEqual(receipt.steps.map(s=>s.name),steps);
const linux=[];
for(const s of receipt.steps){
 assert.equal(s.exit_code,0);assert.equal(path.resolve(s.log),path.resolve(prefix+'-'+s.name+'.jsonl'));
 if(s.name.startsWith('linux-')){assert.match(s.binary_sha256,/^[a-f0-9]{64}$/);assert.equal(read(s.log).length,0);linux.push({name:s.name,log:pin(prefix+'-'+s.name+'.jsonl'),runner_recorded_binary_sha256:s.binary_sha256});}
}
assert.equal(linux.length,5);assert.equal(receipt.linux_binary_sha256,linux[0].runner_recorded_binary_sha256);
const owners=[receipt.owner,receipt.staging_owner,path.resolve('.tmp-d-bootstrap-consumer-a2e7cbc234ca4e0e9ea79ec7adce1f49')];
for(const p of owners){assert.equal(path.dirname(p).toLowerCase(),root.toLowerCase());assert.match(path.basename(p),/^\.tmp-d-(index-cache|bootstrap-consumer)-[a-f0-9]{32}$/);assert.equal(fs.existsSync(p),false);}
const readyName='docs/evidence/a2-bootstrap-original-files-material-adapters-ready-20261026.json';
for(const p of json(readyName).files){assert.deepEqual(sourceMap.get(p.path),p);assert.deepEqual(pin(p.path),p);}
const driver='docs/evidence/d-gc-full-supplement-validation-20261026.ps1';
assert.equal(pin(driver).sha256,receipt.driver_sha256);
for(const fragment of ["$env:GOPROXY='off'","$env:GOSUMDB='off'","$env:GOTOOLCHAIN='local'","'-mod=readonly'","'-count=1'","'-timeout=2700s'","$env:GOOS='linux'"])assert.ok(text(driver).includes(fragment));
assert.ok(!text(driver).includes('-vet=off'));
const summary=n=>({log:n.log,roots:n.roots.length,pass_events:n.names.length});
const result={kind:'a2_bootstrap_gc_supplement_limited_review.v1',status:'accepted_exact_supplement_two_packages_three_seeds_and_recorded_five_Linux_builds_only',
 run,receipt:pin(prefix+'.json'),source:pin(prefix+'-source.json'),source_files:1679,source_sha256:source.source_sha256,
 ordinary_backend_from_failed_joint_matches_except_named_tag:true,explicit_backend_delta:backendChanges,explicit_preparation_delta:source.explicit_preparation_delta,
 native:{evidence:summary(evidence),metadata:summary(metadata),seeds:summary(seeds),seed_names:seeds.names.map(n=>n.split('\0')[1])},
 original_3493_two_package_model_names_preserved_directly_in_supplement:true,original_material_seed_real_owned_nonce_and_two_TLS_handshakes:true,
 Linux:linux,Linux_binary_hashes_independently_observed:false,frozen_source_postcheck_recorded_by_runner:true,
 exact_run_staging_and_prior_joint_owners_independently_absent:owners.map(p=>path.relative(root,p).replaceAll('\\','/')),
 A2_six_current_candidate_pins_match_frozen:true,
 failed_joint:{receipt:pin(oldName),status:'failed',snapshot_postcheck_reached:false,converted_to_pass:false,eight_package_observations_accepted_by_this_review:false},
 scope_limits:['This reviews the supplement itself, not a single passing nine-package run.','Later entry/r2 matrix/CLI/tagged fixture changes are excluded.','Linux digests and frozen postcheck are runner records; removed binaries were not independently inspected.','The supplement driver records its digest at finally, not at start; this review does not claim an independently pinned start digest or verified Go telemetry query.','Local seeds prepare synthetic profiles and actual loopback/files; no actual MySQL cases or production authority are accepted.'],
 current_whole_source_accepted:false,actual_SQL:false,Go_or_builds_executed_by_this_review:false,dependencies_installed:false,remote_contacted:false,production_approved:false,goal_complete:false,
 inputs:[prefix+'.json',prefix+'-source.json',oldName,readyName,driver,'docs/evidence/a2-bootstrap-gc-supplement-review-20261026.mjs'].map(pin)};
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),result);
process.stdout.write(JSON.stringify({mode,output,evidence_roots:399,evidence_pass:3228,metadata_roots:13,metadata_pass:281,seed_pass:3,Linux_recorded:5,owners_absent:3,whole_nine_accepted:false,actual_SQL:false})+'\n');
