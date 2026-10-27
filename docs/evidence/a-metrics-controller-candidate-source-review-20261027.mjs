import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
import {renderPrometheusRules} from '../../scripts/system-backup-prometheus-rules.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const text=p=>read(p).toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const manifest='docs/evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2.source.json';
const output='docs/evidence/a-metrics-controller-candidate-source-reviewed-20261027-r1.json';
const m=json(manifest),base=json(m.base_snapshot.path);
assert.equal(m.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
assert.equal(m.base_source_sha256,'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
assert.equal(sourceDigest(base.files),m.base_source_sha256);assert.equal(sourceDigest(m.files),m.source_sha256);
assert.deepEqual(enumerate(root),base.files,'live source no longer equals reviewed base; renew review');
assert.equal(m.files.length,1718);assert.equal(m.changes.length,8);
const expected=[
 'backend/internal/systembackupcontroller/controller_state_alerts.go',
 'backend/internal/systembackupcontroller/controller_state_alerts_test.go',
 'scripts/system-backup-metrics-registry.mjs','contracts/system-backup/v12/metrics-alert-registry.json',
 'contracts/system-backup/v12/prometheus-alert-rules.yaml','scripts/system-backup-prometheus-rules.test.mjs',
 'scripts/system-backup-contract-artifacts.test.mjs','contracts/system-backup/v12/README.md'];
assert.deepEqual(m.changes.map(c=>c.path),expected);
const sources=new Map();
for(const c of m.changes){assert.deepEqual(pin(c.candidate.path),c.candidate);assert.deepEqual(pin(c.path),c.before);sources.set(c.path,c.candidate.path);}
const before=new Map(base.files.map(p=>[p.path,p])),after=new Map(m.files.map(p=>[p.path,p]));
assert.deepEqual([...before.keys()].sort(),[...after.keys()].sort());
assert.deepEqual([...before.keys()].filter(p=>before.get(p).sha256!==after.get(p).sha256).sort(),[...expected].sort());
for(const c of m.changes)assert.deepEqual(after.get(c.path),c.after);
const registryPath=sources.get(expected[3]),registry=json(registryPath),original=json(expected[3]);
assert.deepEqual(registry.metrics,original.metrics);assert.equal(registry.metrics.length,210);assert.equal(registry.alerts.length,100);
const a=new Map(registry.alerts.map(r=>[r.id,r]));assert.equal(a.size,100);
assert.equal(registry.alerts.filter(r=>r.expression_language==='promql').length,94);
assert.equal(registry.alerts.filter(r=>r.expression_language==='controller_state').length,6);
const changed=[],unchanged=[],removed=[];
for(const old of original.alerts){const now=a.get(old.id);if(!now){removed.push(old.id);continue;}
 if(JSON.stringify(old)===JSON.stringify(now))unchanged.push(old.id);else changed.push(old.id);}
assert.equal(unchanged.length,88);assert.equal(changed.length,10);assert.deepEqual(removed,['signature-or-checksum-failure']);
for(const family of ['confirmation-rejections','redaction-failures','isolation-rejections','strong-auth-rejections'])for(const level of ['warning','critical']){
 const id=family+'-'+level,old=original.alerts.find(r=>r.id===id),now=a.get(id),copy=structuredClone(now);
 assert.match(old.expression,/^increase\(.+\) >= (5|20)$/);
 assert.equal(now.expression,old.expression.replace(/^(increase\(.+\))( >= (?:5|20))$/,'sum($1)$2'));
 copy.expression=old.expression;assert.deepEqual(copy,old);
}
for(const id of ['cleanup-overdue','restore-residual-volume-overdue']){
 const r=a.get(id);assert.equal(r.expression_language,'controller_state');assert.equal(r.severity,'critical');
 assert.equal(r.for_seconds,0);assert.equal(r.threshold_source,'immutable_task_config');assert.equal(r.missing_series,'unknown');assert.deepEqual(r.dedupe_key,[]);
}
const signature=a.get('signature-operation-failure'),verifier=a.get('checksum-or-signature-verifier-failure');
assert.deepEqual(signature.dedupe_key,['key_purpose']);assert.deepEqual(verifier.dedupe_key,['task_type','failure_category']);
for(const r of [signature,verifier]){assert.equal(r.severity,'critical');assert.equal(r.for_seconds,0);}
const oldSignature=original.alerts.find(r=>r.id===removed[0]);
assert.equal([signature.expression,verifier.expression].join(' or '),oldSignature.expression.replace('metric_result="failed"','metric_result="failure"'));
assert.equal(text(sources.get(expected[4])),renderPrometheusRules(registry,sha(read(registryPath))));
const code=text(sources.get(expected[0])),oldCode=text(expected[0]);
const coreStart=oldCode.indexOf('\tdecisions, err := evaluateAcceptanceAnomalyDecisions');
const coreEnd=oldCode.indexOf('\treturn decisions, nil',coreStart);
assert.ok(coreStart>0&&coreEnd>coreStart);assert.ok(code.includes(oldCode.slice(coreStart,coreEnd)),'previous evidence and issuer predicates changed');
const helperStart=oldCode.indexOf('func evaluateAcceptanceAnomalyDecisions');assert.ok(helperStart>0);
assert.equal(code.slice(code.indexOf('func evaluateAcceptanceAnomalyDecisions')),oldCode.slice(helperStart));
for(const guard of ['!cleanup.Complete','!cleanup.ObservedAt.Equal(snapshot.Now)','candidate.ResidualVolume == nil','candidate.ImmutableDeadline <= 0','candidate.Age > candidate.ImmutableDeadline'])assert.ok(code.includes(guard),guard);
assert.ok(code.indexOf('candidate.ResidualVolume == nil')<code.indexOf('cleanupOverdue = cleanupOverdue ||'));
assert.doesNotMatch(code.slice(code.indexOf('for _, candidate := range cleanup.Owners'),code.indexOf('\tdecisions, err :=')),/\bbreak\b/);
const roots=[];
for(const p of base.files.filter(p=>p.path.endsWith('.go'))){
 if(/EvaluateControllerStateAlerts|ControllerStateAlertSnapshot/.test(text(p.path)))roots.push(p.path);
}
assert.deepEqual(roots.sort(),expected.slice(0,2).sort(),'new production callers require review');
const peer='docs/evidence/a2-metrics-controller-registry-reviewed-20261027-r3.json',review=json(peer);
for(const p of review.inputs)assert.deepEqual(pin(p.path),p);
const result={kind:'a_metrics_controller_candidate_source_review.v1',reviewer:'A1',
 status:'reviewed_exact_eight_private_candidate_inputs_native_and_runtime_acceptance_pending',
 base_source_sha256:m.base_source_sha256,candidate_source_sha256:m.source_sha256,files:1718,changes:m.changes,
 source_manifest:pin(manifest),independent_A2_review:pin(peer),
 exact_eight_delta_set_verified:true,unchanged_original_alerts:unchanged.length,changed_existing_alerts:changed,
 removed_alerts:removed,added_alerts:[signature.id,verifier.id],
 previous_controller_predicate_core_bytes_preserved:true,production_caller_files:roots,
 per_owner_strict_immutable_deadline_comparison_reviewed:true,complete_same_clock_collection_required:true,
 unknown_residual_facts_rejected:true,all_owners_validated_before_return:true,
 generated_rules_rendered_in_process_and_bytes_match:true,counts:{metrics:210,alerts:100,promql:94,controller_state:6},
 actual_Go_executed_by_this_review:false,private_native_terminal_accepted:false,
 actual_PromQL_executed:false,collector_completeness_and_immutable_start_binding_proven:false,
 automatic_cleanup_clock_proven:false,live_source_modified:false,
 current_baseline_accepted:false,actual_SQL:false,dependencies_installed:false,production_approved:false,whole_goal_complete:false};
const encoded=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(text(output),encoded);
console.log('A_METRICS_CANDIDATE_SOURCE_REVIEWED deltas=8 alerts=100 promql=94 controller=6 native=pending runtime=unproven');
