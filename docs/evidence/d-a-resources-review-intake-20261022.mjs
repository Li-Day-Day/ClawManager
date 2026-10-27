import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file).toString('utf8').replace(/^\uFEFF/, ''));
const pin = file => { const bytes = read(file); return { path: file, size: bytes.length, sha256: sha(bytes) }; };
const receiptPath = 'docs/evidence/a-resources-normalization-review-20261022.json';
const capsulePath = 'docs/evidence/a-resources-normalization-source-capsule-20261022.json';
const proposalPath = 'docs/evidence/d-resources-review-request-20261022.json';
const documentPath = 'docs/system-backup-d-a-resources-review-intake-20261022.md';
const a = json(receiptPath), capsule = json(capsulePath), request = json(proposalPath);
assert.equal(sha(read(capsulePath)), '236d6d506287ad8acc87fe683da5df4367b8d2615de0e6ad1f00cfe40d43cdec');
assert.deepEqual(pin(proposalPath), a.request);
assert.deepEqual(pin(request.document.path), a.proposal);
assert.equal(a.proposal_source_digest, request.source_digest);
assert.equal(a.status, 'six_table_review_completed_changes_required');
assert.equal(a.policy_version, 'a.resources.restore-security.v1');
assert.equal(a.tables.length, 6);
assert.deepEqual(a.source_files, request.source_files);
assert.equal(capsule.files.length, 31);
const frozen = new Map();
for (const file of capsule.files) {
  const bytes = Buffer.from(file.bytes_base64, 'base64');
  assert.equal(bytes.length, file.size); assert.equal(sha(bytes), file.sha256);
  assert.equal(frozen.has(file.path), false); frozen.set(file.path, file);
}
for (const file of [...a.source_files, ...a.supplemental_files, a.proposal, a.decision]) {
  const saved = frozen.get(file.path);
  assert.ok(saved); assert.equal(saved.sha256, file.sha256); assert.equal(saved.size, file.size);
}
assert.deepEqual(pin(a.decision.path), a.decision);
for (const flag of ['registry_approval_written', 'source_or_target_proof_accepted', 'actual_mysql_executed', 'production_activation_approved']) assert.equal(a[flag], false);
const currentDifferences = a.source_files.filter(file => sha(read(file.path)) !== file.sha256).map(file => ({ path: file.path, reviewed_sha256: file.sha256, current_sha256: sha(read(file.path)) }));
const tables = a.tables.map(table => {
  const proposed = request.objects.find(object => object.name === table.name);
  assert.ok(proposed.required_cross_reviewers.includes('A'));
  assert.equal(table.normalizer_id, proposed.normalizer_id); assert.equal(table.verifier_id, proposed.verifier_id);
  assert.equal(table.conclusion, 'changes_required'); assert.equal(table.runtime_approved, false);
  return { ...table, received_by: 'D', next_action: 'revise_proposal_then_request_same_version_review' };
});
const result = {
  kind: 'd_resources_a_review_intake.v1', date: '2026-10-22', status: 'received_changes_required_not_approval',
  source_request: pin(proposalPath), a_receipt: pin(receiptPath), a_decision: pin(a.decision.path), source_capsule: pin(capsulePath), document: pin(documentPath),
  reviewed_source_digest: request.source_digest, verified_historical_files: capsule.files.length, tables,
  current_source_differences_at_intake: currentDifferences,
  request_modified: false, formal_registry_modified: false, approved_cross_reviewers_modified: false,
  source_or_target_proof_accepted: false, normalization_implementation_accepted: false,
  actual_mysql_executed: false, production_approval: false, messages_sent: false,
};
const output = 'docs/evidence/d-a-resources-review-intake-20261022.json';
if (process.argv.includes('--check')) {
  const existing = json(output);
  // Retain the original current-source observation; later code changes do not
  // invalidate receipt of this historical changes-required review.
  const { current_source_differences_at_intake, ...accepted } = existing;
  const { current_source_differences_at_intake: ignored, ...expected } = result;
  assert.deepEqual(accepted, expected);
  assert.ok(Array.isArray(current_source_differences_at_intake));
} else fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log('D_A_RESOURCES_INTAKE six_tables=6 conclusion=changes_required historical_files=31 approval=no');
