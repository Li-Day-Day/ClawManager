// Extract the component's exact SELECTs for future isolated plan/lock capture.
// No network, SQL execution, Go build, dependency install or schema mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const paths = ['backend/internal/systembackupevidence/download_producer_owner.go', 'backend/internal/systembackupevidence/download_retention_gc_producer.go', 'backend/internal/systembackupevidence/download_retention_gc_task.go'];
const inputs = paths.map(p => ({path: p, bytes: raw(p)}));
const [owner, producer, task] = inputs.map(i => decode(i.bytes));
const definitionsBody = owner.match(/func producerDownloadDefinitions\(\) \[\]producerDownloadDefinition \{\n\treturn \[\]producerDownloadDefinition\{([\s\S]*?)\n\t\}\n\}/);
assert.ok(definitionsBody);
const definitions = [...definitionsBody[1].matchAll(/\{"([a-z_]+)", "([a-z0-9_ ]+)", "([a-z_,]+)", ([345]), (\d+)\}/g)].map(m => ({table: m[1], fields: m[2].split(' '), order: m[3], stage: Number(m[4]), limit: Number(m[5])}));
assert.deepEqual(definitions.map(d => d.table), ['system_backup_producer_result_receipts', 'system_backup_producer_runs', 'system_backup_producer_evidence_bindings', 'system_backup_producer_evidence_refs']);
assert.deepEqual(definitions.map(d => d.stage), [3, 4, 4, 5]);
assert.deepEqual(definitions.map(d => d.limit), [98304, 16384, 32768, 8192]);
const builder = owner.slice(owner.indexOf('func producerDownloadSQL('), owner.indexOf('\nfunc (s *SQLTaskDownloadOwners) producerRows('));
assert.ok(builder.includes('columns[n] = "IF(OCTET_LENGTH(record_bytes) BETWEEN 1 AND " + strconv.Itoa(d.limit) + ",record_bytes,NULL)"'));
assert.ok(builder.includes('q := "SELECT " + strings.Join(columns, ",") + " FROM " + d.table + " WHERE evidence_id=? ORDER BY " + d.order + " LIMIT 10001"'));
assert.ok(builder.includes('if locking {\n\t\tq += " FOR UPDATE"'));
function build(d, locking) {
  const fields = d.fields.map(f => f === 'record_bytes' ? `IF(OCTET_LENGTH(record_bytes) BETWEEN 1 AND ${d.limit},record_bytes,NULL)` : f);
  return `SELECT ${fields.join(',')} FROM ${d.table} WHERE evidence_id=? ORDER BY ${d.order} LIMIT 10001${locking ? ' FOR UPDATE' : ''}`;
}
function constant(text, name) {
  const m = text.match(new RegExp('const ' + name + ' = `([^`]+)`'));
  assert.ok(m, name); return m[1];
}
const queries = [
  {id: 'producer_database_identity', sql: constant(task, 'downloadGCTaskDatabaseSQL'), parameters: [], locking: false},
  {id: 'producer_required_tables', sql: constant(producer, 'downloadGCProducerTablesSQL'), parameters: [], locking: false,
    observation: 'Compare exact four BASE TABLE/InnoDB identities with the privileged observer. Complete columns/FKs/indexes/CHECKs/triggers/programs and current grants are separate prerequisites.'},
  {id: 'producer_history_hint', sql: build(definitions[2], false), parameters: ['evidence_public_id'], locking: false,
    observation: 'Initial RR hint selects no mutation authority; compare every original binding with the independently locked L4 record.'},
  ...definitions.map(d => ({id: 'producer_locked_' + d.table, table: d.table, sql: build(d, true), parameters: ['evidence_public_id'], locking: true, prefix_stage: d.stage,
    observation: 'Predicate intentionally covers all scopes for this evidence. Capture actual index choice, rows examined, unrelated-scope impact, and exact requesting/blocking connection IDs. LIMIT 10001 is a result/overflow guard, not a plan-cost or lock-span bound.'}))
];
assert.equal(queries.length, 7);
for (const q of queries) {
  assert.match(q.sql, /^SELECT /); assert.equal((q.sql.match(/\?/g) ?? []).length, q.parameters.length);
  assert.ok(!/;|INTO OUTFILE|INTO DUMPFILE/.test(q.sql));
}
assert.ok(producer.includes('readReceipts(&hint, nil, &count)') && producer.includes('readReceipts(history, run, new(int))'));
assert.ok(producer.includes('definitions[2], scope.Evidence, false'));
for (const i of inputs) assert.equal(sha256(raw(i.path)), sha256(i.bytes), 'source changed during capture');
const previousPath = 'docs/evidence/a-download-gc-query-plan-20261021.json';
const previous = JSON.parse(decode(raw(previousPath))); assert.equal(previous.queries.length, 12);
const record = {kind: 'a_gc_producer_exact_query_capture_spec', source_pins: inputs.map(i => ({path: i.path, size: i.bytes.length, sha256: sha256(i.bytes)})),
  previous: previousPath, previous_sha256: sha256(raw(previousPath)), previous_query_count: 12, additional_query_count: 7, combined_query_count: 19,
  sql_executed: false, actual_plan_verified: false, actual_gc_producer_lock_verified: false, production_approved: false, dependencies_installed: false,
  instructions: previous.instructions,
  transaction_observations: ['Use a guarded disposable fixture and both the actual restricted identity and privileged metadata observer.', 'Keep the existing L0/L1/L2 prefix. Lock receipts at L3, run and historical binding at L4, then references at L5. Record exact index/lock modes and held empty ranges.', 'Receipts are reread with the same L3 predicate after the original L4 owner lock; Recheck must use original locked keys and must not acquire new prefix keys.', 'Validate original manifest, evidence creation, owner-write/observation/retention deadlines, exact object version, complete typed C1 rows and rollback after late changes.', 'Retained producer C1 rows are read only. Complete current worker authority, metadata/DDL freeze, other dependencies, physical reservation and tombstone lifecycle still need their own approval and actual evidence.'],
  queries};
const output = path.join(workspace, 'docs/evidence/a-download-gc-producer-query-plan-20261021.json');
if (process.argv[2] === '--check') assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: 'spec_verified', additional_exact_queries: 7, combined_queries: 19, sql_executed: false}));
