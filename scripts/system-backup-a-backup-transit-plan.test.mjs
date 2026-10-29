import test from 'node:test';
import assert from 'node:assert/strict';
import {backupTransitPlan,backupTransitUnwrapRequest} from './system-backup-a-backup-transit-plan.mjs';
import {canonical,sha} from './system-backup-c-crypto-wire.mjs';
const key={provider:'external-kms',identity_hash:'a'.repeat(64),registry_version:'registry-r17',provider_key_id:'provider-key-id',provider_version:'3'};
const mapping={installation:'installation_synthetic',key_name:'synthetic-backup-kek',key};
const request={key,context:{origin_installation_id:mapping.installation,backup_public_id:'sbk_example01',attempt_no:'1',phase:'capture',part:'mysql',part_index:'0',envelope_id:'env_test',capture_context_hash:'c'.repeat(64)}};
test('exact C context and separate generate/unwrap paths',()=>{
 const p=backupTransitPlan(mapping,request);
 assert.equal(Buffer.from(p.context_base64,'base64').toString(),canonical({...request.context,kek_binding_sha256:sha(canonical(key))}));
 assert.equal(p.generate_request.body.key_version,'3');
 assert.equal(p.generate_request.body.bits,'256');
 assert.deepEqual(Object.keys(p.generate_policy.path),['transit/datakey/plaintext/synthetic-backup-kek']);
 assert.deepEqual(Object.keys(p.unwrap_policy.path),['transit/decrypt/synthetic-backup-kek']);
 assert.deepEqual(Object.values(p.generate_policy.path)[0].capabilities,['update']);
 assert.equal(p.status,'review_only_not_authorized');
});
for (const [field,value] of [['provider','external-secret'],['identity_hash','b'.repeat(64)],['registry_version','registry-r18'],['provider_key_id','other'],['provider_version','4']]) test('reject key change '+field,()=>{
 const r=structuredClone(request);r.key[field]=value;assert.throws(()=>backupTransitPlan(mapping,r));
});
for (const [field,value] of [['origin_installation_id','installation_other'],['attempt_no','01'],['part_index','-1'],['capture_context_hash','invalid'],['backup_public_id','other'],['phase','']]) test('reject context '+field,()=>{
 const r=structuredClone(request);r.context[field]=value;assert.throws(()=>backupTransitPlan(mapping,r));
});
for (const version of ['0','01','4294967296','v3']) test('reject noncanonical provider version '+version,()=>{
 const r=structuredClone(request),m=structuredClone(mapping);r.key.provider_version=m.key.provider_version=version;assert.throws(()=>backupTransitPlan(m,r));
});
test('historical unwrap uses trusted exact request and version',()=>{
 const wrapped={request:structuredClone(request),algorithm:'provider-native',ciphertext:'vault:v3:'+Buffer.alloc(60,7).toString('base64')};
 assert.equal(backupTransitUnwrapRequest(mapping,request,wrapped).body.ciphertext,wrapped.ciphertext);
 for (const change of [w=>w.request.context.envelope_id='other',w=>w.algorithm='AES-256-KW',w=>w.ciphertext=w.ciphertext.replace('v3:','v4:'),w=>w.ciphertext+='=']) {
  const w=structuredClone(wrapped);change(w);assert.throws(()=>backupTransitUnwrapRequest(mapping,request,w));
 }
});
test('unknown fields and key-path injection rejected',()=>{
 assert.throws(()=>backupTransitPlan({...mapping,key_name:'../keys'},request));
 assert.throws(()=>backupTransitPlan(mapping,{...request,token:'not-allowed'}));
});
