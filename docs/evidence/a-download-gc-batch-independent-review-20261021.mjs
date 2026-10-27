// Read original evidence only. No Go, SSH, SQL, dependency installation or cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';

const raw = p => fs.readFileSync(path.join(workspace, p));
const json = p => JSON.parse(decode(raw(p)));
const events = p => decode(raw(p)).trim().split('\n').filter(Boolean).map(JSON.parse);
const checks = [];
function check(name, ok) { assert.ok(ok, name); checks.push(name); }
function exact(name, a, b) {
  assert.equal(new Set(a).size, a.length, name + ': unique');
  assert.deepEqual(a.slice().sort(), b.slice().sort(), name); checks.push(name);
}
function manifest(p) {
  const m = json(p);
  check(p + ': stable offline unapproved source', m.stable_copy_verified === true && m.dependencies_installed === false && m.production_approved === false);
  check(p + ': safe unique files', new Set(m.files.map(f => f.path)).size === m.files.length && m.files.every(f => /^(backend|contracts|scripts|docs)\//.test(f.path) && !f.path.includes('\\') && !f.path.split('/').some(s => ['..', '.', ''].includes(s)) && Number.isSafeInteger(f.size) && f.size >= 0 && /^[a-f0-9]{64}$/.test(f.sha256)));
  check(p + ': ordered logical digest', sha256(m.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === m.source_sha256);
  return m;
}
function inventory(p, packages) {
  const es = events(p);
  check(p + ': no failed or skipped tests', !es.some(e => ['fail', 'build-fail', 'skip'].includes(e.Action)));
  const ids = action => es.filter(e => e.Test && e.Action === action).map(e => `${e.Package}\0${e.Test}`);
  exact(p + ': full unique RUN/PASS pairs', ids('run'), ids('pass'));
  exact(p + ': package terminal passes', es.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package), packages);
  return es.filter(e => e.Test && e.Action === 'pass');
}
const stem = 'docs/evidence/d-download-gc-batch-20261020-r3';
const sourcePath = stem + '-source.json', eventPath = stem + '.jsonl';
check('independently pinned raw manifest', sha256(raw(sourcePath)) === '70ba3043184f012cc0278762d4e03a509ab41e05c1bad674766b608a6cede1ef');
check('independently pinned raw full events', sha256(raw(eventPath)) === 'fd7bc902bae8ee7028adeae48cc05e7873397b44bb979e996d31fcd1cf0617fb');
const source = manifest(sourcePath);
check('1455-input reviewed source', source.files.length === 1455 && source.source_sha256 === 'd9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542');
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer'].map(p => 'clawreef/internal/' + p);
const passed = inventory(eventPath, packages);
check('four complete packages 746 roots / 6167 checks', passed.length === 6167 && passed.filter(e => !e.Test.includes('/')).length === 746);
const oldStem = 'docs/evidence/a-gc-nil-adapters-20261020-r1';
const oldSource = manifest(oldStem + '-source.json');
const oldPassed = inventory(oldStem + '-fixed-full-attempt1.jsonl', packages.slice(0, 2));
const oldNames = new Set(oldPassed.map(e => `${e.Package}\0${e.Test}`));
const two = passed.filter(e => packages.slice(0, 2).includes(e.Package));
const newNames = new Set(two.map(e => `${e.Package}\0${e.Test}`));
check('all 4822 old two-package tests retained', oldNames.size === 4822 && [...oldNames].every(n => newNames.has(n)));
const added = two.filter(e => !oldNames.has(`${e.Package}\0${e.Test}`));
const batch = passed.filter(e => e.Test.startsWith('TestDownloadRetentionGCBatch'));
exact('only the six batch roots / 42 checks were added', added.map(e => e.Test), batch.map(e => e.Test));
check('new two-package inventory 596 roots / 4864 checks', two.length === 4864 && two.filter(e => !e.Test.includes('/')).length === 596 && batch.length === 42 && batch.filter(e => !e.Test.includes('/')).length === 6);
const focused = inventory('docs/evidence/d-download-gc-batch-20261020-r2.jsonl', [packages[1]]);
exact('focused inventory exactly repeated inside complete run', batch.map(e => e.Test), focused.map(e => e.Test));
const oldPins = new Map(oldSource.files.map(f => [f.path, f]));
const changed = source.files.filter(f => oldPins.get(f.path)?.sha256 !== f.sha256 || oldPins.get(f.path)?.size !== f.size).map(f => f.path);
exact('only three ordinary source changes', changed.filter(p => /^(backend|contracts)\//.test(p)), [
  'backend/internal/systembackupevidence/download_retention_gc.go',
  'backend/internal/systembackupevidence/download_retention_gc_batch.go',
  'backend/internal/systembackupevidence/download_retention_gc_batch_test.go'
]);
check('no old frozen input removed', oldSource.files.every(f => source.files.some(n => n.path === f.path)));
for (const f of source.files) {
  const b = raw(f.path);
  check('current frozen bytes: ' + f.path, b.length === f.size && sha256(b) === f.sha256);
}
const native = decode(raw(stem + '-native.txt'));
check('raw native log pinned', sha256(raw(stem + '-native.txt')) === 'd703e6dac24b2b21ce82795d691dad559af74f705d09b1b13d7c872b4716754d');
for (const marker of ['NATIVE_PARALLELISM build=1 gomaxprocs=1', 'NATIVE_TIME_BUDGET package_timeout_seconds=900 request_deadlines_unchanged=yes', 'NATIVE_EXIT full_packages=0', 'default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes', 'FROZEN_POSTCHECK pass=yes', 'CLEANED snapshot=True', 'd_admission_native_exit=0', 'PowerShell transcript end']) check('native marker: ' + marker, native.includes(marker));
check('empty full-test stderr', raw(stem + '-stderr.txt').length === 0);
check('native manifest binding', native.includes(`FROZEN files=1455 sha256=${source.source_sha256} owner=`));
const probeStages = [];
for (const stage of ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration']) {
  const output = stem + '-' + stage + '.txt', stderr = stem + '-' + stage + '-stderr.txt';
  check('offline successful probe: ' + stage, native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`) && raw(stderr).length === 0);
  probeStages.push({stage, output_sha256: sha256(raw(output)), stderr_sha256: sha256(raw(stderr))});
}
const seeds = inventory(stem + '-tagged-seed.txt', [packages[1]]);
check('producer seed is three roots / 22 checks, not owner SQL evidence', seeds.length === 22 && seeds.filter(e => !e.Test.includes('/')).length === 3);
const detached = decode(raw(stem + '-detached-seed.txt'));
exact('detached RUN/PASS inventory', [...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), seeds.map(e => e.Test));
exact('detached PASS inventory', [...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), seeds.map(e => e.Test));
check('detached terminal success, no skip/failure', /\nPASS\s*$/.test(detached) && !/--- (?:FAIL|SKIP):|panic:/.test(detached));
const cleanupPath = 'docs/evidence/d-download-gc-batch-cleanup-20261020.json', cleanup = json(cleanupPath);
check('four cleanup paths, offline only', cleanup.paths.length === 4 && cleanup.dependencies_installed === false && cleanup.remote_run === false);
for (const p of cleanup.paths) check('independently absent: ' + p.path, p.exists === false && path.dirname(path.resolve(p.path)).toLowerCase() === workspace.toLowerCase() && !fs.existsSync(p.path));
const interruption = json('docs/evidence/d-download-gc-batch-r2-interruption-20261021.json');
check('r2 interruption remains unknown final exit', interruption.original_final_exit === null && interruption.original_final_postcheck === false && interruption.tool_handle_missing === true && interruption.exists === false);
const d = json('docs/evidence/d-download-gc-batch-preparation-20261020.json');
check('D receipt matches original full-run pins', d.full.source_manifest_sha256 === sha256(raw(sourcePath)) && d.full.events_sha256 === sha256(raw(eventPath)) && d.full.native_sha256 === sha256(raw(stem + '-native.txt')) && d.cleanup_sha256 === sha256(raw(cleanupPath)));
assert.deepEqual(d.full.probe_stages, probeStages);
check('D receipt retains zero actual SQL and no production approval', d.actual_sql_cases === 0 && d.remote_run === false && d.production_approved === false && d.focused.original_final_exit === null);
const current = decode(raw('backend/internal/systembackupevidence/download_retention_gc_batch.go'));
const collector = decode(raw('backend/internal/systembackupevidence/download_retention_gc.go'));
check('locked collector still uses its exact FOR UPDATE worker query', /s\.readWorker\(ctx, tx, downloadGCWorkerSQL\)/.test(collector));
check('scan worker projection matches locked collector', /SELECT operation_type,target_type,target_public_id,actor_type,actor_id,status,claim_owner,claim_expires_at,row_version,deadline_at,schema_version\nFROM system_backup_operations WHERE origin_installation_id=\? AND public_id=\?`/.test(current));
const requiredCases = ['UsesFreshCollector/collected', 'UsesFreshCollector/revoked', 'UsesFreshCollector/write_failed', 'UsesFreshCollector/unknown_commit', 'ScanRejectsUntrustedHints/unsupported_schema', 'ScanRejectsUntrustedHints/null_schema', 'ScanRejectsUntrustedHints/duplicate_pk', 'ScanRejectsUntrustedHints/excess_rows', 'EmptyAndPinnedRange/closed_cursor', 'ChecksWorkerOnEmptyRange/replaced_claim', 'ChecksWorkerOnEmptyRange/stopped_worker', 'ChecksWorkerOnEmptyRange/expired_lease', 'StopsWithoutRetry/unknown_canceled', 'StopsWithoutRetry/cancel_after_commit'];
for (const name of requiredCases) check('required batch edge: ' + name, batch.some(e => e.Test === 'TestDownloadRetentionGCBatch' + name));
const record = {kind: 'a_independent_d_gc_batch_review', recorded_at: new Date().toISOString(), accepted_scope: 'Frozen batch models and existing collector composition; no actual SQL or production acceptance',
  source: sourcePath, source_manifest_sha256: sha256(raw(sourcePath)), source_sha256: source.source_sha256, source_files: source.files.length,
  events: eventPath, events_sha256: sha256(raw(eventPath)), full: {main: 746, all: 6167}, owner_baseline: {main: 596, all: 4864}, previous_owner_tests_retained: 4822,
  batch: {main: 6, all: 42, test_names: batch.map(e => e.Test).sort()}, changed_inputs_from_nil_baseline: changed,
  cleanup_paths_independently_absent: cleanup.paths.map(p => p.path), r2_final_exit: null,
  current_frozen_bytes_match: true, current_whole_worktree_verified: false, actual_sql_cases_run: 0, tests_or_builds_repeated: false,
  full_gc_policy_approved: false, production_approved: false, dependencies_installed: false, test_build_artifacts_created: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-download-gc-batch-independent-review-20261021.mjs')), checks_passed: checks.length, checks};
const output = 'docs/evidence/a-download-gc-batch-independent-accepted-20261021.json';
if (process.argv[2] === '--check') {
  const saved = json(output); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);
} else {
  assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(path.join(workspace, output), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
}
console.log(JSON.stringify({status: 'accepted_frozen_local_scope', receipt: output, checks: checks.length, full: record.full, owner_baseline: record.owner_baseline, actual_sql_cases_run: 0}));
