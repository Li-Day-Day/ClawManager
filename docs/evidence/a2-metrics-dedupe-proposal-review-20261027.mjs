import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const proposalPath = 'docs/evidence/d2-metrics-dedupe-proposal-20261027-r1.json';
const candidatePath = 'docs/evidence/d2-metrics-dedupe-proposal-candidate-20261027-r1.json';
const basePath = 'docs/evidence/a2-metrics-security-combined-candidate-20261027-r2.json';
const schemaPath = 'contracts/system-backup/v12/metrics-alert-registry.schema.json';
const planPath = 'docs/system-backup-restore-division-plan.md';
const outputPath = 'docs/evidence/a2-metrics-dedupe-proposal-reviewed-20261027-r1.json';
const bytes = p => fs.readFileSync(path.join(root, p));
const json = p => JSON.parse(bytes(p).toString('utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pin = p => ({path:p,size:bytes(p).length,sha256:sha(bytes(p))});
const proposal = json(proposalPath), candidate = json(candidatePath), base = json(basePath), schema = json(schemaPath);
for (const p of [proposal.candidate, proposal.base_combined_nine_expression_candidate, proposal.original_plan,
  proposal.original_source_archive, proposal.carrier_review]) assert.deepEqual(pin(p.path), p);
assert.equal(candidate.alerts.length, 100);
assert.equal(candidate.source.alert_count, 100);
assert.equal(candidate.alerts.filter(a => a.expression_language === 'promql').length, 96);
assert.equal(candidate.alerts.filter(a => a.expression_language === 'controller_state').length, 4);
assert.deepEqual(candidate.metrics, base.metrics);
assert.deepEqual({...candidate,alerts:base.alerts,source:base.source}, base);
const old = new Map(base.alerts.map(a => [a.id,a]));
const current = new Map(candidate.alerts.map(a => [a.id,a]));
assert.equal(current.size, candidate.alerts.length);
const added = candidate.alerts.filter(a => !old.has(a.id));
const removed = base.alerts.filter(a => !current.has(a.id));
const changed = base.alerts.filter(a => current.has(a.id) && JSON.stringify(a) !== JSON.stringify(current.get(a.id)));
const unchanged = base.alerts.filter(a => current.has(a.id) && JSON.stringify(a) === JSON.stringify(current.get(a.id)));
assert.equal(unchanged.length,97);
assert.deepEqual(changed.map(a=>a.id),['cleanup-overdue']);
assert.deepEqual(removed.map(a=>a.id),['signature-or-checksum-failure']);
assert.deepEqual(added.map(a=>a.id),['signature-operation-failure','checksum-or-signature-verifier-failure']);
const cleanup = current.get('cleanup-overdue');
assert.deepEqual(cleanup,{...old.get('cleanup-overdue'),dedupe_key:[]});
const sig = current.get('signature-operation-failure'), verifier = current.get('checksum-or-signature-verifier-failure');
assert.deepEqual(sig.dedupe_key,['key_purpose']);
assert.deepEqual(verifier.dedupe_key,['task_type','failure_category']);
assert.equal(sig.expression+' or '+verifier.expression,removed[0].expression);
for (const branch of added) {
  const reference = removed[0];
  for (const field of Object.keys(reference).filter(k=>!['id','expression','dedupe_key','recovery_condition','runbook'].includes(k))) {
    assert.deepEqual(branch[field],reference[field],`${branch.id}/${field}`);
  }
  assert.equal(branch.runbook,'system-backup/'+branch.id);
  const metric = branch.expression.match(/clawmanager_system_backup_[a-z0-9_]+/)[0];
  const labels = candidate.metrics.find(m=>m.name===metric).labels;
  assert.ok(branch.dedupe_key.every(k=>labels.includes(k)));
}
for (const a of candidate.alerts) {
  assert.deepEqual(Object.keys(a).sort(),Object.keys(schema.$defs.Alert.properties).sort());
  assert.ok(a.dedupe_key.every(k=>schema.$defs.AllowedLabel.enum.includes(k)));
  assert.equal(new Set(a.dedupe_key).size,a.dedupe_key.length);
}
const inverse = structuredClone(candidate);
inverse.source.alert_count = base.source.alert_count;
inverse.alerts = inverse.alerts.filter(a=>!added.some(b=>b.id===a.id));
inverse.alerts[inverse.alerts.findIndex(a=>a.id==='cleanup-overdue')] = old.get('cleanup-overdue');
inverse.alerts.splice(base.alerts.findIndex(a=>a.id===removed[0].id),0,removed[0]);
assert.deepEqual(inverse,base);
// Models use already-computed predicate booleans, never raw counter samples.
const branchModels = [false,true].flatMap(s=>[false,true].map(v=>({signature_condition:s,verifier_condition:v,
  corrected_combined_fires:s||v,any_split_rule_fires:[s,v].some(Boolean)})));
assert.ok(branchModels.every(m=>m.corrected_combined_fires===m.any_split_rule_fires));
const cleanupModels = [
  {name:'heterogeneous_immutable_deadline_false_negative',ages:[700,100],immutable_deadlines:[900,60],current_deadline:900},
  {name:'config_change_false_positive',ages:[700,100],immutable_deadlines:[900,900],current_deadline:600},
  {name:'same_global_inputs_without_overdue',ages:[700,100],immutable_deadlines:[900,900],current_deadline:900},
].map(m=>({...m,global_oldest_age:Math.max(...m.ages),current_global_predicate:Math.max(...m.ages)>m.current_deadline,
  any_owner_immutable_deadline_exceeded:m.ages.some((age,i)=>age>m.immutable_deadlines[i])}));
assert.equal(cleanupModels[0].current_global_predicate,false);
assert.equal(cleanupModels[0].any_owner_immutable_deadline_exceeded,true);
assert.equal(cleanupModels[1].current_global_predicate,true);
assert.equal(cleanupModels[1].any_owner_immutable_deadline_exceeded,false);
assert.equal(cleanupModels[0].global_oldest_age,cleanupModels[2].global_oldest_age);
assert.equal(cleanupModels[0].current_deadline,cleanupModels[2].current_deadline);
const plan = bytes(planPath).toString('utf8').split(/\r?\n/);
assert.ok(plan[805].includes('任务级阈值来自 immutable config snapshot'));
assert.ok(plan[808].includes('Checksum/signature/catalog conflict 立即 critical'));
const report = {
  kind:'a2_nonimplementer_metrics_dedupe_D_proposal_source_review.v1',
  decision:'split_branch_and_global_dedupe_corrections_source_compatible; preservation_count_correction_and_cleanup_deadline_semantics_remain_open',
  inputs:[proposalPath,candidatePath,basePath,schemaPath,planPath].map(pin),
  exact_delta:{unchanged_alert_rows:97,changed_existing_alert_ids:changed.map(a=>a.id),removed_ids:removed.map(a=>a.id),added_ids:added.map(a=>a.id),
    metrics_unchanged:true,other_top_level_metadata_unchanged_except_alert_count:true,inverse_restores_base:true,alerts:100,promql:96,controller_state:4},
  proposal_preservation_claim:{claimed_other_98_rows_preserved:proposal.other_98_alert_rows_preserved,exact_unchanged:97,
    correction_required:'97 byte-equivalent alert objects; cleanup is a separate one-field edit; old signature rule is replaced by two rules'},
  split_rule_findings:{severity_for_profiles_reset_and_fixed_clock_inherited:true,expressions_are_exact_old_corrected_OR_branches:true,
    dedupe_keys_supported_by_existing_declared_labels:true,rule_keys_and_runbooks_are_changed:true},
  split_post_predicate_models:branchModels,
  cleanup_dedupe_finding:'Empty dedupe matches the current unlabeled global expression output; this alone does not prove owner-immutable deadline semantics.',
  cleanup_immutable_deadline_countermodels:{assumption:'Each task cleanup retains its own immutable deadline; global oldest age is max age, configured deadline is current config.',
    original_plan_pointer:'docs/system-backup-restore-division-plan.md:806',models:cleanupModels,
    conclusion:'The same two global gauge inputs can represent both an overdue and a non-overdue owner set. A current-global comparison alone cannot distinguish them under this assumption.',
    source_projection_or_metric_contract_selected:false},
  required_followup:['Correct preservation count in a new proposal revision while preserving r1 bytes',
    'Original A/D owners resolve whether task-immutable cleanup semantics require a separate source/metric correction; do not claim resolved by dedupe=[]',
    'Generate exact candidate scripts/JSON/YAML, update both affected test counts and README, run actual affected checks',
    'Validate raw PromQL cases with an existing evaluator; add split-rule label and cleanup cases, preserving historical r2 fixture'],
  full_JSON_schema_validator_executed:false,bounded_closed_field_and_label_checks_executed:true,
  PromQL_evaluator_executed:false,collector_runtime_tested:false,notification_dedupe_executed:false,
  live_sources_modified:false,Go_or_SQL_executed:false,dependencies_installed:false,contract_frozen:false,production_approved:false,
};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,outputPath),rendered);
else {assert.equal(process.argv[2],'--check');assert.equal(bytes(outputPath).toString('utf8'),rendered);}
console.log(JSON.stringify({output:outputPath,decision:report.decision,unchanged:97,split_post_predicate_models:4,cleanup_countermodels:3,PromQL_executed:false}));
