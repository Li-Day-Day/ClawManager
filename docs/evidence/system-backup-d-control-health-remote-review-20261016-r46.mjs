import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildControlHealthProbeInputs } from '../../scripts/system-backup-d-control-health-inputs.mjs';

// Evidence review only: no SQL, SSH, container, dependency install or test run.
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const logPath = 'docs/evidence/d-control-health-remote-20261016-133106.txt';
const manifestPath = 'docs/evidence/d-control-health-remote-20261016-133106-source.json';
const logBytes = read(logPath), log = logBytes.toString('utf8');
const manifest = JSON.parse(read(manifestPath));
assert.equal(manifest.stable_copy_verified, true);
assert.equal(manifest.dependencies_installed, false);
const paths = manifest.files.map(p => p.path);
assert.equal(new Set(paths).size, paths.length);
const digest = sha(manifest.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
assert.equal(digest, manifest.source_sha256);
assert.ok(log.includes(`LOCAL_SOURCE d-control-health-frozen=yes files=${paths.length} source_sha256=${digest}`));
assert.doesNotMatch(log, /^\s*--- FAIL:|^panic:|^fatal error:|CLEANUP_PENDING/m);
assert.match(log, /^d_control_health_remote_exit=0\s*$/m);
assert.match(log, /^LOCAL_PASS d-control-health-frozen-postcheck=yes remote-requested=True dependencies-installed=no\s*$/m);
assert.match(log, /^CLEANED control-health-remote-scratch=yes\s*$/m);
assert.match(log, /^CLEANED control-health-local-source-cache=True\s*$/m);
assert.match(log, /^PASS control-health dispatch bindings=13 dedicated-root=yes network=no products=none\s*$/m);

const focused = manifest.files.filter(p =>
  /^backend\/internal\/(systembackupcontroller|systembackupread)\/.*\.go$/.test(p.path) ||
  /^backend\/internal\/db\/migrations\/.*\.sql$/.test(p.path) ||
  /^scripts\/system-backup-d-control-health-/.test(p.path) ||
  ['backend/go.mod', 'backend/go.sum', 'scripts/system-backup-d-index-source-snapshot.ps1',
    'scripts/system-backup-a-evidence-go-step.ps1', 'scripts/system-backup-controller-enabled-fixture.mysql.sql',
    'scripts/system-backup-fresh-migration-smoke.sh', 'scripts/system-backup-smoke-contract.sh',
    'scripts/system-backup-d-invariants-phase.sh', 'scripts/system-backup-d-migration-phase.sh',
    'docs/system-backup-d-control-health-proposal-20261016.sql'].includes(p.path));
for (const pin of focused) {
  const bytes = read(pin.path);
  assert.equal(bytes.length, pin.size, pin.path);
  assert.equal(sha(bytes), pin.sha256, pin.path);
}
const currentDrift = manifest.files.flatMap(p => {
  if (!existsSync(new URL(p.path, root))) return [{ path: p.path, state: 'missing' }];
  const b = read(p.path);
  return sha(b) === p.sha256 && b.length === p.size ? [] : [{ path: p.path, state: 'changed' }];
});
const bundleLines = log.split(/\r?\n/).filter(l => l.startsWith('{"kind":"d_control_health_probe_bundle"'));
assert.equal(bundleLines.length, 1);
const bundle = JSON.parse(bundleLines[0]);
assert.equal(bundle.image_pull_policy, 'Never');
assert.equal(bundle.full_catalog_migrations, 95);
const pins = new Map(bundle.pins.map(p => [p.path, p.sha256]));
assert.equal(pins.get('d-control-health.test'), 'c9f376dcc1543203a56081bf14099fe0b96bfaefe78e8bb5db0b195c033db177');
assert.equal(pins.get('system-backup-migrate'), 'cff6270bf1537de361d938a533f155f7f1193de2c4f116327e53ec8b1ee97482');
const capsule = buildControlHealthProbeInputs();
assert.equal(sha(Buffer.from(JSON.stringify(capsule))), pins.get('d-control-health-inputs.json'));
assert.equal(capsule.migration_files.length, 95);
assert.equal(manifest.files.filter(p => /^backend\/internal\/db\/migrations\/.*\.sql$/.test(p.path)).length, 95);
assert.match(log, /PASS fresh-migration-replay=001\.\.080 applied=95 exact_filenames=yes/);
assert.ok(log.includes(`PASS pinned-migration-runner binary_sha256=${pins.get('system-backup-migrate')} catalog_sha256=${capsule.catalog_sha256}`));
assert.ok(log.includes(`PASS d-control-health-mysql binary_sha256=${pins.get('d-control-health.test')} inputs_sha256=${pins.get('d-control-health-inputs.json')} synthetic_read_scope=yes fixture_root_grants=yes production_approval=no`));

const active = new Map(), goGroups = [];
for (const line of log.split(/\r?\n/)) {
  if (!line.startsWith('{')) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  if (!e.Package) continue;
  assert.notEqual(e.Action, 'fail');
  if (e.Action === 'start') active.set(e.Package, []);
  assert.ok(active.has(e.Package));
  active.get(e.Package).push(e);
  if (e.Action === 'pass' && !e.Test) {
    const tests = active.get(e.Package).filter(x => x.Action === 'pass' && x.Test).map(x => x.Test);
    goGroups.push({ package: e.Package, top_level: tests.filter(t => !t.includes('/')).length, including_subtests: tests.length });
  }
}
assert.deepEqual(goGroups.map(g => [g.top_level, g.including_subtests]).sort((a,b) => a[0]-b[0]), [[1,8],[55,312],[143,191]]);
const run = log.match(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) .*mysql_version=([^\s]+)\s*$/m);
assert.ok(run);
const remote = log.slice(run.index);
const cases = ['initial_observe_takeover_read', 'concurrent_epoch_cas', 'concurrent_observation_cas',
  'expiry_timezone_and_current_config', 'actual_constraints_and_fk', 'committed_reply_loss_poisoned_observer',
  'completed_control_loop_and_fenced_stop'];
const source = read('backend/internal/systembackupcontroller/control_health_mysql_test.go').toString('utf8');
assert.deepEqual([...source.slice(source.indexOf('func TestDControlHealthMySQL(')).matchAll(/t\.Run\("([^"]+)"/g)].map(m => m[1]), cases);
assert.deepEqual([...remote.matchAll(/^    --- PASS: TestDControlHealthMySQL\/([^\s]+) /gm)].map(m => m[1]), cases);
assert.equal([...remote.matchAll(/^=== RUN   TestDControlHealthMySQL\s*$/gm)].length, 1);
assert.equal([...remote.matchAll(/^--- PASS: TestDControlHealthMySQL \(/gm)].length, 1);
assert.ok(remote.includes(`cases=7 catalog=${capsule.catalog_sha256} migrations=95 synthetic_read_scope=yes fixture_root_grants=yes production_approval=no`));
const installations = [...remote.matchAll(/CLEANED control health owned installation\/config\/observation (installation_dhealth_[a-f0-9]{20})/g)].map(m => m[1]);
assert.equal(installations.length, 7);
assert.equal(new Set(installations).size, 7);
assert.match(remote, /CLEANED candidate control health table/);
assert.ok(remote.includes(`CLEANED namespace=${run[1]} uid=${run[2]}`));
const ownerMatch = log.match(/^LOCAL_OWNER control-health-source=(.+[\\/](\.tmp-d-index-cache-([a-f0-9]{32}))) container=(codex-d-control-health-[a-f0-9]{32})\s*$/m);
assert.ok(ownerMatch);
assert.equal(ownerMatch[4], `codex-d-control-health-${ownerMatch[3]}`);
assert.equal(existsSync(new URL(ownerMatch[2], root)), false);
const result = {
  kind: 'd_control_health_remote_acceptance.v1', recorded_at: new Date().toISOString(),
  status: 'actual_mysql_seven_cases_accepted_candidate_scope_only',
  raw_log: logPath, raw_log_sha256: sha(logBytes), source_manifest: manifestPath,
  source_manifest_sha256: sha(read(manifestPath)), source_files: paths.length, source_sha256: digest,
  focused_current_source_matches: focused.length, other_current_source_drift: currentDrift,
  payloads: bundle.pins, migration_catalog_sha256: capsule.catalog_sha256, migration_count: 95,
  go_groups: goGroups, remote_cases: cases, actual_sql_root_pass: true, mysql_version: run[3],
  run_namespace: run[1], namespace_uid: run[2], cleaned_installations: installations,
  candidate_table_cleaned: true, namespace_uid_cleanup_recorded: true,
  remote_scratch_cleanup_recorded: true, local_owner_checked_absent: ownerMatch[2],
  container_name: ownerMatch[4], socket_close_diagnostics_retained: (log.match(/close - IO is still pending on closed socket/g) ?? []).length,
  exit_code: 0, synthetic_read_scope: true, fixture_root_grants: true,
  dependencies_installed: false, tests_or_remote_commands_repeated_by_reviewer: false,
  main_controller_enabled: false, formal_schema_or_grants_approved: false,
  production_approval: false, full_six_scope_goal_complete: false
};
writeFileSync(new URL('./system-backup-d-control-health-remote-review-20261016-r46.json', import.meta.url), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, focused: focused.length, drift: currentDrift.length, cases: 7, exit: 0, cleanup: true, namespace: run[1] }));
