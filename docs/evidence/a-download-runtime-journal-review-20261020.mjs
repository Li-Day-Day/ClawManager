import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)), root=resolve(dir,'../..');
const run=process.argv[2]??'20261020-r2';
assert.match(run,/^[a-zA-Z0-9-]+$/);
const prefix=resolve(dir,'a-download-runtime-journal-'+run);
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=JSON.parse(read(prefix+'-source.json'));
assert.equal(source.stable_copy_verified,true); assert.equal(source.dependencies_installed,false); assert.equal(source.production_approved,false);
assert.equal(hash(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
const native=read(prefix+'-native.txt');
for(const marker of [`LOCAL_SOURCE sha256=${source.source_sha256} files=${source.files.length}`,'PASS security-evidence','PASS linux-download-runtime-build sha256=','LOCAL_PASS download-runtime-journal-frozen-postcheck=yes remote=not-run default-vet=yes dependencies-installed=no','CLEANED download-runtime-journal-source-cache-binary=True','PowerShell transcript end'])assert.ok(native.includes(marker),marker);
const events=read(prefix+'-packages.jsonl').trim().split(/\r?\n/).map(line=>JSON.parse(line));
assert.equal(events.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
for(const pkg of packages)assert.equal(events.filter(e=>e.Package===pkg&&!e.Test&&e.Action==='pass').length,1);
const passed=events.filter(e=>e.Test&&e.Action==='pass');
const ran=events.filter(e=>e.Test&&e.Action==='run');
assert.equal(passed.length,ran.length);
for(const e of ran)assert.equal(passed.filter(p=>p.Package===e.Package&&p.Test===e.Test).length,1,`${e.Package} ${e.Test}`);
const roots=['TestDownloadFailureJournalBoundedRecord','TestDownloadFailureJournalRequiresProvisionedFile','TestDownloadFailureJournalStickyDenial','TestDownloadFailureJournalTamperAndCapacity','TestDownloadFailureJournalBusyDoesNotBlockAuthority','TestJournaledDownloadRuntimeFailureGuard','TestDownloadApplicationConcreteBindingsAndClose','TestDownloadApplicationMissingProductionInputsReject','TestDownloadFailureJournalPrivateModes'];
for(const test of roots)assert.equal(passed.filter(e=>e.Test===test).length,1,test);
for(const [test,count]of [[roots[0],2],[roots[1],10],[roots[2],9],[roots[3],6],[roots[7],11],[roots[8],8]])assert.equal(passed.filter(e=>e.Test.startsWith(test+'/')).length,count,test);
const scoped=['download_failure_journal.go','download_failure_journal_test.go','download_runtime_journal.go','download_application.go','download_application_test.go','download_authority.go','download_authority_sql.go','download_runtime.go','system_recovery_audit_journal.go'];
for(const file of scoped){const path='backend/internal/systembackupevidence/'+file,pin=source.files.find(p=>p.path===path);assert.ok(pin,path);assert.equal(hash(readFileSync(resolve(root,path))),pin.sha256,path);}
const owner=native.match(/LOCAL_OWNER download-runtime-journal=(.+)/)?.[1].trim();
assert.ok(owner);assert.equal(dirname(owner).toLowerCase(),root.toLowerCase());assert.match(basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(existsSync(owner),false);
for(const suffix of ['-packages-stderr.txt','-linux-build-stderr.txt'])assert.equal(read(prefix+suffix).trim(),'');
const drift=[];
for(const pin of source.files){const path=resolve(root,pin.path);assert.ok(path.startsWith(root+sep));if(!existsSync(path)||hash(readFileSync(path))!==pin.sha256)drift.push(pin.path);}
const firstPrefix=resolve(dir,'a-download-runtime-journal-20261020-r1');
const first=read(firstPrefix+'-packages.jsonl').trim().split(/\r?\n/).map(line=>JSON.parse(line));
assert.deepEqual(first.filter(e=>e.Action==='fail'&&e.Test).map(e=>e.Test).sort(),[roots[3],roots[3]+'/replace'].sort());
assert.ok(first.some(e=>e.Test===roots[3]+'/replace'&&e.Output?.includes('being used by another process')));
const firstNative=read(firstPrefix+'-native.txt');assert.ok(firstNative.includes('CLEANED download-runtime-journal-source-cache-binary=True'));
const firstOwner=firstNative.match(/LOCAL_OWNER download-runtime-journal=(.+)/)?.[1].trim();assert.ok(firstOwner&&dirname(firstOwner).toLowerCase()===root.toLowerCase());assert.equal(existsSync(firstOwner),false);
const report={kind:'a_download_runtime_journal_local_acceptance',recorded_at:new Date().toISOString(),run,source_sha256:source.source_sha256,source_count:source.files.length,
 packages:packages.map(pkg=>({package:pkg,main_tests:passed.filter(e=>e.Package===pkg&&!e.Test.includes('/')).length,tests_including_subtests:passed.filter(e=>e.Package===pkg).length})),
 new_roots:roots,new_checks_including_roots:passed.filter(e=>roots.some(r=>e.Test===r||e.Test.startsWith(r+'/'))).length,
 linux_binary_sha256:native.match(/PASS linux-download-runtime-build sha256=([a-f0-9]{64})/)[1],scoped_current_inputs_match:true,other_snapshot_input_drift_excluded:drift,
 frozen_postcheck:true,owned_sources_caches_binary_absent:true,first_failed_windows_rename_fixture_preserved:true,first_owned_products_absent:true,dependencies_installed:false,actual_sql:'not_run',linux_file_permissions_and_shared_storage:'not_executed',main_listener_and_deployment:'not_connected',production_approval:false};
const output=resolve(dir,'a-download-runtime-journal-accepted-'+run+'.json');
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
