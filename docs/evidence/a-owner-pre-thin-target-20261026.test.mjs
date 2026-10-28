import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPins,sourceDigest,changesBetween,checkTarget,obligations} from './a-owner-pre-thin-target-20261026.mjs';
const pin=(name,hash='a')=>({path:name,size:1,sha256:hash.repeat(64)});
const old=[pin('backend/a.go'),pin('contracts/a.json')];
const current=[pin('backend/a.go','b'),pin('backend/new.go'),pin('contracts/a.json')];
const draft=()=>({kind:'a_owner_pre_thin_target.v1',status:'pending_native_scope_review',
  source_selection:'d_local_closeout_snapshot.v1',target_files:current,target_sha256:sourceDigest(current),
  deltas:changesBetween(old,current),proofs:[],scope_review:null,post_target_obligations:obligations,
  native_start_authorized:false,current_baseline_ready:false,actual_sql_authorized:false});
test('precise draft cannot authorize native start',()=>assert.equal(checkTarget(draft(),current,old).native_start_authorized,false));
test('new or removed target files cannot hide behind old hashes',()=>{
  assert.throws(()=>checkTarget(draft(),current.slice(1),old));
  assert.throws(()=>checkTarget(draft(),[...current,pin('scripts/new.ps1')],old));
});
test('ordinary edit and contract deletion both need explicit delta rows',()=>{
  const rows=changesBetween(old,[pin('backend/a.go','b')]);
  assert.equal(rows.length,2); assert.equal(rows[1].after,null);
  const d=draft();d.deltas=[];assert.throws(()=>checkTarget(d,current,old));
});
test('self-declared proof or ready status is rejected',()=>{
  for(const patch of [{status:'ready'},{native_start_authorized:true},{scope_review:{}},{proofs:[{passed:true}]}])
    assert.throws(()=>checkTarget({...draft(),...patch},current,old));
});
test('case collisions traversal and malformed digest are rejected',()=>{
  assert.throws(()=>checkPins([pin('backend/A.go'),pin('backend/a.go')]));
  assert.throws(()=>checkPins([pin('backend/../x.go')]));
  assert.throws(()=>checkPins([{...pin('backend/a.go'),sha256:'bad'}]));
});
test('same-size changed bytes and missing obligations are rejected',()=>{
  assert.throws(()=>checkTarget(draft(),[pin('backend/a.go','c'),...current.slice(1)],old));
  assert.throws(()=>checkTarget({...draft(),post_target_obligations:[]},current,old));
});
