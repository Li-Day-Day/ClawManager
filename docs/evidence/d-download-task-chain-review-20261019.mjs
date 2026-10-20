import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='d-download-task-chain-packages-20261019-r53',rel='docs/evidence/'+prefix;
const bytes=p=>fs.readFileSync(path.join(root,p));
const text=p=>bytes(p).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=json(rel+'-source.json'),native=text(rel+'-native.txt');
assert.equal(manifest.stable_copy_verified,true);
assert.equal(manifest.dependencies_installed,false);
assert.equal(sha(Buffer.from(manifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),manifest.source_sha256);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/internal\/systembackupproducer default_vet=yes/);
assert.match(native,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native,/CLEANED snapshot=True/);
assert.match(native,/d_admission_native_exit=0/);
assert.equal(bytes(rel+'-stderr.txt').length,0);
const events=text(rel+'.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(events.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const packages=['security','evidence','read','producer'].map(s=>{
  const pkg='clawreef/internal/systembackup'+s;
  const ends=events.filter(e=>e.Package===pkg&&!e.Test&&['pass','fail'].includes(e.Action));
  assert.equal(ends.length,1);assert.equal(ends[0].Action,'pass');
  const tests=events.filter(e=>e.Package===pkg&&e.Test&&e.Action==='pass');
  assert.equal(tests.length,new Set(tests.map(e=>e.Test)).size);
  for(const test of tests)assert.equal(events.filter(e=>e.Package===pkg&&e.Test===test.Test&&e.Action==='run').length,1,test.Test);
  return {package:pkg,main:tests.filter(e=>!e.Test.includes('/')).length,all:tests.length};
});
const main=packages.reduce((n,p)=>n+p.main,0),all=packages.reduce((n,p)=>n+p.all,0);
assert.equal(main,693);assert.equal(all,5532);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  assert.ok(native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
  assert.equal(bytes(`${rel}-${stage}-stderr.txt`).length,0);
}
const seeds=text(rel+'-tagged-seed.txt').trim().split('\n').map(JSON.parse);
assert.equal(seeds.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const seedPass=seeds.filter(e=>e.Action==='pass'&&e.Test);
assert.equal(seedPass.length,19);assert.equal(seedPass.filter(e=>!e.Test.includes('/')).length,4);
for(const name of ['current_config_fk','backup','drill','preflight','artifact_verify']){
  const test='TestDTaskOwnerDownloadChainMySQLSeed/'+name;
  assert.equal(seedPass.filter(e=>e.Test===test).length,1,test);
  assert.equal(seeds.filter(e=>e.Test===test&&e.Action==='run').length,1,test);
}
const detached=text(rel+'-detached-seed.txt');
assert.equal((detached.match(/--- PASS: /g)||[]).length,19);
assert.match(detached,/(?:^|\n)PASS\n?$/);
const binaries=[...native.matchAll(/NATIVE_PROBE_BINARY name=([^\n ]+) sha256=([a-f0-9]{64})/g)].map(m=>({name:m[1],sha256:m[2]}));
assert.equal(binaries.length,3);
const owner=native.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());
assert.equal(fs.existsSync(owner),false);
const sourcePins=new Map(manifest.files.map(f=>[f.path,f]));
const exempt=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const currentFiles=text(rel+'-current-files.txt').trim().split('\n').map(p=>p.replaceAll('\\','/')).filter(p=>(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/.test(p)||exempt.has(p))&&!/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p)&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p));
const added=currentFiles.filter(p=>!sourcePins.has(p)).sort();
assert.deepEqual(added,['scripts/system-backup-d-download-task-chain-dispatch.test.ps1','scripts/system-backup-d-download-task-chain-phase.sh']);
for(const f of manifest.files)assert.ok(currentFiles.includes(f.path),'removed source '+f.path);
const changed=manifest.files.filter(f=>bytes(f.path).length!==f.size||sha(bytes(f.path))!==f.sha256).map(f=>f.path);
assert.deepEqual(changed,['backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go','scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-download-admission-native-validation.ps1']);
// Prove the only changed existing source is exactly the independent D profile
// added after the Go freeze. Do not silently exempt a broad script directory.
const harnessPath='scripts/system-backup-a-evidence-validation.ps1';
let harness=text(harnessPath);
const reverse=[
  ["if($ConfigDownloadTaskChainOnly){Write-Output 'VALIDATION_SCOPE download-task-chain-only=yes owner-adapter=SQLTaskDownloadOwners actual-sql-probe-preparation=yes issuer-capacity-provider=synthetic production-approval=no real_mysql=not_run'}elseif($ConfigDownloadOwnersOnly){Write-Output 'VALIDATION_SCOPE", "if($ConfigDownloadOwnersOnly){Write-Output 'VALIDATION_SCOPE"],
  ["$configProofSeedPattern=if($ConfigDownloadTaskChainOnly){'^Test(DTaskOwnerDownloadChainMySQLSeed|ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}elseif($ConfigDownloadOwnersOnly){", "$configProofSeedPattern=if($ConfigDownloadOwnersOnly){"],
  ["$evidenceProbeName=if($ConfigDownloadTaskChainOnly){'d-download-task-chain.test'}elseif($ConfigDownloadOwnersOnly){", "$evidenceProbeName=if($ConfigDownloadOwnersOnly){"],
  ["$evidenceProfile=if($ConfigDownloadTaskChainOnly){'d-download-task-chain'}elseif($ConfigDownloadOwnersOnly){", "$evidenceProfile=if($ConfigDownloadOwnersOnly){"],
  ["$evidencePhaseSource=if($ConfigDownloadTaskChainOnly){'scripts/system-backup-d-download-task-chain-phase.sh'}elseif($ConfigDownloadOwnersOnly){", "$evidencePhaseSource=if($ConfigDownloadOwnersOnly){"],
];
for(const [from,to] of reverse){assert.equal(harness.split(from).length,2);harness=harness.replace(from,()=>to);}
const lines=harness.split('\n');
const removed=lines.filter(l=>l==='    [switch]$ConfigDownloadTaskChainOnly,'||l.startsWith('if($ConfigDownloadTaskChainOnly -and ')||l==='if($ConfigDownloadTaskChainOnly){$ConfigDownloadAdmissionOnly=$true}'||l==="                    if($ConfigDownloadTaskChainOnly){ & (Join-Path $evidenceRoot 'scripts/system-backup-d-download-task-chain-dispatch.test.ps1') }");
assert.equal(removed.length,4);
harness=lines.filter(l=>!removed.includes(l)).join('\n');
const originalPin=sourcePins.get(harnessPath);
assert.equal(sha(Buffer.from(harness)),originalPin.sha256);
const taskPath='backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go';
let task=text(taskPath);
const taskChanges=[['"owner-sql-probe-" + r.kind','"owner-sql-" + r.kind'],[' || len(row.args[2].(string)) < 16 || len(row.args[2].(string)) > 128','']];
for(const [from,to] of taskChanges){assert.equal(task.split(from).length,2);task=task.replace(from,()=>to);}
const cleanupBlock=/\tt\.Cleanup\(func\(\) \{\n\t\t\/\/ Owner reads\/locks are not nonce, Operation, claim or audit grants\.[\s\S]*?\n\t\}\)\n/g;
assert.equal([...task.matchAll(cleanupBlock)].length,1);
task=task.replace(cleanupBlock,'');
assert.equal(sha(Buffer.from(task)),sourcePins.get(taskPath).sha256);
const nativePath='scripts/system-backup-d-download-admission-native-validation.ps1';
let nativeSource=text(nativePath);
const nativeLines=nativeSource.split('\n');
const nativeAdded=nativeLines.filter(l=>l==='    [switch]$TaggedOwnerSeedsOnly,'||l.startsWith('$nativeAllowedOwnerSeedPattern=')||l.startsWith('if($TaggedOwnerSeedsOnly -and ')||l==="    if($TaggedOwnerSeedsOnly){$nativeArguments+=@('-tags','systembackup_mysql')}");
assert.equal(nativeAdded.length,4);
nativeSource=nativeLines.filter(l=>!nativeAdded.includes(l)).join('\n');
const conditionalSeed="        $nativeSeedPattern=if($TaggedOwnerSeedsOnly){'^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}else{'^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'}";
assert.equal(nativeSource.split(conditionalSeed).length,2);
nativeSource=nativeSource.replace(conditionalSeed,()=>"        $nativeSeedPattern='^Test(ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$'");
assert.equal(sha(Buffer.from(nativeSource)),sourcePins.get(nativePath).sha256);
// The changed tagged fixture is recompiled and exercised independently on the
// current frozen scope. The earlier Linux hashes retain their original scope.
const currentRel='docs/evidence/d-download-task-chain-current-seed-20261019-r54';
const currentManifest=json(currentRel+'-source.json'),currentNative=text(currentRel+'-native.txt');
assert.equal(currentManifest.stable_copy_verified,true);
assert.equal(sha(Buffer.from(currentManifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),currentManifest.source_sha256);
for(const pin of currentManifest.files){assert.equal(bytes(pin.path).length,pin.size,pin.path);assert.equal(sha(bytes(pin.path)),pin.sha256,pin.path);}
assert.deepEqual(new Set(currentManifest.files.map(f=>f.path)),new Set(currentFiles));
for(const marker of ['CURRENT_SEED_EXIT=0 default_vet=yes actual_mysql=no','CURRENT_SEED_BUILD_EXIT=0','CURRENT_SEED_DETACHED_EXIT=0','FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no','CLEANED snapshot=True','d_task_chain_current_seed_exit=0'])assert.ok(currentNative.includes(marker),marker);
for(const suffix of ['-stderr.txt','-build-stderr.txt','-detached-stderr.txt'])assert.equal(bytes(currentRel+suffix).length,0);
const currentEvents=text(currentRel+'.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(currentEvents.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const currentPass=currentEvents.filter(e=>e.Action==='pass'&&e.Test);
assert.equal(currentPass.length,19);assert.equal(currentPass.filter(e=>!e.Test.includes('/')).length,4);
assert.equal((text(currentRel+'-detached.txt').match(/--- PASS: /g)||[]).length,19);
assert.match(text(currentRel+'-detached.txt'),/(?:^|\n)PASS\n?$/);
const currentOwner=currentNative.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
assert.equal(path.dirname(currentOwner).toLowerCase(),root.toLowerCase());assert.equal(fs.existsSync(currentOwner),false);
assert.equal(fs.existsSync(path.join(root,'.tmp-d-admission-task-chain-20261019-r54')),false);
const capsule=json('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');
assert.equal(capsule.migration_files.length,95);
assert.equal(capsule.ownership_sha256,'dc0687839ce07646688b7a53d3c7ddda20ea5b269999d499a0730e2d2e0f50a9');
const phase=text(added.find(p=>p.endsWith('-phase.sh')));
assert.ok(phase.includes('-test.run "^TestDTaskOwnerDownloadChainMySQL$"'));
assert.ok(phase.includes('new_cases=12 owner_adapter=SQLTaskDownloadOwners'));
const result={kind:'d_task_owner_download_chain_local_review',prefix,source_sha256:manifest.source_sha256,source_files:manifest.files.length,packages,main,all,seed_main:4,seed_all:19,detached_seed_all:19,binaries,cleanup:[{path:owner,exists:false},{path:currentOwner,exists:false}],
  current_seed:{prefix:currentRel,source_sha256:currentManifest.source_sha256,source_files:currentManifest.files.length,main:4,all:19,detached_all:19,current_source_drift:[],binary_sha256:currentNative.match(/CURRENT_SEED_BINARY sha256=([a-f0-9]{64})/)[1]},
  current_added_sources:added,current_changed_sources:changed,all_existing_source_changes_exactly_reconstructed:true,production_pins_match:true,original_linux_probe_has_older_tagged_fixture:true,
  current_script_pins:[...added,...changed].map(p=>({path:p,sha256:sha(bytes(p))})),actual_task_chain_mysql_cases_prepared:12,actual_task_chain_mysql_executed:false,dependencies_installed:false,remote_executed_by_d:false,provider_transport:'synthetic',formal_schema_or_grants_installed:false,producer_owner_innodb_covered:false,production_enabled:false,original_six_scopes_complete:false};
fs.writeFileSync(path.join(root,rel+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main,all,seed:19,source_files:manifest.files.length,changed,added,cleaned:true,actual_mysql:false}));
