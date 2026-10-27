import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Legacy no-argument invocation remains a create-only writer. --check repeats
// every source/log/inventory assertion and compares the saved report, read-only.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && ['--write', '--check'].includes(args[0])), 'Use --check or --write; unknown/multiple arguments rejected');
const mode = args[0] === '--check' ? 'check' : 'write';
const run = '88b2cfd9f32b454183e60d9f0f1259ec';
const prefix = `docs/evidence/d-bootstrap-consumer-native-${run}`;
const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
const receiptRaw = fs.readFileSync(`${prefix}.json`);
const receipt = JSON.parse(receiptRaw);
assert.equal(receipt.kind, 'd_bootstrap_consumer_joint_native.v1');
assert.equal(receipt.scope, 'backend_contracts_scripts_and_seven_named_document_fixtures');
assert.equal(receipt.status, 'passed_exact_snapshot');
for (const key of ['tests_started', 'snapshot_verified', 'snapshot_unchanged', 'cleaned']) assert.equal(receipt[key], true, key);
assert.equal(receipt.dependencies_installed, false);
assert.equal(receipt.targeted_exit, 0);
assert.equal(receipt.test_exit, 0);
assert.equal(receipt.tests_skipped, 0);
assert.equal(receipt.current_source_matches_snapshot, false);
assert.equal(fs.existsSync(`.tmp-d-bootstrap-consumer-${run}`), false);

function inspect(file, packages) {
  const bytes = fs.readFileSync(file);
  const events = bytes.toString('utf8').trimEnd().split(/\r?\n/).map(line => JSON.parse(line));
  assert.equal(events.filter(e => ['fail', 'skip', 'build-fail'].includes(e.Action)).length, 0);
  const identity = e => `${e.Package}/${e.Test}`;
  const runs = events.filter(e => e.Action === 'run' && e.Test).map(identity).sort();
  const passes = events.filter(e => e.Action === 'pass' && e.Test).map(identity).sort();
  assert.equal(new Set(runs).size, runs.length);
  assert.deepEqual(runs, passes);
  const packagePasses = events.filter(e => e.Action === 'pass' && !e.Test).map(e => e.Package).sort();
  assert.deepEqual(packagePasses, [...packages].sort());
  assert.equal(events.at(-1).Action, 'pass');
  assert.equal(events.at(-1).Test, undefined);
  return { sha256: sha(bytes), runs, passes, packages: packagePasses, roots: events.filter(e => e.Action === 'run' && e.Test && !e.Test.includes('/')).map(identity) };
}
const targeted = inspect(`${prefix}.targeted.jsonl`, ['clawreef/internal/systembackupproducer', 'clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupbootstrapsecurity']);
const full = inspect(`${prefix}.jsonl`, ['clawreef/internal/systembackupproducer', 'clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupbootstrapsecurity', 'clawreef/internal/systembackupevidence', 'clawreef/internal/systembackupresources', 'clawreef/internal/systembackupread', 'clawreef/cmd/server']);
assert.equal(targeted.passes.length, 256);
assert.equal(full.passes.length, 8246);
assert.equal(receipt.tests_passed, full.passes.length);
for (const name of targeted.passes) assert.ok(full.passes.includes(name), `targeted pass missing from full: ${name}`);
const authority = full.passes.filter(name => name.includes('/TestPinnedBootstrapCandidateAuthority'));
assert.equal(authority.length, 108);
assert.equal(full.roots.filter(name => name.includes('/TestPinnedBootstrapCandidateAuthority')).length, 10);
const captureOld = JSON.parse(fs.readFileSync('docs/evidence/a2-bootstrap-capture-native-20261026-110655-6428e6cd.json', 'utf8'));
assert.equal(captureOld.status, 'failed'); // Never promote the old failed run.
const priorCapture = fs.readFileSync('docs/evidence/a2-bootstrap-capture-native-20261026-110655-6428e6cd-step-0.log', 'utf8').trimEnd().split(/\r?\n/).map(JSON.parse).filter(e => e.Action === 'pass' && e.Test).map(e => `${e.Package}/${e.Test}`);
assert.equal(priorCapture.length, 51);
for (const name of priorCapture) assert.ok(full.passes.includes(name));

assert.equal(receipt.files.length, 1706);
assert.equal(new Set(receipt.files.map(p => p.path)).size, receipt.files.length);
for (const pin of receipt.files) {
  assert.ok(typeof pin.path === 'string' && !pin.path.includes('..') && !pin.path.startsWith('/'));
  assert.ok(Number.isSafeInteger(pin.size) && pin.size >= 0);
  assert.match(pin.sha256, /^[a-f0-9]{64}$/);
}
const own = ['backend/internal/systembackupsecurity/bootstrap_candidate_authority.go', 'backend/internal/systembackupsecurity/bootstrap_candidate_authority_test.go', 'backend/internal/systembackupbootstrapsecurity/producer_candidate_binding.go', 'backend/internal/systembackupbootstrapsecurity/producer_candidate_binding_test.go'];
const ownPins = own.map(path => {
  const frozen = receipt.files.find(p => p.path === path);
  assert.ok(frozen, path);
  const bytes = fs.readFileSync(path);
  assert.equal(bytes.length, frozen.size);
  assert.equal(sha(bytes), frozen.sha256);
  return frozen;
});
const next = JSON.parse(fs.readFileSync('docs/evidence/a2-bootstrap-original-files-material-adapters-ready-20261026.json', 'utf8'));
assert.equal(next.files.length, 6);
for (const pin of next.files) assert.equal(receipt.files.some(p => p.path === pin.path), false, 'next files were not in this snapshot');
assert.deepEqual(receipt.linux_builds, ['server', 'system-backup-bootstrap']);

const reviewed = {
  kind: 'a2_bootstrap_88b2_frozen_review.v1',
  status: 'accepted_only_exact_frozen_seven_packages_and_recorded_two_Linux_builds',
  receipt: `${prefix}.json`, receipt_sha256: sha(receiptRaw), source_files: receipt.files.length,
  source_file_manifest_sha256: sha(Buffer.from(JSON.stringify(receipt.files))),
  targeted: { roots: targeted.roots.length, test_pass_events: targeted.passes.length, sha256: targeted.sha256 },
  full: { roots: full.roots.length, test_pass_events: full.passes.length, package_passes: full.packages, sha256: full.sha256 },
  authority_roots: 10, authority_test_pass_events: authority.length, original_capture_passes_preserved: priorCapture.length,
  frozen_A2_inputs_still_match_current: ownPins,
  frozen_source_postcheck_recorded_by_runner: true,
  Linux_builds_recorded_by_runner: receipt.linux_builds,
  Linux_binary_hashes_independently_observed: false,
  owner_absence_independently_checked: true,
  current_whole_source_accepted: false,
  next_six_file_candidates_covered: false,
  late_current_grant_RBAC_gap_closed_by_this_run: false,
  actual_SQL: false, dependencies_installed: false, remote_contacted: false, production_approved: false, goal_complete: false,
};
const output = 'docs/evidence/a2-bootstrap-88b2-frozen-reviewed-20261026.json';
if (mode === 'check') {
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), reviewed, 'Saved report differs from fresh complete verification');
} else {
  fs.writeFileSync(output, `${JSON.stringify(reviewed, null, 2)}\n`, { flag: 'wx' });
}
process.stdout.write(JSON.stringify({ mode, output, status: reviewed.status, roots: full.roots.length, passes: full.passes.length, authority_passes: authority.length, owner_absent: true, current_whole_accepted: false }) + '\n');
