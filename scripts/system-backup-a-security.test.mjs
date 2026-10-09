import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from './system-backup-a-schema-validation.mjs';

const dir = new URL('../contracts/system-backup/v12/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const providerSchema = read('provider-proof-registration.schema.json');
const secretSchema = read('secret-ref.schema.json');
const capabilitySchema = read('capability-evidence.schema.json');

test('signature metadata uses Unicode scalar length at schema boundaries', () => {
  const schema = read('strong-auth-proof-nonce.schema.json');
  for (const [field, limit] of [['key_id', 256], ['key_version', 128]]) {
    for (const character of ['界', '😀']) {
      for (const [count, valid] of [[0, false], [1, true], [limit, true], [limit + 1, false]]) {
        const proof = structuredClone(read('a-strong-auth-signature-vectors.json').vectors[0].proof);
        proof.signature[field] = character.repeat(count);
        assert.equal(validate(schema, proof), valid, `${field}/${character}/${count}`);
      }
    }
  }
});

test('all status/reason pairs agree across A evidence, D records and the handoff mapping', () => {
  const d = read('dependency-provider-capability.schema.json');
  const mapping = read('a-capability-role-mapping.json');
  const cases = read('a-capability-status-reason-vectors.json').cases;
  assert.equal(cases.length, 27);
  for (const tc of cases) {
    const evidence = structuredClone(read('a-owned-redacted-examples.json').capability_evidence);
    evidence.capabilities[0].status = tc.status;
    evidence.capabilities[0].reason_code = tc.reason_code;
    assert.equal(validate(capabilitySchema, evidence), tc.valid, `A ${tc.status}/${tc.reason_code}`);
    for (const base of read('dependency-provider-capability-redacted-examples.json').provider_capability_records) {
      // Null evidence avoids external refs unsupported by this test-only evaluator.
      const record = { ...base, evidence: null, status: tc.status, capability_reason_code: tc.reason_code };
      assert.equal(validate(d.$defs.ProviderCapabilityRecord, record, d), tc.valid, `D ${base.provider_role}/${tc.status}/${tc.reason_code}`);
    }
    assert.equal(mapping.reasons_by_status[tc.status].includes(tc.reason_code), tc.valid);
  }
  for (const [status, reason] of [['unknown', 'none'], ['degraded', 'invented_reason']]) {
    const evidence = structuredClone(read('a-owned-redacted-examples.json').capability_evidence);
    Object.assign(evidence.capabilities[0], { status, reason_code: reason });
    assert.equal(validate(capabilitySchema, evidence), false);
  }
});

test('fixed Node/Go JCS vectors verify real Ed25519 JWS signatures', () => {
  for (const { proof, canonical_utf8_hex, public_key_base64url } of read('a-strong-auth-signature-vectors.json').vectors) {
    assert.equal(validate(read('strong-auth-proof-nonce.schema.json'), proof), true);
    const payload = JSON.stringify(Object.fromEntries(Object.keys(proof.payload).sort().map(key => [key, proof.payload[key]])));
    assert.equal(Buffer.from(payload).toString('hex'), canonical_utf8_hex);
    const key = createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x: public_key_base64url } });
    const input = Buffer.from(proof.signature.protected_header + '.' + Buffer.from(payload).toString('base64url'));
    assert.equal(verify(null, input, key, Buffer.from(proof.signature.value, 'base64url')), true);
    assert.equal(verify(null, Buffer.concat([input, Buffer.from('x')]), key, Buffer.from(proof.signature.value, 'base64url')), false);
  }
});

test('provider target/proof/state and Unicode boundaries match shared runtime vectors', () => {
  for (const tc of read('a-provider-proof-parity-vectors.json').cases) {
    assert.equal(validate(providerSchema, tc.registration), tc.schema_valid, tc.name);
    // Time and decoded-byte limits intentionally belong to semantic validation.
    if (tc.schema_valid !== tc.runtime_valid) assert.match(tc.name, /expired|expires-at|over-max|future|8193/);
  }
  const p = read('a-owned-redacted-examples.json').provider_proof_registration;
  for (const field of providerSchema.required) {
    const missing = structuredClone(p); delete missing[field];
    assert.equal(validate(providerSchema, missing), false, `missing ${field}`);
  }
  assert.equal(validate(providerSchema, { ...p, provider_error: 'SYNTHETIC_PRIVATE_TEXT' }), false);
});

test('nonce refs, CA, read and independent delete purposes are closed and least privilege', () => {
  for (const tc of read('a-secret-ref-vectors.json').cases) assert.equal(validate(secretSchema, tc.ref), tc.valid, tc.name);
  for (const tc of read('a-secret-ref-vectors.json').cases.filter(c => c.valid)) {
    for (const forbidden of secretSchema['x-forbidden-fields']) assert.equal(validate(secretSchema, { ...tc.ref, [forbidden]: 'SYNTHETIC_FORBIDDEN' }), false, forbidden);
  }
});

test('capability roles and codes map exactly to D, rejecting duplicates and wrong roles', () => {
  const base = read('a-owned-redacted-examples.json').capability_evidence;
  assert.equal(validate(capabilitySchema, base), true);
  const mapping = read('a-capability-role-mapping.json');
  const d = read('dependency-provider-capability.schema.json');
  for (const [role, def] of [['artifact', 'Artifact'], ['catalog', 'Catalog'], ['evidence', 'Evidence']]) {
    assert.deepEqual(mapping.codes_by_role[role], d.$defs[def + 'CapabilityCode'].enum);
  }
  for (const [role, codes] of Object.entries(mapping.codes_by_role)) {
    for (const code of codes) {
      const value = structuredClone(base); value.provider_role = role; value.capabilities = [value.capabilities[0]]; value.capabilities[0].capability_code = code;
      assert.equal(validate(capabilitySchema, value), true, `${role}/${code}`);
      value.capabilities.push({ ...value.capabilities[0], checked_at: '2026-09-20T01:10:02Z' });
      assert.equal(validate(capabilitySchema, value), false, 'same code with different fields must still fail');
    }
  }
  const wrongRole = structuredClone(base); wrongRole.capabilities[0].capability_code = 'generate_data_key';
  assert.equal(validate(capabilitySchema, wrongRole), false);
  const noExpiry = structuredClone(base); delete noExpiry.capabilities[0].expires_at;
  assert.equal(validate(capabilitySchema, noExpiry), false);
  const badStatus = structuredClone(base); badStatus.capabilities[0].reason_code = 'permission_denied';
  assert.equal(validate(capabilitySchema, badStatus), false);
});
