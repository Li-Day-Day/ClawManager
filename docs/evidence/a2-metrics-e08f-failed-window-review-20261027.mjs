import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';

const prefix='docs/evidence/d2-metrics-controller-candidate-e08f-20261027';
const output='docs/evidence/a2-metrics-e08f-failed-window-observed-20261027.json';
const rejectedOutput='docs/evidence/a2-metrics-namespace-observer-rejected-20261027-r1.json';
const raw=p=>fs.readFileSync(p);
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:hash(raw(p))});
const j=json(prefix+'.json'),m=json(prefix+'.source.json');
assert.equal(j.status,'failed');assert.equal(j.steps.length,5);
assert.ok(j.steps.every(s=>s.exit_code===0));
assert.equal(j.source_postcheck,true);assert.equal(j.owner_removed,true);
assert.equal(fs.existsSync(j.owner),false);
assert.equal(hash(raw(prefix+'.source.json')),j.source_manifest_sha256);
for(const s of j.steps){assert.equal(hash(raw(s.log)),s.sha256);if(s.stderr)assert.equal(hash(raw(s.stderr)),s.stderr_sha256);}
const names=validateGoEvents(raw(j.steps[4].log).toString('utf8'),'clawreef/internal/systembackupcontroller');
const required=['TestControllerStateAlertsFixedClockAndProfile','TestControllerStateAlertsExactBoundariesAndMissingSeries',
  'TestControllerStateAlertsRejectInvalidInputs','TestControllerCleanupUsesEachImmutableDeadline',
  'TestControllerCleanupRejectsUnknownPartialOrInvalidCollections','TestControllerResidualVolumeUsesEachImmutableDeadline',
  'TestControllerCleanupRejectsUnknownResidualVolumeFacts'];
assert.ok(required.every(n=>names.includes(n)));
const archives=[];
for(const [source,out]of [
  ['docs/evidence/d2-metrics-controller-candidate-review-20261027.mjs','docs/evidence/a2-metrics-e08f-failed-reviewer-20261027.mjs.txt'],
  ['docs/evidence/d2-metrics-controller-candidate-native-20261027.ps1','docs/evidence/a2-metrics-e08f-failed-runner-20261027.ps1.txt'],
]){
  const expected=m.controls.find(p=>p.path===source);assert.ok(expected);
  if(process.argv[2]==='--write'){
    const b=raw(source);
    if(hash(b)===expected.sha256&&b.length===expected.size){
      fs.writeFileSync(out,b,{flag:'wx'});
      archives.push({status:'original_frozen_bytes_archived',source:expected,archive:pin(out)});
    }else archives.push({status:'current_control_does_not_match_frozen_bytes_not_archived_as_original',source:expected,current:pin(source)});
  }else{
    const saved=json(output).frozen_controls_archival.find(p=>p.source.path===source);assert.ok(saved);
    if(saved.archive){assert.equal(hash(raw(saved.archive.path)),expected.sha256);assert.deepEqual(pin(saved.archive.path),saved.archive);}
    archives.push(saved);
  }
}
const scope=json(prefix+'.go-scope.json');assert.equal(scope.variants.length,4);
const scopeManifest=pin(prefix+'.source.json');assert.equal(scope.source_manifest.sha256,scopeManifest.sha256);
assert.equal(scope.source_manifest.size,scopeManifest.size);
for(const v of scope.variants){assert.equal(hash(raw(v.log.path)),v.log.sha256);assert.equal(raw(v.log.path).length,v.log.size);}
const byRoot=m.files.reduce((o,p)=>(o[p.path.split('/')[0]]=(o[p.path.split('/')[0]]??0)+1,o),{});
const report={kind:'a2_metrics_e08f_failed_window_limited_observations.v1',
  status:'failed_parent_preserved_Windows_and_actual_scope_observed_not_whole_candidate_acceptance',
  receipt:pin(prefix+'.json'),source_manifest:scopeManifest,go_scope:pin(prefix+'.go-scope.json'),
  formal_status:j.status,error:j.error,actual_recorded_steps:5,recorded_exits:j.steps.map(s=>s.exit_code),
  actual_GoList_contexts:4,Windows_package:'clawreef/internal/systembackupcontroller',Windows_pass_events:names.length,
  Windows_roots:names.filter(n=>!n.includes('/')).length,required_seven_roots_observed:required,
  source_content_pin_postcheck_reported:j.source_postcheck,full_namespace_postcheck_proven:false,
  source_inputs:1718,source_by_root:byRoot,Linux_compile_attempt_exit_recorded:false,Linux_binary_accepted:false,
  native_inventory_present:fs.existsSync(prefix+'.inventory.json'),owner_removed_reported:true,owner_independently_absent:true,
  frozen_controls_archival:archives,Go_reexecuted_by_A2:false,live_sources_modified:false,whole_baseline_accepted:false,
  dependencies_installed:false,SQL_executed:false,PromQL_executed:false};
const observer='docs/evidence/a2-metrics-post-native-namespace-20261027.mjs';
const rejected={kind:'a2_namespace_observer_initial_preflight_rejection.v1',status:'preflight_rejected_no_post_native_observation',
  observer:pin(observer),actual_command:['node',observer],actual_exit:1,
  reason:'Initial observer incorrectly restricted all manifest paths to backend/contracts/scripts; actual manifest includes 11 docs inputs.',
  first_rejected_input:'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',actual_source_by_root:byRoot,
  post_native_namespace_proven:false,Go_executed:false,peer_files_modified:false,observer_process_running:false,
  root_formal_window_status:j.status};
if(process.argv[2]==='--write'){
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(rejectedOutput,JSON.stringify(rejected,null,2)+'\n',{flag:'wx'});
}else{assert.equal(process.argv[2],'--check');assert.deepEqual(json(output),report);assert.deepEqual(json(rejectedOutput),rejected);}
console.log(JSON.stringify({output,Windows_pass_events:report.Windows_pass_events,Windows_roots:report.Windows_roots,
  archives:archives.map(a=>a.status),whole_candidate_accepted:false,observer_preflight_rejected:true}));
