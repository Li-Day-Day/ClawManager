import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source='docs/evidence/d2-controller-state-alerts-candidate-20261027-r2.go.txt';
const tests='docs/evidence/d2-controller-state-alerts-test-candidate-20261027-r2.go.txt';
const prior='docs/evidence/d2-controller-state-alerts-candidate-20261027.go.txt';
const priorTests='docs/evidence/d2-controller-state-alerts-test-candidate-20261027.go.txt';
const priorReview='docs/evidence/a2-cleanup-controller-candidate-source-reviewed-20261027-r1.json';
const output='docs/evidence/a2-cleanup-controller-candidate-source-reviewed-20261027-r2.json';
const bytes=p=>fs.readFileSync(path.join(root,p));
const read=p=>bytes(p).toString('utf8').replace(/\r\n/g,'\n');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:bytes(p).length,sha256:hash(bytes(p))});
assert.equal(hash(bytes(source)),'9a5472c0faed36dfb9239c5e3bdc519fef477af667dce888fc412a9f2998d077');
assert.equal(hash(bytes(tests)),'c75ada2f64fed00ba42920df24f45bd5df93ac653a0d2b59c362cbc82676d2f2');
const r1=JSON.parse(read(priorReview));
for(const p of r1.inputs)assert.deepEqual(pin(p.path),p);
const candidate=read(source);
const inverse=candidate.replace('the six non-PromQL registry rules','the five non-PromQL registry rules')
  .replace(/^\tResidualVolume\s+\*bool\n/m,'').replace('\tresidualVolumeOverdue := false\n','')
  .replace(' || candidate.ResidualVolume == nil','')
  .replace('invalid cleanup owner age, immutable deadline or residual-volume fact','invalid cleanup owner age or immutable deadline')
  .replace('\t\tresidualVolume := *candidate.ResidualVolume\n','')
  .replace('\t\tresidualVolumeOverdue = residualVolumeOverdue || residualVolume && candidate.Age > candidate.ImmutableDeadline\n','')
  .replace('\tdecisions = append(decisions, ControllerStateAlertDecision{\n\t\tRuleID: "restore-residual-volume-overdue", Severity: "critical", Firing: residualVolumeOverdue,\n\t})\n','');
assert.equal(inverse,read(prior));
assert.ok(candidate.includes('candidate.Age < 0 || candidate.ImmutableDeadline <= 0 || candidate.ResidualVolume == nil'));
assert.ok(candidate.indexOf('candidate.ResidualVolume == nil')<candidate.indexOf('*candidate.ResidualVolume'));
assert.ok(candidate.includes('residualVolumeOverdue || residualVolume && candidate.Age > candidate.ImmutableDeadline'));
assert.ok(candidate.includes('RuleID: "restore-residual-volume-overdue", Severity: "critical", Firing: residualVolumeOverdue'));
const roots=s=>[...s.matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]);
const oldRoots=roots(read(priorTests)),newRoots=roots(read(tests));
assert.equal(oldRoots.length,5);assert.equal(newRoots.length,7);
assert.ok(oldRoots.every(n=>newRoots.includes(n)));
const residualCases=['confirmed_empty','volume_before','volume_equal','volume_one_after',
  'nonvolume_overdue_does_not_make_volume_overdue','younger_volume_overdue','same_global_gauges_no_volume_overdue'];
for(const n of residualCases)assert.ok(read(tests).includes('name: "'+n+'"'));
assert.ok(read(tests).includes('func TestControllerCleanupRejectsUnknownResidualVolumeFacts'));
const report={
  kind:'a2_nonimplementer_cleanup_controller_candidate_source_review.v2',
  status:'exact_two_rule_source_candidate_reviewed_private_native_and_collector_evidence_pending',
  inputs:[source,tests,prior,priorTests,priorReview].map(pin),
  r2_inverse_restores_r1_after_line_ending_normalization:true,
  r1_original_production_inverse_preserved_by_exact_input_pins:true,
  source_findings:{residual_fact_explicitly_tristate:true,unknown_residual_fact_rejected_before_dereference:true,
    known_nonvolume_overdue_still_cleanup_critical_but_not_residual_critical:true,
    residual_critical_requires_known_volume_and_same_owner_frozen_deadline_exceeded:true,
    later_unknown_owner_not_bypassed_after_earlier_overdue:true,
    r1_complete_clock_and_all_owner_validation_preserved:true,
    original_acceptance_evidence_issuer_predicates_preserved:true},
  authored_tests_observed:{old_roots:oldRoots,new_roots:newRoots,residual_cases:residualCases,
    unknown_residual_fact_rejection_root:'TestControllerCleanupRejectsUnknownResidualVolumeFacts',
    source_inventory_is_not_executed_test_PASS:true},
  required_registry_alignment:{total_alerts:100,promql:94,controller_state:6,
    moved_rules:['cleanup-overdue','restore-residual-volume-overdue'],
    metadata_and_generated_candidate_reviewed_here:false},
  limitations:['Private full controller tests, actual Go source/caller inventory and current Linux build have not been executed by A2.',
    'Complete and a nonnil residual bool are trusted predicate inputs, not proof of a complete authoritative read or real B-owned resource classification.',
    'Collector integration, automatic-cleanup durable clock mapping, original frozen budget binding and notification delivery remain pending.',
    'The residual presence warning and four gate frozen-metric projections are separate from this two-rule predicate.'],
  Go_executed_by_A2:false,SQL_executed:false,PromQL_executed:false,
  live_sources_modified:false,dependencies_installed:false,whole_baseline_accepted:false,production_approved:false,
};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered);
else{assert.equal(process.argv[2],'--check');assert.equal(bytes(output).toString('utf8'),rendered);}
console.log(JSON.stringify({output,status:report.status,r2_inverse:true,test_roots:7,residual_cases:7,Go_executed:false}));
