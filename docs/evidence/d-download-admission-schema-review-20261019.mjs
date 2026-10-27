import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPaths = [
  'backend/internal/db/migrations/065_add_system_backup_control_metadata_core.sql',
  'backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql',
  'backend/internal/db/migrations/075_add_system_backup_strong_auth_nonces.sql',
  'docs/system-backup-d-download-admission-schema-proposal-20261019.sql',
];
const raw = inputPaths.map(p => fs.readFileSync(path.join(root, p)));
const [, original, , proposed] = raw.map(b => b.toString('utf8'));
const sql = proposed.replace(/^\s*--.*$/gm, '');
const compact = s => s.replace(/\s+/g, ' ').trim();
const checks = [];
const check = (name, fn) => { fn(); checks.push({ name, pass: true }); };
const enumValues = (text, column) => [...text.match(new RegExp(`${column} ENUM\\(([^)]+)\\)`))[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

check('operation_enum_preserves_old_values_and_ordinals', () => {
  assert.deepEqual(enumValues(proposed, 'operation_type'), [...enumValues(original, 'operation_type'), 'evidence_download_admission']);
});
check('target_enum_preserves_old_values_and_ordinals', () => {
  assert.deepEqual(enumValues(proposed, 'target_type'), [...enumValues(original, 'target_type'), 'evidence']);
});
check('original_target_check_preserved_with_one_evidence_branch', () => {
  const old = original.match(/CONSTRAINT chk_sb_operation_target_id CHECK \(([\s\S]+?)\n  \),/)[1];
  const next = proposed.match(/CONSTRAINT chk_sb_operation_target_id CHECK \(([\s\S]+?)\n  \),/)[1];
  const addition = "OR (target_type = 'evidence' AND target_public_id REGEXP '^sev_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')";
  assert.equal(compact(next), compact(old + ' ' + addition));
  assert.deepEqual([...sql.matchAll(/DROP CHECK (\w+)/g)].map(m => m[1]), ['chk_sb_operation_target_id']);
});
check('legacy_evidence_ownership_has_no_default_or_backfill', () => {
  assert.match(sql, /ADD COLUMN origin_installation_id VARCHAR\(128\) CHARACTER SET ascii COLLATE ascii_bin NULL,/);
  assert.doesNotMatch(sql, /(?:^|;)\s*(?:UPDATE|INSERT|DELETE|TRUNCATE|GRANT|TRIGGER)\b/i);
});
check('operation_target_fk_binds_installation_numeric_and_public_ids', () => {
  assert.match(compact(sql), /FOREIGN KEY \(origin_installation_id,download_evidence_id,target_public_id\) REFERENCES system_backup_evidence\(origin_installation_id,id,public_id\) ON DELETE RESTRICT/);
});
check('nonce_operation_fk_binds_installation', () => {
  assert.match(compact(sql), /FOREIGN KEY \(origin_installation_id,operation_id\) REFERENCES system_backup_operations\(origin_installation_id,id\) ON DELETE RESTRICT/);
});
check('receipt_fk_binds_exact_operation_and_evidence', () => {
  assert.match(compact(sql), /FOREIGN KEY \(origin_installation_id,operation_id,operation_public_id,evidence_id\) REFERENCES system_backup_operations\(origin_installation_id,id,public_id,download_evidence_id\) ON DELETE RESTRICT/);
  assert.match(compact(sql), /FOREIGN KEY \(origin_installation_id,evidence_id,evidence_public_id\) REFERENCES system_backup_evidence\(origin_installation_id,id,public_id\) ON DELETE RESTRICT/);
});
check('receipt_keeps_actual_intent_audit_fk', () => {
  assert.match(compact(sql), /FOREIGN KEY \(intent_audit_id\) REFERENCES audit_logs\(id\) ON DELETE RESTRICT/);
});
check('operation_admission_is_synchronous_success_only', () => {
  for (const clause of ["status = 'succeeded'", "retryable = FALSE", "failure_category = 'none'", 'http_status IS NOT NULL AND http_status = 200', 'result_resource_public_id IS NULL AND result_config_version IS NULL', 'started_at IS NOT NULL AND finished_at IS NOT NULL', 'started_at = created_at AND finished_at = created_at AND updated_at = created_at']) {
    assert.ok(compact(sql).includes(clause), clause);
  }
  const emptyHash = crypto.createHash('sha256').update('[]').digest('hex');
  assert.ok(sql.includes(`external_action_public_ids_sha256 = '${emptyHash}'`));
});
check('private_public_bytes_have_independent_bounds_and_digests', () => {
  for (const kind of ['receipt', 'operation']) {
    assert.ok(sql.includes(`${kind}_size_bytes BETWEEN 2 AND 8192`));
    assert.ok(sql.includes(`${kind}_size_bytes=OCTET_LENGTH(${kind}_canonical_json)`));
    assert.ok(sql.includes(`${kind}_sha256 REGEXP '^[0-9a-f]{64}$'`));
  }
});
check('retention_and_deadline_order_are_explicit', () => {
  assert.ok(compact(sql).includes('admitted_at < deadline_at AND deadline_at <= claim_expires_at AND retain_until > claim_expires_at'));
});
check('only_four_candidate_ddl_statements_no_official_migration_written', () => {
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length, 4);
  assert.deepEqual(statements.map(s => s.match(/^(ALTER TABLE|CREATE TABLE) (\w+)/).slice(1)), [
    ['ALTER TABLE', 'system_backup_evidence'], ['ALTER TABLE', 'system_backup_operations'],
    ['ALTER TABLE', 'system_backup_strong_auth_nonces'], ['CREATE TABLE', 'system_backup_download_admission_receipts'],
  ]);
});

process.stdout.write(JSON.stringify({ kind: 'd_download_admission_schema_static_review',
  files: inputPaths.map((p, i) => ({ path: p, bytes: raw[i].length, sha256: crypto.createHash('sha256').update(raw[i]).digest('hex') })),
  checks, actual_mysql: false, schema_installed: false, formal_approval: false,
  limitations: 'Text preservation and shape checks only; not SQL execution, CHECK/FK/grant enforcement, retention/GC or physical-capacity proof.'
}, null, 2) + '\n');
