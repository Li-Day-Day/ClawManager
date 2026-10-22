import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const caPath = 'docs/evidence/a-ca-trust-candidate-20261022-161401-c7097458.json';
const caLogPath = 'docs/evidence/a-ca-trust-candidate-20261022-161356-5a01d072.txt';
const ownerPath = 'docs/evidence/a-download-owners-budget-repair-20261022-161813-2f7f4fdb.txt';
const ca = JSON.parse(read(caPath));
const caLog = read(caLogPath).toString('utf8');
const ownerLog = read(ownerPath).toString('utf8');
assert.equal(sha(read(caPath)), 'd55e7abe75d46ad24842a97ed0f6e3a0f1d2f94915430d3789d78f375b3123e3');
assert.equal(sha(read(caLogPath)), '733ca25212d600181f8ee0dc30526d61820b51fae6f067aa6b3e57e146cfa7ec');
assert.equal(ca.test_exit, 0);
assert.equal(ca.linux_build, true);
assert.match(caLog, /clawreef\/internal\/systembackupcatrust\s+9\.902s/);
assert.match(caLog, /CA_CLEANUP verified=True/);
const owners = [ca.owner, path.join(root, '.tmp-d-index-cache-fe1f429b77574e2f872eb3821e8f3b9f')];
for (const p of owners) {
  assert.equal(path.dirname(path.resolve(p)), root);
  assert.equal(fs.existsSync(p), false);
}
const drift = ca.files.filter(f => !fs.existsSync(path.join(root, f.path)) || sha(read(f.path)) !== f.sha256).map(f => f.path);
const failedTests = [...ownerLog.matchAll(/^\s*--- FAIL: (\S+) \(/gm)].map(m => m[1]);
assert.deepEqual(failedTests, ['TestADownloadEmptyBodyCheckedBeforeAdmissionWithBoundedRead', 'TestADownloadEmptyBodyCheckedBeforeAdmissionWithBoundedRead/eof']);
const failedLeaves = failedTests.filter(name => name.includes('/'));
assert.deepEqual(failedLeaves, ['TestADownloadEmptyBodyCheckedBeforeAdmissionWithBoundedRead/eof']);
assert.match(ownerLog, /body validation response or original request changed 403/);
assert.match(ownerLog, /FAIL\s+clawreef\/internal\/systembackupevidence\s+735\.025s/);
assert.match(ownerLog, /remote validation has not started/);
assert.match(ownerLog, /removed=True/);
const report = {
  kind: 'a_round_pause_review.v1',
  user_requested_pause_after_current_round: true,
  ca: {receipt: caPath, receipt_sha256: sha(read(caPath)), log: caLogPath, log_sha256: sha(read(caLogPath)),
    package_test_passed: true, linux_compile_reported_passed: true,
    selected_inputs: ca.files.length, current_input_drift: drift,
    non_implementer_review_pending: true, production_linked: false},
  owner: {log: ownerPath, log_sha256: sha(read(ownerPath)),
    source: 'docs/evidence/a-download-owners-budget-repair-20261022-161813-2f7f4fdb-source.json',
    status: 'local_gate_real_assertion_failed', failed_leaves: failedLeaves,
    evidence_package_seconds: 735.025, eof_case_seconds: 5.89,
    remote_started: false, new_baseline_accepted: false,
    hypothesis: 'Fixed fixture SQL clock may exceed production five-second clock freshness bound during setup; not proven, not repaired.',
    next_step: 'Diagnose with bounded test-only stage evidence and a deterministic regression; preserve production deadlines and all assertions.'},
  cleanup: owners.map(owner => ({owner, independently_absent: true})),
  dependencies_installed: false, new_tests_or_remote_runs_started_during_closeout: false,
  production_approved: false, complete_field_acceptance: false,
};
fs.writeFileSync(path.join(root, 'docs/evidence/a-round-pause-reviewed-20261022.json'), JSON.stringify(report, null, 2) + '\n');
const ledgerPath = path.join(root, 'docs/evidence/a-remaining-work-execution-20261022.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
ledger.status = 'paused_at_user_request';
ledger.pause_review = 'docs/evidence/a-round-pause-reviewed-20261022.json';
ledger.requirements.find(r => r.id === 'A-bootstrap-security-resource-adapters').ca_candidate_status = 'local_package_and_linux_compile_passed_not_linked_non_implementer_review_pending';
const owner = ledger.requirements.find(r => r.id === 'A-download-owner-eleven-actual-SQL');
owner.status = 'new_local_gate_real_assertion_failed_actual_SQL_not_started';
owner.failed_case = failedLeaves[0];
owner.diagnosis_status = 'fixed_SQL_clock_freshness_hypothesis_unverified';
owner.round_closeout = ledger.pause_review;
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify({review: ledger.pause_review, ca_selected_inputs: ca.files.length, ca_current_drift: drift, failed_leaves: failedLeaves, cleanup_absent: owners.length}));
