import assert from 'node:assert/strict';
export const ownerSeedNames=Object.freeze(['TestASQLTaskDownloadOwnersMySQLSeed','TestADownloadAdmissionMySQLSeed',...['detached_embedded_config','historical_config_projection','independent_encrypted_object'].map(n=>'TestADownloadAdmissionMySQLSeed/'+n),'TestASensitiveDownloadMFAMySQLSeed',...['actual_config_required_cells','duplicate','unknown','trailing','catalog','ddl','budget'].map(n=>'TestASensitiveDownloadMFAMySQLSeed/'+n)].sort());
export function validateOwnerDetached(bytes){
 const text=bytes.toString('utf8').replace(/^\uFEFF/,'');
 assert.doesNotMatch(text,/--- (?:FAIL|SKIP):|^FAIL|^panic:|^fatal error:|flag provided but not defined/m);
 assert.match(text,/^PASS\s*$/m);
 for(const regex of [/^=== RUN\s+(\S+)\s*$/gm,/^\s*--- PASS: (\S+) /gm])assert.deepEqual([...text.matchAll(regex)].map(m=>m[1]).sort(),ownerSeedNames,'detached original seed inventory differs');
 return [...ownerSeedNames];
}
export function validateOwnerCounterexample(bytes,target,nativeExit){
 assert.ok(['TestDownloadGCFinalizerProtectedCandidate/worker_claim','TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback'].includes(target));
 assert.equal(nativeExit,1,'counterexample requires native assertion failure exit');
 const events=bytes.toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
 assert.ok(events.length>0);assert.ok(events.every(e=>e.Package==='clawreef/internal/systembackupevidence'));
 assert.ok(!events.some(e=>['skip','build-fail','build-output'].includes(e.Action)));
 const parent=target.slice(0,target.lastIndexOf('/')),names=[parent,target].sort();
 for(const action of ['run','fail'])assert.deepEqual(events.filter(e=>e.Test&&e.Action===action).map(e=>e.Test).sort(),names,'counterexample failed/run test set differs');
 assert.equal(events.filter(e=>e.Action==='pass').length,0,'counterexample cannot contain passing test/package claims');
 assert.equal(events.filter(e=>!e.Test&&e.Action==='fail').length,1);assert.equal(events.at(-1).Action,'fail');assert.equal(events.at(-1).Test,undefined);
 const output=events.filter(e=>e.Action==='output').map(e=>e.Output??'').join('');
 assert.doesNotMatch(output,/panic:|fatal error:|flag provided but not defined|(?:vet|compile|asm)\.exe: exit status/i);
 const leafOutput=events.filter(e=>e.Test===target&&e.Action==='output').map(e=>e.Output??'').join('');
 assert.match(leafOutput,/post-ticket failure escaped exact shared rollback/);assert.match(leafOutput,/Transaction:committed/);
 return {target,parent,native_exit:1,assertion_not_build_failure:true,unsafe_single_regression_commit_observed:true};
}
