import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { capacityTemplate, renderCapacityDeployment, jsonBytes, root } from './system-backup-d-capacity-deployment.mjs';
import { capacityTimeNS, parseCapacityJSON, parseCapacityReport, reviewCapacityReport, reviewCapacityMaterials } from './system-backup-a-capacity-material-review.mjs';

function fixture() {
  const input = { ...capacityTemplate(), namespace_uid: 'namespace-test', context: 'synthetic-context',
    image: `example.invalid/test@sha256:${'a'.repeat(64)}`, mysql_pod: 'mysql-test', mysql_pod_uid: 'pod-test',
    mysql_container: 'mysql', mysql_node: 'test-node', mysql_data_pvc: 'mysql-data',
    server_uuid: '11111111-2222-3333-4444-555555555555', collector_db_user: 'capacity_reader',
    collector_uid: 999, credentials_secret: 'test-dsn', report_pvc: 'test-report' };
  const source = renderCapacityDeployment(input).source;
  const report = { server_uuid: input.server_uuid, database: input.database,
    observed_at: '2026-10-21T07:00:00.123456789Z', allocated_bytes: 123456, available_bytes: 9876543210 };
  const identity = { server_uuid: input.server_uuid, database: input.database,
    data_directory: `${input.data_directory}/`, now: '2026-10-21T07:00:01.123456789Z' };
  return { input, source, report, identity };
}
const raw = f => ({ inputRaw: jsonBytes(f.input), sourceRaw: jsonBytes(f.source), reportRaw: jsonBytes(f.report), identityRaw: jsonBytes(f.identity) });

test('existing public formats bind exact config bytes, full current table set and original SQL time', () => {
  const f = fixture(), result = reviewCapacityMaterials(raw(f));
  assert.equal(result.status, 'PASS_OFFLINE_CAPACITY_MATERIALS');
  assert.equal(result.age_nanoseconds, '1000000000');
  assert.ok(f.source.tables.includes('system_backups'));
  for (const key of ['cluster_contacted', 'database_contacted', 'configuration_activated', 'live_freshness_verified',
    'physical_storage_verified', 'grants_verified', 'collection_duration_verified']) assert.equal(result[key], false);
});

test('same-count table replacement, omitted base backup table, unknown source and changed raw bytes reject', () => {
  for (const mutate of [
    f => f.source.tables[f.source.tables.indexOf('system_backups')] = 'system_backup_unknown',
    f => f.source.tables.splice(f.source.tables.indexOf('system_backups'), 1),
    f => f.source.password = 'DO-NOT-ECHO',
  ]) { const f = fixture(); mutate(f); assert.throws(() => reviewCapacityMaterials(raw(f))); }
  const bytes = raw(fixture()); bytes.sourceRaw = JSON.stringify(JSON.parse(bytes.sourceRaw));
  assert.throws(() => reviewCapacityMaterials(bytes));
});

test('stale migration pin and mismatched database, UUID or datadir reject', () => {
  for (const mutate of [
    f => f.input.migration_catalog_sha256 = 'b'.repeat(64),
    f => f.report.database = 'other', f => f.report.server_uuid = 'other',
    f => f.identity.database = 'other', f => f.identity.server_uuid = 'other',
    f => f.identity.data_directory = '/wrong/',
  ]) { const f = fixture(); mutate(f); assert.throws(() => reviewCapacityMaterials(raw(f))); }
});

test('consumer age is inclusive at five seconds, rejects one nanosecond stale or future', () => {
  const f = fixture();
  for (const [now, valid] of [
    ['2026-10-21T07:00:00.123456789Z', true],
    ['2026-10-21T07:00:05.123456789Z', true],
    ['2026-10-21T07:00:05.123456790Z', false],
    ['2026-10-21T07:00:00.123456788Z', false],
  ]) {
    f.identity.now = now;
    if (valid) reviewCapacityReport(jsonBytes(f.report), f.identity, f.input);
    else assert.throws(() => reviewCapacityReport(jsonBytes(f.report), f.identity, f.input));
  }
});

test('invalid calendar dates, rollover time, non-UTC, zero time and excess precision reject', () => {
  for (const value of ['2026-02-30T07:00:00Z', '2026-10-21T24:00:00Z', '2026-10-21T07:00:00+00:00',
    '2026-10-21T07:00:00.1234567890Z', '0001-01-01T00:00:00Z', '0000-10-21T07:00:00Z', 'PRIVATE']) {
    assert.throws(() => capacityTimeNS(value));
  }
  assert.equal(capacityTimeNS('2026-10-21T07:00:00Z'), capacityTimeNS('2026-10-21T07:00:00.000000000Z'));
});

test('int64 byte counts retain exact values above JS safe integer and reject overflow/noninteger forms', () => {
  const f = fixture(), encoded = jsonBytes(f.report);
  for (const key of ['allocated_bytes', 'available_bytes']) {
    const replace = value => encoded.replace(new RegExp(`("${key}": )\\d+`), `$1${value}`);
    assert.equal(parseCapacityReport(replace('9223372036854775807'), f.input)[key], 9223372036854775807n);
    assert.equal(parseCapacityReport(replace('9007199254740993'), f.input)[key], 9007199254740993n);
    for (const value of ['9223372036854775808', '-1', '-0', '1.0', '1e3', 'null', 'true', '"123"']) {
      assert.throws(() => parseCapacityReport(replace(value), f.input));
    }
  }
});

test('duplicate and escaped duplicate JSON keys reject without interpreting string contents as keys', () => {
  for (const value of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"a":[{"x":1,"x":2}]}']) {
    assert.throws(() => parseCapacityJSON(value, 4096));
  }
  assert.deepEqual(parseCapacityJSON('{"a":[{"x":1},{"x":2}],"b":"a \\"x\\": text"}', 4096),
    { a: [{ x: 1 }, { x: 2 }], b: 'a "x": text' });
});

test('missing/unknown report fields and oversized public JSON reject', () => {
  for (const change of [r => delete r.observed_at, r => r.secret = 'DO-NOT-ECHO', r => r.available_bytes = null]) {
    const f = fixture(); change(f.report); assert.throws(() => parseCapacityReport(jsonBytes(f.report), f.input));
  }
  assert.throws(() => parseCapacityReport(' '.repeat(4097), fixture().input));
});

test('actual CLI accepts exact materials, rejects unsafe input without echo, and cleans all owned files', () => {
  const owned = mkdtempSync(join(root, '.tmp-a-capacity-material-review-'));
  try {
    const files = raw(fixture()), paths = {};
    for (const [key, value] of Object.entries(files)) { paths[key] = join(owned, `${key}.json`); writeFileSync(paths[key], value); }
    const script = resolve(root, 'scripts/system-backup-a-capacity-material-review.mjs');
    const args = ['--input', paths.inputRaw, '--source', paths.sourceRaw, '--report', paths.reportRaw, '--sql-identity', paths.identityRaw];
    const invoke = params => spawnSync(process.execPath, [script, ...params], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    const passing = invoke(args);
    assert.equal(passing.status, 0, passing.stderr);
    assert.equal(JSON.parse(passing.stdout).status, 'PASS_OFFLINE_CAPACITY_MATERIALS');
    writeFileSync(paths.reportRaw, '{"secret":"DO-NOT-ECHO-PRIVATE"}');
    const failing = invoke(args);
    assert.equal(failing.status, 1);
    assert.equal(failing.stdout, '');
    assert.ok(!failing.stderr.includes('DO-NOT-ECHO-PRIVATE'));
    assert.equal(invoke([...args.slice(0, 6), '--report', paths.reportRaw]).status, 1);
    writeFileSync(paths.reportRaw, Buffer.from([0xff, 0xfe]));
    assert.equal(invoke(args).status, 1);
    writeFileSync(paths.reportRaw, ' '.repeat(4097));
    assert.equal(invoke(args).status, 1);
  } finally {
    assert.equal(dirname(resolve(owned)), resolve(root));
    assert.ok(basename(owned).startsWith('.tmp-a-capacity-material-review-'));
    rmSync(owned, { recursive: true, force: true });
  }
});
