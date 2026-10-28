import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [mode, ...extra] = process.argv.slice(2);
assert.ok(['--write', '--check'].includes(mode) && !extra.length);
const output = 'docs/evidence/a2-bootstrap-linux-space-failures-reviewed-20261026.json';
const pins = new Map();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => {
  const b = fs.readFileSync(p);
  pins.set(p, {path: p, size: b.length, sha256: sha(b)});
  return b.toString('utf8').replace(/^\uFEFF/, '');
};
const json = p => JSON.parse(read(p));
const events = p => read(p).trim().split(/\r?\n/).map(JSON.parse);
function passed(p, packages) {
  const rows = events(p), key = e => `${e.Package}\0${e.Test}`;
  assert.ok(rows.length);
  assert.equal(rows.filter(e => ['fail', 'build-fail', 'skip'].includes(e.Action)).length, 0);
  const runs = rows.filter(e => e.Test && e.Action === 'run').map(key).sort();
  const passes = rows.filter(e => e.Test && e.Action === 'pass');
  assert.equal(new Set(runs).size, runs.length);
  assert.deepEqual(passes.map(key).sort(), runs);
  const actual = rows.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package).sort();
  assert.deepEqual(actual, [...packages].sort());
  return {packages: actual, roots: passes.filter(e => !e.Test.includes('/')).length,
    pass_events: passes.length, fail_events: 0, skip_events: 0,
    root_names: passes.filter(e => !e.Test.includes('/')).map(key).sort()};
}
const E = 'clawreef/internal/systembackupevidence';
const S = 'clawreef/internal/systembackupsecurity';
const B = 'clawreef/internal/systembackupbootstrapsecurity';
const P = 'clawreef/internal/systembackupproducer';
const N = 'clawreef/internal/systembackupnoncebootstrap';
const C = 'clawreef/internal/systembackupcatrust';
const M = 'clawreef/internal/systembackupbootstrapmaterials';
const CLI = 'clawreef/cmd/system-backup-bootstrap';
const prefix = 'docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8';
const r = json(prefix + '.json');
assert.equal(r.kind, 'd_bootstrap_entry_native.v1');
assert.equal(r.status, 'failed');
assert.equal(r.error, 'Entry Linux build/compile failed: server');
for (const k of ['tests_started', 'snapshot_verified', 'cleaned']) assert.equal(r[k], true, k);
for (const k of ['targeted_exit', 'full_exit', 'seeds_exit', 'actual_sql_cases_executed']) assert.equal(r[k], 0, k);
for (const k of ['dependencies_installed', 'actual_mysql_executed', 'production_approved']) assert.equal(r[k], false, k);
assert.notEqual(r.snapshot_unchanged, true);
assert.deepEqual(r.linux_steps, []);
const owner = '.tmp-d-bootstrap-entry-ae7af3833e1f424f946638b88c7f68d8';
assert.equal(fs.existsSync(owner), false);
const target = passed(prefix + '.targeted.jsonl', [P, S, CLI]);
const full = passed(prefix + '.full.jsonl', [P, S, B, E, 'clawreef/internal/systembackupresources', 'clawreef/internal/systembackupread', 'clawreef/cmd/server', N, C, CLI]);
const seeds = passed(prefix + '.seeds.jsonl', [E]);
assert.equal(target.pass_events, r.targeted_pass_events);
assert.equal(full.pass_events, r.full_pass_events);
for (const name of r.required_roots) assert.ok(target.root_names.some(key => key.endsWith('\0' + name)), name);
assert.deepEqual(seeds.root_names.map(key => key.split('\0')[1]), [...r.local_seed_roots].sort());
assert.match(read(prefix + '.linux-server.txt'), /There is not enough space on the disk/);
assert.match(read('docs/evidence/a2-bootstrap-entry-ae7-rejection-20261026.txt'), /passed_exact_entry_snapshot/);
assert.equal(fs.existsSync('docs/evidence/a2-bootstrap-entry-ae7-rejected-20261026.json'), false);
const apiPrefix = 'docs/evidence/a-api-readiness-native-148b2d3547074f7ca4c4a046f19be373';
const api = json(apiPrefix + '.json');
assert.equal(api.kind, 'a_api_readiness_native.v1');
assert.equal(api.status, 'failed');
assert.equal(api.failure, 'Go phase failed: linux_systembackupsecurity');
assert.equal(api.targeted_exit, 0); assert.equal(api.full_exit, 0);
assert.equal(api.linux_systembackupsecurity_exit, 1); assert.equal(api.cleanup, true);
assert.equal(api.actual_sql, false); assert.equal(api.production_authorized, false);
assert.deepEqual(api.linux_binaries, []);
assert.notEqual(api.source_unchanged, true);
const apiOwner = '.tmp-a-api-readiness-148b2d3547074f7ca4c4a046f19be373';
assert.equal(fs.existsSync(apiOwner), false);
const apiTarget = passed(apiPrefix + '.targeted.jsonl', [M, C, N, S, CLI, P]);
const apiFull = passed(apiPrefix + '.full.jsonl', [B, M, C, N, S]);
assert.match(read(apiPrefix + '.linux_systembackupsecurity.jsonl'), /There is not enough space on the disk/);
const report = {
  kind: 'a2_bootstrap_native_linux_space_terminal_failure_review.v1',
  status: 'two_failed_runs_preserved_windows_observations_only_no_complete_acceptance',
  entry: {receipt: prefix + '.json', frozen_files: r.files.length, targeted: target, full, local_seeds: seeds,
    recorded_failed_step: 'linux server', completed_linux_steps: 0, frozen_source_postcheck_completed: false,
    owner, owner_independently_absent: true, strict_frozen_only_receiver_exit: 1, acceptance_output_absent: true},
  API: {receipt: apiPrefix + '.json', frozen_files: api.files.length, targeted: apiTarget, full: apiFull,
    recorded_failed_step: 'linux systembackupsecurity test compile', completed_linux_steps: 0,
    source_postcheck_completed: false, owner: apiOwner, owner_independently_absent: true},
  failure_cause: 'Both raw Linux logs explicitly report insufficient disk space. No assertion failure was observed in the completed Windows phases.',
  limitations: ['No whole native run, current whole tree, new baseline, Linux binary or source postcheck is accepted.',
    'The failed Linux phases must be repaired and accurately validated; old pass events cannot silently replace the missing postcheck.',
    'The two exact source sets differ; entry ae7 does not cover the new API/materials bytes.',
    'No peer cache or active owner was removed or mutated by this review. No Go, SQL, dependency installation or remote action was executed.'],
  Go_executed_by_reviewer: false, actual_SQL: false, production_approved: false, whole_goal_complete: false,
  artifacts: [...pins.values()]
};
if (mode === '--write') fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), report);
console.log(JSON.stringify({mode, output, entry_windows_pass_events: full.pass_events,
  API_windows_pass_events: apiFull.pass_events, complete_native_accepted: false, both_owners_absent: true}));
