// Offline policy/request preparation for public-c-crypto.v1. No credentials,
// provider I/O or authorization decisions. Inputs must come from admitted
// deployment mapping and the original frozen task context, never an Admin DTO.
import {canonical, sha, exact} from './system-backup-c-crypto-wire.mjs';

const keyFields = ['provider','identity_hash','registry_version','provider_key_id','provider_version'];
const contextFields = ['origin_installation_id','backup_public_id','attempt_no','phase','part','part_index','envelope_id','capture_context_hash'];
const digest = /^[0-9a-f]{64}$/;
const text = (s, n=256) => typeof s === 'string' && s.length > 0 && s.isWellFormed() && Buffer.byteLength(s) <= n;

export function backupTransitPlan(mapping, request) {
  exact(mapping, ['installation','key_name','key']);
  exact(request, ['key','context']);
  exact(mapping.key, keyFields);
  exact(request.key, keyFields);
  exact(request.context, contextFields);
  const k = request.key, c = request.context;
  if (!text(mapping.installation) || typeof mapping.key_name !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(mapping.key_name) ||
      keyFields.some(f => !text(k[f])) || contextFields.some(f => !text(c[f])) ||
      k.provider !== 'external-kms' || canonical(k) !== canonical(mapping.key) ||
      !digest.test(k.identity_hash) || !digest.test(c.capture_context_hash) ||
      c.origin_installation_id !== mapping.installation || !/^sbk_[A-Za-z0-9_-]+$/.test(c.backup_public_id) ||
      !/^[1-9][0-9]*$/.test(c.attempt_no) || !/^(0|[1-9][0-9]*)$/.test(c.part_index) ||
      !/^[1-9][0-9]*$/.test(k.provider_version) || BigInt(k.provider_version) > 4294967295n) throw Error('binding_mismatch');
  // Exact C context plus the hash of the complete KEK binding. No framing AAD
  // hash is substituted for this object; the two byte formats serve different uses.
  const contextJSON = canonical({...c, kek_binding_sha256: sha(canonical(k))});
  const context = Buffer.from(contextJSON, 'utf8').toString('base64');
  const generatePath = 'transit/datakey/plaintext/' + mapping.key_name;
  const unwrapPath = 'transit/decrypt/' + mapping.key_name;
  const rule = parameters => ({capabilities:['update'], required_parameters:Object.keys(parameters), allowed_parameters:parameters});
  return {
    status:'review_only_not_authorized', contract:'public-c-crypto.v1',
    request:structuredClone(request), context_json:contextJSON, context_base64:context,
    generate_request:{path:generatePath, body:{context,bits:'256',key_version:k.provider_version}},
    generate_policy:{path:{[generatePath]:rule({context:[context],bits:['256'],key_version:[k.provider_version]})}},
    unwrap_policy:{path:{[unwrapPath]:rule({context:[context],ciphertext:['vault:v'+k.provider_version+':*']})}},
    limits:['Same originating Job callback only; never send plaintext DEK to a controller/another Pod.',
      'Original current authority, expiry and revocation must be checked before and after provider and callback.',
      'No sign/encrypt/key-management/export/token-creation permission; no generate-to-wrap fallback.',
      'Verify deployed OpenBao version and string parameter ACL semantics before attaching either policy.']
  };
}

export function backupTransitUnwrapRequest(mapping, expected, wrapped) {
  exact(wrapped, ['request','algorithm','ciphertext']);
  const plan = backupTransitPlan(mapping, expected);
  if (canonical(wrapped.request) !== canonical(expected) || wrapped.algorithm !== 'provider-native' || typeof wrapped.ciphertext !== 'string') throw Error('binding_mismatch');
  const prefix = 'vault:v' + expected.key.provider_version + ':';
  if (!wrapped.ciphertext.startsWith(prefix)) throw Error('binding_mismatch');
  const encoded = wrapped.ciphertext.slice(prefix.length);
  // The admitted key profile is derived AES-256-GCM: nonce12 + DEK32 + tag16.
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== 60 || bytes.toString('base64') !== encoded) throw Error('integrity_failed');
  return {path:Object.keys(plan.unwrap_policy.path)[0],body:{context:plan.context_base64,ciphertext:wrapped.ciphertext}};
}
