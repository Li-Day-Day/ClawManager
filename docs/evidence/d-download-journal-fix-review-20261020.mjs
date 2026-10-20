import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidence = 'docs/evidence/';
const focused = evidence + 'd-download-journal-fix-20261020-r60';
const full = evidence + 'd-download-journal-fix-20261020-r61';
const frozen = evidence + 'd-download-journal-frozen-20261020-r62';
const read = p => fs.readFileSync(path.join(root, p));
// Windows PowerShell Tee-Object logs are UTF-16LE; PS7/native JSON is UTF-8.
// Keep raw byte hashes independent of the decoding used for assertions.
const utf8 = p => {
  const b = read(p);
  return b.toString(b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const json = p => JSON.parse(utf8(p));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pin = p => ({ path: p, bytes: read(p).length, sha256: sha(read(p)) });

function manifest(p) {
  const m = json(p);
  assert.equal(m.stable_copy_verified, true);
  assert.equal(m.dependencies_installed, false);
  assert.equal(m.production_approved, false);
  assert.equal(new Set(m.files.map(x => x.path)).size, m.files.length);
  // Preserve the source recorder's order. Set checks are independent below.
  const body = m.files.map(x => `${x.path}\0${x.sha256}\0${x.size}`).join('\n') + '\n';
  assert.equal(sha(body), m.source_sha256);
  return m;
}

function tests(p) {
  const events = utf8(p).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(events.filter(x => x.Action === 'fail').length, 0);
  assert.equal(events.filter(x => x.Action === 'skip').length, 0);
  const passed = events.filter(x => x.Action === 'pass' && x.Test);
  assert.equal(new Set(passed.map(x => x.Package + ':' + x.Test)).size, passed.length);
  for (const name of ['replace', 'replace_append']) {
    assert(passed.some(x => x.Test === 'TestDownloadFailureJournalTamperAndCapacity/' + name));
  }
  return { main: passed.filter(x => !x.Test.includes('/')).length, all: passed.length,
    packages: events.filter(x => x.Action === 'pass' && !x.Test).map(x => x.Package) };
}

const originalLog = evidence + 'd-download-task-chain-remote-20261020-085907.txt';
const failed = utf8(originalLog);
const failureNames = [...failed.matchAll(/^\s*--- FAIL: ([^\s]+)/gm)].map(x => x[1]).sort();
assert.deepEqual(failureNames, ['TestDownloadFailureJournalTamperAndCapacity', 'TestDownloadFailureJournalTamperAndCapacity/replace']);
assert(failed.includes('The process cannot access the file because it is being used by another process.'));
assert(failed.includes('remote validation has not started'));
assert(failed.includes('download_task_chain_exit=1'));
assert(failed.includes('CLEANED local-registration-build-cache=True'));
assert(!/^=== RUN\s+TestDTaskOwnerDownloadChainMySQL(?:\/|\r?$)/m.test(failed));
const producerFailurePath = evidence + 'd-download-producer-remote-20261020-090845.txt';
const producerFailure = utf8(producerFailurePath);
assert(producerFailure.includes('download_retention_gc.go: The system cannot find the file specified.'));
assert(producerFailure.includes('remote validation has not started'));
assert(producerFailure.includes('download_producer_exit=1'));
assert(!/^=== RUN\s+TestDProducerDownloadOwnersMySQL(?:\/|\r?$)/m.test(producerFailure));
const originalScratch = [...new Set([failed, producerFailure].flatMap(t =>
  [...t.matchAll(/\.tmp-a-evidence-[0-9a-f]{32}/g)].map(x => x[0])))];
assert.equal(originalScratch.length, 2);
for (const name of originalScratch) assert.equal(fs.existsSync(path.join(root, name)), false);

const first = manifest(focused + '-source.json');
const last = manifest(full + '-source.json');
const focusTests = tests(focused + '.jsonl');
assert.deepEqual([focusTests.main, focusTests.all], [5, 32]);
const fullTests = tests(full + '.jsonl');
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer', 'cmd/server']
  .map(x => x.startsWith('cmd/') ? 'clawreef/' + x : 'clawreef/internal/' + x);
assert.deepEqual([...fullTests.packages].sort(), [...packages].sort());
assert(fullTests.main >= 700 && fullTests.all >= 5569);
const native = utf8(full + '-native.txt');
for (const token of ['NATIVE_EXIT full_packages=0', 'default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes',
  'NATIVE_PROBE stage=tagged-seed exit=0', 'NATIVE_PROBE stage=windows-probe exit=0', 'NATIVE_PROBE stage=detached-seed exit=0',
  'NATIVE_PROBE stage=linux-probe exit=0', 'NATIVE_PROBE stage=linux-migration exit=0', 'FROZEN_POSTCHECK pass=yes',
  'CLEANED snapshot=True', 'd_admission_native_exit=0']) assert(native.includes(token), token);
const focusNative = utf8(focused + '-native.txt');
for (const token of ['NATIVE_EXIT focused_packages=0', 'FROZEN_POSTCHECK pass=yes', 'CLEANED snapshot=True', 'd_admission_native_exit=0']) assert(focusNative.includes(token));

const taggedEvents = utf8(full + '-tagged-seed.txt').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(taggedEvents.filter(x => x.Action === 'fail' || x.Action === 'skip').length, 0);
const tagged = taggedEvents.filter(x => x.Action === 'pass' && x.Test).map(x => x.Test);
const detached = [...utf8(full + '-detached-seed.txt').matchAll(/^\s*--- PASS: ([^\s]+)/gm)].map(x => x[1]);
assert.equal(tagged.length, 19);
assert.equal(new Set(tagged).size, 19);
assert.deepEqual([...tagged].sort(), detached.sort());
const binaryPins = [...native.matchAll(/NATIVE_PROBE_BINARY name=([^\s]+) sha256=([0-9a-f]{64})/g)]
  .map(x => ({ name: x[1], sha256: x[2], deleted: true }));
assert.deepEqual(binaryPins.map(x => x.name).sort(), ['download-admission.test', 'download-admission.test.exe', 'system-backup-migrate']);

const prior = new Map(first.files.map(x => [x.path, x]));
assert.deepEqual([...prior.keys()].sort(), last.files.map(x => x.path).sort());
const between = last.files.filter(x => x.sha256 !== prior.get(x.path).sha256).map(x => x.path).sort();
assert.deepEqual(between, ['backend/internal/systembackupevidence/download_failure_journal.go', 'backend/internal/systembackupevidence/download_failure_journal_test.go']);

// The subsequent change is only the existing freeze wrapper's two profiles.
// The full Go/probe scope is identical; exercise the actual wrapper locally as
// well as both real dispatchers before recommending the new remote command.
const wrapper = manifest(frozen + '-source.json');
const beforeWrapper = new Map(last.files.map(x => [x.path, x]));
assert.deepEqual(wrapper.files.map(x => x.path).sort(), [...beforeWrapper.keys()].sort());
const wrapperChanges = wrapper.files.filter(x => x.sha256 !== beforeWrapper.get(x.path).sha256).map(x => x.path);
assert.deepEqual(wrapperChanges, ['scripts/system-backup-d-config-writer-validation.ps1']);
const wrapperLog = utf8(frozen + '-native.txt');
for (const token of ['config-writer-frozen=yes', 'download-task-chain-only=yes',
  'config-standalone-seed=yes checkout-fixtures=absent', 'linux-mysql-probe-compiled=yes real_mysql=not_run',
  'pinned-migration-runner-compiled=yes', 'config-writer-frozen-postcheck=yes', 'remote-requested=False',
  'CLEANED local-registration-build-cache=True', 'removed=True', 'd_download_frozen_exit=0']) assert(wrapperLog.includes(token), token);
assert(!/^\s*--- FAIL:|^FAIL(?:\s|$)|^panic:|^fatal error:/m.test(wrapperLog));
const wrapperPasses = [...wrapperLog.matchAll(/^\s*--- PASS: ([^\s]+)/gm)].map(x => x[1]);
const wrapperOrdinary = wrapperPasses.filter(x => !x.split('/')[0].endsWith('MySQLSeed'));
const fullEvents = utf8(full + '.jsonl').trim().split(/\r?\n/).map(JSON.parse);
const correspondingTests = fullEvents.filter(x => x.Action === 'pass' && x.Test && /\/(systembackupsecurity|systembackupevidence)$/.test(x.Package)).map(x => x.Test);
assert.deepEqual([...wrapperOrdinary].sort(), correspondingTests.sort());
assert.equal(wrapperPasses.length - wrapperOrdinary.length, 38);
for (const p of [evidence + 'd-download-frozen-dispatch-20261020-ps7-r2.txt', evidence + 'd-download-frozen-dispatch-20261020-ps5.txt']) {
  const out = utf8(p);
  for (const token of ['profile=TaskChain', 'profile=Producer', 'exclusive-counterexamples=8', 'mixed-task-producer=rejected', 'build=no remote=no dependencies=no']) assert(out.includes(token));
}

const list = utf8(full + '-current-files.txt').trim().split(/\r?\n/).map(x => x.replaceAll('\\', '/')).filter(p =>
  (!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || [
    'docs/system-backup-restore-schema-inventory.json', 'docs/evidence/a-config-canonical-request-vectors-20261014.json',
    'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
    'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
    'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json'].includes(p)) &&
  !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p) &&
  /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p));
const expected = new Map(wrapper.files.map(x => [x.path, x]));
const drift = list.filter(p => !expected.has(p));
for (const p of wrapper.files) {
  if (!fs.existsSync(path.join(root, p.path))) { drift.push(p.path); continue; }
  const b = read(p.path);
  if (b.length !== p.size || sha(b) !== p.sha256 || !list.includes(p.path)) drift.push(p.path);
}
const cleanup = json(evidence + 'd-download-journal-fix-cleanup-20261020.json');
assert.equal(cleanup.all_absent, true);
for (const item of cleanup.paths) assert.equal(fs.existsSync(item.path), false);
assert.equal(fs.existsSync(path.join(root, 'backend/internal/systembackupevidence/download_retention_gc.go')), false);
const wrapperBinary = wrapperLog.match(/real_mysql=not_run binary_sha256=([0-9a-f]{64}) ddl_sha256=([0-9a-f]{64})/);
const wrapperRunner = wrapperLog.match(/pinned-migration-runner-compiled=yes migration_binary_sha256=([0-9a-f]{64})/);
assert(wrapperBinary && wrapperRunner);
assert.equal(wrapperBinary[2], 'c76f218ff8e440707249ec829401514da1def8305a8778fe22a89ea499b54b0f');

const result = {
  kind: 'd_download_journal_windows_fix_review.v1', reviewed_at: new Date().toISOString(),
  original_local_failure: pin(originalLog), original_failed_tests: failureNames, original_remote_started: false,
  producer_local_source_race: pin(producerFailurePath), producer_failure_caused_by_D_draft_removal: true,
  original_operator_local_scratch_absent: originalScratch,
  focused: { source_sha256: first.source_sha256, files: first.files.length, ...focusTests },
  full: { source_sha256: last.source_sha256, files: last.files.length, ...fullTests, tagged_seed: 19, detached_seed: 19,
    windows_probe: true, linux_probe: true, linux_runner: true, default_vet: true, binary_pins: binaryPins },
  concurrent_A_permission_change_between_scopes: between,
  frozen_wrapper: { source_sha256: wrapper.source_sha256, files: wrapper.files.length,
    changed_inputs: wrapperChanges, ordinary_main: wrapperOrdinary.filter(x => !x.includes('/')).length,
    ordinary_all: wrapperOrdinary.length, tagged_seed: 19, detached_seed: 19, actual_local_validation: true,
    actual_remote: false, ps7_dispatch: true, ps5_dispatch: true,
    linux_probe_sha256: wrapperBinary[1], linux_runner_sha256: wrapperRunner[1], capsule_sha256: wrapperBinary[2] },
  current_sources_match: drift.length === 0, current_source_drift: [...new Set(drift)],
  fixed_test: pin('backend/internal/systembackupevidence/download_failure_journal_test.go'),
  cleanup: pin(evidence + 'd-download-journal-fix-cleanup-20261020.json'),
  actual_mysql: false, remote_executed_by_D: false, installed_dependencies: false, production_enabled: false,
  gc_implemented: false, original_six_scopes_complete: false,
  reviewer: pin(evidence + 'd-download-journal-fix-review-20261020.mjs'),
  verified_evidence_inputs: [focused + '-source.json', focused + '-native.txt', focused + '.jsonl',
    full + '-source.json', full + '-native.txt', full + '.jsonl', full + '-tagged-seed.txt', full + '-detached-seed.txt',
    frozen + '-source.json', frozen + '-native.txt', evidence + 'd-download-frozen-dispatch-20261020-ps7-r2.txt',
    evidence + 'd-download-frozen-dispatch-20261020-ps5.txt', evidence + 'd-download-journal-fix-native-cleanup-20261020.json'].map(pin)
};
fs.writeFileSync(path.join(root, full + '-review.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ frozen_validation_passed: true, full_main: fullTests.main, full_all: fullTests.all,
  seed: 19, detached: 19, wrapper_main: result.frozen_wrapper.ordinary_main, wrapper_all: wrapperOrdinary.length,
  current_sources_match: result.current_sources_match, current_source_drift: result.current_source_drift,
  cleaned_owned_paths: cleanup.paths.length, actual_mysql: false, remote_executed_by_D: false }));
if (drift.length) process.exitCode = 1;
