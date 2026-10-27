import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode = '--inspect', finalRound = 'r3'] = process.argv.slice(2);
assert.match(finalRound, /^r[1-9][0-9]*$/);
assert.ok(Number(finalRound.slice(1)) >= 3);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const prefix = r => `docs/evidence/a-download-output-deadline-20261019-${r}`;
const load = r => {
  const p = prefix(r), events = read(p + '.jsonl').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  return { round: r, prefix: p, events, transcript: read(p + '-native.txt'), stderr: read(p + '-stderr.txt'), source: JSON.parse(read(p + '-source.json')) };
};
const summary = r => ({ round: r.round, passing_tests: r.events.filter(e => e.Test && e.Action === 'pass').length,
  per_package: Object.fromEntries([...new Set(r.events.filter(e => e.Test && e.Action === 'pass').map(e => e.Package))].sort().map(p => { const tests = r.events.filter(e => e.Package === p && e.Test && e.Action === 'pass'); return [p, { main: tests.filter(e => !e.Test.includes('/')).length, total: tests.length }]; })),
  failed_tests: r.events.filter(e => e.Test && e.Action === 'fail').map(e => e.Test),
  packages: r.events.filter(e => !e.Test && ['pass', 'fail', 'build-fail'].includes(e.Action)).map(e => ({ name: e.Package, action: e.Action })),
  completed: /^d_admission_native_exit=[01]\s*$/m.test(r.transcript) });
if (mode === '--inspect') {
  for (const round of ['r1', 'r2', finalRound]) {
    if (fs.existsSync(prefix(round) + '.jsonl')) console.log(JSON.stringify(summary(load(round))));
  }
  process.exit(0);
}
assert.ok(['--record', '--verify'].includes(mode));
const baseline = load('r1'), focused = load('r2'), final = load(finalRound), checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const root = 'TestADownloadNativeBufferedOutputKeepsOriginalDeadline';
const failed = baseline.events.filter(e => e.Test && e.Action === 'fail').map(e => e.Test).sort();
check('original five root/leaf failures preserved without selective removal', JSON.stringify(failed) === JSON.stringify([root, ...['http1', 'http2'].flatMap(p => ['before_deadline', 'result_crosses_deadline'].map(m => `${root}/${p}/${m}`))].sort()));
check('original HTTP/1 control reached successful body then rejected premature deadline clear', baseline.events.some(e => e.Test === root + '/http1/before_deadline' && e.Output?.includes('handler cleared deadline before native server final flush 1')));
check('original HTTP/1 failure reached plaintext after original expiry', baseline.events.filter(e => e.Test === root + '/http1/result_crosses_deadline' && e.Output?.includes('buffered plaintext flushed after original deadline http1 cleared 1')).length === 1);
check('original HTTP/2 leaves rejected empty native bodies before admission, not claimed as expiry repro', baseline.events.filter(e => e.Test?.startsWith(root + '/http2/') && e.Output?.includes('native response did not reach independent result/release') && e.Output.includes('validation_failed')).length === 2);
check('original failure exited one without retry', /^NATIVE_EXIT focused_packages=1\b/m.test(baseline.transcript) && /^d_admission_native_exit=1\s*$/m.test(baseline.transcript));
check('intermediate focused real TLS/buffer-wipe tests passed with native and outer exit zero', !focused.events.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)) && /^NATIVE_EXIT focused_packages=0 .*default_vet=yes\s*$/m.test(focused.transcript) && /^d_admission_native_exit=0\s*$/m.test(focused.transcript));
check('final packages have no failed/skipped assertions or build failures', !final.events.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)) && !/panic:|fatal error:|\.exe: exit status/.test(final.stderr));
const passingTests = final.events.filter(e => e.Test && e.Action === 'pass');
check('each final package/test has one passing terminal event', new Set(passingTests.map(e => e.Package + '\0' + e.Test)).size === passingTests.length);
const packages = final.events.filter(e => e.Action === 'pass' && !e.Test).map(e => e.Package).sort();
check('complete security and evidence packages passed once', JSON.stringify(packages) === JSON.stringify(['clawreef/internal/systembackupevidence', 'clawreef/internal/systembackupsecurity']));
check('new native tests plus both protocols and expiry controls passed', ['http1', 'http2'].every(p => ['before_deadline', 'result_crosses_deadline'].every(m => final.events.some(e => e.Test === `${root}/${p}/${m}` && e.Action === 'pass'))));
check('original plaintext buffer wiped after complete, short and panic writes', ['complete', 'short_write', 'panic_write'].every(m => final.events.some(e => e.Test === `TestADownloadPlaintextWipedAfterWriteAndAbort/${m}` && e.Action === 'pass')));
check('both new test roots passed', [root, 'TestADownloadPlaintextWipedAfterWriteAndAbort'].every(t => final.events.some(e => e.Test === t && e.Action === 'pass')));
const bodyRoot = 'TestADownloadEmptyBodyCheckedBeforeAdmissionWithBoundedRead';
const bodyCases = ['eof', 'data', 'no_progress', 'private_error', 'read_unsupported', 'reset_error', 'canceled', 'late_eof', 'late_trailer', 'positive_length', 'unknown_length', 'transfer', 'trailer'];
check('all thirteen pre-admission body/framing/deadline/error cases and root passed', [bodyRoot, ...bodyCases.map(c => bodyRoot + '/' + c)].every(t => final.events.some(e => e.Test === t && e.Action === 'pass')));
check('final actual native and wrapper exits zero with default vet', /^NATIVE_EXIT full_packages=0 .*default_vet=yes\s*$/m.test(final.transcript) && /^d_admission_native_exit=0\s*$/m.test(final.transcript));
const owned = [];
for (const r of [baseline, focused, final]) {
  const s = r.source;
  check(`${r.round}: bounded stable capture without dependency install`, s.stable_copy_verified && s.dependencies_installed === false && (!s.capture_attempts || s.capture_attempts <= 3));
  check(`${r.round}: unique source paths`, new Set(s.files.map(f => f.path)).size === s.files.length);
  check(`${r.round}: independently recomputed source digest`, hash(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === s.source_sha256);
  check(`${r.round}: frozen postcheck and reported cleanup`, r.transcript.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no') && r.transcript.includes('CLEANED snapshot=True'));
  const owner = r.transcript.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\r?$/m)?.[1].trim();
  check(`${r.round}: exact enclosing source/cache owner independently absent`, owner && path.dirname(path.resolve(owner)).toLowerCase() === process.cwd().toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)) && !fs.existsSync(owner));
  owned.push({ round: r.round, path: owner, independently_absent: true });
}
const focus = ['download_admitted_http.go', 'download_output_deadline_a_test.go', 'download_committed.go', 'download_authority.go', 'download_authority_sql.go', 'download_result.go', 'download_runtime.go', 'download_admission_transaction.go', 'sql.go'].map(n => 'backend/internal/systembackupevidence/' + n);
const pins = focus.map(name => {
  const pin = final.source.files.find(f => f.path === name), bytes = fs.readFileSync(name);
  check('reviewed final source still matches: ' + name, pin && pin.sha256 === hash(bytes) && pin.size === bytes.length);
  return pin;
});
const current = read(focus[0]);
check('handler does not clear deadline before server final flush', !current.includes('SetWriteDeadline(time.Time{})') && current.includes('SetWriteDeadline(c.localDeadline)'));
check('native empty body verified under bounded read before SQL admission', current.indexOf('normalizeEmptyDownloadBody(w, r)') < current.indexOf('h.admission.admit(request, true)') && current.includes('SetReadDeadline(until)') && current.includes('n != 0 || err != io.EOF || len(r.Trailer) != 0') && current.includes('request.Body = http.NoBody'));
check('baseline and final handler bytes differ', baseline.source.files.find(f => f.path === focus[0]).sha256 !== pins[0].sha256);
const drift = final.source.files.flatMap(f => {
  if (!fs.existsSync(f.path)) return [{ path: f.path, state: 'missing' }];
  const bytes = fs.readFileSync(f.path), actual = hash(bytes);
  return actual !== f.sha256 || bytes.length !== f.size ? [{ path: f.path, frozen_sha256: f.sha256, current_sha256: actual, reason: 'post-capture shared-tree change; new bytes excluded' }] : [];
});
const cacheOwnerFile = 'docs/evidence/a-download-output-cache-owner-20261019.json';
const cache = JSON.parse(read(cacheOwnerFile)), cleanupFile = 'docs/evidence/a-download-output-cache-cleanup-20261019.json', cleanup = JSON.parse(read(cleanupFile));
check('shared cache belongs only to this A review and was removed', cache.source_is_same_review_r1 === true && cache.dependencies_installed === false && cleanup.path === cache.path && cleanup.removed === true && !fs.existsSync(cache.path));
check('shared cache guarded by exact workspace child and original marker', path.dirname(path.resolve(cache.path)).toLowerCase() === process.cwd().toLowerCase() && /^\.tmp-d-admission-a-output-20261019-[a-f0-9]{32}$/.test(path.basename(cache.path)) && cleanup.marker === path.basename(cache.path));
const receipt = { kind: 'a_download_output_deadline_independent_review', version: 1, date: '2026-10-19', status: 'accepted_with_explicit_scope',
  defects: ['Handler cleared native response write deadline before independent result audit and server final buffered flush; original TLS HTTP/1 reproduced plaintext after the original deadline.', 'Strict Body pointer comparison rejected normal native HTTP/2 empty GETs before SQL; both original HTTP/2 leaves show validation_failed, not an HTTP/2 expiry reproduction.'],
  changes: ['Keep original response deadline through result recording and native server flush; HTTP server owns connection/stream final cleanup.', 'Verify empty request-body EOF with one-byte read under a bounded native read deadline, rejecting late EOF/trailers/cancellation/errors before SQL; normalize only the clone passed to admission.'],
  baseline: summary(baseline), focused: summary(focused), final: summary(final), source: { files: final.source.files.length, sha256: final.source.source_sha256 },
  checks, check_count: checks.length, focus_pins: pins, post_capture_changes_excluded: drift, cleanup: owned,
  artifacts: [...[baseline, focused, final].flatMap(r => ['.jsonl', '-source.json', '-native.txt', '-stderr.txt'].map(ext => ({ path: r.prefix + ext, sha256: hash(fs.readFileSync(r.prefix + ext)) }))), ...[cacheOwnerFile, cleanupFile].map(p => ({ path: p, sha256: hash(fs.readFileSync(p)) }))],
  scope: { native_tls_http1_http2: true, actual_jwt_ed25519_envelope_and_http: true, synthetic_sql_owner_capacity_and_provider: true,
    actual_mysql: false, actual_sts_kms: false, human_mfa: false, production_enabled: false, formal_schema_approved: false,
    whole_objective_complete: false, note: 'local_write_complete records the local Write return; it never proves client delivery. Earlier remote suites retain their own scope.' } };
const output = 'docs/evidence/a-download-output-deadline-review-20261019.json';
if (mode === '--verify') assert.deepEqual(JSON.parse(read(output)), receipt);
else fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, verified: mode === '--verify', checks: checks.length, final: receipt.final, excluded_changes: drift.length, cleaned: owned.length + 1 }));
