import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [logName, sourceName] = process.argv.slice(2);
for (const name of [logName, sourceName]) assert(name && /^[A-Za-z0-9._-]+$/.test(name), 'pass evidence filenames only');
const read = name => fs.readFileSync(path.join(root, 'docs/evidence', name));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const logBytes = read(logName), sourceBytes = read(sourceName);
const log = logBytes.toString('utf8');
const source = JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/, ''));
assert.equal(source.stable_copy_verified, true);
assert.equal(sha(source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'), source.source_sha256);
assert(!/^\s*--- (?:FAIL|SKIP):/m.test(log), 'test failed or skipped');
assert(!/^FAIL(?:\s|$)/m.test(log), 'Go invocation failed');
for (const marker of [
  'PASS download-admission-dispatch:',
  'LOCAL_PASS isolated-go-telemetry=off',
  'LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent',
  'LOCAL_PASS a-download-admission-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run',
  'LOCAL_PASS pinned-migration-runner-compiled=yes',
  'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False',
  'CLEANED local-registration-build-cache=True',
  'a_download_admission_final_exit=0'
]) assert(log.includes(marker), 'missing '+marker);
const summaries = [...log.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)];
assert.deepEqual(summaries.map(m=>m[1]), ['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupevidence']);
let previous = 0;
const stages = summaries.map((m,n) => {
  const segment = log.slice(previous,m.index);
  previous = m.index + m[0].length;
  const passes = [...segment.matchAll(/^\s*--- PASS: (\S+) /gm)].map(p=>p[1]);
  assert.equal(new Set(passes).size, passes.length, 'duplicate completed test in stage');
  return {stage:n<2?'ordinary_full_package':'tagged_seed',package:m[1],elapsed:m[2],main_pass:passes.filter(p=>!p.includes('/')).length,all_pass:passes.length,tests:passes};
});
const evidence = stages[1].tests;
for (const [test,total] of [
  ['TestAProducerDownloadChangedOriginalAfterCommit',6],
  ['TestADownloadNativeBufferedOutputKeepsOriginalDeadline',5],
  ['TestDownloadLegacyHTTPWithSTSAndTransit',3],
  ['TestProducerDownloadActualAdmissionProviderAndRevokedResult',1]
]) assert.equal(evidence.filter(p=>p===test||p.startsWith(test+'/')).length,total,test);
assert.equal(stages[2].main_pass,2);
assert.equal(stages[2].all_pass,12);
const standalone = log.slice(previous,log.indexOf('LOCAL_PASS config-standalone-seed=yes',previous));
assert.equal([...standalone.matchAll(/^\s*--- PASS: (\S+) /gm)].length,12,'detached seed count');
const ownerMatch = log.match(/^LOCAL_OWNER config-writer-source=(.+)\r?$/m);
assert(ownerMatch,'source owner missing');
const owner = path.resolve(ownerMatch[1].trim());
assert.equal(path.dirname(owner),root);
assert(/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)));
assert(log.includes('LOCAL_CLEANUP config-writer-source-owned='+owner+' removed=True'));
assert.equal(fs.existsSync(owner),false,'source/cache owner remains');
const drift=[];
for (const pin of source.files) {
  const target=path.resolve(root,pin.path);
  assert(target.startsWith(root+path.sep),'source path escaped checkout');
  if (!fs.existsSync(target)) drift.push({path:pin.path,reason:'missing'});
  else {const bytes=fs.readFileSync(target);if(bytes.length!==pin.size||sha(bytes)!==pin.sha256)drift.push({path:pin.path,reason:'changed'});}
}
for (const required of ['backend/internal/systembackupevidence/download_producer_owner_a_test.go','backend/internal/systembackupevidence/download_output_deadline_a_test.go','backend/internal/systembackupevidence/download_runtime_test.go','backend/internal/systembackupevidence/download_admission_a_mysql_test.go','scripts/system-backup-d-config-writer-validation.ps1']) {
  assert(source.files.some(p=>p.path===required),'missing required current pin '+required);
  assert(!drift.some(p=>p.path===required),'required source changed '+required);
}
const pins=Object.fromEntries(source.files.map(p=>[p.path,p]));
const linux=log.match(/linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})/);
assert(linux);
assert.equal(linux[2],pins['backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json'].sha256);
const runner=log.match(/migration_binary_sha256=([a-f0-9]{64})/);assert(runner);
const earlierCleanup = ['.tmp-d-index-cache-07b151f7bd1940b68661dd92ddc2d981','.tmp-d-index-cache-f768f25678594ef19f0a7bc96283ef3b','.tmp-d-index-cache-90335ce423bd4833a283f3aad04bbcbe','.tmp-d-index-cache-727a58dbce7f461e93a6681239be680b','.tmp-d-admission-a-owner-review-d101c056438f4bf6a3146e4907867c57','.tmp-d-index-cache-597d50af24b24752a21b0aab34bb21f4'].map(name=>{
  const target=path.join(root,name);assert.equal(fs.existsSync(target),false,'earlier owned directory remains');return {path:target,exists:false};
});
const report={kind:'a_download_admission_final_local_preparation_review',source_files:source.files.length,source_sha256:source.source_sha256,stages:stages.map(({tests,...s})=>s),ordinary_main:stages.slice(0,2).reduce((n,s)=>n+s.main_pass,0),ordinary_all:stages.slice(0,2).reduce((n,s)=>n+s.all_pass,0),detached_seed_all:12,linux_probe_sha256:linux[1],inputs_sha256:linux[2],migration_runner_sha256:runner[1],current_pinned_drift:drift,current_new_inputs_not_covered:true,cleanup:{owner,exists:false,nested_build_cache_removed:true},earlier_cleanup:earlierCleanup,log_sha256:sha(logBytes),source_file_sha256:sha(sourceBytes),actual_mysql:false,production_approved:false,dependencies_installed:false,scope:'Current frozen ordinary security/evidence packages, both seed roots in-package and detached, Linux probe/runner builds, postcheck and exact owner cleanup only. No remote SQL or real deployment/authority/capacity approval.'};
fs.writeFileSync(path.join(root,'docs/evidence/a-download-admission-final-preparation-review-20261019.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
