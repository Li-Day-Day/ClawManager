import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildIndexVariantDDL, normalizeIndexDDL } from './system-backup-d-index-groups.mjs';

const tables = ['system_backups', 'system_restore_drills', 'system_backup_preflights',
  'system_backup_artifact_verifications', 'system_backup_operations'];
const installations = ['installation_index_own', 'installation_index_foreign', 'installation_index_sparse'];
const hashPattern = /^[a-f0-9]{64}$/;
const requireEvidence = (condition, reason) => { if (!condition) throw new Error(reason); };

// Reports measurements only after full run identity, coverage and cleanup have
// been checked. A successful report never constitutes production approval.
export function summarizeIndexReview(transcript) {
  const records = [];
  for (const line of transcript.split(/\r?\n/)) {
    const marker = line.indexOf('D_ADMIN_INDEX_REVIEW ');
    if (marker < 0) continue;
    records.push(JSON.parse(line.slice(marker + 'D_ADMIN_INDEX_REVIEW '.length)));
  }
  const scopes = records.filter(row => row.kind === 'scope');
  requireEvidence(scopes.length === 1, 'Exactly one measurement scope is required');
  const scope = scopes[0];
  requireEvidence(scope.measurement_version === undefined || scope.measurement_version === 2, 'Unsupported measurement version');
  const withWriterBaselines = scope.measurement_version === 2;
  if (scope.index_variant !== undefined || scope.applied_ddl !== undefined || scope.applied_ddl_sha256 !== undefined) {
    requireEvidence(withWriterBaselines && ['all', 'page', 'status'].includes(scope.index_variant)
      && typeof scope.applied_ddl === 'string' && hashPattern.test(scope.applied_ddl_sha256), 'Invalid index variant metadata');
    const expected = buildIndexVariantDDL(scope.index_variant);
    requireEvidence(normalizeIndexDDL(scope.applied_ddl) === normalizeIndexDDL(expected)
      && createHash('sha256').update(scope.applied_ddl).digest('hex') === scope.applied_ddl_sha256,
      'Applied index variant DDL differs from reviewed subset');
    if (scope.index_variant === 'all') requireEvidence(scope.applied_ddl_sha256 === scope.ddl_sha256, 'Full variant did not apply pinned full DDL');
    else requireEvidence(scope.applied_ddl === expected, 'Subset DDL is not canonical');
  }
  requireEvidence(/^sbk-mig-[0-9]{12}-[a-f0-9]{4}$/.test(scope.run)
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(scope.namespace_uid)
    && /^didx_[a-f0-9]{24}$/.test(scope.database)
    && scope.rows_per_table === 12000 && hashPattern.test(scope.ddl_sha256)
    && scope.synthetic === true && scope.foreign_keys_cloned === false
    && scope.authorization_http_measured === false, 'Invalid isolated measurement scope');
  // Match emitted cleanup markers, including Go test logs and PowerShell
  // warnings. Exception guidance may mention CLEANUP_PENDING without emitting
  // a pending identity; the independent final-exit gate still rejects that run.
  requireEvidence(!/^[ \t]*(?:(?:WARNING|警告):[ \t]*)?(?:\S+\.go:\d+:[ \t]*)?CLEANUP_PENDING\b/m.test(transcript), 'Cleanup remains pending');
  requireEvidence(/^D_ADMIN_READ_INDEX_REMOTE_EXIT=0\r?$/m.test(transcript), 'Final wrapper exit=0 missing');
  requireEvidence(!/^[ \t]*--- FAIL: (?:TestDAdminRead(?:IndexCandidate|FullSchema|LiveHTTP)MySQL|TestAAdminReadAuthorityMySQL)(?:\/|\s|\()/m.test(transcript), 'Remote admin read probe failed');
  requireEvidence(/^--- PASS: TestDAdminReadIndexCandidateMySQL \(/m.test(transcript), 'MySQL probe PASS missing');
  requireEvidence(transcript.includes(`CLEANED D admin index run-owned database ${scope.database}`), 'Measurement database cleanup missing');
  requireEvidence(transcript.includes(`CLEANED namespace=${scope.run} uid=${scope.namespace_uid}`), 'Matching namespace cleanup missing');
  requireEvidence(transcript.includes('CLEANED remote-registration-scratch=yes')
    && transcript.includes('CLEANED local-registration-build-cache=True'), 'Scratch/cache cleanup missing');
  const pass = transcript.match(/^PASS d-admin-read-index-candidate-mysql binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64}) synthetic=yes production_approval=no\r?$/m);
  requireEvidence(pass && pass[2] === scope.ddl_sha256, 'Pinned index probe/DDL receipt missing or mismatched');
  const localProbe = transcript.match(/^LOCAL_PASS d-admin-read-index-probe-compiled=yes binary_sha256=([a-f0-9]{64}) real_mysql=not_run production_migration=no\r?$/m);
  requireEvidence(localProbe && localProbe[1] === pass[1], 'Local and remote index probe hashes differ');
  const localMigration = transcript.match(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})\r?$/m);
  const migration = transcript.match(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})\r?$/m);
  requireEvidence(localMigration && migration && localMigration[1] === migration[1], 'Migration runner hashes differ or are missing');
  requireEvidence(/^PASS fresh-migration-replay\b/m.test(transcript)
    && /^PASS pinned-migration-runner\b/m.test(transcript), 'Fresh migration evidence missing');
  for (const table of tables) requireEvidence(hashPattern.test(scope.source_schema_sha256?.[table]), `Source schema hash missing: ${table}`);

  const validPercentiles = value => value && ['p50', 'p95'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0) && value.p95 >= value.p50;
  const validTablePairs = (counts, total) => counts && Object.keys(counts).length === tables.length
    && tables.every(table => Number.isSafeInteger(counts[table]) && counts[table] >= 0)
    && Object.values(counts).reduce((sum, n) => sum + n, 0) === total;
  const ddl = records.filter(row => row.kind === 'ddl');
  requireEvidence(ddl.length === 1 && Number.isSafeInteger(ddl[0].elapsed_us) && ddl[0].elapsed_us >= 0
    && ddl[0].concurrent_writes_measured === true && Number.isSafeInteger(ddl[0].write_pairs) && ddl[0].write_pairs > 0
    && Number.isSafeInteger(ddl[0].overlapping_write_pairs) && ddl[0].overlapping_write_pairs > 0
    && ddl[0].overlapping_write_pairs <= ddl[0].write_pairs
    && validPercentiles(ddl[0].insert_delete_pair_us), 'DDL concurrent measurement missing');
  if (withWriterBaselines) requireEvidence(ddl[0].writer_loop_limit === 10000 && ddl[0].write_pairs <= 10000
    && validTablePairs(ddl[0].table_write_pairs, ddl[0].write_pairs)
    && validTablePairs(ddl[0].overlapping_table_write_pairs, ddl[0].overlapping_write_pairs)
    && tables.every(table => ddl[0].overlapping_table_write_pairs[table] <= ddl[0].table_write_pairs[table])
    && validPercentiles(ddl[0].overlapping_insert_delete_pair_us), 'DDL overlapping pair measurements incomplete');
  else requireEvidence(ddl[0].table_write_pairs === undefined && ddl[0].overlapping_table_write_pairs === undefined
    && ddl[0].overlapping_insert_delete_pair_us === undefined, 'Version-two DDL data cannot be downgraded to a legacy scope');
  const writerBaselines = {};
  const byTable = Object.fromEntries(tables.map(table => [table, { queries: [], storage: {}, writes: {}, distribution: {} }]));
  const queries = new Map();
  for (const row of records) {
    if (row.kind === 'scope' || row.kind === 'ddl') continue;
    if (row.kind === 'ddl_writer_baseline') {
      requireEvidence(withWriterBaselines && ['before', 'after'].includes(row.phase) && !writerBaselines[row.phase]
        && row.write_pairs === 30 && row.autocommit === true && row.ddl_in_progress === false
        && Number.isSafeInteger(row.elapsed_us) && row.elapsed_us >= 0 && validPercentiles(row.insert_delete_pair_us)
        && row.elapsed_us >= row.insert_delete_pair_us.p95
        && validTablePairs(row.table_write_pairs, 30) && tables.every(table => row.table_write_pairs[table] === 6),
        'Invalid or duplicate no-DDL writer baseline');
      writerBaselines[row.phase] = row;
      continue;
    }
    requireEvidence(tables.includes(row.table) && ['before', 'after'].includes(row.phase), 'Unknown table or measurement phase');
    const table = byTable[row.table];
    if (['cutoff', 'page', 'status_page'].includes(row.kind)) {
      requireEvidence(row.samples === 30 && validPercentiles(row.warm_cache_us)
        && typeof row.sql === 'string' && row.sql.startsWith('SELECT ')
        && typeof row.explain_analyze === 'string' && row.explain_analyze.length > 0
        && hashPattern.test(row.result_sha256) && Number.isSafeInteger(row.result_rows) && row.result_rows >= 0,
        'Invalid query measurement');
      const key = JSON.stringify([row.table, row.kind, row.args]);
      const pair = queries.get(key) ?? {};
      requireEvidence(!pair[row.phase], 'Duplicate query phase');
      pair[row.phase] = row;
      queries.set(key, pair);
    } else if (row.kind === 'storage') {
      requireEvidence(!table.storage[row.phase] && Number.isSafeInteger(row.secondary_index_allocated_bytes)
        && row.secondary_index_allocated_bytes >= 0, 'Invalid or duplicate index storage measurement');
      table.storage[row.phase] = row;
    } else if (row.kind === 'write') {
      requireEvidence(!table.writes[row.phase] && row.samples === 30 && row.autocommit === true
        && validPercentiles(row.insert_us) && validPercentiles(row.status_update_us), 'Invalid or duplicate write measurement');
      table.writes[row.phase] = row;
    } else if (row.kind === 'distribution') {
      requireEvidence(installations.includes(row.installation) && ['pending', 'failed'].includes(row.status)
        && Number.isSafeInteger(row.rows) && row.rows > 0, 'Invalid distribution measurement');
      const key = `${row.installation}:${row.status}`;
      table.distribution[row.phase] ??= {};
      requireEvidence(table.distribution[row.phase][key] === undefined, 'Duplicate distribution row');
      table.distribution[row.phase][key] = row.rows;
    } else throw new Error(`Unknown measurement kind: ${row.kind}`);
  }
  for (const table of tables) {
    for (const installation of installations) {
      const expected = [['cutoff', [installation]]];
      for (const upper of [12001, 6000]) for (const limit of [51, 501]) {
        expected.push(['page', [installation, upper, limit]]);
        if (table !== 'system_backup_operations') for (const status of ['pending', 'failed']) {
          expected.push(['status_page', [installation, upper, status, limit]]);
        }
      }
      for (const [kind, args] of expected) {
        const key = JSON.stringify([table, kind, args]);
        const pair = queries.get(key);
        requireEvidence(pair?.before && pair?.after, `Query coverage missing: ${key}`);
        requireEvidence(pair.before.sql === pair.after.sql && pair.before.result_sha256 === pair.after.result_sha256
          && pair.before.result_rows === pair.after.result_rows, 'Index phases returned different pages');
        byTable[table].queries.push({ kind, args, sql: pair.before.sql, result_rows: pair.before.result_rows,
          before_us: pair.before.warm_cache_us, after_us: pair.after.warm_cache_us,
          before_plan: pair.before.explain_analyze, after_plan: pair.after.explain_analyze });
        queries.delete(key);
      }
    }
    const result = byTable[table];
    for (const phase of ['before', 'after']) {
      requireEvidence(result.storage[phase] && result.writes[phase]
        && Object.keys(result.distribution[phase] ?? {}).length === 6
        && Object.values(result.distribution[phase]).reduce((a, b) => a + b, 0) === 12000, `Table evidence incomplete: ${table}/${phase}`);
    }
    requireEvidence(JSON.stringify(result.distribution.before) === JSON.stringify(result.distribution.after), 'Distribution changed across index phases');
  }
  requireEvidence(queries.size === 0, 'Unexpected query measurement');
  const result = { scope, binary_sha256: pass[1], migration_binary_sha256: migration[1], migration_catalog_sha256: migration[2], isolated_measurement_complete: true, production_approved: false,
    limitations: ['synthetic distribution', 'warm cache', 'authorization and HTTP excluded', 'foreign keys not cloned', 'DDL uses one synthetic insert/delete writer'],
    ddl: ddl[0], tables: byTable };
  if (withWriterBaselines) {
    requireEvidence(writerBaselines.before && writerBaselines.after, 'Both no-DDL writer baselines are required');
    requireEvidence(records.indexOf(writerBaselines.before) < records.indexOf(ddl[0])
      && records.indexOf(ddl[0]) < records.indexOf(writerBaselines.after), 'Writer baselines must bracket the measured DDL');
    const ratios = baseline => Object.fromEntries(['p50', 'p95'].map(key => [key,
      baseline.insert_delete_pair_us[key] === 0 ? null : ddl[0].overlapping_insert_delete_pair_us[key] / baseline.insert_delete_pair_us[key]]));
    result.ddl_writer_baselines = writerBaselines;
    result.ddl_overlapping_pair_ratio_to_no_ddl = { before: ratios(writerBaselines.before), after: ratios(writerBaselines.after) };
    result.limitations.push('No-DDL baselines and DDL are sequential on a synthetic host; ratios are observations, not causal blocking estimates');
    result.limitations.push('No-DDL baselines are balanced; the DDL-overlapping pairs may have a different per-table mix');
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/system-backup-d-admin-read-index-report.mjs <full-transcript>');
  process.stdout.write(JSON.stringify(summarizeIndexReview(readFileSync(process.argv[2], 'utf8')), null, 2) + '\n');
}
