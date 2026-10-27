// Executable C1 relation proposal only. No exports, production adapter, SQL,
// authentication, grant construction or caller-supplied Policy. All data is
// the existing SYNTHETIC contract fixture; a model match grants no authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalBytes, resultHashes } from '../../scripts/system-backup-producer-contract.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const raw = p => fs.readFileSync(path.resolve(root, p));
const json = p => JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/, ''));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const equal = (a, b) => canonicalBytes(a).equals(canonicalBytes(b));
const vectorPath = 'contracts/system-backup/v12/producer-authority-vectors.json';
const vectors = json(vectorPath);
assert.equal(vectors.synthetic, true);
assert.equal(vectors.production_authorization, false);
const original = vectors.positive.find(v => v.id === 'unconfigured_signing').value;
const configured = vectors.positive.find(v => v.id === 'disabled_signing').value;
// Fixed independently of each mutation below. These are model constants, not
// an invented trusted deployment-file schema or an actual offline grant.
const fixed = structuredClone(original);
const referencePin = { purpose: 'capture_signing', identity_hash: '1'.repeat(64), version: 'capture-binding-v1' };
const fixedNow = '2026-09-30T01:01:00.000001Z';
function modelRelations(request, usage, observedNow = fixedNow) {
  resultHashes(request); // Use existing strict C1 schema/semantics and encoding.
  if (!equal(usage, referencePin)) return 'bootstrap_purpose_or_pin';
  if (!equal(request.scope, fixed.scope)) return 'scope';
  if (!equal(request.admission, fixed.admission)) return 'unconfigured_admission_binding';
  if (!equal(request.target, fixed.target)) return 'exact_target_and_evaluator_profile';
  if (request.purpose !== fixed.purpose || request.input_hash !== fixed.input_hash) return 'original_observation_input';
  if (request.grant_id !== fixed.grant_id || request.grant_generation !== fixed.grant_generation || request.run_id !== fixed.run_id || request.domain_epoch !== fixed.domain_epoch || request.target_generation !== fixed.target_generation || request.request_key !== fixed.request_key || request.expected_result_version !== fixed.expected_result_version) return 'original_producer_binding';
  if (!equal(request.evidence, fixed.evidence) || request.expected_evidence_version !== fixed.expected_evidence_version) return 'immutable_evidence_binding';
  if (request.observed_at !== fixed.observed_at || request.observation_expires_at !== fixed.observation_expires_at || observedNow < request.observed_at || observedNow >= request.observation_expires_at) return 'original_observation_window';
  if (request.results.kind !== 'dependency' || !equal(request.results.observations.map(o => o.slot), ['signing']) || request.results.observations.some(o => o.status !== 'healthy' || o.reason !== 'none')) return 'signing_dependency_result';
  return 'relations_match_only_no_authority';
}
try {
  assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3);
  assert.equal(modelRelations(original, referencePin), 'relations_match_only_no_authority');
  assert.notEqual(referencePin.identity_hash, original.target.identity_hash, 'model must not assume bootstrap reference identity equals producer target');
  const results = [];
  function rejected(name, mutate, usage = referencePin, now = fixedNow) {
    const candidate = structuredClone(original);
    mutate(candidate);
    // Reseal after mutation. A self-consistent digest cannot establish the
    // independent original installation/config/purpose/profile relationship.
    let resealed;
    try { resealed = resultHashes(candidate).request; }
    catch (error) { throw new Error(name + ': ' + error.message); }
    assert.match(resealed, /^[a-f0-9]{64}$/);
    const result = modelRelations(candidate, usage, now);
    assert.notEqual(result, 'relations_match_only_no_authority', name);
    results.push({ name, result, C1_structurally_valid: true, candidate_request_digest_recomputed: true });
  }
  rejected('configured_result_cannot_substitute_unconfigured_candidate', r => Object.assign(r, structuredClone(configured)));
  rejected('wrong_database', r => r.scope.database = 'another_database');
  rejected('wrong_server', r => r.scope.server_uuid = '22222222-2222-4333-8444-555555555555');
  rejected('wrong_installation_with_matching_evidence_owner', r => { r.scope.installation = 'installation_other'; r.evidence.owner_id = r.scope.installation; });
  for (const field of ['deployment_admission_id', 'candidate_hash', 'registry_set_hash', 'ref_set_hash', 'policy_hash', 'channel_profile_hash']) {
    rejected('changed_' + field, r => r.admission[field] = field === 'deployment_admission_id' ? 'different_deployment' : 'a'.repeat(64));
  }
  for (const field of ['identity_hash', 'evaluator_profile_hash', 'probe_scope_hash']) rejected('changed_target_' + field, r => r.target[field] = 'b'.repeat(64));
  rejected('changed_target_version', r => r.target.ref_version = 'different-provider-version');
  for (const field of ['grant_id', 'run_id']) rejected('changed_' + field, r => r[field] = 'different_' + field);
  for (const field of ['grant_generation', 'domain_epoch', 'target_generation']) rejected('changed_' + field, r => r[field] = '2');
  rejected('changed_request_key', r => r.request_key = 'synthetic-request-0002');
  rejected('changed_expected_result_version', r => r.expected_result_version = '1');
  rejected('changed_original_input', r => r.input_hash = 'a'.repeat(64));
  for (const field of ['manifest_hash', 'content_hash', 'object_hash', 'store_identity_hash', 'kek_identity_hash', 'write_identity_hash']) rejected('changed_evidence_' + field, r => r.evidence[field] = 'd'.repeat(64));
  rejected('changed_immutable_object_version', r => r.evidence.immutable_version = 'other-object-v2');
  rejected('changed_evidence_row_version', r => r.expected_evidence_version = '4');
  rejected('renewed_observation_expiry', r => r.observation_expires_at = '2026-09-30T01:06:00.000001Z');
  rejected('at_original_expiry', () => {}, referencePin, original.observation_expires_at);
  rejected('before_original_observation', () => {}, referencePin, '2026-09-30T00:59:59.000001Z');
  rejected('degraded_signing_is_not_healthy', r => { r.results.observations[0].status = 'degraded'; r.results.observations[0].reason = 'signing_key_unavailable'; });
  for (const purpose of ['acceptance_signing', 'catalog_signing', 'nonce_hmac', 'evidence_ca', 'evidence_kek']) rejected('capture_result_not_' + purpose, () => {}, { ...referencePin, purpose });
  rejected('changed_bootstrap_reference_identity', () => {}, { ...referencePin, identity_hash: '2'.repeat(64) });
  rejected('changed_bootstrap_reference_version', () => {}, { ...referencePin, version: 'capture-binding-v2' });
  const unresolved = [
    'D sealed committed-candidate consumer with current original domain/grant/run/receipt/history/reference/evidence checks',
    'A/D independently authorized OfflineBootstrapGrant to DeploymentAdmissionID/CandidateHash/registry/ref/profile mapping',
    'A original capture signer descriptor, domain/payload/key/version and historical-retention observations',
    'A/D early shared lock prefix, query-only late guard and atomic domain epoch close with disabled-v1 bootstrap',
  ];
  const result = {
    kind: 'a2_bootstrap_capture_binding_executable_model.v1',
    status: 'synthetic_relation_model_only_not_resource_admission',
    first_proposed_consumer_purpose: 'capture_signing',
    existing_SecretRef_purpose: 'capture_certificate',
    candidate_role: 'signing',
    result_kind: 'dependency',
    existing_dependency_slot: 'signing',
    positive_relation_cases: 1,
    positive_relation_is_authorization: false,
    rejected_resealed_C1_cases: results,
    unresolved_authority_and_contract: unresolved,
    production_adapter_implemented: false,
    BootstrapResourceValidator_satisfied: false,
    entry_missing_slots_reduced: 0,
    nonce_CA_forced_through_producer: false,
    grant_or_Public_wire_schema_added: false,
    source_snapshot_inputs_modified: false,
    dependencies_installed: false,
    Go_or_builds_run: false,
    scratch_created: false,
    actual_SQL: false,
    production_approved: false,
    inputs: [vectorPath, 'scripts/system-backup-producer-contract.mjs', 'scripts/system-backup-a-schema-validation.mjs', 'contracts/system-backup/v12/producer-authority.schema.json', 'contracts/system-backup/v12/producer-authority-transactions.json'].map(p => ({ path: p, sha256: hash(raw(p)) })),
    model_sha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  };
  const out = 'docs/evidence/a2-bootstrap-capture-binding-model-reviewed-20261026.json';
  if (process.argv[2] === '--check') assert.deepEqual(json(out), result);
  else fs.writeFileSync(path.resolve(root, out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('A2_CAPTURE_BINDING_MODEL relations=1 resealed_rejections=' + results.length + ' authorization=no adapter=no');
} catch (error) { console.error('A2_CAPTURE_BINDING_MODEL_REJECTED: ' + error.message); process.exitCode = 1; }
