import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateStrongIssuerResult} from './system-backup-d-strong-auth-issuer.mjs';

function fixture(){
 const run='d-mfa-'+'a'.repeat(24),installation='installation_test';
 const h={namespace:'test-lab',namespace_uid:'12345678-1234-1234-1234-123456789abc',kms:{endpoint:'https://bao.test-lab.svc:8200'}};
 const bindings={runner_sha256:'b'.repeat(64)};
 const key={fingerprint:'c'.repeat(64),public_key_base64:Buffer.alloc(32,7).toString('base64'),key_path:`transit/keys/${run}-strong-auth-v1`,key_version:'1'};
 const registry={schema_version:'system-backup-strong-auth-issuers.draft.v1',version:run,audience:'system-backup-strong-auth:'+installation,keys:[{issuer:h.kms.endpoint+'/strong-auth/'+run,key_id:h.kms.endpoint+'/'+key.key_path,key_version:'1',purpose:'strong_auth_issuer',public_key_base64:key.public_key_base64,not_before:'2026-09-24T08:00:00Z',not_after:'2026-12-23T08:00:00Z',revoked:false,policy:{methods:['totp'],acr:[],amr:['otp']}}]};
 const value={kind:'d_strong_auth_issuer_key_candidate_v1',run_id:run,namespace:h.namespace,namespace_uid:h.namespace_uid,intent_uid:h.namespace_uid,registry_configmap_uid:h.namespace_uid,bindings,key,key_retained:true,active_config_updated:false,strong_auth_service_ready:false,provider_capability_approved:false,temporary_control_pod_removed:true};
 const update=()=>{value.registry_json=JSON.stringify(registry)+'\n';value.registry_sha256=createHash('sha256').update(value.registry_json).digest('hex');};update();return{value,registry,update,context:{run,installation,h,bindings}};
}
test('independent TOTP candidate accepts exact public result',()=>{const f=fixture();assert.equal(validateStrongIssuerResult(f.value,f.context),f.value)});
for(const name of ['wrong-audience','wrong-purpose','provider-profile','unconfirmed-cleanup','pretend-activation','password-method'])test('reject '+name,()=>{
 const f=fixture();
 switch(name){case 'wrong-audience':f.registry.audience='other';break;case 'wrong-purpose':f.registry.keys[0].purpose='provider_proof_issuer';break;case 'provider-profile':f.registry.keys[0].target_types=['external_action'];break;case 'unconfirmed-cleanup':f.value.temporary_control_pod_removed=false;break;case 'pretend-activation':f.value.active_config_updated=true;break;case 'password-method':f.registry.keys[0].policy.methods=['password'];break}
 f.update();assert.throws(()=>validateStrongIssuerResult(f.value,f.context));
});
