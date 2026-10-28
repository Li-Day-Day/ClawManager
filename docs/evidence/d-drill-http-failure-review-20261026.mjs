import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drillCases, validateDrillMetadata, validateDrillLog } from './d-drill-http-review-20261023.mjs';

// Offline failure intake only. Never changes the original run or qualifies it
// as successful; no commands, dependencies, builds or remote connections.
const root = path.resolve(import.meta.dirname, '../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const local = p => { const f = path.resolve(root, p); assert.ok(f.startsWith(root + path.sep)); return f; };
const raw = p => fs.readFileSync(local(p));
const decode = b => (b[0] === 255 && b[1] === 254 ? b.toString('utf16le') : b.toString('utf8')).replace(/^\uFEFF/, '');
const text = p => decode(raw(p));
const json = p => JSON.parse(text(p));
const prefix = 'docs/evidence/d-drill-http-remote-20261026-084817-044e5eed';
const sourceFile = prefix + '-source.json', resultFile = sourceFile + '.result.json';
const transcriptFile = 'docs/evidence/d-drill-http-operator-20261026-044e5eed.txt';
const output = 'docs/evidence/d-drill-http-actual-rejected-20261026-044e5eed.json';
const source = json(sourceFile), result = json(resultFile), native = text(result.child_log), operator = text(transcriptFile);
assert.equal(source.kind, 'd_drill_detail_source.v1');
assert.equal(source.stable_copy_verified, true); assert.equal(source.remote_requested, true);
assert.equal(source.freeze_only, false); assert.equal(source.dependencies_installed, false); assert.equal(source.production_approval, false);
assert.equal(result.kind, 'd_drill_detail_validation.v1'); assert.equal(result.status, 'failed');
assert.equal(result.child_exit, 1); assert.equal(result.source_postcheck, false);
assert.equal(result.actual_mysql_results_accepted, false); assert.equal(result.dependencies_installed, false);
assert.equal(result.source_sha256, source.source_sha256); assert.equal(local(result.child_log), local(sourceFile + '.native.log'));
assert.equal(sha(raw(result.child_log)), result.child_log_sha256, 'original native log hash');
assert.equal(sha(source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n'), source.source_sha256);
assert.equal(new Set(source.files.map(p => p.path)).size, source.files.length);
const drift = [];
for (const p of source.files) {
  assert.match(p.path, /^(backend|contracts|scripts|docs)\//); assert.ok(!p.path.includes('\\') && !p.path.split('/').some(s => ['', '.', '..'].includes(s)));
  const bytes = fs.existsSync(local(p.path)) ? raw(p.path) : null;
  if (!bytes || bytes.length !== p.size || sha(bytes) !== p.sha256) drift.push(p.path);
}
assert.deepEqual(drift, [], 'recover frozen source before this failure diagnosis');
assert.equal(result.cleanup.owner, source.owner); assert.equal(path.dirname(local(source.owner)), root);
assert.match(path.basename(source.owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(result.cleanup.removed, true); assert.equal(result.cleanup.test_build_artifacts_removed, true);
assert.equal(result.cleanup.files_removed, source.files.length + 1); assert.equal(fs.existsSync(local(source.owner)), false);
const probe = 'TestDAdminReadLiveHTTPMySQL', failed = probe + '/drill_history_foreign_installation';
const expected = drillCases.map(name => probe + '/drill_history_' + name);
const parse = value => {
  const lines = value.replaceAll('\r\n', '\n').split('\n');
  const one = pattern => { const matches = lines.flatMap(line => { const m = pattern.exec(line); return m ? [m] : []; }); assert.equal(matches.length, 1, String(pattern)); return matches[0]; };
  const run = one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+@sha256:[a-f0-9]{64}) mysql_image=(\S+@sha256:[a-f0-9]{64}) mysql_version=(8\.4\.8)$/);
  assert.equal(run[1], 'sbk-mig-261026012249-32ca'); assert.equal(run[2], 'b1ccc8fa-4e64-4981-be31-6d7634ced000');
  const starts = lines.filter(line => line.startsWith('=== RUN   ' + probe)).map(line => line.slice(10));
  assert.deepEqual(starts, [probe, ...expected]);
  const passes = lines.flatMap(line => { const m = /^\s+--- PASS: (\S+) \([0-9.]+s\)$/.exec(line); return m?.[1].startsWith(probe + '/') ? [m[1]] : []; });
  const failures = lines.flatMap(line => { const m = /^\s*--- FAIL: (\S+) \([0-9.]+s\)$/.exec(line); return m ? [m[1]] : []; });
  assert.deepEqual(passes, expected.filter(name => name !== failed)); assert.deepEqual(failures, [probe, failed]);
  one(/^FAIL$/); one(/^command terminated with exit code 1$/);
  one(/^\s+system_backup_read_drill_history_mysql_test\.go:181: isolated drill fixture SQL failed \(details redacted\)$/);
  assert.equal(lines.filter(line => /^PASS d-drill-detail-http-mysql/.test(line)).length, 0, 'phase completion must remain absent');
  assert.equal(lines.filter(line => /^CLEANUP_PENDING\b|^CLEANUP_SKIPPED\b/.test(line)).length, 0);
  // The exception quotes CLEANUP_PENDING generically. It is not an emitted
  // pending-cleanup identity and does not erase the actual cleanup receipts.
  const cleanup = one(/^CLEANED namespace=(\S+) uid=(\S+)$/); assert.equal(cleanup[1], run[1]); assert.equal(cleanup[2], run[2]);
  one(/^CLEANED remote-registration-scratch=yes$/); one(/^CLEANED local-registration-build-cache=True$/);
  const migration = one(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/);
  one(/^PASS fresh-migration-replay=001\.\.081 applied=96 exact_filenames=yes d_columns=blob\/blob\/blob\/char$/);
  return { namespace: run[1], namespace_uid: run[2], app_image: run[3], mysql_image: run[4], mysql_version: run[5], migration_binary_sha256: migration[1], migration_catalog_sha256: migration[2], passed_cases: passes, failed_cases: [failed] };
};
const parsed = parse(native); assert.deepEqual(parse(operator), parsed);
assert.match(operator, /^drill_detail_http_exit=1\r?$/m);
const localCleanup = operator.match(/^LOCAL_CLEANUP drill-detail-source-owned=(.+) removed=True\r?$/m);
assert.ok(localCleanup); assert.equal(localCleanup[1].replace(/\r$/, ''), source.owner);
assert.ok(native.includes('migration_binary_sha256=' + parsed.migration_binary_sha256));
const httpBinary = /^LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=([a-f0-9]{64}) real_mysql=not_run\r?$/m.exec(native)?.[1];
assert.match(httpBinary, /^[a-f0-9]{64}$/);
const rejection = fn => { try { fn(); } catch (error) { return error.message; } throw new Error('success receiver unexpectedly accepted failed run'); };
const metadataRejection = rejection(() => validateDrillMetadata(source, result));
const logRejection = rejection(() => validateDrillLog(native));
assert.match(logRejection, /failed, skipped or incomplete/);
const fixtureFile = 'backend/cmd/server/system_backup_read_drill_history_mysql_test.go';
assert.ok(text(fixtureFile).includes('UPDATE system_restore_drills SET origin_installation_id=? WHERE public_id=?'));
const fkFile = 'backend/internal/db/migrations/072_add_system_backup_check_authority.sql';
assert.ok(text(fkFile).includes('CONSTRAINT fk_sb_check_result_drill FOREIGN KEY (origin_installation_id, drill_target_public_id) REFERENCES system_restore_drills(origin_installation_id, public_id) ON DELETE RESTRICT'));
const files = [sourceFile, resultFile, result.child_log, prefix + '.txt', transcriptFile,
  'docs/evidence/d-drill-http-review-20261023.mjs', fileURLToPath(import.meta.url)];
const report = {
  kind: 'd_drill_http_actual_failure_review.v1', result: 'FAIL', actual_mysql_results_accepted: false,
  scope: 'isolated_mysql_nineteen_synthetic_drill_history_cases', ...parsed, http_binary_sha256: httpBinary,
  expected_case_count: 19, passed_case_count: 18, failed_case_count: 1, native_root_pass: false,
  native_terminal_exit: 1, wrapper_status: result.status, source_postcheck: false,
  printed_semantic_PASS_is_not_test_success: true, final_phase_PASS_present: false,
  source_sha256: source.source_sha256, frozen_files: source.files.length, current_all_frozen_files_match: true,
  original_postcheck_replaced: false, original_logs_rewritten: false,
  failure_location: { path: fixtureFile, line: 181, stage: 'fixture_SQL_before_HTTP_request', mysql_error_number: null },
  diagnosis: { classification: 'static_schema_inference',
    detail: 'Fixture inserts drill check rows at the original installation, then updates the referenced parent installation key. Migration 072 declares a composite child FK with default restrictive UPDATE behavior. This fixture is inconsistent with that constraint; the redacted log does not identify the actual MySQL error code.',
    foreign_key: 'fk_sb_check_result_drill', schema_path: fkFile, schema_line: 105 },
  followup: 'Construct foreign-installation fixture with consistent parent/check/evidence installation identities from insertion, then run a new nineteen-case MySQL profile. Preserve this failed run; do not disable FK checks or accept eighteen cases as nineteen.',
  successful_receiver_rejects_metadata: metadataRejection, successful_receiver_rejects_log: logRejection,
  cleanup: { namespace_uid_matched_in_native_and_operator_logs: true, remote_scratch_recorded: true,
    inner_build_cache_recorded: true, outer_removed_recorded: true, outer_owner_absence_checked: true,
    outer_files_removed: result.cleanup.files_removed, remote_cleanup_independently_queried: false },
  transcript_origin: 'user_attached_terminal_output', remote_rerun_executed: false, dependencies_installed: false,
  review_build_artifacts_created: 0, production_approved: false, full_restore_accepted: false, full_gc_accepted: false,
  provider_or_human_MFA_accepted: false,
  artifacts: files.map(p => ({ path: path.relative(root, local(p)).replaceAll('\\', '/'), sha256: sha(raw(p)) })),
};
if (process.argv[2] === '--check') assert.deepEqual(json(output), report);
else { assert.equal(process.argv.length, 2); fs.writeFileSync(local(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
console.log('D_DRILL_HTTP_FAILURE_RECORDED passed=18 failed=1 accepted=no cleanup_recorded=yes source_files=' + source.files.length);
