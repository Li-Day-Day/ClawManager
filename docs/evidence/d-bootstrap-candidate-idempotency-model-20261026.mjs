// Independent design counterexample only. This is not a wire schema, grant,
// trusted mapping issuer, bootstrap adapter or SQL/production acceptance.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalBytes, resultHashes} from '../../scripts/system-backup-producer-contract.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pin = path => ({path, sha256: sha(fs.readFileSync(path))});
const fixture = 'contracts/system-backup/v12/producer-authority-vectors.json';
const vectors = JSON.parse(fs.readFileSync(fixture, 'utf8'));
assert.equal(vectors.synthetic, true);
assert.equal(vectors.production_authorization, false);
const first = vectors.positive.find(v => v.id === 'unconfigured_signing').value;
const second = structuredClone(first);
second.target.identity_hash = '2'.repeat(64);
second.request_key = 'synthetic-second-candidate';
second.run_id = 'synthetic_second_run';
const a = resultHashes(first), b = resultHashes(second);
assert.notEqual(a.request, b.request);
assert.notEqual(a.key, b.key);

// An opaque fixed synthetic grant digest, never an OfflineBootstrapGrant.
const grant = sha(Buffer.from('SYNTHETIC_ORIGINAL_GRANT_BINDING'));
const scope = [first.scope.server_uuid, first.scope.database, first.scope.installation];
function item(purpose, identity, digests) {
  return {purpose, identity, version: 'synthetic-ref-v1',
    mapping: sha(Buffer.from('SYNTHETIC_MAPPING_FOR_' + purpose)),
    scope, receipt: digests.key, request: digests.request, result_version: '1'};
}
const selected = [item('capture_signing', 'a'.repeat(64), a), item('acceptance_signing', 'b'.repeat(64), b)];
const swapped = structuredClone(selected);
for (const name of ['receipt', 'request']) {
  [swapped[0][name], swapped[1][name]] = [swapped[1][name], swapped[0][name]];
}
// Model of the incomplete proposal: fixed grant plus an unordered digest set.
// Its alias is NOT a cryptographic collision: the omitted relation is the bug.
const weak = items => sha(canonicalBytes([grant,
  [...new Set(items.map(i => i.request))].sort()]));
assert.equal(weak(selected), weak(swapped));

// Model illustration only. A/D still select the actual domain/encoding and
// obtain the original mapping independently; a digest cannot authenticate it.
function complete(items) {
  const purposes = new Set();
  const tuples = items.map(i => {
    assert.ok(!purposes.has(i.purpose), 'duplicate purpose is not silently merged');
    purposes.add(i.purpose);
    return [i.purpose, i.identity, i.version, i.mapping, ...i.scope,
      i.receipt, i.request, i.result_version];
  }).sort((x, y) => Buffer.compare(canonicalBytes(x), canonicalBytes(y)));
  return sha(canonicalBytes(['SYNTHETIC_RELATION_MODEL_ONLY', grant, tuples]));
}
const original = complete(selected), checks = [];
assert.notEqual(original, complete(swapped));
checks.push('same_result_set_with_swapped_purpose_mapping_changes_complete_binding');
assert.equal(original, complete([...selected].reverse()));
checks.push('permuting_the_same_complete_items_preserves_binding');
for (const field of ['purpose', 'identity', 'version', 'mapping', 'receipt', 'request', 'result_version']) {
  const changed = structuredClone(selected);
  changed[0][field] += '_changed';
  assert.notEqual(original, complete(changed));
  checks.push('changed_' + field + '_changes_binding');
}
for (let i = 0; i < 3; i++) {
  const changed = structuredClone(selected);
  changed[0].scope[i] += '_changed';
  assert.notEqual(original, complete(changed));
  checks.push('changed_scope_component_' + i + '_changes_binding');
}
assert.throws(() => complete([...selected, structuredClone(selected[0])]), /duplicate purpose/);
checks.push('duplicate_purpose_rejected_before_hashing');
assert.notEqual(original, complete(selected.slice(0, 1)));
checks.push('omitted_consumer_changes_binding');
assert.notEqual(original, complete([...selected, item('catalog_signing', 'c'.repeat(64), b)]));
checks.push('extra_consumer_changes_binding');

const output = 'docs/evidence/d-bootstrap-candidate-idempotency-model-reviewed-20261026.json';
const report = {
  kind: 'd_bootstrap_candidate_idempotency_design_counterexample.v1',
  status: 'synthetic_counterexample_not_implementation_acceptance',
  C1_structurally_valid_rehashed_candidates: 2,
  weak_digest_set_alias_demonstrated: true,
  cryptographic_collision_claimed: false,
  original_and_swapped_complete_mapping_distinguished: true,
  checks,
  limitation: 'Complete digests distinguish relations but do not authenticate the mapping or define a production request_hash encoding. A/D must supply the original trusted association and compatibility decision.',
  production_schema_or_enum_added: false,
  actual_bootstrap_operation_executed: false,
  provider_or_SQL_executed: false,
  Go_or_builds_run: false,
  dependencies_installed: false,
  scratch_or_build_artifacts_created: false,
  production_approved: false,
  inputs: [fixture, 'scripts/system-backup-producer-contract.mjs',
    'scripts/system-backup-a-schema-validation.mjs',
    'contracts/system-backup/v12/producer-authority.schema.json',
    'contracts/system-backup/v12/producer-authority-transactions.json',
    'docs/evidence/d-bootstrap-candidate-idempotency-model-20261026.mjs'].map(pin),
};
assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3);
if (process.argv[2] === '--write') fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), report);
console.log('BOOTSTRAP_IDEMPOTENCY_MODEL weak_set_alias=yes checks=' + checks.length + ' authorization=no SQL=no');
