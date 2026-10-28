import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import yaml from '../../frontend/node_modules/js-yaml/index.js';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
const fixture='docs/evidence/a2-metrics-split-promtool-raw-series-20261027-r3.yml';
const output='docs/evidence/a2-metrics-split-promtool-source-ready-20261027-r3.json';
const candidatePath='docs/evidence/d2-metrics-controller-registry-candidate-20261027-r3.json';
const basePath='docs/evidence/a2-metrics-security-combined-candidate-20261027-r2.json';
const priorReportPath='docs/evidence/a2-metrics-promtool-fixture-source-ready-20261027-r2.json';
const planPath='docs/system-backup-restore-division-plan.md';
const enumsPath='contracts/system-backup/v12/status-failure-enums.schema.json';
const cache=new Map();
const raw=p=>{if(!cache.has(p))cache.set(p,fs.readFileSync(p));return cache.get(p);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(raw(p).toString('utf8'));
const pin=p=>({path:p,size:raw(p).length,sha256:hash(raw(p))});
const candidate=json(candidatePath),base=json(basePath),prior=json(priorReportPath);
assert.deepEqual(pin(prior.fixture.path),prior.fixture);
const plan=raw(planPath).toString('utf8');
const closed=name=>{const match=plan.match(new RegExp('`'+name+'=([a-z_]+(?:\\|[a-z_]+)+)`'));assert.ok(match,name);return match[1].split('|');};
const metricResults=closed('metric_result'),keyPurposes=closed('key_purpose');
assert.equal(metricResults.length,6);assert.equal(keyPurposes.length,3);
const defs=json(enumsPath).$defs;
const taskTypes=defs.TaskType.enum;
assert.equal(taskTypes.length,4);
const signature=candidate.alerts.find(a=>a.id==='signature-operation-failure');
const verifier=candidate.alerts.find(a=>a.id==='checksum-or-signature-verifier-failure');
const oldCombined=base.alerts.find(a=>a.id==='signature-or-checksum-failure');
assert.equal(signature.expression+' or '+verifier.expression,oldCombined.expression);
assert.deepEqual(signature.dedupe_key,['key_purpose']);
assert.deepEqual(verifier.dedupe_key,['task_type','failure_category']);
const metrics=new Map(candidate.metrics.map(m=>[m.name,m]));
const prefix='clawmanager_system_backup_';
const labelValues={metric_result:metricResults,key_purpose:keyPurposes,task_type:taskTypes,
  warning_category:defs.WarningCategory.enum,failure_category:defs.FailureCategory.enum};
const labelText=labels=>'{'+Object.keys(labels).sort().map(k=>k+'='+JSON.stringify(labels[k])).join(',')+'}';
function series(suffix,labels,values='0 0 0 0 0 1'){
  const metric=prefix+suffix;
  assert.deepEqual(Object.keys(labels).sort(),[...metrics.get(metric).labels].sort());
  for(const [k,v]of Object.entries(labels))assert.ok(labelValues[k]?.includes(v),k+'='+v);
  return {series:metric+labelText(labels),values};
}
const sample=(labels,value=1)=>({labels:labelText(labels),value});
const groups=[];
function add(name,input,sigExpected,verifierExpected){
  const tests=[
    {expr:signature.expression,expected:sigExpected},
    {expr:verifier.expression,expected:verifierExpected},
    {expr:oldCombined.expression,expected:[...sigExpected,...verifierExpected]},
  ];
  groups.push({name,interval:'1m',input_series:input,promql_expr_test:tests.map(t=>({expr:t.expr,eval_time:'5m',
    exp_samples:[...t.expected].sort((a,b)=>a.labels.localeCompare(b.labels))}))});
}
for(const purpose of keyPurposes)for(const result of metricResults){
  const labels={key_purpose:purpose,metric_result:result};
  add('split/signature/'+purpose+'/'+result,[series('signature_operations_total',labels)],result==='failure'?[sample(labels)]:[],[]);
}
for(const task of taskTypes)for(const failure of ['checksum_mismatch','signature_invalid','internal_error','none']){
  const matched=['checksum_mismatch','signature_invalid'].includes(failure);
  const labels={task_type:task,metric_result:failure==='none'?'success':'failure',
    warning_category:matched?'data-integrity-warning':'operational-warning',failure_category:failure};
  add('split/verifier/'+task+'/'+failure,[series('verifier_checks_total',labels)],[],matched?[sample(labels)]:[]);
}
const sigLabels=keyPurposes.map(key_purpose=>({key_purpose,metric_result:'failure'}));
const verifierLabels=[{task_type:'backup',metric_result:'failure',warning_category:'data-integrity-warning',failure_category:'checksum_mismatch'},
  {task_type:'drill',metric_result:'failure',warning_category:'data-integrity-warning',failure_category:'signature_invalid'}];
add('split/simultaneous_original_scopes',[
  ...sigLabels.map(l=>series('signature_operations_total',l)),...verifierLabels.map(l=>series('verifier_checks_total',l))],
  sigLabels.map(l=>sample(l)),verifierLabels.map(l=>sample(l)));
add('split/empty',[],[],[]);
add('split/present_zero',[series('signature_operations_total',sigLabels[0],'0 0 0 0 0 0'),
  series('verifier_checks_total',verifierLabels[0],'0 0 0 0 0 0')],[],[]);
add('split/independent_counter_resets',[series('signature_operations_total',sigLabels[0],'0 0 1 0 1 2'),
  series('verifier_checks_total',verifierLabels[0],'0 0 1 0 1 2')],[sample(sigLabels[0],3)],[sample(verifierLabels[0],3)]);
assert.equal(groups.length,38);
assert.equal(groups.reduce((n,g)=>n+g.promql_expr_test.length,0),114);
const document={rule_files:[],evaluation_interval:'1m',tests:groups};
const rendered=yaml.dump(document,{noRefs:true,sortKeys:false,lineWidth:1000});
assert.deepEqual(yaml.load(rendered),document);
const inputs=[candidatePath,basePath,priorReportPath,prior.fixture.path,planPath,enumsPath,
  'frontend/node_modules/js-yaml/package.json','docs/evidence/a2-metrics-split-promtool-fixture-20261027-r3.mjs'];
for(const p of inputs)raw(p);
for(const p of inputs)assert.equal(hash(fs.readFileSync(p)),hash(raw(p)),p+' changed during preparation');
if(mode==='--write')fs.writeFileSync(fixture,rendered,{flag:'wx'});
else assert.equal(raw(fixture).toString('utf8'),rendered);
const report={kind:'a2_split_signature_verifier_promtool_fixture_source_ready.v1',status:'prepared_not_executed',
  fixture:pin(fixture),inputs:inputs.map(pin),
  exact_rule_bindings:[signature,verifier].map(a=>({id:a.id,expression:a.expression,dedupe_key:a.dedupe_key})),
  historical_corrected_OR_control:{id:oldCombined.id,expression:oldCombined.expression},
  test_groups:38,expression_checks_prepared:114,rule_files_loaded:0,
  coverage:{signature_key_purposes:keyPurposes,signature_metric_results:metricResults,verifier_task_types:taskTypes,
    verifier_failure_categories:['checksum_mismatch','signature_invalid','internal_error','none'],simultaneous_both_rule_outputs:true,
    empty_series:true,present_zero:true,independent_counter_resets:true,all_input_label_names_and_values_checked_against_existing_sources:true},
  prior_fixture_preserved:prior.fixture,prior_prepared_checks:117,
  yaml_structural_roundtrip_only:true,yaml_parser:{package:'js-yaml',version:json('frontend/node_modules/js-yaml/package.json').version,already_present:true},
  official_format:'https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/',
  counter_reference:'https://github.com/prometheus/prometheus/blob/main/promql/promqltest/testdata/functions.test',
  pending_execution_command:['promtool','test','rules',fixture],
  expected_results_proven:false,promtool_executed:false,PromQL_parser_or_evaluator_executed:false,
  source_ready_is_not_PASS:true,notification_dedupe_executed:false,collector_or_missing_series_loader_tested:false,
  dependencies_installed:false,Go_executed:false,SQL_executed:false,live_sources_modified:false,production_approved:false};
const reportText=JSON.stringify(report,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(output,reportText,{flag:'wx'});
else assert.equal(raw(output).toString('utf8'),reportText);
console.log(JSON.stringify({output,fixture,groups:38,expression_checks_prepared:114,yaml_roundtrip:true,promtool_executed:false}));
