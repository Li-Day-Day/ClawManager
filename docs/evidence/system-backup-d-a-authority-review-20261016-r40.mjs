import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const read = (path) => readFileSync(new URL(path, new URL('../../', import.meta.url)));
const receiptPath = 'docs/evidence/a-maintenance-authority-mysql-accepted-sbk-mig-261016011333-1fdd.json';
const receipt = JSON.parse(read(receiptPath));
const raw = read(receipt.log), log = raw.toString('utf8');
const manifestBytes = read(receipt.source_manifest), manifest = JSON.parse(manifestBytes);
assert.equal(hash(raw), receipt.log_sha256);
assert.equal(hash(manifestBytes), receipt.source_manifest_sha256);
assert.equal(manifest.files.length, 1265);
assert.equal(new Set(manifest.files.map((pin) => pin.path)).size, 1265);
const logical = hash(manifest.files.map((pin) => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n');
assert.equal(logical, receipt.source_sha256);
assert.equal(logical, manifest.source_sha256);
const cases = ['grant_target_mismatch', 'independent_observation', 'grant_same_version_bytes_drift', 'archive_verifier_drift',
  'installed_target_drift', 'grant_expires_after_staging', 'source_expires_after_staging', 'capacity_expires_after_staging'];
const lines = log.split(/\r?\n/);
for (const name of cases) {
  assert.equal(lines.filter((line) => line === `=== RUN   TestAConfigMaintenanceAuthorityMySQL/${name}`).length, 1);
  assert.equal(lines.filter((line) => line.startsWith(`    --- PASS: TestAConfigMaintenanceAuthorityMySQL/${name} (`)).length, 1);
}
assert.equal(lines.filter((line) => line.startsWith('--- PASS: TestAConfigMaintenanceAuthorityMySQL (')).length, 1);
assert.doesNotMatch(log, /^\s*--- FAIL:|^panic:|^fatal error:/m);
assert.equal(lines.filter((line) => line.includes('PASS A composition rejected before commit; actual SQL effects observed and rolled back;')).length, 6);
assert.equal(lines.filter((line) => line.includes('CLEANED backfill service owned installation state')).length, 8);
assert.equal(lines.filter((line) => line.includes('CLEANED maintenance owned receipts/audits/config rows')).length, 8);
for (const marker of [
  `LOCAL_SOURCE a-maintenance-authority-frozen=yes source_sha256=${logical} files=1265`,
  `PASS a-config-maintenance-authority-mysql binary_sha256=${receipt.binary_sha256} inputs_sha256=${receipt.inputs_sha256} synthetic_verified_facts=yes actual_authentication=no production_approval=no`,
  `PASS pinned-migration-runner binary_sha256=${receipt.migration_binary_sha256} catalog_sha256=${receipt.catalog_sha256}`,
  'PASS fresh-migration-replay=001..080 applied=94 exact_filenames=yes',
  `RUN namespace=${receipt.namespace} uid=${receipt.namespace_uid} app_image=${receipt.app_image} mysql_image=${receipt.mysql_image} mysql_version=8.4.8`,
  `CLEANED namespace=${receipt.namespace} uid=${receipt.namespace_uid}`,
  'CLEANED remote-registration-scratch=yes', 'CLEANED local-registration-build-cache=True',
  'LOCAL_PASS a-maintenance-authority-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True',
  'a_maintenance_authority_remote_exit=0',
]) assert.ok(log.includes(marker), `Missing raw marker: ${marker}`);

const missing = [...receipt.local_roots_checked_absent, ...receipt.local_fixture_paths_checked_absent].map((path) => resolve(path));
assert.equal(missing.length, 69);
for (const path of missing) {
  assert.ok(path.startsWith(resolve(root) + sep));
  assert.equal(existsSync(path), false, `Old local product remains: ${path}`);
}
const focused = receipt.focused_matching_inputs.map((pin) => {
  const current = read(pin.path);
  assert.equal(hash(current), pin.sha256, `Focused source changed: ${pin.path}`);
  assert.equal(current.length, pin.size);
  assert.ok(manifest.files.some((original) => original.path === pin.path && original.sha256 === pin.sha256 && original.size === pin.size));
  return pin;
});
const currentDrift = manifest.files.flatMap((pin) => {
  if (!existsSync(resolve(root, pin.path))) return [{ path: pin.path, state: 'missing' }];
  const current = read(pin.path);
  return hash(current) === pin.sha256 && current.length === pin.size ? [] : [{ path: pin.path, state: 'changed' }];
});
const report = {
  kind: 'd_independent_a_authority_frozen_mysql_review', recorded_at: new Date().toISOString(),
  status: 'accepted_for_original_eight_case_frozen_authority_only', receipt: receiptPath, receipt_sha256: hash(read(receiptPath)),
  raw_log: receipt.log, raw_log_sha256: hash(raw), source_manifest: receipt.source_manifest, source_manifest_sha256: hash(manifestBytes),
  frozen_files: manifest.files.length, frozen_logical_sha256: logical, cases, root_pass: true, staged_rollback_cases: 6,
  namespace: receipt.namespace, namespace_uid: receipt.namespace_uid, exact_cleanup_markers: true,
  local_paths_checked_absent: missing.length, focused_current_pins: focused,
  current_frozen_file_drift: currentDrift, current_tree_or_new_catalog_accepted: false,
  actual_authentication: false, synthetic_verified_facts: true, remote_rerun: false, dependencies_installed: false,
  production_approval: false,
};
const output = new URL('./system-backup-d-a-authority-review-20261016-r40.json', import.meta.url);
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, cases: cases.length, local_absent: missing.length, focused: focused.length, current_drift: currentDrift.length }));
