// Synthetic parser examples remain in memory, never actual SQL/local receipts.
import test from 'node:test';import assert from 'node:assert/strict';
import {ownerSeedNames,validateOwnerDetached,validateOwnerCounterexample} from './a-owner-finalizer-native-20261026.mjs';
const detached=()=>Buffer.from(ownerSeedNames.map(n=>'=== RUN   '+n+'\n--- PASS: '+n+' (0.00s)').join('\n')+'\nPASS\n');
test('both exact detached inventories validate',()=>assert.deepEqual(validateOwnerDetached(detached()),ownerSeedNames));
for(const [name,mutate]of [
 ['missing seed',s=>s.replace('=== RUN   '+ownerSeedNames[0]+'\n','')],
 ['duplicate seed',s=>'=== RUN   '+ownerSeedNames[0]+'\n'+s],
 ['skip appended',s=>s+'--- SKIP: hidden (0.00s)\n'],
 ['argv error',s=>s+'flag provided but not defined: -test\n'],
 ['no native PASS',s=>s.replace('\nPASS\n','\n')],
])test('detached rejects '+name,()=>assert.throws(()=>validateOwnerDetached(Buffer.from(mutate(detached().toString())))));
const targets=['TestDownloadGCFinalizerProtectedCandidate/worker_claim','TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback'];
const fixture=target=>{const parent=target.slice(0,target.lastIndexOf('/')),Package='clawreef/internal/systembackupevidence';return [{Package,Action:'start'},{Package,Action:'run',Test:parent},{Package,Action:'run',Test:target},{Package,Action:'output',Test:target,Output:'post-ticket failure escaped exact shared rollback: <nil> {Transaction:committed Unlock:confirmed}\n'},{Package,Action:'fail',Test:target},{Package,Action:'fail',Test:parent},{Package,Action:'fail'}];};
const bytes=e=>Buffer.from(e.map(x=>JSON.stringify(x)).join('\n')+'\n');
for(const target of targets)test('specific single-regression assertion validates '+target,()=>assert.equal(validateOwnerCounterexample(bytes(fixture(target)),target,1).assertion_not_build_failure,true));
for(const [name,mutate,exit=1]of [
 ['native success',()=>{},0],
 ['different package',e=>{e[0].Package='other/package'}],
 ['build failure',e=>{e.splice(1,0,{Package:e[0].Package,Action:'build-fail'})}],
 ['skipped leaf',e=>{e[4].Action='skip'}],
 ['unrelated failed leaf',e=>{e.splice(5,0,{Package:e[0].Package,Action:'fail',Test:'Unrelated'})}],
 ['compile error instead of assertion',e=>{e[3].Output='vet.exe: exit status 0xc000026b'}],
 ['rollback instead of unsafe commit',e=>{e[3].Output=e[3].Output.replace('Transaction:committed','Transaction:rolled_back')}],
 ['missing parent fail',e=>{e.splice(5,1)}],
])test('counterexample rejects '+name,()=>{const e=fixture(targets[0]);mutate(e);assert.throws(()=>validateOwnerCounterexample(bytes(e),targets[0],exit));});
