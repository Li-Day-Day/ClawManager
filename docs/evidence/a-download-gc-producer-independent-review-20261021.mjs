// Independently read the repaired full baseline. No Go, SSH, SQL or cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const json = p => JSON.parse(decode(raw(p)));
const events = p => decode(raw(p)).trim().split('\n').filter(Boolean).map(JSON.parse);
const checks = [];
const check = (name, ok) => {assert.ok(ok, name); checks.push(name);};
function exact(name, a, b) {assert.equal(new Set(a).size, a.length, name); assert.deepEqual(a.slice().sort(), b.slice().sort(), name); checks.push(name);}
function manifest(p) {
  const s = json(p);
  check(p + ': offline stable unapproved', s.stable_copy_verified === true && s.dependencies_installed === false && s.production_approved === false);
  check(p + ': safe unique files', new Set(s.files.map(f => f.path)).size === s.files.length && s.files.every(f => /^(backend|contracts|scripts|docs)\//.test(f.path) && !f.path.includes('\\') && !f.path.split('/').some(n => ['.', '..', ''].includes(n)) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.size) && f.size >= 0));
  check(p + ': recomputed ordered digest', sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === s.source_sha256);
  return s;
}
function inventory(p, packages) {
  const es = events(p);
  check(p + ': no failure skip or build failure', !es.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)));
  const ids = action => es.filter(e => e.Test && e.Action === action).map(e => `${e.Package}\0${e.Test}`);
  exact(p + ': unique complete RUN/PASS inventory', ids('run'), ids('pass'));
  exact(p + ': complete terminal package passes', es.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package), packages);
  return es.filter(e => e.Test && e.Action === 'pass');
}
const stem = 'docs/evidence/d-download-gc-producer-20261021-r5';
const sourcePath = stem + '-source.json', eventPath = stem + '.jsonl', nativePath = stem + '-native.txt';
check('pinned new raw manifest', sha256(raw(sourcePath)) === 'd80b0d3da94760e36dbc2ad71724c94865ae11e2144b2667a360c013391274c8');
check('pinned new complete events', sha256(raw(eventPath)) === '71b8c00f682f564862672fadde206aec06205a2b3ca87aafaa1524b60c3bdea9');
const source = manifest(sourcePath);
check('repaired source 1457 inputs', source.files.length === 1457 && source.source_sha256 === '727348b948844c09a40390957f760d7f310a3f8d970b3d84e85740adae71042d');
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer'].map(n => 'clawreef/internal/' + n);
const passed = inventory(eventPath, packages), oldStem = 'docs/evidence/d-download-gc-batch-20261020-r3';
const oldSource = manifest(oldStem + '-source.json'), oldPassed = inventory(oldStem + '.jsonl', packages);
check('old independently accepted baseline is pinned', sha256(raw('docs/evidence/a-download-gc-batch-independent-accepted-20261021.json')) === '3c0b33adf6bbbad51dc98b5c59dea01cbda6b669fe9cc691357437d913ecbcd3');
const oldNames = new Set(oldPassed.map(e => `${e.Package}\0${e.Test}`)), names = new Set(passed.map(e => `${e.Package}\0${e.Test}`));
check('all old 6167 checks retained', oldNames.size === 6167 && [...oldNames].every(n => names.has(n)));
const added = passed.filter(e => !oldNames.has(`${e.Package}\0${e.Test}`));
check('only new component 8 roots 75 checks added', added.length === 75 && added.filter(e => !e.Test.includes('/')).length === 8 && added.every(e => e.Package === packages[1] && /^TestDownloadRetentionGC(?:Producer|OriginalManifestAndCreation)/.test(e.Test)));
const expectedCounts = [[255, 2011], [349, 2928], [75, 519], [75, 784]];
const packageResults = packages.map((p, i) => {
  const list = passed.filter(e => e.Package === p), main = list.filter(e => !e.Test.includes('/')).length;
  check('package exact counts: ' + p, main === expectedCounts[i][0] && list.length === expectedCounts[i][1]);
  return {package: p, main, all: list.length};
});
const two = passed.filter(e => packages.slice(0, 2).includes(e.Package));
check('new owner complete inventory 604 roots 4939 checks', two.length === 4939 && two.filter(e => !e.Test.includes('/')).length === 604);
const failedReceiptPath = 'docs/evidence/a-download-owners-local-failure-reviewed-20261021.json', failure = json(failedReceiptPath);
check('operator completed local failure is retained', failure.status === 'failed_before_remote_not_accepted' && failure.outer_exit === 1 && failure.remote_started === false && failure.failed_leaf_count === 5);
for (const name of failure.failed_test_names) check('previous failed test now passed: ' + name, passed.some(e => e.Package === packages[1] && e.Test === name));
const oldPins = new Map(oldSource.files.map(f => [f.path, f]));
const changed = source.files.filter(f => oldPins.get(f.path)?.sha256 !== f.sha256 || oldPins.get(f.path)?.size !== f.size).map(f => f.path);
exact('only expected backend/contract changes', changed.filter(p => /^(backend|contracts)\//.test(p)), ['download_retention_gc.go', 'download_retention_gc_test.go', 'download_retention_gc_producer.go', 'download_retention_gc_producer_test.go', 'download_task_owner_a_mysql_test.go'].map(n => 'backend/internal/systembackupevidence/' + n));
check('no baseline input removed', oldSource.files.every(f => source.files.some(n => n.path === f.path)));
check('repaired A owner tagged fixture retained', source.files.find(f => f.path.endsWith('/download_task_owner_a_mysql_test.go'))?.sha256 === '84834cc7d56248d345475d7d52236bd924eaff16a4970ec2d53f452ea24b3466');
const native = decode(raw(nativePath));
for (const marker of ['NATIVE_PARALLELISM build=1 gomaxprocs=1', 'NATIVE_TIME_BUDGET package_timeout_seconds=900 request_deadlines_unchanged=yes', 'NATIVE_EXIT full_packages=0 packages=./internal/systembackupsecurity,./internal/systembackupevidence,./internal/systembackupread,./internal/systembackupproducer default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no', 'FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no', 'CLEANED snapshot=True', 'PowerShell transcript end', 'End time:']) check('terminal native marker: ' + marker, native.includes(marker));
const exits = [...native.matchAll(/^d_admission_native_exit=(-?\d+)$/gm)]; check('single native exit zero', exits.length === 1 && exits[0][1] === '0');
check('empty ordinary stderr', raw(stem + '-stderr.txt').length === 0);
check('no actual remote execution', !/^RUN namespace=/m.test(native));
const owners = [...native.matchAll(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/gm)];
check('single matching frozen source', owners.length === 1 && Number(owners[0][1]) === source.files.length && owners[0][2] === source.source_sha256);
const owner = owners[0][3].trim();
check('owned snapshot independently absent', path.dirname(path.resolve(owner)).toLowerCase() === workspace.toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)) && !fs.existsSync(owner));
const stages = [];
for (const stage of ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration']) {
  check('successful offline probe: ' + stage, native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`) && raw(stem + '-' + stage + '-stderr.txt').length === 0);
  stages.push({stage, output_sha256: sha256(raw(stem + '-' + stage + '.txt')), stderr_sha256: sha256(raw(stem + '-' + stage + '-stderr.txt'))});
}
const seeds = inventory(stem + '-tagged-seed.txt', [packages[1]]).map(e => e.Test);
check('three producer seeds 22 checks', seeds.length === 22 && seeds.filter(n => !n.includes('/')).length === 3);
const detached = decode(raw(stem + '-detached-seed.txt'));
exact('detached exact RUN inventory', [...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), seeds);
exact('detached exact PASS inventory', [...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), seeds);
check('detached terminal pass no failure skip', /\nPASS\s*$/.test(detached) && !/--- (?:FAIL|SKIP):|panic:/.test(detached));
const binaries = [...native.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m => ({name: m[1], sha256: m[2]}));
exact('three compiled binary pins', binaries.map(b => b.name), ['download-admission.test.exe', 'download-admission.test', 'system-backup-migrate']);
const cleanupPath = 'docs/evidence/d-download-gc-producer-cleanup-20261021.json', cleanup = json(cleanupPath);
check('caller cleanup offline six owned directories', cleanup.paths.length === 6 && cleanup.dependencies_installed === false && cleanup.remote_run === false);
for (const p of cleanup.paths) check('independently absent cleanup: ' + p.path, path.dirname(path.resolve(p.path)).toLowerCase() === workspace.toLowerCase() && /^(?:\.tmp-d-index-cache-[a-f0-9]{32}|\.tmp-d-admission-gc-producer-20261021-r1)$/.test(path.basename(p.path)) && p.exists === false && !fs.existsSync(p.path));
check('full source owner included in caller cleanup', cleanup.paths.some(p => p.path === owner));
for (const f of source.files) {const b = raw(f.path); check('current frozen bytes: ' + f.path, b.length === f.size && sha256(b) === f.sha256);}
const record = {kind: 'a_independent_repaired_gc_producer_full_baseline_review', recorded_at: new Date().toISOString(), status: 'accepted_frozen_local_baseline_only',
  source: sourcePath, source_manifest_sha256: sha256(raw(sourcePath)), source_sha256: source.source_sha256, source_files: source.files.length,
  events: eventPath, events_sha256: sha256(raw(eventPath)), native: nativePath, native_sha256: sha256(raw(nativePath)),
  full: {main: 754, all: 6242, packages: packageResults}, owner_baseline: {main: 604, all: 4939}, previous_full_tests_retained: 6167, previous_owner_tests_retained: 4864,
  component: {main: 8, all: 75, names: added.map(e => e.Test).sort()}, operator_failed_attempt: failedReceiptPath, operator_failure_receipt_sha256: sha256(raw(failedReceiptPath)), previously_failed_tests_now_pass: failure.failed_test_names,
  changed_inputs_from_batch_baseline: changed, default_vet: true, unit_and_final_postchecks: true, native_exit: 0, probe_stages: stages, binaries,
  cleanup: cleanupPath, cleanup_sha256: sha256(raw(cleanupPath)), cleanup_paths_independently_absent: cleanup.paths.map(p => p.path),
  current_frozen_bytes_match: true, current_whole_worktree_verified: false, tests_or_builds_repeated: false, dependencies_installed: false, test_build_artifacts_created: false,
  actual_sql_cases_run: 0, owner_eleven_actual_sql_accepted: false, complete_gc_policy_approved: false, production_approved: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-download-gc-producer-independent-review-20261021.mjs')), checks_passed: checks.length, checks};
const output = path.join(workspace, 'docs/evidence/a-download-gc-producer-independent-accepted-20261021.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);}
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, checks: checks.length, full_checks: 6242, owner_checks: 4939, actual_sql_cases_run: 0}));
