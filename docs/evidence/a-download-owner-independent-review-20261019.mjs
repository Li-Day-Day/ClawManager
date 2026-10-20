import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1')), '../..');
const inputName = process.argv[2] || 'd-download-producer-owner-packages-20261019-r37';
assert(/^[a-zA-Z0-9._-]+$/.test(inputName));
const isPostCommit = inputName === 'a-download-owner-postcommit-20261019-r1';
const isFocused = inputName === 'a-download-owner-postcommit-20261019-r2';
const isR45 = inputName === 'd-download-producer-owner-packages-20261019-r45';
const prefix = 'docs/evidence/' + inputName;
const read = suffix => fs.readFileSync(path.join(root, prefix + suffix));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(read('-source.json'));
assert.equal(source.stable_copy_verified, true);
const logical = source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n';
assert.equal(sha(logical), source.source_sha256);
const events = read('.jsonl').toString('utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
const expected = (isFocused ? ['systembackupevidence'] : ['systembackupsecurity','systembackupevidence','systembackupread','systembackupproducer']).map(p => 'clawreef/internal/' + p);
const packages = [];
for (const pkg of expected) {
  const selected = events.filter(e => e.Package === pkg);
  const finals = selected.filter(e => !e.Test && ['pass','fail','skip'].includes(e.Action));
  assert.equal(finals.length, 1, pkg + ' package terminal count');
  assert.equal(finals[0].Action, 'pass', pkg + ' package failed');
  assert.equal(selected.filter(e => ['fail','skip'].includes(e.Action)).length, 0, pkg + ' failure/skip');
  const runs = selected.filter(e => e.Action === 'run');
  const passes = selected.filter(e => e.Test && e.Action === 'pass');
  assert.equal(runs.length, passes.length);
  assert.equal(new Set(runs.map(e => e.Test)).size, runs.length);
  assert.equal(new Set(passes.map(e => e.Test)).size, passes.length);
  assert.deepEqual(runs.map(e => e.Test).sort(), passes.map(e => e.Test).sort());
  packages.push({package:pkg,main_pass:passes.filter(e => !e.Test.includes('/')).length,all_pass:passes.length});
}
assert.deepEqual([...new Set(events.map(e => e.Package))].sort(), [...expected].sort());
const native = read('-native.txt').toString('utf8');
for (const marker of [isFocused?'NATIVE_EXIT focused_packages=0':'NATIVE_EXIT full_packages=0','default_vet=yes','FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no','CLEANED snapshot=True','d_admission_native_exit=0']) assert(native.includes(marker), marker);
const prior = isPostCommit || isFocused ? null : JSON.parse(read('-review.json'));
if (prior) assert.deepEqual(packages, prior.packages);
const aRoot = 'TestAProducerDownloadChangedOriginalAfterCommit';
const aPasses = events.filter(e => e.Action === 'pass' && e.Test && (e.Test === aRoot || e.Test.startsWith(aRoot + '/')));
if (isPostCommit || isFocused) {
  assert.equal(aPasses.length, 6, 'A root and five post-commit cases must pass');
  assert(source.files.some(p => p.path === 'backend/internal/systembackupevidence/download_producer_owner_a_test.go'));
}
const nativeRoot = 'TestADownloadNativeBufferedOutputKeepsOriginalDeadline';
const nativePasses = events.filter(e => e.Action === 'pass' && e.Test && (e.Test === nativeRoot || e.Test.startsWith(nativeRoot + '/')));
if (isFocused) {
  assert.equal(nativePasses.length, 5, 'native root and four protocol/deadline cases must pass');
  assert.equal(packages[0].all_pass, 11, 'focused run must execute exactly the two selected roots and nine leaves');
}
const publicRoots = ['TestPublicDownloadConcreteOwnerHTTPReleasesAfterRevocationAndCancel','TestPublicDownloadReleaseIsExactClaimAndIndependentOfUserSession'];
const publicPasses = events.filter(e => e.Action === 'pass' && e.Test && publicRoots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
if (isR45) {
  assert.equal(aPasses.length,6,'current A binding regression coverage');
  assert.equal(nativePasses.length,5,'current A native deadline coverage');
  assert.equal(publicPasses.length,16,'both public-release roots and fourteen leaves');
}
const currentDrift = [];
for (const pin of source.files) {
  const file = path.resolve(root, pin.path);
  assert(file.startsWith(root + path.sep), 'source pin escaped checkout');
  if (!fs.existsSync(file)) currentDrift.push({path:pin.path,reason:'missing'});
  else { const bytes = fs.readFileSync(file); if (bytes.length !== pin.size || sha(bytes) !== pin.sha256) currentDrift.push({path:pin.path,reason:'changed'}); }
}
const frozenOwners = [...native.matchAll(/^FROZEN .* owner=(.+)\r?$/gm)].map(m => ({path:m[1].trim()}));
assert.equal(frozenOwners.length, 1, 'exact snapshot owner missing');
if (!prior) assert(!native.includes('EXTERNAL_OWNED_CACHE'), 'external cache cleanup needs separate evidence');
const cleanup = (prior ? prior.cleanup : frozenOwners).map(entry => {
  const target = path.resolve(entry.path);
  assert(target.startsWith(root + path.sep), 'cleanup outside checkout');
  assert.equal(fs.existsSync(target), false, 'D owned directory remains: ' + target);
  return {path:target,exists:false};
});
let currentSetMatches=null;
if (isR45) {
  const files=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/a-download-owner-r45-current-files-20261019.json'),'utf8').replace(/^\uFEFF/,''));
  currentSetMatches=JSON.stringify([...files].sort())===JSON.stringify(source.files.map(p=>p.path).sort());
  assert.equal(new Set(files).size,files.length);
  assert.equal(cleanup.length,15);
}
const report = {kind:isR45?'a_independent_d_public_release_r45_review':isPostCommit||isFocused?'a_postcommit_producer_owner_review':'a_independent_d_producer_owner_r37_review',source_files:source.files.length,source_sha256:source.source_sha256,packages,total_main:packages.reduce((n,p)=>n+p.main_pass,0),total_all:packages.reduce((n,p)=>n+p.all_pass,0),a_postcommit_pass:aPasses.length,native_deadline_pass:nativePasses.length,public_release_pass:publicPasses.length,current_pinned_drift:currentDrift,current_source_set_matches:currentSetMatches,current_new_files_not_covered:!currentSetMatches,cleanup,hashes:{log:sha(read('.jsonl')),source:sha(read('-source.json')),native:sha(read('-native.txt'))},actual_mysql:false,production_approved:false,scope:isR45?'D r45 four ordinary packages and public cleanup regression. No tagged/MySQL or production approval. Changed current pins excluded.':isFocused?'Only the two A regression roots and their nine leaves. Not a full package, tagged build or actual SQL.':isPostCommit?'A post-commit tests and four ordinary Go packages only; no MySQL-tagged build or actual SQL. Changed current pins excluded.':'D r37 only; current additions and changed pins excluded. A post-commit tests require a separate run.'};
const output = path.join(root,'docs/evidence/'+(isR45?'a-download-owner-r45-independent-review-20261019.json':isFocused?'a-download-owner-postcommit-focused-review-20261019.json':isPostCommit?'a-download-owner-postcommit-review-20261019.json':'a-download-owner-independent-review-20261019.json'));
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
