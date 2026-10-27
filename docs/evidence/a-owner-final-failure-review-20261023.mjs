import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const stem='docs/evidence/a-owner-final-full-local-20261023-144309';
const bytes=read(stem+'.txt'),log=bytes.toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n'),source=json(stem+'-source.json');
assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);
assert.equal(sha(source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),source.source_sha256);
assert.match(log,/^a_owner_full_local_exit=1\s*$/m);assert.match(log,/^End time: 20261023162054\s*$/m);
assert.match(log,/^ok\s+clawreef\/internal\/systembackupsecurity\s+730\.708s$/m);
assert.match(log,/^FAIL\s+clawreef\/internal\/systembackupevidence\s+2717\.161s$/m);
assert.match(log,/^panic: test timed out after 45m0s$/m);
const failed=[...log.matchAll(/^\s*--- FAIL: (\S+) \([0-9.]+s\)$/gm)].map(m=>m[1]).sort();
const expected=[
 'TestAdmittedDownloadHTTPInterruptionRevocationAndResultFailure',
 'TestAdmittedDownloadHTTPInterruptionRevocationAndResultFailure/result_failure',
 'TestADownloadNativeBufferedOutputKeepsOriginalDeadline',
 'TestADownloadNativeBufferedOutputKeepsOriginalDeadline/http1/result_crosses_deadline',
 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback',
 'TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/complete',
].sort();assert.deepEqual(failed,expected);
for(const s of ['wrong response 503','result did not follow the native write deadline','paired independent producer result capacity_exceeded','CLEANED local-registration-build-cache=True'])assert.ok(log.includes(s));
const owner=[...log.matchAll(/^LOCAL_OWNER config-writer-source=(.+)$/gm)];assert.equal(owner.length,1);
const owned=owner[0][1];assert.equal(path.dirname(owned),root);assert.match(path.basename(owned),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(fs.existsSync(owned),false);assert.ok(log.includes('LOCAL_CLEANUP config-writer-source-owned='+owned+' removed=True'));
assert.ok(!/^RUN namespace=|^LOCAL_PASS a-download-owners-unit-tests=yes|^LOCAL_PASS config-standalone-seed=yes/m.test(log));
const report={kind:'a_owner_final_local_failure_review.v1',status:'terminal_failed_original_frozen_owner_gate_not_a_baseline',native_outer_exit:1,source_sha256:source.source_sha256,source_files:source.files.length,security_package:{passed:true,elapsed_seconds:730.708},evidence_package:{passed:false,elapsed_seconds:2717.161,timeout_seconds:2700},failed_tests:failed,failure_details:['admitted HTTP result_failure returned 503 before expected response','http1 result_crosses_deadline did not observe the native original deadline','producer independent result rejected capacity observation','evidence timed out during Windows test temporary-file cleanup'],tagged_owner_seeds_executed:false,detached_owner_seeds_executed:false,linux_owner_probe_built:false,migration_runner_built:false,outer_owner_independently_absent:true,inner_cache_cleanup_reported:true,actual_SQL:false,production_approved:false,dependencies_installed:false,current_baseline_registered:false,current_collect_source_covered:false,test_failure_root_cause:'under_investigation_not_classified_as_safe_retry',evidence:[stem+'.txt',stem+'-source.json','docs/evidence/a-owner-final-failure-review-20261023.mjs'].map(pin)};
const out='docs/evidence/a-owner-final-failure-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(out),report);}
console.log('A_OWNER_FINAL_FAILURE_REVIEW leaves=3 timeout=2700 cleanup=yes baseline_registered=no actual_SQL=no');
