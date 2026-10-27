import test from 'node:test';
import assert from 'node:assert/strict';
import {proofForDelta} from './a-owner-pre-thin-scope-assemble-20261027.mjs';
test('unknown functional changes cannot borrow a broad parent or support label',()=>{
  for(const path of ['backend/internal/new_owner/unreviewed.go','backend/go.mod','backend/go.sum','contracts/system-backup/new.json'])
    assert.throws(()=>proofForDelta({path,after:{path}}),/needs a new exact native proof/);
});
test('GC and excluded support remain limited to their own proof profiles',()=>{
  assert.equal(proofForDelta({path:'backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go',after:{}}),'gc_two_components');
  assert.equal(proofForDelta({path:'backend/Makefile',after:null}),'support_omissions');
  assert.equal(proofForDelta({path:'scripts/control.ps1',after:{}}),'support_retained');
});
