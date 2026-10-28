import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
import {reviewEntryVectorReferences} from './a-bootstrap-entry-vector-reference-review-20261026.mjs';

// This receives completed native evidence, never runs Go/SQL or registers an
// owner baseline. Old failed/partial runs cannot supply coverage for this gate.
const root = path.resolve(import.meta.dirname, '../..');
const evidence = path.join(root, 'docs/evidence');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const decode = bytes => (bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^\uFEFF/, '');
const read = name => fs.readFileSync(path.resolve(root, name));
const json = name => JSON.parse(decode(read(name)));
const relative = name => path.relative(root, name).replaceAll('\\', '/');
const args = process.argv.slice(2);
assert.ok(args.length >= 2 && args.length <= 3 && args[0] === '--native' && (!args[2] || ['--write', '--check'].includes(args[2])), 'Use --native docs/evidence/d-bootstrap-entry-native-ID.json [--write|--check]');
const nativePath = path.resolve(root, args[1]);
assert.equal(path.dirname(nativePath).toLowerCase(), evidence.toLowerCase());
const id = path.basename(nativePath).match(/^d-bootstrap-entry-native-([a-f0-9]{32})\.json$/)?.[1];
assert.ok(id, 'Not an exact entry native receipt');
assert.equal(fs.lstatSync(nativePath).isSymbolicLink(), false);
const nativeName = relative(nativePath), native = json(nativeName);
assert.equal(native.kind, 'd_bootstrap_entry_native.v1');
assert.equal(native.status, 'passed_exact_entry_snapshot', 'Native run is not an accepted complete entry run');
assert.ok(!native.error);
for (const field of ['tests_started', 'snapshot_verified', 'snapshot_unchanged', 'cleaned']) assert.equal(native[field], true, field);
for (const field of ['dependencies_installed', 'actual_mysql_executed', 'production_approved']) assert.equal(native[field], false, field);
assert.equal(native.actual_sql_cases_executed, 0);
assert.equal(native.telemetry, 'off_owned_directory_verified');
for (const field of ['targeted_exit', 'full_exit', 'seeds_exit']) assert.equal(native[field], 0, field);
const owner = path.join(root, '.tmp-d-bootstrap-entry-' + id);
assert.equal(fs.existsSync(owner), false, 'Native products not cleaned');
assert.ok(Array.isArray(native.files) && native.files.length > 0);
const pins = new Map(native.files.map(pin => [pin.path, pin]));
assert.equal(pins.size, native.files.length, 'Duplicate frozen source path');
for (const pin of native.files) {
  assert.match(pin.path, /^(backend|contracts|scripts|docs)\//);
  assert.ok(!pin.path.includes('\\') && !pin.path.split('/').some(part => ['', '.', '..'].includes(part)));
  assert.match(pin.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(pin.size) && pin.size >= 0);
}
const sourceSHA = sha(Buffer.from(native.files.map(pin => pin.path + '\0' + pin.sha256 + '\0' + pin.size).join('\n') + '\n'));
const driver = 'scripts/system-backup-d-bootstrap-entry-validation.ps1';
assert.equal(pins.get(driver)?.sha256, native.driver_sha256);
const readinessNames = ['docs/evidence/a-bootstrap-entry-source-ready-20261026-r2.json', 'docs/evidence/d2-bootstrap-entry-source-ready-20261026-r2.json', 'docs/evidence/d-bootstrap-entry-source-ready-20261026-r2.json'];
const readinessKinds = ['a_bootstrap_entry_source_ready.v1', 'd_bootstrap_entry_source_ready.v1', 'd_bootstrap_entry_probe_source_ready.v1'];
const readinessCounts = [7, 8, 9];
const readiness = readinessNames.map((name, index) => {
  const ready = json(name);
  assert.equal(ready.kind, readinessKinds[index], 'Wrong source owner kind: ' + name);
  assert.equal(ready.files?.length, readinessCounts[index], 'Incomplete owner source declaration: ' + name);
  for (const pin of ready.files) {
    const bytes = read(pin.path);
    assert.equal(bytes.length, pin.size, 'Current ready size differs: ' + pin.path);
    assert.equal(sha(bytes), pin.sha256, 'Current ready bytes differ: ' + pin.path);
    if (/^(backend|contracts|scripts)\//.test(pin.path)) assert.deepEqual(pins.get(pin.path), pin, 'Ready source not covered by native snapshot: ' + pin.path);
  }
  return {path: name, sha256: sha(read(name)), pinned_files: ready.files.length};
});
assert.equal(json(readinessNames[0]).revision, 2);
const vectorReferences = reviewEntryVectorReferences(read);
for (const pin of vectorReferences.inputs) assert.deepEqual(pins.get(pin.path), pin, 'Vector-reference inputs differ from native snapshot');
function nativeEvents(suffix, expectedPackages) {
  const log = nativeName.replace(/\.json$/, suffix);
  const lines = decode(read(log)).trim().split(/\r?\n/).filter(Boolean);
  const rows = lines.map(JSON.parse);
  assert.equal(rows.filter(row => ['fail', 'build-fail', 'skip'].includes(row.Action)).length, 0, log);
  const packagePasses = rows.filter(row => row.Action === 'pass' && !row.Test).map(row => row.Package).sort();
  assert.deepEqual(packagePasses, [...expectedPackages].sort(), 'Incomplete package pass inventory: ' + log);
  const ran = rows.filter(row => row.Action === 'run' && row.Test).map(row => row.Package + '\0' + row.Test).sort();
  const passed = rows.filter(row => row.Action === 'pass' && row.Test);
  const passKeys = passed.map(row => row.Package + '\0' + row.Test).sort();
  assert.ok(passKeys.length > 0);
  assert.equal(new Set(ran).size, ran.length, 'Duplicate native runs');
  assert.equal(new Set(passKeys).size, passKeys.length, 'Duplicate native passes');
  assert.deepEqual(ran, passKeys, 'Run/pass mismatch');
  return {log, rows, passed, keys: new Set(passKeys), summary: {log, log_sha256: sha(read(log)), roots: passed.filter(row => !row.Test.includes('/')).length, pass_events: passed.length, packages: packagePasses}};
}
const internal = name => 'clawreef/internal/' + name;
const security = internal('systembackupsecurity'), producer = internal('systembackupproducer'), evidencePackage = internal('systembackupevidence'), cli = 'clawreef/cmd/system-backup-bootstrap';
const target = nativeEvents('.targeted.jsonl', [producer, security, cli]);
const packages = ['systembackupproducer', 'systembackupsecurity', 'systembackupbootstrapsecurity', 'systembackupevidence', 'systembackupresources', 'systembackupread', 'systembackupnoncebootstrap', 'systembackupcatrust'].map(internal).concat('clawreef/cmd/server', cli);
const full = nativeEvents('.full.jsonl', packages);
assert.deepEqual([...native.package_passes].sort(), [...packages].sort());
assert.equal(native.full_pass_events, full.passed.length);
assert.equal(native.targeted_pass_events, target.passed.length);
const required = [];
for (const name of ['config_bootstrap_candidate_attempt_test.go', 'config_bootstrap_inline_gate_test.go', 'bootstrap_deployment_candidates_test.go']) {
  const file = 'backend/internal/systembackupsecurity/' + name;
  assert.equal(sha(read(file)), pins.get(file)?.sha256);
  const roots = [...decode(read(file)).matchAll(/^func (Test\w+)\(/gm)].map(match => match[1]);
  assert.ok(roots.length > 0);
  for (const Test of roots) required.push({package: security, Test});
}
for (const Test of ['TestBootstrapInlineDomainFenceLegacyAndHistoricalBranches', 'TestBootstrapInlineDomainFenceRejectsPartialUnknownAndDrift', 'TestBootstrapInlineDomainFenceBindingAndRedaction']) required.push({package: producer, Test});
for (const Test of ['TestDeploymentLegacyAttemptKeepsPreparationContextThroughSQL', 'TestDeploymentLegacyRejectsTypedNilOwnersBeforeCredentials', 'TestDeploymentLegacyClosesDatabaseReturnedWithOpenError', 'TestBootstrapCandidateServiceConsumerIntegration', 'TestBootstrapCandidateAttemptBudgetStartsBeforePreparation']) required.push({package: security, Test});
for (const Test of ['TestRequirementsReportDoesNotPretendOwnersAreDelivered', 'TestCommandRejectsMixedModesBypassFlagsAndUnpinnedFiles']) required.push({package: cli, Test});
for (const item of required) {
  assert.ok(target.keys.has(item.package + '\0' + item.Test), 'Missing required targeted root: ' + item.Test);
  assert.ok(full.keys.has(item.package + '\0' + item.Test), 'Missing required complete-package root: ' + item.Test);
}
const materialRoots = [];
for (const [pkg, file] of [['systembackupsecurity', 'bootstrap_candidate_files_test.go'], ['systembackupnoncebootstrap', 'candidate_adapter_test.go'], ['systembackupcatrust', 'candidate_adapter_test.go']]) {
  const name = 'backend/internal/' + pkg + '/' + file;
  assert.equal(sha(read(name)), pins.get(name)?.sha256);
  for (const match of decode(read(name)).matchAll(/^func (Test\w+)\(/gm)) {
    assert.ok(full.keys.has(internal(pkg) + '\0' + match[1]), 'Missing material root: ' + match[1]);
    materialRoots.push({package: internal(pkg), Test: match[1]});
  }
}
const seeds = nativeEvents('.seeds.jsonl', [evidencePackage]);
const expectedSeeds = ['TestDBootstrapConsumerMySQLSeed', 'TestDBootstrapConsumerRangesMySQLSeed', 'TestDBootstrapOriginalMaterialsMySQLSeed', 'TestDBootstrapEntryMySQLSeed'].sort();
assert.deepEqual(seeds.passed.map(row => row.Test).sort(), expectedSeeds);
assert.deepEqual([...native.local_seed_roots].sort(), expectedSeeds);
const previousName = 'docs/evidence/a-owner-final-native-20261026.jsonl';
const previous = decode(read(previousName)).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(row => row.Action === 'pass' && row.Test);
assert.equal(previous.length, 5190);
const normalized = new Set(full.passed.map(row => row.Package + '\0' + canonicalLocalName(row.Test)));
for (const row of previous) assert.ok(normalized.has(row.Package + '\0' + canonicalLocalName(row.Test)), 'Previous owner test omitted: ' + row.Test);
assert.deepEqual(native.linux_steps.map(step => step.name), ['server', 'bootstrap', 'migration-runner', 'tagged-evidence-test-compile-only']);
const linux = native.linux_steps.map(step => {
  assert.equal(step.exit_code, 0);
  assert.match(step.binary_sha256, /^[a-f0-9]{64}$/);
  const log = nativeName.replace(/\.json$/, '.linux-' + step.name + '.txt');
  return {...step, log, log_sha256: sha(read(log))};
});
const result = {kind: 'a_bootstrap_entry_native_review.v1', status: 'accepted_exact_entry_native_not_owner_baseline_or_production', native_receipt: nativeName, native_receipt_sha256: sha(read(nativeName)), source_sha256: sourceSHA, source_files: native.files.length, readiness, targeted: target.summary, full: full.summary, required_new_roots: required, full_material_roots: materialRoots, seeds: seeds.summary, previous_owner_5190_preserved: previous.length, linux_compilation: linux, binary_hashes_recorded_before_deletion_not_independent_binary_rehash: true, native_owner_absent: true, native_source_postcheck: true, current_source_matches_snapshot_reported: native.current_source_matches_snapshot === true, actual_mysql_cases_passed: 0, resource_slots_cleared: 0, owner_profile_supplement_still_required: true, baseline_registration_permitted: false, production_approved: false, goal_complete: false, dependencies_installed: false};
const output = path.join(evidence, 'a-bootstrap-entry-native-reviewed-' + id + '.json');
if (args[2] === '--write') fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
if (args[2] === '--check') assert.deepEqual(JSON.parse(decode(fs.readFileSync(output))), result);
process.stdout.write(JSON.stringify({status: result.status, source_sha256: sourceSHA, targeted: target.summary, full: full.summary, seeds: seeds.summary, material_roots: materialRoots.length, previous_owner_5190_preserved: previous.length, actual_mysql_cases_passed: 0, baseline_registration_permitted: false}) + '\n');
