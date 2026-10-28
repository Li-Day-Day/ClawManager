import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewDrill } from './d-drill-http-review-20261023.mjs';

// Offline D intake. Preserve the wrapper's pre-review result and old failed run.
// This binds operator output to the native log and the reviewed repaired source.
const root = path.resolve(import.meta.dirname, '../..');
const local = p => { const f = path.resolve(root, p); assert.ok(f.startsWith(root + path.sep)); return f; };
const raw = p => fs.readFileSync(local(p));
const decode = b => (b[0] === 255 && b[1] === 254 ? b.toString('utf16le') : b.toString('utf8')).replace(/^\uFEFF/, '');
const json = p => JSON.parse(decode(raw(p)));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const relative = p => path.relative(root, local(p)).replaceAll('\\', '/');
const [sourceFile, operatorFile, reviewedFile, outputFile, mode, ...extra] = process.argv.slice(2);
assert.ok(sourceFile && operatorFile && reviewedFile && outputFile && !extra.length && (mode === undefined || mode === '--check'), 'source operator reviewed output [--check] required');
assert.equal(path.dirname(local(outputFile)), path.join(root, 'docs/evidence'));
const source = json(sourceFile), result = json(sourceFile + '.result.json');
const reviewed = reviewDrill(sourceFile);
assert.deepEqual(reviewed, json(reviewedFile), 'saved native review differs');
assert.equal(reviewed.actual_mysql_cases, 19); assert.deepEqual(reviewed.unrelated_source_drift, []);
const repairFile = 'docs/evidence/d-drill-http-foreign-fixture-repair-20261026.json', repair = json(repairFile);
assert.equal(source.source_sha256, repair.source_sha256, 'run is not the reviewed repair');
assert.equal(source.files.length, repair.source_files);
for (const pin of source.files) {
  const bytes = raw(pin.path); assert.equal(bytes.length, pin.size); assert.equal(sha(bytes), pin.sha256);
}
// Reuse only the already passed receiver checks bound to these exact bytes.
for (const name of ['docs/evidence/d-drill-http-review-20261023.mjs', 'docs/evidence/d-drill-http-review-20261023.test.mjs', 'docs/evidence/d-drill-http-repair-receiver-tests-20261026.txt']) {
  assert.equal(sha(raw(name)), repair.artifacts.find(p => p.path === name)?.sha256, 'receiver/test evidence drift');
}
const lines = text => text.replaceAll('\r\n', '\n').split('\n');
const native = lines(decode(raw(result.child_log))), operator = lines(decode(raw(operatorFile)));
const remote = values => {
  const starts = values.flatMap((line, index) => /^RUN namespace=/.test(line) ? [index] : []);
  assert.equal(starts.length, 1);
  const end = values.indexOf('CLEANED local-registration-build-cache=True', starts[0]);
  assert.ok(end > starts[0]);
  return values.slice(starts[0], end + 1).filter(line => line.trim() && !/^close - IO is still pending on closed socket\.|^root@[^ ]+'s password:$/.test(line));
};
assert.deepEqual(remote(operator), remote(native), 'operator and native remote evidence differ');
const only = pattern => { const matches = operator.flatMap(line => { const m = pattern.exec(line); return m ? [m] : []; }); assert.equal(matches.length, 1, String(pattern)); return matches[0]; };
const run = only(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+@sha256:[a-f0-9]{64}) mysql_image=(\S+@sha256:[a-f0-9]{64}) mysql_version=(8\.4\.8)$/);
assert.equal(run[1], reviewed.namespace); assert.equal(run[2], reviewed.namespace_uid);
const migration = JSON.parse(only(/^\{"config_activated":.*\}$/)[0]);
assert.deepEqual(migration, { config_activated: false, historical_equivalence_verified: false, history_review_sha256: '', human_mfa_verified: false,
  migration_catalog_sha256: '0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe', migration_count: 96, result: 'PASS' });
assert.equal(only(/^drill_detail_http_exit=(\d+)$/)[1], '0');
only(/^LOCAL_PASS drill-detail-frozen-postcheck=yes freeze-only=False dependencies-installed=no remote-requested=True$/);
assert.ok(operator.includes('LOCAL_CLEANUP drill-detail-source-owned=' + source.owner + ' removed=True'));
assert.equal(fs.existsSync(local(source.owner)), false);
assert.equal(result.actual_mysql_results_accepted, false, 'original wrapper receipt must remain pre-review');
const outerLog = sourceFile.replace(/-source\.json$/, '.txt');
assert.match(decode(raw(outerLog)), /^drill_detail_http_exit=0\r?$/m);
const oldFailed = 'docs/evidence/d-drill-http-actual-rejected-20261026-044e5eed.json';
assert.equal(json(oldFailed).result, 'FAIL'); assert.equal(json(oldFailed).passed_case_count, 18);
const artifactFiles = [...reviewed.artifacts.map(p => p.path), operatorFile, outerLog, reviewedFile,
  repairFile, oldFailed, 'docs/evidence/d-drill-http-review-20261023.mjs', 'docs/evidence/d-drill-http-review-20261023.test.mjs',
  'docs/evidence/d-drill-http-repair-receiver-tests-20261026.txt', fileURLToPath(import.meta.url)];
const accepted = {
  ...reviewed, kind: 'd_drill_http_actual_acceptance.v1', result: 'PASS', actual_mysql_results_accepted: true,
  app_image: run[3], mysql_image: run[4], migration_catalog_sha256: migration.migration_catalog_sha256, migration_count: migration.migration_count,
  frozen_source_files: source.files.length, current_all_frozen_files_match: true, repaired_source_exact_match: true,
  native_terminal_exit: 0, native_review_exit: 0, source_postcheck: true, original_wrapper_rewritten: false,
  transcript_origin: 'user_attached_terminal_output', operator_native_remote_evidence_match: true,
  receiver_tests: { pass: 58, fail: 0, same_bytes_as_local_repair: true, new_test_run_claimed: false },
  outer_cleanup: { owner: source.owner, removed_recorded: true, independently_absent: true,
    files_removed: result.cleanup.files_removed, test_build_artifacts_removed: result.cleanup.test_build_artifacts_removed },
  config_activated: false, historical_equivalence_verified: false, human_mfa_verified: false,
  prior_failed_run_preserved: oldFailed, prior_failed_run_reclassified: false, retry_required_for_this_profile: false,
  new_remote_run_executed_by_intake: false, A_signoff_claimed: false,
  artifacts: [...new Set(artifactFiles.map(relative))].map(p => ({ path: p, sha256: sha(raw(p)) })),
  intake_sha256: sha(raw(fileURLToPath(import.meta.url))),
};
if (mode === '--check') assert.deepEqual(json(outputFile), accepted, 'saved acceptance differs');
else fs.writeFileSync(local(outputFile), JSON.stringify(accepted, null, 2) + '\n', { flag: 'wx' });
console.log('D_DRILL_HTTP_ACTUAL_ACCEPTED cases=19 terminal_exit=0 source_files=' + source.files.length + ' cleanup=yes rerun=no');
