import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';
import { validateOwnerCounterexample } from './a-owner-finalizer-native-20261026.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = p => fs.readFileSync(path.resolve(root, p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pin = p => ({ path: path.relative(root, path.resolve(root, p)).replaceAll('\\', '/'), sha256: sha(read(p)) });
const requestPath = 'docs/evidence/d-gc-finalizer-review-request-20261026.json';
const nativePath = 'docs/evidence/d-gc-finalizer-native-frozen-reviewed-20261026.json';
const sourcePath = 'docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af-source.json';
const primaryPath = 'docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af.json';
const supplementPath = 'docs/evidence/d-local-closeout-1c44af3217e3438ebbc383d231be3b25.json';
const overlayPath = 'docs/evidence/d-gc-finalizer-counterexamples-1c44af3217e3438ebbc383d231be3b25.json';
const output = 'docs/evidence/a2-gc-finalizer-f4-reviewed-20261026.json';
try {
  assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3);
  const request = json(requestPath), native = json(nativePath), source = json(sourcePath);
  assert.equal(request.source_sha256, '41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16');
  assert.equal(source.source_sha256, request.source_sha256);
  assert.equal(native.source_sha256, request.source_sha256);
  assert.equal(native.status, 'complete_exact_frozen_native_scope_current_tagged_drill_delta_pending');
  assert.equal(native.stage_map.length, 23);
  assert.equal(request.native_acceptance.sha256, sha(read(nativePath)));
  for (const p of request.inputs) assert.equal(pin(p.path).sha256, p.sha256, 'request input drift: ' + p.path);
  for (const p of native.inputs) assert.equal(pin(p.path).sha256, p.sha256, 'native evidence drift: ' + p.path);
  const codePaths = ['download_retention_gc.go', 'download_retention_gc_finalize.go', 'download_retention_gc_freeze.go', 'download_retention_gc_freeze_work.go', 'download_retention_gc_freeze_work_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
  codePaths.push('backend/internal/systembackupevidence/download_admission_audit.go');
  for (const p of codePaths) assert.equal(pin(p).sha256, source.files.find(f => f.path === p).sha256, 'F4 source drift');
  const primary = json(primaryPath), supplement = json(supplementPath);
  assert.equal(supplement.error, null);
  assert.equal(supplement.frozen_postcheck, true);
  for (const r of [primary, supplement]) {
    assert.equal(r.owner_removed, true);
    assert.equal(fs.existsSync(r.owner), false);
  }
  const packageStep = primary.steps[1];
  assert.equal(packageStep.exit_code, 0);
  assert.equal(sha(read(packageStep.log)), packageStep.sha256);
  const names = validateGoEvents(read(packageStep.log).toString('utf8'), 'clawreef/internal/systembackupevidence');
  const prefix = 'TestDownloadGCFinalizerProtectedCandidate/';
  const cases = ['commit', 'clock_advance', 'clock_backwards', 'clock_intermediate_rollback', 'until_equality'];
  for (const c of cases) assert.ok(names.includes(prefix + c), 'missing full-package F4 case: ' + c);
  const overlay = json(overlayPath).records.find(r => r.name === 'earlier_clock_floor');
  const original = read(codePaths[0]);
  assert.equal(sha(original), overlay.original_sha256);
  const before = '\tif now, err = s.clock(ctx, tx, now, until); err != nil {';
  const after = '\tif _, err = s.clock(ctx, tx, now, until); err != nil {';
  const text = original.toString('utf8').replaceAll('\r\n', '\n');
  assert.equal(text.split(before).length, 2);
  const replacement = Buffer.from(text.replace(before, () => after));
  assert.deepEqual(Buffer.from(overlay.replacement_bytes_base64, 'base64'), replacement);
  assert.equal(sha(replacement), overlay.replacement_sha256);
  const fail = supplement.steps[12];
  assert.equal(fail.expected_failure_test, prefix + 'clock_intermediate_rollback');
  assert.equal(sha(read(fail.log)), fail.sha256);
  const counter = validateOwnerCounterexample(read(fail.log), fail.expected_failure_test, fail.exit_code);
  const result = {
    kind: 'a2_gc_finalizer_f4_review.v1',
    status: 'accepted_exact_frozen_private_candidate_F4_clock_boundary',
    source_sha256: source.source_sha256,
    source_files: source.files.length,
    request: pin(requestPath), native_acceptance: pin(nativePath),
    reviewed_requirements: ['F4', 'A-GC-FINALIZER-01'],
    current_capture_keeps_last_successful_work_SQL_sample: true,
    original_until_not_renewed: true,
    final_clock_after_callbacks_and_independent_checks: true,
    test_advances_last_work_clock_by_microseconds: 2,
    test_then_rewinds_after_ticket_by_microseconds: 1,
    strict_T0_less_than_T2_less_than_T1_verified_in_model: true,
    full_package_pass_events: names.length,
    full_package_clock_cases_passed: cases.map(c => prefix + c),
    intentional_single_regression_counterexample: counter,
    historical_intermediate_source_claimed: false,
    rollback_checks_cover_original_rows_audits_nonce_tombstone_capacity: true,
    sole_model_connection_transaction_commit_and_release_checked: true,
    original_physical_sample_replacement_rejected: true,
    current_whole_tree_accepted: false,
    current_tagged_drill_delta_pending: true,
    A_GC_WORK_01_production_composition_closed: false,
    actual_MySQL_or_real_grants_accepted: false,
    production_approved: false,
    Go_or_builds_repeated: false,
    dependencies_installed: false,
    scratch_or_build_outputs_created: false,
    owners_independently_absent: [primary.owner, supplement.owner],
    inputs: [sourcePath, primaryPath, supplementPath, overlayPath, packageStep.log, fail.log, ...codePaths, 'docs/evidence/a-owner-finalizer-native-20261026.mjs', 'docs/evidence/d-resources-mysql-actual-review-20261023.mjs'].map(pin),
    reviewer_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  };
  if (process.argv[2] === '--check') assert.deepEqual(json(output), result);
  else fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('A2_FINALIZER_F4_ACCEPTED frozen=41b8 clock_cases=5 single_regression_assertion=yes current_whole_tree=no');
} catch (error) { console.error('A2_FINALIZER_F4_REJECTED: ' + error.message); process.exitCode = 1; }
