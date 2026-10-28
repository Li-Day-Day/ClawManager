import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = /^[a-f0-9]{64}$/;
const probe = 'TestDAdminReadLiveHTTPMySQL';
export const drillCases = Object.freeze([
  'pending_no_attempt', 'current_attempt_history', 'catalog_import', 'parallel_jobs',
  'parallel_phases', 'single_job', 'heartbeat_only', 'summary_drift', 'report_hash_drift',
  'report_wrong_owner', 'report_before_attempt', 'historical_preflight_before_retry',
  'shared_reference_strict_cutoff', 'expired_evidence_history', 'foreign_installation',
  'missing_task', 'unknown_query', 'missing_auth', 'revoked_session',
]);
const required = [
  'backend/go.mod', 'backend/go.sum',
  'backend/cmd/server/system_backup_read_live.go',
  'backend/cmd/server/system_backup_read_live_mysql_test.go',
  'backend/cmd/server/system_backup_read_drill_history_mysql_test.go',
  'backend/internal/systembackupread/drill_detail.go',
  'backend/internal/systembackupcontroller/bootstrap.go',
  'scripts/system-backup-d-drill-detail-validation.ps1',
  'scripts/system-backup-d-index-source-snapshot.ps1',
  'scripts/system-backup-a-evidence-validation.ps1',
  'scripts/system-backup-a-evidence-go-step.ps1',
  'scripts/system-backup-a-admin-read-phase.sh',
  'scripts/system-backup-a-admin-read-probe.sql',
  'scripts/system-backup-controller-enabled-fixture.mysql.sql',
  'scripts/system-backup-fresh-migration-smoke.sh',
  'scripts/system-backup-d-migration-phase.sh',
];
const critical = name => required.includes(name) ||
  /^(backend\/(cmd\/(server|system-backup-migrate)|internal\/(systembackupread|systembackupsecurity|systembackupcontract|db\/migrations))|contracts\/system-backup)\//.test(name);
const decode = bytes => (bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^\uFEFF/, '');
const json = file => JSON.parse(decode(fs.readFileSync(file)));
function local(file) {
  const resolved = path.resolve(root, file);
  assert.ok(resolved.startsWith(root + path.sep), 'path outside repository');
  return resolved;
}

export function validateDrillMetadata(source, result, { actual = true } = {}) {
  assert.equal(source.kind, 'd_drill_detail_source.v1');
  for (const [key, value] of Object.entries({ stable_copy_verified: true, freeze_only: false,
    remote_requested: actual, dependencies_installed: false, production_approval: false })) assert.equal(source[key], value, key);
  assert.equal(result.kind, 'd_drill_detail_validation.v1');
  for (const [key, value] of Object.entries({ status: 'profile_completed_actual_results_require_review',
    source_sha256: source.source_sha256, child_exit: 0, source_postcheck: true, freeze_only: false,
    remote_requested: actual, actual_mysql_results_accepted: false, dependencies_installed: false, error: null })) assert.equal(result[key], value, key);
  assert.match(source.source_sha256, digest);
  assert.equal(result.cleanup.owner, source.owner, 'mixed cleanup owner');
  assert.equal(result.cleanup.removed, true);
  assert.equal(result.cleanup.test_build_artifacts_removed, true);
  assert.ok(Number.isSafeInteger(result.cleanup.files_removed) && result.cleanup.files_removed > source.files.length, 'incomplete outer cleanup');
  assert.match(result.child_log_sha256, digest, 'native log hash');
  assert.ok(result.child_log, 'native log path missing');
  assert.ok(source.files.length > 0);
  const names = source.files.map(pin => pin.path);
  assert.equal(new Set(names).size, names.length, 'duplicate source pin');
  for (const pin of source.files) {
    assert.match(pin.path, /^(backend|contracts|scripts|docs)\//);
    assert.ok(!pin.path.includes('\\') && !pin.path.split('/').some(part => ['', '.', '..'].includes(part)), 'unsafe source path');
    assert.match(pin.sha256, digest);
    assert.ok(Number.isSafeInteger(pin.size) && pin.size >= 0);
  }
  assert.equal(sha(source.files.map(pin => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n'), source.source_sha256);
  for (const name of required) assert.ok(names.includes(name), 'required source absent: ' + name);
}

export function validateDrillLog(text, { actual = true, ddlHash, catalogHash, migrationCount, lastMigration } = {}) {
  const lines = text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').split('\n');
  assert.ok(!lines.some(line => /CLEANUP_PENDING|CLEANUP_SKIPPED|--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|panic:|fatal error:|\[no tests to run\]/.test(line)), 'failed, skipped or incomplete native run');
  const one = (pattern, label) => {
    const found = lines.flatMap((line, index) => { const match = pattern.exec(line); return match ? [{ match, index }] : []; });
    assert.equal(found.length, 1, 'exactly one ' + label); return found[0];
  };
  one(/^VALIDATION_SCOPE drill-history-only=yes synthetic_cases=19 real_mysql=not_run production=no$/, 'exclusive profile');
  one(/^LOCAL_PASS isolated-go-telemetry=off$/, 'isolated telemetry');
  one(/^ok\s+clawreef\/internal\/systembackupread\s+[0-9.]+s$/, 'complete read package');
  assert.equal(lines.filter(line => /^ok\s+clawreef\/internal\/systembackupsecurity\s+[0-9.]+s$/.test(line)).length, 2, 'read scope and SQL seed');
  assert.equal(lines.filter(line => /^ok\s+command-line-arguments\s+[0-9.]+s$/.test(line)).length, 2, 'live/cursor tests and drill seed');
  one(/^\s+\S+\.go:\d+: PASS drill-history-http-seed synthetic_cases=19 actual_mysql=not_run actual_provider=no production_approval=no$/, 'drill seed');
  const sql = one(/^LOCAL_PASS a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/, 'SQL binary');
  assert.equal(sql.match[2], ddlHash, 'SQL fixture hash');
  const migration = one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/, 'migration binary');
  const http = one(/^LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=([a-f0-9]{64}) real_mysql=not_run$/, 'HTTP binary');
  const cache = one(/^CLEANED local-registration-build-cache=True$/, 'inner build cleanup');
  const binaries = { sql_binary_sha256: sql.match[1], http_binary_sha256: http.match[1], migration_binary_sha256: migration.match[1] };
  if (!actual) {
    assert.ok(!lines.some(line => /^RUN namespace=|^PASS d-drill-detail-http-mysql|^=== RUN   TestDAdminReadLiveHTTPMySQL/.test(line)), 'remote evidence in local-only run');
    assert.ok(cache.index > http.index && http.index > migration.index && migration.index > sql.index);
    return { ...binaries, actual_mysql_cases: 0 };
  }
  const run = one(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}) app_image=\S+ mysql_image=\S+ mysql_version=(8\.4\.\S+)$/, 'namespace identity');
  const pinned = one(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/, 'migration execution');
  assert.equal(pinned.match[1], migration.match[1]); assert.equal(pinned.match[2], catalogHash);
  const replay = one(/^PASS fresh-migration-replay=001\.\.([0-9]+) applied=([0-9]+) exact_filenames=yes d_columns=blob\/blob\/blob\/char$/, 'migration replay');
  assert.equal(replay.match[1], lastMigration); assert.equal(Number(replay.match[2]), migrationCount);
  const start = one(new RegExp(`^=== RUN   ${probe}$`), 'HTTP root start');
  const semantic = one(/^\s+\S+\.go:\d+: PASS drill-history-http-mysql synthetic_cases=19 actual_provider=no production_approval=no$/, 'HTTP semantic completion');
  const done = one(new RegExp(`^--- PASS: ${probe} \\([0-9.]+s\\)$`), 'HTTP root pass');
  const remote = lines.slice(run.index, cache.index);
  const expected = drillCases.map(name => probe + '/drill_history_' + name);
  assert.equal(lines.filter(line => line.startsWith('=== RUN   ' + probe)).length, expected.length + 1, 'probe starts outside remote interval');
  assert.equal(lines.filter(line => line.trimStart().startsWith('--- PASS: ' + probe)).length, expected.length + 1, 'probe passes outside remote interval');
  assert.deepEqual(remote.filter(line => line.startsWith('=== RUN   ')).map(line => line.slice(10)), [probe, ...expected], 'exact remote roots and nineteen case starts');
  assert.deepEqual(remote.flatMap(line => { const m = /^\s+--- PASS: (\S+) \([0-9.]+s\)$/.exec(line); return m ? [m[1]] : []; }), expected, 'exact nineteen case passes');
  const nativeIndex = lines.findIndex((line, index) => index > done.index && line === 'PASS');
  for (const name of expected) {
    const begin = lines.indexOf('=== RUN   ' + name);
    const end = lines.findIndex(line => line.trimStart().startsWith('--- PASS: ' + name + ' ('));
    assert.ok(start.index < begin && begin < semantic.index && begin < end &&
      (end < semantic.index || (end > done.index && end < nativeIndex)), 'case ordering');
  }
  assert.equal(remote.filter(line => line === 'PASS').length, 1, 'native Go PASS');
  const phase = one(/^PASS d-drill-detail-http-mysql synthetic_cases=19 binary_sha256=([a-f0-9]{64}) actual_provider=no production_approval=no$/, 'drill phase completion');
  assert.equal(phase.match[1], http.match[1]);
  const cleanup = one(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/, 'namespace cleanup');
  assert.equal(cleanup.match[1], run.match[1]); assert.equal(cleanup.match[2], run.match[2]);
  const scratch = one(/^CLEANED remote-registration-scratch=yes$/, 'remote scratch cleanup');
  const order = [http.index, run.index, pinned.index, replay.index, start.index, semantic.index, done.index, nativeIndex, phase.index, cleanup.index, scratch.index, cache.index];
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])), 'remote event order');
  return { ...binaries, namespace: run.match[1], namespace_uid: run.match[2], mysql: run.match[3], actual_mysql_cases: 19 };
}

export function reviewDrill(sourceFile, { actual = true } = {}) {
  const sourcePath = local(sourceFile), resultPath = local(sourcePath + '.result.json');
  const source = json(sourcePath), result = json(resultPath);
  validateDrillMetadata(source, result, { actual });
  const owner = local(source.owner);
  assert.equal(path.dirname(owner), root);
  assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(owner), false, 'outer artifacts still exist');
  const logPath = local(result.child_log);
  assert.equal(logPath, sourcePath + '.native.log', 'mixed native log');
  const log = fs.readFileSync(logPath);
  assert.equal(sha(log), result.child_log_sha256, 'native log altered');
  const drift = [];
  for (const pin of source.files) {
    const file = local(pin.path), bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const same = bytes !== null && bytes.length === pin.size && sha(bytes) === pin.sha256;
    if (!same) drift.push(pin.path);
    if (critical(pin.path)) assert.ok(same, 'critical source differs: ' + pin.path);
  }
  for (const directory of ['backend/cmd/server', 'backend/cmd/system-backup-migrate', 'backend/internal/systembackupread', 'backend/internal/systembackupsecurity', 'backend/internal/systembackupcontract', 'backend/internal/db/migrations', 'contracts/system-backup']) {
    const disk = fs.readdirSync(local(directory), { recursive: true, withFileTypes: true }).filter(item => item.isFile())
      .map(item => path.relative(root, path.join(item.parentPath, item.name)).replaceAll('\\', '/')).filter(name => /\.(go|json|sql|md)$/.test(name)).sort();
    assert.deepEqual(disk, source.files.filter(pin => pin.path.startsWith(directory + '/') && /\.(go|json|sql|md)$/.test(pin.path)).map(pin => pin.path).sort(), 'critical file set differs: ' + directory);
  }
  const text = name => decode(fs.readFileSync(local(name)));
  const migrationPins = source.files.filter(pin => /^backend\/internal\/db\/migrations\/[^/]+\.sql$/.test(pin.path));
  const catalogHash = /ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(text('backend/internal/systembackupcontroller/bootstrap.go'))?.[1];
  assert.match(catalogHash, digest);
  const declared = /return \[\]string\{([\s\S]*?)\}/.exec(text('backend/cmd/server/system_backup_read_drill_history_mysql_test.go'))?.[1];
  assert.ok(declared);
  assert.deepEqual([...declared.matchAll(/"([a-z_]+)"/g)].map(match => match[1]), drillCases, 'probe case list differs');
  const parsed = validateDrillLog(decode(log), { actual, ddlHash: source.files.find(pin => pin.path === 'scripts/system-backup-a-admin-read-probe.sql').sha256,
    catalogHash, migrationCount: migrationPins.length, lastMigration: path.basename(migrationPins.at(-1).path).split('_')[0] });
  return { kind: 'd_drill_http_evidence_review.v1', scope: actual ? 'isolated_mysql_nineteen_synthetic_history_cases' : 'local_preparation_only', ...parsed,
    source_sha256: source.source_sha256, unrelated_source_drift: drift, current_whole_tree_tested: false,
    outer_owner_absence_checked: true, remote_cleanup_independently_queried: false, dependencies_installed: false,
    B_target_or_cleanup_accepted: false, provider_or_human_MFA_accepted: false, production_approved: false,
    full_restore_accepted: false, full_gc_accepted: false,
    artifacts: [sourcePath, resultPath, logPath].map(file => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: sha(fs.readFileSync(file)) })),
    reviewer_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); const file = args.shift(); assert.ok(file, 'source manifest required');
    let actual = true, output;
    while (args.length) {
      const flag = args.shift();
      if (flag === '--local') { assert.equal(actual, true); actual = false; }
      else { assert.equal(flag, '--out'); assert.equal(output, undefined); output = args.shift(); assert.ok(output); }
    }
    const result = reviewDrill(file, { actual });
    if (output) { const destination = local(output); assert.equal(path.dirname(destination), path.join(root, 'docs/evidence')); fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error('DRILL_HTTP_REVIEW_REJECTED: ' + error.message); process.exitCode = 1; }
}
