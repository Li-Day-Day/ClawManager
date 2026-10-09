import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {makeChallenges, readCandidates, validateSigningResult, validateFailure} from './system-backup-d-issuer-signing.mjs';

function fixture() {
  const run = 'd-sig-' + 'a'.repeat(24), h = {namespace_uid:'12345678-1234-1234-1234-123456789abc'};
  const bindings = {runner_sha256:'a'.repeat(64)}, candidates = {}, privateKeys = {};
  for (const role of ['provider', 'strong']) {
    const pair = generateKeyPairSync('ed25519');
    privateKeys[role] = pair.privateKey;
    candidates[role] = {registry_sha256:createHash('sha256').update(role).digest('hex'),
      key:{public_key_base64:pair.publicKey.export({format:'der', type:'spki'}).subarray(-32).toString('base64')}};
  }
  const challenges = makeChallenges(run, h, candidates);
  const checks = Object.fromEntries(['provider', 'strong'].map(role => [role,
    Object.fromEntries('cross_key omitted zero wrong wrong-string extra key_read revoked'.split(' ').map(k => [k, 403]))]));
  const signatures = Object.fromEntries(['provider', 'strong'].map(role => [role,
    sign(null, Buffer.from(challenges[role], 'base64'), privateKeys[role]).toString('base64')]));
  const value = {kind:'d_issuer_signing_acceptance_v1', run_id:run, namespace_uid:h.namespace_uid, bindings,
    registry_sha256:Object.fromEntries(Object.entries(candidates).map(([r, c]) => [r, c.registry_sha256])),
    challenges:{...challenges}, signatures, checks, cleaned:true, keys_retained:true,
    active_config_updated:false, http_service_ready:false, human_mfa_verified:false};
  return {value, context:{run, h, bindings:{...bindings}, candidates, challenges}};
}

test('accepts both independently verified signatures and complete denial matrix', () => {
  const f = fixture();
  assert.equal(validateSigningResult(f.value, f.context), f.value);
});
for (const name of ['invalid-signature', 'cross-signature', 'changed-challenge', 'changed-registry', 'missing-denial',
  'accepted-cross-key', 'unconfirmed-cleanup', 'pretend-activation', 'pretend-http', 'pretend-human-mfa', 'extra-secret', 'changed-source']) {
  test('rejects ' + name, () => {
    const f = fixture(), v = f.value;
    switch (name) {
      case 'invalid-signature': v.signatures.provider = Buffer.alloc(64).toString('base64'); break;
      case 'cross-signature': v.signatures.provider = v.signatures.strong; break;
      case 'changed-challenge': v.challenges.provider = Buffer.from('different').toString('base64'); break;
      case 'changed-registry': v.registry_sha256.provider = '0'.repeat(64); break;
      case 'missing-denial': delete v.checks.strong.revoked; break;
      case 'accepted-cross-key': v.checks.provider.cross_key = 200; break;
      case 'unconfirmed-cleanup': v.cleaned = false; break;
      case 'pretend-activation': v.active_config_updated = true; break;
      case 'pretend-http': v.http_service_ready = true; break;
      case 'pretend-human-mfa': v.human_mfa_verified = true; break;
      case 'extra-secret': v.token = 'must-not-be-accepted'; break;
      case 'changed-source': v.bindings.runner_sha256 = 'b'.repeat(64); break;
    }
    assert.throws(() => validateSigningResult(v, f.context));
  });
}
test('real local candidate files match both pinned hashes and separate public keys', () => {
  const c = readCandidates();
  assert.notEqual(c.provider.key.public_key_base64, c.strong.key.public_key_base64);
});

test('accepts closed failure status and independently reported cleanup', () => {
  const run = 'd-sig-' + 'a'.repeat(24);
  const v = {error:'issuer_signing_failed_or_cleanup_pending', run_id:run, stage:'provider.sign.normal',
    diagnostic:{code:'unexpected_http_status', http_status:403}, cleaned:true};
  assert.equal(validateFailure(v, run), v);
});
for (const name of ['raw-error', 'extra-token', 'wrong-run', 'pretend-cleanup']) test('rejects unsafe failure ' + name, () => {
  const run = 'd-sig-' + 'a'.repeat(24);
  const v = {error:'issuer_signing_failed_or_cleanup_pending', run_id:run, stage:'provider.sign.normal',
    diagnostic:{code:'unexpected_http_status', http_status:403}, cleaned:false};
  if (name === 'raw-error') v.diagnostic.code = 'PRIVATE provider response';
  if (name === 'extra-token') v.diagnostic.token = 'PRIVATE';
  if (name === 'wrong-run') v.run_id = 'other';
  if (name === 'pretend-cleanup') v.cleaned = 'true';
  assert.throws(() => validateFailure(v, run));
});
