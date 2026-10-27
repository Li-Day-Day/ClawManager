import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from './system-backup-a-schema-validation.mjs';

const read = name => JSON.parse(readFileSync(new URL('../contracts/system-backup/v12/' + name, import.meta.url), 'utf8'));

test('D-A-R1: public signature schema permits Unicode signing metadata', () => {
  const schema = read('strong-auth-proof-nonce.schema.json');
  for (const [field, count] of [['key_id', 100], ['key_version', 50]]) {
    const proof = structuredClone(read('a-strong-auth-signature-vectors.json').vectors[0].proof);
    proof.signature[field] = '界'.repeat(count);
    assert.equal(validate(schema, proof), true, field);
  }
});

test('D-A-R2: capability schema must reject temporary failures labelled unsupported', () => {
  const schema = read('capability-evidence.schema.json');
  for (const reason of ['provider_unavailable', 'credential_unavailable', 'permission_denied', 'response_invalid']) {
    const evidence = structuredClone(read('a-owned-redacted-examples.json').capability_evidence);
    evidence.capabilities[0].status = 'degraded';
    evidence.capabilities[0].reason_code = reason;
    assert.equal(validate(schema, evidence), true);
    evidence.capabilities[0].status = 'unsupported';
    assert.equal(validate(schema, evidence), false, reason);
  }
});
