import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { composeCurrent } from './d-local-current-source-composition-20261026.mjs';
import { loadReviewedOwnerBaseline } from './a-download-owners-actual-review-20261020.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const bytes = p => fs.readFileSync(path.resolve(root, p));
const json = p => JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/, ''));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pin = p => ({ path: p, size: bytes(p).length, sha256: sha(bytes(p)) });
const reportPath = 'docs/evidence/a-owner-final-local-accepted-20261026.json';
const sourcePath = 'docs/evidence/a-owner-final-source-20261026.json';
const eventsPath = 'docs/evidence/a-owner-final-native-20261026.jsonl';
const compositionPath = 'docs/evidence/d-local-current-source-composed-20261026.json';
const out = 'docs/evidence/a2-owner-final-current-reviewed-20261026.json';
try {
  assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3);
  const a = json(reportPath), source = json(sourcePath), composition = composeCurrent();
  assert.deepEqual(composition, json(compositionPath));
  assert.equal(a.status, 'complete_exact_current_local_owner_profile');
  assert.equal(a.source_sha256, '2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0');
  assert.equal(a.tested_owner_source_sha256, '41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16');
  assert.equal(source.source_sha256, a.source_sha256);
  assert.deepEqual(source.files, composition.files);
  assert.deepEqual(a.source, pin(sourcePath));
  assert.deepEqual(a.events, pin(eventsPath));
  for (const p of a.inputs) assert.deepEqual(pin(p.path), p, 'A acceptance input drift: ' + p.path);
  assert.equal(source.origin, 'dependency_matched_review_metadata_from_native_owner_segments_and_current_tagged_drill_repair_not_one_new_native_snapshot');
  assert.equal(a.current_composed_source_set_and_bytes_match, true);
  assert.equal(a.one_new_whole_source_native_run_claimed, false);
  assert.deepEqual(a.owner_baseline, { main: 647, all: 5190 });
  assert.equal(a.old_5138_tests_preserved, 5138);
  assert.equal(a.previous_5148_tests_preserved, 5148);
  assert.equal(a.packaged_seed_checks, 13);
  assert.equal(a.detached_seed_checks, 13);
  assert.equal(a.stages.length, 23);
  const replaced = a.stages.filter(s => s.current_replacement).map(s => s.stage);
  assert.deepEqual(replaced, [8, 15]);
  for (const owner of a.all_test_owners_independently_absent) assert.equal(fs.existsSync(owner), false);
  const selected = loadReviewedOwnerBaseline(bytes(sourcePath));
  assert.equal(selected.baselineSource.source_sha256, source.source_sha256, 'registered baseline did not select current source');
  assert.deepEqual(selected.baselineSource, source);
  const passes = selected.baselineEvents.filter(e => e.Action === 'pass' && e.Test);
  assert.equal(passes.length, 5190);
  assert.equal(passes.filter(e => !e.Test.includes('/')).length, 647);
  assert.ok(!selected.baselineEvents.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)));
  const parserPath = 'docs/evidence/a-download-owners-actual-review-20261020.mjs';
  const parser = bytes(parserPath), prefix = a.parser_dependency_prefix;
  assert.equal(sha(parser.subarray(0, prefix.bytes)), prefix.sha256, 'existing actual-owner parser prefix changed');
  for (const k of ['actual_SQL', 'production_Collect_freeze_linked', 'joint_protocol_approved', 'production_approved', 'whole_worktree_approved', 'dependencies_installed']) assert.equal(a[k], false);
  const result = {
    kind: 'a2_owner_final_current_preparation_review.v1',
    status: 'accepted_current_dependency_matched_owner_preparation_and_baseline_registration',
    current_source_sha256: source.source_sha256,
    tested_owner_source_sha256: a.tested_owner_source_sha256,
    source_files: source.files.length,
    owner_roots: 647, owner_pass_events: 5190,
    prior_5138_and_5148_inventories_preserved: true,
    native_obligations: 23,
    current_tagged_replacement_stages: replaced,
    current_tagged_HTTP_repair_received: true,
    unchanged_ordinary_dependencies_not_retested: true,
    two_original_seed_locations_each: 13,
    original_failure_and_frozen_HTTP_evidence_preserved: true,
    registered_baseline_selects_current_source_and_original_native_events: true,
    original_actual_owner_parser_prefix_unchanged: true,
    all_test_owners_independently_absent: a.all_test_owners_independently_absent,
    one_new_whole_source_native_run_claimed: false,
    Go_or_builds_repeated: false,
    dependencies_installed: false,
    scratch_created: false,
    actual_SQL_accepted: false,
    bootstrap_consumer_contract_completed: false,
    production_approved: false,
    goal_complete: false,
    inputs: [reportPath, sourcePath, eventsPath, compositionPath, 'docs/evidence/a-owner-final-local-review-20261026.mjs', parserPath, 'docs/evidence/d-local-current-source-composition-20261026.mjs'].map(pin),
    reviewer_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  };
  if (process.argv[2] === '--check') assert.deepEqual(json(out), result);
  else fs.writeFileSync(path.resolve(root, out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('A2_OWNER_CURRENT_ACCEPTED source=2099 roots=647 events=5190 current_baseline=registered SQL=no');
} catch (error) { console.error('A2_OWNER_CURRENT_REJECTED: ' + error.message); process.exitCode = 1; }
