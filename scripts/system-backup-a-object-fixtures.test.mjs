import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeFixture, rowChecksum } from './system-backup-a-object-fixture-model.mjs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const prefix = 'contracts/system-backup/v12/';
const fixtures = read(prefix + 'a-owned-object-fixtures.json');
const policies = read(prefix + 'a-owned-object-fixture-policies.json').policies;
const secretSchema = read(prefix + 'secret-ref.schema.json');
const decisions = read(prefix + 'schema-registry-decisions.json').decisions.filter(d => d.owner === 'A');
const inventory = read('docs/system-backup-restore-schema-inventory.json');

test('15 A-owned objects have runnable vectors, bounded columns and registry IDs', () => {
  assert.equal(fixtures.objects.length, 15);
  assert.deepEqual(fixtures.objects.map(o => o.name).sort(), decisions.map(d => d.name).sort());
  assert.deepEqual(policies.map(o => o.name).sort(), decisions.map(d => d.name).sort());
  for (const object of fixtures.objects) {
    const policy = policies.find(p => p.name === object.name);
    const decision = decisions.find(d => d.name === object.name);
    assert.equal(policy.normalizer_id, decision.normalizer_id);
    assert.equal(policy.verifier_id, decision.verifier_id);
    assert.equal(policy.input_projection_schema.additionalProperties, false);
    assert.ok(object.cases.some(c => c.input_rows.length === 0));
    assert.ok(object.cases.some(c => c.name === object.abnormal_case));
    const sources = inventory.objects.find(o => o.name === object.name && o.object_type === 'table').migration_sources;
    const sql = sources.map(path => readFileSync(new URL(path, root), 'utf8')).join('\n');
    for (const field of policy.input_projection_schema.required) {
      assert.match(sql, new RegExp(`\\b${field}\\s+(?:BIGINT|INT|VARCHAR|CHAR|TEXT|LONGTEXT|BOOLEAN|DATETIME|TIMESTAMP|JSON|DECIMAL|ENUM)\\b`, 'i'), `${object.name}.${field} must be a real migration column`);
    }
    for (const tc of object.cases) {
      if (tc.expected_failure) {
        assert.throws(() => normalizeFixture(policy, tc.input_rows, tc.context, secretSchema), new RegExp(`^Error: ${tc.expected_failure}$`), `${object.name}/${tc.name}`);
      } else {
        const actual = normalizeFixture(policy, tc.input_rows, tc.context, secretSchema);
        assert.deepEqual(actual, tc.expected, `${object.name}/${tc.name}`);
        assert.equal(rowChecksum(actual.rows), tc.normalized_rows_sha256, `${object.name}/${tc.name} checksum`);
      }
    }
  }
});

test('row boundary rejects unknown fields, broken mappings and oversized values', () => {
  for (const object of fixtures.objects) {
    const policy = policies.find(p => p.name === object.name);
    const good = object.cases.find(c => c.name === 'redacted_historical');
    const run = (row, context = good.context) => normalizeFixture(policy, [row], context, secretSchema);
    assert.throws(() => run({ ...good.input_rows[0], unexpected_credential: 'SYNTHETIC' }), /normalization_failed/);
    for (const field of policy.input_projection_schema.required) {
      const missing = structuredClone(good.input_rows[0]); delete missing[field];
      assert.throws(() => run(missing), /normalization_failed/);
      const spec = policy.input_projection_schema.properties[field];
      if (spec.maxLength) {
        const oversized = structuredClone(good.input_rows[0]); oversized[field] = '中'.repeat(spec.maxLength + 1);
        assert.throws(() => run(oversized), /normalization_failed/);
      }
    }
    for (const domain of Object.values(policy.references)) {
      const context = structuredClone(good.context); delete context.mappings[domain];
      assert.throws(() => run(good.input_rows[0], context), /normalization_failed/);
    }
  }
});

test('historical credentials are inactive, references remap and accounting retains decimal precision', () => {
  const row = name => fixtures.objects.find(o => o.name === name).cases.find(c => c.name === 'redacted_historical').expected.rows[0];
  assert.equal(row('users').is_active, false);
  assert.equal(row('users').password_hash, null);
  assert.equal(row('llm_models').api_key, null);
  assert.equal(row('enterprise_auth_settings').enabled, false);
  assert.equal(row('northbound_auth_challenges').status, 'expired');
  assert.equal(row('northbound_sessions').status, 'revoked');
  assert.equal(row('instance_gateway_token_aliases').expires_at, fixtures.fixture_policy.snapshot_cutoff);
  assert.equal(row('chat_sessions').last_trace_id, null);
  assert.equal(row('chat_messages').session_id, row('chat_sessions').session_id);
  assert.equal(row('chat_messages').content, '[REDACTED]');
  assert.equal(row('model_invocations').request_payload, '[REDACTED]');
  assert.equal(row('cost_records').estimated_cost, '0.00002000');
  assert.equal(row('cost_records').total_tokens, row('model_invocations').total_tokens);
  assert.equal(row('risk_rules').is_enabled, false);
});
