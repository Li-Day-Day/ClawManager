import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = 'docs/evidence/d-resources-review-request-v2-20261022.json';
const packagePath = 'backend/internal/systembackupresources';
const document = 'docs/system-backup-d-resources-revision-v2-20261022.md';
const self = 'docs/evidence/d-resources-review-request-v2-20261022.mjs';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file).toString('utf8').replace(/^\uFEFF/, ''));
function filesUnder(relative) {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'source symlink is unsupported');
    const name = `${relative}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(name) : [name];
  }).sort();
}
const original = json('docs/evidence/d-resources-review-request-20261022.json');
const a = json('docs/evidence/a-resources-normalization-review-20261022.json');
assert.equal(a.status, 'six_table_review_completed_changes_required');
assert.equal(a.tables.length, 6);
assert.ok(a.tables.every(table => table.conclusion === 'changes_required' && table.runtime_approved === false));
const sourcePaths = [...new Set([
  ...original.source_files.map(file => file.path),
  ...a.supplemental_files.map(file => file.path),
  ...filesUnder(packagePath),
  document, self, 'scripts/system-backup-d-resources-rules-validation.ps1',
  'docs/evidence/d-resources-review-request-20261022.json',
  'docs/evidence/a-resources-normalization-review-20261022.json',
  'docs/system-backup-a-resources-normalization-review-20261022.md',
])].sort();
const sourceFiles = sourcePaths.map(file => { const bytes = read(file); return { path: file, size: bytes.length, sha256: sha(bytes) }; });
const sourceDigest = sha(Buffer.from(JSON.stringify(sourceFiles)));
const rules = {
  mapping: { namespaces: ['user','instance','scan_job','skill','skill_scan_result','audit_log','northbound_settings_audit'], reject_duplicate_source: true, reject_merged_target: true, null_actor: 'preserve_sql_null', nonnull_missing: 'reject_batch', target_existence: 'B_C_authenticated_transaction_facts_required' },
  audit_reference: { user: 'user_mapping', instance: 'instance_mapping', system_backup: 'null_only', unknown: 'reject_including_null' },
  audit_id_conflict: 'authenticated_free_target_id_mapping_or_reject_never_overwrite',
  json_body: { null: 'sql_null', nonnull: '"[REDACTED]"' },
  optional_text: { null: 'sql_null', nonnull: '[REDACTED]' },
  egress: { enabled: false, scope_types: ['user','instance'], complete_prefix_and_exact_port: true, link_local: 'reject', target_allowances_and_exclusions: 'B_authenticated_complete_policy_required' },
  northbound: { api_enabled: false, require_explicit_callers: true, source_version: 'historical_only', target_absent: 'B_proven_insert_version_1', target_present: 'locked_observed_positive_signed_bigint_increment_exact_cas_one_row', overflow: 'reject', cpu: 'exact_decimal_4_2_no_float', node_port: 'B_target_fact_no_port_open' },
  scan_config: { proposed_ids: [1], maximum_rows: 1, empty: 'only_C_approved_absence_with_no_jobs_items_reports_and_B_startup_gate', allow_fallback: false, analyzer_and_timeout_policy: 'C_current_version_required' },
  scan_scope: { required: ['scan_scope'], optional: ['asset_id'], scan_scope: ['full','incremental'], asset_id: 'positive_signed_INT_skill_mapping', reject_duplicates_unknown_null_trailing: true, max_bytes: 4096 },
  scan_interrupted_proposal: { job_states: ['queued','running'], item_states: ['pending','running'], parent_target: 'failed_pending_C_review', nonterminal_items_target: 'failed_progress_100_cached_false_authenticated_processing_time', existing_terminal_items: 'validate_and_preserve', completed_items: 'terminal_item_count_including_failures', unknown_states: 'reject', approved: false },
  scan_report: { raw_service_config: 'never_copy', schema: 'C_closed_redacted_historical_schema_required', current_eligibility: false },
  image: { is_enabled: false, logical_key: ['instance_type','runtime_type','runtime_variant'], target_mapping_and_startup_gate: 'B_required' },
};
const objects = original.objects.map(object => ({
  name: object.name, normalizer_id: object.normalizer_id, verifier_id: object.verifier_id,
  required_cross_reviewers: object.required_cross_reviewers,
  revision: 'd.resources.restore.v2', conclusion: 'pending_same_version_review',
  runtime_approved: false,
}));
assert.equal(objects.length, 9);
const result = {
  kind: 'd_resources_normalization_review_request.v2', date: '2026-10-22',
  status: 'revised_proposal_and_offline_helpers_pending_cross_review', policy_version: 'd.resources.restore.v2',
  supersedes_proposal_only: 'docs/evidence/d-resources-review-request-20261022.json',
  a_rules_received: 'a.resources.restore-security.v1', document, source_digest: sourceDigest, source_files: sourceFiles,
  package_files: filesUnder(packagePath), objects, rules,
  supplemental_review_requests: [{ table: 'security_scan_reports', reviewer: 'A', scope: 'embedded_scanner_config_and_free_body_redaction' }],
  remaining_deliveries: ['A_same_version_review','B_four_table_review_and_capture_target_clock_fence_transaction_writer','C_four_table_review_asset_result_capability_and_report_schema','nine_table_candidates_and_field_verifier','actual_SQL_and_startup_gate_validation'],
  review_receipts: [], registry_approval_written: false, full_normalization_implemented: false,
  source_or_target_proof_accepted: false, actual_mysql_executed: false, production_wired: false, messages_sent: false,
};
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} else {
  assert.ok(process.argv.includes('--check'), 'use --write once or --check');
  assert.deepEqual(json(output), result, 'v2 input bytes or package file set changed; preserve the old request and issue a new revision');
}
console.log(`D_RESOURCES_REVISION_V2 objects=9 inputs=${sourceFiles.length} review=pending production=no`);
