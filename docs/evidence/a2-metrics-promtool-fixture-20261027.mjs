import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import yaml from '../../frontend/node_modules/js-yaml/index.js';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
const output='docs/evidence/a2-metrics-promtool-fixture-source-ready-20261027-r2.json';
const fixturePath='docs/evidence/a2-metrics-promtool-raw-series-20261027-r2.yml';
const markdown='docs/system-backup-a2-metrics-promtool-fixture-20261027.md';
const bytes=new Map();const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=p=>{if(!bytes.has(p))bytes.set(p,fs.readFileSync(p));return bytes.get(p);};
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const originalPath='contracts/system-backup/v12/metrics-alert-registry.json';
const candidatePath='docs/evidence/a2-metrics-security-combined-candidate-20261027-r2.json';
const selectorReview=json('docs/evidence/a2-metrics-selector-enum-reviewed-20261027.json');
for(const p of selectorReview.candidates)assert.deepEqual(pin(p.path),p);
const original=json(originalPath),candidate=json(candidatePath);
assert.equal(original.alerts.length,99);assert.equal(candidate.alerts.length,99);
const metricMap=new Map(candidate.metrics.map(m=>[m.name,m]));
const failureValues=json('contracts/system-backup/v12/status-failure-enums.schema.json').$defs.FailureCategory.enum;
const profiles=json('contracts/system-backup/v12/manifest-system-backup-v1.schema.json').properties.deployment_profile.enum;
const families=[
 ['confirmation-rejections','confirmation_rejections_total',[{failure_category:'confirmation_invalid'},{failure_category:'permission_denied'}]],
 ['redaction-failures','redaction_failures_total',[{failure_category:'redaction_failed'},{failure_category:'internal_error'}]],
 ['isolation-rejections','isolation_rejections_total',[{profile:'cluster',failure_category:'isolation_invalid'},{profile:'single-node',failure_category:'isolation_invalid'}]],
 ['strong-auth-rejections','strong_auth_rejections_total',[{failure_category:'validation_failed'},{failure_category:'permission_denied'}]],
];
const cases=[
 {name:'warning_split',severity:'warning',increments:[4,4],expected:8,old:[]},
 {name:'warning_boundary',severity:'warning',increments:[2,3],expected:5,old:[]},
 {name:'warning_below',severity:'warning',increments:[2,2],expected:null,old:[]},
 {name:'critical_split',severity:'critical',increments:[12,12],expected:24,old:[]},
 {name:'critical_boundary',severity:'critical',increments:[10,10],expected:20,old:[]},
 {name:'critical_below',severity:'critical',increments:[9,9],expected:null,old:[]},
 {name:'single_warning',severity:'warning',increments:[5],expected:5,old:[5]},
 {name:'single_critical',severity:'critical',increments:[20],expected:20,old:[20]},
 {name:'reset_warning',severity:'warning',raw:['0 0 1 0 1 2','0 0 1 0 1 2'],expected:6,old:[]},
 {name:'reset_critical',severity:'critical',raw:['0 0 4 0 3 6','0 0 4 0 3 6'],expected:20,old:[]},
 {name:'empty_warning',severity:'warning',increments:[],expected:null,old:[]},
 {name:'empty_critical',severity:'critical',increments:[],expected:null,old:[]},
 {name:'present_zero_warning',severity:'warning',increments:[0,0],expected:null,old:[]},
];
const labels=v=>'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,w])=>k+'='+JSON.stringify(w)).join(',')+'}';
const series=(name,values)=>name+labels(values);
const normalValues=n=>[0,0,0,0,Math.floor(n/2),n].join(' ');
const scalar=value=>value===null?[]:[{labels:'{}',value}];
const groups=[],bindings=[];
for(const [family,counter,labelGroups]of families){
 const metric='clawmanager_system_backup_'+counter;
 for(const group of labelGroups){
  assert.deepEqual(Object.keys(group).sort(),metricMap.get(metric).labels.toSorted());
  if(group.failure_category)assert.ok(failureValues.includes(group.failure_category));
  if(group.profile)assert.ok(profiles.includes(group.profile));
 }
 for(const c of cases){
  const id=family+'-'+c.severity,old=original.alerts.find(a=>a.id===id),revised=candidate.alerts.find(a=>a.id===id);assert.ok(old&&revised);
  const rawValues=c.raw??c.increments.map(normalValues);
  const input=rawValues.map((values,i)=>({series:series(metric,labelGroups[i]),values}));
  for(const row of input){const values=row.values.split(' ').map(Number);assert.equal(values.length,6);assert.ok(values.every(v=>Number.isSafeInteger(v)&&v>=0));}
  if(c.name.startsWith('reset_'))for(const row of input){const v=row.values.split(' ').map(Number);assert.ok(v.some((n,i)=>i>0&&n<v[i-1]),'raw reset absent');}
  const candidateSamples=scalar(c.expected),oldSamples=c.old.map((value,i)=>({labels:labels(labelGroups[i]),value}));
  const group={name:family+'/'+c.name,interval:'1m',input_series:input,promql_expr_test:[{expr:revised.expression,eval_time:'5m',exp_samples:candidateSamples},{expr:old.expression,eval_time:'5m',exp_samples:oldSamples}]};
  groups.push(group);bindings.push({test_group:group.name,alert_id:id,candidate_expression:revised.expression,old_expression:old.expression,case:c.name,role:'Exact candidate expression and original-expression control',expected_results_proven:false,raw_counter_reset:c.name.startsWith('reset_')});
 }
}
const signatureId='signature-or-checksum-failure';
const signatureOriginal=original.alerts.find(a=>a.id===signatureId).expression;
const signatureCandidate=candidate.alerts.find(a=>a.id===signatureId).expression;
assert.ok(signatureOriginal.includes('metric_result="failed"'));assert.ok(signatureCandidate.includes('metric_result="failure"'));
const metricResults=selectorReview.metric_result_original_plan_values;
for(const result of metricResults){
 const sampleLabels={key_purpose:'capture_certificate',metric_result:result};
 const group={name:'signature/legal_'+result,interval:'1m',input_series:[{series:series('clawmanager_system_backup_signature_operations_total',sampleLabels),values:'0 0 0 0 0 1'}],promql_expr_test:[{expr:signatureCandidate,eval_time:'5m',exp_samples:result==='failure'?[{labels:labels(sampleLabels),value:1}]:[]},{expr:signatureOriginal,eval_time:'5m',exp_samples:[]}]};
 groups.push(group);bindings.push({test_group:group.name,alert_id:signatureId,candidate_expression:signatureCandidate,old_expression:signatureOriginal,case:'Original closed metric_result '+result,expected_results_proven:false});
}
const statusId='acceptance-task-failed',statusExpression=original.alerts.find(a=>a.id===statusId).expression;
assert.equal(candidate.alerts.find(a=>a.id===statusId).expression,statusExpression);assert.ok(statusExpression.includes('status="failed"'));
const statusLabels={task_type:'backup',task_purpose:'acceptance',status:'failed'};
groups.push({name:'status/valid_failed_preserved',interval:'1m',input_series:[{series:series('clawmanager_system_backup_task_transitions_total',statusLabels),values:'0 0 0 0 0 1'}],promql_expr_test:[{expr:statusExpression,eval_time:'5m',exp_samples:[{labels:labels(statusLabels),value:1}]}]});
bindings.push({test_group:'status/valid_failed_preserved',alert_id:statusId,unchanged_expression:statusExpression,case:'Valid task status failed is not a metric_result spelling',expected_results_proven:false});
const fixture={rule_files:[],evaluation_interval:'1m',tests:groups};
const yamlText='# SOURCE READY ONLY: promtool and all PromQL expressions have NOT been executed.\n# Exact expressions are pinned in the companion JSON. No production rule loading.\n'+yaml.dump(fixture,{noRefs:true,lineWidth:-1,sortKeys:false});
assert.deepEqual(yaml.load(yamlText),fixture,'YAML structural roundtrip');
const exprCount=groups.reduce((n,g)=>n+g.promql_expr_test.length,0);
assert.equal(groups.length,59);assert.equal(exprCount,117);assert.equal(new Set(groups.map(g=>g.name)).size,groups.length);
const expectedIds=[...new Set(families.flatMap(([f])=>[f+'-warning',f+'-critical']).concat([signatureId,statusId]))].sort();
assert.deepEqual([...new Set(bindings.map(b=>b.alert_id))].sort(),expectedIds);
const supportedRoot=['rule_files','evaluation_interval','tests'];assert.deepEqual(Object.keys(fixture),supportedRoot);
if(mode==='--write')fs.writeFileSync(fixturePath,yamlText,{flag:'wx'});else assert.equal(raw(fixturePath).toString('utf8'),yamlText);
raw('docs/evidence/a2-metrics-promtool-fixture-20261027.mjs');raw('frontend/node_modules/js-yaml/package.json');
const report={kind:'a2_metrics_promtool_raw_series_fixture_source_ready.v1',status:'prepared_not_executed',fixture:pin(fixturePath),official_format:'https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/',counter_semantics_reference:'https://github.com/prometheus/prometheus/blob/main/promql/promqltest/testdata/functions.test',original_registry:pin(originalPath),exact_combined_candidate:pin(candidatePath),test_groups:groups.length,promql_expression_checks_prepared:exprCount,rule_files_loaded:0,expression_rule_ids:expectedIds,bindings,coverage:['split threshold boundaries','below threshold','single series','counter reset','empty series','present zero series','all six legitimate metric_result values','valid failed task status'],yaml_structural_roundtrip_only:true,yaml_parser:{package:'js-yaml',version:json('frontend/node_modules/js-yaml/package.json').version,already_present:true},expected_results_proven:false,promtool_executed:false,PromQL_parser_or_evaluator_executed:false,source_ready_is_not_PASS:true,missing_series_loader_or_production_behavior_proven:false,dependencies_installed:false,Go_executed:false,actual_SQL:false,production_approved:false,goal_complete:false};
report.inputs=[...bytes.keys()].filter(p=>p!==fixturePath).sort().map(pin);for(const p of report.inputs){const b=fs.readFileSync(p.path);assert.equal(sha(b),p.sha256);}
let md='# A2：原始时序 PromQL fixture（未执行）\n\n';
md+='按[官方 promtool 格式](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)准备 59 组原始时序、117 个表达式检查，精确绑定九式组合候选及原表达式负控，另保留合法 task status="failed"。包含跨标签阈值边界、低于阈值、单序列、counter reset、空 series、存在但全零 series，以及六种合法 metric_result。\n\n';
md+='本地只完成既有 js-yaml 的结构往返检查，未执行 promtool、PromQL、真实 increase 或规则加载；所有 exp_samples 仍是待实际 evaluator 验证的预期，不记 PASS。原始 reset 数据含明确下降，前两分钟为零以避免依赖左边界外推；increase 的去名/重置预期参考 Prometheus 原测试，不以本地算术代替执行。\n\n';
md+='具备受控 promtool 后可运行：`promtool test rules docs/evidence/a2-metrics-promtool-raw-series-20261027-r2.yml`。届时记录实际二进制版本/SHA、完整 stdout/stderr 与退出码，修正不成立的预期后重新评审；不得把本 source-ready 记录当成运行回执。fixture 的 rule_files 为空，只评估表达式，不装载候选生产 YAML。\n\n';
md+='准确原输入、候选 SHA、每组表达式绑定及未执行标记见[机器清单](evidence/a2-metrics-promtool-fixture-source-ready-20261027-r2.json)。复核：`node docs/evidence/a2-metrics-promtool-fixture-20261027.mjs --check`；此命令仍只核源码、YAML结构和绑定。\n';
if(mode==='--write'){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});fs.writeFileSync(markdown,md,{flag:'wx'});}else{assert.deepEqual(json(output),report);assert.equal(raw(markdown).toString('utf8'),md);}
console.log(JSON.stringify({mode,test_groups:groups.length,expression_checks_prepared:exprCount,yaml_structure_checked:true,promtool_executed:false,expected_results_proven:false,status:'prepared_not_executed'}));
