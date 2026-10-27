import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {payload, ref, runLifecycle, sources, validateResult} from './system-backup-d-lifecycle.mjs';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';

const h=readHandoff(), bindings=sources().bindings;
const run='d-lc-'+'a'.repeat(24), uid='11111111-1111-1111-1111-111111111111';
const roles=['generate','unwrap','capture','acceptance','catalog'], signers=roles.slice(2);
const start=Date.parse('2026-09-24T01:00:00Z'), iso=s=>new Date(start+s*1000).toISOString();
function fixture() {
  const v={kind:'d_lifecycle_v1',run_id:run,action:'run',status:'passed',started_at:iso(0),finished_at:iso(300),failed_stage:'none',
    namespace:h.namespace,namespace_uid:h.namespace_uid,bindings,owner_uid:uid,endpoint:h.kms.endpoint,ca_sha256:h.ca_sha256,tools_image:h.tools_image,
    context_base64:Buffer.from(h.namespace_uid+'/'+run+'/capture').toString('base64'),identity_refs:{},key_refs:{},pod_refs:{admin:{name:run+'-admin',uid}},lifecycle:[],checks_passed:[],public_proofs:[],events:[],
    cleanup_verified:true,recovery_intent_retained:false,provider_capability_approved:false,evidence_registered:false,production_scoped_grant_verified:false,disaster_recovery_eligible:false,
    audit_rows:[],audit_scope:'provider-file-audit-closed-projection; unsigned-operator-evidence'};
  for(const group of ['revoke','expire','control'])for(const role of roles) {
    v.pod_refs[group+'-'+role]={name:run+'-'+group+'-'+role,uid};
    const ttl={revoke:900,expire:240,control:3600}[group];
    v.identity_refs[group+'-'+role]={secret_ref:{secret_name:run+'-'+group+'-'+role,uid,resource_version:'1'},
      creation_time:start/1000,expire_time:iso(ttl),ttl_seconds:ttl,renewable:false,accessor_hmac:'hmac-sha256:'+'a'.repeat(64)};
  }
  const keys={};
  for(const role of ['kms',...signers])for(const generation of ['old','new']) {
    const name=role+'-'+generation;
    v.key_refs[name]={fingerprint:'b'.repeat(64),ref:ref(h,run,role,generation)};
    if(role!=='kms') {
      keys[name]=generateKeyPairSync('ed25519');
      v.key_refs[name].public_key_base64=keys[name].publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
    }
  }
  for(const generation of ['old','new'])for(const role of signers) {
    const message=payload(h,run,role,generation), name=role+'-'+generation;
    v.public_proofs.push({role,generation,payload_base64:message.toString('base64'),public_key_base64:v.key_refs[name].public_key_base64,
      signature_base64:sign(null,message,keys[name].privateKey).toString('base64')});
  }
  for(const role of roles) {
    v.lifecycle.push({role,revoked_at:iso(5),expiry_positive_at:iso(10),expiry_denied_at:iso(251),elapsed_seconds:251,propagation_tolerance_seconds:10});
    v.checks_passed.push(role+'-revoked-with-control',role+'-expired-with-control');
    for(const type of ['request','response'])v.audit_rows.push({request_id:uid,type,time:iso(5),path:'auth/token/revoke-accessor',operation:'update',identity:'revoke-'+role,error:false});
  }
  v.checks_passed.push('kms-named-ref-cutover-and-history',...signers.map(r=>r+'-named-ref-cutover'));
  v.events.push({path:'auth/token/create',method:'POST',http_status:200,request_id:uid,observed_unix:start/1000,pod:'admin',action:'issue'});
  for(const type of ['request','response'])v.audit_rows.push({request_id:uid,type,time:iso(0),path:'auth/token/create',operation:'update',identity:'control-or-unresolved',error:false});
  return v;
}
const validate=v=>validateResult(v,run,'run',h,bindings);
test('six signatures remain independently verifiable after reported key deletion',()=>{
  const v=fixture();assert.equal(validate(v),v);
  assert.equal(validate(JSON.parse(JSON.stringify(v))).public_proofs.length,6);
});
for(const [name,mutate] of Object.entries({
  signature:v=>v.public_proofs[0].signature_base64=Buffer.alloc(64).toString('base64'),
  purpose:v=>v.public_proofs[0].role='catalog',
  ref:v=>v.key_refs['capture-old'].ref.key_path='transit/keys/d-capture-certificate-v1',
  content:v=>v.public_proofs[0].payload_base64=Buffer.from('tampered').toString('base64'),
  publicKey:v=>v.public_proofs[0].public_key_base64=v.public_proofs[1].public_key_base64,
  duplicateKeys:v=>v.key_refs['acceptance-old'].public_key_base64=v.key_refs['capture-old'].public_key_base64,
  unknownField:v=>v.identity_refs['expire-generate'].token='MUST-NOT-ESCAPE',
  auditLeak:v=>v.audit_rows[0].response={token:'MUST-NOT-ESCAPE'},
  unrelatedPath:v=>v.events[0].path='transit/keys/production',
  earlyExpiry:v=>v.lifecycle[0].expiry_denied_at=iso(100),
  fakeExpiryRevoke:v=>v.audit_rows.push({...v.audit_rows[0],identity:'expire-generate',time:iso(200)}),
  renewable:v=>v.identity_refs['expire-generate'].renewable=true,
  cleanupFailed:v=>v.cleanup_verified=false,
  approval:v=>v.provider_capability_approved=true,
  sourceDrift:v=>v.bindings={...bindings,client_sha256:'0'.repeat(64)},
  missingAuditResponse:v=>v.audit_rows=v.audit_rows.filter(r=>r.type!=='response'),
  missingCheck:v=>v.checks_passed.pop(),
}))test('rejects '+name,()=>{const v=fixture();mutate(v);assert.throws(()=>validate(v));});
test('failed result preserves partial progress without promoting to pass',()=>{
  const v=fixture();v.status='failed';v.failed_stage='probe';v.checks_passed=[];v.public_proofs=[];v.lifecycle=[];
  assert.equal(validate(v).status,'failed');
});
test('SSH nonzero overrides a valid result; private transport and byte normalization',()=>{
  let called=false;
  const result=runLifecycle({host:'root@10.130.14.23',passwordLogin:false,action:'run',runId:run,run(cmd,args,opts){
    called=true;assert.equal(cmd,'ssh');assert.equal(args.at(-1),'python3 -B -');assert.equal(opts.shell,false);
    assert.ok(Buffer.isBuffer(opts.input));assert.ok(!opts.input.includes(13));assert.equal(opts.stdio[1],'pipe');
    return {status:1,stdout:JSON.stringify(fixture())};
  }});
  assert.ok(called);assert.equal(result.success,false);
});
test('raw remote output is never forwarded',()=>{
  assert.throws(()=>runLifecycle({host:'root@10.130.14.23',passwordLogin:false,action:'run',runId:run,
    run:()=>({status:1,stdout:'root_token=MUST-NOT-ESCAPE'})}),e=>!e.message.includes('MUST-NOT-ESCAPE'));
});
