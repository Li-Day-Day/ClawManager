import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeIndexReview } from './system-backup-d-admin-read-index-report.mjs';

import { tables, hash, fixture, text, baselineFixture } from './system-backup-d-index-report-fixture.mjs';

test('version two requires same-stream baselines and uses only DDL-overlapping pairs for ratios', () => {
  const result = summarizeIndexReview(text(baselineFixture()));
  assert.equal(result.production_approved, false);
  assert.deepEqual(result.ddl_overlapping_pair_ratio_to_no_ddl, { before: {p50:2.5,p95:3}, after: {p50:2.5,p95:3} });
  assert.equal(result.ddl_writer_baselines.before.write_pairs, 30);
  assert.equal(result.ddl.insert_delete_pair_us.p50, 1);
});

test('zero clock-rounded baseline latency has no invented finite or infinite ratio', () => {
  const f = baselineFixture();
  f.records.find(row => row.kind === 'ddl_writer_baseline').insert_delete_pair_us = {p50:0,p95:0};
  const result = summarizeIndexReview(text(f));
  assert.deepEqual(result.ddl_overlapping_pair_ratio_to_no_ddl.before, {p50:null,p95:null});
});

for (const [name, mutate] of [
  ['missing before baseline', f => f.records.splice(f.records.findIndex(r => r.kind === 'ddl_writer_baseline' && r.phase === 'before'), 1)],
  ['missing after baseline', f => f.records.splice(f.records.findIndex(r => r.kind === 'ddl_writer_baseline' && r.phase === 'after'), 1)],
  ['duplicate writer baseline', f => f.records.push(f.records.find(r => r.kind === 'ddl_writer_baseline'))],
  ['incomplete writer samples', f => f.records.find(r => r.kind === 'ddl_writer_baseline').write_pairs = 29],
  ['writer baseline used DDL', f => f.records.find(r => r.kind === 'ddl_writer_baseline').ddl_in_progress = true],
  ['writer baseline transaction differs', f => f.records.find(r => r.kind === 'ddl_writer_baseline').autocommit = false],
  ['writer table distribution missing', f => delete f.records.find(r => r.kind === 'ddl_writer_baseline').table_write_pairs.system_backups],
  ['writer table distribution skewed', f => { const r = f.records.find(r => r.kind === 'ddl_writer_baseline'); r.table_write_pairs.system_backups++; r.table_write_pairs.system_restore_drills--; }],
  ['invalid writer baseline percentiles', f => f.records.find(r => r.kind === 'ddl_writer_baseline').insert_delete_pair_us.p95 = -1],
  ['writer duration below its pair P95', f => f.records.find(r => r.kind === 'ddl_writer_baseline').elapsed_us = 1],
  ['DDL overlap table sum', f => f.records.find(r => r.kind === 'ddl').overlapping_table_write_pairs.system_backups++],
  ['DDL overlap above table writes', f => { const r = f.records.find(r => r.kind === 'ddl'); r.overlapping_table_write_pairs.system_backups=3; r.overlapping_table_write_pairs.system_restore_drills=1; }],
  ['DDL overlap latency missing', f => delete f.records.find(r => r.kind === 'ddl').overlapping_insert_delete_pair_us],
  ['unbounded DDL writer', f => f.records.find(r => r.kind === 'ddl').writer_loop_limit=10001],
  ['version downgrade with writer data', f => delete f.records[0].measurement_version],
  ['version downgrade after baseline removal', f => { delete f.records[0].measurement_version; f.records=f.records.filter(r => r.kind !== 'ddl_writer_baseline'); }],
  ['baseline records out of DDL order', f => { const before=f.records.find(r => r.kind === 'ddl_writer_baseline' && r.phase === 'before'); f.records.splice(f.records.indexOf(before),1); f.records.push(before); }],
  ['unknown measurement version', f => f.records[0].measurement_version=3],
]) test(`rejects version-two ${name}`, () => {
  const f = baselineFixture(); mutate(f);
  assert.throws(() => summarizeIndexReview(text(f)));
});

test('complete comparison retains plans and declares production unapproved', () => {
  const result = summarizeIndexReview(text(fixture()));
  assert.equal(result.isolated_measurement_complete, true);
  assert.equal(result.production_approved, false);
  assert.equal(result.tables.system_backups.queries.length, 39);
  assert.equal(result.tables.system_backup_operations.queries.length, 15);
  assert.equal(result.tables.system_backups.queries[0].before_plan, 'Index range scan');
});

test('exception guidance mentioning cleanup does not claim a pending identity', () => {
  const f = fixture();
  f.markers.push('PS C:\\repo> TerminatingError():“MySQL validation failed; retain any CLEANUP_PENDING identity”');
  assert.equal(summarizeIndexReview(text(f)).production_approved, false);
});

test('cleaned HTTP failure with cleanup guidance still rejects missing successful wrapper exit', () => {
  const f = baselineFixture();
  f.markers = f.markers.filter(line => line !== 'D_ADMIN_READ_INDEX_REMOTE_EXIT=0');
  f.markers.push('--- FAIL: TestDAdminReadLiveHTTPMySQL (0.02s)', 'command terminated with exit code 1',
    'PS C:\\repo> TerminatingError():“MySQL validation failed; retain any CLEANUP_PENDING identity”');
  assert.throws(() => summarizeIndexReview(text(f)), /Final wrapper exit=0 missing/);
});

test('remote probe failure cannot be masked by a contradictory wrapper exit=0 marker', () => {
  const f = baselineFixture();
  f.markers.push('--- FAIL: TestDAdminReadLiveHTTPMySQL (0.02s)');
  assert.throws(() => summarizeIndexReview(text(f)), /Remote admin read probe failed/);
});

for (const marker of [
  '    page_index_mysql_test.go:69: CLEANUP_PENDING D admin index run-owned database=didx_' + 'a'.repeat(24),
  '    read_scope_mysql_test.go:74: CLEANUP_PENDING admin-read server identity',
  'WARNING: CLEANUP_PENDING remote scratch /tmp/clawmanager-a-evidence-test',
  '警告: CLEANUP_PENDING remote scratch /tmp/clawmanager-a-evidence-test',
]) test(`rejects actual cleanup marker ${marker.trim()}`, () => {
  const f = fixture();
  f.markers.push(marker);
  assert.throws(() => summarizeIndexReview(text(f)), /Cleanup remains pending/);
});

for (const [name, mutate] of [
  ['partial query output', f => f.records.splice(f.records.findIndex(r => r.kind === 'status_page' && r.phase === 'after'), 1)],
  ['duplicate phase', f => f.records.push(f.records.find(r => r.kind === 'page'))],
  ['different returned page', f => f.records.find(r => r.kind === 'page' && r.phase === 'after').result_sha256 = 'b'.repeat(64)],
  ['changed projection', f => f.records.find(r => r.kind === 'page' && r.phase === 'after').sql = 'SELECT public_id FROM system_backups'],
  ['missing write samples', f => f.records.splice(f.records.findIndex(r => r.kind === 'write' && r.phase === 'after'), 1)],
  ['namespace cleanup mismatch', f => f.markers = f.markers.map(m => m.replace('uid=11111111', 'uid=99999999'))],
  ['only printed exit command', f => f.markers[f.markers.length - 1] = "Write-Output 'D_ADMIN_READ_INDEX_REMOTE_EXIT=0'"],
  ['cleanup pending', f => f.markers.push('CLEANUP_PENDING namespace=x')],
  ['DDL hash mismatch', f => f.records[0].ddl_sha256 = 'b'.repeat(64)],
  ['missing table distribution', f => f.records.splice(f.records.findIndex(r => r.kind === 'distribution'), 1)],
  ['invalid percentiles', f => f.records.find(r => r.kind === 'page').warm_cache_us.p95 = -1],
  ['missing migration replay', f => f.markers.shift()],
  ['DDL without overlapping writer', f => f.records[1].overlapping_write_pairs = 0],
  ['different local probe hash', f => f.markers = f.markers.map(m => m.startsWith('LOCAL_PASS d-admin-read-index') ? m.replace(hash,'b'.repeat(64)) : m)],
  ['different migration binary hash', f => f.markers = f.markers.map(m => m.startsWith('PASS pinned-migration') ? m.replace(hash,'b'.repeat(64)) : m)],
]) test(`rejects ${name}`, () => {
  const f = fixture(); mutate(f);
  assert.throws(() => summarizeIndexReview(text(f)));
});
