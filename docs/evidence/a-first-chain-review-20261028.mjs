// Mechanical verification only; this is not a non-implementer security signoff.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '../..');
const file = path.resolve(root, process.argv[2] ?? '');
assert.equal(path.dirname(file), path.join(root, 'docs/evidence'));
const receipt = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(receipt.kind, 'a_first_chain_native.v1');
assert.equal(receipt.status, 'passed_for_exact_snapshot');
for (const field of ['native_exit', 'windows_cli_exit', 'linux_cli_exit']) assert.equal(receipt[field], 0);
assert.equal(receipt.requirements_exit, 2);
assert.equal(receipt.cleanup, true);
assert.equal(receipt.dependencies_installed, false);
assert.equal(receipt.actual_sql, false);
const owner = path.join(root, '.tmp-a-first-chain-' + receipt.id);
assert.match(receipt.id, /^[a-f0-9]{32}$/);
assert.equal(fs.existsSync(owner), false);
const prefix = file.slice(0, -5);
const events = fs.readFileSync(prefix + '.native.jsonl', 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(x => JSON.parse(x));
assert.equal(events.some(x => ['fail', 'skip', 'build-fail'].includes(x.Action)), false);
const counts = [];
for (const pkg of ['clawreef/internal/systembackupsecurity', 'clawreef/cmd/system-backup-bootstrap']) {
  const rows = events.filter(x => x.Package === pkg);
  assert.equal(rows.filter(x => x.Action === 'pass' && !x.Test).length, 1);
  const names = action => rows.filter(x => x.Action === action && x.Test).map(x => x.Test).sort();
  assert.deepEqual(names('run'), names('pass'));
  counts.push({ package: pkg, roots: names('pass').filter(x => !x.includes('/')).length, passes: names('pass').length });
}
for (const test of ['TestAdmissionRejectsTypedNilBeforeAnySource', 'TestAdmissionRejectsTypedNilPreparedCheck', 'TestAdmissionDetachesOwnerTablesBeforeTrustedCallbacks', 'TestBootstrapMaterialCompositionCannotBypassMissingAuthorityOrOwners']) {
  assert.ok(events.some(x => x.Test === test && x.Action === 'pass'));
}
const requirements = JSON.parse(fs.readFileSync(prefix + '.requirements.json', 'utf8').replace(/^\uFEFF/, ''));
assert.equal(requirements.status, 'blocked');
assert.equal(requirements.missing_adapters.length, 27);
assert.equal(requirements.database_opened, false);
assert.equal(requirements.configuration_mutated, false);
assert.equal(requirements.provider_admission, 'not_run');
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex');
const currentFiles = ['backend/cmd/system-backup-bootstrap/main.go', 'backend/cmd/system-backup-bootstrap/materials.go', 'backend/cmd/system-backup-bootstrap/materials_test.go', 'backend/internal/systembackupsecurity/bootstrap_admission.go', 'backend/internal/systembackupsecurity/bootstrap_admission_boundary_test.go'];
for (const name of currentFiles) {
  const pin = receipt.files.find(x => x.path === name);
  assert.ok(pin);
  assert.equal(hash(path.join(root, name)), pin.sha256, name);
}
assert.equal(hash(path.join(root, 'scripts/system-backup-a-first-chain-validation.ps1')), receipt.driver_sha256);
assert.ok(receipt.linux_cli_binary.size > 1000000);
assert.match(receipt.linux_cli_binary.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.linux_cli_binary.executed, false);
const result = {
  kind: 'a_first_chain_exact_snapshot_verified.v1',
  receipt: path.relative(root, file).replaceAll('\\', '/'), receipt_sha256: hash(file),
  counts, current_A_changed_files_match: true, current_driver_matches: true,
  actual_windows_cli_missing: 27, configured_model_remaining: 24,
  windows_and_linux_builds_exit_zero: true, owned_directory_absent: true,
  source_unchanged: receipt.source_unchanged,
  other_source_changes: receipt.changed_since_snapshot,
  source_paths_changed: receipt.source_paths_changed,
  non_implementer_signoff: false, actual_SQL: false,
  production_link_provided: false, original_production_authority_verified: false,
  goal_complete: false,
};
const output = prefix + '.verified.json';
const serialized = JSON.stringify(result, null, 2) + '\n';
if (fs.existsSync(output)) assert.equal(fs.readFileSync(output, 'utf8'), serialized);
else fs.writeFileSync(output, serialized, { flag: 'wx' });
console.log(JSON.stringify(result));
