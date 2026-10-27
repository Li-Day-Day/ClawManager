import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPrometheusRules} from '../../scripts/system-backup-prometheus-rules.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const basePath='docs/evidence/a2-metrics-security-combined-candidate-20261027-r2.json';
const proposalPath='docs/evidence/d2-metrics-dedupe-proposal-candidate-20261027-r1.json';
const candidatePath='docs/evidence/d2-metrics-controller-registry-candidate-20261027-r3.json';
const yamlPath='docs/evidence/d2-metrics-controller-rules-candidate-20261027-r3.yaml';
const generatorPath='docs/evidence/d2-metrics-controller-registry-generator-candidate-20261027-r3.mjs.txt';
const contractTests='docs/evidence/d2-metrics-contract-tests-candidate-20261027-r3.mjs.txt';
const rulesTests='docs/evidence/d2-metrics-prometheus-tests-candidate-20261027-r3.mjs.txt';
const readmePath='docs/evidence/d2-metrics-contract-readme-candidate-20261027-r3.md.txt';
const sourceReview='docs/evidence/a2-cleanup-controller-candidate-source-reviewed-20261027-r2.json';
const output='docs/evidence/a2-metrics-controller-registry-reviewed-20261027-r3.json';
const bytes=p=>fs.readFileSync(path.join(root,p));
const read=p=>bytes(p).toString('utf8');
const json=p=>JSON.parse(read(p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:bytes(p).length,sha256:hash(bytes(p))});
const base=json(basePath),proposal=json(proposalPath),candidate=json(candidatePath);
assert.deepEqual(candidate.metrics,base.metrics);
assert.deepEqual({...candidate,alerts:base.alerts,source:base.source},base);
assert.deepEqual(candidate.source,{...base.source,alert_count:100});
assert.equal(candidate.alerts.length,100);
assert.equal(candidate.alerts.filter(a=>a.expression_language==='promql').length,94);
assert.equal(candidate.alerts.filter(a=>a.expression_language==='controller_state').length,6);
const before=new Map(base.alerts.map(a=>[a.id,a])),after=new Map(candidate.alerts.map(a=>[a.id,a]));
assert.equal(after.size,100);
const unchanged=base.alerts.filter(a=>JSON.stringify(a)===JSON.stringify(after.get(a.id)));
const changed=base.alerts.filter(a=>after.has(a.id)&&JSON.stringify(a)!==JSON.stringify(after.get(a.id)));
const removed=base.alerts.filter(a=>!after.has(a.id));
const added=candidate.alerts.filter(a=>!before.has(a.id));
assert.equal(unchanged.length,96);
assert.deepEqual(changed.map(a=>a.id),['cleanup-overdue','restore-residual-volume-overdue']);
assert.deepEqual(removed.map(a=>a.id),['signature-or-checksum-failure']);
assert.deepEqual(added.map(a=>a.id),['signature-operation-failure','checksum-or-signature-verifier-failure']);
for(const a of added)assert.deepEqual(a,proposal.alerts.find(b=>b.id===a.id));
assert.equal(added.map(a=>a.expression).join(' or '),removed[0].expression);
const expectedExpressions={
  'cleanup-overdue':'any(cleanup_owner.age > cleanup_owner.immutable_deadline)',
  'restore-residual-volume-overdue':'any(cleanup_owner.residual_volume && cleanup_owner.age > cleanup_owner.immutable_deadline)',
};
for(const old of changed){
  const current=after.get(old.id);
  assert.equal(current.expression_language,'controller_state');
  assert.equal(current.expression,expectedExpressions[old.id]);
  assert.equal(current.severity,'critical');assert.equal(current.for_seconds,0);
  assert.equal(current.threshold_source,'immutable_task_config');
  assert.equal(current.missing_series,'unknown');
  assert.equal(current.counter_reset,'persisted_state_not_reset_by_restart');
  assert.deepEqual(current.dedupe_key,[]);assert.deepEqual(current.profiles,['production','development']);
  assert.deepEqual(current.fixed_clock_cases,old.fixed_clock_cases);
  assert.equal(current.runbook,old.runbook);
  assert.ok(current.recovery_condition.startsWith('a complete cleanup owner collection'));
}
assert.equal(read(yamlPath),renderPrometheusRules(candidate,hash(bytes(candidatePath))));
assert.match(read(yamlPath),/DO NOT LOAD: no rule loader, missing-series execution, or PromQL fixture validation exists yet/);
for(const a of candidate.alerts){
  const present=read(yamlPath).includes('contract_rule_id: '+JSON.stringify(a.id));
  assert.equal(present,a.expression_language==='promql',a.id);
}
assert.match(read(contractTests),/assert.equal\(alerts.length, 100\)/);
assert.match(read(contractTests),/assert.equal\(stateRules.length, 6\)/);
assert.match(read(rulesTests),/assert.equal\(compiled.length, 94\)/);
assert.match(read(rulesTests),/assert.equal\(controllerState.length, 6\)/);
assert.match(read(rulesTests),/literal metric_result selectors use the original plan closed values/);
assert.ok(read(readmePath).includes('210个指标和100个'));
assert.ok(read(readmePath).includes('94条PromQL'));
assert.ok(read(readmePath).includes('6条`controller_state`'));
const inverse=structuredClone(candidate);inverse.source=base.source;
inverse.alerts=inverse.alerts.filter(a=>!added.some(b=>b.id===a.id));
for(const a of changed)inverse.alerts[inverse.alerts.findIndex(b=>b.id===a.id)]=a;
inverse.alerts.splice(base.alerts.findIndex(a=>a.id===removed[0].id),0,removed[0]);
assert.deepEqual(inverse,base);
const goReview=json(sourceReview);for(const p of goReview.inputs)assert.deepEqual(pin(p.path),p);
const logs=['docs/evidence/d2-metrics-controller-candidate-20261027-r3.contract-tests.log',
  'docs/evidence/d2-metrics-controller-candidate-20261027-r3.rules-tests.log'];
for(const p of logs)assert.match(read(p),/fail 0/);
const report={kind:'a2_nonimplementer_metrics_registry_controller_r3_source_review.v1',
  status:'exact_registry_metadata_and_rendering_reviewed_native_and_collector_integration_pending',
  inputs:[basePath,proposalPath,candidatePath,yamlPath,generatorPath,contractTests,rulesTests,readmePath,sourceReview,
    'scripts/system-backup-prometheus-rules.mjs',...logs].map(pin),
  counts:{metrics:210,alerts:100,promql:94,controller_state:6},
  delta_from_combined_nine:{unchanged_alert_rows:96,changed_existing_ids:changed.map(a=>a.id),removed_ids:removed.map(a=>a.id),
    added_ids:added.map(a=>a.id),metrics_and_other_metadata_preserved:true,inverse_restores_base:true},
  new_signature_rules_match_reviewed_D_proposal:true,two_cleanup_predicates_match_reviewed_Go_direction:true,
  original_fixed_clock_cases_and_immediate_critical_profiles_preserved:true,
  unknown_collection_metadata_explicit:true,render_function_actually_executed_in_process:true,
  exact_generated_YAML_matches:true,controller_rules_excluded_from_Prometheus_candidate:true,
  both_test_counts_and_contract_readme_updated:true,
  Root_Node_log_observations:{logs:logs.map(pin),both_report_zero_failures:true,not_a_PromQL_or_native_receipt:true},
  required_application_targets:['backend/internal/systembackupcontroller/controller_state_alerts.go',
    'backend/internal/systembackupcontroller/controller_state_alerts_test.go','scripts/system-backup-metrics-registry.mjs',
    'contracts/system-backup/v12/metrics-alert-registry.json','contracts/system-backup/v12/prometheus-alert-rules.yaml',
    'scripts/system-backup-prometheus-rules.test.mjs','scripts/system-backup-contract-artifacts.test.mjs','contracts/system-backup/v12/README.md'],
  limitations:['A2 executed the pure renderer against the exact candidate; the registry generator and Node test logs are separately observed Root results.',
    'Typed controller facts do not prove collector completeness, frozen automatic cleanup start/budget or real residual-volume classification.',
    'The four singleton gate metric projections and raw PromQL evaluator remain unproven.',
    'Required actual current Go package/caller/Linux evidence and final source-scope acceptance are separate pending gates.'],
  full_JSON_schema_validator_executed:false,Go_executed_by_A2:false,SQL_executed:false,PromQL_executed:false,
  live_sources_modified:false,dependencies_installed:false,contract_frozen:false,whole_baseline_accepted:false,production_approved:false};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered);
else{assert.equal(process.argv[2],'--check');assert.equal(read(output),rendered);}
console.log(JSON.stringify({output,status:report.status,counts:report.counts,unchanged:96,renderer_executed:true,PromQL_executed:false}));
