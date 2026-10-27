import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [run, mode, ...extra] = process.argv.slice(2);
assert.ok(/^[a-f0-9]{32}$/.test(run ?? '') && ['--write', '--check'].includes(mode) && extra.length === 0,
  'Usage: node a2-bootstrap-complete9-review-20261026.mjs <run-id> --write|--check');
const prefix = `docs/evidence/d-bootstrap-consumer-native-${run}`;
const output = `docs/evidence/a2-bootstrap-complete9-reviewed-20261026-${run.slice(0, 8)}.json`;
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
// This receipt is written only AFTER the runner's terminal cleanup. In-flight
// pass events alone must never create an acceptance file.
const receiptBytes = fs.readFileSync(`${prefix}.json`);
const receipt = JSON.parse(receiptBytes);
assert.equal(receipt.kind, 'd_bootstrap_consumer_complete_native.v1');
assert.equal(receipt.scope, 'backend_contracts_scripts_and_seven_named_document_fixtures');
assert.equal(receipt.status, 'passed_exact_snapshot');
for (const key of ['tests_started', 'snapshot_verified', 'snapshot_unchanged', 'cleaned']) assert.equal(receipt[key], true, key);
assert.equal(receipt.dependencies_installed, false);
assert.equal(receipt.telemetry, 'off_owned_directory_verified');
assert.equal(receipt.targeted_exit, 0);
assert.equal(receipt.test_exit, 0);
assert.equal(receipt.tests_skipped, 0);
assert.equal(receipt.actual_mysql_executed, false);
assert.equal(fs.existsSync(`.tmp-d-bootstrap-consumer-${run}`), false);

const core = ['clawreef/internal/systembackupproducer', 'clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupbootstrapsecurity'];
const materials = ['clawreef/internal/systembackupnoncebootstrap', 'clawreef/internal/systembackupcatrust'];
const packages = [...core, 'clawreef/internal/systembackupevidence', 'clawreef/internal/systembackupresources', 'clawreef/internal/systembackupread', 'clawreef/cmd/server', ...materials];
function events(file) {
  const bytes = fs.readFileSync(file);
  return { sha256: digest(bytes), values: bytes.toString('utf8').trimEnd().split(/\r?\n/).map(line => JSON.parse(line)) };
}
function ordinary(file, wantPackages) {
  const log = events(file), es = log.values;
  assert.equal(es.filter(e => ['fail', 'skip', 'build-fail'].includes(e.Action)).length, 0);
  const key = e => `${e.Package}/${e.Test}`;
  const runs = es.filter(e => e.Action === 'run' && e.Test).map(key).sort();
  const passes = es.filter(e => e.Action === 'pass' && e.Test).map(key).sort();
  assert.equal(new Set(runs).size, runs.length);
  assert.deepEqual(runs, passes);
  const packagePasses = es.filter(e => e.Action === 'pass' && !e.Test).map(e => e.Package).sort();
  assert.deepEqual(packagePasses, [...wantPackages].sort());
  assert.equal(es.at(-1).Action, 'pass');
  assert.equal(es.at(-1).Test, undefined);
  return { sha256: log.sha256, passes, roots: es.filter(e => e.Action === 'run' && e.Test && !e.Test.includes('/')).map(key), packages: packagePasses };
}
const targeted = ordinary(`${prefix}.targeted.jsonl`, [...core, ...materials]);
const full = ordinary(`${prefix}.jsonl`, packages);
assert.equal(targeted.passes.length, 393);
assert.equal(full.passes.length, receipt.tests_passed);
for (const name of targeted.passes) assert.ok(full.passes.includes(name), `Targeted test missing from full run: ${name}`);

const groups = ['TestBootstrapCandidateFiles', 'TestCandidateNonce', 'TestCandidateCA'].map(name => ({
  prefix: name,
  roots: full.roots.filter(key => key.includes(`/${name}`)).length,
  passes: full.passes.filter(key => key.includes(`/${name}`)).length,
}));
assert.deepEqual(groups.map(g => g.roots), [5, 4, 3]);
assert.deepEqual(groups.map(g => g.passes), [47, 41, 25]);

const prior = ordinary('docs/evidence/d-bootstrap-consumer-native-88b2cfd9f32b454183e60d9f0f1259ec.jsonl', packages.filter(p => !materials.includes(p)));
assert.equal(prior.passes.length, 8246);
for (const name of prior.passes) assert.ok(full.passes.includes(name), `Original 88b2 test missing: ${name}`);
const oldMaterials = fs.readFileSync('docs/evidence/a-nonce-ca-r2-local-20261023-164638.txt', 'utf8');
const oldNames = [...oldMaterials.matchAll(/--- PASS: (Test[^\s(]+) \(/g)].map(m => m[1]);
assert.equal(oldNames.length, 63);
assert.equal(new Set(oldNames).size, oldNames.length);
for (const name of oldNames) {
  const pkg = name.startsWith('TestNonce') ? materials[0] : materials[1];
  assert.ok(full.passes.includes(`${pkg}/${name}`), `Original nonce/CA test missing: ${name}`);
}

assert.equal(receipt.identity_overlay, 'single_Run_seal_removal_caused_real_committed_assertion_failure');
const overlay = events(`${prefix}.identity-overlay.jsonl`);
const leaf = 'TestBootstrapIndependentTransactionValueCopiesCannotEscapeWork/owned/exec';
assert.equal(overlay.values.filter(e => e.Action === 'fail' && e.Test === leaf).length, 1);
assert.equal(overlay.values.filter(e => e.Action === 'output' && e.Test === leaf && e.Output.includes('value copy escaped closed Work and committed')).length, 1);
assert.equal(overlay.values.filter(e => e.Action === 'build-fail' || e.Action === 'skip').length, 0);
assert.equal(overlay.values.at(-1).Action, 'fail');
assert.equal(overlay.values.at(-1).Test, undefined);

assert.deepEqual(receipt.linux_builds, ['server', 'system-backup-bootstrap', 'tagged_systembackupevidence_test_binary_compile_only', 'systembackupnoncebootstrap_test_compile_only', 'systembackupcatrust_test_compile_only']);
assert.ok(Array.isArray(receipt.files) && receipt.files.length > 1706);
assert.equal(new Set(receipt.files.map(p => p.path)).size, receipt.files.length);
for (const pin of receipt.files) {
  assert.ok(typeof pin.path === 'string' && !pin.path.includes('..') && !pin.path.startsWith('/'));
  assert.ok(Number.isSafeInteger(pin.size) && pin.size >= 0);
  assert.match(pin.sha256, /^[a-f0-9]{64}$/);
}
const ready = JSON.parse(fs.readFileSync('docs/evidence/a2-bootstrap-original-files-material-adapters-ready-20261026.json', 'utf8'));
assert.equal(ready.files.length, 6);
for (const pin of ready.files) {
  assert.deepEqual(receipt.files.find(p => p.path === pin.path), pin);
  const bytes = fs.readFileSync(pin.path);
  assert.equal(bytes.length, pin.size);
  assert.equal(digest(bytes), pin.sha256);
}
const originalPlan = JSON.parse(fs.readFileSync('docs/evidence/a2-bootstrap-candidate-materials-plan-20261026.json', 'utf8'));
const legacy = originalPlan.source_pins.filter(p => ['backend/internal/systembackupnoncebootstrap/nonce.go', 'backend/internal/systembackupcatrust/ca.go'].includes(p.path));
assert.equal(legacy.length, 2);
for (const pin of legacy) assert.deepEqual(receipt.files.find(p => p.path === pin.path), pin);

const reviewed = {
  kind: 'a2_bootstrap_complete9_frozen_review.v1',
  status: 'accepted_exact_frozen_local_nine_packages_not_actual_SQL_or_production', run,
  receipt: `${prefix}.json`, receipt_sha256: digest(receiptBytes),
  source_files: receipt.files.length, source_file_manifest_sha256: digest(Buffer.from(JSON.stringify(receipt.files))),
  targeted: { packages: targeted.packages, roots: targeted.roots.length, test_pass_events: targeted.passes.length, sha256: targeted.sha256 },
  full: { packages: full.packages, roots: full.roots.length, test_pass_events: full.passes.length, sha256: full.sha256 },
  new_A2_groups: groups, original_88b2_test_events_preserved: prior.passes.length, original_nonce_CA_test_events_preserved: oldNames.length,
  original_nonce_CA_production_sources_unchanged: legacy,
  six_A2_source_pins_match_snapshot_and_current: ready.files,
  identity_single_defect_overlay: { leaf, assertion_failed: true, build_failed: false, sha256: overlay.sha256 },
  Linux_builds_recorded_by_runner: receipt.linux_builds, Linux_binary_hashes_independently_observed: false,
  frozen_source_postcheck_recorded_by_runner: true, owner_absence_independently_checked: true,
  current_source_matches_snapshot_recorded: receipt.current_source_matches_snapshot,
  current_whole_source_accepted: false,
  limitations: ['Helpers and synthetic SQL do not prove actual InnoDB range locks or real deployment/material authority.', 'Tagged test binary compilation is not actual MySQL execution.', 'Original independent mapping remains mandatory; no new grant, default allow or receipt observation renewal.'],
  actual_SQL: false, dependencies_installed: false, remote_contacted: false, production_approved: false, goal_complete: false,
};
if (mode === '--check') assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), reviewed);
else fs.writeFileSync(output, `${JSON.stringify(reviewed, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(JSON.stringify({ mode, output, status: reviewed.status, roots: full.roots.length, passes: full.passes.length, old_material_passes: oldNames.length }) + '\n');
