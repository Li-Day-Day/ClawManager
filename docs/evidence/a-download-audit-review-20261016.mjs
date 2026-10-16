// Reviews archived local output only; no database, remote calls or test retries.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bytes=p=>readFileSync(resolve(root,p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const [rawPath,sourcePath]=process.argv.slice(2).filter(p=>p!=='--record');
assert.ok(rawPath&&sourcePath,'pass raw log and source manifest paths');
const raw=bytes(rawPath).toString('utf8').replaceAll('\r\n','\n');
const manifest=JSON.parse(bytes(sourcePath));
const checks={};
function check(name,value){assert.ok(value,name);checks[name]=true;}
const digest=sha(manifest.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
check('source_manifest_digest',manifest.source_sha256===digest&&raw.includes(`source_sha256=${digest} files=${manifest.files.length}`));
const source='backend/internal/systembackupevidence/download_admission_audit.go';
const tests='backend/internal/systembackupevidence/download_admission_audit_a_test.go';
const harness='docs/evidence/a-download-audit-review-20261016.ps1';
check('exact_D_implementation',manifest.files.some(p=>p.path===source&&p.sha256===manifest.audit_source_sha256)&&sha(bytes(source))===manifest.audit_source_sha256);
check('exact_A_harness',sha(bytes(harness))===manifest.review_harness_sha256);
check('exact_A_tests',manifest.files.some(p=>p.path===tests&&p.sha256===sha(bytes(tests))));
const events=raw.split('\n').filter(l=>l.startsWith('{"Time":')).map(l=>JSON.parse(l));
check('Go_events_no_failure',events.length>0&&!events.some(e=>e.Action==='fail'));
const packages=events.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package);
check('complete_evidence_package',packages.length===1&&packages[0]==='clawreef/internal/systembackupevidence');
const passes=events.filter(e=>e.Action==='pass'&&e.Test);
const ATestNames=new Set(['TestDownloadAdmissionAuditAActualIDAndBorrowedTransaction','TestDownloadAdmissionAuditAFailuresReturnNoAnchor','TestDownloadAdmissionAuditACallbackDriftRejected']);
const fresh=passes.filter(e=>ATestNames.has(e.Test.split('/')[0]));
check('27_independent_A_checks',fresh.length===27&&fresh.filter(e=>!e.Test.includes('/')).length===3);
check('unique_results',new Set(passes.map(e=>`${e.Package}:${e.Test}`)).size===passes.length);
check('no_skipped_cases',!events.some(e=>e.Action==='skip'));
check('offline_readonly_default_vet',raw.includes('LOCAL_STAGE download-audit-evidence-full default-vet=yes retry=no dependency-downloads=no sql-transport=model')&&raw.includes('DOWNLOAD_AUDIT_GO_EXIT=0'));
check('source_and_D_postchecks',raw.includes('LOCAL_PASS download-audit-review=yes frozen-postcheck=yes audit-postcheck=yes default-vet=yes SQL-transport=model real-mysql=no nonce-consumed=no provider-read=no production-adapter=no'));
check('process_exit_zero',/^a_download_audit_exit=0$/m.test(raw));
const owned=[...raw.matchAll(/^LOCAL_CLEANUP download-audit-review-owned=(.+) removed=True$/gm)].map(m=>m[1]);
check('two_exact_owners_absent',owned.length===2&&owned.every(p=>dirname(p)===root&&/^\.tmp-(?:a-evidence|d-index-cache)-[a-f0-9]{32}$/.test(basename(p))&&!existsSync(p)));
const initialPath='docs/evidence/a-download-audit-local-20261016-135204-19eba31e.txt';
const initial=bytes(initialPath).toString('utf8').replaceAll('\r\n','\n');
const initialOwned=[...initial.matchAll(/^LOCAL_CLEANUP download-audit-review-owned=(.+) removed=True$/gm)].map(m=>m[1]);
check('initial_capture_failure_before_Go',initial.includes('Source file set changed while snapshot was copied: scripts/system-backup-d-download-audit-validation.ps1')&&!initial.includes('LOCAL_STAGE ')&&/^a_download_audit_exit=1$/m.test(initial)&&initialOwned.length===2&&initialOwned.every(p=>dirname(p)===root&&!existsSync(p)));
const compileFailurePath='docs/evidence/a-download-audit-local-20261016-135537-4e3c403a.txt';
const compileFailure=bytes(compileFailurePath).toString('utf8').replaceAll('\r\n','\n');
const failedEvents=compileFailure.split('\n').filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return {};}});
const failedOwned=[...compileFailure.matchAll(/^LOCAL_CLEANUP download-audit-review-owned=(.+) removed=True$/gm)].map(m=>m[1]);
check('compiler_failure_before_test_execution',compileFailure.includes('0xc0000043')&&failedEvents.some(e=>e.Action==='build-fail')&&!failedEvents.some(e=>e.Test)&&/^a_download_audit_exit=1$/m.test(compileFailure)&&failedOwned.length===2&&failedOwned.every(p=>dirname(p)===root&&!existsSync(p)));
const failedSourcePath='docs/evidence/a-download-audit-source-20261016-135537-4e3c403a.json';
const failedSource=JSON.parse(bytes(failedSourcePath));
check('D_revision_independently_identified_A_tests_unchanged',failedSource.audit_source_sha256==='eda7fc282dafae4471161ea7984db0c4b9e7bd91abe1649c674b2c55769c9c2f'&&manifest.audit_source_sha256==='cb3115e82d7dd8d9ea5f45b840df1290ea644a74225a3362e0fdb67fef902fbd'&&failedSource.files.find(p=>p.path===tests)?.sha256===manifest.files.find(p=>p.path===tests)?.sha256);
check('serial_compile_recovery',raw.includes('build-parallelism=1')&&raw.includes('BUILD_RECOVERY previous-compile-exit=0xc0000043 before-test-execution=yes failed-build-driver-stopped=yes'));
const interruptedCapturePath='docs/evidence/a-download-audit-local-20261016-141124-9bd97cb6.txt';
const interruptedCapture=bytes(interruptedCapturePath).toString('utf8').replaceAll('\r\n','\n');
const interruptedOwned=[...interruptedCapture.matchAll(/^LOCAL_CLEANUP download-audit-review-owned=(.+) removed=True$/gm)].map(m=>m[1]);
check('interrupted_recovery_capture_before_Go',interruptedCapture.includes('Source changed while snapshot was copied')&&!interruptedCapture.includes('LOCAL_STAGE ')&&/^a_download_audit_exit=1$/m.test(interruptedCapture)&&interruptedOwned.length===2&&interruptedOwned.every(p=>dirname(p)===root&&!existsSync(p)));
check('bounded_capture_only_retries',manifest.capture_attempts>=1&&manifest.capture_attempts<=3&&manifest.capture_failures.length===manifest.capture_attempts-1);
const compared=manifest.files.map(p=>({...p,current_status:!existsSync(resolve(root,p.path))?'missing':sha(bytes(p.path))===p.sha256?'matched':'changed'}));
const focused=compared.filter(p=>p.path.startsWith('backend/internal/systembackupevidence/')||/^backend\/go\.(mod|sum)$/.test(p.path));
check('focused_current_sources',focused.length>20&&focused.every(p=>p.current_status==='matched'));
const receipt={kind:'a_independent_D_download_intent_audit_storage_review',recorded_at:new Date().toISOString(),status:'accepted_exact_frozen_local_storage_candidate_only',checks,
 raw_log:rawPath,raw_sha256:sha(bytes(rawPath)),source_manifest:sourcePath,source_manifest_sha256:sha(bytes(sourcePath)),source_sha256:digest,source_files:manifest.files.length,
 audit_source:source,audit_source_sha256:manifest.audit_source_sha256,review_harness:harness,review_harness_sha256:manifest.review_harness_sha256,reviewer_sha256:sha(bytes('docs/evidence/a-download-audit-review-20261016.mjs')),
 packages,unique_main_tests:passes.filter(e=>!e.Test.includes('/')).length,unique_subtests:passes.filter(e=>e.Test.includes('/')).length,unique_checks:passes.length,new_A_checks:fresh.length,A_test_names:[...ATestNames],reviewer_initial_counter_correction:{initial_prefix_matched:28,correct_exact_name_count:27,excluded_D_main:'TestDownloadAdmissionAuditActualIDAndPrivateClaim',Go_rerun:false},skipped:[],default_vet:true,process_exit:0,test_retries:0,
 initial_capture_failure:{log:initialPath,sha256:sha(bytes(initialPath)),before_Go:true,source_set_changed:true},compiler_recovery:{failed_log:compileFailurePath,failed_log_sha256:sha(bytes(compileFailurePath)),failed_source_manifest:failedSourcePath,failed_source_manifest_sha256:sha(bytes(failedSourcePath)),before_test_execution:true,windows_compiler_exit:'0xc0000043',failed_driver_stopped_after_dependency_failure:true,A_tests_unchanged:true,D_source_changed_before_final_capture:true,D_revisions_statically_reviewed:['reject nonzero driver time-zone offset in addition to SQL session offset','deny wholesale JSON serialization of transient raw-claim input'],initial_log_same_source_requirement_was_intent_not_a_pass_assertion:true,only_final_frozen_D_revision_accepted:true,serial_recovery:true,interrupted_capture_log:interruptedCapturePath,interrupted_capture_log_sha256:sha(bytes(interruptedCapturePath)),prepared_cache_discarded_before_Go:true},capture_attempts:manifest.capture_attempts,capture_failures:manifest.capture_failures,owned_paths_independently_absent:[...initialOwned,...failedOwned,...interruptedOwned,...owned],focused_current_pins:focused,current_manifest_drift:compared.filter(p=>p.current_status!=='matched'),current_additions_not_enumerated_or_accepted:true,
 accepted:['actual per-INSERT ID and exact-row readback','borrowed transaction; no Begin/Commit/Rollback','original audit body and TIMESTAMP(0) anchor recheck','cross-transaction, cancelled, clock regression and callback drift rejection','zero usable anchor/ID on failure and private error redaction'],
 remaining:['D sealed prelocked admission prefix and actual authorization','operation/receipt/public snapshot and capacity integration','all retained nonce candidates and atomic consumption','final owner-level SQL-clock/deadline check and unique commit point','real MySQL replay/rollback/unknown-commit and shared required reviews'],
 scope:{SQL_transport:'deterministic database/sql model',real_MySQL:false,full_admission:false,nonce_consumption:false,replay_prevention_proved:false,provider_IO:false,human_MFA:false,production_adapter:false,formal_approval:false,overall_goal_complete:false}};
if(process.argv.includes('--record'))writeFileSync(resolve(root,'docs/evidence/a-download-audit-review-20261016.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:Object.keys(checks).length,main:receipt.unique_main_tests,sub:receipt.unique_subtests,total:passes.length,new_A:fresh.length,source_files:manifest.files.length,focused:focused.length,drift:receipt.current_manifest_drift.map(p=>p.path),recorded:process.argv.includes('--record')},null,2));
