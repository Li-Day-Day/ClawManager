// Local tagged preparation plus explicitly composed ordinary-source coverage.
// Does not execute SQL or accept an actual owner suite.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,inventory,native,changed,exact,events} from './a-frozen-validation-utils-20261021.mjs';
const retryCleanupPath='docs/evidence/a-download-owners-inplace-fixture-retry-cleanup-20261021.json',retryCleanup=json(retryCleanupPath);
assert.equal(retryCleanup.wrapper_exit,0);assert.equal(retryCleanup.exists,false);assert.equal(retryCleanup.dependencies_installed,false);assert.equal(retryCleanup.remote_executed,false);
assert.equal(path.dirname(path.resolve(retryCleanup.path)).toLowerCase(),workspace.toLowerCase());assert.equal(path.basename(retryCleanup.path),'.tmp-d-admission-a-owner-inplace-20261021-r2');assert.equal(fs.existsSync(retryCleanup.path),false);
assert.ok(retryCleanup.runs.length>=1&&retryCleanup.runs.length<=2);assert.equal(retryCleanup.runs.at(-1).exit,0);
const prefix='docs/evidence/'+retryCleanup.runs.at(-1).prefix;assert.match(prefix,/^docs\/evidence\/a-download-owners-inplace-fixture-20261021-r[23]$/);
const source=manifest(prefix+'-source.json'),own='backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go';
const failedPrefix='docs/evidence/a-download-owners-inplace-fixture-20261021-r1',failedSource=manifest(failedPrefix+'-source.json');
assert.deepEqual(source.files,failedSource.files);assert.equal(source.source_sha256,failedSource.source_sha256);
const failedNative=decode(raw(failedPrefix+'-native.txt'));
for(const marker of ['NATIVE_EXIT focused_packages=0','FROZEN_UNIT_POSTCHECK pass=yes','NATIVE_PROBE stage=windows-probe exit=0','NATIVE_PROBE stage=detached-seed exit=0','NATIVE_PROBE stage=linux-probe exit=1','CLEANED snapshot=True','d_admission_native_exit=1','Windows PowerShell transcript end'])assert.ok(failedNative.includes(marker));
const failedOwner=failedNative.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)$/m)[1].trim();assert.equal(path.dirname(path.resolve(failedOwner)).toLowerCase(),workspace.toLowerCase());assert.equal(fs.existsSync(failedOwner),false);
assert.equal(decode(raw(failedPrefix+'-linux-probe-stderr.txt')).trim(),'net/http/httptest: C:\\Program Files\\Go\\pkg\\tool\\windows_amd64\\compile.exe: exit status 0xc0000043');
assert.equal(events(failedPrefix+'.jsonl').filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
// Preserve the already-running role probe's old owner-only tagged input.
// The role source has the same ordinary inputs as this repair. Its old tagged
// owner bytes are already compiled in the five-package preparation's probes.
const baselinePath='docs/evidence/a-download-gc-role-mysql-remote-source-20261021-142757-6ad9fc5f.json',baseline=manifest(baselinePath);
exact(changed(source,baseline),[own]);assert.equal(source.files.length,baseline.files.length);
const ordinaryPath='docs/evidence/a-check-evidence-binding-accepted-20261021-r2.json',ordinary=json(ordinaryPath),ordinarySource=manifest(ordinary.source);
assert.equal(ordinary.status,'accepted_frozen_same_transaction_check_evidence_binding_only');
assert.equal(sha256(raw(ordinary.source)),ordinary.source_manifest_sha256);assert.equal(sha256(raw(ordinary.events)),ordinary.events_sha256);
assert.deepEqual(baseline.files.find(f=>f.path===own),ordinarySource.files.find(f=>f.path===own));
const businessOwn=['capture.go','d_review_commit_context_test.go','restore_verify.go'].map(n=>'backend/internal/systembackupbusinessa/'+n);
exact(changed(source,ordinarySource).filter(p=>/^(backend|contracts)\//.test(p)),[...businessOwn,own]);
assert.ok(ordinarySource.files.every(f=>source.files.some(q=>q.path===f.path)));
const dPrefix='docs/evidence/d-a-business-review-20261021-r1';
const dPath='docs/evidence/d-a-business-review-preparation-20261021.json',d=json(dPath);
assert.equal(d.status,'local_review_and_two_read_completion_corrections');
const dFull=json(dPrefix+'-full-source.json'),dBase=manifest('docs/evidence/d-a-business-review-base-20261021.json');
assert.equal(sha256(dFull.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),dFull.source_sha256);
exact(changed(source,dFull).filter(p=>/^(backend|contracts)\//.test(p)),[own,'backend/internal/systembackupread/task_check_evidence_control.go','backend/internal/systembackupread/task_check_evidence_control_test.go']);
assert.ok(dFull.files.every(f=>source.files.some(q=>q.path===f.path)));
for(const p of [...businessOwn,own]){const pin=source.files.find(f=>f.path===p);assert.equal(raw(p).length,pin.size);assert.equal(sha256(raw(p)),pin.sha256);}
for(const p of businessOwn)assert.deepEqual(source.files.find(f=>f.path===p),dFull.files.find(f=>f.path===p));
// The only production changes are the two guards immediately after Commit.
for(const p of businessOwn.filter(p=>!p.endsWith('_test.go'))){
  const text=decode(raw(p)),eol=text.includes('\r\n')?'\r\n':'\n',type=p.endsWith('/capture.go')?'SourceSnapshot':'CategoryChecks';
  const guard=`\tif err := ctx.Err(); err != nil {${eol}\t\treturn ${type}{}, err${eol}\t}${eol}`;
  const end=text.indexOf(eol+'\t}'+eol,text.indexOf('\tif err := tx.Commit();'))+eol.length+2+eol.length;
  assert.ok(end>0);assert.equal(text.slice(end,end+guard.length),guard);
  assert.equal(sha256(text.slice(0,end)+text.slice(end+guard.length)),dBase.files.find(f=>f.path===p).sha256);
}
const dPackages=['clawreef/internal/systembackupbusinessa','clawreef/internal/systembackupsecurity'];
const dPass=inventory(dPrefix+'-full.jsonl',dPackages),dTarget=inventory(dPrefix+'-target.jsonl',[dPackages[0]]);
assert.equal(dPass.length,2346);assert.equal(dPass.filter(e=>!e.Test.includes('/')).length,333);assert.equal(dTarget.length,12);
const failures=events(dPrefix+'-counterfactual.jsonl').filter(e=>e.Test&&e.Action==='fail').map(e=>e.Test);
exact(failures,['TestDReviewABusinessReadCommitBoundary','TestDReviewABusinessReadCommitBoundary/capture_counts','TestDReviewABusinessReadCommitBoundary/capture_counts/canceled_commit','TestDReviewABusinessReadCommitBoundary/restore_verifier','TestDReviewABusinessReadCommitBoundary/restore_verifier/canceled_commit','TestDReviewARestoreMismatchAndCanceledResult','TestDReviewARestoreMismatchAndCanceledResult/canceled_mismatch_commit']);
for(const stage of ['target','full']){
  const n=json(dPrefix+'-'+stage+'-native.json'),s=json(dPrefix+'-'+stage+'-source.json');
  assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.default_vet,true);assert.equal(n.dependencies_installed,false);assert.equal(n.remote,false);assert.equal(n.source_sha256,dFull.source_sha256);assert.equal(s.source_sha256,dFull.source_sha256);
  const saved=d.runs.find(r=>r.stage===stage);assert.equal(saved.source_manifest_sha256,sha256(raw(dPrefix+'-'+stage+'-source.json')));assert.equal(saved.events_sha256,sha256(raw(dPrefix+'-'+stage+'.jsonl')));assert.equal(saved.native_sha256,sha256(raw(dPrefix+'-'+stage+'-native.json')));
}
const cleanup=json(d.cleanup.receipt);assert.equal(sha256(raw(d.cleanup.receipt)),d.cleanup.sha256);assert.equal(cleanup.removed,true);assert.equal(cleanup.source_postcheck,true);assert.equal(cleanup.process_terminal,true);assert.equal(fs.existsSync(cleanup.absolute_owner),false);
const tests=['TestASQLTaskDownloadOwnersMySQLSeed','TestADownloadAdmissionMySQLSeed',...['detached_embedded_config','historical_config_projection','independent_encrypted_object'].map(n=>'TestADownloadAdmissionMySQLSeed/'+n),'TestASensitiveDownloadMFAMySQLSeed',...['actual_config_required_cells','duplicate','unknown','trailing','catalog','ddl','budget'].map(n=>'TestASensitiveDownloadMFAMySQLSeed/'+n)];
for(const file of [prefix+'.jsonl',prefix+'-tagged-seed.txt'])exact(inventory(file,['clawreef/internal/systembackupevidence']).map(e=>e.Test),tests);
const detached=decode(raw(prefix+'-detached-seed.txt'));exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m=>m[1]),tests);exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]),tests);assert.match(detached,/\nPASS\s*$/);assert.doesNotMatch(detached,/--- (?:FAIL|SKIP):|panic:/);
const n=native(prefix+'-native.txt',source,'CLEANED snapshot=True');assert.ok(n.text.includes('NATIVE_EXIT focused_packages=0'));assert.equal(raw(prefix+'-stderr.txt').length,0);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){assert.ok(n.text.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));assert.equal(raw(prefix+'-'+stage+'-stderr.txt').length,0);}
const binaries=[...n.text.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));exact(binaries.map(b=>b.name),['download-admission.test.exe','download-admission.test','system-backup-migrate']);
const text=decode(raw(own));assert.ok(text.startsWith('//go:build systembackup_mysql\n'));assert.ok(text.includes('RENAME COLUMN evidence_id TO hidden_reference, ALGORITHM=INPLACE'));assert.ok(text.includes('original != 0 || hidden != 1 || foreignKey != 1'));assert.ok(text.includes('OBSERVED missing reference fixture renamed column with FK retained'));assert.doesNotMatch(text,/SET FOREIGN_KEY_CHECKS|DROP FOREIGN KEY/);
const failedPath='docs/evidence/a-download-owners-inplace-failure-reviewed-20261021.json',failed=json(failedPath);assert.equal(failed.status,'failed_not_accepted');assert.equal(failed.passed_cases.length,10);exact(failed.failed_cases,['missing_reference_column']);assert.equal(failed.observed_error,1846);
const record={kind:'a_owner_inplace_fixture_and_composed_ordinary_preparation',status:'accepted_local_preparation_only',source:prefix+'-source.json',source_manifest_sha256:sha256(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,probe_path:own,probe_sha256:source.files.find(f=>f.path===own).sha256,first_seed_checks:13,packaged_seed_checks:13,detached_seed_checks:13,native:prefix+'-native.txt',native_sha256:n.sha256,binaries,ordinary_events:ordinary.events,ordinary_events_sha256:ordinary.events_sha256,ordinary_proof:ordinaryPath,ordinary_proof_sha256:sha256(raw(ordinaryPath)),business_proof:dPath,business_proof_sha256:sha256(raw(dPath)),business_complete_checks:2346,business_target_checks:12,business_old_cancellation_failures:7,owner_baseline:{main:620,all:5019},composition:'five-package ordinary inventory retained byte-for-byte; three business files independently validated in their complete package; tagged fixture compiled separately',default_vet:true,final_postcheck:true,validation_exit:0,cleanup_independently_absent:[n.owner,cleanup.absolute_owner],original_failure:failedPath,original_failure_sha256:sha256(raw(failedPath)),actual_owner_suite_accepted:false,actual_sql_cases_executed:0,dependencies_installed:false,test_build_artifacts_remaining:false,production_approved:false,current_whole_worktree_verified:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
record.ordinary_inventory_source=baselinePath;
record.ordinary_inventory_source_manifest_sha256=sha256(raw(baselinePath));
record.ordinary_inventory_source_sha256=baseline.source_sha256;
record.role_actual_result_not_accepted_by_this_receipt=true;
record.full_ordinary_packages_repeated=false;
record.retry_cleanup=retryCleanupPath;
record.retry_cleanup_sha256=sha256(raw(retryCleanupPath));
record.original_infrastructure_failure={prefix:failedPrefix,source_manifest_sha256:sha256(raw(failedPrefix+'-source.json')),native_sha256:sha256(raw(failedPrefix+'-native.txt')),compiler_stderr_sha256:sha256(raw(failedPrefix+'-linux-probe-stderr.txt')),exit:1,business_failures:0,source_independently_absent:true};
record.preparation_attempts=retryCleanup.runs.map(run=>{
  const p='docs/evidence/'+run.prefix,m=manifest(p+'-source.json');
  assert.equal(run.source_sha256,source.source_sha256);assert.deepEqual(m.files,source.files);
  if(run.exit!==0){
    assert.equal(run.exit,1);assert.equal(run.prefix,'a-download-owners-inplace-fixture-20261021-r2');
    const text=decode(raw(p+'-native.txt'));
    for(const marker of ['NATIVE_EXIT focused_packages=0','FROZEN_UNIT_POSTCHECK pass=yes','NATIVE_PROBE stage=tagged-seed exit=0','NATIVE_PROBE stage=windows-probe exit=0','NATIVE_PROBE stage=detached-seed exit=0','NATIVE_PROBE stage=linux-probe exit=1','CLEANED snapshot=True','d_admission_native_exit=1','Windows PowerShell transcript end'])assert.ok(text.includes(marker));
    assert.match(decode(raw(p+'-linux-probe-stderr.txt')).trim(),/^[A-Za-z0-9_./-]+: [^\r\n]+\\(?:compile|asm)\.exe: exit status 0xc0000043$/);
    const owner=text.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)$/m)[1].trim();assert.equal(path.dirname(path.resolve(owner)).toLowerCase(),workspace.toLowerCase());assert.equal(fs.existsSync(owner),false);
    assert.equal(events(p+'.jsonl').filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
  }
  return {...run,source_manifest_sha256:sha256(raw(p+'-source.json')),native_sha256:sha256(raw(p+'-native.txt'))};
});
const output='docs/evidence/a-download-owners-inplace-fixture-accepted-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(json(output),record);
else {assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,seeds:[13,13,13],owner_inventory:5019,business_complete:2346,actual_sql:false,build_artifacts_remaining:false}));
