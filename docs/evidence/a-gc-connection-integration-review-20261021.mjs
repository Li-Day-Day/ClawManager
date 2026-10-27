// A independently reviews D's owned connection and one merged frozen run.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, raw, json, decode, sha256, events, exact, manifest, inventory, native, changed} from './a-frozen-validation-utils-20261021.mjs';
const full = 'docs/evidence/a-gc-connection-integration-20261021-r1';
const aBase = 'docs/evidence/a-journal-cancel-20261021-r1-full', dBase = 'docs/evidence/d-gc-connection-20261021-r2-full';
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer', 'systembackupgcmetadata'].map(n => 'clawreef/internal/' + n);
const source = manifest(full + '-source.json'), oldA = manifest(aBase + '-source.json');
const dSource = json(dBase + '-source.json');
assert.equal(sha256(dSource.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), dSource.source_sha256);
assert.equal(dSource.dependencies_installed, false); assert.equal(dSource.production_approved, false); assert.equal(new Set(dSource.files.map(f => f.path)).size, dSource.files.length);
const dReceiptPath = 'docs/evidence/d-gc-connection-preparation-20261021.json', dReceipt = json(dReceiptPath), dFull = dReceipt.runs.find(r => r.stage === 'full');
assert.equal(dReceipt.status, 'local_connection_boundary_only'); assert.equal(sha256(raw(dBase + '-source.json')), dFull.source_manifest_sha256); assert.equal(sha256(raw(dBase + '.jsonl')), dFull.events_sha256); assert.equal(sha256(raw(dBase + '-native.json')), dFull.native_sha256);
const dNative = json(dBase + '-native.json'); assert.equal(dNative.exit, 0); assert.equal(dNative.source_postcheck, true); assert.equal(dNative.default_vet, true); assert.equal(dNative.dependencies_installed, false); assert.equal(dNative.remote, false); assert.equal(dNative.source_sha256, dSource.source_sha256);
assert.equal(raw(dBase + '-stderr.txt').length, 0);
const current = native(full + '-native.txt', source, 'CLEANED snapshot=True'); assert.ok(current.text.includes('FROZEN_UNIT_POSTCHECK pass=yes')); assert.ok(current.text.includes('NATIVE_EXIT full_packages=0 packages=./internal/systembackupsecurity,./internal/systembackupevidence,./internal/systembackupread,./internal/systembackupproducer,./internal/systembackupgcmetadata default_vet=yes')); assert.equal(raw(full + '-stderr.txt').length, 0);
const passed = inventory(full + '.jsonl', packages), beforeA = inventory(aBase + '.jsonl', packages.slice(0, 4)), beforeD = inventory(dBase + '.jsonl', packages);
const names = new Set(passed.map(e => `${e.Package}\0${e.Test}`)), aNames = new Set(beforeA.map(e => `${e.Package}\0${e.Test}`)), dNames = new Set(beforeD.map(e => `${e.Package}\0${e.Test}`));
assert.equal(aNames.size, 6280); assert.equal(dNames.size, 6581); assert.ok([...aNames, ...dNames].every(n => names.has(n)));
exact([...names], [...new Set([...aNames, ...dNames])]);
assert.equal(passed.length, 6591); assert.equal(passed.filter(e => !e.Test.includes('/')).length, 779);
const expected = [[255, 2011], [362, 3001], [75, 519], [75, 784], [12, 276]];
const packageResults = packages.map((p, n) => {const es = passed.filter(e => e.Package === p); const main = es.filter(e => !e.Test.includes('/')).length; assert.deepEqual([main, es.length], expected[n]); return {package: p, main, all: es.length};});
const ownAuditPaths = ['system_recovery_audit_journal.go', 'system_recovery_audit_journal_context_test.go', 'download_failure_journal.go', 'download_failure_journal_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
const connectionPaths = ['download_retention_gc.go', 'download_retention_gc_test.go', 'download_retention_gc_connection.go', 'download_retention_gc_connection_test.go', 'system_publish_runtime_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
exact(changed(source, oldA).filter(p => /^(backend|contracts)\//.test(p)), connectionPaths);
exact(changed(source, dSource).filter(p => /^(backend|contracts)\//.test(p)), ownAuditPaths);
assert.ok(oldA.files.every(f => source.files.some(n => n.path === f.path)));
const currentDrift = source.files.filter(pin => {try {const b = raw(pin.path); return b.length !== pin.size || sha256(b) !== pin.sha256;} catch {return true;}}).map(pin => pin.path);
exact(currentDrift, ['backend/internal/systembackupevidence/http.go']);
const laterHTTPTest = 'backend/internal/systembackupevidence/download_http_failure_budget_test.go';
assert.ok(fs.existsSync(path.join(workspace, laterHTTPTest)) && !source.files.some(f => f.path === laterHTTPTest));
for (const pin of dReceipt.published) assert.equal(sha256(raw(pin.path)), pin.sha256, pin.path);
const collector = decode(raw(connectionPaths[0])), helper = decode(raw(connectionPaths[2]));
const dOriginal = json('docs/evidence/d-gc-connection-base-20261021.json');
const previousCollector = collector.replace('owned, now, err := beginDownloadGCConnection(ctx, r)', 'tx, now, err := r.begin(ctx)').replace('defer owned.close()\n\ttx := owned.tx', 'defer tx.Rollback()');
assert.equal(sha256(previousCollector), dOriginal.files.find(f => f.path === connectionPaths[0]).sha256, 'collector production changes exceed the connection acquisition/defer block');
assert.equal((collector.match(/tx\.Commit\(\)/g) ?? []).length, 1); assert.ok(collector.includes('owned, now, err := beginDownloadGCConnection(ctx, r)')); assert.ok(collector.includes('defer owned.close()\n\ttx := owned.tx'));
assert.ok(helper.includes('c.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})')); assert.ok(helper.indexOf('_ = tx.Rollback()') < helper.indexOf('_ = conn.Raw(')); assert.ok(helper.includes('return driver.ErrBadConn')); assert.ok(!/LOCK INSTANCE|UNLOCK INSTANCE/.test(helper));
const required = ['TestDownloadGCConnectionLifecycle/commit', 'TestDownloadGCConnectionLifecycle/unknown_commit', 'TestDownloadGCConnectionLifecycle/rollback_error', 'TestDownloadGCConnectionLifecycle/canceled', 'TestDownloadGCConnectionLifecycle/panic', 'TestDownloadGCConnectionLifecycle/close_error', 'TestDownloadRetentionGCConnectionDisposalAndOriginalOutcome/success', 'TestDownloadRetentionGCConnectionDisposalAndOriginalOutcome/late_write', 'TestDownloadRetentionGCConnectionDisposalAndOriginalOutcome/unknown_commit', 'TestDownloadRetentionGCConnectionDisposalAndOriginalOutcome/panic', 'TestSystemPublisherStagingAndRevocation/absence_expired_during_staging', 'TestSystemPublisherAbsenceExpiredBeforeStagingConvergesUnknown', 'TestRecoveryAuditJournalCanceledQueue/cancel', 'TestFailureJournalsPoisonWithoutWaiting/gc_cancel'];
for (const name of required) assert.ok(names.has(packages[1] + '\0' + name), name);
const failedPrefix = 'docs/evidence/d-gc-connection-20261021-r1-full';
const failed = events(failedPrefix + '.jsonl'); exact(failed.filter(e => e.Test && e.Action === 'fail').map(e => e.Test), ['TestSystemPublisherStagingAndRevocation', 'TestSystemPublisherStagingAndRevocation/absence_expired_during_staging']); assert.equal(json(failedPrefix + '-native.json').exit, 1);
const dCleanupPath = 'docs/evidence/d-gc-connection-cleanup-20261021.json', dCleanup = json(dCleanupPath);
assert.equal(sha256(raw(dCleanupPath)), dReceipt.cleanup.sha256); assert.equal(dCleanup.removed, true); assert.equal(dCleanup.process_terminal, true); assert.equal(fs.existsSync(dCleanup.absolute_owner), false);
assert.equal(path.dirname(dCleanup.absolute_owner).toLowerCase(), workspace.toLowerCase()); assert.match(path.basename(dCleanup.absolute_owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
const stages = ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration'].map(stage => {assert.ok(current.text.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`)); assert.equal(raw(full + '-' + stage + '-stderr.txt').length, 0); return {stage, output_sha256: sha256(raw(full + '-' + stage + '.txt'))};});
const seeds = inventory(full + '-tagged-seed.txt', [packages[1]]).map(e => e.Test); assert.equal(seeds.length, 22); exact(seeds, inventory(aBase + '-tagged-seed.txt', [packages[1]]).map(e => e.Test));
const detached = decode(raw(full + '-detached-seed.txt')); exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), seeds); exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), seeds); assert.match(detached, /\nPASS\s*$/);
const binaries = [...current.text.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m => ({name: m[1], sha256: m[2]})); exact(binaries.map(b => b.name), ['download-admission.test.exe', 'download-admission.test', 'system-backup-migrate']);
for (const flag of ['backup_lock_acquired', 'backup_admin_approved', 'ddl_freeze', 'server_lock_release_proved', 'policy_complete', 'production_approved']) assert.equal(dReceipt.boundaries[flag], false);
const record = {kind: 'a_gc_connection_independent_review_and_merged_five_package_acceptance', recorded_at: new Date().toISOString(), status: 'accepted_merged_frozen_local_connection_and_journals_only',
  source: full + '-source.json', source_manifest_sha256: sha256(raw(full + '-source.json')), source_sha256: source.source_sha256, source_files: source.files.length, events: full + '.jsonl', events_sha256: sha256(raw(full + '.jsonl')), native: full + '-native.txt', native_sha256: current.sha256,
  full: {main: 779, all: 6591, packages: packageResults}, owner_baseline: {main: 617, all: 5012}, a_previous_tests_retained: 6280, d_previous_tests_retained: 6581, inventory_is_exact_union_of_both_reviewed_scopes: true,
  d_preparation: dReceiptPath, d_preparation_sha256: sha256(raw(dReceiptPath)), source_changes_from_a_scope: changed(source, oldA), source_changes_from_d_scope: changed(source, dSource), independently_checked_boundaries: required,
  d_original_publisher_failure_retained: {events_sha256: sha256(raw(failedPrefix + '.jsonl')), native_sha256: sha256(raw(failedPrefix + '-native.json')), exit: 1}, d_cleanup: dCleanupPath, d_cleanup_sha256: sha256(raw(dCleanupPath)), probe_stages: stages, binaries,
  default_vet: true, final_postcheck: true, validation_exit: 0, owned_directories_independently_absent: [current.owner, dCleanup.absolute_owner], connection_and_journal_inputs_currently_match: true, later_parallel_changes_not_accepted: currentDrift, later_parallel_new_test_not_accepted: laterHTTPTest, current_whole_worktree_verified: false,
  actual_sql: false, backup_lock_acquired: false, server_lock_release_proved: false, cleanup_deadline_proved: false, initial_pool_session_cleanliness_proved: false, full_gc_policy_approved: false, production_approved: false, dependencies_installed: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-gc-connection-integration-review-20261021.mjs')), utility_sha256: sha256(raw('docs/evidence/a-frozen-validation-utils-20261021.mjs'))};
const output = path.join(workspace, 'docs/evidence/a-gc-connection-integration-accepted-20261021-r1.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);} else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, full: record.full, owner_checks: 5012, a_tests_retained: 6280, d_tests_retained: 6581, actual_sql: false}));
