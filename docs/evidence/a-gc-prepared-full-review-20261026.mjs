import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Independent, read-only by default. This accepts exact local model/probe
// preparation only; later entry changes and actual MySQL remain separate.
const root = path.resolve(import.meta.dirname, '../..');
const jointName = 'docs/evidence/d-bootstrap-consumer-native-a2e7cbc234ca4e0e9ea79ec7adce1f49.json';
const supplementName = 'docs/evidence/d-gc-full-supplement-2775832f44dc48d28bc8c68c88c74d4b.json';
const outputName = 'docs/evidence/a-gc-prepared-full-reviewed-20261026.json';
const full = name => path.join(root, name);
const bytes = name => fs.readFileSync(full(name));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const decode = b => (b[0] === 255 && b[1] === 254 ? b.toString('utf16le') : b.toString('utf8')).replace(/^\uFEFF/, '');
const json = name => JSON.parse(decode(bytes(name)));
const events = name => decode(bytes(name)).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const relative = name => path.relative(root, name).replaceAll('\\', '/');
const args = process.argv.slice(2);
assert.ok(args.length <= 1 && (!args.length || ['--write', '--check'].includes(args[0])), 'Use --write or --check; no argument derives without writing');
const joint = json(jointName), supplement = json(supplementName);
assert.equal(joint.kind, 'd_bootstrap_consumer_complete_native.v1');
assert.equal(joint.status, 'failed');
for (const field of ['tests_started', 'cleaned', 'snapshot_verified']) assert.equal(joint[field], true, field);
assert.equal(joint.targeted_exit, 0);
assert.equal(joint.test_exit, 1);
assert.equal(joint.dependencies_installed, false);
const oldLogName = jointName.replace(/\.json$/, '.jsonl'), old = events(oldLogName);
const failures = old.filter(row => row.Action === 'fail');
assert.equal(failures.length, 1);
assert.equal(failures[0].Package, 'clawreef/internal/systembackupevidence');
assert.equal(failures[0].Test, undefined);
assert.equal(old.filter(row => row.Output === 'panic: test timed out after 10m0s\n').length, 1);
const packages = ['systembackupproducer', 'systembackupsecurity', 'systembackupbootstrapsecurity', 'systembackupresources', 'systembackupread', 'systembackupnoncebootstrap', 'systembackupcatrust'].map(name => 'clawreef/internal/' + name).concat('clawreef/cmd/server');
for (const pkg of packages) {
  assert.equal(old.filter(row => row.Package === pkg && row.Action === 'pass' && !row.Test).length, 1, pkg);
  assert.equal(old.filter(row => row.Package === pkg && row.Action === 'skip').length, 0, pkg);
}
assert.equal(supplement.kind, 'd_gc_full_supplement_validation.v1');
assert.equal(supplement.error, null);
for (const field of ['frozen_inputs_stable', 'owner_removed', 'staging_cleanup_requested', 'staging_owner_removed', 'binary_removed']) assert.equal(supplement[field], true, field);
for (const field of ['dependencies_installed', 'actual_mysql', 'production_approved']) assert.equal(supplement[field], false, field);
assert.equal(supplement.profile_cases, 33);
assert.equal(supplement.cold_group_cases, 7);
const owners = [supplement.owner, supplement.staging_owner, full('.tmp-d-bootstrap-consumer-a2e7cbc234ca4e0e9ea79ec7adce1f49')];
for (const owner of owners) {
  assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase());
  assert.match(path.basename(owner), /^\.tmp-d-(index-cache|bootstrap-consumer)-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(owner), false, 'owner not cleaned: ' + owner);
}
assert.equal(path.dirname(supplement.source_manifest).toLowerCase(), full('docs/evidence').toLowerCase());
const sourceName = relative(supplement.source_manifest), source = json(sourceName);
assert.equal(source.kind, 'd_gc_full_frozen_source.v1');
assert.equal(source.stable_copy_verified, true);
assert.equal(source.ordinary_backend_from_joint_only, true);
assert.equal(source.dependencies_installed, false);
const sourceMap = new Map(source.files.map(pin => [pin.path, pin]));
assert.equal(sourceMap.size, source.files.length, 'duplicate source path');
assert.equal(sha(Buffer.from(source.files.map(pin => pin.path + '\0' + pin.sha256 + '\0' + pin.size).join('\n') + '\n')), source.source_sha256);
const jointMap = new Map(joint.files.map(pin => [pin.path, pin]));
for (const pin of joint.files.filter(pin => pin.path.startsWith('backend/') && /\.(go|mod|sum)$/.test(pin.path))) assert.ok(sourceMap.has(pin.path), 'missing ordinary dependency ' + pin.path);
const deltas = [];
for (const pin of source.files.filter(pin => pin.path.startsWith('backend/'))) {
  const previous = jointMap.get(pin.path);
  if (previous?.sha256 === pin.sha256 && previous.size === pin.size) continue;
  assert.equal(pin.path, 'backend/internal/systembackupevidence/bootstrap_original_materials_mysql_test.go');
  assert.equal(pin.size, 25537);
  assert.equal(pin.sha256, '19b1c83160c3cc93f707ed90dfbe06155e2ae6a5f04d727a8d1e3e97496ee2ad');
  deltas.push(pin);
}
// Failed evidence-package partial output supplies no preservation credit.
// Evidence names must come from its complete successful supplement below.
const names = new Set(old.filter(row => row.Action === 'pass' && row.Test && row.Package !== 'clawreef/internal/systembackupevidence').map(row => row.Package + '\0' + row.Test));
const summaries = [];
assert.deepEqual(supplement.steps.map(step => step.name), ['evidence', 'metadata', 'seeds', 'linux-tagged', 'linux-server', 'linux-bootstrap', 'linux-nonce', 'linux-ca']);
for (const step of supplement.steps) {
  assert.equal(step.exit_code, 0, step.name);
  assert.equal(path.dirname(step.log).toLowerCase(), full('docs/evidence').toLowerCase());
  const log = relative(step.log), logHash = sha(bytes(log));
  if (step.name.startsWith('linux-')) {
    assert.match(step.binary_sha256, /^[a-f0-9]{64}$/);
    summaries.push({name: step.name, log, log_sha256: logHash, binary_sha256: step.binary_sha256});
    continue;
  }
  const rows = events(log), passed = rows.filter(row => row.Action === 'pass' && row.Test);
  assert.equal(rows.filter(row => ['fail', 'skip'].includes(row.Action)).length, 0);
  const keys = passed.map(row => row.Package + '\0' + row.Test);
  assert.equal(new Set(keys).size, keys.length, 'duplicate test pass');
  const roots = passed.filter(row => !row.Test.includes('/'));
  assert.equal(rows.filter(row => row.Action === 'pass' && !row.Test).length, 1);
  if (step.name === 'evidence') assert.equal(rows.find(row => row.Action === 'pass' && !row.Test).Package, 'clawreef/internal/systembackupevidence');
  if (step.name === 'metadata') assert.equal(roots.length, 13);
  if (step.name === 'seeds') assert.deepEqual(roots.map(row => row.Test).sort(), ['TestDBootstrapOriginalMaterialsMySQLSeed', 'TestDDownloadGCFullCollectMySQLSeed', 'TestDDownloadGCFullProfileMySQLSeed']);
  for (const key of keys) names.add(key);
  summaries.push({name: step.name, log, log_sha256: logHash, roots: roots.length, pass_events: passed.length});
}
for (const name of ['TestConfigMutationCapacityPreparedPinsOriginalReport', 'TestConfigMutationCapacityPreparedRejectsBindingAndExpiry', 'TestConfigMutationCapacityPreparedTracksSQLFloorAndPoisonsFailure', 'TestDownloadGCFullPinsCapacityBeforeFreeze', 'TestDownloadGCFullRejectsClockBetweenCapacityAndOwnerSamples', 'TestDownloadGCFullReservationInsertPrivilege']) assert.ok([...names].some(key => key.endsWith('\0' + name)), 'missing required new root ' + name);
const historicalName = 'docs/evidence/d-gc-full-local-0f34460abce44e279a1f2c92d19bb11c-complete.jsonl';
const historical = events(historicalName).filter(row => row.Action === 'pass' && row.Test);
assert.ok(historical.length > 0);
for (const row of historical) assert.ok(names.has(row.Package + '\0' + row.Test), 'lost accepted test ' + row.Test);
const ownedNames = [
  ...['config_mutation_capacity_prepared.go', 'config_mutation_capacity_prepared_test.go'].map(name => 'backend/internal/systembackupsecurity/' + name),
  ...['download_retention_gc.go', 'download_retention_gc_batch.go', 'download_retention_gc_full.go', 'download_retention_gc_full_test.go', 'download_retention_gc_freeze.go', 'download_retention_gc_freeze_work.go', 'download_gc_full_profile_mysql_test.go', 'download_gc_full_collect_mysql_test.go', 'testdata/download-gc-full-cold-schema.sql'].map(name => 'backend/internal/systembackupevidence/' + name)
];
const owned = ownedNames.map(name => {
  const pin = sourceMap.get(name);
  assert.ok(pin, name);
  assert.equal(bytes(name).length, pin.size, name);
  assert.equal(sha(bytes(name)), pin.sha256, 'current owned drift ' + name);
  return pin;
});
assert.equal(sha(bytes('docs/evidence/d-gc-full-review-request-20261026.json')), '0c1ff055817ef0e1499ecfc4b377a7922bff8aa78e8b579a72ffb2a17e4fa840');
const result = {kind: 'a_gc_prepared_full_review.v1', status: 'accepted_exact_frozen_local_models_and_probe_preparation_only', joint_receipt: jointName, joint_receipt_sha256: sha(bytes(jointName)), joint_overall_failed: true, joint_snapshot_postcheck_completed: joint.snapshot_unchanged === true, timeout_preserved: true, supplement_receipt: supplementName, supplement_receipt_sha256: sha(bytes(supplementName)), supplement_source: sourceName, supplement_source_sha256: source.source_sha256, source_files: source.files.length, tag_only_deltas: deltas, native_steps: summaries, current_GC_owned_inputs: owned, historical_pass_names_preserved: historical.length, cleaned_owners: owners.map(relative), profile_cases_prepared: 33, cold_group_cases_prepared: 7, actual_mysql_cases_passed: 0, later_bootstrap_entry_covered: false, complete_domain_authority: false, production_approved: false, current_baseline_ready: false, dependencies_installed: false, goal_complete: false};
if (args[0] === '--write') fs.writeFileSync(full(outputName), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
if (args[0] === '--check') assert.deepEqual(json(outputName), result);
process.stdout.write(JSON.stringify({status: result.status, source_files: result.source_files, native_steps: summaries, historical_pass_names_preserved: historical.length, actual_mysql_cases_passed: 0, current_baseline_ready: false}) + '\n');
