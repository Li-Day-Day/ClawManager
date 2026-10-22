// Independently validate scoped queue-cancellation fixes and fault overlays.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, raw, json, decode, sha256, events, exact, manifest, inventory, native, changed} from './a-frozen-validation-utils-20261021.mjs';
const prefix = 'docs/evidence/a-journal-cancel-20261021-r1', full = prefix + '-full';
const base = 'docs/evidence/a-gc-journal-20261021-r1-full';
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer'].map(n => 'clawreef/internal/' + n);
const source = manifest(full + '-source.json'), counter = manifest(prefix + '-counters-source.json'), old = manifest(base + '-source.json');
const nf = native(full + '-native.txt', source, 'CLEANED snapshot=True'), nc = native(prefix + '-counters-native.txt', counter, 'CLEANED counter_snapshot=True', false);
assert.ok(nf.text.includes('NATIVE_EXIT full_packages=0')); assert.ok(nf.text.includes('FROZEN_UNIT_POSTCHECK pass=yes'));
assert.equal(raw(full + '-stderr.txt').length, 0);
const faults = [
  {stage: 'cancel', failed: ['TestRecoveryAuditJournalCanceledQueue', 'TestRecoveryAuditJournalCanceledQueue/cancel', 'TestRecoveryAuditJournalCanceledQueue/deadline'], healthy: ['TestRecoveryAuditJournalConcurrentCompleteRecords']},
  {stage: 'poison', failed: ['TestFailureJournalsPoisonWithoutWaiting', ...['download_cancel', 'download_private', 'gc_cancel', 'gc_private'].map(n => 'TestFailureJournalsPoisonWithoutWaiting/' + n)], healthy: []}
].map(f => {
  const p = prefix + '-' + f.stage, es = events(p + '.jsonl');
  assert.ok(nc.text.includes(`JOURNAL_STAGE name=${f.stage} exit=1 expected=1 default_vet=yes dependencies-installed=no`)); assert.equal(raw(p + '-stderr.txt').length, 0);
  assert.ok(!es.some(e => ['skip', 'build-fail'].includes(e.Action))); exact(es.filter(e => e.Test && e.Action === 'fail').map(e => e.Test), f.failed);
  exact(es.filter(e => e.Test && e.Action === 'pass').map(e => e.Test), f.healthy);
  exact(es.filter(e => !e.Test && e.Action === 'fail').map(e => e.Package), [packages[1]]);
  for (const leaf of f.failed.filter(n => n.includes('/'))) assert.ok(es.some(e => e.Test === leaf && e.Action === 'output' && e.Output.includes('canceled/failed journal waited for another writer')));
  return {...f, events_sha256: sha256(raw(p + '.jsonl')), exit: 1, expected_failure: true};
});
const overlaysPath = prefix + '-overlays.json', overlays = json(overlaysPath); exact(overlays.map(o => o.name), ['cancel', 'poison']);
for (const o of overlays) {
  const pin = counter.files.find(f => f.path === o.source); assert.ok(pin); assert.equal(pin.sha256, o.source_sha256);
  const bytes = raw(o.source); assert.equal(sha256(bytes), o.source_sha256);
  const text = decode(bytes); assert.equal(text.split(o.from).length, 2); assert.equal(sha256(text.replace(o.from, o.to)), o.injected_sha256);
}
const targeted = inventory(prefix + '-focused.jsonl', [packages[1]]); assert.equal(targeted.length, 162); assert.equal(targeted.filter(e => !e.Test.includes('/')).length, 23);
assert.ok(nc.text.includes('JOURNAL_STAGE name=focused exit=0 expected=0 default_vet=yes')); assert.equal(raw(prefix + '-focused-stderr.txt').length, 0);
const passed = inventory(full + '.jsonl', packages), before = inventory(base + '.jsonl', packages);
const beforeNames = new Set(before.map(e => `${e.Package}\0${e.Test}`)), names = new Set(passed.map(e => `${e.Package}\0${e.Test}`));
assert.equal(beforeNames.size, 6270); assert.ok([...beforeNames].every(n => names.has(n))); assert.ok(targeted.every(e => names.has(`${e.Package}\0${e.Test}`)));
const added = passed.filter(e => !beforeNames.has(`${e.Package}\0${e.Test}`)); assert.equal(added.length, 10); assert.equal(added.filter(e => !e.Test.includes('/')).length, 4);
exact(added.filter(e => !e.Test.includes('/')).map(e => e.Test), ['TestRecoveryAuditJournalCanceledQueue', 'TestFailureJournalsPoisonWithoutWaiting', 'TestRecoveryAuditJournalConcurrentCompleteRecords', 'TestRecoveryAuditJournalPoisonDeniesBeforeQueue']);
assert.equal(passed.length, 6280); assert.equal(passed.filter(e => !e.Test.includes('/')).length, 763);
const two = passed.filter(e => packages.slice(0, 2).includes(e.Package)); assert.equal(two.length, 4977); assert.equal(two.filter(e => !e.Test.includes('/')).length, 613);
const parallelPackage = p => p.startsWith('backend/internal/systembackupgcmetadata/');
exact(changed(source, old).filter(p => /^(backend|contracts)\//.test(p) && !parallelPackage(p)), ['system_recovery_audit_journal.go', 'system_recovery_audit_journal_context_test.go', 'download_failure_journal.go', 'download_failure_journal_test.go'].map(n => 'backend/internal/systembackupevidence/' + n));
assert.ok(old.files.every(f => source.files.some(n => n.path === f.path)));
const between = changed(source, counter); assert.ok(between.every(p => p === 'backend/internal/systembackupevidence/system_recovery_audit_journal_context_test.go' || parallelPackage(p)));
assert.ok(between.includes('backend/internal/systembackupevidence/system_recovery_audit_journal_context_test.go'));
const currentDrift = source.files.filter(f => {try {const b = raw(f.path); return b.length !== f.size || sha256(b) !== f.sha256;} catch {return true;}}).map(f => f.path);
const laterParallelInputs = ['download_retention_gc.go', 'download_retention_gc_test.go', 'system_publish_runtime_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
assert.ok(currentDrift.every(p => parallelPackage(p) || laterParallelInputs.includes(p)), 'Unreviewed drift outside the explicit exclusions');
// These are recorded as later, unaccepted work. They never alter the frozen
// manifest/test inventory or exempt future actual transcripts from source pins.
const ownInputs = ['system_recovery_audit_journal.go', 'system_recovery_audit_journal_context_test.go', 'download_failure_journal.go', 'download_failure_journal_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
assert.ok(ownInputs.every(p => !currentDrift.includes(p)));
const stages = ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration'].map(stage => {assert.ok(nf.text.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`)); assert.equal(raw(full + '-' + stage + '-stderr.txt').length, 0); return {stage, output_sha256: sha256(raw(full + '-' + stage + '.txt'))};});
const seeds = inventory(full + '-tagged-seed.txt', [packages[1]]).map(e => e.Test); assert.equal(seeds.length, 22); exact(seeds, inventory(base + '-tagged-seed.txt', [packages[1]]).map(e => e.Test));
const detached = decode(raw(full + '-detached-seed.txt')); exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), seeds); exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), seeds); assert.match(detached, /\nPASS\s*$/);
const binaries = [...nf.text.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m => ({name: m[1], sha256: m[2]})); exact(binaries.map(b => b.name), ['download-admission.test.exe', 'download-admission.test', 'system-backup-migrate']);
const cleanupPath = prefix + '-cleanup.json', cleanup = json(cleanupPath); assert.equal(cleanup.validation_exit, 0); assert.equal(cleanup.counter_exists, false); assert.equal(cleanup.cache_exists, false); assert.equal(cleanup.remote_executed, false); assert.equal(cleanup.dependencies_installed, false); assert.equal(cleanup.counter_owner, nc.owner);
assert.equal(path.resolve(cleanup.cache_owner), path.join(workspace, '.tmp-d-admission-a-journal-cancel-20261021-r1')); for (const p of [nc.owner, nf.owner, cleanup.cache_owner]) assert.equal(fs.existsSync(p), false);
const oldProof = 'docs/evidence/a-gc-journal-accepted-20261021-r1.json'; assert.equal(sha256(raw(oldProof)), '94ba4e573ccd1ef62ea00cd061ba383debaf15b6ca2be2055d31969f7368e322');
const record = {kind: 'a_context_cancellable_audit_and_failure_journal_local_acceptance', recorded_at: new Date().toISOString(), status: 'accepted_frozen_local_queue_and_latch_only', source: full + '-source.json', source_manifest_sha256: sha256(raw(full + '-source.json')), source_sha256: source.source_sha256, source_files: source.files.length,
  events: full + '.jsonl', events_sha256: sha256(raw(full + '.jsonl')), native: full + '-native.txt', native_sha256: nf.sha256, full: {main: 763, all: 6280}, owner_baseline: {main: 613, all: 4977}, old_tests_retained: 6270, old_owner_tests_retained: 4967, new_tests: {main: 4, all: 10, names: added.map(e => e.Test).sort()},
  counter_source: prefix + '-counters-source.json', counter_source_manifest_sha256: sha256(raw(prefix + '-counters-source.json')), counter_source_sha256: counter.source_sha256, counter_native_sha256: nc.sha256, counterfactuals: faults, overlays_sha256: sha256(raw(overlaysPath)), focused: {main: 23, all: 162, events_sha256: sha256(raw(prefix + '-focused.jsonl'))}, final_source_changes_after_counters: between,
  final_source_strengthens_already_queued_cancellation_check: true, probe_stages: stages, binaries, default_vet: true, final_postcheck: true, validation_exit: 0, cleanup: cleanupPath, cleanup_sha256: sha256(raw(cleanupPath)), owned_directories_independently_absent: [nc.owner, nf.owner, cleanup.cache_owner],
  parallel_source_not_functionally_accepted: source.files.filter(f => parallelPackage(f.path)).map(f => f.path), later_parallel_changes_not_accepted: currentDrift.filter(p => !parallelPackage(p)), own_fix_current_bytes_match: true, current_pinned_drift: currentDrift, current_whole_worktree_verified: false, actual_sql: false, actual_provider: false, filesystem_io_preemption_proved: false, production_approved: false, dependencies_installed: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-journal-cancel-review-20261021.mjs')), utility_sha256: sha256(raw('docs/evidence/a-frozen-validation-utils-20261021.mjs'))};
const output = path.join(workspace, 'docs/evidence/a-journal-cancel-accepted-20261021-r1.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);} else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, full: record.full, added: 10, owner_checks: 4977, counterfactual_failed_leaves: 6, cleaned: 3}));
