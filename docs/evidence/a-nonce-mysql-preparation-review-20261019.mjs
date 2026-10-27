import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const read = name => fs.readFileSync(name);
const parse = name => JSON.parse(read(name).toString('utf8').replace(/^\uFEFF/, ''));
const base = 'docs/evidence/';
const logName = base + 'a-nonce-mysql-local-preparation-20261019-r5.txt';
const sourceName = base + 'a-nonce-mysql-local-source-20261019-r5.json';
const log = read(logName).toString('utf8'), source = parse(sourceName);
const qa = [base + 'a-nonce-mysql-dispatch-20261019.txt', base + 'a-nonce-mysql-dispatch-win51-20261019.txt'];
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
check('actual preparation wrapper exit zero', /^a_nonce_mysql_preparation_exit=0\s*$/m.test(log));
check('frozen source postcheck passed', log.includes('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False'));
check('source captured stably with bounded source-only retries', source.stable_copy_verified && source.capture_attempts >= 1 && source.capture_attempts <= 3 && source.dependencies_installed === false);
const canonicalPins = source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n';
check('source digest independently recomputed', digest(Buffer.from(canonicalPins)) === source.source_sha256);
check('isolated telemetry disabled', log.includes('LOCAL_PASS isolated-go-telemetry=off'));
check('exact incremental local profile', log.includes('VALIDATION_SCOPE nonce-time-increment-only=yes synthetic-issuer-authority-capacity=yes human-mfa=no real_mysql=not_run'));
const passed = [...log.matchAll(/^\s*--- PASS:\s+(\S+)\s+\(/gm)].map(m => m[1]);
const main = ['TestAProviderNonceUsesSQLAcceptanceTime', 'TestAConfigNonceUsesSQLAcceptanceTime', 'TestASensitiveDownloadNonceAcceptanceTime'];
const unit = passed.filter(t => main.includes(t.split('/')[0]));
check('all 17 relevant local checks passed once', unit.length === 17 && new Set(unit).size === 17 && main.every(t => unit.includes(t)));
check('both tagged seed roots ran in package and detached executable', ['TestDConfigWriterMySQLSeed', 'TestANonceAcceptanceMySQLSeed'].every(t => passed.filter(p => p === t).length === 2));
check('detached seed has no checkout fixture dependency', log.includes('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent writer-candidate=True real_mysql=not_run'));
check('actual SQL root never ran locally', !/^=== RUN\s+TestANonceAcceptanceMySQL\s*$/m.test(log));
const binaries = log.match(/LOCAL_PASS a-nonce-acceptance-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})/);
check('Linux tagged probe and exact writer capsule built', !!binaries);
const runner = log.match(/LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})/);
check('Linux migration runner built', !!runner);
check('inner build-cache cleanup confirmed', log.includes('CLEANED local-registration-build-cache=True'));
const bash = parse(base + 'a-nonce-mysql-bash-local-20261019.json');
check('actual read-only Bash syntax check passed', bash.local_bash_syntax_verified === true && bash.readonly_retry_exit_code === 0 && bash.phase_commands_executed === false);
for (const file of qa) {
  const output = read(file).toString('utf8');
  check(`actual 13 remote expression pins passed: ${path.basename(file)}`, output.includes('PASS actual nonce SSH-expression binding: 13 command pins'));
  check(`nonce exclusive phase/root guard passed: ${path.basename(file)}`, output.includes('PASS nonce-acceptance-dispatch: exact new root/seed/phase'));
  check(`four legacy writer profiles remain compatible: ${path.basename(file)}`, [...output.matchAll(/PASS config-writer-dispatch payload\/seed\/phase\/exclusive-profile\/hash\/full-catalog\/preflight;/g)].length === 4);
}
const focus = [
  'backend/internal/systembackupsecurity/config_writer_mysql_test.go',
  'backend/internal/systembackupsecurity/nonce_acceptance_time_a_mysql_test.go',
  'backend/internal/systembackupsecurity/nonce_acceptance_time_a_test.go',
  'backend/internal/systembackupsecurity/providerproof_transaction.go',
  'backend/internal/systembackupsecurity/config_mutation_transaction.go',
  'backend/internal/systembackupsecurity/sensitive_download_deadline.go',
  'scripts/system-backup-a-evidence-validation.ps1',
  'scripts/system-backup-d-config-writer-validation.ps1',
  'scripts/system-backup-a-nonce-acceptance-phase.sh',
  'scripts/system-backup-a-nonce-acceptance-dispatch.test.ps1',
  'scripts/system-backup-fresh-migration-smoke.sh',
  'scripts/system-backup-d-migration-phase.sh',
  'backend/internal/systembackupcontroller/bootstrap.go',
];
const pins = focus.map(file => {
  const pin = source.files.find(p => p.path === file);
  check(`current preparation pin matches: ${file}`, pin && pin.size === read(file).length && pin.sha256 === digest(read(file)));
  return pin;
});
// Other chats are still changing the shared tree. Accept only this frozen
// preparation, and explicitly record drift outside the 13 required entry pins.
const currentOriginalInputs = { matching: 0, changed: [], missing: [] };
for (const pin of source.files) {
  if (!fs.existsSync(pin.path)) {
    currentOriginalInputs.missing.push(pin.path);
    continue;
  }
  const bytes = read(pin.path);
  if (bytes.length === pin.size && digest(bytes) === pin.sha256) currentOriginalInputs.matching++;
  else currentOriginalInputs.changed.push(pin.path);
}
check('every original input has an explicit current comparison', currentOriginalInputs.matching + currentOriginalInputs.changed.length + currentOriginalInputs.missing.length === source.files.length);
const owned = [];
const rounds = [];
for (const suffix of ['', '-r2', '-r3', '-r4', '-r5']) {
  const name = base + 'a-nonce-mysql-local-preparation-20261019' + suffix + '.txt';
  const text = read(name).toString('utf8');
  const expectedExit = ['-r3', '-r4'].includes(suffix) ? 1 : 0;
  check(`preparation round actual exit and cleanup: ${suffix || 'r1'}`, new RegExp(`^a_nonce_mysql_preparation_exit=${expectedExit}\\s*$`, 'm').test(text) && text.includes('CLEANED local-registration-build-cache=True'));
  if (expectedExit === 1) check(`original fixture seed failure retained: ${suffix}`, /--- FAIL: TestANonceAcceptanceMySQLSeed/.test(text));
  const match = text.match(/^LOCAL_CLEANUP config-writer-source-owned=(.+) removed=True\s*$/m);
  check(`exact source owner absent: ${suffix || 'r1'}`, match && path.dirname(path.resolve(match[1].trim())).toLowerCase() === process.cwd().toLowerCase() && !fs.existsSync(match[1].trim()));
  owned.push(match[1].trim());
  rounds.push({ path: name, sha256: digest(read(name)), actual_exit: expectedExit, accepted_for_current_remote_entry: suffix === '-r5' });
}
check('five owned sources unique', new Set(owned).size === 5);
const report = {
  kind: 'a_nonce_acceptance_incremental_mysql_preparation_review', recorded_at: new Date().toISOString(),
  status: 'local_preparation_accepted_actual_eight_SQL_cases_pending_operator',
  log: logName, log_sha256: digest(read(logName)), source: sourceName, source_manifest_sha256: digest(read(sourceName)),
  source_files: source.files.length, source_sha256: source.source_sha256,
  checks_passed: checks.length, checks, reviewed_current_pins: pins,
  accepted_scope: 'frozen preparation only; not the whole current worktree or any actual SQL run',
  current_original_input_comparison: currentOriginalInputs,
  added_current_files_enumerated: false,
  remote_entry_recaptures_and_revalidates_current_source: true,
  local_new_checks: 17, seed_roots: 2, detached_seed_roots: 2,
  linux_probe_sha256: binaries[1], inputs_sha256: binaries[2], linux_migration_runner_sha256: runner[1],
  exact_owned_sources_and_nested_build_artifacts_absent: owned,
  rounds, prior_rounds_superseded_before_actual_SQL: true,
  dispatch_evidence: qa.map(p => ({ path: p, sha256: digest(read(p)) })),
  local_bash_parse: bash,
  dependencies_installed: false, default_vet: true, remote_executed: false,
  actual_MySQL_cases_run: 0, expected_actual_MySQL_leaves: 8,
  real_SQL_clock_regression_claimed: false, human_MFA_verified: false,
  original_successful_remote_suites_repeated: false, formal_migrations_changed: false,
  formal_schema_approved: false, production_download_activated: false,
};
const output = base + 'a-nonce-mysql-preparation-review-20261019.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, checks: checks.length, source_files: source.files.length, new_local: 17, real_SQL: 0, expected_SQL_leaves: 8, cleaned: owned.length }));
