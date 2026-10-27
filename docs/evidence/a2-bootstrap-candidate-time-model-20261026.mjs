// Proposed committed-candidate time semantics, using fixed synthetic DB time.
// No authentication, SQL, execution handle, grant, exported API or wire schema.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(import.meta.dirname, '../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(path.resolve(root, p));
const proposal = {
  now: '2026-09-30T01:02:00.000001Z',
  lastSQL: '2026-09-30T01:01:59.000001Z',
  observed: '2026-09-30T01:00:00.000001Z',
  observationUntil: '2026-09-30T01:05:00.000001Z',
  domainAdmissionUntil: '2026-09-30T01:06:00.000001Z',
  bootstrapAuthorityUntil: '2026-09-30T01:04:00.000001Z',
  resourceDependencyUntil: '2026-09-30T01:04:30.000001Z',
  evidenceRetentionUntil: '2026-10-30T01:05:00.000001Z',
  producerLeaseUntil: '2026-09-30T01:01:00.000001Z',
  producerExecutionAuthorizationUntil: '2026-09-30T01:01:30.000001Z',
  ownerWriteUntil: '2026-09-30T01:01:40.000001Z',
  domainState: 'open', grantState: 'active', originalEpoch: '1', currentEpoch: '1',
  originalGeneration: '1', currentGeneration: '1', originalRun: 'synthetic_run_1', currentRun: 'synthetic_run_1',
  cancelled: false,
};
function evaluate(s) {
  if (s.cancelled) return 'cancelled';
  if (s.domainState !== 'open' || s.grantState !== 'active') return 'explicit_authority_state_invalid';
  if (s.originalEpoch !== s.currentEpoch || s.originalGeneration !== s.currentGeneration || s.originalRun !== s.currentRun) return 'original_epoch_generation_or_target_invalid';
  if (s.now < s.lastSQL || s.now < s.observed) return 'SQL_clock_or_observation_order';
  for (const name of ['observationUntil', 'domainAdmissionUntil', 'bootstrapAuthorityUntil', 'resourceDependencyUntil', 'evidenceRetentionUntil']) if (s.now >= s[name]) return 'expired_' + name;
  // These three old execution bounds are intentionally NOT used as fresh
  // bootstrap consumption authority or as a way to renew original observation.
  return 'time_relations_match_only_no_authority';
}
try {
  assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3);
  const positive = [];
  for (const [name, change] of [
    ['committed_result_after_execution_lease_auth_and_write_cutoff', {}],
    ['committed_result_before_execution_bounds', { producerLeaseUntil: proposal.observationUntil, producerExecutionAuthorizationUntil: proposal.domainAdmissionUntil, ownerWriteUntil: proposal.resourceDependencyUntil }],
  ]) {
    assert.equal(evaluate({ ...proposal, ...change }), 'time_relations_match_only_no_authority'); positive.push(name);
  }
  const negative = [];
  const reject = (name, change) => { const result = evaluate({ ...proposal, ...change }); assert.notEqual(result, 'time_relations_match_only_no_authority', name); negative.push({ name, result }); };
  for (const field of ['observationUntil', 'domainAdmissionUntil', 'bootstrapAuthorityUntil', 'resourceDependencyUntil', 'evidenceRetentionUntil']) reject('equality_' + field, { [field]: proposal.now });
  reject('original_observation_expired_even_with_long_retention', { observationUntil: proposal.lastSQL });
  reject('observation_is_in_future', { observed: '2026-09-30T01:03:00.000001Z' });
  reject('intermediate_SQL_rollback', { lastSQL: '2026-09-30T01:02:00.000003Z', now: '2026-09-30T01:02:00.000002Z' });
  reject('original_context_cancelled', { cancelled: true });
  reject('producer_grant_explicitly_revoked', { grantState: 'revoked' });
  reject('producer_grant_superseded', { grantState: 'superseded' });
  reject('domain_revoked', { domainState: 'revoked' });
  reject('domain_epoch_changed', { currentEpoch: '2' });
  reject('grant_generation_changed', { currentGeneration: '2' });
  reject('new_target_run', { currentRun: 'synthetic_run_2' });
  const inputs = [
    'docs/system-backup-d-producer-authority-revision-20260930.md',
    'contracts/system-backup/v12/producer-authority-persistence.json',
    'contracts/system-backup/v12/producer-authority-transactions.json',
  ];
  const result = {
    kind: 'a2_bootstrap_candidate_consumer_time_model.v1',
    status: 'A_proposed_consumer_semantics_pending_A1_D_contract_review',
    based_on: 'R1 independent bootstrap consumption and separate execution, original observation and retention horizons',
    synthetic: true,
    relation_positives: positive,
    rejections: negative,
    old_execution_lease_auth_and_write_cutoff_expiry_alone_rejects_consumption: false,
    explicit_revocation_or_epoch_generation_target_conflict_rejects: true,
    original_observation_and_current_domain_bootstrap_dependency_bounds_required: true,
    retention_is_not_observation_authority: true,
    original_producer_was_lawfully_committed_proof_still_required: true,
    returns_or_mints_execution_authority: false,
    current_bootstrap_authority_authenticated_by_model: false,
    old_execution_bound_relevance_is_new_recorded_contract_clarification: true,
    production_approved: false,
    Go_or_builds_run: false,
    dependencies_installed: false,
    scratch_created: false,
    actual_SQL: false,
    inputs: inputs.map(p => ({ path: p, sha256: sha(read(p)) })),
    model_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  };
  const out = path.resolve(root, 'docs/evidence/a2-bootstrap-candidate-time-model-reviewed-20261026.json');
  if (process.argv[2] === '--check') assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), result);
  else fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('A2_CANDIDATE_TIME_MODEL positives=2 rejections=' + negative.length + ' expired_execution_only=not_denied authority=no');
} catch (error) { console.error('A2_CANDIDATE_TIME_MODEL_REJECTED: ' + error.message); process.exitCode = 1; }
