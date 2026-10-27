import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const prefix=resolve(dir,'a-registration-lifecycle-20261020-r1');
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(read(prefix+'-source.json'));
assert.equal(manifest.stable_copy_verified,true);assert.equal(manifest.dependencies_installed,false);assert.equal(manifest.production_approved,false);
assert.equal(hash(manifest.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),manifest.source_sha256);
const native=read(prefix+'-native.txt');
for(const marker of [`LOCAL_SOURCE sha256=${manifest.source_sha256} files=${manifest.files.length}`,'START registration-lifecycle default-vet=yes dependencies-installed=no','PASS registration-lifecycle-linux-build sha256=','LOCAL_PASS registration-lifecycle-frozen-postcheck=yes default-vet=yes dependencies-installed=no','CLEANED registration-lifecycle-source-cache-binary=True','PowerShell transcript end'])assert.ok(native.includes(marker),marker);
const predecessor=read(resolve(dir,'a-download-runtime-journal-20261020-r2-native.txt'));
const previousOwner=predecessor.match(/LOCAL_OWNER download-runtime-journal=(.+)/)?.[1].trim();assert.ok(previousOwner);
assert.ok(native.includes(`seed_source_read_only=${basename(previousOwner)} tests_started=no`));
assert.match(native,/SEED_COMPLETE entries=[1-9][0-9]* unavailable_entries=0 predecessor_terminal=yes source_mutated=no test_result_reuse=no/);
assert.equal(existsSync(previousOwner),false);
const events=read(prefix+'-packages.jsonl').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(events.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
const pkg='clawreef/cmd/system-backup-registration';
assert.equal(events.filter(e=>e.Package===pkg&&!e.Test&&e.Action==='pass').length,1);
const tests=['TestRegistrationHTTPSDrainsActiveHandlerBeforeReturn','TestRegistrationHTTPSTimeoutIsNotDrained','TestRegistrationHTTPSListenerFailureStopsWatcher','TestRegistrationHTTPSCanceledBeforeListen'];
for(const test of tests)for(const action of ['run','pass'])assert.equal(events.filter(e=>e.Test===test&&e.Action===action).length,1,action+' '+test);
assert.equal(events.filter(e=>e.Test&&e.Action==='pass').length,tests.length);
for(const file of ['main.go','http_lifecycle.go','http_lifecycle_test.go']){const path='backend/cmd/system-backup-registration/'+file,pin=manifest.files.find(p=>p.path===path);assert.ok(pin);assert.equal(hash(readFileSync(resolve(root,path))),pin.sha256,path);}
const owner=native.match(/LOCAL_OWNER registration-lifecycle=(.+)/)?.[1].trim();assert.ok(owner);assert.equal(dirname(owner).toLowerCase(),root.toLowerCase());assert.match(basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(existsSync(owner),false);
for(const suffix of ['-packages-stderr.txt','-linux-build-stderr.txt'])assert.equal(read(prefix+suffix).trim(),'');
const report={kind:'a_registration_https_lifecycle_local_acceptance',recorded_at:new Date().toISOString(),source_sha256:manifest.source_sha256,source_count:manifest.files.length,
 tests,actual_tls_and_listener_checks:tests.length,linux_binary_sha256:native.match(/PASS registration-lifecycle-linux-build sha256=([a-f0-9]{64})/)[1],
 scoped_current_inputs_match:true,frozen_postcheck:true,predecessor_and_current_owned_products_absent:true,compiler_cache_only_reused:true,test_result_reuse:false,dependencies_installed:false,
 download_application_mount:'not_connected',real_registries_grants_and_shared_storage:'not_verified',production_approval:false};
writeFileSync(resolve(dir,'a-registration-lifecycle-accepted-20261020-r1.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
