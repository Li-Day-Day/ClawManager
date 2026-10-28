import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {renderPrometheusRules} from '../../scripts/system-backup-prometheus-rules.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
const C='contracts/system-backup/v12/';
const source=C+'metrics-alert-registry.json',generator='scripts/system-backup-metrics-registry.mjs';
const output='docs/evidence/a2-metrics-selector-enum-reviewed-20261027.json';
const markdown='docs/system-backup-a2-metrics-selector-enum-review-20261027.md';
const buffer=new Map();
const raw=p=>{if(!buffer.has(p))buffer.set(p,fs.readFileSync(p));return buffer.get(p);};
const text=p=>raw(p).toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const registry=json(source),originalGenerator=text(generator);
const originalReview=json('docs/evidence/a2-metrics-security-source-reviewed-20261027.json');
for(const p of originalReview.inputs)assert.deepEqual(pin(p.path),p,'original source review input drift');
const oldCandidate=json('docs/evidence/a2-metrics-security-threshold-candidate-20261027.json');
const oldCandidateGenerator=text('docs/evidence/a2-metrics-security-generator-candidate-20261027.mjs.txt');
for(const p of originalReview.candidates)assert.deepEqual(pin(p.path),p,'original eight-expression candidate drift');
const planPath='docs/system-backup-restore-division-plan.md';
const enumDeclarations=[...text(planPath).matchAll(/`metric_result=([^`]+)`/g)];assert.equal(enumDeclarations.length,1);
const resultValues=enumDeclarations[0][1].split('|');
assert.deepEqual(resultValues,['success','failure','rejected','timeout','conflict','canceled']);
const status=json(C+'status-failure-enums.schema.json');
const manifest=json(C+'manifest-system-backup-v1.schema.json');
const control=json(C+'admin-control-resources.schema.json');
const participant=json(C+'maintenance-participant-state.schema.json');
const alertSchema=json(C+'metrics-alert-registry.schema.json');
const values={
 metric_result:resultValues,
 alert_profile:alertSchema.$defs.Alert.properties.profiles.items.enum,
 health_state:control.$defs.HealthState.enum,
 task_purpose:manifest.properties.task_purpose.enum,
 status:[...new Set([...status.$defs.BackupStatus.enum,...status.$defs.DrillStatus.enum,...status.$defs.SimpleTaskStatus.enum])].sort(),
 participant_state:participant.properties.observed_state.enum,
 failure_category:status.$defs.FailureCategory.enum,
 __name__:registry.metrics.map(m=>m.name),
};
const metrics=new Map(registry.metrics.map(m=>[m.name,m]));
// Inspect the current quoted selector syntax, rejecting unsupported syntax.
// This deliberately does not claim to parse or execute PromQL functions.
function selectors(expression){
 const groups=[];let quote=false,escape=false,start=-1;
 for(let i=0;i<expression.length;i++){
  const ch=expression[i];
  if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quote=false;continue;}
  if(ch==='"'){quote=true;continue;}
  assert.notEqual(ch,"'",'single-quoted selector syntax needs explicit review');assert.notEqual(ch,'`','raw selector syntax needs explicit review');
  if(ch==='{'){assert.equal(start,-1,'nested selector');start=i;}
  if(ch==='}'){
   assert.notEqual(start,-1,'unmatched selector close');const body=expression.slice(start+1,i);
   const metricName=/([a-zA-Z_:][a-zA-Z0-9_:]*)\s*$/.exec(expression.slice(0,start))?.[1]??null;
   const matchers=[];let at=0;
   const pattern=/\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*("(?:\\.|[^"\\])*")\s*(?:,|$)/y;
   while(at<body.length){pattern.lastIndex=at;const m=pattern.exec(body);assert.ok(m,'unsupported selector syntax: '+body);matchers.push({label:m[1],operator:m[2],value:JSON.parse(m[3])});at=pattern.lastIndex;}
   groups.push({metric:metricName,matchers});start=-1;
  }
 }
 assert.equal(quote,false,'unclosed string');assert.equal(start,-1,'unclosed selector');return groups;
}
function audit(input){
 const records=[],invalid=[];let groups=0;
 const promql=input.alerts.filter(a=>a.expression_language==='promql');
 assert.equal(promql.length,95);assert.equal(input.alerts.filter(a=>a.expression_language==='controller_state').length,4);
 for(const alert of promql)for(const group of selectors(alert.expression)){
  groups++;if(group.metric)assert.ok(metrics.has(group.metric),'unknown metric selector');
  for(const matcher of group.matchers){
   assert.ok(values[matcher.label],'unmapped selector label: '+matcher.label);
   if(matcher.label!=='__name__'){assert.ok(group.metric);assert.ok(metrics.get(group.metric).labels.includes(matcher.label),'matcher absent from declared metric labels');}
   let admitted,illegal=[];
   if(['=','!='].includes(matcher.operator)){
    if(!values[matcher.label].includes(matcher.value))illegal.push(matcher.value);
    admitted=values[matcher.label].filter(v=>matcher.operator==='='?v===matcher.value:v!==matcher.value);
   }else{
    // Current category patterns are literal alternations. The name selector is
    // a single fixed group alternation whose members are also reviewed below.
    if(matcher.label==='__name__')assert.equal(matcher.value,'clawmanager_system_backup_(credential|ca|catalog_credential|kek|signing_key|attestation|evidence)_expiry_timestamp_seconds');
    else{assert.match(matcher.value,/^[A-Za-z0-9_]+(?:\|[A-Za-z0-9_]+)*$/);illegal=matcher.value.split('|').filter(v=>!values[matcher.label].includes(v));}
    const re=new RegExp('^(?:'+matcher.value+')$');admitted=values[matcher.label].filter(v=>matcher.operator==='=~'?re.test(v):!re.test(v));
   }
   const item={alert:alert.id,metric:group.metric,...matcher,admitted_values:admitted,illegal_literal_values:illegal};records.push(item);
   if(illegal.length||!admitted.length)invalid.push(item);
  }
 }
 return {promql_alerts:promql.length,controller_state_alerts:4,selector_groups:groups,matchers:records,invalid_selectors:invalid,unsupported_current_selector_syntax:0,full_PromQL_parser_executed:false};
}
const before=audit(registry);
assert.equal(before.matchers.length,10);assert.equal(before.selector_groups,9);assert.equal(before.invalid_selectors.length,1);
assert.equal(before.invalid_selectors[0].label,'metric_result');assert.equal(before.invalid_selectors[0].value,'failed');assert.equal(before.invalid_selectors[0].alert,'signature-or-checksum-failure');
const wrong='metric_result="failed"',right='metric_result="failure"';
assert.equal(originalGenerator.split(wrong).length-1,1);assert.equal(oldCandidateGenerator.split(wrong).length-1,1);
const fix=input=>{const copy=structuredClone(input),a=copy.alerts.find(a=>a.id==='signature-or-checksum-failure');assert.equal(a.expression.split(wrong).length-1,1);a.expression=a.expression.replace(wrong,right);return copy;};
const standalone=fix(registry),combined=fix(oldCandidate);
const reset=input=>{const copy=structuredClone(input);copy.alerts.find(a=>a.id==='signature-or-checksum-failure').expression=copy.alerts.find(a=>a.id==='signature-or-checksum-failure').expression.replace(right,wrong);return copy;};
assert.deepEqual(reset(standalone),registry);assert.deepEqual(reset(combined),oldCandidate);
assert.equal(audit(standalone).invalid_selectors.length,0);assert.equal(audit(combined).invalid_selectors.length,0);
const beforeFailedStatus=before.matchers.filter(m=>m.label==='status'&&m.value==='failed');assert.equal(beforeFailedStatus.length,1);
assert.deepEqual(audit(combined).matchers.filter(m=>m.label==='status'&&m.value==='failed'),beforeFailedStatus);
const variants=[['selector',standalone,originalGenerator.replace(wrong,right)],['combined',combined,oldCandidateGenerator.replace(wrong,right)]];
const candidates=[];
for(const [name,data,script]of variants){
 const b=Buffer.from(JSON.stringify(data,null,2)+'\n');const files=[['json',b],['mjs.txt',Buffer.from(script)],['yaml',Buffer.from(renderPrometheusRules(data,sha(b)))]];
 for(const [extension,content]of files){const p=`docs/evidence/a2-metrics-security-${name}-candidate-20261027-r2.${extension}`;if(mode==='--write')fs.writeFileSync(p,content,{flag:'wx'});else assert.deepEqual(raw(p),content);candidates.push(pin(p));}
}
assert.deepEqual(combined.metrics,registry.metrics);assert.equal(combined.alerts.length,99);
assert.deepEqual(combined.alerts.find(a=>a.id==='signature-or-checksum-failure').dedupe_key,['task_type','failure_category']);
readSelf: {raw('docs/evidence/a2-metrics-selector-enum-review-20261027.mjs');raw('scripts/system-backup-prometheus-rules.mjs');}
const closedValueCases=resultValues.map(value=>({value,old_match:value==='failed',corrected_match:value==='failure'}));assert.equal(closedValueCases.filter(c=>c.old_match).length,0);assert.equal(closedValueCases.filter(c=>c.corrected_match).length,1);
const result={kind:'a2_metrics_selector_closed_enum_source_review.v1',status:'confirmed_one_metric_result_literal_violation_candidates_only',finding:'A-METRICS-03',metric_result_original_plan_values:resultValues,closed_value_cases:closedValueCases,source_scan:before,corrected_source_scan:audit(combined),valid_failed_task_status_selector_preserved:true,standalone_expression_changes:1,combined_expression_changes:9,prior_eight_expression_candidates_preserved:true,prior_review:'docs/evidence/a2-metrics-security-source-reviewed-20261027.json',signature_dedupe_inconsistency_resolved:false,labels_metrics_counts_or_thresholds_changed:false,candidates,coverage:'All 95 current PromQL alert strings and their nine selector groups/ten quoted matchers; four controller-state expressions excluded. Only present syntax is inspected; functions/evaluation are not run.',PromQL_parser_or_evaluator_executed:false,live_contracts_or_scripts_modified:false,Go_executed:false,dependencies_installed:false,actual_SQL:false,production_approved:false,goal_complete:false};
result.inputs=[...buffer.keys()].filter(p=>!candidates.some(c=>c.path===p)).sort().map(pin);for(const p of result.inputs)assert.deepEqual(pin(p.path),p);
let md='# A2：告警 selector 闭集独立核对（A-METRICS-03）\n\n';
md+='原计划第15节的 metric_result 闭集是 success/failure/rejected/timeout/conflict/canceled。扫描全部95条 PromQL，覆盖9组 selector、10个匹配器，仅 signature-or-checksum-failure 的 metric_result="failed" 越闭集；它无法匹配合规的 metric_result 值。其余当前 selector 按各自原 enum/metric 名称核对，未发现同类越界。四条 controller-state 不作为 PromQL 解析，整个核对也不等于运行 PromQL parser/evaluator。\n\n';
md+='已分别暂存单独一式修正和与原八式总量修正组合后的九式候选（generator/JSON/YAML）。原八式候选原字节保留，单独修正可精确逆变换回原输入，组合修正可精确逆变换回原八式候选。合法的 status="failed" 选择器保留，未做全局 failed→failure 替换。\n\n';
md+='signature 分支缺少原去重键字段的问题仍单独保留，不擅改标签、去重键、告警数量或生产加载状态。精确表达式、闭集、扫描记录、六份候选和输入摘要见[机器记录](evidence/a2-metrics-selector-enum-reviewed-20261027.json)。复核：`node docs/evidence/a2-metrics-selector-enum-review-20261027.mjs --check`。\n';
if(mode==='--write'){fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.writeFileSync(markdown,md,{flag:'wx'});}else{assert.deepEqual(json(output),result);assert.equal(text(markdown),md);}
console.log(JSON.stringify({mode,promql_alerts:95,selector_groups:before.selector_groups,matchers:before.matchers.length,original_invalid:1,candidate_invalid:0,standalone_changes:1,combined_changes:9,Go_executed:false}));
