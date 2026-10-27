import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewFK, cases } from './d-resources-writer-fk-actual-review-20261026.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const bytes = p => fs.readFileSync(path.resolve(root, p));
const json = p => JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/, ''));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const acceptedPath = 'docs/evidence/d-resources-writer-fk-actual-accepted-20261026.json';
const receipt = 'docs/evidence/d-resources-mysql-20261026-084808-2a9906c3.json';
const transcript = 'docs/evidence/d-resources-writer-fk-operator-20261026-2a9906c3.txt';
const supplement = 'docs/evidence/d-resources-local-recheck-c5fe0b025c054ef4b239bc8cc6c71f81.json';
const output = path.join(root, 'docs/evidence/a2-writer-fk-actual-reviewed-20261026.json');

try {
  assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3, '--write or --check required');
  const replay = reviewFK(receipt, transcript, supplement);
  const saved = json(acceptedPath);
  const invariant = ({ current_all_frozen_files_match, unrelated_source_drift, ...rest }) => rest;
  assert.deepEqual(invariant(replay), invariant(saved), 'D acceptance invariant evidence no longer reproduces');
  assert.equal(replay.remote_cases, 10);
  assert.equal(replay.declared_job_foreign_keys_accepted, 2);
  assert.equal(replay.local_pass_events, 843);
  assert.equal(saved.current_all_frozen_files_match, true);
  assert.equal(replay.current_all_frozen_files_match, false);
  assert.deepEqual(replay.unrelated_source_drift, ['backend/cmd/server/system_backup_read_drill_history_mysql_test.go']);
  for (const p of replay.artifacts) assert.equal(hash(bytes(p.path)), p.sha256, 'artifact drift: ' + p.path);
  for (const field of ['generic_FK_UNIQUE_accepted', 'B_C_rules_accepted', 'physical_capacity_accepted', 'full_restore_accepted', 'production_approved', 'A_signoff_claimed', 'remote_cleanup_independently_queried']) assert.equal(replay[field], false, field);
  const source = json(json(receipt).source);
  const ownerSourcePath = 'docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af-source.json';
  const ownerSource = json(ownerSourcePath);
  const ordered = files => [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.deepEqual(ordered(source.files), ordered(ownerSource.files), 'FK and owner source pins differ');
  const probePaths = [
    'backend/internal/systembackupresources/restore_write_fk_mysql_test.go',
    'backend/internal/systembackupresources/restore_write_mysql_test.go',
    'backend/internal/systembackupresources/restore_readback_mysql_test.go',
  ];
  const result = {
    kind: 'a2_writer_fk_actual_evidence_review.v1',
    result: 'LIMITED_EVIDENCE_REVIEW_WITH_CURRENT_SOURCE_DRIFT',
    scope: 'two_declared_job_foreign_keys_only_synthetic_proofs',
    d_acceptance: { path: acceptedPath, sha256: hash(bytes(acceptedPath)) },
    d_receiver_invariant_evidence_replay_matches: true,
    initial_full_saved_acceptance_replay_rejected: true,
    current_all_frozen_files_match: false,
    current_source_drift: replay.unrelated_source_drift.map(p => ({
      path: p,
      frozen_sha256: source.files.find(pin => pin.path === p).sha256,
      current_sha256: hash(bytes(p)),
      current_size: bytes(p).length,
    })),
    independently_rehashed_artifacts: replay.artifacts.length,
    remote_cases: cases,
    mysql_version: replay.mysql_version,
    declared_job_foreign_keys: 2,
    local_pass_events: 843,
    original_damaged_log_preserved: true,
    shared_local_recheck_inputs: 122,
    frozen_source_files: source.files.length,
    fk_source_sha256: source.source_sha256,
    owner_source_sha256: ownerSource.source_sha256,
    source_pin_sets_byte_identical: true,
    source_digest_formats_distinct: true,
    static_review: {
      files: probePaths.map(p => ({ path: p, sha256: hash(bytes(p)) })),
      canonical_and_owned_two_fk_definitions_compared: true,
      foreign_key_checks_verified_in_work_transactions: true,
      independent_select_only_readback: true,
      actual_writer_transaction_entry_used: true,
      actual_mysql_error_1452_and_1062_cases: true,
      synthetic_authorization_only: true,
    },
    cleanup_recorded: true,
    local_owner_independently_absent: !fs.existsSync(json(receipt).owner),
    remote_cleanup_independently_queried: false,
    remote_execution_by_this_review: false,
    Go_or_builds_run_by_this_review: false,
    dependencies_installed: false,
    scratch_or_build_outputs_created: false,
    formal_A1_signoff_claimed: false,
    generic_FK_UNIQUE_accepted: false,
    B_C_rules_accepted: false,
    physical_capacity_accepted: false,
    full_restore_accepted: false,
    current_owner_gate_accepted: false,
    production_approved: false,
    reviewer_sha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  };
  assert.equal(result.local_owner_independently_absent, true);
  if (process.argv[2] === '--check') assert.deepEqual(json(output), result);
  else fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('A2_WRITER_FK_LIMITED_REVIEW cases=10 declared_fks=2 artifacts=' + replay.artifacts.length + ' current_source_drift=1 remote_rerun=no');
} catch (error) {
  console.error('A2_WRITER_FK_REJECTED: ' + error.message);
  process.exitCode = 1;
}
