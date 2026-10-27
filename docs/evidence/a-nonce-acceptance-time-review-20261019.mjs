import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(p);
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const names = {
  baseline: 'docs/evidence/a-nonce-time-baseline-20261019.txt',
  before: 'docs/evidence/a-nonce-time-baseline-source-20261019.json',
  final: 'docs/evidence/a-nonce-time-final-20261019.txt',
  after: 'docs/evidence/a-nonce-time-final-source-20261019.json',
};
const before = json(names.before), after = json(names.after);
const baseline = read(names.baseline).toString('utf8'), final = read(names.final).toString('utf8');
const events = text => text.split(/\r?\n/).filter(l => l.startsWith('{')).map(l => JSON.parse(l));
const oldEvents = events(baseline), newEvents = events(final);
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
for (const [phase, source] of [['before', before], ['after', after]]) {
  const input = source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n';
  check(`${phase} source digest independently recomputed`, hash(Buffer.from(input)) === source.source_sha256);
  check(`${phase} stable capture without installing dependencies`, source.stable_copy_verified && source.dependencies_installed === false);
}
check('baseline actual Go and wrapper exit one', /^NONCE_GO_EXIT=1\s*$/m.test(baseline) && /^nonce_time_exit=1\s*$/m.test(baseline));
for (const root of ['TestAProviderNonceUsesSQLAcceptanceTime', 'TestAConfigNonceUsesSQLAcceptanceTime']) {
  for (const failure of ['past_auth', 'future_within_skew', 'clock_regression']) {
    check(`original counterexample reproduced: ${root}/${failure}`, oldEvents.some(e => e.Action === 'fail' && e.Test === `${root}/${failure}`));
  }
  for (const control of ['future_outside_skew', 'expiry_during_insert', 'age_during_insert']) {
    check(`baseline rejection control passed: ${root}/${control}`, oldEvents.some(e => e.Action === 'pass' && e.Test === `${root}/${control}`));
  }
}
check('baseline has exactly six failing child cases', oldEvents.filter(e => e.Action === 'fail' && e.Test?.includes('/')).length === 6);
check('final full-security stage with default vet', final.includes('NONCE_STAGE phase=Final full-security-package=True default-vet=yes dependency-installation=no remote=no'));
check('final actual Go and wrapper exit zero', /^NONCE_GO_EXIT=0\s*$/m.test(final) && /^nonce_time_exit=0\s*$/m.test(final));
check('both frozen postchecks passed', [baseline, final].every(l => l.includes('NONCE_POSTCHECK frozen-source=yes')));
check('isolated telemetry off in both phases', [baseline, final].every(l => l.includes('LOCAL_PASS isolated-go-telemetry=off')));
check('final package passed with no failures', newEvents.some(e => e.Action === 'pass' && !e.Test && e.Package === 'clawreef/internal/systembackupsecurity') && !newEvents.some(e => e.Action === 'fail'));
const passed = newEvents.filter(e => e.Action === 'pass' && e.Test);
check('passed test names unique', new Set(passed.map(e => e.Package + ':' + e.Test)).size === passed.length);
const aRoots = new Map([
  ['TestAProviderNonceUsesSQLAcceptanceTime', 7],
  ['TestAConfigNonceUsesSQLAcceptanceTime', 7],
  ['TestASensitiveDownloadNonceAcceptanceTime', 3],
]);
for (const [root, count] of aRoots) check(`new regression all cases passed: ${root}`, passed.filter(e => e.Test === root || e.Test.startsWith(root + '/')).length === count);
check('new regressions not skipped', !newEvents.some(e => e.Action === 'skip' && e.Test && aRoots.has(e.Test.split('/')[0])));
const pins = [];
for (const file of ['backend/internal/systembackupsecurity/providerproof_transaction.go', 'backend/internal/systembackupsecurity/config_mutation_transaction.go', 'backend/internal/systembackupsecurity/sensitive_download_deadline.go', 'backend/internal/systembackupsecurity/nonce_acceptance_time_a_test.go', 'scripts/system-backup-a-nonce-time-validation.ps1']) {
  const pin = after.files.find(p => p.path === file);
  check(`current reviewed pin matches: ${file}`, pin && hash(read(file)) === pin.sha256 && read(file).length === pin.size);
  pins.push(pin);
}
for (const file of ['backend/internal/systembackupsecurity/providerproof_transaction.go', 'backend/internal/systembackupsecurity/config_mutation_transaction.go']) {
  check(`counterexample ran original consumer: ${file}`, before.files.find(p => p.path === file).sha256 !== after.files.find(p => p.path === file).sha256);
}
const immutable = ['backend/internal/db/migrations/075_add_system_backup_strong_auth_nonces.sql', 'contracts/system-backup/v12/strong-auth-nonce-ledger.schema.json', 'contracts/system-backup/v12/schema-registry-decisions.json', 'contracts/system-backup/v12/contract-manifest.json'];
for (const file of immutable) check(`published DDL/contract approval unchanged: ${file}`, before.files.find(p => p.path === file).sha256 === after.files.find(p => p.path === file).sha256 && hash(read(file)) === after.files.find(p => p.path === file).sha256);
const paths = [baseline, final].flatMap(l => [...l.matchAll(/^NONCE_CLEANUP owned=(.+) removed=True\s*$/gm)].map(m => m[1].trim()));
check('four exact owned paths cleaned', paths.length === 4 && new Set(paths).size === 4);
for (const owned of paths) check(`owned directory absent: ${path.basename(owned)}`, path.dirname(path.resolve(owned)).toLowerCase() === process.cwd().toLowerCase() && !fs.existsSync(owned));
const report = {
  kind: 'a_nonce_acceptance_time_independent_regression_review', recorded_at: new Date().toISOString(),
  status: 'local_consumer_fix_accepted_real_SQL_incremental_validation_pending',
  inputs: Object.fromEntries(Object.entries(names).map(([kind, file]) => [kind, { path: file, sha256: hash(read(file)) }])),
  baseline_source_files: before.files.length, baseline_source_sha256: before.source_sha256,
  final_source_files: after.files.length, final_source_sha256: after.source_sha256,
  baseline_failing_child_cases: 6, checks_passed: checks.length, checks,
  final_main: passed.filter(e => !e.Test.includes('/')).length,
  final_subtests: passed.filter(e => e.Test.includes('/')).length,
  final_including_subtests: passed.length, final_skipped: newEvents.filter(e => e.Action === 'skip').map(e => e.Test ?? '(package)'),
  new_main: 3, new_including_subtests: 17, reviewed_pins: pins,
  exact_owned_paths_independently_absent: paths,
  default_vet: true, dependencies_installed: false, remote_executed: false, actual_MySQL: false,
  SQL_transport_and_clock_modeled: true, signatures_are_actual_Ed25519: true,
  old_successful_remote_suites_repeated: false, formal_migrations_changed: false,
  formal_schema_approval: false, production_download_route_enabled: false,
  remaining: ['incremental real MySQL acceptance/consumption and skew/regression validation for changed consumers',
    'download MFA needs same-transaction current target/authorization source; no arbitrary-hash issuer added',
    'D complete prelocked authority, atomic storage/nonce/claim/capacity/final guard and reviewed runtime materials',
    'formal schema and real deployment/E2E'],
};
const output = 'docs/evidence/a-nonce-acceptance-time-review-20261019.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, checks: checks.length, main: report.final_main, subtests: report.final_subtests, total: passed.length, new_checks: 17, old_counterexamples: 6, cleaned: paths.length }));
