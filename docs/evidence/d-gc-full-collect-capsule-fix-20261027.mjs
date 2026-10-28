import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const repo=path.resolve(import.meta.dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=fs.readFileSync(path.join(repo,p));return {path:p,size:b.length,sha256:sha(b)};};
const file='backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go';
const before={path:file,size:23173,sha256:'e9806c4892ac770ae2f3cf97e9bcb6ba2f123d125b6d5a00d9533e055d9bdf09'};
const after={path:file,size:25657,sha256:'4efec42b77082c31ea9d73f4274a9e2f06afa191d87c0a03d875a27001994505'};
assert.deepEqual(pin(file),after);
const source=fs.readFileSync(path.join(repo,file),'utf8');
const start=source.indexOf('// Keep the same committed admission/result');
const end=source.indexOf('func TestDDownloadGCFullCollectMySQLSeed(',start);
assert.ok(start>=0&&end>start);
const factory=source.slice(start,end);
for(const token of ['newAdmissionTxFixtureWithConfig','admissionConfigBytes(t, input.EffectiveConfig, rbac)','NewSQLDownloadAuthority','f.service.Admit(f.request)','resultFixture(t, f).Finish','newRetentionGCFixtureFromGroup(t, f, committed.operationID, time.Hour)'])assert.ok(factory.includes(token),token);
assert.doesNotMatch(factory,/os\.ReadFile|os\.Chdir|\.Skip\(|docs\/|\.\.\//);
const decode='\tinput, err := decodeADownloadMFAInputs(aDownloadMFASeed)\n\tdGCFreezeOK(t, err)\n';
assert.equal(source.split(decode).length,2);
const call='m := dGCColdModelFixture(t, input)';assert.equal(source.split(call).length,3);
const reversed=source.slice(0,start)+source.slice(end);
const old=reversed.replace('\t"path/filepath"\n','').replace(decode,'').replaceAll(call,'m := newRetentionGCFixture(t)');
assert.equal(Buffer.byteLength(old),before.size);assert.equal(sha(Buffer.from(old)),before.sha256,'change outside the private fixture/source substitution');
const reviewPath='docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json';
const reviewed=JSON.parse(fs.readFileSync(path.join(repo,reviewPath),'utf8'));
assert.deepEqual(reviewed.original_files.find(p=>p.path===file),before);
const protectedPaths=[
 'backend/internal/systembackupevidence/download_admission_transaction_model_test.go',
 'backend/internal/systembackupevidence/download_committed_test.go',
 'backend/internal/systembackupevidence/download_retention_group_test.go',
 'backend/internal/systembackupevidence/download_retention_gc_test.go',
 'backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go',
 'backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json',
 'scripts/system-backup-d-gc-full-collect-receiver.mjs',
];
for(const p of protectedPaths)assert.deepEqual(pin(p),reviewed.original_files.find(f=>f.path===p),'protected shared input changed: '+p);
const log='docs/evidence/d-gc-full-lifecycle-remote-5c1c51457b1f42aa94223469a5f2ae92.txt';
const failed=fs.readFileSync(path.join(repo,log),'utf8').replace(/^\uFEFF/,'');
assert.match(failed,/download_admission_transaction_model_test\.go:748: open .*a-config-canonical-request-vectors/);
assert.match(failed,/gc_full_lifecycle_exit=1/);assert.match(failed,/remote validation has not started/);
const result={kind:'d_gc_full_collect_capsule_fix_source_ready.v1',status:'tagged_capsule_fixture_source_ready_native_empty_cwd_regression_pending',before,after,exact_inverse_reconstructs_before:true,tagged_calls_replaced:2,coverage:['in-checkout FullCollect seed','actual newDGCColdFixture used by cold7 and lifecycle15'],config_source:'decoded embedded aDownloadMFASeed / validated remote capsule EffectiveConfig via existing admissionConfigBytes API',preserved:['original store Ref setup','committed owner policy','original fixture reservation interval','SQL authority constructor','real model Admit','real model result Finish','existing sealed retention GC group constructor','all seven cold SQL statements and assertions'],shared_inputs_unchanged:protectedPaths.map(pin),failed_run_retained:pin(log),prior_formal_review:pin(reviewPath),checker:pin('docs/evidence/d-gc-full-collect-capsule-fix-20261027.mjs'),required_native_regression:['GC3 actual source-context native events','one current tagged evidence executable','same executable executes all GC3 from a genuinely empty cwd; do not copy docs or repository data there','current Linux tagged evidence compile/hash','source/input postcheck and exact owned cleanup'],Go_started:false,SQL:false,SSH:false,receiver_weakened:false,missing_docs_fabricated:false,ordinary_model_loader_modified:false,dependencies_installed:false,production_approved:false};
const args=process.argv.slice(2),out=path.join(import.meta.dirname,'d-gc-full-collect-capsule-fix-source-ready-20261027-r1.json');
assert.ok(args.length===0||(args.length===2&&args[0]==='--write'));
if(args.length){const target=path.resolve(args[1]);assert.equal(path.dirname(target),import.meta.dirname);fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}else assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),result);
console.log(JSON.stringify({status:result.status,after,exact_inverse:true,tagged_calls:2,protected_shared_inputs:protectedPaths.length,native:false,SQL:false,SSH:false}));
