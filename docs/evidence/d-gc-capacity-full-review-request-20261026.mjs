import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../..'),evidence=path.join(root,'docs/evidence');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(decode(fs.readFileSync(p)));
const resolve=p=>{const f=path.resolve(p);assert.equal(path.dirname(f),evidence);return f;};
const relative=p=>path.relative(root,p).replaceAll('\\','/');
const args=process.argv.slice(2),opts={};
for(let n=0;n<args.length;n+=2){assert.ok(['--joint','--supplement','--write'].includes(args[n]));assert.ok(args[n+1]);assert.equal(opts[args[n]],undefined);opts[args[n]]=args[n+1];}
assert.ok(opts['--joint']&&opts['--supplement'],'Use --joint exact.json --supplement exact.json [--write NEW.json]. Default is read-only.');
const jointPath=resolve(opts['--joint']),supplementPath=resolve(opts['--supplement']),joint=json(jointPath),supplement=json(supplementPath);
assert.equal(joint.kind,'d_bootstrap_consumer_complete_native.v1');assert.equal(joint.status,'failed');
for(const k of ['tests_started','cleaned','snapshot_verified'])assert.equal(joint[k],true,k);
assert.equal(joint.targeted_exit,0);assert.equal(joint.test_exit,1);assert.equal(joint.dependencies_installed,false);
assert.equal(supplement.kind,'d_gc_full_supplement_validation.v1');assert.equal(supplement.error,null);
for(const k of ['frozen_inputs_stable','owner_removed','binary_removed'])assert.equal(supplement[k],true,k);
assert.equal(supplement.staging_cleanup_requested,true);assert.equal(supplement.staging_owner_removed,true);assert.equal(fs.existsSync(supplement.staging_owner),false);
assert.equal(supplement.dependencies_installed,false);assert.equal(supplement.actual_mysql,false);assert.equal(supplement.production_approved,false);
assert.match(supplement.linux_binary_sha256,/^[a-f0-9]{64}$/);
assert.equal(fs.existsSync(supplement.owner),false);
const jointID=path.basename(jointPath).match(/^d-bootstrap-consumer-native-([a-f0-9]{32})\.json$/)?.[1];assert.ok(jointID);
const jointOwner=path.join(root,'.tmp-d-bootstrap-consumer-'+jointID);assert.equal(fs.existsSync(jointOwner),false);
const sourcePath=resolve(supplement.source_manifest),source=json(sourcePath);
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);
assert.equal(source.ordinary_backend_from_joint_only,true);
assert.equal(sha(source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),source.source_sha256);
const jointMap=new Map(joint.files.map(p=>[p.path,p]));
const capturedPaths=new Set(source.files.map(p=>p.path));
for(const p of joint.files.filter(p=>p.path.startsWith('backend/')&&/\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p.path)))assert.ok(capturedPaths.has(p.path),'missing frozen backend input '+p.path);
const tagOnlyDelta=[];
for(const p of source.files.filter(p=>p.path.startsWith('backend/'))){
  const previous=jointMap.get(p.path);
  if(previous?.sha256===p.sha256&&previous.size===p.size)continue;
  assert.equal(p.path,'backend/internal/systembackupevidence/bootstrap_original_materials_mysql_test.go','ordinary backend differs from full native suite '+p.path);
  assert.equal(p.size,25537);assert.equal(p.sha256,'19b1c83160c3cc93f707ed90dfbe06155e2ae6a5f04d727a8d1e3e97496ee2ad','D1 exact staged ready pin');
  tagOnlyDelta.push({path:p.path,before:previous??null,after:p,coverage:'tagged compile and TestDBootstrapOriginalMaterialsMySQLSeed only; actual22 not run'});
}
const readEvents=p=>decode(fs.readFileSync(p)).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fullLog=jointPath.replace(/\.json$/,'.jsonl'),full=readEvents(fullLog);
const failures=full.filter(r=>r.Action==='fail');assert.equal(failures.length,1);assert.equal(failures[0].Package,'clawreef/internal/systembackupevidence');assert.equal(failures[0].Test,undefined);
assert.equal(full.filter(r=>r.Output==='panic: test timed out after 10m0s\n').length,1,'only known harness timeout allowed');
const passed=full.filter(r=>r.Action==='pass'&&r.Test),rawKeys=new Set(passed.map(r=>r.Package+'\0'+r.Test));assert.equal(rawKeys.size,passed.length,'duplicate native test passes');
// Partial evidence passes in the timed-out package are history only. All
// evidence names and required roots must also exist in the complete rerun.
const keys=new Set(passed.filter(r=>r.Package!=='clawreef/internal/systembackupevidence').map(r=>r.Package+'\0'+r.Test));
for(const pkg of ['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupproducer','clawreef/internal/systembackupbootstrapsecurity','clawreef/internal/systembackupnoncebootstrap','clawreef/internal/systembackupcatrust','clawreef/internal/systembackupresources','clawreef/internal/systembackupread','clawreef/cmd/server']){
  assert.equal(full.filter(r=>r.Package===pkg&&r.Action==='pass'&&!r.Test).length,1,pkg);
  assert.equal(full.filter(r=>r.Package===pkg&&r.Action==='skip').length,0,pkg);
}
const expectedRoots=['TestConfigMutationCapacityPreparedPinsOriginalReport','TestConfigMutationCapacityPreparedRejectsBindingAndExpiry','TestConfigMutationCapacityPreparedTracksSQLFloorAndPoisonsFailure','TestDownloadGCFullPinsCapacityBeforeFreeze','TestDownloadGCFullRejectsClockBetweenCapacityAndOwnerSamples','TestDownloadGCFullReservationInsertPrivilege'];
for(const name of expectedRoots)assert.ok(passed.some(r=>r.Test===name),'missing prepared/Full root '+name);
const summaries=[];
assert.deepEqual(supplement.steps.map(s=>s.name),['evidence','metadata','seeds','linux-tagged','linux-server','linux-bootstrap','linux-nonce','linux-ca']);
for(const step of supplement.steps){
  assert.equal(step.exit_code,0,step.name);
  const log=resolve(step.log);
  if(step.name.startsWith('linux-')){assert.match(step.binary_sha256,/^[a-f0-9]{64}$/);summaries.push({name:step.name,exit_code:0,binary_sha256:step.binary_sha256,log:relative(log),log_sha256:sha(fs.readFileSync(log))});continue;}
  const rows=readEvents(log);assert.equal(rows.filter(r=>r.Action==='fail'||r.Action==='skip').length,0);
  const tests=rows.filter(r=>r.Action==='pass'&&r.Test);
  if(step.name==='evidence')assert.equal(rows.filter(r=>r.Action==='pass'&&!r.Test&&r.Package==='clawreef/internal/systembackupevidence').length,1);
  if(step.name==='seeds')assert.deepEqual(tests.map(r=>r.Test).sort(),['TestDBootstrapOriginalMaterialsMySQLSeed','TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullProfileMySQLSeed']);
  if(step.name==='metadata')assert.ok(tests.length>=13);
  for(const r of tests)keys.add(r.Package+'\0'+r.Test);
  summaries.push({name:step.name,exit_code:0,roots:tests.filter(r=>!r.Test.includes('/')).length,pass_events:tests.length,log:relative(log),log_sha256:sha(fs.readFileSync(log))});
}
for(const name of expectedRoots)assert.ok([...keys].some(k=>k.endsWith('\0'+name)),'missing complete-package prepared/Full root '+name);
const historical='docs/evidence/d-gc-full-local-0f34460abce44e279a1f2c92d19bb11c-complete.jsonl';
const oldNames=readEvents(path.join(root,historical)).filter(r=>r.Action==='pass'&&r.Test);
for(const row of oldNames)assert.ok(keys.has(row.Package+'\0'+row.Test),'lost historical accepted test '+row.Test);
const owned=[
 'backend/internal/systembackupsecurity/config_mutation_capacity_prepared.go','backend/internal/systembackupsecurity/config_mutation_capacity_prepared_test.go',
 ...['download_retention_gc.go','download_retention_gc_batch.go','download_retention_gc_full.go','download_retention_gc_full_test.go','download_retention_gc_freeze.go','download_retention_gc_freeze_work.go','download_gc_full_profile_mysql_test.go','download_gc_full_collect_mysql_test.go','testdata/download-gc-full-cold-schema.sql'].map(p=>'backend/internal/systembackupevidence/'+p),
 ...['system-backup-a-evidence-validation.ps1','system-backup-d-config-writer-validation.ps1','system-backup-d-download-gc-full-profile-phase.sh','system-backup-d-download-gc-full-profile-dispatch.test.ps1','system-backup-d-download-gc-full-collect-phase.sh','system-backup-d-download-gc-full-collect-dispatch.test.ps1','system-backup-d-gc-full-collect-receiver.mjs','system-backup-d-gc-full-collect-receiver.test.mjs'].map(p=>'scripts/'+p)
];
const sourceMap=new Map(source.files.map(p=>[p.path,p]));
const ownedPins=owned.map(p=>{const pin=sourceMap.get(p);assert.ok(pin,p);assert.equal(sha(fs.readFileSync(path.join(root,p))),pin.sha256,'current owned byte drift '+p);return pin;});
assert.equal(sha(fs.readFileSync(path.join(root,'docs/evidence/d-gc-full-review-request-20261026.json'))),'0c1ff055817ef0e1499ecfc4b377a7922bff8aa78e8b579a72ffb2a17e4fa840','historical receipt overwritten');
const parserLog=path.join(evidence,'d-gc-full-collect-receiver-tests-20261026-r3.txt');const parserText=decode(fs.readFileSync(parserLog));assert.match(parserText,/tests 17/);assert.match(parserText,/pass 17/);assert.match(parserText,/fail 0/);
const result={kind:'d_gc_capacity_full_review_request.v1',status:'request_A_exact_local_model_chain_and_actual_probe_preparation_review',joint_receipt:relative(jointPath),joint_receipt_sha256:sha(fs.readFileSync(jointPath)),joint_log:relative(fullLog),joint_log_sha256:sha(fs.readFileSync(fullLog)),joint_overall_pass:false,joint_evidence_harness_timeout_preserved:true,joint_snapshot_postcheck_completed:(joint.snapshot_unchanged===true),joint_pass_events:passed.length,joint_roots:passed.filter(r=>!r.Test.includes('/')).length,joint_ordinary_backend_exact:true,tag_only_dependency_delta:tagOnlyDelta,bootstrap_original_local_seed_only:true,bootstrap_actual_cases_executed:0,supplement_receipt:relative(supplementPath),supplement_receipt_sha256:sha(fs.readFileSync(supplementPath)),supplement_source:relative(sourcePath),supplement_source_sha256:source.source_sha256,supplement_steps:summaries,owned_inputs:ownedPins,remote_input_pins:source.files,capsule_sha256:sourceMap.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json').sha256,historical_093f_names_preserved:oldNames.length,historical_request_immutable:true,parser_tests:17,parser_log:relative(parserLog),parser_log_sha256:sha(fs.readFileSync(parserLog)),profile_catalog_cases:33,cold_group_catalog_cases:7,actual_profile_cases_executed:0,actual_cold_group_cases_executed:0,protocol_authority:'synthetic_uid_scoped_only_in_probe',domain_policy:'published_task_fixture_only_not_complete_production_domain',capacity_report:'synthetic',candidate_gc_checks:true,production_approved:false,twelve_protocol_groups_complete:false,whole_tree_ready:false,goal_complete:false,dependencies_installed:false,cleanup:{joint_owner:jointOwner,joint_owner_absent:true,supplement_owner:supplement.owner,supplement_owner_absent:true,binary_removed:true},remaining:['owner-reviewed canonical catalog/import schemas and original lifecycle authority','complete real domain/protocol authority integration','actual Full33 and cold7 MySQL execution and independent acceptance','kill/takeover/multiple-holder/session-state/full-scale protocol groups','original physical-volume capacity and deployment approval'],excluded_runs:['ccb725d41d2449a9861ecce66e18657a adapter failed test injection; no full/seed/Linux','d5318ee6c62248d2a4f771275b8921be own cancellation; zero native events']};
if(opts['--write'])fs.writeFileSync(resolve(opts['--write']),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({status:result.status,joint_pass_events:result.joint_pass_events,supplement_steps:summaries,owned_inputs:ownedPins.length,actual_cold_group_cases_executed:0,production_approved:false,goal_complete:false})+'\n');
