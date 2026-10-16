import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { summarizeIndexReview } from './system-backup-d-admin-read-index-report.mjs';
import { indexGroupPlan } from './system-backup-d-index-groups.mjs';

const check = (ok, reason) => { if (!ok) throw new Error(reason); };
const hash = text => createHash('sha256').update(text).digest('hex');
const median = values => { const a = [...values].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

export function summarizeIndexGroupRun(text, { round, variant }) {
  check([1, 2].includes(round) && ['page', 'status', 'all'].includes(variant), 'Invalid grouped run selection');
  const begin = [...text.matchAll(new RegExp(`^D_INDEX_GROUP_BEGIN round=${round} variant=${variant}\\r?$`, 'gm'))];
  const end = [...text.matchAll(new RegExp(`^D_INDEX_GROUP_END round=${round} variant=${variant} exit=0\\r?$`, 'gm'))];
  check(begin.length === 1 && end.length === 1 && begin[0].index < text.indexOf('D_ADMIN_INDEX_REVIEW ')
    && end[0].index > text.indexOf('D_ADMIN_READ_INDEX_REMOTE_EXIT=0'), 'Grouped order or completion marker missing');
  const report = summarizeIndexReview(text);
  check(report.scope.measurement_version === 2 && report.scope.index_variant === variant, 'Grouped scope variant mismatch');
  for (const name of ['TestAAdminReadAuthorityMySQL', 'TestDAdminReadFullSchemaMySQL', 'TestDAdminReadLiveHTTPMySQL',
    'TestDAdminReadFullSchemaMySQL/task_execution_scoped_attempts_and_progress',
    'TestDAdminReadFullSchemaMySQL/overview_control_complete_counts_and_installation_isolation',
    'TestDAdminReadFullSchemaMySQL/overview_current_promotion_binding_and_availability_loss']) {
    const prefix = '--- PASS: ' + name + ' (';
    const passes = text.split(/\r?\n/).filter(line => { const value = line.trim(); return value.startsWith(prefix) && /^\d+(?:\.\d+)?s\)$/.test(value.slice(prefix.length)); });
    check(passes.length === 1, 'Grouped A/D/HTTP assertion missing or duplicated: ' + name);
  }
  const localA = text.match(/^LOCAL_PASS a-admin-read-unit-tests=.*binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})\r?$/m);
  const remoteA = text.match(/^PASS a-admin-read-mysql binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})\r?$/m);
  const localHTTP = text.match(/^LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=([a-f0-9]{64}) real_mysql=not_run\r?$/m);
  const remoteHTTP = text.match(/^PASS d-admin-read-live-http-mysql binary_sha256=([a-f0-9]{64})\r?$/m);
  check(localA && remoteA && localA[1] === remoteA[1] && localA[2] === remoteA[2]
    && localHTTP && remoteHTTP && localHTTP[1] === remoteHTTP[1], 'Grouped A/HTTP pin mismatch');
  const snapshots=[...text.matchAll(/^D_INDEX_GROUP_SOURCE_SHA256=([a-f0-9]{64})\r?$/gm)];
  check(snapshots.length<=1, 'Grouped source snapshot marker duplicated');
  return { round, variant, transcript_sha256: hash(text), authority_binary_sha256: remoteA[1], authority_ddl_sha256: remoteA[2], http_binary_sha256: remoteHTTP[1],
    ...(snapshots.length?{source_snapshot_sha256:snapshots[0][1]}:{}), report };
}

// Six complete, independently cleaned runs; two reverse-order rounds. Ratios
// remain per-run observations. No synthetic data is promoted to production.
export function summarizeIndexGroups(transcripts) {
  check(transcripts.length === indexGroupPlan.length, 'Six complete grouped transcripts are required');
  const reports = transcripts.map((text, i) => summarizeIndexGroupRun(text, indexGroupPlan[i]));
  for (const key of ['run', 'namespace_uid', 'database']) check(new Set(reports.map(x => x.report.scope[key])).size === 6, 'Grouped run identity reused: ' + key);
  const first = reports[0];
  if(reports.some(x=>x.source_snapshot_sha256)) check(reports.every(x=>x.source_snapshot_sha256 && x.source_snapshot_sha256===first.source_snapshot_sha256),'Grouped source snapshot drift or missing marker');
  for (const entry of reports) {
    for (const key of ['binary_sha256', 'migration_binary_sha256', 'migration_catalog_sha256']) check(entry.report[key] === first.report[key], 'Grouped binary/catalog drift: ' + key);
    for (const key of ['authority_binary_sha256', 'authority_ddl_sha256', 'http_binary_sha256']) check(entry[key] === first[key], 'Grouped A/HTTP binary drift');
    check(entry.report.scope.ddl_sha256 === first.report.scope.ddl_sha256 && entry.report.scope.mysql === first.report.scope.mysql, 'Grouped DDL/MySQL drift');
    for (const [table, data] of Object.entries(entry.report.tables)) {
      check(entry.report.scope.source_schema_sha256[table] === first.report.scope.source_schema_sha256[table], 'Grouped source schema drift');
      check(JSON.stringify(data.distribution) === JSON.stringify(first.report.tables[table].distribution), 'Grouped distribution drift');
      const original = first.report.tables[table].queries;
      check(data.queries.every((q, n) => q.kind === original[n].kind && q.sql === original[n].sql
        && JSON.stringify(q.args) === JSON.stringify(original[n].args) && q.result_rows === original[n].result_rows), 'Grouped query coverage drift');
    }
  }
  const comparisons = Object.fromEntries(['page', 'status', 'all'].map(variant => [variant, reports.filter(x => x.variant === variant).map(entry => ({
    round: entry.round, run: entry.report.scope.run, ddl_us: entry.report.ddl.elapsed_us,
    ddl_writer_ratios: entry.report.ddl_overlapping_pair_ratio_to_no_ddl,
    tables: Object.fromEntries(Object.entries(entry.report.tables).map(([table, data]) => [table, {
      index_bytes_added: data.storage.after.secondary_index_allocated_bytes - data.storage.before.secondary_index_allocated_bytes,
      queries: Object.fromEntries(['cutoff', 'page', 'status_page'].map(kind => {
        const q = data.queries.filter(x => x.kind === kind);
        return [kind, { pairs: q.length, median_pair_ratio: q.length ? Object.fromEntries(['p50', 'p95'].map(p => [p, q.some(x => x.before_us[p] === 0) ? null : median(q.map(x => x.after_us[p] / x.before_us[p]))])) : null }];
      })), writes: data.writes,
    }])),
  }))]));
  return { kind: 'd_index_group_comparison', version: 1, complete: true, production_approved: false, comparisons, runs: reports,
    limitations: ['Synthetic 12000-row distribution; FK not cloned; warm cache', 'Separate run-owned MySQL instances and reversed rounds reduce order bias but do not remove host variation',
      'Result hashes compared within each run; dynamic timestamp columns prevent cross-run byte equivalence', 'Status-only does not alter operations; its measurements are a control',
      'No representative production workload, explicit budget or migration approval established'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--run') {
    const [, , , round, variant, input] = process.argv;
    check(process.argv.length === 6 && input, 'Usage: --run <round> <variant> <transcript>');
    summarizeIndexGroupRun(readFileSync(input, 'utf8'), { round: Number(round), variant });
    process.stdout.write('PASS grouped-index-run complete=yes production_approval=no\n');
  } else {
  const [out, ...inputs] = process.argv.slice(2);
  check(out && inputs.length === 6, 'Usage: node scripts/system-backup-d-index-group-report.mjs <new-report.json> <six-transcripts-in-plan-order>');
  check(!existsSync(out), 'Refusing to overwrite grouped report');
  const result = summarizeIndexGroups(inputs.map(path => readFileSync(path, 'utf8')));
  result.inputs = inputs;
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write('PASS grouped-index-report runs=6 production_approval=no\n');
  }
}
