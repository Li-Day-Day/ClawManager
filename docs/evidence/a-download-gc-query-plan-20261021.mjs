// Produce an exact read-only capture specification; never execute these queries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const previousPath = 'docs/evidence/a-download-gc-query-plan-20261020.json';
const previous = JSON.parse(decode(raw(previousPath)));
assert.equal(previous.queries.length, 8);
const sourcePath = 'backend/internal/systembackupevidence/download_retention_gc_batch.go';
const source = decode(raw(sourcePath));
const definitions = [
  ['batch_schema', 'downloadGCBatchSchemaSQL', [], 'Verify the candidate operation enum in the exact schema; an absent candidate is a rejection, not an empty successful page.'],
  ['batch_worker', 'downloadGCBatchWorkerSQL', ['installation_id', 'original_worker_operation_public_id'], 'Nonlocking RR hint only; validate the exact worker claim/version/original lease/deadline. The collector must reacquire its existing locked prefix.'],
  ['batch_upper', 'downloadGCBatchUpperSQL', ['installation_id'], 'The upper bound is a primary-key scan epoch, not a retention clock. Published indexes do not establish an (installation, operation_type, id) access path.'],
  ['batch_candidates', 'downloadGCBatchCandidatesSQL', ['installation_id', 'after_id', 'original_through_id', 'page_limit_plus_one'], 'page_limit is 1..128; lookahead is at most 129 rows. LIMIT bounds returned rows, not rows examined, latency or query-plan cost. Capture skew across installations and operation types.']
];
const added = definitions.map(([id, name, parameters, concern]) => {
  const match = source.match(new RegExp('const ' + name + ' = `([^`]+)`'));
  assert.ok(match, name); assert.match(match[1], /^SELECT /);
  assert.equal((match[1].match(/\?/g) ?? []).length, parameters.length);
  assert.ok(!/FOR UPDATE|FOR SHARE|INTO OUTFILE|INTO DUMPFILE|;/.test(match[1]));
  return {id, sql: match[1], parameters, source_constant: name, static_index_concern: concern, locking: false};
});
const record = {kind: 'a_gc_extended_query_plan_capture_spec', source_file: sourcePath, source_file_sha256: sha256(raw(sourcePath)),
  previous: previousPath, previous_sha256: sha256(raw(previousPath)), historical_dependency_source_sha256: previous.source_sha256,
  sql_executed: false, actual_plan_verified: false, actual_lock_verified: false,
  instructions: previous.instructions,
  batch_observations: ['Use the same guarded disposable MySQL fixture, exact active account/grants and privileged observer.', 'Capture EXPLAIN FORMAT=JSON and actual SHOW INDEX/SHOW CREATE facts; do not narrow predicates or force an index.', 'Record cursor bounds and result row counts under skew, unrelated installs and concurrent changes. Do not infer bounded scan work from LIMIT.', 'The scan RR transaction must be closed before each candidate opens its fresh full collector transaction; original authorization and expiry must remain unchanged.', 'These four nonlocking hints do not substitute for the original eight dependency lock-wait observations, full policy or complete metadata/DDL-freeze approval.'],
  queries: [...previous.queries, ...added], production_approved: false, dependencies_installed: false};
assert.equal(record.queries.length, 12);
const output = path.join(workspace, 'docs/evidence/a-download-gc-query-plan-20261021.json');
if (process.argv[2] === '--check') assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: 'spec_verified', exact_queries: 12, sql_executed: false, production_approved: false}));
