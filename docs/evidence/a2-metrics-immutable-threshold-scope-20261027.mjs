import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const registryPath='docs/evidence/a2-metrics-security-original-20261027/metrics-alert-registry.json';
const combinedPath='docs/evidence/a2-metrics-security-combined-candidate-20261027-r2.json';
const output='docs/evidence/a2-metrics-immutable-threshold-scope-reviewed-20261027.json';
const sources=[registryPath,combinedPath,'backend/internal/systembackupcontroller/queue_budget.go',
  'backend/internal/systembackupcontroller/sql_queue_budget.go','backend/internal/systembackupcontroller/gate_initializer.go',
  'backend/internal/systembackupcontroller/gate.go','backend/internal/db/migrations/068_add_system_backup_coordination_observability.sql',
  'docs/system-backup-restore-division-plan.md'];
const bytes=p=>fs.readFileSync(path.join(root,p));
const read=p=>bytes(p).toString('utf8');
const pin=p=>({path:p,size:bytes(p).length,sha256:crypto.createHash('sha256').update(bytes(p)).digest('hex')});
const original=JSON.parse(read(registryPath)),combined=JSON.parse(read(combinedPath));
const promql=original.alerts.filter(a=>a.expression_language==='promql');
assert.equal(promql.length,95);
const selected=promql.filter(a=>a.threshold_source==='immutable_task_config'||/configured_[a-z0-9_]*(?:deadline|timeout|hold)[a-z0-9_]*/.test(a.expression));
assert.equal(promql.filter(a=>a.threshold_source==='immutable_task_config').length,22);
assert.equal(selected.length,23);
const queue=selected.filter(a=>a.id.includes('-queue-age-'));
const gate=selected.filter(a=>/^(gate-wait|capture-hold)-/.test(a.id));
assert.equal(queue.length,16);assert.equal(gate.length,4);
for(const a of selected)assert.deepEqual(combined.alerts.find(b=>b.id===a.id),a);
for(const a of queue)assert.match(a.expression,/^clawmanager_system_backup_(task|operation|preflight|artifact_verify)_queue_deadline_utilization_ratio >= 0\.[59]$/);
const queueModel=read(sources[2]),queueSQL=read(sources[3]),initializer=read(sources[4]),gateCode=read(sources[5]),ddl=read(sources[6]);
for(const text of ['window := item.DeadlineAt.Sub(item.CreatedAt)','elapsed := databaseNow.Sub(item.CreatedAt)',
  'ratio = float64(elapsed) / float64(window)','if ratio > maximum'])assert.ok(queueModel.includes(text));
for(const text of ['Isolation: sql.LevelRepeatableRead','UTC_TIMESTAMP(6)','MaxQueueBudgetRows = 10000',
  'created_at, deadline_at','status = \'pending\'','*remaining+1','MaxPendingQueueDeadlineUtilization(databaseNow, []PendingQueueBudget{item})',
  'if ratio > current'])assert.ok(queueSQL.includes(text));
assert.ok(initializer.includes('const CaptureGateScope = "system-backup:capture"'));
assert.ok(ddl.includes('UNIQUE KEY uk_sb_maintenance_gate (origin_installation_id, scope)'));
for(const text of ['gate_acquisition_timeout_seconds','quiesce_max_hold_seconds','acquiring_started_at','held_at',
  'acquisition_deadline_at','absolute_hold_deadline_at'])assert.ok(ddl.includes(text)&&gateCode.includes(text));
const labels=new Map(original.metrics.map(m=>[m.name,m.labels]));
const categories={queue:[],gate:[],cleanup:[],residual_presence:[],residual_overdue:[]};
const details=selected.map(a=>{
  let category;
  if(queue.includes(a))category='queue';
  else if(gate.includes(a))category='gate';
  else if(a.id==='cleanup-overdue')category='cleanup';
  else if(a.id==='restore-residual-volume')category='residual_presence';
  else if(a.id==='restore-residual-volume-overdue')category='residual_overdue';
  else assert.fail('Unclassified selected rule '+a.id);
  categories[category].push(a.id);
  const metricNames=[...new Set(a.expression.match(/clawmanager_system_backup_[a-z0-9_]+/g)??[])];
  return {id:a.id,threshold_source:a.threshold_source,expression:a.expression,category,
    declared_metric_labels:metricNames.map(name=>({name,labels:labels.get(name)}))};
});
assert.deepEqual(categories.cleanup,['cleanup-overdue']);
assert.deepEqual(categories.residual_presence,['restore-residual-volume']);
assert.deepEqual(categories.residual_overdue,['restore-residual-volume-overdue']);
const residualModels=[
  {name:'younger_residual_owner_overdue',ages:[700,100],frozen_deadlines:[900,60],current_deadline:900},
  {name:'same_global_inputs_no_residual_owner_overdue',ages:[700,100],frozen_deadlines:[900,900],current_deadline:900},
].map(m=>({...m,residual_owners:[true,true],global_residual_count:2,global_residual_oldest_age:Math.max(...m.ages),
  current_global_expression:Math.max(...m.ages)>m.current_deadline,
  owner_correct_critical:m.ages.some((age,i)=>age>m.frozen_deadlines[i])}));
assert.equal(residualModels[0].current_global_expression,residualModels[1].current_global_expression);
assert.notEqual(residualModels[0].owner_correct_critical,residualModels[1].owner_correct_critical);
const singletonModels=[
  {rule:'gate-wait-near-timeout',age:100,frozen:120,current:240,fraction:0.8},
  {rule:'gate-wait-timeout',age:100,frozen:120,current:60,fraction:1},
  {rule:'capture-hold-near-limit',age:250,frozen:300,current:600,fraction:0.8},
  {rule:'capture-hold-limit',age:350,frozen:300,current:600,fraction:1},
].map(m=>({...m,using_frozen_gate_value:m.age>=m.frozen*m.fraction,using_current_config:m.age>=m.current*m.fraction}));
assert.ok(singletonModels.every(m=>m.using_frozen_gate_value!==m.using_current_config));
const selectedIDs=new Set(selected.map(a=>a.id));
const report={
  kind:'a2_complete_immutable_deadline_rule_source_scope_audit.v1',
  status:'source_scope_reviewed_two_mixed_owner_cleanup_rules_require_owner_predicates_four_singleton_gate_projections_unproven',
  sources:sources.map(pin),scanned_promql_alerts:95,immutable_task_config_alerts:22,selected_including_direct_global_cleanup_deadline:23,
  unselected_promql_alerts:72,all_promql_inventory:promql.map(a=>({id:a.id,threshold_source:a.threshold_source,selected:selectedIDs.has(a.id)})),
  categories,selected_rules:details,
  interpretations:{
    queue:'16 rules consume max of per-owner frozen elapsed/window ratios. Existing source computes ratios before aggregation under one bounded read-only database snapshot; no global current-deadline substitution is used in these predicates.',
    gate:'4 formulas can retain scalar thresholds if the metrics collector atomically projects the same single active D capture gate frozen policy. Current active-config substitution is incorrect; frozen gauge emission is not proven by this source audit.',
    cleanup:'cleanup-overdue loses per-owner immutable budgets when reduced to global oldest age and current config; metadata current_system_config does not override the task-snapshot requirement.',
    residual_presence:'restore-residual-volume is a presence warning, with no deadline comparison. Keeping it does not itself resolve critical timing or notification suppression behavior.',
    residual_overdue:'restore-residual-volume-overdue has the same irreversible mixed-owner budget loss even though its metadata already says immutable_task_config.',
  },
  residual_information_loss_countermodels:residualModels,
  singleton_current_config_countermodels:singletonModels,
  controller_state_direction:{rules:['cleanup-overdue','restore-residual-volume-overdue'],expected_total:100,expected_promql:94,expected_controller_state:6,
    new_metric_required_by_predicate:false,source_fact_inputs_not_approved_by_model:true,
    residual_classification:'A ResidualVolume boolean suffices only after a complete authoritative resource/owner collection proves that classification; unknown is not false.',
    completeness:'Complete must cover the full owner/resource domain, frozen budgets, durable cleanup clock and residual-volume classification; missing/partial/unknown cannot be healthy.',
    implementation_and_native_validation_pending:true},
  actual_gate_metric_emitter_and_frozen_projection_proven:false,SQL_executed:false,Go_executed:false,PromQL_executed:false,
  source_models_are_not_runtime_PASS:true,live_sources_modified:false,dependencies_installed:false,whole_baseline_accepted:false,production_approved:false,
};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered);
else{assert.equal(process.argv[2],'--check');assert.equal(read(output),rendered);}
console.log(JSON.stringify({output,scanned:95,immutable:22,selected:23,categories:Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,v.length])),Go_executed:false}));
