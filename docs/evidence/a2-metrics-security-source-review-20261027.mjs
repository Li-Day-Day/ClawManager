import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {renderPrometheusRules} from '../../scripts/system-backup-prometheus-rules.mjs';

const [mode,...extra]=process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
const source='contracts/system-backup/v12/metrics-alert-registry.json';
const schemaPath='contracts/system-backup/v12/metrics-alert-registry.schema.json';
const generator='scripts/system-backup-metrics-registry.mjs';
const renderer='scripts/system-backup-prometheus-rules.mjs';
const output='docs/evidence/a2-metrics-security-source-reviewed-20261027.json';
const markdown='docs/system-backup-a2-metrics-security-source-review-20261027.md';
const candidatePath='docs/evidence/a2-metrics-security-threshold-candidate-20261027.json';
const candidateGeneratorPath='docs/evidence/a2-metrics-security-generator-candidate-20261027.mjs.txt';
const candidateRulesPath='docs/evidence/a2-metrics-security-rules-candidate-20261027.yaml';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(p);
const pin=p=>{const b=raw(p);return{path:p,size:b.length,sha256:sha(b)};};
const originalBytes=raw(source),registry=JSON.parse(originalBytes);
const schema=JSON.parse(raw(schemaPath));
assert.equal(registry.status,'draft');assert.equal(registry.metrics.length,210);assert.equal(registry.alerts.length,99);
const allowed=new Set(schema.$defs.AllowedLabel.enum);
const labelNames=[...new Set(registry.metrics.flatMap(m=>m.labels))].sort();
for(const metric of registry.metrics){assert.equal(new Set(metric.labels).size,metric.labels.length);assert.ok(metric.labels.every(l=>allowed.has(l)));}
for(const label of labelNames)assert.doesNotMatch(label,/^(?:user|session|subject|nonce|request|task|job|operation|installation|secret|endpoint|key)_id$|public_id|password|token|credential_value/);
const families=[
 ['confirmation-rejections','confirmation_rejections_total'],
 ['idempotency-conflicts','idempotency_conflicts_total'],
 ['redaction-failures','redaction_failures_total'],
 ['isolation-rejections','isolation_rejections_total'],
 ['strong-auth-rejections','strong_auth_rejections_total'],
];
const candidate=structuredClone(registry),changes=[],models=[],singleSeriesFamilies=[];
const fixtures=[
 {id:'warning_split',samples:[4,4],threshold:5,old:false,total:true},
 {id:'warning_boundary',samples:[2,3],threshold:5,old:false,total:true},
 {id:'critical_split',samples:[12,12],threshold:20,old:false,total:true},
 {id:'critical_boundary',samples:[10,10],threshold:20,old:false,total:true},
 {id:'below_total',samples:[2,2],threshold:5,old:false,total:false},
 {id:'single_series',samples:[20],threshold:20,old:true,total:true},
];
for(const [id,counter]of families){
 const metric=registry.metrics.find(m=>m.name==='clawmanager_system_backup_'+counter);assert.ok(metric);assert.equal(metric.aggregation,'sum');
 if(!metric.labels.length){singleSeriesFamilies.push({family:id,declared_labels:metric.labels,scope:'No declared-label split counterexample; preserve its original expressions. Runtime scrape grouping is separate.'});continue;}
 for(const [severity,threshold]of [['warning',5],['critical',20]]){
  const before=registry.alerts.find(a=>a.id===id+'-'+severity),after=candidate.alerts.find(a=>a.id===id+'-'+severity);assert.ok(before&&after);
  assert.deepEqual(before.dedupe_key,[]);assert.equal(before.threshold_source,'contract_default');assert.equal(before.counter_reset,'prometheus_increase');
  const oldExpression=`increase(${metric.name}[5m]) >= ${threshold}`;
  assert.equal(before.expression,oldExpression);
  after.expression=`sum(increase(${metric.name}[5m])) >= ${threshold}`;
  changes.push({alert:before.id,metric:metric.name,declared_labels:metric.labels,declared_aggregation:metric.aggregation,declared_dedupe_key:before.dedupe_key,before:oldExpression,after:after.expression});
 }
 for(const fixture of fixtures){
  const old=fixture.samples.some(n=>n>=fixture.threshold),total=fixture.samples.reduce((a,b)=>a+b,0)>=fixture.threshold;
  assert.equal(old,fixture.old);assert.equal(total,fixture.total);
  models.push({family:id,...fixture,scope:'Comparison of post-increase vector samples; not a PromQL parser or increase/raw-series execution.'});
 }
}
const reversed=structuredClone(candidate);for(const change of changes)reversed.alerts.find(a=>a.id===change.alert).expression=change.before;assert.deepEqual(reversed,registry);
const originalGenerator=raw(generator).toString('utf8');let stagedGenerator=originalGenerator;
const loopAnchor="  ['strong-auth-rejections', 'strong_auth_rejections_total'],\n]) {\n";
const windowDeclaration='  const counterWindow = (labelSets[counter] ?? []).length ? `sum(increase(${metric(counter)}[5m]))` : `increase(${metric(counter)}[5m])`;\n';
assert.equal(stagedGenerator.split(loopAnchor).length-1,1);stagedGenerator=stagedGenerator.replace(loopAnchor,loopAnchor+windowDeclaration);
for(const threshold of [5,20]){
 const before='expression: `increase(${metric(counter)}[5m]) >= '+threshold+'`';
 const after='expression: `${counterWindow} >= '+threshold+'`';
 assert.equal(stagedGenerator.split(before).length-1,1);stagedGenerator=stagedGenerator.replace(before,after);
}
let restored=stagedGenerator.replace(windowDeclaration,'');for(const threshold of [5,20])restored=restored.replace('expression: `${counterWindow} >= '+threshold+'`','expression: `increase(${metric(counter)}[5m]) >= '+threshold+'`');assert.equal(restored,originalGenerator);
const candidateBytes=Buffer.from(JSON.stringify(candidate,null,2)+'\n');
const rules=renderPrometheusRules(candidate,sha(candidateBytes));assert.match(rules,/DO NOT LOAD/);
const staged=[[candidatePath,candidateBytes],[candidateGeneratorPath,Buffer.from(stagedGenerator)],[candidateRulesPath,Buffer.from(rules)]];
if(mode==='--write')for(const [p,b]of staged)fs.writeFileSync(p,b,{flag:'wx'});else for(const [p,b]of staged)assert.deepEqual(raw(p),b);
const signature=registry.metrics.find(m=>m.name.endsWith('_signature_operations_total'));
const integrityAlert=registry.alerts.find(a=>a.id==='signature-or-checksum-failure');
const missingDedupeLabels=integrityAlert.dedupe_key.filter(l=>!signature.labels.includes(l));
assert.deepEqual(missingDedupeLabels,['task_type','failure_category']);
const sources=[source,schemaPath,generator,renderer,'scripts/system-backup-prometheus-rules.test.mjs','contracts/system-backup/v12/prometheus-alert-rules.yaml','docs/system-backup-restore-division-plan.md','docs/evidence/a2-metrics-security-source-review-20261027.mjs'];
const inputs=sources.map(pin);
const result={kind:'a2_metrics_security_non_implementer_source_review.v1',status:'changes_requested_for_security_alert_semantics_source_scope_only',review_scope:'A-side declared label names, security threshold aggregation, and available dedupe label information; no B signoff or runtime approval.',metrics:210,alerts:99,declared_label_names:labelNames,declared_label_names_within_original_closed_schema:true,runtime_label_value_enforcement_proven:false,findings:[{id:'A-METRICS-01',status:'candidate_staged',scope:'Four declared-label rejection families, eight alert expressions',problem:'The original expressions compare individual post-increase series to 5/20 while registry aggregation is sum and dedupe_key is empty; split-series totals can cross the declared total threshold without an individual series doing so.',changes},{id:'A-METRICS-02',status:'original_owner_decision_required',alert:integrityAlert.id,declared_dedupe_key:integrityAlert.dedupe_key,signature_branch_metric_labels:signature.labels,missing_signature_branch_dedupe_labels:missingDedupeLabels,problem:'The signature branch cannot supply task_type/failure_category from its declared metric labels. The original owner must define compatible grouping or a reviewed mapping; this candidate does not invent labels or remove dedupe requirements.'}],single_declared_series_families:singleSeriesFamilies,post_increase_model_cases:models,model_cases_passed:models.length,model_is_not_PromQL_runtime:true,PromQL_parser_or_evaluator_executed:false,production_rule_loader_or_missing_series_behavior_validated:false,existing_candidate_generator_tests:{passed:2,failed:0,coverage:'Preservation/rejection tests; not split-series PromQL execution.'},existing_generator_and_rules_check_exit:0,official_operator_semantics_source:'https://prometheus.io/docs/prometheus/latest/querying/operators/',candidate_generator_inverse_exact:true,candidate_only_expression_changes:changes.length,candidates:staged.map(([p])=>pin(p)),inputs,live_contract_or_script_modified:false,Go_executed:false,dependencies_installed:false,actual_SQL:false,production_approved:false,goal_complete:false};
for(const p of inputs)assert.deepEqual(pin(p.path),p);
let md='# A2：指标与安全告警的非实现者源码评审\n\n';
md+='当前 210 指标、99 告警的声明标签均在原闭集内，未发现 user/session/public-ID 等敏感标签名。实际 emitter 的标签值约束和生产执行未由此证明。\n\n';
md+='A-METRICS-01：四类带声明分组标签的 rejection 共八个告警直接比较每条 `increase(...[5m])` 序列，而其 aggregation 为 sum、dedupe_key 为空。模型示例 4+4 在阈值5、12+12在阈值20时会出现总量达到阈值但各序列均未达到的差异。已暂存按现有标签声明增加 `sum(...)` 的生成器/JSON/YAML候选，逆变换精确恢复原生成器；idempotency_conflicts 没有声明标签，两条表达式保持原值，其他 registry 字段不变。[Prometheus 官方说明](https://prometheus.io/docs/prometheus/latest/querying/operators/)定义 vector/scalar 比较逐样本进行。\n\n';
md+='A-METRICS-02：signature-or-checksum-failure 的去重键要求 task_type/failure_category；signature_operations_total 分支只有 key_purpose/metric_result，不能从声明标签得到前两项。须由原 owner 明确兼容分组或受审映射，本候选没有添加标签、拆规则或删去原去重要求。\n\n';
md+='原生成器/rules --check 与现有两条 Node 测试通过，但只证明生成一致性/拒绝逻辑；24条 post-increase 算术模型也不等于 PromQL parser、真实 increase、missing-series 或生产规则执行。候选 YAML 的 DO NOT LOAD 原声明保留，生产 evaluator 与 B 侧交叉评审仍需各自准确证据。\n\n';
md+='准确原输入、十条差异、模型和三个候选摘要见[评审记录](evidence/a2-metrics-security-source-reviewed-20261027.json)。原合同/脚本未动，没有 Go、依赖安装、现场材料或 SQL 操作。复核：`node docs/evidence/a2-metrics-security-source-review-20261027.mjs --check`。\n';
if(mode==='--write'){fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.writeFileSync(markdown,md,{flag:'wx'});}else{assert.deepEqual(JSON.parse(raw(output)),result);assert.equal(raw(markdown).toString(),md);}
console.log(JSON.stringify({mode,metrics:210,alerts:99,closed_label_names:labelNames.length,threshold_changes:changes.length,post_increase_model_cases:models.length,PromQL_executed:false,live_sources_modified:false}));
