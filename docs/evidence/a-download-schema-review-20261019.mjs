import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const target = 'docs/system-backup-d-download-admission-schema-proposal-20261019.sql';
const beforePath = 'docs/evidence/a-download-schema-before-fix-20261019.json';
const bytes = fs.readFileSync(target), sql = bytes.toString('utf8');
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const rows = sql.split(/\r?\n/);
const index = rows.findIndex(line => line.includes("OR (target_type = 'evidence' AND"));
assert.ok(index >= 0, 'evidence target branch present');
const fixed = rows[index], old = before.defective_line[0];
assert.equal((old.match(/'/g) ?? []).length % 2, 1, 'original line has an open SQL literal');
assert.equal((fixed.match(/'/g) ?? []).length % 2, 0, 'corrected line closes SQL literal');
assert.equal(fixed, old.slice(0, -1) + "$')", 'only literal terminator/end anchor changed');
const reconstructed = sql.replace(fixed, old);
const reconstructions = [reconstructed, reconstructed.replace(/\r?\n/g, '\r\n'), reconstructed.replace(/\r\n/g, '\n')];
assert.ok(reconstructions.some(s => hash(s) === before.sha256), 'reconstructs exact original bytes modulo recorded newline normalization');
const unclosedSingleLineLiterals = rows.flatMap((line, i) => {
  if (line.trimStart().startsWith('--')) return [];
  return (line.match(/'/g) ?? []).length % 2 ? [i + 1] : [];
});
assert.deepEqual(unclosedSingleLineLiterals, [], 'closed single-line-literal profile throughout candidate');
const pattern = fixed.match(/REGEXP '([^']+)'/)[1];
const re = new RegExp(pattern);
const valid = 'sev_11111111-2222-4333-8444-555555555555';
assert.ok(re.test(valid));
for (const invalid of [valid + 'x', 'x' + valid, valid.toUpperCase(), valid.slice(0, -1), valid.replace('sev_', 'sbk_')]) assert.ok(!re.test(invalid));
assert.ok(sql.includes('REFERENCES system_backup_evidence(origin_installation_id,id,public_id) ON DELETE RESTRICT'));
assert.ok(sql.includes('FOREIGN KEY (origin_installation_id,operation_id)'));
assert.ok(sql.includes('REFERENCES system_backup_operations(origin_installation_id,id) ON DELETE RESTRICT'));
assert.ok(!/^\s*(?:UPDATE|DELETE|INSERT|GRANT|CREATE\s+TRIGGER)\b/im.test(sql), 'candidate performs no data backfill or privilege activation');
const report = {
  kind: 'a_download_schema_candidate_static_review', recorded_at: new Date().toISOString(),
  path: target, before_receipt: beforePath, before_sha256: before.sha256, after_sha256: hash(bytes),
  corrected_line: index + 1, corrected_text: fixed,
  exact_original_reconstructed: true,
  single_line_literals_closed: true,
  static_ASCII_ID_vectors: 6,
  same_installation_FK_candidates_present: true,
  actual_MySQL: false, full_SQL_parser: false, MySQL_REGEXP_runtime_tested: false,
  numbered_migration_changed: false, formal_schema_approved: false,
  status: 'lexical_defect_fixed_candidate_only_runtime_and_cross_owner_review_pending',
  remaining: ['actual fresh and historical DDL execution including legacy cross-installation rejection',
    'ownership/inventory/schema policy and required A/B/C approvals',
    'current runtime validates exact bytes/hash and original audit/operation/evidence/nonce facts',
    'actual immutable INSERT/SELECT grants, retention/GC and physical capacity',
    'owned evidence installation writer and NULL legacy rows fail closed'],
};
const output = 'docs/evidence/a-download-schema-review-20261019.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, corrected_line: index + 1, before_sha256: before.sha256, after_sha256: report.after_sha256, actual_MySQL: false }));
