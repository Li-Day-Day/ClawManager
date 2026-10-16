// Independent acceptance of the operator's archived run; no build, SSH or SQL.
// The receipt is immutable. Rechecking prints results; --record creates it once.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMigrationCatalog } from '../../scripts/system-backup-contract-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rawPath = 'docs/evidence/a-config-proof-mysql-remote-20261016-110614-b99f5f47.txt';
const manifestPath = 'docs/evidence/a-config-proof-mysql-remote-source-20261016-110614-b99f5f47.json';
const receiptPath = 'docs/evidence/a-config-proof-mysql-accepted-sbk-mig-261016032334-5226.json';
const bytes = p => readFileSync(resolve(root, p));
const sha = v => createHash('sha256').update(v).digest('hex');
const raw = bytes(rawPath).toString('utf8').replaceAll('\r\n', '\n');
const manifest = JSON.parse(bytes(manifestPath));
const checks = {};
function check(name, condition) { assert.ok(condition, name); checks[name] = true; }
const once = line => raw.split('\n').filter(v => v === line).length === 1;
const sourceSHA = sha(manifest.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
check('manifest_digest', sourceSHA === manifest.source_sha256 && sourceSHA === '476a88c5f3b645b66ac604f1e69f6ea7f26a5820e699886a711d2376dc98e36b');
check('manifest_unique_safe_paths', new Set(manifest.files.map(p => p.path)).size === 1292 && manifest.files.every(p => !p.path.includes('..') && /^(backend|contracts|scripts|docs)\//.test(p.path) && /^[a-f0-9]{64}$/.test(p.sha256) && Number.isSafeInteger(p.size)));
check('stable_capture_once', manifest.files.length === 1292 && manifest.stable_copy_verified === true && manifest.capture_attempts === 1 && manifest.capture_failures.length === 0 && manifest.dependencies_installed === false && manifest.production_approved === false);
check('source_log_pin', once(`LOCAL_SOURCE config-proof-frozen=yes source_sha256=${sourceSHA} files=1292`) && once('LOCAL_SOURCE config-proof-capture-attempts=1 stable-copy-required=yes'));
const namespace = 'sbk-mig-261016032334-5226';
const uid = '87f15bb5-1b91-40c1-8479-a13a7ec785c7';
const runLine = raw.split('\n').find(v => v.startsWith(`RUN namespace=${namespace} uid=${uid} `));
check('unique_run_identity', !!runLine && raw.split('\n').filter(v => v.startsWith('RUN namespace=')).length === 1 && runLine.endsWith('mysql_version=8.4.8'));
const remote = raw.slice(raw.indexOf(runLine));
check('no_remote_failure', !/(?:--- FAIL:|^FAIL(?:\s|$)|panic:|CLEANUP_PENDING)/m.test(remote));
const catalog = computeMigrationCatalog();
check('current_95_catalog', catalog.file_count === 95 && catalog.hash === '2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
const migration = JSON.parse(remote.split('\n').find(v => v.startsWith('{"config_activated"')));
check('runner_catalog_scope', migration.result === 'PASS' && migration.migration_count === 95 && migration.migration_catalog_sha256 === catalog.hash && migration.config_activated === false && migration.historical_equivalence_verified === false && migration.human_mfa_verified === false);
check('full_migration_replay', once('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes d_columns=blob/blob/blob/char'));
const probe = '4f358d577b790830bb4269d5285ef581805b396e8ca09e72a4e29695a791646e';
const capsule = '459b6d30c893e2073461a66dbc15d716b9450531559f3fe427fa7bd1639e3e65';
const runner = '2a13a296e533b09a5aa297b014cf01a77bda7df37dc5fc93fd1890566207135d';
check('probe_capsule_local_remote_pins', once(`LOCAL_PASS config-proof-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${probe} ddl_sha256=${capsule}`) && once(`PASS a-config-proof-mysql binary_sha256=${probe} inputs_sha256=${capsule}`));
check('runner_local_remote_pins', once(`LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=${runner}`) && once(`PASS pinned-migration-runner binary_sha256=${runner} catalog_sha256=${catalog.hash}`));
const cases = ['https_updateSystemBackupConfig', 'https_rollbackSystemBackupConfig', 'same_totp_concurrent_once', 'missing_session', 'revoked_session', 'shortened_session', 'revoked_at_issue', 'inactive_user', 'password_changed', 'unconfirmed_totp', 'signer_failure', 'audit_failure_rollback', 'commit_reply_lost', 'observed_config_lock_revocation', 'session_expires_in_signer'];
const runs = [...remote.matchAll(/^=== RUN   TestAConfigProofMySQL\/(\S+)$/gm)].map(v => v[1]);
const passes = [...remote.matchAll(/^    --- PASS: TestAConfigProofMySQL\/(\S+) \([\d.]+s\)$/gm)].map(v => v[1]);
check('exact_15_run_and_pass', JSON.stringify(runs) === JSON.stringify(cases) && JSON.stringify(passes) === JSON.stringify(cases));
check('root_pass', /^--- PASS: TestAConfigProofMySQL \([\d.]+s\)\n/m.test(remote) && /^PASS$/m.test(remote));
check('15_owned_fixture_cleanups', [...remote.matchAll(/CLEANED config-proof owned installation\/user\/credentials\/sessions\/revocations\/audit/g)].length === 15);
check('two_observed_row_waits', [...remote.matchAll(/OBSERVED session lock wait table=/g)].length === 2 && remote.includes('OBSERVED session lock wait table=system_backup_installation_state\n') && remote.includes('OBSERVED session lock wait table=system_backup_configs\n'));
const scope = 'SCOPE config-proof real_mysql=yes https_jwt=yes current_config_rbac=yes totp_single_use=yes real_row_wait=yes commit_loss=synthetic_after_real_commit human_mfa=no production_grant=no config_write=no backfill=no';
check('explicit_scope', remote.includes(scope));
check('namespace_cleanup_reported', once(`CLEANED namespace=${namespace} uid=${uid}`));
check('remote_scratch_cleanup_reported', once('CLEANED remote-registration-scratch=yes'));
check('local_build_cleanup_reported', once('CLEANED local-registration-build-cache=True'));
check('frozen_postcheck_default_vet', once('LOCAL_PASS config-proof-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'));
check('final_exit_and_transcript_end', once('a_config_proof_mysql_exit=0') && raw.includes('20261016112452'));
const owner = resolve(root, '.tmp-d-index-cache-2527acf8599149268574f76e031041ac');
check('accurate_source_owner_absent', dirname(owner) === root && !existsSync(owner) && once(`LOCAL_CLEANUP config-proof-source-owned=${owner} removed=True`));
const local = raw.slice(0, raw.indexOf(runLine));
const localTests = [...new Set([...local.matchAll(/^\s*--- PASS: (Test\S+) \([\d.]+s\)$/gm)].map(v => v[1]))];
check('44_unique_local_go_checks', localTests.length === 44 && localTests.filter(v => !v.includes('/')).length === 8);
check('dispatch_and_detached_seed', local.split('\n').filter(v => v === 'PASS evidence remote dispatch: 11 cases; no remote actions, dependencies or build artifacts').length === 2 && once('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent writer-candidate=False real_mysql=not_run'));
const currentComparison = manifest.files.map(p => {
  if (!existsSync(resolve(root, p.path))) return { ...p, current_status: 'missing' };
  const current = bytes(p.path);
  return { ...p, current_sha256: sha(current), current_size: current.length, current_status: sha(current) === p.sha256 && current.length === p.size ? 'matched' : 'changed' };
});
const focused = currentComparison.filter(p => /^(backend\/internal\/(systembackupsecurity\/|db\/migrations\/)|backend\/go\.(mod|sum)$)/.test(p.path) || /^scripts\/system-backup-(a-config-proof|a-evidence|d-index-source-snapshot|d-migration-phase|fresh-migration-smoke)/.test(p.path) || p.path === 'backend/internal/systembackupcontroller/bootstrap.go');
check('current_focused_inputs_match', focused.length > 108 && focused.every(p => p.current_status === 'matched'));
const receipt = {
  kind: 'a_config_proof_mysql_independent_acceptance', recorded_at: new Date().toISOString(),
  status: 'accepted_for_exact_frozen_15_case_proof_issuance_only',
  raw_log: rawPath, raw_sha256: sha(bytes(rawPath)), source_manifest: manifestPath,
  source_manifest_sha256: sha(bytes(manifestPath)), source_sha256: sourceSHA, source_files: 1292,
  capture_attempts: 1, namespace, namespace_uid: uid, run_line: runLine,
  mysql_version: '8.4.8', catalog, probe_sha256: probe, inputs_capsule_sha256: capsule,
  migration_runner_sha256: runner, checks, cases, local_unique_go_checks: 44,
  dispatch_unique_checks: 11, duplicate_seed_and_dispatch_runs_not_added: true,
  owned_fixture_cleanup_reports: 15, source_owner_independently_absent: owner,
  remote_cleanup_basis: 'operator transcript; no additional remote access by A',
  inner_build_cleanup_basis: 'reported; exact inner owner path not emitted in transcript',
  socket_close_diagnostics: (raw.match(/close - IO is still pending on closed socket/g) || []).length,
  dispatch_negative_test_errors_are_expected: true,
  current_manifest_pins_matched: currentComparison.filter(p => p.current_status === 'matched').length,
  current_manifest_pin_drift: currentComparison.filter(p => p.current_status !== 'matched'),
  focused_current_pins: focused,
  current_additions_not_enumerated_or_accepted: true,
  scope: {real_mysql: true, https_jwt: true, current_config_rbac: true, totp_single_use: true,
    real_row_wait: true, commit_loss: 'synthetic_after_real_commit', human_mfa: false,
    production_grant: false, config_write: false, backfill: false, production_deployment: false,
    whole_current_tree_accepted: false, overall_a_work_complete: false},
  review_actions: {dependencies_installed: false, builds_or_tests_rerun: false, remote_access: false}
};
if (process.argv.includes('--record')) writeFileSync(resolve(root, receiptPath), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({checks: Object.keys(checks).length, cases: cases.length, catalog, focused_pins: focused.length, current_manifest_pin_drift: receipt.current_manifest_pin_drift.map(p => p.path), receipt: process.argv.includes('--record') ? receiptPath : 'not_written'}, null, 2));
