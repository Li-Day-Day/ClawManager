import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateIssuerResult} from './system-backup-d-provider-issuer.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
function fixture(){
  const run='d-issuer-'+'a'.repeat(24),installation='installation_synthetic';
  const h={namespace:'sbk-provider-zh-synthetic',namespace_uid:'11111111-1111-4111-8111-111111111111',kms:{endpoint:'https://bao.synthetic.svc:8200'}},bindings={runner_sha256:'a'.repeat(64)};
  const key={fingerprint:'b'.repeat(64),public_key_base64:Buffer.alloc(32,7).toString('base64'),key_path:`transit/keys/${run}-provider-proof-v1`,key_version:'1'};
  const registry={schema_version:'system-backup-provider-issuers.draft.v1',version:run,scope:{installation_id:installation,audience:'system-backup-provider-proof'},keys:[{issuer:`${h.kms.endpoint}/provider-proof/${run}`,key_id:`${h.kms.endpoint}/${key.key_path}`,key_version:'1',purpose:'provider_proof_issuer',public_key_base64:key.public_key_base64,not_before:'2026-09-24T00:00:00Z',not_after:'2026-12-23T00:00:00Z',revoked:false,target_types:['external_action','backup_staging','restore_resource'],proof_types:['provider_presence','provider_absence','ownership']}]};
  const registry_json=JSON.stringify(registry)+'\n';
  return {context:{run,installation,h,bindings},value:{kind:'d_provider_issuer_key_candidate_v1',run_id:run,namespace:h.namespace,namespace_uid:h.namespace_uid,intent_uid:h.namespace_uid,registry_configmap_uid:h.namespace_uid,bindings,registry_json,registry_sha256:sha(registry_json),key,key_retained:true,active_config_updated:false,attestation_service_ready:false,provider_capability_approved:false,temporary_control_pod_removed:true}};
}
test('issuer candidate retains exact registry bytes and explicitly excludes activation',()=>{const {value,context}=fixture();assert.equal(validateIssuerResult(value,context),value);});
for(const field of ['active_config_updated','attestation_service_ready','provider_capability_approved','temporary_control_pod_removed','namespace_uid','registry_sha256'])test(`reject changed ${field}`,()=>{const {value,context}=fixture();value[field]=typeof value[field]==='boolean'?!value[field]:'c'.repeat(64);assert.throws(()=>validateIssuerResult(value,context));});
test('reject a signing key for another purpose even with matching new digest',()=>{const {value,context}=fixture();const r=JSON.parse(value.registry_json);r.keys[0].purpose='capture_certificate';value.registry_json=JSON.stringify(r);value.registry_sha256=sha(value.registry_json);assert.throws(()=>validateIssuerResult(value,context));});
test('reject raw provider/secret fields in response',()=>{const {value,context}=fixture();value.key.token='SYNTHETIC';assert.throws(()=>validateIssuerResult(value,context));});
