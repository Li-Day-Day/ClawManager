import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildControlHealthProbeInputs } from '../../scripts/system-backup-d-control-health-inputs.mjs';

const root=new URL('../../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root));
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const logPath='docs/evidence/system-backup-d-control-health-local-20261016-r41.txt';
const manifestPath='docs/evidence/system-backup-d-control-health-source-20261016-r41.json';
const raw=read(logPath),log=raw.toString('utf8');
const manifest=JSON.parse(read(manifestPath));
assert.equal(manifest.files.length,1292);
const digest=hash(manifest.files.map((pin)=>`${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n')+'\n');
assert.equal(digest,manifest.source_sha256);
assert.ok(log.includes(`LOCAL_SOURCE d-control-health-frozen=yes files=1292 source_sha256=${digest}`));
assert.match(log,/d_control_health_local_exit=0/);
assert.match(log,/LOCAL_PASS d-control-health-frozen-postcheck=yes remote-requested=False dependencies-installed=no/);
assert.match(log,/CLEANED control-health-local-source-cache=True/);
assert.match(log,/PASS control-health dispatch bindings=13 dedicated-root=yes network=no products=none/);
assert.doesNotMatch(log,/^\s*--- FAIL:|^panic:|^fatal error:|CLEANUP_PENDING/m);
const active=new Map(),groups=[];let bundle;
for(const line of log.split(/\r?\n/)){
  if(!line.startsWith('{'))continue;
  let event;try{event=JSON.parse(line)}catch{continue}
  if(event.kind==='d_control_health_probe_bundle'){assert.equal(bundle,undefined);bundle=event;continue;}
  if(!event.Package)continue;
  if(event.Action==='start')active.set(event.Package,[]);
  active.get(event.Package)?.push(event);
  assert.notEqual(event.Test,'TestDControlHealthMySQL','Actual SQL root must not run in local gate');
  assert.notEqual(event.Action,'fail');
  if(event.Action==='pass'&&!event.Test){const events=active.get(event.Package);groups.push({package:event.Package,
    top_level:events.filter((item)=>item.Action==='pass'&&item.Test&&!item.Test.includes('/')).length,
    including_subtests:events.filter((item)=>item.Action==='pass'&&item.Test).length,
    tests:events.filter((item)=>item.Action==='pass'&&item.Test).map((item)=>item.Test)});}
}
assert.equal(groups.length,3);
assert.deepEqual(groups.map((group)=>[group.top_level,group.including_subtests]).sort((a,b)=>a[0]-b[0]),[[1,7],[55,292],[143,191]]);
assert.equal((log.match(/^--- PASS: TestDControlHealthMySQLSeed \(/gm)??[]).length,1);
assert.equal((log.match(/^    --- PASS: TestDControlHealthMySQLSeed\//gm)??[]).length,6);
const bundleJSONTranscribed=Boolean(bundle);
if(!bundle){
  const pins=log.match(/LOCAL_PASS d-control-health-model-and-seed=yes linux-binary-sha256=([a-f0-9]{64}) migration-sha256=([a-f0-9]{64}) inputs-sha256=([a-f0-9]{64}) real_mysql=not_run production_approval=no/);
  assert.ok(pins,'Closed log must contain all three payload hashes');
  bundle={profile:'d-control-health',pins:[{path:'d-control-health.test',sha256:pins[1]},{path:'system-backup-migrate',sha256:pins[2]},{path:'d-control-health-inputs.json',sha256:pins[3]}],
    evidence_basis:'LOCAL_PASS payload hashes; complete Node bundle JSON appeared in tool output but not Start-Transcript'};
}
assert.equal(bundle.profile,'d-control-health');
const inputPin=bundle.pins.find((pin)=>pin.path==='d-control-health-inputs.json');
assert.equal(hash(Buffer.from(JSON.stringify(buildControlHealthProbeInputs()))),inputPin.sha256);
const focusedNames=[
  'backend/internal/systembackupcontroller/control_health.go','backend/internal/systembackupcontroller/control_health_test.go',
  'backend/internal/systembackupcontroller/control_health_observer.go','backend/internal/systembackupcontroller/control_health_observer_test.go',
  'backend/internal/systembackupcontroller/control_health_mysql_test.go','backend/internal/systembackupcontroller/control_loop.go',
  'backend/internal/systembackupcontroller/control_loop_test.go','backend/internal/systembackupread/control_health.go',
  'backend/internal/systembackupread/control_health_test.go','scripts/system-backup-d-control-health-inputs.mjs',
  'scripts/system-backup-d-control-health-bundle.mjs','scripts/system-backup-d-control-health-validation.ps1',
  'scripts/system-backup-d-control-health-phase.sh','scripts/system-backup-d-control-health-dispatch.test.ps1',
  'docs/system-backup-d-control-health-proposal-20261016.sql','scripts/system-backup-controller-enabled-fixture.mysql.sql',
];
const wrapperPath='scripts/system-backup-d-control-health-validation.ps1';
const wrapperCurrent=read(wrapperPath).toString('utf8');
let reconstructedWrapper=wrapperCurrent;
const logOnlyReplacements=[
  ["    Write-Output ('LOCAL_OWNER control-health-source='+$healthOwner+' container='+$healthContainer)\n",''],
  ["    $healthNodeExit=Invoke-AEvidenceNative -FilePath 'node' -Arguments @((Join-Path $healthFrozen 'scripts/system-backup-d-control-health-inputs.mjs'),(Join-Path $healthBundle 'd-control-health-inputs.json'))\n    if($healthNodeExit -ne 0){throw 'Health input capsule failed'}",
   "    & node (Join-Path $healthFrozen 'scripts/system-backup-d-control-health-inputs.mjs') (Join-Path $healthBundle 'd-control-health-inputs.json')\n    if($LASTEXITCODE -ne 0){throw 'Health input capsule failed'}"],
  ["    $healthNodeExit=Invoke-AEvidenceNative -FilePath 'node' -Arguments @((Join-Path $healthFrozen 'scripts/system-backup-d-control-health-bundle.mjs'),$healthFrozen,$healthBundle)\n    if($healthNodeExit -ne 0){throw 'Health bundle pinning failed'}",
   "    & node (Join-Path $healthFrozen 'scripts/system-backup-d-control-health-bundle.mjs') $healthFrozen $healthBundle\n    if($LASTEXITCODE -ne 0){throw 'Health bundle pinning failed'}"],
];
for(const [current,original]of logOnlyReplacements){assert.equal(reconstructedWrapper.split(current).length,2);reconstructedWrapper=reconstructedWrapper.replace(current,original);}
assert.equal(hash(Buffer.from(reconstructedWrapper)),manifest.files.find((pin)=>pin.path===wrapperPath).sha256,'Wrapper delta exceeds the three explicit log changes');
const focused=focusedNames.map((path)=>{
  const pin=manifest.files.find((pin)=>pin.path===path);assert.ok(pin,`Missing frozen pin: ${path}`);
  const current=read(path);
  if(path!==wrapperPath){assert.equal(current.length,pin.size,path);assert.equal(hash(current),pin.sha256,path);}
  return pin;
});
const currentDrift=manifest.files.flatMap((pin)=>{
  if(!existsSync(new URL(pin.path,root)))return[{path:pin.path,state:'missing'}];
  const current=read(pin.path);return hash(current)===pin.sha256&&current.length===pin.size?[]:[{path:pin.path,state:'changed'}];
});
const owner='.tmp-d-index-cache-ae3e5609b02c4020a79fb3b5835ae744';
assert.equal(existsSync(new URL(owner,root)),false);
const source=read('backend/internal/systembackupcontroller/control_health_mysql_test.go').toString('utf8');
const cases=[...source.slice(source.indexOf('func TestDControlHealthMySQL(')).matchAll(/t\.Run\("([^"]+)"/g)].map((match)=>match[1]);
assert.deepEqual(cases,['initial_observe_takeover_read','concurrent_epoch_cas','concurrent_observation_cas','expiry_timezone_and_current_config',
  'actual_constraints_and_fk','committed_reply_loss_poisoned_observer','completed_control_loop_and_fenced_stop']);
const report={kind:'d_control_health_local_preparation_acceptance',recorded_at:new Date().toISOString(),status:'local_preparation_accepted_actual_sql_pending',
  raw_log:logPath,raw_log_sha256:hash(raw),source_manifest:manifestPath,source_manifest_sha256:hash(read(manifestPath)),
  frozen_files:1292,frozen_source_sha256:digest,go_groups:groups,default_top_level:198,default_including_subtests:483,
  seed_unique_top_level:1,seed_unique_including_subtests:7,seed_execution_modes:['go-test actual capsule','Linux executable detached /tmp cwd with cache/telemetry'],
  detached_cwd_empty:false,bundle,bundle_json_transcribed:bundleJSONTranscribed,focused_frozen_pins:focused,
  current_wrapper_logging_only_sha256:hash(read(wrapperPath)),wrapper_delta_verified_by_reconstructing_frozen_hash:true,current_other_frozen_input_drift:currentDrift,
  owner_directory_checked_absent:owner,owned_docker_label_observed_empty:'codex.d-control-health-owner=ae3e5609b02c4020a79fb3b5835ae744',
  independent_bash_syntax_tool_exit:0,remote_requested:false,actual_mysql_case_executions:0,prepared_mysql_cases:cases,
  dependencies_installed:false,image_pulled:false,formal_migrations_added:false,main_controller_enabled:false,production_approval:false,goal_complete:false};
writeFileSync(new URL('./system-backup-d-control-health-review-20261016-r41.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,go_default:[198,483],seed_unique:[1,7],focused:focused.length,current_drift:currentDrift.length,actual_sql:0,cleanup:true}));
