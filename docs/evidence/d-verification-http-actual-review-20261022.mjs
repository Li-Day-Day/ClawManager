import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const prefix = 'docs/evidence/d-verification-detail-remote-20261022-162855-be1f39f2';
const output = 'docs/evidence/d-verification-http-actual-accepted-20261022.json';
const raw = file => fs.readFileSync(path.join(root, file));
const decode = bytes => (bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^\uFEFF/, '');
const json = file => JSON.parse(decode(raw(file)));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pin = file => { const bytes = raw(file); return {path:file, size:bytes.length, sha256:sha(bytes)}; };
const log = decode(raw(prefix + '.txt'));
const source = json(prefix + '-source.json');
const wrapper = json(prefix + '-source.json.result.json');
assert.equal(source.kind, 'd_verification_detail_source.v1');
assert.equal(source.source_sha256, 'e83adbae3f4ce1a2f9bec43ab6e73ad9577be67ebb9c8aa1f174d9185b914b61');
assert.equal(source.files.length, 1576);
assert.equal(new Set(source.files.map(file => file.path)).size, source.files.length);
assert.equal(sha(source.files.map(file => file.path + '\0' + file.sha256 + '\0' + file.size).join('\n') + '\n'), source.source_sha256);
for (const file of source.files) {
  assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'));
  assert.deepEqual(pin(file.path), file, 'current manifest entry differs: ' + file.path);
}
for (const [key, value] of Object.entries({stable_copy_verified:true, freeze_only:false, remote_requested:true, dependencies_installed:false, production_approval:false})) assert.equal(source[key], value);
for (const [key, value] of Object.entries({kind:'d_verification_detail_validation.v1', status:'profile_completed_actual_results_require_review', source_sha256:source.source_sha256, child_exit:0, source_postcheck:true, freeze_only:false, remote_requested:true, actual_mysql_results_accepted:false, dependencies_installed:false, error:null})) assert.equal(wrapper[key], value);
const owner = path.join(root, '.tmp-d-index-cache-8c10a93553ba41bfbd0e41e2d206332f');
assert.equal(source.owner, owner);
assert.deepEqual(wrapper.cleanup, {owner, removed:true, files_removed:1577, test_build_artifacts_removed:true});
assert.equal(fs.existsSync(owner), false);
for (const marker of [
  'LOCAL_OWNER verification-detail-source=' + owner,
  `LOCAL_SOURCE verification-detail-frozen=yes source_sha256=${source.source_sha256} files=1576`,
  'LOCAL_PASS verification-detail-frozen-postcheck=yes freeze-only=False dependencies-installed=no remote-requested=True',
  'LOCAL_CLEANUP verification-detail-source-owned=' + owner + ' removed=True',
  'CLEANED remote-registration-scratch=yes', 'CLEANED local-registration-build-cache=True',
]) assert.ok(log.includes(marker), marker);
assert.match(log.trimEnd(), /verification_detail_http_exit=0$/);
assert.doesNotMatch(log, /^CLEANUP_PENDING|^\s*--- (?:FAIL|SKIP):|^FAIL\r?$/m);

const namespace = 'sbk-mig-261022092505-02a0', uid = 'b6d3c337-b7ac-4530-bb80-82315d98e55f';
assert.match(log, new RegExp('^RUN namespace=' + namespace + ' uid=' + uid + ' .* mysql_version=8\\.4\\.8\\r?$', 'm'));
assert.ok(log.includes(`CLEANED namespace=${namespace} uid=${uid}`));
const migration = log.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
assert.equal(migration.length, 1);
assert.deepEqual(migration[0], {config_activated:false, historical_equivalence_verified:false, history_review_sha256:'', human_mfa_verified:false, migration_catalog_sha256:'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe', migration_count:96, result:'PASS'});
assert.match(log, /^PASS fresh-migration-replay=001\.\.081 applied=96 exact_filenames=yes d_columns=blob\/blob\/blob\/char\r?$/m);
const sqlBinary = 'd8879ff77c0f0e7d72d47362b1cec9b8ed1915c2357f95226dfe32b3a86e3061';
const httpBinary = '424cb5254fac38991d80bd6f25988e179ed3c29e0cba9261b9a14cd2e1788a0e';
const ddl = '1a6abd1c8d01155184b8fa8c7cc8d6527201ed157cba1f80b4ccefc6218483f2';
const migrationBinary = '5c1b76d5d4178558830b2644d9500b66993f9994af0b5ac34aa8ea37921d30f9';
const files = new Map(source.files.map(file => [file.path, file]));
assert.equal(files.get('scripts/system-backup-a-admin-read-probe.sql').sha256, ddl);
for (const marker of [
  `LOCAL_PASS a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${sqlBinary} ddl_sha256=${ddl}`,
  `LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=${httpBinary} real_mysql=not_run`,
  `LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=${migrationBinary}`,
  `PASS pinned-migration-runner binary_sha256=${migrationBinary} catalog_sha256=${migration[0].migration_catalog_sha256}`,
  `PASS d-admin-read-live-http-mysql binary_sha256=${httpBinary}`,
  `PASS a-admin-read-mysql binary_sha256=${sqlBinary} ddl_sha256=${ddl}`,
]) assert.equal(log.split(/\r?\n/).filter(line => line === marker).length, 1, marker);
const remote = log.slice(log.indexOf('=== RUN   TestAAdminReadAuthorityMySQL'));
const roots = ['TestAAdminReadAuthorityMySQL', 'TestDAdminReadFullSchemaMySQL', 'TestDAdminReadLiveHTTPMySQL'];
assert.deepEqual([...remote.matchAll(/^=== RUN\s+(Test\w+)\r?$/gm)].map(match => match[1]), roots);
const parentSeconds = {};
for (const name of roots) {
  const matches = [...remote.matchAll(new RegExp('^--- PASS: ' + name + ' \\(([0-9.]+)s\\)\\r?$', 'gm'))];
  assert.equal(matches.length, 1); parentSeconds[name] = Number(matches[0][1]);
}
assert.equal((remote.match(/^PASS\r?$/gm) || []).length, 3);
const cases = ['current_attempt_history', 'catalog_import_null_state', 'parallel_jobs', 'single_job', 'heartbeat_only', 'summary_drift', 'report_hash_drift', 'report_wrong_owner', 'report_before_current_attempt', 'check_hash_drift', 'check_missing_attempt', 'health_cannot_restore', 'noncommitted_cannot_be_usable', 'full_restore_false_to_true', 'shared_report_reference', 'expired_evidence_is_historical'];
const history = cases.map(name => 'verification_history_' + name);
assert.deepEqual([...remote.matchAll(/^=== RUN\s+TestDAdminReadLiveHTTPMySQL\/(\S+)\r?$/gm)].map(match => match[1]), history);
assert.deepEqual([...remote.matchAll(/^\s+--- PASS: TestDAdminReadLiveHTTPMySQL\/(\S+) /gm)].map(match => match[1]), history);
assert.equal((remote.match(/PASS d-verification-detail-http-history synthetic_cases=16 actual_provider=no production_approval=no/g) || []).length, 1);
const probe = decode(raw('backend/cmd/server/system_backup_read_verification_history_mysql_test.go'));
const parent = decode(raw('backend/cmd/server/system_backup_read_live_mysql_test.go'));
const declaration = /cases := \[\]string\{([\s\S]*?)\}/.exec(probe);
assert.ok(declaration);
assert.deepEqual([...declaration[1].matchAll(/"([a-z_]+)"/g)].map(match => match[1]), cases);
assert.ok(probe.includes('if !t.Failed()'));
assert.ok(probe.includes('response.Header().Get("Cache-Control") != "no-store"'));
assert.ok(probe.includes('strings.Contains(body, private)'));
assert.ok(parent.indexOf('HTTP probe is outside the pinned run-owned MySQL') < parent.indexOf('testDVerificationDetailHTTPHistoryMySQL(t, db, ctx,'));

const result = {
  kind:'d_verification_http_actual_acceptance.v1', status:'actual_mysql_16_of_16_history_http_accepted_synthetic_only',
  log:pin(prefix + '.txt'), source_manifest:pin(prefix + '-source.json'), wrapper_result:pin(prefix + '-source.json.result.json'),
  source_sha256:source.source_sha256, source_files:source.files.length, manifest_entries_match_current_bytes:true, current_file_set_checked:false,
  critical_inputs:['scripts/system-backup-d-verification-detail-validation.ps1', 'scripts/system-backup-a-evidence-validation.ps1', 'scripts/system-backup-a-admin-read-phase.sh', 'scripts/system-backup-a-admin-read-probe.sql', 'backend/cmd/server/system_backup_read_live_mysql_test.go', 'backend/cmd/server/system_backup_read_verification_history_mysql_test.go', 'backend/cmd/server/system_backup_read_live.go', 'backend/cmd/server/system_backup_read_cursor_key.go', 'backend/internal/systembackupread/verification_detail.go'].map(file => files.get(file)),
  actual:{mysql:'8.4.8', migrations:96, replay:'001..081', catalog_sha256:migration[0].migration_catalog_sha256, http_binary_sha256:httpBinary, sql_binary_sha256:sqlBinary, ddl_sha256:ddl, migration_binary_sha256:migrationBinary, roots, parent_seconds:parentSeconds, history_cases:history, passed:16, failed:0, skipped:0, exit:0},
  cleanup:{namespace, uid, namespace_and_remote_scratch_reported:true, local_build_cache_reported:true, exact_outer_owner:owner, outer_owner_independently_absent:true, outer_files_removed_reported:1577, remote_cleanup_independently_checked:false},
  boundaries:{real_mysql_synthetic_rows:true, actual_provider:false, production_approval:false, human_mfa_verified:false, historical_equivalence_verified:false, config_activated:false, current_freshness_proven:false, full_restore:false, full_gc:false, six_original_scopes_complete:false, current_whole_tree_tested:false, reviewer_remote_run:false, wrapper_actual_acceptance_flag_preserved_false:true},
};
assert.ok(result.critical_inputs.every(Boolean));
if (process.argv.includes('--check')) assert.deepEqual(json(output), result);
else { assert.ok(process.argv.includes('--write')); fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n', {flag:'wx'}); }
console.log('D_VERIFICATION_HTTP_ACTUAL_ACCEPTED history=16 roots=3 exit=0 synthetic=yes actual_provider=no production=no');
