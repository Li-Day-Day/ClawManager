import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const run=process.argv[2]??'20261020-r5';
assert.match(run,/^[a-zA-Z0-9-]+$/);
const prefix=resolve(dir,'a-download-deployment-'+run);
const baselinePrefix=resolve(dir,'a-download-deployment-20261020-r2');
const read=path=>readFileSync(path,'utf8').replace(/^\uFEFF/,'');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=JSON.parse(read(prefix+'-source.json'));
assert.equal(source.stable_copy_verified,true);
assert.equal(source.dependencies_installed,false);
assert.equal(source.production_approved,false);
assert.equal(hash(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
const native=read(prefix+'-native.txt');
const baselineNative=read(baselinePrefix+'-native.txt');
const baselineSource=JSON.parse(read(baselinePrefix+'-source.json'));
assert.equal(hash(baselineSource.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),baselineSource.source_sha256);
assert.equal(source.files.length,baselineSource.files.length);
const baselineMap=new Map(baselineSource.files.map(p=>[p.path,p]));
const sourceChanges=source.files.filter(p=>{const old=baselineMap.get(p.path);assert.ok(old,p.path);return old.sha256!==p.sha256||old.size!==p.size;}).map(p=>p.path);
assert.deepEqual(sourceChanges,['backend/internal/systembackupevidence/download_output_deadline_a_test.go','backend/internal/systembackupevidence/system_publication_test.go']);
for(const marker of [
  `LOCAL_SOURCE sha256=${source.source_sha256} files=${source.files.length}`,
  `BASELINE retained-passing-packages=registration,security node=16 python=4 source_sha256=${baselineSource.source_sha256} only-changes=publication,download-output-deadline-tests`,
  'START evidence-publication-fixture-repair default-vet=yes dependencies-installed=no',
  'PASS evidence-publication-fixture-repair',
  'PASS linux-download-deployment-build sha256=',
  'LOCAL_PASS download-deployment-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote=not-run',
  'CLEANED download-deployment-source-cache-binary=True','PowerShell transcript end',
])assert.ok(native.includes(marker),marker);

const packages=['clawreef/cmd/system-backup-registration','clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
const repairedEvents=read(prefix+'-packages.jsonl').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(repairedEvents.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const baselineEvents=read(baselinePrefix+'-packages.jsonl').trim().split(/\r?\n/).map(JSON.parse);
assert.deepEqual(baselineEvents.filter(e=>e.Action==='fail'&&e.Test).map(e=>e.Test).sort(),['TestSystemPublicationClaimFinalGuard','TestSystemPublicationClaimFinalGuard/readback_mode']);
assert.equal(baselineEvents.filter(e=>['skip','build-fail'].includes(e.Action)).length,0);
assert.equal(baselineEvents.filter(e=>e.Action==='fail'&&!e.Test).length,1);
assert.ok(baselineEvents.some(e=>e.Test==='TestSystemPublicationClaimFinalGuard/readback_mode'&&e.Output?.includes('producer_committed_but_execution_expired')));
assert.equal(baselineNative.includes('LOCAL_PASS download-deployment-frozen-postcheck'),false);
const events=[...baselineEvents.filter(e=>e.Package!==packages[2]),...repairedEvents];
assert.equal(events.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
for(const pkg of packages)assert.equal(events.filter(e=>e.Package===pkg&&!e.Test&&e.Action==='pass').length,1,pkg);
const passed=events.filter(e=>e.Test&&e.Action==='pass'),ran=events.filter(e=>e.Test&&e.Action==='run');
assert.equal(passed.length,ran.length);
for(const e of ran)assert.equal(passed.filter(p=>p.Package===e.Package&&p.Test===e.Test).length,1,e.Test);
const roots=['TestDownloadDeploymentLoadsConcreteRuntimeAndMountsTLS','TestDownloadDeploymentRejectsWrongPinsAndSources','TestDownloadDeploymentStrictJSON','TestDownloadGrantShapeRejectsEscalation','TestLoginSessionsCloseErasesOwnedKeyAndRejectsReuse'];
for(const test of roots)assert.equal(passed.filter(e=>e.Test===test).length,1,test);
assert.equal(passed.filter(e=>e.Test.startsWith(roots[1]+'/')).length,13);
assert.equal(passed.filter(e=>e.Test==='TestSystemPublicationClaimFinalGuard').length,1);
assert.equal(passed.filter(e=>e.Test.startsWith('TestSystemPublicationClaimFinalGuard/')).length,12);
for(const protocol of ['http1','http2'])for(const mode of ['before_deadline','result_crosses_deadline'])assert.equal(passed.filter(e=>e.Test===`TestADownloadNativeBufferedOutputKeepsOriginalDeadline/${protocol}/${mode}`).length,1,protocol+' '+mode);
for(const test of ['TestRegistrationHTTPSDrainsActiveHandlerBeforeReturn','TestRegistrationHTTPSTimeoutIsNotDrained','TestRegistrationHTTPSListenerFailureStopsWatcher','TestRegistrationHTTPSCanceledBeforeListen'])assert.equal(passed.filter(e=>e.Test===test).length,1,test);

const nodeSuites=[['system-backup-d-capacity-deployment.test.mjs',9],['system-backup-d-deployment.test.mjs',4],['system-backup-schema-diff.test.mjs',3]];
for(const [name,count]of nodeSuites){
  assert.ok(baselineNative.includes('PASS node-suite='+name));
  const log=read(baselinePrefix+'-'+name+'.txt');
  for(const [label,value]of [['tests',count],['pass',count],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(log,new RegExp(`(?:^|\\n).*?${label} ${value}\\r?(?:\\n|$)`),name+' '+label);
  assert.equal(read(baselinePrefix+'-'+name+'-stderr.txt').trim(),'');
}
assert.ok(baselineNative.includes('PASS capacity-account-mocked-tests no-cluster-contact=yes'));
assert.match(read(baselinePrefix+'-python-stderr.txt'),/Ran 4 tests[\s\S]*\r?\nOK\r?\n?$/);
assert.equal(read(baselinePrefix+'-python.txt').trim(),'');
assert.equal(read(baselinePrefix+'-packages-stderr.txt').trim(),'');
for(const suffix of ['-packages-stderr.txt','-linux-build-stderr.txt','-linux-build.txt'])assert.equal(read(prefix+suffix).trim(),'');

const scope=[
  ...['main.go','http_lifecycle.go','http_lifecycle_test.go','download_deployment.go','download_deployment_test.go','download_grants.go','download_http.go'].map(p=>'backend/cmd/system-backup-registration/'+p),
  ...['login_sessions.go','login_sessions_close_test.go','registration_capacity_source.go','registration_capacity_source_test.go','registration_capacity_measurement.go','registration_capacity_measurement_test.go'].map(p=>'backend/internal/systembackupsecurity/'+p),
  ...['download_failure_journal.go','download_failure_journal_test.go','download_runtime_journal.go','download_application.go','download_application_test.go','download_authority.go','download_authority_sql.go','download_runtime.go','system_recovery_audit_journal.go'].map(p=>'backend/internal/systembackupevidence/'+p),
  'backend/internal/systembackupevidence/system_publication_test.go',
  'backend/internal/systembackupevidence/download_output_deadline_a_test.go',
  'scripts/system-backup-d-capacity-deployment.mjs','scripts/system-backup-d-capacity-deployment.test.mjs',
];
for(const path of scope){const pin=source.files.find(p=>p.path===path);assert.ok(pin,path);assert.equal(hash(readFileSync(resolve(root,path))),pin.sha256,path);}
const extra=JSON.parse(read(prefix+'-templates.json'));
assert.deepEqual(extra,JSON.parse(read(baselinePrefix+'-templates.json')));
assert.deepEqual(extra.map(p=>p.path).sort(),[
  'deployments/k8s/system-backup-capacity.template.json','deployments/k8s/system-backup-registration.template.json','deployments/k8s/system-backup-download.template.json','deployments/k8s/system-backup-download-sql-pins.template.json',
  'scripts/system-backup-d-capacity-account.py','scripts/system-backup-d-capacity-account_test.py',
].sort());
for(const pin of extra){const path=resolve(root,pin.path);assert.ok(path.startsWith(root+sep));const bytes=readFileSync(path);assert.equal(bytes.length,pin.size);assert.equal(hash(bytes),pin.sha256,pin.path);}

function absentOwner(log){
  const owner=log.match(/LOCAL_OWNER download-deployment=(.+)/)?.[1].trim();
  assert.ok(owner);assert.equal(dirname(owner).toLowerCase(),root.toLowerCase());assert.match(basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(existsSync(owner),false);
  assert.ok(log.includes('CLEANED download-deployment-source-cache-binary=True'));
  return basename(owner);
}
const owner=absentOwner(native);
const failedFullOwner=absentOwner(baselineNative);
const first=read(resolve(dir,'a-download-deployment-20261020-r1-native.txt'));
assert.match(first,/can't open file[\s\S]*system-backup-d-capacity-account_test\.py/);
assert.equal(first.includes('START registration-security-evidence'),false);
const firstOwner=absentOwner(first);
const stoppedRepair=read(resolve(dir,'a-download-deployment-20261020-r3-native.txt'));
assert.equal(stoppedRepair.includes('START evidence-publication-fixture-repair'),false);
const stoppedRepairOwner=absentOwner(stoppedRepair);
const argumentFailurePrefix=resolve(dir,'a-download-deployment-20261020-r4');
const argumentFailure=read(argumentFailurePrefix+'-packages.jsonl').trim().split(/\r?\n/).map(JSON.parse);
assert.ok(argumentFailure.some(e=>e.Action==='build-fail'));
assert.equal(argumentFailure.filter(e=>e.Action==='run'&&e.Test).length,0);
const argumentFailureOwner=absentOwner(read(argumentFailurePrefix+'-native.txt'));
const drift=[];
for(const pin of source.files){const path=resolve(root,pin.path);assert.ok(path.startsWith(root+sep));if(!existsSync(path)||hash(readFileSync(path))!==pin.sha256)drift.push(pin.path);}
const report={kind:'a_download_deployment_local_acceptance',recorded_at:new Date().toISOString(),run,
  source_sha256:source.source_sha256,source_count:source.files.length,extra_inputs:extra,
  retained_passing_source_sha256:baselineSource.source_sha256,retained_passing_packages:packages.slice(0,2),repair_source_changes:sourceChanges,
  retained_source_final_postcheck:'not_reached_on_failed_full_run',retained_source_basis:'stable_readonly_copy_verified_before_tests; all_unchanged_inputs_rechecked_in_repair_snapshot',
  packages:packages.map(pkg=>({package:pkg,main_tests:passed.filter(e=>e.Package===pkg&&!e.Test.includes('/')).length,tests_including_subtests:passed.filter(e=>e.Package===pkg).length})),
  new_roots:roots,new_checks_including_roots:passed.filter(e=>roots.some(r=>e.Test===r||e.Test.startsWith(r+'/'))).length,
  publication_claim_guard_checks:13,native_buffered_output_checks:4,
  node_checks:nodeSuites.reduce((sum,[,count])=>sum+count,0),python_mocked_checks:4,
  linux_binary_sha256:native.match(/PASS linux-download-deployment-build sha256=([a-f0-9]{64})/)[1],
  scoped_current_inputs_match:true,other_snapshot_input_drift_excluded:drift,frozen_postcheck:true,
  owned_products_absent:[owner,failedFullOwner,firstOwner,stoppedRepairOwner,argumentFailureOwner],first_pre_go_python_snapshot_omission_preserved:true,
  pre_go_concurrent_test_drift_stop_preserved:true,
  pre_test_native_single_package_argument_failure_preserved:true,
  failed_full_evidence_package_preserved:true,fixture_seed_known_commit_is_not_execution_permission:true,
  dependencies_installed:false,actual_sql:'not_run',sql_role_profile:'candidate_not_approved_or_applied',
  providers_and_human_mfa:'not_verified',linux_permissions_and_shared_storage:'not_executed',
  production_deployment:'not_applied',production_approval:false};
writeFileSync(resolve(dir,'a-download-deployment-accepted-'+run+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
