export const tables = ['system_backups', 'system_restore_drills', 'system_backup_preflights', 'system_backup_artifact_verifications', 'system_backup_operations'];
const installs = ['installation_index_own', 'installation_index_foreign', 'installation_index_sparse'];
export const hash = 'a'.repeat(64);
export function fixture() {
  const scope = { kind: 'scope', run: 'sbk-mig-261014000000-abcd', namespace_uid: '11111111-2222-3333-4444-555555555555',
    database: 'didx_' + 'a'.repeat(24), rows_per_table: 12000, ddl_sha256: hash, synthetic: true,
    foreign_keys_cloned: false, authorization_http_measured: false, source_schema_sha256: Object.fromEntries(tables.map(name => [name, hash])) };
  const records = [scope, { kind: 'ddl', elapsed_us: 100, concurrent_writes_measured: true, write_pairs: 10, overlapping_write_pairs: 8, insert_delete_pair_us: {p50:1,p95:2} }];
  for (const table of tables) for (const phase of ['before', 'after']) {
    records.push({ kind: 'storage', table, phase, secondary_index_allocated_bytes: 4096 },
      { kind: 'write', table, phase, samples: 30, autocommit: true, insert_us: { p50: 1, p95: 2 }, status_update_us: { p50: 2, p95: 3 } });
    for (const [i, installation] of installs.entries()) {
      const total = [2400, 8400, 1200][i];
      for (const [status, rows] of [['pending', total - 100], ['failed', 100]]) records.push({ kind: 'distribution', table, phase, installation, status, rows });
      const queries = [['cutoff', [installation]]];
      for (const upper of [12001, 6000]) for (const limit of [51, 501]) {
        queries.push(['page', [installation, upper, limit]]);
        if (table !== 'system_backup_operations') for (const status of ['pending', 'failed']) queries.push(['status_page', [installation, upper, status, limit]]);
      }
      for (const [kind, args] of queries) records.push({ kind, table, phase, args, sql: `SELECT id FROM ${table}`, samples: 30,
        warm_cache_us: { p50: 10, p95: 20 }, explain_analyze: 'Index range scan', result_sha256: hash, result_rows: 1 });
    }
  }
  const markers = ['PASS fresh-migration-replay', `PASS pinned-migration-runner binary_sha256=${hash} catalog_sha256=${hash}`,
    `LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=${hash}`,
    `LOCAL_PASS d-admin-read-index-probe-compiled=yes binary_sha256=${hash} real_mysql=not_run production_migration=no`,
    `PASS d-admin-read-index-candidate-mysql binary_sha256=${hash} ddl_sha256=${hash} synthetic=yes production_approval=no`,
    '--- PASS: TestDAdminReadIndexCandidateMySQL (1.00s)', `CLEANED D admin index run-owned database ${scope.database}`,
    `CLEANED namespace=${scope.run} uid=${scope.namespace_uid}`, 'CLEANED remote-registration-scratch=yes',
    'CLEANED local-registration-build-cache=True', 'D_ADMIN_READ_INDEX_REMOTE_EXIT=0'];
  return { records, markers };
}
export const text = ({ records, markers }) => [...records.map(row => `    page_index_mysql_test.go:1: D_ADMIN_INDEX_REVIEW ${JSON.stringify(row)}`), ...markers].join('\r\n');

export function baselineFixture() {
  const f = fixture();
  f.records[0].measurement_version = 2;
  Object.assign(f.records[1], { writer_loop_limit: 10000,
    table_write_pairs: Object.fromEntries(tables.map(name => [name, 2])),
    overlapping_table_write_pairs: Object.fromEntries(tables.map((name, i) => [name, i < 3 ? 2 : 1])),
    overlapping_insert_delete_pair_us: { p50: 5, p95: 12 } });
  for (const phase of ['before', 'after']) f.records.splice(phase === 'before' ? 1 : 3, 0, { kind: 'ddl_writer_baseline', phase, write_pairs: 30,
    table_write_pairs: Object.fromEntries(tables.map(name => [name, 6])), autocommit: true, ddl_in_progress: false,
    elapsed_us: 1000, insert_delete_pair_us: { p50: 2, p95: 4 } });
  return f;
}

