// Public C v1 executable wire reference. No network, credentials or provider ACL.
import { createHash, createPublicKey, verify, createCipheriv, createDecipheriv } from 'node:crypto';

export const domains = Object.freeze({
  capture_certificate: 'clawmanager.system-backup.capture_certificate.v1',
  acceptance_record: 'clawmanager.system-backup.acceptance.v1',
  catalog_record: 'clawmanager.system-backup.catalog_record.v1',
});
export const sha = b => createHash('sha256').update(b).digest('hex');
export const b64 = b => Buffer.from(b).toString('base64url');
export function decode64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw Error('base64url');
  const b = Buffer.from(s, 'base64url');
  if (b64(b) !== s) throw Error('base64url');
  return b;
}
// Contract numbers are nonnegative IEEE-754 safe integers. Keys sort by UTF-16
// code units, as required by JCS. Reject lone surrogates rather than replace them.
export function canonical(v) {
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') {
    if (!v.isWellFormed()) throw Error('unicode');
    return JSON.stringify(v);
  }
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || v < 0 || Object.is(v, -0)) throw Error('number');
    return String(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (!v || Object.getPrototypeOf(v) !== Object.prototype) throw Error('json');
  return '{' + Object.keys(v).sort().map(k => canonical(k) + ':' + canonical(v[k])).join(',') + '}';
}
export function exact(v, names) {
  if (!v || Array.isArray(v) || Object.keys(v).sort().join(',') !== [...names].sort().join(',')) throw Error('fields');
}
export function signing(payload, purpose, keyID, version) {
  if (!Object.hasOwn(domains, purpose) || !keyID || !version) throw Error('binding');
  const header = {alg: 'EdDSA', key_version: version, kid: keyID, purpose, typ: domains[purpose]};
  const protectedHeader = b64(canonical(header));
  const payload64 = b64(canonical(payload));
  return {header, protectedHeader, payload64, input: protectedHeader + '.' + payload64};
}
export function verifyRecord(raw, trust, expected, now, mode = 'historical') {
  // Wire objects are canonical: also rejects duplicate names and ignored bytes.
  const record = JSON.parse(raw);
  if (canonical(record) !== raw) throw Error('noncanonical');
  exact(record, ['payload', 'signature']);
  const {payload: p, signature: s} = record;
  exact(s, ['algorithm','key_purpose','key_id','key_version','domain_separator','protected_header','value']);
  const purpose = expected.purpose;
  if (trust.revoked || trust.installation !== expected.installation || trust.purpose !== purpose ||
      trust.key_id !== expected.key_id || trust.key_version !== expected.key_version ||
      trust.provider_version !== expected.provider_version) throw Error('trust');
  const time = p.decision_at ?? p.issued_at ?? p.recorded_at;
  if (!Number.isFinite(Date.parse(time)) || !(Date.parse(trust.not_before) <= Date.parse(time) && Date.parse(time) < Date.parse(trust.not_after))) throw Error('key-time');
  if (mode !== 'historical' && mode !== 'job') throw Error('mode');
  if (mode === 'job' && (purpose !== 'capture_certificate' || !(Date.parse(time) <= Date.parse(now) && Date.parse(now) < Date.parse(p.expires_at)))) throw Error('expired');
  if (p.origin_installation_id !== undefined && p.origin_installation_id !== expected.installation) throw Error('installation');
  // Acceptance v1 has no installation field: bind via trusted manifest/task.
  if (p.backup_public_id !== expected.backup_public_id || p.attempt_no !== expected.attempt_no) throw Error('task');
  if (purpose === 'acceptance_record' && (p.manifest_checksum !== expected.manifest_checksum || p.marker_checksum !== expected.marker_checksum)) throw Error('artifact');
  exact(p.signing_key, ['purpose','key_id','key_version']);
  if (p.signing_key.purpose !== purpose || p.signing_key.key_id !== trust.key_id || p.signing_key.key_version !== trust.key_version) throw Error('payload-key');
  const bytes = signing(p, purpose, trust.key_id, trust.key_version);
  if (s.algorithm !== 'EdDSA' || s.key_purpose !== purpose || s.key_id !== trust.key_id || s.key_version !== trust.key_version || s.domain_separator !== domains[purpose] || s.protected_header !== bytes.protectedHeader) throw Error('header');
  const signature = decode64(s.value);
  const publicBytes = decode64(trust.public_key_base64url);
  if (signature.length !== 64 || publicBytes.length !== 32) throw Error('key-size');
  const key = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),publicBytes]),format:'der',type:'spki'});
  if (!verify(null, Buffer.from(bytes.input), key, signature)) throw Error('signature');
  return p; // Caller MUST also validate the closed payload schema and business facts.
}
const u32 = n => { if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw Error('u32'); const b=Buffer.alloc(4);b.writeUInt32BE(n);return b; };
const u64 = n => { if (!Number.isSafeInteger(n) || n < 0) throw Error('u64'); const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(n));return b; };
const lp = s => { const b=Buffer.from(s);return Buffer.concat([u32(b.length),b]); };
export const bindingFields = ['schema_version','origin_installation_id','backup_public_id','attempt_no','phase','part','part_index','path','envelope_id','capture_context_hash','kek_binding_sha256'];
export function aad(binding, index, length, final) {
  exact(binding, bindingFields);
  for (const field of bindingFields) {
    const value = binding[field];
    if (typeof value !== 'string' || !value.length || !value.isWellFormed() || Buffer.byteLength(value)>4096) throw Error('aad-field');
  }
  if (binding.schema_version !== 'aes-gcm-chunked.v1' || !/^[1-9][0-9]*$/.test(binding.attempt_no) || !/^(0|[1-9][0-9]*)$/.test(binding.part_index) ||
      !/^[0-9a-f]{64}$/.test(binding.capture_context_hash) || !/^[0-9a-f]{64}$/.test(binding.kek_binding_sha256) ||
      binding.path.startsWith('/') || binding.path.includes('\\') || binding.path.split('/').some(p=>!p || p==='.' || p==='..') ||
      length>1048576 || typeof final !== 'boolean' || (final ? length!==0 : length===0)) throw Error('aad-binding');
  return Buffer.concat([lp('clawmanager.system-backup.chunk.v1'), ...bindingFields.map(k=>lp(binding[k])), u64(index),u32(length),Buffer.from([Number(final)])]);
}
// One frame, including authenticated EOF. Fresh random nonce is supplied by the
// production caller; deterministic nonces are ONLY for checked-in test vectors.
export function sealFrame(key, nonce, binding, index, plain, final=false) {
  if (key.length!==32 || nonce.length!==12) throw Error('size');
  const associated=aad(binding,index,plain.length,final);
  const c=createCipheriv('aes-256-gcm',key,nonce);c.setAAD(associated);
  const body=Buffer.concat([c.update(plain),c.final()]);
  return Buffer.concat([Buffer.from('CMBKGC01'),u32(41),u64(index),u32(plain.length),u32(body.length),Buffer.from([Number(final)]),nonce,body,c.getAuthTag()]);
}
export function openFrame(key, frame, binding, expectedIndex) {
  if (frame.length<57 || frame.subarray(0,8).toString()!=='CMBKGC01' || frame.readUInt32BE(8)!==41 || frame.readBigUInt64BE(12)!==BigInt(expectedIndex)) throw Error('frame');
  const n=frame.readUInt32BE(20), c=frame.readUInt32BE(24), flag=frame[28];
  if (flag>1 || c!==n || frame.length!==41+n+16) throw Error('length');
  const d=createDecipheriv('aes-256-gcm',key,frame.subarray(29,41));
  d.setAAD(aad(binding,expectedIndex,n,flag===1));d.setAuthTag(frame.subarray(-16));
  return Buffer.concat([d.update(frame.subarray(41,-16)),d.final()]);
}

// Bounded in-memory conformance reader. Production readers stream into isolated
// staging and release the destination only after authenticated EOF and index QA.
export function openStream(key, frames, binding) {
  if (!frames.length || frames.at(-1)[28]!==1 || frames.slice(0,-1).some(f=>f[28]!==0)) throw Error('eof');
  return Buffer.concat(frames.map((f,i)=>openFrame(key,f,binding,i)));
}
