import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { drillCases, validateDrillMetadata, validateDrillLog, reviewDrill } from './d-drill-http-review-20261023.mjs';

// Pure parser inputs, deliberately synthetic. No database, network or actual
// SQL acceptance receipt is created by these tests.
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sql = hash('sql'), http = hash('http'), migration = hash('migration'), ddl = hash('ddl'), catalog = hash('catalog');
const namespace = 'sbk-mig-261023140000-abcd', uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const probe = 'TestDAdminReadLiveHTTPMySQL';
const localLines = () => [
  'LOCAL_PASS isolated-go-telemetry=off',
  'ok  clawreef/internal/systembackupsecurity 1.234s',
  'ok  clawreef/internal/systembackupread 1.234s',
  'ok  command-line-arguments 1.234s',
  'VALIDATION_SCOPE drill-history-only=yes synthetic_cases=19 real_mysql=not_run production=no',
  '=== RUN   TestDDrillDetailHTTPSeed',
  '    system_backup_read_drill_history_mysql_test.go:57: PASS drill-history-http-seed synthetic_cases=19 actual_mysql=not_run actual_provider=no production_approval=no',
  '--- PASS: TestDDrillDetailHTTPSeed (0.01s)', 'PASS', 'ok  command-line-arguments 1.234s',
  'ok  clawreef/internal/systembackupsecurity 1.234s',
  `LOCAL_PASS a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${sql} ddl_sha256=${ddl}`,
  `LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=${migration}`,
  `LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=${http} real_mysql=not_run`,
];
const remoteLines = () => [
  `RUN namespace=${namespace} uid=${uid} app_image=example@sha256:${http} mysql_image=mysql:8.4 mysql_version=8.4.8`,
  `PASS pinned-migration-runner binary_sha256=${migration} catalog_sha256=${catalog}`,
  'PASS fresh-migration-replay=001..081 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',
  `=== RUN   ${probe}`,
  ...drillCases.flatMap(name => [`=== RUN   ${probe}/drill_history_${name}`, `    --- PASS: ${probe}/drill_history_${name} (0.01s)`]),
  '    system_backup_read_drill_history_mysql_test.go:300: PASS drill-history-http-mysql synthetic_cases=19 actual_provider=no production_approval=no',
  `--- PASS: ${probe} (1.00s)`, 'PASS',
  `PASS d-drill-detail-http-mysql synthetic_cases=19 binary_sha256=${http} actual_provider=no production_approval=no`,
  `CLEANED namespace=${namespace} uid=${uid}`, 'CLEANED remote-registration-scratch=yes',
];
const log = () => [...localLines(), ...remoteLines(), 'CLEANED local-registration-build-cache=True'].join('\n');
const options = { ddlHash: ddl, catalogHash: catalog, migrationCount: 96, lastMigration: '081' };
const check = text => validateDrillLog(text, options);
test('accept complete synthetic parser input only; CRLF/BOM and local versus actual scope', () => {
  assert.equal(check('\uFEFF' + log().replaceAll('\n', '\r\n')).actual_mysql_cases, 19);
  const local = [...localLines(), 'CLEANED local-registration-build-cache=True'].join('\n');
  assert.equal(validateDrillLog(local, { ...options, actual: false }).actual_mysql_cases, 0);
  assert.throws(() => check(local));
  assert.throws(() => validateDrillLog(log(), { ...options, actual: false }));
});
const deferredLog = () => {
  const lines = log().split('\n');
  const summaries = lines.filter(line => line.startsWith(`    --- PASS: ${probe}/`));
  return lines.filter(line => !line.startsWith(`    --- PASS: ${probe}/`)).join('\n')
    .replace(`--- PASS: ${probe} (1.00s)\n`, `--- PASS: ${probe} (1.00s)\n${summaries.join('\n')}\n`);
};
test('accept Go subtest summaries after root PASS and before package PASS', () => {
  assert.equal(check(deferredLog()).actual_mysql_cases, 19);
});
for (const [name, mutate] of Object.entries({
  'summary after native package PASS': s => { const line = `    --- PASS: ${probe}/drill_history_missing_auth (0.01s)`; return s.replace(line + '\n', '').replace('PASS d-drill-detail-http-mysql', line + '\nPASS d-drill-detail-http-mysql'); },
  'root failure despite semantic PASS': s => s.replace(`--- PASS: ${probe} (1.00s)`, `--- FAIL: ${probe} (1.00s)`),
  'failed deferred case': s => s.replace(`--- PASS: ${probe}/drill_history_foreign_installation`, `--- FAIL: ${probe}/drill_history_foreign_installation`),
  'missing deferred case': s => s.replace(`    --- PASS: ${probe}/drill_history_foreign_installation (0.01s)\n`, ''),
})) test('reject deferred log: ' + name, () => assert.throws(() => check(mutate(deferredLog()))));
test('reject actual failed nineteen-case run even with printed semantic PASS', () => {
  const native = fs.readFileSync('docs/evidence/d-drill-http-remote-20261026-084817-044e5eed-source.json.native.log', 'utf8');
  assert.throws(() => validateDrillLog(native), /failed, skipped or incomplete/);
});
const mutations = {
  'missing case': s => s.split('\n').filter(line => !line.includes('/drill_history_missing_auth')).join('\n'),
  'duplicate case': s => s + '\n    --- PASS: ' + probe + '/drill_history_missing_auth (0.01s)',
  'skipped case': s => s.replace('--- PASS: ' + probe + '/drill_history_missing_auth', '--- SKIP: ' + probe + '/drill_history_missing_auth'),
  'failed case': s => s.replace('--- PASS: ' + probe + '/drill_history_missing_auth', '--- FAIL: ' + probe + '/drill_history_missing_auth'),
  'unknown case': s => s.replaceAll('/drill_history_missing_auth', '/drill_history_unknown'),
  'wrong root': s => s.replaceAll(probe, 'TestWrongHTTP'),
  'extra old authority root': s => s.replace(`=== RUN   ${probe}\n`, `=== RUN   TestAAdminReadAuthorityMySQL\n=== RUN   ${probe}\n`),
  'missing root pass': s => s.replace(`--- PASS: ${probe} (1.00s)\n`, ''),
  'JSON encoded root pass': s => s.replace(`--- PASS: ${probe} (1.00s)`, JSON.stringify({ Output: `--- PASS: ${probe} (1.00s)` })),
  'no native PASS': s => s.replace(`--- PASS: ${probe} (1.00s)\nPASS\n`, `--- PASS: ${probe} (1.00s)\n`),
  'duplicate native PASS': s => s.replace(`--- PASS: ${probe} (1.00s)\nPASS\n`, `--- PASS: ${probe} (1.00s)\nPASS\nPASS\n`),
  'semantic summary missing': s => s.replace(/^.*: PASS drill-history-http-mysql .*\n/m, ''),
  'cleanup pending': s => s + '\nCLEANUP_PENDING namespace=example',
  'cleanup skipped': s => s + '\nCLEANUP_SKIPPED UID changed',
  'missing namespace cleanup': s => s.replace(/^CLEANED namespace=.*\n/m, ''),
  'missing remote scratch cleanup': s => s.replace('CLEANED remote-registration-scratch=yes\n', ''),
  'missing inner cleanup': s => s.replace('CLEANED local-registration-build-cache=True', ''),
  'wrong UID': s => s.replace(`CLEANED namespace=${namespace} uid=${uid}`, `CLEANED namespace=${namespace} uid=bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee`),
  'wrong namespace': s => s.replace(`CLEANED namespace=${namespace}`, 'CLEANED namespace=sbk-mig-261023140001-abcd'),
  'duplicate run identity': s => s + '\n' + remoteLines()[0],
  'wrong HTTP binary': s => s.replace(`synthetic_cases=19 binary_sha256=${http}`, `synthetic_cases=19 binary_sha256=${sql}`),
  'wrong migration binary': s => s.replace(`runner binary_sha256=${migration}`, `runner binary_sha256=${sql}`),
  'wrong catalog': s => s.replace(`catalog_sha256=${catalog}`, `catalog_sha256=${sql}`),
  'partial migration': s => s.replace('applied=96', 'applied=95'),
  'wrong last migration': s => s.replace('001..081', '001..080'),
  'wrong fixture': s => s.replace(`ddl_sha256=${ddl}`, `ddl_sha256=${sql}`),
  'incomplete local read package': s => s.replace('ok  clawreef/internal/systembackupread 1.234s\n', ''),
  'no tests actually run': s => s + '\n[no tests to run]',
  'skipped local seed': s => s.replace('--- PASS: TestDDrillDetailHTTPSeed', '--- SKIP: TestDDrillDetailHTTPSeed'),
  'case pass before run': s => s.replace(`=== RUN   ${probe}/drill_history_missing_auth\n    --- PASS: ${probe}/drill_history_missing_auth (0.01s)`, `    --- PASS: ${probe}/drill_history_missing_auth (0.01s)\n=== RUN   ${probe}/drill_history_missing_auth`),
  'root before phase replay': s => s.replace(`=== RUN   ${probe}\n`, '').replace('PASS fresh-migration-replay=', `=== RUN   ${probe}\nPASS fresh-migration-replay=`),
  'namespace cleanup before phase': s => s.replace(`CLEANED namespace=${namespace} uid=${uid}\n`, '').replace('PASS d-drill-detail-http-mysql', `CLEANED namespace=${namespace} uid=${uid}\nPASS d-drill-detail-http-mysql`),
  'duplicate seed summary': s => s + '\n' + localLines()[6],
};
for (const [name, mutate] of Object.entries(mutations)) test('reject synthetic log: ' + name, () => assert.throws(() => check(mutate(log()))));

// Metadata mutation tests use actual source path names, with synthetic bytes.
const names = [
  'backend/go.mod', 'backend/go.sum', 'backend/cmd/server/system_backup_read_live.go',
  'backend/cmd/server/system_backup_read_live_mysql_test.go', 'backend/cmd/server/system_backup_read_drill_history_mysql_test.go',
  'backend/internal/systembackupread/drill_detail.go', 'backend/internal/systembackupcontroller/bootstrap.go',
  'scripts/system-backup-d-drill-detail-validation.ps1', 'scripts/system-backup-d-index-source-snapshot.ps1',
  'scripts/system-backup-a-evidence-validation.ps1', 'scripts/system-backup-a-evidence-go-step.ps1',
  'scripts/system-backup-a-admin-read-phase.sh', 'scripts/system-backup-a-admin-read-probe.sql',
  'scripts/system-backup-controller-enabled-fixture.mysql.sql', 'scripts/system-backup-fresh-migration-smoke.sh',
  'scripts/system-backup-d-migration-phase.sh',
].sort();
const fixture = () => {
  const files = names.map(name => ({ path: name, size: name.length, sha256: hash(name) }));
  const source = { kind: 'd_drill_detail_source.v1', stable_copy_verified: true, freeze_only: false,
    remote_requested: true, dependencies_installed: false, production_approval: false, owner: 'synthetic-owner', files,
    source_sha256: hash(files.map(pin => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n') };
  const result = { kind: 'd_drill_detail_validation.v1', status: 'profile_completed_actual_results_require_review', source_sha256: source.source_sha256,
    child_exit: 0, child_log: 'synthetic.log', child_log_sha256: hash('synthetic log'), source_postcheck: true,
    freeze_only: false, remote_requested: true, actual_mysql_results_accepted: false, dependencies_installed: false, error: null,
    cleanup: { owner: source.owner, removed: true, test_build_artifacts_removed: true, files_removed: files.length + 1 } };
  return { source, result };
};
test('synthetic metadata alone is accepted only by the metadata parser', () => { const { source, result } = fixture(); validateDrillMetadata(source, result); });
const metadataMutations = {
  'local cannot prove remote': (s, r) => { s.remote_requested = r.remote_requested = false; },
  'child failure': (s, r) => { r.child_exit = 1; },
  'postcheck missing': (s, r) => { r.source_postcheck = false; },
  'freeze only': (s, r) => { s.freeze_only = r.freeze_only = true; },
  'outer cleanup absent': (s, r) => { r.cleanup.removed = false; },
  'build cleanup absent': (s, r) => { r.cleanup.test_build_artifacts_removed = false; },
  'wrong cleanup owner': (s, r) => { r.cleanup.owner = 'other'; },
  'insufficient files removed': (s, r) => { r.cleanup.files_removed = 1; },
  'source mixed': (s, r) => { r.source_sha256 = hash('other'); },
  'log digest absent': (s, r) => { delete r.child_log_sha256; },
  'duplicate pin': s => { s.files.push(s.files[0]); },
  'unsafe pin': s => { s.files[0].path = 'backend/../secret'; },
  'pin removed': s => { s.files.shift(); },
  'bytes changed': s => { s.files[0].size++; },
  'unreviewed approval': (s, r) => { r.actual_mysql_results_accepted = true; },
  'dependency installation': s => { s.dependencies_installed = true; },
};
for (const [name, mutate] of Object.entries(metadataMutations)) test('reject synthetic metadata: ' + name, () => {
  const { source, result } = fixture(); mutate(source, result); assert.throws(() => validateDrillMetadata(source, result));
});

test('synthetic file-level proof binds exact files and raw log, refuses tampering, removes all owned fixtures', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const scratch = fs.mkdtempSync(path.join(root, 'docs/evidence/.tmp-d-drill-receiver-'));
  const marker = crypto.randomUUID();
  fs.writeFileSync(path.join(scratch, 'owner.txt'), marker);
  try {
    const { source, result } = fixture();
    const directories = ['backend/cmd/server', 'backend/cmd/system-backup-migrate', 'backend/internal/systembackupread', 'backend/internal/systembackupsecurity', 'backend/internal/systembackupcontract', 'backend/internal/db/migrations', 'contracts/system-backup'];
    const selected = [...names];
    for (const directory of directories) selected.push(...fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true }).filter(item => item.isFile())
      .map(item => path.relative(root, path.join(item.parentPath, item.name)).replaceAll('\\', '/')).filter(name => /\.(go|json|sql|md)$/.test(name)));
    source.files = [...new Set(selected)].sort().map(name => { const bytes = fs.readFileSync(path.join(root, name)); return { path: name, size: bytes.length, sha256: hash(bytes) }; });
    source.source_sha256 = hash(source.files.map(pin => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n');
    source.owner = path.join(root, '.tmp-d-index-cache-' + crypto.randomUUID().replaceAll('-', ''));
    result.source_sha256 = source.source_sha256;
    result.cleanup.owner = source.owner;
    result.cleanup.files_removed = source.files.length + 1;
    const manifest = path.join(scratch, 'synthetic-source.json');
    result.child_log = manifest + '.native.log';
    const actualDDL = source.files.find(pin => pin.path === 'scripts/system-backup-a-admin-read-probe.sql').sha256;
    const actualCatalog = /ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(fs.readFileSync(path.join(root, 'backend/internal/systembackupcontroller/bootstrap.go'), 'utf8'))[1];
    const migrationPins = source.files.filter(pin => /^backend\/internal\/db\/migrations\/[^/]+\.sql$/.test(pin.path));
    const raw = log().replaceAll(ddl, actualDDL).replaceAll(catalog, actualCatalog).replace('applied=96', 'applied=' + migrationPins.length).replace('001..081', '001..' + path.basename(migrationPins.at(-1).path).split('_')[0]);
    fs.writeFileSync(result.child_log, raw); result.child_log_sha256 = hash(raw);
    fs.writeFileSync(manifest, JSON.stringify(source)); fs.writeFileSync(manifest + '.result.json', JSON.stringify(result));
    const review = reviewDrill(manifest);
    assert.equal(review.actual_mysql_cases, 19); assert.equal(review.production_approved, false);
    assert.equal(review.provider_or_human_MFA_accepted, false); assert.equal(review.current_whole_tree_tested, false);
    fs.appendFileSync(result.child_log, '\n');
    assert.throws(() => reviewDrill(manifest), /native log altered/);
    fs.writeFileSync(result.child_log, raw);
    const pin = source.files.find(pin => pin.path === 'backend/cmd/server/system_backup_read_live.go'); pin.sha256 = hash('wrong bytes');
    source.source_sha256 = hash(source.files.map(pin => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n');
    result.source_sha256 = source.source_sha256;
    fs.writeFileSync(manifest, JSON.stringify(source)); fs.writeFileSync(manifest + '.result.json', JSON.stringify(result));
    assert.throws(() => reviewDrill(manifest), /critical source differs/);
  } finally {
    assert.equal(path.dirname(scratch), path.join(root, 'docs/evidence'));
    assert.ok(path.basename(scratch).startsWith('.tmp-d-drill-receiver-'));
    assert.equal(fs.lstatSync(scratch).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(path.join(scratch, 'owner.txt'), 'utf8'), marker);
    fs.rmSync(scratch, { recursive: true });
    assert.equal(fs.existsSync(scratch), false);
  }
});
