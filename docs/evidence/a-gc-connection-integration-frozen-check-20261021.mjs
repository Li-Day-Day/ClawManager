// Recheck historical frozen acceptance without treating later worktree edits as tested.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, raw, json, sha256, manifest, inventory, native, exact} from './a-frozen-validation-utils-20261021.mjs';
const receiptPath = 'docs/evidence/a-gc-connection-integration-accepted-20261021-r1.json';
assert.equal(sha256(raw(receiptPath)), 'bc6463d4853b1ef479c8a5d5c26f60173aaf2f7174e128622b0f9571af0a5df3');
const receipt = json(receiptPath), source = manifest(receipt.source);
for (const [file, pin] of [[receipt.source, receipt.source_manifest_sha256], [receipt.events, receipt.events_sha256], [receipt.native, receipt.native_sha256], ['docs/evidence/a-gc-connection-integration-review-20261021.mjs', receipt.reviewer_sha256], ['docs/evidence/a-frozen-validation-utils-20261021.mjs', receipt.utility_sha256], [receipt.d_preparation, receipt.d_preparation_sha256], [receipt.d_cleanup, receipt.d_cleanup_sha256]]) assert.equal(sha256(raw(file)), pin, file);
assert.equal(source.source_sha256, receipt.source_sha256);
assert.equal(source.files.length, 1466);
const checked = native(receipt.native, source, 'CLEANED snapshot=True');
assert.equal(checked.sha256, receipt.native_sha256);
assert.ok(checked.text.includes('FROZEN_UNIT_POSTCHECK pass=yes'));
assert.ok(checked.text.includes('NATIVE_EXIT full_packages=0 packages=./internal/systembackupsecurity,./internal/systembackupevidence,./internal/systembackupread,./internal/systembackupproducer,./internal/systembackupgcmetadata default_vet=yes'));
const packages = receipt.full.packages.map(p => p.package), passed = inventory(receipt.events, packages);
assert.equal(passed.length, 6591);
assert.equal(passed.filter(e => !e.Test.includes('/')).length, 779);
for (const p of receipt.full.packages) {
  const items = passed.filter(e => e.Package === p.package);
  assert.deepEqual([items.filter(e => !e.Test.includes('/')).length, items.length], [p.main, p.all]);
}
const oldA = inventory('docs/evidence/a-journal-cancel-20261021-r1-full.jsonl', packages.slice(0, 4));
const oldD = inventory('docs/evidence/d-gc-connection-20261021-r2-full.jsonl', packages);
assert.equal(oldA.length, 6280); assert.equal(oldD.length, 6581);
const key = e => `${e.Package}\0${e.Test}`;
exact(passed.map(key), [...new Set([...oldA, ...oldD].map(key))]);
assert.equal(passed.filter(e => packages.slice(0, 2).includes(e.Package)).length, 5012);
for (const owned of receipt.owned_directories_independently_absent) {
  assert.equal(path.dirname(owned).toLowerCase(), workspace.toLowerCase());
  assert.match(path.basename(owned), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(owned), false);
}
const scope = ['download_retention_gc.go', 'download_retention_gc_test.go', 'download_retention_gc_connection.go', 'download_retention_gc_connection_test.go', 'system_publish_runtime_test.go', 'system_recovery_audit_journal.go', 'system_recovery_audit_journal_context_test.go', 'download_failure_journal.go', 'download_failure_journal_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
for (const file of scope) {
  const pin = source.files.find(f => f.path === file), bytes = raw(file);
  assert.equal(bytes.length, pin.size, file); assert.equal(sha256(bytes), pin.sha256, file);
}
for (const flag of ['actual_sql', 'backup_lock_acquired', 'server_lock_release_proved', 'cleanup_deadline_proved', 'full_gc_policy_approved', 'production_approved', 'dependencies_installed', 'current_whole_worktree_verified']) assert.equal(receipt[flag], false);
const laterDrift = source.files.filter(f => {try {return raw(f.path).length !== f.size || sha256(raw(f.path)) !== f.sha256;} catch {return true;}}).map(f => f.path);
console.log(JSON.stringify({status: 'PASS_frozen_receipt_only', main: 779, checks: 6591, owner_baseline_checks: 5012, accepted_scope_currently_matches: true, later_worktree_drift_not_accepted: laterDrift, current_whole_worktree_verified: false, actual_sql: false, files_written: false}));
