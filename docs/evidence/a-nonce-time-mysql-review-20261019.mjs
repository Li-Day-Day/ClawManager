// Read the operator's completed artifacts only: no build, SSH or SQL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { computeMigrationCatalog } from '../../scripts/system-backup-contract-check.mjs';

const logName = 'docs/evidence/a-nonce-time-mysql-remote-20261019-094543-e42bc741.txt';
const sourceName = 'docs/evidence/a-nonce-time-mysql-remote-source-20261019-094543-e42bc741.json';
const output = 'docs/evidence/a-nonce-time-mysql-accepted-sbk-mig-261019020511-4e94.json';
const bytes = name => fs.readFileSync(name);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const raw = bytes(logName).toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
const source = JSON.parse(bytes(sourceName).toString('utf8').replace(/^\uFEFF/, ''));
const checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
const once = line => raw.split('\n').filter(v => v === line).length === 1;
const canonicalPins = source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n';
check('source logical digest recomputed', hash(Buffer.from(canonicalPins)) === source.source_sha256);
check('unique safe frozen paths', new Set(source.files.map(p => p.path)).size === source.files.length && source.files.every(p => /^(backend|contracts|scripts|docs)\//.test(p.path) && !p.path.split('/').includes('..') && /^[a-f0-9]{64}$/.test(p.sha256) && Number.isSafeInteger(p.size) && p.size >= 0));
check('stable capture once without dependency installation or production approval', source.stable_copy_verified && source.capture_attempts === 1 && source.capture_failures.length === 0 && source.dependencies_installed === false && source.production_approved === false);
check('exact frozen source bound to raw log', once(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=${source.files.length}`));
check('actual dedicated remote nonce profile selected', raw.includes('-NonceTimeOnly -Remote -BuildParallelism 2') && once('VALIDATION_SCOPE nonce-time-increment-only=yes synthetic-issuer-authority-capacity=yes human-mfa=no real_mysql=not_run'));
check('no failed or skipped Go case, panic or pending cleanup', !/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|panic:|CLEANUP_PENDING/m.test(raw));
const run = raw.match(/^RUN namespace=(sbk-mig-\d{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=(\S+@sha256:[a-f0-9]{64}) mysql_image=(\S+@sha256:[a-f0-9]{64}) mysql_version=(\S+)$/m);
check('one exact owned namespace UID and digest-pinned images', run && [...raw.matchAll(/^RUN namespace=/gm)].length === 1);
const [runLine, namespace, uid, appImage, mysqlImage, mysqlVersion] = run;
check('actual isolated MySQL 8.4.8 run', mysqlVersion === '8.4.8');
const remote = raw.slice(raw.indexOf(runLine)), local = raw.slice(0, raw.indexOf(runLine));
const unitNames = ['TestAProviderNonceUsesSQLAcceptanceTime', 'TestAConfigNonceUsesSQLAcceptanceTime', 'TestASensitiveDownloadNonceAcceptanceTime'];
const localPasses = [...local.matchAll(/^\s*--- PASS: (\S+) \([\d.]+s\)$/gm)].map(m => m[1]);
const units = localPasses.filter(t => unitNames.includes(t.split('/')[0]));
check('17 distinct relevant local regression checks passed once', units.length === 17 && new Set(units).size === 17 && unitNames.every(t => units.includes(t)));
check('both seed roots passed in package and detached executable', ['TestDConfigWriterMySQLSeed', 'TestANonceAcceptanceMySQLSeed'].every(t => localPasses.filter(p => p === t).length === 2));
check('detached seed cannot use checkout fixtures', once('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent writer-candidate=True real_mysql=not_run'));
check('11 dispatch checks ran in both local layers', local.split('\n').filter(v => v === 'PASS evidence remote dispatch: 11 cases; no remote actions, dependencies or build artifacts').length === 2);
check('new root seed phase exclusive dispatch guard passed', local.includes('PASS nonce-acceptance-dispatch: exact new root/seed/phase, binary/input/UID pins, full-catalog, preflight, cleanup and exclusive profile; no build or remote'));
check('archive SHA check succeeded', once('bundle.tar: OK'));
const payload = local.match(/^LOCAL_PASS a-nonce-acceptance-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/m);
check('Linux probe and closed writer inputs actually built', !!payload);
check('actual remote probe and capsule match local SHA values', once(`PASS a-nonce-acceptance-mysql binary_sha256=${payload[1]} inputs_sha256=${payload[2]} new_cases=8 synthetic_issuer_authority_capacity=yes human_mfa=no production_approval=no`));
const runner = local.match(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/m);
check('pinned migration runner actually built', !!runner);
const catalog = computeMigrationCatalog();
check('complete current 95-file catalog matches the reviewed catalog', catalog.file_count === 95 && catalog.hash === '2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
check('remote runner matches local SHA and actual catalog', once(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
const migration = JSON.parse(remote.split('\n').find(v => v.startsWith('{"config_activated"')));
check('actual runner migration scope remains isolated and unactivated', migration.result === 'PASS' && migration.migration_count === 95 && migration.migration_catalog_sha256 === catalog.hash && migration.config_activated === false && migration.historical_equivalence_verified === false && migration.human_mfa_verified === false);
check('all 95 exact migration filenames actually replayed', once('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes d_columns=blob/blob/blob/char'));
const leafNames = ['past_auth', 'future_within_skew', 'future_outside_skew', 'expiry_during_insert'];
const root = 'TestANonceAcceptanceMySQL';
const expected = [root, ...['provider', 'config'].flatMap(c => [`${root}/${c}`, ...leafNames.map(n => `${root}/${c}/${n}`)])];
const runs = [...remote.matchAll(/^=== RUN   (TestANonceAcceptanceMySQL(?:\/\S+)?)$/gm)].map(m => m[1]);
const passes = [...remote.matchAll(/^\s*--- PASS: (TestANonceAcceptanceMySQL(?:\/\S+)?) \([\d.]+s\)$/gm)].map(m => m[1]);
check('eight exact leaves two groups and root actually ran once', JSON.stringify(runs) === JSON.stringify(expected));
check('eight exact leaves two groups and root all passed once', JSON.stringify(passes) === JSON.stringify(expected));
check('no older SQL suites were rerun', [...remote.matchAll(/^=== RUN   (\S+)$/gm)].every(m => expected.includes(m[1])));
check('provider original-expiry boundary actually waited at least ten seconds', Number(remote.match(/--- PASS: TestANonceAcceptanceMySQL\/provider\/expiry_during_insert \(([\d.]+)s\)/)?.[1]) >= 10);
check('config original-expiry boundary actually waited at least ten seconds', Number(remote.match(/--- PASS: TestANonceAcceptanceMySQL\/config\/expiry_during_insert \(([\d.]+)s\)/)?.[1]) >= 10);
check('four owned provider databases independently dropped by the actual probe', [...remote.matchAll(/CLEANED nonce-time owned provider database/g)].length === 4);
check('four owned config writer effect groups cleaned', [...remote.matchAll(/CLEANED config-writer owned nonce\/operation\/evidence\/state\/config rows/g)].length === 4);
check('four owned config proof identity groups cleaned', [...remote.matchAll(/CLEANED config-proof owned installation\/user\/credentials\/sessions\/revocations\/audit/g)].length === 4);
check('explicit synthetic authority and no human MFA or production approval', remote.includes('PASS real nonce SQL acceptance time: eight new cases; synthetic issuer/authority/capacity; no human MFA or production approval'));
check('same exact namespace and original UID reported cleaned', once(`CLEANED namespace=${namespace} uid=${uid}`));
check('remote scratch reported cleaned', once('CLEANED remote-registration-scratch=yes'));
check('inner local build artifacts reported cleaned', once('CLEANED local-registration-build-cache=True'));
check('frozen postcheck default vet and no dependency installation passed', once('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'));
check('outer exit zero and transcript terminated', once('a_nonce_time_mysql_remote_exit=0') && /^结束时间: 20261019100654$/m.test(raw));
const ownerMatch = raw.match(/^LOCAL_OWNER config-writer-source=(.+)$/m);
check('one exact local source owner reported', ownerMatch && [...raw.matchAll(/^LOCAL_OWNER config-writer-source=/gm)].length === 1);
const owner = ownerMatch[1].trim();
check('exact local source owner independently absent', path.dirname(path.resolve(owner)).toLowerCase() === process.cwd().toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)) && !fs.existsSync(owner) && once(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));
check('initial SSH authentication diagnostics preceded actual successful run', !/Permission denied, please try again\./.test(remote));
const focus = [
  'backend/go.mod', 'backend/go.sum',
  'backend/internal/systembackupsecurity/providerproof_transaction.go',
  'backend/internal/systembackupsecurity/config_mutation_transaction.go',
  'backend/internal/systembackupsecurity/nonce_acceptance_time_a_mysql_test.go',
  'backend/internal/systembackupsecurity/nonce_acceptance_time_a_test.go',
  'backend/internal/systembackupsecurity/config_writer_mysql_test.go',
  'backend/internal/systembackupsecurity/config_proof_mysql_test.go',
  'backend/internal/systembackupsecurity/config_writer_security_a_mysql_test.go',
  'backend/internal/systembackupsecurity/providerproof_mysql_test.go',
  'backend/internal/systembackupsecurity/strongauth.go',
  'backend/internal/systembackupsecurity/sensitive_download_deadline.go',
  'backend/internal/systembackupcontroller/bootstrap.go',
  'scripts/system-backup-a-evidence-validation.ps1',
  'scripts/system-backup-d-config-writer-validation.ps1',
  'scripts/system-backup-a-nonce-acceptance-phase.sh',
  'scripts/system-backup-a-nonce-acceptance-dispatch.test.ps1',
  'scripts/system-backup-a-config-proof-source.ps1',
  'scripts/system-backup-d-index-source-snapshot.ps1',
  'scripts/system-backup-a-evidence-go-step.ps1',
  'scripts/system-backup-fresh-migration-smoke.sh',
  'scripts/system-backup-d-migration-phase.sh',
  'scripts/system-backup-contract-check.mjs',
  'docs/system-backup-d-config-canonical-candidate-20261012.sql',
  'contracts/system-backup/v12/strong-auth-nonce-ledger.schema.json',
  'contracts/system-backup/v12/strong-auth-proof-nonce.schema.json',
  ...source.files.filter(p => /^backend\/internal\/db\/migrations\/[^/]+\.sql$/.test(p.path)).map(p => p.path),
];
check('focus includes all 95 formal migration pins', focus.filter(p => p.startsWith('backend/internal/db/migrations/')).length === 95);
const comparison = source.files.map(pin => {
  if (!fs.existsSync(pin.path)) return { ...pin, current_status: 'missing' };
  const current = bytes(pin.path);
  return { ...pin, current_sha256: hash(current), current_size: current.length, current_status: current.length === pin.size && hash(current) === pin.sha256 ? 'matched' : 'changed' };
});
const focused = focus.map(name => comparison.find(p => p.path === name));
check('every current SQL consumer probe transport contract and migration focus pin matches', focused.every(p => p && p.current_status === 'matched'));
const receipt = {
  kind: 'a_nonce_acceptance_time_actual_MySQL_independent_acceptance', recorded_at: new Date().toISOString(),
  status: 'accepted_exact_eight_new_provider_config_nonce_time_cases_only',
  log: logName, log_sha256: hash(bytes(logName)), source: sourceName, source_manifest_sha256: hash(bytes(sourceName)),
  source_files: source.files.length, source_sha256: source.source_sha256, capture_attempts: source.capture_attempts,
  checks_passed: checks.length, checks, namespace, namespace_uid: uid, app_image: appImage, mysql_image: mysqlImage, mysql_version: mysqlVersion,
  catalog, probe_sha256: payload[1], inputs_capsule_sha256: payload[2], migration_runner_sha256: runner[1],
  actual_case_count: 8, actual_case_names: expected.filter(t => t.split('/').length === 3), actual_PASS_entries: 11,
  relevant_local_checks: 17, seed_roots: 2, detached_seed_roots: 2, duplicate_seeds_and_dispatch_not_added: true,
  provider_database_cleanup_reports: 4, config_writer_cleanup_reports: 4, config_proof_cleanup_reports: 4,
  source_owner_independently_absent: owner,
  database_identity_basis: 'fresh run marker, namespace/UID/server UUID and transaction identity assertions in the real passing probe; server UUID value is not printed in the transcript',
  remote_cleanup_basis: 'operator transcript; A did not access the remote environment again',
  inner_build_cleanup_basis: 'reported; exact inner owner path is not emitted in this transcript',
  SSH_authentication_retry_diagnostics_before_run: (local.match(/Permission denied, please try again\./g) ?? []).length,
  socket_close_diagnostics: (raw.match(/close - IO is still pending on closed socket/g) ?? []).length,
  current_focused_pins: focused, current_original_inputs_matching: comparison.filter(p => p.current_status === 'matched').length,
  changed_original_inputs_excluded: comparison.filter(p => p.current_status !== 'matched'), new_current_files_enumerated_or_accepted: false,
  scope: { real_MySQL: true, SQL_acceptance_and_original_expiry: true, actual_SQL_clock_regression_injected: false, synthetic_issuer_authority_capacity: true, human_MFA: false, formal_schema_approved: false, production_download_enabled: false, whole_current_worktree_accepted: false, overall_A_goal_complete: false },
  review_actions: { dependencies_installed: false, builds_or_tests_rerun: false, remote_access: false },
};
if (process.argv.includes('--record')) fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: process.argv.includes('--record') ? output : 'not_written', checks: checks.length, actual_cases: 8, source_files: source.files.length, focused_pins: focused.length, changed_excluded: receipt.changed_original_inputs_excluded.map(p => p.path), cleanup: true }));
