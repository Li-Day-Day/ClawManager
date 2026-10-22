// Preserve and independently classify the completed failed owner SQL attempt.
// This script never connects to MySQL, starts Go or changes cleanup state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace, decode, sha256, ownerCases, localStages, loadReviewedOwnerBaseline, canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const logPath = 'docs/evidence/a-download-owners-mysql-remote-20261021-083734-aca6615d.txt';
const sourcePath = 'docs/evidence/a-download-owners-mysql-remote-source-20261021-083734-aca6615d.json';
const logBytes = raw(logPath), sourceBytes = raw(sourcePath), log = decode(logBytes), source = JSON.parse(decode(sourceBytes));
const root = 'TestASQLTaskDownloadOwnersMySQL';
assert.equal(source.stable_copy_verified, true);
assert.equal(source.dependencies_installed, false);
assert.equal(sha256(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), source.source_sha256);
assert.ok(log.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=${source.files.length}`));
const run = [...log.matchAll(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm)];
assert.equal(run.length, 1);
const local = localStages(log.slice(0, run[0].index));
const baseline = loadReviewedOwnerBaseline(sourceBytes);
for (const s of local.slice(0, 2)) {
  const expected = baseline.baselineEvents.filter(e => e.Test && e.Package === s.package && e.Action === 'pass').map(e => e.Test).sort();
  assert.deepEqual(s.names.map(canonicalLocalName).sort(), expected);
}
assert.equal(local[2].names.length, 13);
const remote = log.slice(run[0].index);
const passed = [...remote.matchAll(/^\s*--- PASS: TestASQLTaskDownloadOwnersMySQL\/(\S+) /gm)].map(m => m[1]);
const failed = [...remote.matchAll(/^\s*--- FAIL: TestASQLTaskDownloadOwnersMySQL\/(\S+) /gm)].map(m => m[1]);
assert.deepEqual(passed.slice().sort(), ['backup', 'drill', 'preflight', 'artifact_verify', 'revoked_actor', 'changed_original_deadline', 'unknown_reference_column'].sort());
assert.deepEqual(failed.slice().sort(), ['wrong_installation', 'missing_reference_column', 'original_owner_lock', 'empty_reference_range'].sort());
assert.deepEqual([...passed, ...failed].sort(), ownerCases.slice().sort());
assert.ok(remote.includes(`--- FAIL: ${root} (`));
assert.ok(!remote.includes(`--- PASS: ${root} (`));
const errorCodes = {};
for (const name of failed) {
  const start = remote.indexOf(`=== RUN   ${root}/${name}\n`);
  assert.ok(start >= 0);
  const next = remote.indexOf('=== RUN', start + 10);
  const segment = remote.slice(start, next < 0 ? remote.length : next);
  const codes = [...segment.matchAll(/MySQL error number=(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual(codes, [name === 'wrong_installation' ? 1452 : 3959]); errorCodes[name] = codes[0];
}
const databases = [...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)].map(m => m[1]);
assert.equal(databases.length, 11); assert.equal(new Set(databases).size, 11);
assert.ok(remote.includes(`CLEANED namespace=${run[0][1]} uid=${run[0][2]}`));
assert.ok(remote.includes('CLEANED remote-registration-scratch=yes'));
assert.ok(remote.includes('CLEANED local-registration-build-cache=True'));
const owner = log.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();
assert.equal(path.dirname(path.resolve(owner)).toLowerCase(), workspace.toLowerCase());
assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.ok(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));
assert.equal(fs.existsSync(owner), false);
assert.match(remote, /^a_download_owners_mysql_remote_exit=1$/m);
assert.match(remote, /Windows PowerShell 脚本结束\n结束时间: \d+/);
assert.ok(!/^CLEANUP_PENDING/m.test(remote));
assert.ok(!remote.includes('LOCAL_PASS config-writer-frozen-postcheck=yes'));
const probePath = 'backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go';
const frozenProbe = source.files.find(f => f.path === probePath);
const record = {kind: 'a_owner_actual_mysql_failed_attempt_review', recorded_at: new Date().toISOString(), status: 'failed_not_accepted',
  log: logPath, log_sha256: sha256(logBytes), source: sourcePath, source_manifest_sha256: sha256(sourceBytes), source_sha256: source.source_sha256, source_files: source.files.length,
  local_complete_packages: local.slice(0, 2).map(s => ({package: s.package, main: s.names.filter(n => !n.includes('/')).length, all: s.names.length})), packaged_seed_checks: 13,
  exact_encoding_aliases: local.slice(0, 2).flatMap(s => s.names.filter(n => canonicalLocalName(n) !== n).map(n => ({original: n, canonical: canonicalLocalName(n)}))),
  namespace: run[0][1], namespace_uid: run[0][2], mysql_version: run[0][5], actual_sql_started: true,
  passed_cases: passed, failed_cases: failed, observed_error_codes: errorCodes, final_exit: 1, final_source_postcheck: false,
  namespace_and_remote_cleanup: 'reported_in_original_log_not_independently_reconnected', cleaned_databases: databases,
  local_owner: owner, local_owner_independently_absent: true,
  misleading_original_root_message: 'Original root logged PASS text despite four failed leaves; actual root event is FAIL and is never accepted',
  frozen_probe_sha256: frozenProbe.sha256,
  diagnosis: {wrong_installation: 'FK rejected evidence binding before Preview because foreign installation did not exist', missing_reference_column: 'MySQL 3959 rejected rename while chk_sb_dependency_evidence referred to evidence_id', later_lock_cases: 'Shared outer err retained 3959 across subtests; lock assertions were not reached'},
  mysql_error_reference: 'https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html',
  actual_cases_accepted: 0, production_approved: false, dependencies_installed: false, test_build_artifacts_created: false,
  reviewer_sha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output = 'docs/evidence/a-download-owners-mysql-failure-reviewed-20261021.json';
if (process.argv[2] === '--check') {
  const saved = JSON.parse(decode(raw(output))); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);
} else {
  assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(path.join(workspace, output), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
}
console.log(JSON.stringify({status: record.status, passed_cases: passed.length, failed_cases: failed.length, actual_cases_accepted: 0, local_owner_absent: true, receipt: output}));
