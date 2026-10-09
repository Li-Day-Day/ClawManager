import assert from 'node:assert/strict';
import test from 'node:test';
import { runSpike, validateSpike, expectedChecks } from './system-backup-a-evidence-spike.mjs';
import { readHandoff } from './system-backup-a-provider-handoff-preflight.mjs';
const h=readHandoff(),rid='a-ev-'+'1'.repeat(24);
const base=()=>({kind:'a_evidence_spike_v2',status:'passed',run_id:rid,namespace:h.namespace,namespace_uid:h.namespace_uid,action:'cleanup',observations:[],
  started_at:'2026-09-24T02:00:00Z',finished_at:'2026-09-24T02:00:10Z',failed_stage:'none',checks_passed:[],objects_removed:true,pods_removed:true,
  recovery_intent_retained:false,provider_capability_approved:false,evidence_registered:false,production_scoped_grant_verified:false});

test('shell-free byte SSH transport and nonzero exit never count as success',()=>{
  for(const status of [0,1]) {
    const result=runSpike({host:'root@10.130.14.23',passwordLogin:true,action:'cleanup',runId:rid,run:(cmd,args,opts)=>{
      assert.equal(cmd,'ssh');assert.equal(args.at(-1),'python3 -B -');assert.ok(args.includes('StrictHostKeyChecking=yes'));
      assert.equal(opts.shell,false);assert.equal(opts.input.includes(13),false);
      return {status,stdout:Buffer.from(JSON.stringify(base()))};
    }});
    assert.equal(result.success,status===0);
  }
});
test('reject incomplete cleanup, namespace drift and capability overclaims',()=>{
  for(const patch of [{objects_removed:false},{pods_removed:false},{namespace_uid:'other'},{provider_capability_approved:true},{extra:'secret'}]) {
    assert.throws(()=>validateSpike({...base(),...patch},rid,'cleanup',h));
  }
  assert.throws(()=>validateSpike({...base(),action:'run'},rid,'run',h));
  assert.equal(validateSpike({...base(),action:'run',checks_passed:expectedChecks},rid,'run',h).status,'passed');
  assert.throws(()=>validateSpike({...base(),action:'run',checks_passed:expectedChecks.map((v,i)=>i===0?'invented-check':v)},rid,'run',h));
});
test('malformed remote output and SSH timeout do not reveal response text',()=>{
  for(const result of [{status:1,stdout:Buffer.from('SENSITIVE')},{error:Error('SENSITIVE')}]) {
    assert.throws(()=>runSpike({host:'root@10.130.14.23',passwordLogin:true,action:'cleanup',runId:rid,run:()=>result}),e=>!e.message.includes('SENSITIVE'));
  }
});

test('closed diagnostics retain provider status without free text or headers',()=>{
  const v={...base(),status:'failed',failed_stage:'probe_write_put-bad-checksum',observations:[{role:'write',action:'put-bad-checksum',object:'bad-checksum',http_status:400,error_code:'XAmzContentChecksumMismatch'}]};
  assert.equal(validateSpike(v,rid,'cleanup',h).observations[0].http_status,400);
  for(const patch of [{error_code:'PRIVATE_TEXT'},{http_status:999},{authorization:'PRIVATE_TEXT'},{role:'root'}]) {
    assert.throws(()=>validateSpike({...v,observations:[{...v.observations[0],...patch}]},rid,'cleanup',h));
  }
});
