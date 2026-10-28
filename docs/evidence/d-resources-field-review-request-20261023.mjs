import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const self = 'docs/evidence/d-resources-field-review-request-20261023.mjs';
const output = 'docs/evidence/d-resources-field-review-request-20261023.json';
const document = 'docs/system-backup-d-resources-field-handoff-20261023.md';
const source = 'backend/internal/systembackupresources/restore_fields.go';
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file).toString('utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const previous = json('docs/evidence/d-resources-review-request-v2-20261022.json');
const fieldText = read(source).toString('utf8');
const columns = Object.fromEntries([...fieldText.matchAll(/^\s*"([a-z_]+)":\s*"([a-z_ ]+)",$/gm)].map(match => [match[1], match[2].split(' ')]));
assert.equal(Object.keys(columns).length, 9, 'field comparator must cover nine tables');
// A narrow check of the actual CREATE definitions used by these migrations,
// not a general SQL parser or a claim about a live target schema.
const ddlFiles = {
  audit_logs: '001_init_schema.sql', egress_private_exceptions: '044_add_egress_private_exceptions.sql',
  northbound_admin_settings: '057_add_northbound_admin_settings.sql', northbound_settings_audit: '057_add_northbound_admin_settings.sql',
  security_scan_configs: '063_add_security_scan_tables.sql', security_scan_jobs: '063_add_security_scan_tables.sql',
  security_scan_job_items: '063_add_security_scan_tables.sql', security_scan_reports: '063_add_security_scan_tables.sql',
  system_image_settings: '064_reconcile_system_image_settings_schema.sql',
};
for (const [table, filename] of Object.entries(ddlFiles)) {
  const sql = read(`backend/internal/db/migrations/${filename}`).toString('utf8');
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\) ENGINE`));
  assert.ok(match, `missing CREATE for ${table}`);
  const ddlColumns = [...match[1].matchAll(/^\s+([a-z_]+)\s+(?:TINYINT|INT|BIGINT|VARCHAR|LONGTEXT|TEXT|JSON|BOOLEAN|DECIMAL|DATETIME|TIMESTAMP|ENUM)\b/gm)].map(entry => entry[1]);
  assert.deepEqual([...columns[table]].sort(), ddlColumns.sort(), `migration column drift: ${table}`);
  assert.equal(new Set(columns[table]).size, columns[table].length);
}
function filesUnder(relative) {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'source symlink is unsupported');
    const name = `${relative}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(name) : [name];
  }).sort();
}
const shared = {
  A: ['same_version_security_review_including_report_body'],
  B: ['all_nine_tables_including_empty_capture_target_proof', 'typed_mapping_and_target_occupancy', 'clock_fence_single_transaction_writer', 'persistent_startup_gate', 'write_credential_destruction_and_independent_select_only_reader'],
  C: ['asset_result_version_proof', 'current_analyzer_timeout_capability', 'parent_child_terminal_rules', 'closed_redacted_report_schema'],
  D: ['complete_normalized_candidates_after_domain_review', 'authenticated_SQL_reader_and_comparator_integration', 'actual_restore_transaction_and_startup_tests', 'freeze_adapter_and_complete_GC', 'six_scope_end_to_end_acceptance'],
};
const tables = previous.objects.map(object => ({
  table: object.name, columns: columns[object.name],
  required_reviewers: [...new Set([...object.required_cross_reviewers, ...previous.supplemental_review_requests.filter(item => item.table === object.name).map(item => item.reviewer)])].sort(),
  review_receipts: [], review_status: 'pending_same_version_review',
  source_target_proof: 'not_delivered', normalized_candidate: 'not_implemented',
  field_comparator: 'offline_candidate_pending_review', SQL_reader: 'not_implemented', production_wired: false,
}));
const paths = [...new Set([
  ...previous.source_files.map(file => file.path), ...filesUnder('backend/internal/systembackupresources'),
  ...filesUnder('backend/internal/db/migrations'),
  'docs/evidence/d-resources-review-request-v2-20261022.json', self, document,
])].sort();
const inputs = paths.map(file => { const bytes = read(file); return { path: file, size: bytes.length, sha256: sha(bytes) }; });
const result = {
  kind: 'd_resources_field_review_request.v1', date: '2026-10-23', policy_version: previous.policy_version,
  previous_request: 'docs/evidence/d-resources-review-request-v2-20261022.json',
  status: 'offline_field_comparator_pending_review_and_production_inputs',
  document, tables, shared_missing_deliveries: shared,
  source_files: inputs, source_digest: sha(Buffer.from(JSON.stringify(inputs))),
  full_normalization_implemented: false, runtime_approved: false, registry_approval_written: false,
  actual_mysql_executed: false, production_wired: false, messages_sent: false,
};
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} else {
  assert.ok(process.argv.includes('--check'), 'use --write once or --check');
  assert.deepEqual(json(output), result, 'current inputs changed; preserve request and issue a new revision');
}
console.log(`D_RESOURCES_FIELDS tables=${tables.length} columns=${tables.reduce((sum, table) => sum + table.columns.length, 0)} inputs=${inputs.length} review=pending production=no`);
// Integrity success must never be mistaken for restore admission.
if (process.argv.includes('--strict')) { console.error('NOT_READY: domain reviews, proof, candidates, SQL reader and production acceptance are missing'); process.exitCode = 1; }
