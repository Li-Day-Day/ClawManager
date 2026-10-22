import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const preflight=process.argv.includes('--preflight');
const owner=path.join(root,'.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61');
const sourceRoot=preflight?path.join(owner,'source'):root;
const raw=p=>fs.readFileSync(path.join(p.startsWith('docs/evidence/')?root:sourceRoot,p));
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const read=p=>JSON.parse(decode(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=p=>sha(p.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
const exact=(a,b)=>assert.deepEqual(a.slice().sort(),b.slice().sort());
const basePath='docs/evidence/d-prune-identity-base-20261021.json',base=read(basePath);
assert.equal(digest(base.files),base.source_sha256);assert.equal(base.stable_copy_verified,true);
const runs={};
for(const [label,prefix,expected] of [
 ['initial_full','docs/evidence/d-prune-identity-20261021-r1-full',1],
 ['controller','docs/evidence/d-prune-identity-20261021-r1-controller',0],
 ['probe','docs/evidence/d-prune-identity-20261021-r2-probe',0]]){
 const source=read(prefix+'-source.json'),native=read(prefix+'-native.json');
 assert.equal(digest(source.files),source.source_sha256);assert.equal(source.base_source_sha256,base.source_sha256);
 assert.equal(native.source_sha256,source.source_sha256);assert.equal(native.exit,expected);assert.equal(native.source_postcheck,true);
 assert.equal(native.default_vet,true);assert.equal(native.dependencies_installed,false);assert.equal(native.remote,false);
 assert.equal(decode(raw(prefix+'-stderr.txt')).trim(),'');
 const events=decode(raw(prefix+'.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
 const ran=events.filter(e=>e.Test&&e.Action==='run'),pass=events.filter(e=>e.Test&&e.Action==='pass'),fail=events.filter(e=>e.Test&&e.Action==='fail');
 assert.equal(new Set(ran.map(e=>e.Package+'\0'+e.Test)).size,ran.length);assert.equal(ran.length,pass.length+fail.length);
 assert.equal(events.filter(e=>['skip','build-fail'].includes(e.Action)).length,0);
 if(expected===1)exact(fail.map(e=>e.Test),['TestQueueBudgetMetricsRenderCompleteClosedPrometheusSampleSet','TestSQLQueueBudgetReaderEmitsOnlyClosedLowCardinalitySamples']);
 else {assert.equal(fail.length,0);assert.equal(events.filter(e=>e.Action==='fail').length,0);}
 const packages=events.filter(e=>!e.Test&&e.Action==='pass').map(e=>e.Package);
 if(label==='initial_full'){
  exact(packages,['migrationcatalog','systembackupbusinessa','systembackupsecurity','systembackupevidence','systembackupproducer'].map(p=>'clawreef/internal/'+p));
  exact(events.filter(e=>!e.Test&&e.Action==='fail').map(e=>e.Package),['clawreef/internal/systembackupcontroller']);
 }
 if(label==='controller')exact(packages,['clawreef/internal/systembackupcontroller']);
 if(label==='probe')exact(ran.filter(e=>!e.Test.includes('/')).map(e=>e.Test),['TestDDownloadGCTaskMySQLSeed','TestASensitiveDownloadMFAMySQLSeed','TestDProducerDownloadOwnersMySQLSeed','TestDDownloadAdmissionAuditMySQLSeed']);
 runs[label]={source,ran,summary:{label,prefix,source_sha256:source.source_sha256,source_files:source.files.length,main:ran.filter(e=>!e.Test.includes('/')).length,checks:ran.length,passed:pass.length,failed:fail.map(e=>e.Test),exit:native.exit,default_vet:true,source_postcheck:true,packages,source_manifest_sha256:sha(raw(prefix+'-source.json')),events_sha256:sha(raw(prefix+'.jsonl')),native_sha256:sha(raw(prefix+'-native.json')),built:native.built??[]}};
}
exact(runs.initial_full.ran.filter(e=>e.Package==='clawreef/internal/systembackupcontroller').map(e=>e.Test),runs.controller.ran.map(e=>e.Test));
const final=runs.controller.source;
assert.equal(final.source_sha256,runs.probe.source.source_sha256);
const nodePrefix='docs/evidence/d-prune-identity-20261021-r3-node',nodeSource=read(nodePrefix+'-source.json'),nodeNative=read(nodePrefix+'-native.json');
assert.equal(nodeSource.source_sha256,final.source_sha256);assert.equal(nodeNative.source_sha256,final.source_sha256);
assert.equal(nodeNative.exit,0);assert.equal(nodeNative.source_postcheck,true);
const tap=decode(raw(nodePrefix+'.tap'));
for(const [field,value]of [['tests',94],['pass',94],['fail',0],['cancelled',0],['skipped',0],['todo',0]])assert.match(tap,new RegExp('^# '+field+' '+value+'\\r?$','m'));
assert.equal(decode(raw(nodePrefix+'-stderr.txt')).trim(),'');
const controlPrefix='docs/evidence/d-prune-identity-controls-20261021-r2',controls=read(controlPrefix+'.json');
assert.equal(controls.success,true);assert.equal(controls.source_postcheck,true);assert.equal(controls.source_sha256,final.source_sha256);assert.equal(controls.steps.length,9);
for(const step of controls.steps){assert.equal(step.exit,step.expected);assert.equal(step.exit,step.name==='strict'?1:0);for(const [suffix,key]of [['.stdout','stdout_sha256'],['.stderr','stderr_sha256']])assert.equal(sha(raw(controlPrefix+'-'+step.name+suffix)),step[key]);}
const probePrefix=runs.probe.summary.prefix;
for(const suffix of ['-windows.stderr','-detached.stderr','-linux.stderr','-migration.stderr','-audit-inputs.stderr'])assert.equal(decode(raw(probePrefix+suffix)).trim(),'');
const detached=decode(raw(probePrefix+'-detached.txt'));
assert.doesNotMatch(detached,/--- FAIL:|--- SKIP:|^panic:/m);assert.match(detached,/(?:^|\n)PASS\r?(?:\n|$)/);
for(const e of runs.probe.ran.filter(e=>!e.Test.includes('/')))assert.match(detached,new RegExp('--- PASS: '+e.Test+' '));
exact(runs.probe.summary.built.map(b=>b.name),['gc-task.test.exe','gc-task.test','system-backup-migrate','audit-inputs-r2.json']);
for(const b of runs.probe.summary.built){assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.ok(b.bytes>0);}
const badProbePrefix='docs/evidence/d-prune-identity-20261021-r1-probe',badProbe=read(badProbePrefix+'-native.json');
assert.equal(badProbe.exit,2);assert.equal(badProbe.source_postcheck,true);assert.equal(badProbe.source_sha256,final.source_sha256);
assert.match(decode(raw(badProbePrefix+'-detached.stderr')),/flag provided but not defined: -test/);
const probeWrapperFailure={prefix:badProbePrefix,native_sha256:sha(raw(badProbePrefix+'-native.json')),events_sha256:sha(raw(badProbePrefix+'.jsonl')),detached_stderr_sha256:sha(raw(badProbePrefix+'-detached.stderr')),exit:2,source_identical_to_final:true,reason:'PowerShell native test flags were not passed as a string array; parsing failed before detached tests',accepted:false};
const oldMigration='backend/internal/db/migrations/070_add_system_backup_prune_authority.sql',repair='backend/internal/db/migrations/081_fix_system_backup_prune_item_identity.sql';
assert.equal(sha(raw(oldMigration)),base.files.find(p=>p.path===oldMigration).sha256);
const oldSQL=decode(raw(oldMigration)),newSQL=decode(raw(repair));
const body=s=>s.match(/CONSTRAINT chk_sb_prune_item_identity CHECK \(([\s\S]*?)\n\s*\)/)[1];
const oldPattern=body(oldSQL).match(/artifact_public_id REGEXP '([^']+)'/)[1],newPattern=body(newSQL).match(/artifact_public_id REGEXP '([^']+)'/)[1];
assert.equal(newPattern,'^sbk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
const normalized=s=>s.trim().replace(/\s+/g,' ');
assert.equal(normalized(body(newSQL).replace(newPattern,oldPattern)),normalized(body(oldSQL)));
assert.doesNotMatch(newSQL,/NOT ENFORCED|FOREIGN_KEY_CHECKS|CHECK_CONSTRAINT_CHECKS/i);
const {computeMigrationCatalog}=await import(pathToFileURL(path.join(sourceRoot,'scripts/system-backup-contract-check.mjs')));
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,96);assert.equal(catalog.hash,'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe');
const registryPath='contracts/system-backup/v12/schema-registry.json',registry=read(registryPath),oldRegistry=read('docs/evidence/d-prune-identity-before-registry-20261021.json');
assert.equal(sha(raw('docs/evidence/d-prune-identity-before-registry-20261021.json')),base.files.find(p=>p.path===registryPath).sha256);
const withoutCatalog=o=>{const c=structuredClone(o);delete c.migration_catalog;return c;};assert.deepEqual(withoutCatalog(registry),withoutCatalog(oldRegistry));assert.deepEqual(registry.migration_catalog,catalog);
assert.equal(sha(raw('backend/internal/systembackupbusinessa/testdata/schema-registry.json')),sha(raw(registryPath)));
const mfaPath='backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json',producerPath='backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json';
const beforeMFA=raw('docs/evidence/d-prune-identity-before-mfa-20261021.json'),beforeProducer=raw('docs/evidence/d-prune-identity-before-producer-20261021.json');
assert.equal(sha(beforeMFA),base.files.find(p=>p.path===mfaPath).sha256);assert.equal(sha(beforeProducer),base.files.find(p=>p.path===producerPath).sha256);
const oldM=JSON.parse(decode(beforeMFA)),newM=read(mfaPath),oldP=JSON.parse(decode(beforeProducer)),newP=read(producerPath);
oldM.catalog_sha256=catalog.hash;oldM.migration_files.push(path.basename(repair));oldM.migration_files.sort();assert.deepEqual(newM,oldM);
oldP.admission_inputs=decode(raw(mfaPath));oldP.admission_sha256=sha(raw(mfaPath));assert.deepEqual(newP,oldP);
const refresh=read('docs/evidence/d-prune-identity-audit-refresh-20261021.json');assert.equal(refresh.before_source_sha256,runs.initial_full.source.source_sha256);assert.equal(refresh.after_source_sha256,final.source_sha256);
exact(runs.initial_full.source.files.filter(p=>p.sha256!==final.files.find(q=>q.path===p.path)?.sha256).map(p=>p.path),[...refresh.changes.map(p=>p.path),...refresh.metric_fixture_changes]);
for(const p of refresh.changes){const current=decode(raw(p.path));assert.equal(current.split(p.new).length,2);assert.equal(sha(current.replace(p.new,p.old)),runs.initial_full.source.files.find(q=>q.path===p.path).sha256);}
const listPath='docs/evidence/d-prune-identity-normal-go-list-20261021.json',goList=read(listPath);assert.equal(sha(raw(listPath)),refresh.normal_go_list_sha256);assert.ok(goList.IgnoredGoFiles.includes('download_admission_audit_mysql_test.go'));assert.ok(![...goList.GoFiles,...goList.TestGoFiles,...(goList.XTestGoFiles??[])].includes('download_admission_audit_mysql_test.go'));
const completeCoverage={kind:'five_unchanged_packages_plus_controller_full_package_retest',source_compatibility:'only two controller tests, one ignored tagged test and audit bundle count changed after initial full run',main:runs.initial_full.summary.main,checks:runs.initial_full.summary.checks,packages:[...runs.initial_full.summary.packages,...runs.controller.summary.packages].sort(),initial_full_exit_retained:1,controller_retest_exit:0,tagged_change_covered_by_probe:true};
const changes=final.files.filter(p=>!base.files.some(q=>q.path===p.path&&q.sha256===p.sha256));assert.equal(changes.length,17);assert.equal(final.files.length,base.files.length+2);
for(const p of [...changes,...final.files.filter(p=>['backend/go.mod','backend/go.sum'].includes(p.path))])assert.equal(sha(raw(p.path)),p.sha256,'Published source drift: '+p.path);
const binaryReceiptPath='docs/evidence/d-prune-identity-prepublish-binaries-20261021.json';
const binaryReceipt={kind:'d_prune_identity_prepublication_binary_check',source_sha256:final.source_sha256,native_sha256:runs.probe.summary.native_sha256,files:runs.probe.summary.built.map(b=>({...b,format:b.name.endsWith('.exe')?'PE':b.name.endsWith('.json')?'JSON':'ELF'})),dependencies_installed:false,remote:false};
if(preflight){
 assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
 for(const b of binaryReceipt.files){const bytes=fs.readFileSync(path.join(owner,b.name));assert.equal(bytes.length,b.bytes);assert.equal(sha(bytes),b.sha256);if(b.format==='ELF'){assert.equal(bytes.subarray(0,4).toString('hex'),'7f454c46');assert.equal(bytes[4],2);assert.equal(bytes[5],1);assert.equal(bytes.readUInt16LE(18),62);}if(b.format==='PE')assert.equal(bytes.subarray(0,2).toString('ascii'),'MZ');if(b.format==='JSON'){const input=JSON.parse(bytes.toString('utf8'));assert.equal(input.migration_files.length,96);assert.equal(input.catalog_sha256,catalog.hash);}}
 fs.writeFileSync(path.join(root,binaryReceiptPath),JSON.stringify(binaryReceipt,null,2)+'\n',{flag:'wx'});console.log('PASS prepublication: exact source/test closure, capsule-only catalog changes, PE/ELF binaries and 96-file audit input');process.exit(0);
}
assert.deepEqual(read(binaryReceiptPath),binaryReceipt);
const contextPath='docs/evidence/d-prune-identity-published-context-20261021.json',context=read(contextPath);assert.equal(context.stable_copy_verified,true);assert.equal(digest(context.files),context.source_sha256);exact(context.published,changes.map(p=>p.path));
const concurrentChanges=final.files.filter(p=>!context.files.some(q=>q.path===p.path&&q.sha256===p.sha256&&q.size===p.size)).map(p=>p.path),concurrentAdditions=context.files.filter(p=>!final.files.some(q=>q.path===p.path)).map(p=>p.path);
const cleanupPath='docs/evidence/d-prune-identity-cleanup-20261021.json',cleanup=read(cleanupPath);assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_sha256,final.source_sha256);assert.equal(fs.existsSync(cleanup.absolute_owner),false);assert.equal(path.basename(cleanup.absolute_owner),'.tmp-d-index-cache-388c60c7adbe40a1b7fc0d6a71cf8e61');assert.equal(path.dirname(path.resolve(cleanup.absolute_owner)).toLowerCase(),root.toLowerCase());
const operatorPath='docs/evidence/d-prune-identity-operator-failure-20261021.json',operator=read(operatorPath);assert.equal(operator.actual.accepted,false);assert.equal(operator.actual.passed,15);assert.equal(operator.actual.failed.length,3);
const output='docs/evidence/d-prune-identity-preparation-20261021.json';
const report={kind:'d_gc_task_prune_identity_migration_repair_preparation',status:'local_repair_validated_actual_rerun_pending',source_sha256:final.source_sha256,source_files:final.files.length,base_source_sha256:base.source_sha256,changes:changes.map(p=>p.path),old_070_preserved:true,one_check_predicate_repaired:true,catalog,runs:Object.values(runs).map(r=>r.summary),complete_go_coverage:completeCoverage,probe_wrapper_failure:probeWrapperFailure,node:{checks:94,exit:0,tap_sha256:sha(raw(nodePrefix+'.tap')),native_sha256:sha(raw(nodePrefix+'-native.json'))},controls:{receipt:controlPrefix+'.json',sha256:sha(raw(controlPrefix+'.json')),steps:9,strict_exit:1},old_operator_failure:{receipt:operatorPath,sha256:sha(raw(operatorPath)),passed:15,failed:3,accepted:false},capsules:{mfa_sha256:sha(raw(mfaPath)),producer_sha256:sha(raw(producerPath)),old_bytes_archived:true,only_catalog_and_embedded_admission_changed:true,C1_DDL_and_records_unchanged:true},registry:{only_catalog_changed:true,policies_and_approvals_unchanged:true},published:{source_sha256:context.source_sha256,manifest_sha256:sha(raw(contextPath)),matches_final_frozen:concurrentChanges.length===0&&concurrentAdditions.length===0,concurrent_changes:concurrentChanges,concurrent_additions:concurrentAdditions,own_seventeen_files_and_modules_match:true},cleanup:{receipt:cleanupPath,sha256:sha(raw(cleanupPath)),removed:true},dependencies_installed:false,remote_executed:false,boundaries:{old_failure_not_relabelled:true,actual_96_file_migration_not_yet_run:true,actual_GC_task_eighteen_pending:true,old_MFA_tasks_producer_receipts_not_expanded:true,full_GC_not_accepted:true,historical_upgrade_equivalence_not_proven:true,production_approval:false,original_six_scopes_complete:false}};
const concurrentPath='docs/evidence/d-prune-identity-concurrent-review-20261021.json',concurrent=read(concurrentPath);
assert.equal(concurrent.frozen_source_sha256,final.source_sha256);assert.equal(concurrent.published_source_sha256,context.source_sha256);exact(concurrent.changes.map(p=>p.path),concurrentChanges);assert.equal(concurrent.selected_gc_root_and_shared_task_seeds_unchanged,true);assert.equal(concurrent.A_test_roots_not_executed_by_D,true);
report.published.concurrent_assessment={receipt:concurrentPath,sha256:sha(raw(concurrentPath)),selected_gc_root_and_shared_task_seeds_unchanged:true,other_A_roots_not_accepted:true};
report.prepublication_binaries={receipt:binaryReceiptPath,sha256:sha(raw(binaryReceiptPath)),PE_and_ELF64_amd64_checked:true,audit_input_catalog_checked:true};
if(process.argv.includes('--check')){assert.deepEqual(read(output),report);console.log(`PASS prune identity preparation: 94 Node; six-package coverage ${completeCoverage.main}/${completeCoverage.checks} with exact controller retest; seeds ${runs.probe.summary.main}/${runs.probe.summary.checks}; 96-file catalog, publication and cleanup`);}
else{fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(output);}
