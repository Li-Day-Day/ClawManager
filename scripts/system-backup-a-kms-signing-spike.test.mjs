import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readHandoff} from './system-backup-a-provider-handoff-preflight.mjs';
import {expectedChecks,validateResult,runSpike} from './system-backup-a-kms-signing-spike.mjs';
const runId='a-ks-'+'1'.repeat(24);
function fixture() {
  const h=structuredClone(readHandoff());
  const proofs=Object.keys(h.signing).map(purpose=>{
    const {publicKey,privateKey}=generateKeyPairSync('ed25519');
    h.signing[purpose].public_key_base64=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
    return {purpose,signature:sign(null,Buffer.from(`A-provider-spike/${runId}/${purpose}`),privateKey).toString('base64')};
  });
  const v={kind:'a_kms_signing_spike_v1',status:'passed',run_id:runId,namespace:h.namespace,namespace_uid:h.namespace_uid,action:'run',started_at:'2026-09-24T03:00:00Z',finished_at:'2026-09-24T03:01:00Z',failed_stage:'none',checks_passed:expectedChecks,observations:[],public_proofs:proofs,pods_removed:true,recovery_intent_retained:false,provider_capability_approved:false,evidence_registered:false,production_scoped_grant_verified:false,token_lifecycle_verified:false,rotation_history_verified:false};
  return {h,v};
}
test('three independent signatures, tamper controls and stripped public proofs',()=>{
  const {h,v}=fixture();
  const result=validateResult(v,runId,'run',h);
  assert.equal(result.independent_ed25519_verified.length,3);
  assert.equal(result.public_proofs,undefined);
  v.public_proofs[0].signature=v.public_proofs[1].signature;
  assert.throws(()=>validateResult(v,runId,'run',h));
});
test('wrong version, identity, cleanup, partial checks, extra output rejected',()=>{
  const {h,v}=fixture();
  for(const delta of [{namespace_uid:'wrong'},{pods_removed:false},{checks_passed:expectedChecks.slice(1)},{token_lifecycle_verified:true},{secret:'never allowed'}])
    assert.throws(()=>validateResult({...v,...delta},runId,'run',h));
  const replay=structuredClone(v); replay.run_id='a-ks-'+'2'.repeat(24);
  assert.throws(()=>validateResult(replay,replay.run_id,'run',h));
});
test('SSH byte transport and nonzero exit cannot pass',()=>{
  const h=readHandoff();
  const {v}=fixture();
  Object.assign(v,{action:'cleanup',checks_passed:[],public_proofs:[]});
  const result=runSpike({host:'root@10.130.14.23',passwordLogin:true,action:'cleanup',runId,run:(cmd,args,options)=>{
    assert.equal(options.shell,false); assert(Buffer.isBuffer(options.input)); assert(!options.input.includes(13));
    assert.equal(args.at(-1),'python3 -B -');
    return {status:1,stdout:JSON.stringify(v)};
  }});
  assert.equal(result.success,false);
  assert.throws(()=>runSpike({host:'root@10.130.14.23',action:'run',runId,run:()=>({status:0,stdout:'SECRET'})}));
});
