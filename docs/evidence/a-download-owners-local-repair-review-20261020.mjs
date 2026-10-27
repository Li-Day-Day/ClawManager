import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const read = name => fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const oldLogName = 'a-download-owners-mysql-remote-20261020-133409-ebbf810b.txt';
const logName = 'a-download-owners-local-repair-20261020-144930-6819f05e.txt';
const sourceName = 'a-download-owners-local-repair-source-20261020-144930-6819f05e.json';
const log = read(logName);
const oldLog = read(oldLogName);
const manifest = JSON.parse(read(sourceName));
const oldManifest = JSON.parse(read('a-download-owners-mysql-remote-source-20261020-133409-ebbf810b.json'));
const checks = [];
function check(name, value) { assert(value, name); checks.push(name); }
function absentOwner(text) {
  const owner = text.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)?.[1];
  return owner && path.dirname(owner) === root && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)) && !fs.existsSync(owner);
}
for (const m of [oldManifest, manifest]) {
  check('manifest logical SHA: ' + m.source_sha256, sha(m.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === m.source_sha256);
  check('stable offline unapproved snapshot: ' + m.source_sha256, m.stable_copy_verified === true && m.dependencies_installed === false && m.production_approved === false);
}
check('old failure retained', oldLog.includes('a_download_owners_mysql_remote_exit=1') && oldLog.includes('panic: test timed out after 10m0s') && /^--- FAIL: TestDownloadRetentionGC/m.test(oldLog));
check('old remote did not start', oldLog.includes('remote validation has not started') && !/^RUN namespace=/m.test(oldLog));
check('old cleanup verified', oldLog.includes('CLEANED local-registration-build-cache=True') && absentOwner(oldLog));
check('new source bound to log', log.includes(`source_sha256=${manifest.source_sha256} files=${manifest.files.length}`));
check('new complete gate passed', log.includes('a_download_owners_local_repair_exit=0') && log.includes('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False'));
check('new no assertion failures or skips', !/^\s*--- (FAIL|SKIP):|^panic:|^fatal error:/m.test(log));
check('new remote not requested', !/^RUN namespace=/m.test(log));
check('new cleanup verified', log.includes('CLEANED local-registration-build-cache=True') && absentOwner(log));
check('detached seeds executed', log.includes('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent'));
check('Linux owner probe and migration runner compiled', /^LOCAL_PASS a-download-owners-.*linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=[a-f0-9]{64} ddl_sha256=[a-f0-9]{64}$/m.test(log) && /^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=[a-f0-9]{64}$/m.test(log));
const sections = [];
let ran = [], passed = [], evidencePassed = [];
for (const line of log.split('\n')) {
  const run = line.match(/^=== RUN\s+(\S+)/);
  const pass = line.match(/^\s*--- PASS: (\S+) \(/);
  if (run) ran.push(run[1]);
  if (pass) passed.push(pass[1]);
  const summary = line.match(/^ok\s+(clawreef\/internal\/\S+)\s+([\d.]+)s/);
  if (!summary) continue;
  check('all RUNs passed: ' + summary[1] + ':' + sections.length, ran.length > 0 && ran.length === passed.length && [...ran].sort().join('\n') === [...passed].sort().join('\n'));
  if (sections.length === 1) evidencePassed = [...passed];
  sections.push({ package: summary[1], main: ran.filter(t => !t.includes('/')).length, all: ran.length, seconds: Number(summary[2]) });
  ran = []; passed = [];
}
check('two complete business packages and tagged seeds', sections.length === 3 && sections[0].package.endsWith('/systembackupsecurity') && sections[1].package.endsWith('/systembackupevidence') && sections[2].package.endsWith('/systembackupevidence'));
check('three detached seed roots all passed', ran.length === passed.length && ran.length === sections[2].all && [...ran].sort().join('\n') === [...passed].sort().join('\n') && ran.filter(t => !t.includes('/')).length === 3);
check('complete package sizes retained', sections[0].all >= 2011 && sections[1].all >= 2600);
const failedMainTests = [...oldLog.matchAll(/^--- FAIL: (\S+) /gm)].map(m => m[1]);
check('original failing roots passed in full package', failedMainTests.every(t => evidencePassed.includes(t)));
check('published INT positive and timed-out publication test passed', evidencePassed.includes('TestAGCDirectAuditResourcePublishedInteger/published_int') && evidencePassed.includes('TestSystemPublicationFinishFinalGuard/missing_version'));
const changed = oldManifest.files.filter(f => {
  const next = manifest.files.find(n => n.path === f.path);
  return !next || next.sha256 !== f.sha256 || next.size !== f.size;
}).map(f => f.path);
const drift = manifest.files.filter(f => !fs.existsSync(path.join(root, f.path)) || sha(fs.readFileSync(path.join(root, f.path))) !== f.sha256).map(f => f.path);
const report = {
  kind: 'a_download_owners_local_gate_repair_review',
  old_run: { log: oldLogName, source_sha256: oldManifest.source_sha256, exit: 1, actual_mysql: 'not_started', failed_main_tests: failedMainTests, package_timeout_seconds: 600 },
  accepted_local_run: { log: logName, source_manifest: sourceName, source_sha256: manifest.source_sha256, files: manifest.files.length, packages: sections, detached_seeds: { main: 3, all: ran.length }, exit: 0, default_vet: true, dependencies_installed: false, remote_requested: false, owned_artifacts_absent: true },
  changed_old_inputs: changed,
  current_frozen_input_drift: drift,
  known_tool_failures_retained: [...log.matchAll(/^.*(?:vet|asm|compile)\.exe: exit status 0xc000(?:0043|026b)\s*$/gm)].map(m => m[0].trim()),
  checks,
  scope: 'Accept the frozen local owner-profile preparation only. Actual eleven-case SQL validation and production approval remain pending; current drift is excluded.'
};
const out = path.join(dir, 'a-download-owners-local-repair-accepted-20261020.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ accepted: true, packages: sections, changed_old_inputs: changed, current_drift: drift, checks: checks.length, output: out }));
