import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const paths={
  before:'docs/evidence/d2-controller-state-alerts-before-20261027.go.txt',
  candidate:'docs/evidence/d2-controller-state-alerts-candidate-20261027.go.txt',
  testBefore:'docs/evidence/d2-controller-state-alerts-test-before-20261027.go.txt',
  testCandidate:'docs/evidence/d2-controller-state-alerts-test-candidate-20261027.go.txt',
};
const output='docs/evidence/a2-cleanup-controller-candidate-source-reviewed-20261027-r1.json';
const bytes=p=>fs.readFileSync(path.join(root,p));
const read=p=>bytes(p).toString('utf8').replace(/\r\n/g,'\n');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:bytes(p).length,sha256:hash(bytes(p))});
const before=read(paths.before),candidate=read(paths.candidate),testBefore=read(paths.testBefore),testCandidate=read(paths.testCandidate);
assert.equal(hash(bytes(paths.before)),'fc44562e7375cb1af78b6f28ecc64817814ba67d15cbe92707a8d8f72642bc8d');
assert.equal(hash(bytes(paths.candidate)),'5098d9e1356a856ce801df4069729877886bf69582dd49e5fafe8f11072b59be');
assert.equal(hash(bytes(paths.testBefore)),'4f805fbb90face2db78cdeff5fe55e338b655b6571e4c7db7a2eaaeae92a21dc');
assert.equal(hash(bytes(paths.testCandidate)),'405bd92272253f2795aa85b22c8f894ba205db8365e1fc25e49435ceaf7b9d8e');
let inverse=candidate.replace('the five non-PromQL registry rules','the four non-PromQL registry rules')
  .replace(/^\tCleanupOwners\s+\*CleanupAlertCollection\n/m,'');
let start=inverse.indexOf('// CleanupAlertCollection'),end=inverse.indexOf('type ProviderProofIssuerAlertCandidate',start);
assert.ok(start>=0&&end>start);inverse=inverse.slice(0,start)+inverse.slice(end);
inverse=inverse.replace('// fail-closed; no pending evidence rows are a healthy zero. Cleanup requires a\n// complete collection at this snapshot clock; a confirmed empty one is healthy.',
  '// fail-closed; no pending evidence rows are a healthy zero.');
start=inverse.indexOf('\tcleanup := snapshot.CleanupOwners');
end=inverse.indexOf('\tdecisions, err := evaluateAcceptanceAnomalyDecisions',start);
assert.ok(start>=0&&end>start);inverse=inverse.slice(0,start)+inverse.slice(end);
const append='\tdecisions = append(decisions, ControllerStateAlertDecision{\n\t\tRuleID: "cleanup-overdue", Severity: "critical", Firing: cleanupOverdue,\n\t})\n';
assert.ok(inverse.includes(append));inverse=inverse.replace(append,'');assert.equal(inverse,before);
const collectionGuard='cleanup == nil || !cleanup.Complete || cleanup.ObservedAt.IsZero() || !cleanup.ObservedAt.Equal(snapshot.Now)';
assert.ok(candidate.includes(collectionGuard));
const loopStart=candidate.indexOf('\tfor _, candidate := range cleanup.Owners {');
const loopEnd=candidate.indexOf('\tdecisions, err :=',loopStart);
const loop=candidate.slice(loopStart,loopEnd);
assert.ok(loop.includes('candidate.Age < 0 || candidate.ImmutableDeadline <= 0'));
assert.ok(loop.includes('cleanupOverdue = cleanupOverdue || candidate.Age > candidate.ImmutableDeadline'));
assert.ok(!loop.includes('return decisions')&&!loop.includes('break'));
assert.ok(loop.indexOf('candidate.Age < 0')<loop.indexOf('cleanupOverdue ='));
const testRoots=s=>[...s.matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]);
const oldRoots=testRoots(testBefore),newRoots=testRoots(testCandidate);
assert.equal(oldRoots.length,3);assert.equal(newRoots.length,5);
assert.ok(oldRoots.every(n=>newRoots.includes(n)));
const positiveCases=['confirmed_empty','before','equal_is_not_overdue','one_nanosecond_after','younger_owner_is_overdue',
  'same_global_gauges_but_no_owner_overdue','overdue_owner_first','maximum_equal','maximum_one_after'];
const rejectionCases=['not_read','partial_empty','partial_nonempty','missing_clock','stale_clock','future_clock',
  'negative_age','zero_deadline','negative_deadline','overdue_before_invalid_owner'];
for(const n of [...positiveCases,...rejectionCases])assert.ok(testCandidate.includes('name: "'+n+'"'));
assert.ok(testCandidate.includes('for _, profile := range []string{"production", "development"}'));
const report={
  kind:'a2_nonimplementer_cleanup_controller_candidate_source_review.v1',
  status:'exact_source_candidate_reviewed_ready_for_private_native_validation_only',
  inputs:Object.values(paths).map(pin),
  production_code_inverse_restores_original_after_line_ending_normalization:true,
  previous_predicates_and_decision_fields_unchanged_for_valid_complete_collection:true,
  previous_callers_must_now_supply_explicit_complete_cleanup_collection:true,
  source_guard_findings:{nil_collection_rejected:true,partial_collection_rejected:true,missing_or_nonmatching_clock_rejected:true,
    confirmed_complete_empty_collection_healthy:true,each_owner_validated_before_its_predicate:true,
    later_invalid_owners_not_skipped_after_overdue:true,strict_greater_than_frozen_deadline:true,
    duration_comparison_no_arithmetic_overflow:true,critical_cleanup_decision_not_downleveled_in_development:true,
    existing_acceptance_evidence_issuer_logic_preserved:true},
  authored_tests_observed:{old_roots:oldRoots,new_roots:newRoots,positive_cases:positiveCases,rejection_cases:rejectionCases,
    cases_are_source_inventory_not_executed_PASS:true},
  required_native_scope:'Root unique window: actual selected controller package/caller source closure, full ordinary controller package tests, current Linux compilation, source postchecks and cleanup',
  required_registry_alignment:{total_alerts:100,promql:95,controller_state:5,cleanup_language:'controller_state',
    cleanup_counter_reset:'persisted_state_not_reset_by_restart',counts_and_language_candidate_not_reviewed_here:true},
  authority_limitations:['Complete/ObservedAt are predicate inputs, not proof of SQL authority or collection completeness.',
    'Original immutable deadline and automatic-cleanup start mapping remain unproven at collector/persistence integration.',
    'Missing collection now returns an error for the whole evaluation; callers and actual evaluator readiness must handle this explicitly.',
    'Native tests, Linux binary validation, registry generation and raw PromQL evaluation require their own exact receipts.'],
  Go_executed_by_A2:false,SQL_executed:false,PromQL_executed:false,live_sources_modified:false,
  dependencies_installed:false,whole_baseline_accepted:false,production_approved:false,
};
const rendered=JSON.stringify(report,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,output),rendered);
else{assert.equal(process.argv[2],'--check');assert.equal(bytes(output).toString('utf8'),rendered);}
console.log(JSON.stringify({output,status:report.status,production_inverse:true,old_roots:3,new_roots:5,authored_positive_cases:9,authored_rejections:10,Go_executed:false}));
