// Classify the finished D fixture failure and its relationship to A's new round.
// The owner round remains live; this never labels its unfinished tests terminal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const stem = 'docs/evidence/d-download-gc-producer-20261021-r2';
const sourceBytes = raw(stem + '-source.json'), source = JSON.parse(decode(sourceBytes));
const eventBytes = raw(stem + '.jsonl'), events = decode(eventBytes).trim().split('\n').map(JSON.parse);
const nativeBytes = raw(stem + '-native.txt'), native = decode(nativeBytes);
const ownerSourcePath = 'docs/evidence/a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json';
const ownerSourceBytes = raw(ownerSourcePath), ownerSource = JSON.parse(decode(ownerSourceBytes));
for (const s of [source, ownerSource]) {
  assert.equal(s.stable_copy_verified, true); assert.equal(s.dependencies_installed, false);
  assert.equal(new Set(s.files.map(f => f.path)).size, s.files.length);
  assert.equal(sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), s.source_sha256);
}
const ordinary = s => s.files.filter(f => /^(backend|contracts)\//.test(f.path)).map(f => `${f.path}\0${f.size}\0${f.sha256}`).sort();
assert.deepEqual(ordinary(source), ordinary(ownerSource));
const failed = events.filter(e => e.Test && e.Action === 'fail').map(e => e.Test);
const expectedLeaves = ['TestDownloadRetentionGCProducerReceiptFacts/null_version', 'TestDownloadRetentionGCProducerReceiptFacts/no_version', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_eligible_run', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference'];
assert.deepEqual(failed.slice().sort(), [...expectedLeaves, 'TestDownloadRetentionGCProducerReceiptFacts', 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback'].sort());
assert.equal(events.filter(e => !e.Test && e.Action === 'fail' && e.Package === 'clawreef/internal/systembackupevidence').length, 1);
const observations = expectedLeaves.map(name => ({test: name, output: events.filter(e => e.Test === name && e.Action === 'output' && /^    .*\.go:\d+:/.test(e.Output)).map(e => e.Output.trim())}));
assert.ok(observations.slice(0, 2).every(o => o.output.some(s => s.includes("invalid character 'o' looking for beginning of value"))));
assert.ok(observations.slice(2).every(o => o.output.some(s => /internal_error \[\]$/.test(s))));
for (const marker of ['NATIVE_EXIT focused_packages=1', 'default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes', 'FROZEN_POSTCHECK pass=yes', 'CLEANED snapshot=True', 'd_admission_native_exit=1', 'PowerShell transcript end']) assert.ok(native.includes(marker));
const frozen = native.match(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/m);
assert.ok(frozen); assert.equal(Number(frozen[1]), source.files.length); assert.equal(frozen[2], source.source_sha256);
const owned = frozen[3].trim(); assert.equal(path.dirname(path.resolve(owned)).toLowerCase(), workspace.toLowerCase());
assert.match(path.basename(owned), /^\.tmp-d-index-cache-[a-f0-9]{32}$/); assert.equal(fs.existsSync(owned), false);
assert.ok(!/NATIVE_PROBE stage=|^RUN namespace=/m.test(native));
assert.equal(raw(stem + '-stderr.txt').length, 0);
const record = {kind: 'a_independent_d_gc_producer_r2_failed_gate_review', recorded_at: new Date().toISOString(), status: 'failed_not_accepted',
  source: stem + '-source.json', source_manifest_sha256: sha256(sourceBytes), source_sha256: source.source_sha256, source_files: source.files.length,
  events_sha256: sha256(eventBytes), native_sha256: sha256(nativeBytes), failed_test_names: failed, failed_leaf_count: 5, failure_observations: observations,
  native_exit: 1, default_vet: true, frozen_postchecks: true, source_owner_independently_absent: owned,
  caller_external_cache_cleanup: 'D-owned caller cache remains its callers responsibility; not removed or claimed absent by A',
  owner_round_source: ownerSourcePath, owner_round_source_manifest_sha256: sha256(ownerSourceBytes), owner_round_source_sha256: ownerSource.source_sha256,
  exact_same_backend_and_contract_inputs: true, differing_logical_hashes_due_to_manifest_order: source.source_sha256 !== ownerSource.source_sha256,
  owner_round_terminal_status_verified: false, owner_round_actual_sql_verified: false,
  next_action: 'Preserve the active owner round and its original gate. These ordinary test failures require a repaired source and complete reviewed ordinary-package baseline; do not skip tests or accept the unfinished owner round.',
  actual_sql_cases_executed_by_a: 0, production_approved: false, dependencies_installed: false, tests_or_builds_repeated: false, test_build_artifacts_created: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-download-gc-producer-r2-failure-review-20261021.mjs'))};
const output = path.join(workspace, 'docs/evidence/a-download-gc-producer-r2-failure-reviewed-20261021.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);}
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, failed_leaves: 5, same_owner_ordinary_inputs: true, owner_round_terminal_status_verified: false, actual_sql_cases_executed_by_a: 0}));
