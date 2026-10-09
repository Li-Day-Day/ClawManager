import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { receiveSchemaCandidate } from './system-backup-schema-candidate-receipt.mjs';
import { buildSchemaHashEvidenceCandidate, validateReviewedSchemaHashEvidence } from './system-backup-schema-hash-evidence.mjs';

const bindings = {
  inventory: {plan_version:'system-backup-plan.v12',objects:[{object_type:'table',name:'d_fixture'}]},
  migrationCatalog: {algorithm:'sha256-length-prefixed-filename-normalized-content-v1',hash:'b'.repeat(64)}, captureSql:'SELECT 1;',
};
const records = [
  ['metadata',{server_version:'8.4.8',sql_mode:'STRICT_TRANS_TABLES'}],
  ['table',{name:'d_fixture'}],
  ['column',{table_name:'d_fixture',name:'id',ordinal_position:1,normalized_type:'bigint',nullable:0,default:null,character_set:null,collation:null,extra:'',generation_expression:null}],
].map(([type,value])=>`${type}\t${JSON.stringify(value)}`).join('\n')+'\n';
const baseline = buildSchemaHashEvidenceCandidate({...bindings,records,recordsPath:'synthetic-only.tsv',context:{installation_identity_hash:'a'.repeat(64),installation_identity_version:'synthetic-only',capture_started_at:'2026-09-23T00:00:00Z',capture_finished_at:'2026-09-23T00:00:01Z'}});
baseline.records_cleanup={...baseline.records_cleanup,status:'verified',verified_absent:true,deleted_at:'2026-09-23T00:00:02Z'};
const bytes=Buffer.from(JSON.stringify(baseline));
const hash = (input) => createHash('sha256').update(input).digest('hex');
const pin = (b) => ({ ...bindings, expectedSHA256: hash(b) });
test('received synthetic candidate stays unapproved and cannot satisfy reviewed gate', () => {
  const receipt = receiveSchemaCandidate(bytes, pin(bytes));
  assert.equal(receipt.status, 'candidate_received_not_approved');
  assert.equal(receipt.schema_hash_evidence_present, false);
  assert.equal(receipt.raw_records_independently_recomputed, false);
  assert.equal(receipt.registered_evidence, null);
  assert.deepEqual(receipt.approved_reviewers, []);
  assert.throws(() => validateReviewedSchemaHashEvidence(baseline, bindings), /not reviewed/);
});
test('tampered valid schema hash cannot pass a separately pinned file digest', () => {
  const changed = structuredClone(baseline);
  changed.result.hash = 'f'.repeat(64);
  assert.throws(() => receiveSchemaCandidate(Buffer.from(JSON.stringify(changed)), pin(bytes)), /checksum/);
});
test('candidate receipt rejects binding drift even when caller pins new bytes', () => {
  for (const field of ['capture_sql_sha256', 'inventory_snapshot_sha256', 'migration_catalog_hash']) {
    const changed = structuredClone(baseline);
    changed[field] = 'f'.repeat(64);
    const b = Buffer.from(JSON.stringify(changed));
    assert.throws(() => receiveSchemaCandidate(b, pin(b)), /hash/);
  }
});
test('candidate receipt rejects forged approval, open fields, bad counts and cleanup', () => {
  for (const edit of [
    x => x.status = 'reviewed', x => x.approved_reviewers = ['A'], x => x.registered_evidence = {},
    x => x.extra = 'forbidden', x => x.result.object_counts.table++, x => x.result.object_count++,
    x => x.inventory_comparison.missing_object_keys.push('table:missing'),
    x => x.records_cleanup.verified_absent = false,
    x => x.records_cleanup.deleted_at = '2000-01-01T00:00:00Z',
    x => x.capture_started_at = '2099-01-01T00:00:00Z',
  ]) {
    const changed = structuredClone(baseline); edit(changed);
    const b = Buffer.from(JSON.stringify(changed));
    assert.throws(() => receiveSchemaCandidate(b, pin(b)));
  }
});
test('candidate receipt rejects malformed UTF-8, JSON and oversize input', () => {
  for (const b of [Buffer.from([0xff]), Buffer.from('{'), Buffer.alloc(256 * 1024 + 1)]) {
    assert.throws(() => receiveSchemaCandidate(b, pin(b)));
  }
});
