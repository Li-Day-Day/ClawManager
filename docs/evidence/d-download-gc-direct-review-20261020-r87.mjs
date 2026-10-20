import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const text=p=>{const b=raw(p);return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replaceAll('\r','');};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prefix=n=>`docs/evidence/d-download-gc-direct-20261020-r${n}`;
const events=p=>text(p).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const probeNumber=Number(process.argv[2]||87);assert.ok(Number.isInteger(probeNumber)&&probeNumber>=87);
function sourceAt(p){
 const s=JSON.parse(text(p+'-source.json'));assert.equal(s.stable_copy_verified,true);assert.equal(s.dependencies_installed,false);
 assert.equal(new Set(s.files.map(f=>f.path)).size,s.files.length);
 assert.equal(sha(Buffer.from(s.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),s.source_sha256);
 return s;
}
function ownerAt(p){
 const native=text(p+'-native.txt'),m=native.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)$/m);assert.ok(m);
 const owner=m[1].trim();assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owner),false);
 assert.ok(native.includes('CLEANED snapshot=True'));assert.match(native,/^d_admission_native_exit=[01]$/m);return owner;
}
function passedEvents(e){
 assert.ok(!e.some(x=>['fail','skip','build-fail'].includes(x.Action)));
 const run=e.filter(x=>x.Action==='run'&&x.Test).map(x=>x.Package+'/'+x.Test),pass=e.filter(x=>x.Action==='pass'&&x.Test);
 assert.equal(new Set(run).size,run.length);assert.deepEqual(run.slice().sort(),pass.map(x=>x.Package+'/'+x.Test).sort());return pass;
}
function accepted(n,final){
 const p=prefix(n),s=sourceAt(p),native=text(p+'-native.txt'),e=events(p+'.jsonl'),pass=passedEvents(e);
 for(const marker of [`FROZEN files=${s.files.length} sha256=${s.source_sha256}`,'default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','CLEANED snapshot=True',`d_admission_native_exit=${final?0:1}`,...(final?['FROZEN_POSTCHECK pass=yes']:[])])assert.ok(native.includes(marker),`${n}: ${marker}`);
 assert.equal(text(p+'-stderr.txt'),'');assert.ok(native.includes('NATIVE_EXIT focused_packages=0'));
 return {p,s,native,e,pass,record:{run:n,source_files:s.files.length,source_sha256:s.source_sha256,source_manifest_sha256:sha(raw(p+'-source.json')),jsonl_sha256:sha(raw(p+'.jsonl')),native_sha256:sha(raw(p+'-native.txt')),main:pass.filter(x=>!x.Test.includes('/')).length,all:pass.length,packages:e.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package),owner:ownerAt(p),owner_absent:true,package_exit:0,final_frozen_postcheck:final,overall_exit:final?0:1}};
}
const focused=accepted(82,true),evidence=accepted(87,probeNumber===87);
assert.equal(focused.record.main,24);assert.equal(focused.record.all,308);
assert.equal(evidence.record.main,25);assert.equal(evidence.record.all,312);
assert.deepEqual(evidence.record.packages,['clawreef/internal/systembackupevidence']);
for(const r of [focused,evidence]){
 const gc=r.pass.filter(x=>x.Test.startsWith('TestDownloadRetentionGC')),direct=gc.filter(x=>x.Test.startsWith('TestDownloadRetentionGCDirect'));
 assert.equal(gc.filter(x=>!x.Test.includes('/')).length,24);assert.equal(gc.length,308);assert.equal(direct.filter(x=>!x.Test.includes('/')).length,6);assert.equal(direct.length,66);
 for(const name of ['PublishedColumnTypesAndFKs','PhasesAndOriginalOwnLinks','EveryIncomingRangeBlocks','LateRangesRollBackWholeGroup','ClosedSchemaAndFailures','GuardStagesAndPoison'])assert.ok(direct.some(x=>x.Test==='TestDownloadRetentionGCDirect'+name));
 Object.assign(r.record,{gc_main:24,gc_all:308,direct_main:6,direct_all:66});
}
const prior={p:prefix(83)};prior.s=sourceAt(prior.p);prior.native=text(prior.p+'-native.txt');prior.e=events(prior.p+'.jsonl');
for(const marker of ['NATIVE_EXIT full_packages=1','default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes','CLEANED snapshot=True','d_admission_native_exit=1'])assert.ok(prior.native.includes(marker));
assert.equal(text(prior.p+'-stderr.txt'),'');assert.ok(!prior.e.some(x=>['skip','build-fail'].includes(x.Action)));
assert.deepEqual(prior.s.files,focused.s.files);assert.equal(prior.s.source_sha256,focused.s.source_sha256);
const failed83=prior.e.filter(x=>x.Action==='fail'&&x.Test).map(x=>x.Test).sort();
assert.deepEqual(failed83,[
 'TestDownloadRetentionGCDirectEveryIncomingRangeBlocks',
 'TestDownloadRetentionGCDirectEveryIncomingRangeBlocks/system_backup_external_actions/operation_public_id/1729',
 'TestDownloadRetentionGCDirectEveryIncomingRangeBlocks/audit_logs/json:operation_public_id/1729',
 'TestDownloadRetentionGCDirectEveryIncomingRangeBlocks/audit_logs/json:result_audit_id/1730'
].sort());
const expectedOther=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer'];
assert.deepEqual(prior.e.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package).sort(),expectedOther.slice().sort());
assert.deepEqual(prior.e.filter(x=>x.Action==='fail'&&!x.Test).map(x=>x.Package),['clawreef/internal/systembackupevidence']);
const others=expectedOther.map(pkg=>{const pass=passedEvents(prior.e.filter(x=>x.Package===pkg));return {package:pkg,main:pass.filter(x=>!x.Test.includes('/')).length,all:pass.length,run:83,exit:0};});
assert.deepEqual(others.map(p=>[p.main,p.all]),[[255,2011],[75,519],[75,784]]);
const oldPins=new Map(prior.s.files.map(f=>[f.path,f.sha256])),newPins=new Map(evidence.s.files.map(f=>[f.path,f]));
assert.deepEqual(prior.s.files.map(f=>f.path),evidence.s.files.map(f=>f.path));
const sourceChanges=evidence.s.files.filter(f=>oldPins.get(f.path)!==f.sha256).map(f=>f.path);
assert.deepEqual(sourceChanges.slice().sort(),[
 'backend/internal/systembackupevidence/download_retention_gc_references_test.go',
 'backend/internal/systembackupevidence/download_retention_gc_test.go'
].sort());
// Only this package's test sources changed. Imported packages do not compile
// evidence's _test.go files. Keep the three earlier full-package passes while
// preserving r83's overall failure; do not claim one green four-package run.
const gcTest=name=>name.startsWith('TestDownloadRetentionGC')||name.startsWith('TestAGCDirectAuditResourcePublishedInteger');
assert.ok(evidence.pass.every(x=>gcTest(x.Test)));
const unchangedPass=passedEvents(events(prefix(84)+'.jsonl').filter(x=>x.Test&&!gcTest(x.Test)));
const unchangedMain=unchangedPass.filter(x=>!x.Test.includes('/')).length;assert.equal(unchangedMain,299);assert.equal(unchangedPass.length,2299);
const oldEvidenceRuns=prior.e.filter(x=>x.Action==='run'&&x.Test&&x.Package==='clawreef/internal/systembackupevidence').map(x=>x.Test).sort();
assert.deepEqual(oldEvidenceRuns,[...unchangedPass,...evidence.pass].map(x=>x.Test).sort());
const main=others.reduce((a,p)=>a+p.main,evidence.record.main+unchangedMain),all=others.reduce((a,p)=>a+p.all,evidence.record.all+unchangedPass.length);
assert.equal(main,729);assert.equal(all,5925);
const probe=probeNumber===87?evidence:accepted(probeNumber,true);
assert.deepEqual(probe.s.files,evidence.s.files);assert.equal(probe.s.source_sha256,evidence.s.source_sha256);
if(probeNumber!==87){assert.equal(probe.record.main,3);assert.equal(probe.record.all,22);}
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
 assert.ok(probe.native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));assert.equal(text(probe.p+'-'+stage+'-stderr.txt'),'');
}
const seeds=passedEvents(events(probe.p+'-tagged-seed.txt'));assert.equal(seeds.length,22);
assert.deepEqual(seeds.filter(x=>!x.Test.includes('/')).map(x=>x.Test).sort(),['TestADownloadAdmissionMySQLSeed','TestASensitiveDownloadMFAMySQLSeed','TestDProducerDownloadOwnersMySQLSeed'].sort());
const detached=text(probe.p+'-detached-seed.txt');assert.equal((detached.match(/^=== RUN /gm)||[]).length,22);assert.equal((detached.match(/^\s*--- PASS: /gm)||[]).length,22);assert.ok(!/--- (?:FAIL|SKIP):/.test(detached));
const binaries=[...probe.native.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));
assert.equal(binaries.length,3);assert.deepEqual(binaries.map(b=>b.name).sort(),['download-admission.test.exe','download-admission.test','system-backup-migrate'].sort());
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);assert.equal(catalog.hash,'2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
assert.equal(newPins.get('backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json').sha256,'a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0');
const currentList=probe.p+'-current-files.txt',names=text(currentList).trim().split('\n').filter(Boolean);assert.equal(new Set(names).size,names.length);
const drift=evidence.s.files.filter(f=>!fs.existsSync(path.join(root,f.path))||sha(raw(f.path))!==f.sha256||raw(f.path).length!==f.size).map(f=>f.path);
const added=names.filter(p=>!newPins.has(p)),nameSet=new Set(names),missing=evidence.s.files.filter(f=>!nameSet.has(f.path)).map(f=>f.path);
const cleanup=JSON.parse(text('docs/evidence/d-download-gc-direct-cleanup-20261020.json'));
assert.equal(cleanup.dependencies_installed,false);assert.equal(cleanup.remote_run,false);assert.ok(cleanup.paths.every(p=>p.absent&&!fs.existsSync(p.path)));
const runs=[...new Set([79,80,81,82,83,84,85,86,87,probeNumber])];
for(const n of runs){const owner=ownerAt(prefix(n));assert.ok(cleanup.paths.some(p=>p.run===n&&p.path===owner&&p.kind==='snapshot'));}
const cacheOwner=JSON.parse(text('docs/evidence/d-download-gc-direct-cache-owner-20261020-r79.json'));assert.ok(cleanup.paths.some(p=>p.path===cacheOwner.owner&&p.kind==='owned_cache'));assert.equal(cleanup.paths.length,runs.length+1);
const failures=[79,80,81].map(n=>{
 const p=prefix(n),e=events(p+'.jsonl'),native=text(p+'-native.txt'),s=sourceAt(p);
 for(const marker of ['d_admission_native_exit=1','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes'])assert.ok(native.includes(marker));
 const failed=e.filter(x=>['fail','build-fail'].includes(x.Action)).map(x=>({action:x.Action,test:x.Test,package:x.Package,import_path:x.ImportPath}));assert.ok(failed.length);
 const started=e.filter(x=>x.Action==='run'&&x.Test).length;if(n===79){assert.equal(started,0);assert.ok(e.some(x=>x.Output?.includes('0xc0000043')));}else assert.ok(started>0);
 const next=sourceAt(prefix(n+1)),old=new Map(s.files.map(f=>[f.path,f.sha256]));
 return {run:n,kind:n===79?'windows_compile_0xc0000043':n===80?'declaration_types_parser_and_scripted_placeholder_model':'scripted_placeholder_model',source_files:s.files.length,source_sha256:s.source_sha256,jsonl_sha256:sha(raw(p+'.jsonl')),native_sha256:sha(raw(p+'-native.txt')),tests_started:started,failed,preserved:true,overall_exit:1,next_source_changes:next.files.filter(f=>old.get(f.path)!==f.sha256).map(f=>({path:f.path,kind:old.has(f.path)?'changed':'added'})),exact_same_source_recovery:false};
});
failures.push({run:83,kind:'synthetic_gc_clock_aged_during_file_certificate_setup',diagnosis_inferred_from:'Three negative cases did not reach the target range after 5.76/6.41/9.76s; fixed sampled SQL clock preceded slow setup and collector enforces five-second skew.',source_files:prior.s.files.length,source_sha256:prior.s.source_sha256,jsonl_sha256:sha(raw(prior.p+'.jsonl')),native_sha256:sha(raw(prior.p+'-native.txt')),failed:failed83,preserved:true,overall_exit:1,unit_postcheck:true,final_postcheck:true,owner:ownerAt(prior.p),next_source_changes:sourceChanges,repair:'Sample only the new GC worker time and synthetic capacity observation after setup and before its first transaction. Preserve original download facts/deadlines, production clock guard, reached-range assertion, and add error/last-query diagnostics.',exact_same_source_recovery:false});
const precision={p:prefix(84)};precision.s=sourceAt(precision.p);precision.native=text(precision.p+'-native.txt');precision.e=events(precision.p+'.jsonl');
for(const marker of ['NATIVE_EXIT focused_packages=1','default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes','CLEANED snapshot=True','d_admission_native_exit=1'])assert.ok(precision.native.includes(marker));
assert.equal(text(precision.p+'-stderr.txt'),'');assert.ok(!precision.e.some(x=>['skip','build-fail'].includes(x.Action)));
assert.deepEqual(precision.e.filter(x=>x.Action==='fail'&&x.Test).map(x=>x.Test),['TestDownloadRetentionGCExpiryEquality']);
assert.equal(precision.e.filter(x=>x.Action==='pass'&&x.Test?.startsWith('TestDownloadRetentionGCDirect')).length,66);
const precisionPins=new Map(precision.s.files.map(f=>[f.path,f.sha256]));
assert.deepEqual(precision.s.files.map(f=>f.path),evidence.s.files.map(f=>f.path));
const precisionChanges=evidence.s.files.filter(f=>precisionPins.get(f.path)!==f.sha256).map(f=>f.path);
assert.deepEqual(precisionChanges,['backend/internal/systembackupevidence/download_retention_gc_test.go']);
failures.push({run:84,kind:'gc_fixture_clock_precision',source_files:precision.s.files.length,source_sha256:precision.s.source_sha256,jsonl_sha256:sha(raw(precision.p+'.jsonl')),native_sha256:sha(raw(precision.p+'-native.txt')),failed:['TestDownloadRetentionGCExpiryEquality'],direct_all_passed:66,preserved:true,overall_exit:1,unit_postcheck:true,final_postcheck:true,owner:ownerAt(precision.p),next_source_changes:precisionChanges,repair:'Keep freshly sampled shared GC time at microsecond precision. Only the exact-expiry scenario chooses the next SQL time with the ORIGINAL retention microsecond phase, so the group shift is an integer number of seconds and audit whole-second timestamps are preserved. Production constraints are unchanged.',exact_same_source_recovery:false});
const backward={p:prefix(85)};backward.s=sourceAt(backward.p);backward.native=text(backward.p+'-native.txt');backward.e=events(backward.p+'.jsonl');
for(const marker of ['NATIVE_EXIT focused_packages=1','default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes','CLEANED snapshot=True','d_admission_native_exit=1'])assert.ok(backward.native.includes(marker));
assert.equal(text(backward.p+'-stderr.txt'),'');assert.ok(!backward.e.some(x=>['skip','build-fail'].includes(x.Action)));
const failed85=backward.e.filter(x=>x.Action==='fail'&&x.Test).map(x=>x.Test);assert.ok(failed85.length);assert.ok(failed85.every(gcTest));
const backwardPins=new Map(backward.s.files.map(f=>[f.path,f.sha256]));assert.deepEqual(backward.s.files.map(f=>f.path),evidence.s.files.map(f=>f.path));
const backwardChanges=evidence.s.files.filter(f=>backwardPins.get(f.path)!==f.sha256).map(f=>f.path);assert.deepEqual(backwardChanges,['backend/internal/systembackupevidence/download_retention_gc_test.go']);
failures.push({run:85,kind:'gc_fixture_clock_rounded_below_existing_capacity_sample',source_files:backward.s.files.length,source_sha256:backward.s.source_sha256,jsonl_sha256:sha(raw(backward.p+'.jsonl')),native_sha256:sha(raw(backward.p+'-native.txt')),failed:failed85,preserved:true,overall_exit:1,unit_postcheck:true,final_postcheck:true,owner:ownerAt(backward.p),next_source_changes:backwardChanges,repair:'Restore shared fresh SQL time to microsecond precision and align only the dedicated expiry boundary scenario; retain the capacity code rejecting a report older than the existing reservation sample.',exact_same_source_recovery:false});
const phase={p:prefix(86)};phase.s=sourceAt(phase.p);phase.native=text(phase.p+'-native.txt');phase.e=events(phase.p+'.jsonl');
for(const marker of ['NATIVE_EXIT focused_packages=1','default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes','CLEANED snapshot=True','d_admission_native_exit=1'])assert.ok(phase.native.includes(marker));
assert.equal(text(phase.p+'-stderr.txt'),'');assert.ok(!phase.e.some(x=>['skip','build-fail'].includes(x.Action)));
assert.deepEqual(phase.e.filter(x=>x.Action==='fail'&&x.Test).map(x=>x.Test),['TestDownloadRetentionGCExpiryEquality']);
const phasePins=new Map(phase.s.files.map(f=>[f.path,f.sha256]));assert.deepEqual(phase.s.files.map(f=>f.path),evidence.s.files.map(f=>f.path));
const phaseChanges=evidence.s.files.filter(f=>phasePins.get(f.path)!==f.sha256).map(f=>f.path);assert.deepEqual(phaseChanges,['backend/internal/systembackupevidence/download_retention_gc_test.go']);
failures.push({run:86,kind:'expiry_fixture_original_microsecond_phase',source_files:phase.s.files.length,source_sha256:phase.s.source_sha256,jsonl_sha256:sha(raw(phase.p+'.jsonl')),native_sha256:sha(raw(phase.p+'-native.txt')),failed:['TestDownloadRetentionGCExpiryEquality'],preserved:true,overall_exit:1,unit_postcheck:true,final_postcheck:true,owner:ownerAt(phase.p),next_source_changes:phaseChanges,repair:'Align the expiry scenario to the original retain_until microsecond phase instead of a whole-second target; assert the group shift is an integer number of seconds and retain diagnostic clock/sample/query facts.',exact_same_source_recovery:false});
const result={kind:'d_download_gc_direct_references_local_review',recorded_at:new Date().toISOString(),frozen_validation_passed:true,single_four_package_run_passed:false,single_current_evidence_package_run_passed:false,accepted_four_package_test_assembly:{main,all,unchanged_packages:others,unchanged_evidence_tests:{run:84,main:unchangedMain,all:unchangedPass.length,jsonl_sha256:sha(raw(prefix(84)+'.jsonl')),source_sha256:precision.s.source_sha256},rerun_gc_tests:evidence.record,source_changes_are_only_gc_test_fixture_and_diagnostics:true,scope:'Three complete packages from r83, all unaffected evidence tests from r84, every GC/independent-A fixture consumer from r87. All production inputs identical. Preserve r83/r84/r85/r86 overall failures; this is not one green full-package invocation.'},current_sources_match:!drift.length&&!added.length&&!missing.length,current_pinned_drift:drift,current_added_inputs:added,current_missing_inputs:missing,current_file_list:{path:currentList,sha256:sha(raw(currentList)),files:names.length},prior_focused:focused.record,final_gc:evidence.record,failed_attempts:failures,producer_seed_main:3,producer_seeds:22,detached_seeds:22,binaries,catalog,cleanup,default_vet:true,dependencies_installed:false,actual_mysql:false,actual_owner_concurrency:false,production_approved:false,original_six_scopes_complete:false,user_requested_pause_after_round:true,limitations:'Mandatory published direct-reference ranges execute in collector phases 1/3/5/7 over scripted SQL, with independent declaration/FK checks, original-own-key exemptions, sticky guards, late-reference rollback and metadata drift rejection. Phase numbers are candidate placements, not approved global lock ranks. Other logical/evidence dependencies, artifact tasks/imports, producer original binding, current authority/revocation, privileged metadata visibility, trigger/program review, DDL freeze, real InnoDB/range/index/role/capacity validation and production activation remain required.'};
if(probeNumber!==87){
 const failedStage=evidence.native.match(/^NATIVE_PROBE stage=(\S+) exit=1 actual_mysql=no$/m);assert.ok(failedStage);assert.ok(!evidence.native.includes('FROZEN_POSTCHECK pass=yes'));
 const stderr=text(evidence.p+'-'+failedStage[1]+'-stderr.txt');assert.match(stderr,/exit status 0xc000(?:0043|026b)/);
 result.probe_build_failure={run:87,stage:failedStage[1],stderr_sha256:sha(raw(evidence.p+'-'+failedStage[1]+'-stderr.txt')),preserved:true,overall_exit:1,gc_tests_passed:true,final_postcheck:false};result.probe_recovery={...probe.record,exact_same_source:true};
}
result.reviewer_sha256=sha(raw('docs/evidence/d-download-gc-direct-review-20261020-r87.mjs'));
const output=probe.p+'-review.json';assert.equal(fs.existsSync(path.join(root,output)),false,'Refusing to replace review evidence');fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,frozen_validation_passed:true,single_four_package_run_passed:false,current_sources_match:result.current_sources_match,accepted_main:main,accepted_all:all,evidence_main:324,evidence_all:2611,direct_all:66,gc_all:308,producer_seeds:22,drift,added,missing,cleaned_paths:cleanup.paths.length}));if(!result.current_sources_match)process.exitCode=1;
