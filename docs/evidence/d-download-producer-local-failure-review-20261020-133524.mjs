import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const raw = p => fs.readFileSync(path.join(root, p));
const read = p => { const b = raw(p); return b.toString(b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '').replaceAll('\r', ''); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const source = p => {
  const s = JSON.parse(read(p));
  assert.equal(s.stable_copy_verified, true);
  assert.equal(s.dependencies_installed, false);
  assert.equal(s.production_approved, false);
  assert.equal(new Set(s.files.map(f => f.path)).size, s.files.length);
  assert.equal(sha(Buffer.from(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n')), s.source_sha256);
  return s;
};
const failedLog = 'docs/evidence/d-download-producer-remote-20261020-133524.txt';
const failedSource = 'docs/evidence/d-download-producer-remote-20261020-133524-source.json';
const log = read(failedLog), before = source(failedSource);
assert.equal(before.source_sha256, '4c7d1c7664dc8c84498883f315b470310b7c979b8451c0560e1b54a7773309d6');
assert.equal(before.files.length, 1445);
const failedTests = [...log.matchAll(/^\s*--- FAIL: (\S+) /gm)].map(m => m[1]);
assert.ok(failedTests.includes('TestTaskAuthorityRejectsIdentityAndState/clock_drift'));
assert.ok(failedTests.includes('TestDownloadRetentionGCDirectPublishedColumnTypesAndFKs'));
assert.ok(failedTests.every(t => t.startsWith('TestDownloadRetentionGC') || t.startsWith('TestAGCDirectAuditResourcePublishedInteger') || t.startsWith('TestTaskAuthorityRejectsIdentityAndState')));
assert.ok(log.includes('GC query placeholder mismatch') || log.includes('COLUMN_NAME REGEXP'));
assert.ok(log.includes('state admitted <nil>'));
assert.ok(log.includes('remote validation has not started'));
assert.ok(!/^RUN namespace=|^PASS d-download-producer-mysql/m.test(log));
assert.match(log.trimEnd(), /download_producer_exit=1$/);
assert.ok(log.includes('CLEANED local-registration-build-cache=True'));
const failedOwner = log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();
assert.equal(path.dirname(failedOwner).toLowerCase(), root.toLowerCase());
assert.match(path.basename(failedOwner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(log.includes(`LOCAL_CLEANUP config-writer-source-owned=${failedOwner} removed=True`));
assert.equal(fs.existsSync(failedOwner), false);

function localRun(run) {
  const p = `docs/evidence/d-download-producer-local-repair-20261020-r${run}`;
  const s = source(p + '-source.json'), native = read(p + '-native.txt');
  const events = read(p + '.jsonl').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.ok(!events.some(e => ['fail', 'build-fail', 'skip'].includes(e.Action)));
  const runs = events.filter(e => e.Test && e.Action === 'run').map(e => e.Package + '/' + e.Test).sort();
  const passed = events.filter(e => e.Test && e.Action === 'pass');
  assert.deepEqual(runs, passed.map(e => e.Package + '/' + e.Test).sort());
  for (const marker of ['default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes', 'FROZEN_POSTCHECK pass=yes', 'CLEANED snapshot=True', 'd_admission_native_exit=0']) assert.ok(native.includes(marker), `${run}: ${marker}`);
  assert.equal(read(p + '-stderr.txt'), '');
  const owner = native.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)$/m)[1].trim();
  assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase());
  assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(owner), false);
  const allNames = new Set(passed.map(e => e.Test));
  for (const name of [...failedTests, 'TestTaskAuthorityRejectsIdentityAndState/clock_drift_backward']) assert.ok(allNames.has(name), `original failure not rerun: ${name}`);
  return {p, s, native, events, record: {run, source_files: s.files.length, source_sha256: s.source_sha256, source_manifest_sha256: sha(raw(p + '-source.json')), jsonl_sha256: sha(raw(p + '.jsonl')), main: passed.filter(e => !e.Test.includes('/')).length, all: passed.length, packages: events.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package), exit: 0, default_vet: true, unit_and_final_source_postchecks: true, owner, owner_absent: true}};
}
const focused = localRun(1), full = localRun(2);
assert.deepEqual(full.s.files, focused.s.files);
assert.deepEqual(full.record.packages.sort(), ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence'].sort());
const previous = source('docs/evidence/d-download-gc-direct-20261020-r87-source.json');
assert.deepEqual(previous.files.map(f => f.path), full.s.files.map(f => f.path));
const previousPins = new Map(previous.files.map(f => [f.path, f.sha256]));
const changedSinceR87 = full.s.files.filter(f => previousPins.get(f.path) !== f.sha256).map(f => f.path);
assert.deepEqual(changedSinceR87, ['backend/internal/systembackupevidence/task_authority_test.go', 'scripts/system-backup-a-evidence-validation.ps1']);
// A parallel script edit was already in both repair snapshots. Prove that it
// only sets the ordinary two-package Go test timeout, which this native suite
// also uses; do not attribute it to the task fixture repair.
const validationScript = 'scripts/system-backup-a-evidence-validation.ps1';
const validationCurrent = raw(validationScript).toString('utf8');
const timeoutArguments = "@('test','-count=1','-timeout=900s','-v','./internal/systembackupsecurity','./internal/systembackupevidence')";
const originalArguments = "@('test','-count=1','-v','./internal/systembackupsecurity','./internal/systembackupevidence')";
assert.equal(validationCurrent.split(timeoutArguments).length, 2);
const timeoutComment = "                    # The complete evidence package can exceed Go's default ten\n                    # minutes on the serial Windows gate. Keep every test and\n                    # default vet; this budget is not an assertion-failure retry.\n";
assert.equal(validationCurrent.split(timeoutComment).length, 2);
assert.equal(sha(Buffer.from(validationCurrent.replace(timeoutArguments, originalArguments).replace(timeoutComment, ''))), previousPins.get(validationScript));
const beforePins = new Map(before.files.map(f => [f.path, f.sha256]));
const changedSinceFailure = full.s.files.filter(f => beforePins.get(f.path) !== f.sha256).map(f => f.path);
assert.deepEqual(changedSinceFailure.slice().sort(), ['backend/internal/systembackupevidence/download_retention_gc_references.go', 'backend/internal/systembackupevidence/download_retention_gc_references_test.go', 'backend/internal/systembackupevidence/download_retention_gc_test.go', 'backend/internal/systembackupevidence/task_authority_test.go', validationScript].sort());
for (const stage of ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration']) {
  assert.ok(full.native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
  assert.equal(read(full.p + '-' + stage + '-stderr.txt'), '');
}
const seedEvents = read(full.p + '-tagged-seed.txt').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
assert.ok(!seedEvents.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)));
assert.equal(seedEvents.filter(e => e.Action === 'pass' && e.Test).length, 22);
assert.equal((read(full.p + '-detached-seed.txt').match(/^\s*--- PASS:/gm) || []).length, 22);
const binaries = [...full.native.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m => ({name: m[1], sha256: m[2]}));
assert.equal(binaries.length, 3);
const cleanupPath = 'docs/evidence/d-download-producer-local-repair-cleanup-20261020.json';
const cleanup = JSON.parse(read(cleanupPath));
assert.equal(cleanup.dependencies_installed, false);
assert.equal(cleanup.remote_run, false);
assert.equal(cleanup.paths.length, 3);
for (const entry of cleanup.paths) { assert.equal(entry.absent, true); assert.equal(fs.existsSync(entry.path), false); }
for (const owner of [focused.record.owner, full.record.owner]) assert.ok(cleanup.paths.some(e => e.path === owner));
const drift = full.s.files.filter(f => !fs.existsSync(path.join(root, f.path)) || sha(raw(f.path)) !== f.sha256 || raw(f.path).length !== f.size).map(f => f.path);
assert.deepEqual(drift, []);
const currentList = 'docs/evidence/d-download-producer-local-repair-current-files-20261020.txt';
assert.deepEqual(read(currentList).trim().split('\n').filter(Boolean), full.s.files.map(f => f.path));
const record = {kind: 'd_producer_operator_local_gate_failure_and_repair_review', recorded_at: new Date().toISOString(), failed_run: {log: failedLog, log_sha256: sha(raw(failedLog)), source: failedSource, manifest_sha256: sha(raw(failedSource)), source_sha256: before.source_sha256, source_files: before.files.length, failed_tests: failedTests, failed_leaf_count: failedTests.filter(t => !failedTests.some(other => other.startsWith(t + '/'))).length, exit: 1, remote_started: false, actual_producer_cases: 0, owner: failedOwner, owner_absent: true, build_cache_cleaned: true, final_source_postcheck_reported: false}, reasons: ['Old GC SQL model counted literal regexp question marks as bind placeholders, rejecting metadata before the intended assertions; current r87 also includes independently checked published column types and fresh GC fixture clocks.', 'Task clock-drift timestamp was sampled before all preceding subtests, so elapsed setup could move it into the allowed five-second window. Resolve each temporal mutation after its own fixture and require clock cases to reach the final SQL check.'], changed_since_failed_run: changedSinceFailure, changed_since_r87: ['backend/internal/systembackupevidence/task_authority_test.go'], focused: focused.record, full: full.record, producer_seeds: 22, detached_producer_seeds: 22, binaries, cleanup: cleanupPath, current_pinned_sources_match: true, dependencies_installed: false, remote_run: false, actual_producer_cases: 0, production_approved: false, scope: 'Local repair and preparation only. Keep original exit 1; producer eighteen actual SQL cases still require their own operator receipt.'};
const output = path.join(root, 'docs/evidence/d-download-producer-local-failure-20261020-133524.json');
record.changed_since_r87 = changedSinceR87;
record.concurrent_validation_script_change = {path: validationScript, only_change: 'Two-package Go test timeout explicitly set to 900s; no request/SQL/provider deadline change.', reverted_bytes_match_r87: true, same_timeout_used_in_full_native_run: true};
record.current_input_list = {path: currentList, sha256: sha(raw(currentList))};
if (process.argv.includes('--check')) {
  const saved = JSON.parse(fs.readFileSync(output, 'utf8'));
  record.recorded_at = saved.recorded_at;
  assert.deepEqual(record, saved);
} else {
  assert.equal(fs.existsSync(output), false);
  fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
}
console.log(JSON.stringify({failed_leaf_count: record.failed_run.failed_leaf_count, focused: focused.record, full: full.record, producer_seeds: 22, current_pinned_sources_match: true, remote_run: false, cleaned_directories: cleanup.paths.length}));
