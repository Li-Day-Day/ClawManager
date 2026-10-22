// Verify only the repaired tagged probe's local preparation, never actual SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const stem = 'docs/evidence/a-download-owners-fixture-repair-20261021-r2';
const source = JSON.parse(decode(raw(stem + '-source.json'))), native = decode(raw(stem + '-native.txt'));
const es = p => decode(raw(p)).trim().split('\n').filter(Boolean).map(JSON.parse);
const checks = [];
function check(name, ok) { assert.ok(ok, name); checks.push(name); }
function exact(name, a, b) { assert.equal(new Set(a).size, a.length, name); assert.deepEqual(a.slice().sort(), b.slice().sort(), name); checks.push(name); }
const expected = ['TestASQLTaskDownloadOwnersMySQLSeed', 'TestADownloadAdmissionMySQLSeed', ...['detached_embedded_config', 'historical_config_projection', 'independent_encrypted_object'].map(n => 'TestADownloadAdmissionMySQLSeed/' + n), 'TestASensitiveDownloadMFAMySQLSeed', ...['actual_config_required_cells', 'duplicate', 'unknown', 'trailing', 'catalog', 'ddl', 'budget'].map(n => 'TestASensitiveDownloadMFAMySQLSeed/' + n)];
check('stable offline unapproved source', source.stable_copy_verified === true && source.dependencies_installed === false && source.production_approved === false);
check('logical source digest', sha256(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === source.source_sha256);
function inventory(p) {
  const events = es(p);
  check(p + ': no failure or skipped seed', !events.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)));
  for (const action of ['run', 'pass']) exact(p + ': exact ' + action, events.filter(e => e.Test && e.Action === action).map(e => e.Test), expected);
  exact(p + ': package terminal pass', events.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package), ['clawreef/internal/systembackupevidence']);
}
inventory(stem + '.jsonl'); inventory(stem + '-tagged-seed.txt');
const detached = decode(raw(stem + '-detached-seed.txt'));
exact('detached exact RUN', [...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), expected);
exact('detached exact PASS', [...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), expected);
check('detached terminal PASS no failure/skip', /\nPASS\s*$/.test(detached) && !/--- (?:FAIL|SKIP):|panic:/.test(detached));
for (const marker of ['NATIVE_EXIT focused_packages=0', 'default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes', 'FROZEN_POSTCHECK pass=yes', 'CLEANED snapshot=True', 'd_admission_native_exit=0', 'PowerShell transcript end']) check('native ' + marker, native.includes(marker));
for (const stage of ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration']) check('probe ' + stage, native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`) && raw(stem + '-' + stage + '-stderr.txt').length === 0);
check('ordinary seed-stage stderr empty', raw(stem + '-stderr.txt').length === 0);
const owner = native.match(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/m);
check('native/source identity', !!owner && Number(owner[1]) === source.files.length && owner[2] === source.source_sha256);
check('source/binary directory independently absent', path.dirname(path.resolve(owner[3])).toLowerCase() === workspace.toLowerCase() && !fs.existsSync(owner[3]));
const cleanup = JSON.parse(decode(raw(stem + '-cleanup.json')));
check('caller external cache independently absent', cleanup.wrapper_exit === 0 && cleanup.exists === false && path.dirname(path.resolve(cleanup.path)).toLowerCase() === workspace.toLowerCase() && !fs.existsSync(cleanup.path));
const oldNative = decode(raw('docs/evidence/a-download-owners-fixture-repair-20261021-r1-native.txt'));
check('superseded r1 remains -1, not successful', oldNative.includes('d_admission_native_exit=-1') && oldNative.includes('CLEANED snapshot=True'));
check('superseded r1 directory absent', !fs.existsSync(path.join(workspace, '.tmp-d-index-cache-2c2c55a859334368a394cc783114fd75')));
const probePath = 'backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go';
const probe = source.files.find(f => f.path === probePath);
check('current repaired tagged probe matches frozen input', probe && raw(probePath).length === probe.size && sha256(raw(probePath)) === probe.sha256 && decode(raw(probePath)).startsWith('//go:build systembackup_mysql\n'));
const failedSource = JSON.parse(decode(raw('docs/evidence/a-download-owners-mysql-remote-source-20261021-083734-aca6615d.json')));
const oldPins = new Map(failedSource.files.map(f => [f.path, f]));
const changed = source.files.filter(f => oldPins.get(f.path)?.sha256 !== f.sha256 || oldPins.get(f.path)?.size !== f.size).map(f => f.path);
const drift = source.files.filter(f => {try {const b = raw(f.path); return b.length !== f.size || sha256(b) !== f.sha256;} catch {return true;}}).map(f => f.path);
const record = {kind: 'a_owner_tagged_fixture_repair_local_preparation', recorded_at: new Date().toISOString(), status: 'accepted_seed_and_compile_scope_only', source_files: source.files.length, source_sha256: source.source_sha256,
  source_manifest_sha256: sha256(raw(stem + '-source.json')), native_sha256: sha256(raw(stem + '-native.txt')), first_seed_checks: 13, packaged_seed_checks: 13, detached_seed_checks: 13, default_vet: true, final_postcheck: true, exit: 0,
  probe_path: probePath, probe_sha256: probe.sha256, changed_from_failed_attempt: changed, excluded_ordinary_changes: changed.filter(p => !p.endsWith('_mysql_test.go')), current_pinned_drift: drift,
  cleanup_paths_independently_absent: [owner[3], cleanup.path], superseded_r1_exit: -1,
  full_ordinary_packages_repeated: false, current_whole_worktree_verified: false, actual_sql_cases_executed: 0, actual_owner_cases_accepted: 0, dependencies_installed: false, production_approved: false, test_build_artifacts_remaining: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-download-owners-fixture-review-20261021.mjs')), checks_passed: checks.length, checks};
const output = path.join(workspace, 'docs/evidence/a-download-owners-fixture-repair-accepted-20261021.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);}
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, source_files: source.files.length, seed_checks: [13, 13, 13], checks: checks.length, actual_sql_cases_executed: 0, test_build_artifacts_remaining: false}));
