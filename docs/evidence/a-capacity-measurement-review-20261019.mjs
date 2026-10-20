import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const evidence = dirname(fileURLToPath(import.meta.url));
const root = resolve(evidence, '../..');
const prefix = resolve(evidence, 'a-capacity-measurement-20261020-r4');
const read = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(read(prefix+'-source.json'));
assert.equal(source.stable_copy_verified, true);
assert.equal(source.dependencies_installed, false);
assert.equal(source.production_approved, false);
assert.equal(hash(source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'), source.source_sha256);
const native = read(prefix+'-native.txt');
assert.ok(native.includes(`LOCAL_SOURCE sha256=${source.source_sha256} files=${source.files.length}`));
for (const [file,count] of [['system-backup-d-capacity-deployment.test.mjs',8],['system-backup-d-deployment.test.mjs',4],['system-backup-schema-diff.test.mjs',3]]) {
 assert.ok(native.includes(`PASS node-suite=${file} exit=0`));
 const output=read(prefix+'-'+file+'.txt');
 assert.match(output,/ℹ fail 0/);
 for (const line of [`ℹ tests ${count}`,`ℹ pass ${count}`,'ℹ cancelled 0','ℹ skipped 0','ℹ todo 0']) assert.ok(output.includes(line),`${file}: ${line}`);
 assert.equal(read(prefix+'-'+file+'-stderr.txt').trim(),'');
}
for(const marker of ['PASS full-security-registration','PASS linux-collector-build sha256=', 'LOCAL_PASS capacity-measurement-frozen-postcheck=yes remote=not-run default-vet=yes dependencies-installed=no', 'CLEANED capacity-measurement-source-cache-binary=True']) assert.ok(native.includes(marker), marker);
const owner = native.match(/LOCAL_OWNER capacity-measurement=(.+)/)?.[1].trim();
assert.ok(owner);
assert.equal(dirname(owner).toLowerCase(), root.toLowerCase());
assert.match(basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(existsSync(owner), false);
const events=read(prefix+'-packages.jsonl').trim().split(/\r?\n/).map(line=>JSON.parse(line));
assert.equal(events.filter(e=>e.Action==='fail'||e.Action==='build-fail'||(e.Action==='skip'&&(e.Test||e.Package!=='clawreef/cmd/system-backup-registration'))).length,0);
const packages=['clawreef/internal/systembackupsecurity','clawreef/cmd/system-backup-registration'];
assert.equal(events.filter(e=>e.Package===packages[0]&&!e.Test&&e.Action==='pass').length,1);
// This command has no _test.go files. Go still compiles/vets it, then emits
// a package-level skip rather than a passing test; never count it as tests.
assert.equal(events.filter(e=>e.Package===packages[1]&&!e.Test&&e.Action==='skip').length,1);
assert.ok(events.some(e=>e.Package===packages[1]&&e.Action==='output'&&e.Output.includes('[no test files]')));
const testRoot='TestCapacityMeasurementOriginalWindowAndExactTables';
const cases=['exact','slow_within_original_window','same_count_substitution','missing','duplicate','extra','view','null_allocation','negative_data','negative_index','row_overflow','sum_overflow','start_zero','clock_reversed','at_deadline','past_deadline','stat_failure','negative_space','start','end','query','close','iteration','canceled_after_space'];
for(const test of [testRoot,...cases.map(c=>`${testRoot}/${c}`)]) for(const action of ['run','pass']) assert.equal(events.filter(e=>e.Test===test&&e.Action===action).length,1, `${action} ${test}`);
for(const path of ['backend/internal/systembackupsecurity/registration_capacity_measurement.go','backend/internal/systembackupsecurity/registration_capacity_measurement_test.go','backend/internal/systembackupsecurity/registration_capacity_linux.go']) {
 const pin=source.files.find(p=>p.path===path); assert.ok(pin); assert.equal(hash(readFileSync(resolve(root,path))),pin.sha256,`current scoped input ${path}`);
}
const templates=JSON.parse(read(prefix+'-templates.json'));
for(const pin of templates) assert.equal(hash(readFileSync(resolve(root,pin.path))),pin.sha256);
for(const suffix of ['-packages-stderr.txt','-linux-build-stderr.txt']) assert.equal(read(prefix+suffix).trim(),'');
const failed=read(resolve(evidence,'a-capacity-measurement-20261019-r1-native.txt'));
assert.ok(failed.includes('CLEANED capacity-measurement-source-cache-binary=True'));
assert.equal(failed.includes('START full-security-registration'),false);
const oldOwner=failed.match(/LOCAL_OWNER capacity-measurement=(.+)/)?.[1].trim();
assert.ok(oldOwner&&dirname(oldOwner).toLowerCase()===root.toLowerCase());
assert.equal(existsSync(oldOwner),false);
const interrupted=read(resolve(evidence,'a-capacity-measurement-20261019-r2-native.txt'));
assert.ok(interrupted.includes('START full-security-registration'));
assert.equal(interrupted.includes('PASS full-security-registration'),false);
const interruptedBuild=read(resolve(evidence,'a-capacity-measurement-20261019-r2-packages.jsonl'));
assert.ok(interruptedBuild.includes('vet.exe: exit status 0xc000026b'));
const interruptedOwner=interrupted.match(/LOCAL_OWNER capacity-measurement=(.+)/)?.[1].trim();
assert.ok(interruptedOwner&&dirname(interruptedOwner).toLowerCase()===root.toLowerCase());
assert.equal(existsSync(interruptedOwner),false);
const failedToolRun=read(resolve(evidence,'a-capacity-measurement-20261020-r3-native.txt'));
assert.ok(failedToolRun.includes('CLEANED capacity-measurement-source-cache-binary=True'));
const failedToolOwner=failedToolRun.match(/LOCAL_OWNER capacity-measurement=(.+)/)?.[1].trim();
assert.ok(failedToolOwner&&dirname(failedToolOwner).toLowerCase()===root.toLowerCase());
assert.equal(existsSync(failedToolOwner),false);
assert.ok(read(resolve(evidence,'a-capacity-measurement-20261020-r3-packages.jsonl')).includes('exit status 0xc0000043'));
const report={kind:'a_capacity_measurement_local_acceptance',recorded_at:new Date().toISOString(),source_sha256:source.source_sha256,source_count:source.files.length,
 packages:packages.map(pkg=>({package:pkg,main_tests:events.filter(e=>e.Package===pkg&&e.Action==='pass'&&e.Test&&!e.Test.includes('/')).length,tests_including_subtests:events.filter(e=>e.Package===pkg&&e.Action==='pass'&&e.Test).length})),
 new_measurement_cases:cases.length,node_suites:3,windows_registration_command:'compiled_and_vetted_no_test_files',linux_binary_sha256:native.match(/PASS linux-collector-build sha256=([a-f0-9]{64})/)[1],templates,
 scoped_current_inputs_match:true,frozen_postcheck:true,owned_sources_caches_binaries_absent:true,first_stopped_template_gate_preserved:true,interrupted_vet_tool_failure_preserved:true,windows_compile_tool_failure_preserved:true,interrupted_run_owned_products_absent:true,dependencies_installed:false,
 remote_mysql:'not_run',linux_statfs_and_mount:'not_executed',production_deployed:false,production_approval:false};
writeFileSync(resolve(evidence,'a-capacity-measurement-accepted-20261020.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
