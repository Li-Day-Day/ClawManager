// Read the completed operator attempt; never execute or rerun SQL or tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const logPath = 'docs/evidence/a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt';
const sourcePath = 'docs/evidence/a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json';
const logBytes = raw(logPath), log = decode(logBytes), sourceBytes = raw(sourcePath), source = JSON.parse(decode(sourceBytes));
const expectedLeaves = ['TestDownloadRetentionGCProducerReceiptFacts/null_version', 'TestDownloadRetentionGCProducerReceiptFacts/no_version', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_eligible_run', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference'];
const failed = [...log.matchAll(/^\s*--- FAIL: (\S+) /gm)].map(m => m[1]);
assert.deepEqual(failed.slice().sort(), [...expectedLeaves, 'TestDownloadRetentionGCProducerReceiptFacts', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback'].sort());
assert.equal(source.stable_copy_verified, true); assert.equal(source.dependencies_installed, false); assert.equal(source.production_approved, false);
assert.equal(new Set(source.files.map(f => f.path)).size, source.files.length);
assert.equal(source.files.length, 1457);
assert.equal(sha256(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), source.source_sha256);
assert.equal(source.source_sha256, '35c60b8d6eab12abee02d6949d6f9110c2952ef2c469895af533300ae4849390');
assert.ok(log.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=1457`));
const summaries = [...log.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)];
assert.deepEqual(summaries.map(m => m[1]), ['clawreef/internal/systembackupsecurity']);
assert.match(log, /^FAIL\s+clawreef\/internal\/systembackupevidence\s+478\.470s$/m);
const exits = [...log.matchAll(/^a_download_owners_mysql_remote_exit=(-?\d+)$/gm)];
assert.equal(exits.length, 1); assert.equal(exits[0][1], '1');
assert.match(log, /Evidence test-vet gate failed \(exit=1, attempt=1\); remote validation has not started; dependencies will not be installed/);
assert.match(log, /Windows PowerShell 脚本结束\n结束时间: 20261021103151/);
assert.ok(log.includes('CLEANED local-registration-build-cache=True'));
const owners = [...log.matchAll(/^LOCAL_OWNER config-writer-source=(.+)$/gm)]; assert.equal(owners.length, 1);
const owner = owners[0][1].trim();
assert.equal(path.dirname(path.resolve(owner)).toLowerCase(), workspace.toLowerCase());
assert.equal(path.basename(owner), '.tmp-d-index-cache-aad7419a27d0438582fef071ac5abed9');
assert.ok(log.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`)); assert.equal(fs.existsSync(owner), false);
assert.ok(!/^RUN namespace=|^LOCAL_PASS a-download-owners-unit-tests=|^LOCAL_PASS config-standalone-seed=|^LOCAL_PASS config-writer-frozen-postcheck=|^=== RUN\s+TestASQLTaskDownloadOwnersMySQL/m.test(log));
const dSourcePath = 'docs/evidence/d-download-gc-producer-20261021-r2-source.json', dSource = JSON.parse(decode(raw(dSourcePath)));
const ordinary = s => s.files.filter(f => /^(backend|contracts)\//.test(f.path)).map(f => `${f.path}\0${f.size}\0${f.sha256}`).sort();
assert.deepEqual(ordinary(source), ordinary(dSource));
const observations = expectedLeaves.map(name => {
  const start = log.indexOf('=== RUN   ' + name + '\n'); assert.ok(start >= 0);
  const end = log.indexOf('=== RUN', start + 10), segment = log.slice(start, end < 0 ? log.length : end);
  const lines = segment.split('\n').filter(line => /^\s+.*\.go:\d+:/.test(line)).map(line => line.trim());
  assert.ok(lines.some(line => name.includes('ReceiptFacts/') ? line.includes("invalid character 'o' looking for beginning of value") : /internal_error \[\]$/.test(line)));
  return {test: name, output: lines};
});
const record = {kind: 'a_owner_completed_local_gate_failure_review', recorded_at: new Date().toISOString(), status: 'failed_before_remote_not_accepted',
  log: logPath, log_sha256: sha256(logBytes), source: sourcePath, source_manifest_sha256: sha256(sourceBytes), source_sha256: source.source_sha256, source_files: source.files.length,
  failed_test_names: failed, failed_leaf_count: 5, observations, passed_package: summaries[0][1], failed_package: 'clawreef/internal/systembackupevidence', failed_package_elapsed_seconds: 478.470,
  outer_exit: 1, transcript_completed: true, local_build_cache_cleanup_reported: true, source_owner_independently_absent: owner,
  same_backend_contract_inputs_as_d_r2: true, d_r2_source: dSourcePath, d_r2_source_manifest_sha256: sha256(raw(dSourcePath)), final_source_postcheck: false,
  remote_started: false, actual_sql_cases_executed: 0, dependencies_installed: false, tests_or_builds_repeated: false, test_build_artifacts_created: false, production_approved: false,
  next_action: 'Review the repaired complete ordinary baseline and cleanup before a fresh full eleven-owner run; preserve this failure and all gates.',
  reviewer_sha256: sha256(raw('docs/evidence/a-download-owners-local-failure-review-20261021.mjs'))};
const output = path.join(workspace, 'docs/evidence/a-download-owners-local-failure-reviewed-20261021.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);}
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, failed_leaves: 5, outer_exit: 1, remote_started: false, source_owner_absent: true}));
