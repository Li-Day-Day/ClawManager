import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Verify the archived native transcript and frozen pins without rerunning Go,
// touching another task's resources, or treating model SQL as real MySQL.
const root = process.cwd();
const [logName, manifestName, initialName, helperName] = process.argv.slice(2);
assert.ok(logName && manifestName && initialName && helperName, 'four evidence paths required');
const read = name => fs.readFileSync(path.resolve(root, name));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const text = name => read(name).toString('utf8').replace(/^\uFEFF/, '');
const log = text(logName), initial = text(initialName), helper = text(helperName);
const source = JSON.parse(text(manifestName));
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
check('source stable-copy and no dependency installation', source.stable_copy_verified && source.dependencies_installed === false);
check('source-only capture count bounded', source.capture_attempts >= 1 && source.capture_attempts <= 3);
const digestInput = source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n';
check('source manifest digest independently recomputed', digest(Buffer.from(digestInput)) === source.source_sha256);
check('source paths unique', new Set(source.files.map(p => p.path)).size === source.files.length);
check('D original contract pin unchanged', digest(read('docs/evidence/system-backup-d-sensitive-download-contract-20261016.json')) === source.contract_decision_sha256);
check('native full-package invocation recorded', log.includes('LOCAL_STAGE sensitive-download-two-full-packages default-vet=yes retry=no dependency-downloads=no'));
check('native Go exit zero', /^SENSITIVE_DOWNLOAD_GO_EXIT=0\s*$/m.test(log));
check('outer wrapper exit zero', /^a_download_binding_exit=0\s*$/m.test(log));
check('frozen source and decision postcheck passed', log.includes('frozen-postcheck=yes d-decision-postcheck=yes default-vet=yes'));
check('isolated telemetry disabled', log.includes('LOCAL_PASS isolated-go-telemetry=off'));
const events = log.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
const failures = events.filter(e => e.Action === 'fail');
check('no failing tests or packages', failures.length === 0);
const passed = events.filter(e => e.Action === 'pass' && e.Test);
const passedNames = new Set(passed.map(e => `${e.Package}:${e.Test}`));
check('each passed test reported once', passedNames.size === passed.length);
const packages = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence'];
check('both complete packages passed', packages.every(p => events.filter(e => e.Package === p && e.Action === 'pass' && !e.Test).length === 1));
const aExpected = new Map([
  ['TestASensitiveDownloadOriginalDeadline', 7],
  ['TestADownloadBindingAbortIsPermanent', 13],
  ['TestADownloadBindingSamplesClockAfterAudit', 3],
  ['TestADownloadBindingLogRetention', 8],
]);
for (const [test, count] of aExpected) {
  check(`${test} all expected cases passed`, passed.filter(e => e.Test === test || e.Test.startsWith(test + '/')).length === count);
}
const skipped = events.filter(e => e.Action === 'skip');
check('A independent checks not skipped', skipped.every(e => !e.Test || !aExpected.has(e.Test.split('/')[0])));
check('D original binding roots passed', [
  'TestDownloadAdmissionBindingOriginalTransactionAndProjection',
  'TestDownloadAdmissionBindingRejectsSubstitution',
  'TestDownloadAdmissionBindingFrozenLimitsAndFinalClock',
  'TestDownloadAdmissionBindingRechecksOriginalFacts',
].every(t => passed.some(e => e.Test === t)));
check('initial source drift kept as failure before Go', initial.includes('a_download_binding_exit=1') && initial.includes('Source changed while snapshot was copied') && !initial.includes('LOCAL_STAGE'));
check('shared source-only helper eight cases passed', helper.includes('PASS proof source capture: 8 cases; source-only fakes, no Go/SSH/database'));
const cleaned = [];
for (const content of [initial, log]) {
  for (const match of content.matchAll(/^LOCAL_CLEANUP sensitive-download-owned=(.+) removed=True\s*$/gm)) cleaned.push(match[1].trim());
}
for (const match of helper.matchAll(/^LOCAL_CLEANUP proof-source-test-owned=(.+) removed=True\s*$/gm)) cleaned.push(match[1].trim());
check('all five exact owned paths reported cleaned', cleaned.length === 5 && new Set(cleaned).size === 5);
for (const owned of cleaned) {
  check(`owned path absent: ${path.basename(owned)}`, path.dirname(path.resolve(owned)).toLowerCase() === root.toLowerCase() && !fs.existsSync(owned));
}
const focus = [
  'backend/internal/systembackupevidence/download_admission_binding.go',
  'backend/internal/systembackupevidence/download_admission_binding_test.go',
  'backend/internal/systembackupevidence/download_admission_binding_a_test.go',
  'backend/internal/systembackupevidence/download_admission_content.go',
  'backend/internal/systembackupevidence/download_admission_audit.go',
  'backend/internal/systembackupsecurity/sensitive_download_request.go',
  'backend/internal/systembackupsecurity/sensitive_download_deadline.go',
  'backend/internal/systembackupsecurity/sensitive_download_deadline_a_test.go',
  'backend/internal/systembackupsecurity/strongauth.go',
  'scripts/system-backup-a-sensitive-download-validation.ps1',
  'scripts/system-backup-a-config-proof-source.ps1',
  'scripts/system-backup-d-index-source-snapshot.ps1',
  'scripts/system-backup-a-evidence-go-step.ps1',
];
const currentDrifts = [];
const pins = focus.map(name => {
  const pin = source.files.find(p => p.path === name);
  assert.ok(pin, `missing frozen pin: ${name}`);
  const matches = read(name).length === pin.size && digest(read(name)) === pin.sha256;
  if (!matches) currentDrifts.push({ path: name, frozen_sha256: pin.sha256, current_sha256: digest(read(name)) });
  // D may add accessors for its next storage candidate during this frozen run.
  // Preserve/exclude that new source rather than broaden an old test result.
  if (name !== 'backend/internal/systembackupsecurity/sensitive_download_request.go') {
    check(`reviewed input pin matches: ${name}`, matches);
  }
  return pin;
});
const perPackage = packages.map(p => ({
  package: p,
  main: passed.filter(e => e.Package === p && !e.Test.includes('/')).length,
  subtests: passed.filter(e => e.Package === p && e.Test.includes('/')).length,
  skipped: skipped.filter(e => e.Package === p).map(e => e.Test ?? '(package)'),
}));
const existingInputDrifts = source.files.flatMap(pin => {
  if (!fs.existsSync(pin.path)) return [{ path: pin.path, status: 'missing_after_frozen_run' }];
  const current = read(pin.path);
  return current.length === pin.size && digest(current) === pin.sha256 ? [] : [{ path: pin.path, frozen_sha256: pin.sha256, current_sha256: digest(current) }];
});
const report = {
  kind: 'a_independent_download_binding_and_original_deadline_review',
  recorded_at: new Date().toISOString(),
  status: 'accepted_local_frozen_component_scope_only',
  raw_log: logName, raw_log_sha256: digest(read(logName)),
  source_manifest: manifestName, source_manifest_sha256: digest(read(manifestName)),
  source_files: source.files.length, source_sha256: source.source_sha256,
  initial_failed_capture: initialName, initial_failed_capture_sha256: digest(read(initialName)),
  source_helper_log: helperName, source_helper_log_sha256: digest(read(helperName)),
  checks_passed: checks.length, checks,
  packages: perPackage, passed_including_subtests: passed.length,
  A_independent_main: aExpected.size, A_independent_including_subtests: [...aExpected.values()].reduce((a, b) => a + b, 0),
  frozen_reviewed_pins: pins, current_focus_drifts_excluded: currentDrifts, owned_paths_independently_absent: cleaned,
  existing_frozen_inputs_changed_in_parallel: existingInputDrifts,
  later_added_files_covered_by_this_gate: false,
  default_vet: true, dependencies_installed: false, actual_MySQL: false,
  remote_executed: false, MFA_personally_verified: false,
  D_original_r60_wrapper_failure_reclassified: false,
  full_prelocked_authority: false, operation_receipt_nonce_atomic_admission: false,
  production_route_enabled: false, formal_schema_approval: false,
  remaining: [
    'D complete L0-L10 authority and current physical capacity',
    'same-transaction claim CAS, operation/private receipt/public snapshot/nonce persistence and final guard',
    'real MFA/issuer/holder/revocation/materials and authenticated historical canonical source',
    'reviewed appended schema, same-installation ownership/FK, retention/grants and A/B/C reviews',
    'real MySQL atomic rollback, cross-version concurrency, unknown commit and deployment/E2E',
  ],
};
const output = 'docs/evidence/a-download-binding-review-20261019.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, checks: checks.length, packages: perPackage, total: passed.length, A_independent: report.A_independent_including_subtests, cleaned: cleaned.length }));
