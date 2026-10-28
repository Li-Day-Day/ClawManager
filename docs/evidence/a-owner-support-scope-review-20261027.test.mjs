import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSupportDeltas,executionControlPaths} from './a-owner-support-scope-review-20261027.mjs';
test('support scopes cannot absorb Go, module locks, or contract changes',()=>{
  const paths=['backend/internal/feature.go','backend/go.mod','backend/go.sum','contracts/system-backup/schema.json',
    'backend/Makefile','scripts/unused.py','scripts/control.ps1','docs/fixture.sql'];
  const {omitted,retained}=splitSupportDeltas(paths.map(path=>({path,before:{path},after:path.endsWith('.py')||path.endsWith('Makefile')?null:{path}})));
  assert.deepEqual(omitted.map(p=>p.path),['backend/Makefile','scripts/unused.py']);
  assert.deepEqual(retained.map(p=>p.path),['scripts/control.ps1','docs/fixture.sql']);
});
test('duplicate support coverage is rejected and approval trust anchor stays outside self-bound execution inventory',()=>{
  const row={path:'scripts/control.ps1',before:null,after:{path:'scripts/control.ps1'}};
  assert.throws(()=>splitSupportDeltas([row,row]));
  assert.equal(new Set(executionControlPaths).size,executionControlPaths.length);
  assert.ok(!executionControlPaths.includes('docs/evidence/a-owner-pre-thin-scope-review-20261027.mjs'));
  assert.ok(executionControlPaths.includes('docs/evidence/d2-owner-current-baseline-supplement-20261027.ps1'));
});
