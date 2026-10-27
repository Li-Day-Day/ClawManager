// A independently checks original events/bytes. No Go, SQL, remote or installs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const raw = p => fs.readFileSync(path.join(root, p));
const read = p => {
  const b = raw(p);
  return b.toString(b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
};
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const checks = [];
function check(name, yes) { assert.ok(yes, name); checks.push(name); }
function manifest(p) {
  const m = JSON.parse(read(p));
  check(p + ': stable, offline, unapproved', m.stable_copy_verified === true && m.dependencies_installed === false && m.production_approved === false);
  check(p + ': unique relative paths', new Set(m.files.map(f => f.path)).size === m.files.length && m.files.every(f => !f.path.includes('..') && !path.isAbsolute(f.path) && !f.path.includes('\\')));
  check(p + ': logical SHA', hash(m.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === m.source_sha256);
  return m;
}
const evidence = 'docs/evidence/';
const stem = evidence + 'd-download-gc-dependencies-20261020-r4';
const m = manifest(stem + '-source.json');
const a = manifest(evidence + 'a-gc-audit-resource-20261020-r4-source.json');
check('D final source is the published 1446-input source', m.files.length === 1446 && m.source_sha256 === '04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df');
assert.deepEqual(a.files, m.files); check('A independent INT run has identical paths, order, sizes and bytes', a.source_sha256 === m.source_sha256);
const inputFlags = p => (!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || [
  'docs/system-backup-restore-schema-inventory.json',
  'docs/evidence/a-config-canonical-request-vectors-20261014.json',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
  'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
  'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json'
].includes(p)) && !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p) && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p);
// Parent PowerShell supplies Get-DIndexSourceFiles output: this sandbox denies
// Node child processes. Membership is a sampled observation, not a new freeze.
const inventoryPath = evidence + 'a-download-gc-dependencies-current-files-20261020.txt';
function currentInputs() {
  const names = read(inventoryPath).trim().split('\n').sort();
  assert.ok(new Set(names).size === names.length && names.every(inputFlags));
  return names.map(p => { const b = raw(p); return {path: p, size: b.length, sha256: hash(b)}; });
}
const before = currentInputs();
const pins = new Map(m.files.map(f => [f.path, f]));
const task = 'backend/internal/systembackupevidence/download_retention_gc_task.go';
const dependencies = 'backend/internal/systembackupevidence/download_retention_gc_dependencies_test.go';
const critical = [task, dependencies,
  'backend/internal/systembackupevidence/download_retention_gc_task_test.go',
  'backend/internal/systembackupevidence/download_retention_gc.go',
  'backend/internal/systembackupevidence/download_retention_gc_test.go',
  ...m.files.filter(f => f.path.startsWith('backend/internal/db/migrations/')).map(f => f.path)];
for (const p of critical) check('reviewed source matches frozen bytes: ' + p, pins.has(p) && hash(raw(p)) === pins.get(p).sha256);
function events(p) { return read(p).trim().split('\n').filter(Boolean).map(JSON.parse); }
function eventSet(es, packages) {
  check('no fail, build-fail or skip', !es.some(e => ['fail', 'build-fail', 'skip'].includes(e.Action)));
  const ids = action => es.filter(e => e.Test && e.Action === action).map(e => `${e.Package}\0${e.Test}`).sort();
  const ran = ids('run'), passed = ids('pass');
  check('every unique RUN has exactly one PASS', new Set(ran).size === ran.length && JSON.stringify(ran) === JSON.stringify(passed));
  assert.deepEqual(es.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package).sort(), packages.slice().sort());
  check('exact package terminal PASS set', true);
  return es.filter(e => e.Test && e.Action === 'pass');
}
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer'].map(p => 'clawreef/internal/' + p);
const es = events(stem + '.jsonl'), passed = eventSet(es, packages);
check('four complete packages: 737 main / 6114 checks', passed.length === 6114 && passed.filter(e => !e.Test.includes('/')).length === 737);
const taskPass = passed.filter(e => e.Test.startsWith('TestDownloadRetentionGCTask'));
check('task component: 14 main / 303 checks', taskPass.length === 303 && taskPass.filter(e => !e.Test.includes('/')).length === 14);
const newRoots = [
  'OtherArtifactDependents', 'DependencyKeysAndOwnExclusion', 'DependentDrillInventory', 'DependentBounds',
  'DependentRetryPromotionAndLeases', 'PruneDependencyAndRequiredTable', 'LateArtifactDependenciesPoisonCopies', 'CollectorLateArtifactDependenciesRollback'
].map(n => 'TestDownloadRetentionGCTask' + n);
const added = taskPass.filter(e => newRoots.includes(e.Test.split('/')[0]));
check('eight new roots / 182 checks', added.length === 182 && added.filter(e => !e.Test.includes('/')).length === 8);
check('existing six roots grew from 117 to 121; total net gain 186', taskPass.length - added.length === 121 && taskPass.filter(e => e.Test.startsWith('TestDownloadRetentionGCTaskSQLFailuresAndConfiguration')).length === 19 && taskPass.length - 117 === 186);
const names = new Set(taskPass.map(e => e.Test));
for (const owner of ['backup', 'drill', 'preflight', 'artifact_verify']) for (const dependent of ['drill', 'preflight', 'artifact_verify']) for (const state of [
  'retained_failed', 'retained_succeeded', 'foreign_installation', 'contradictory_source_type', 'active', 'future_deadline', 'future_finish', 'pending_reconcile', 'active_claim', 'later_expired_task'
]) check(`independent terminal/deadline matrix ${owner}/${dependent}/${state}`, names.has(`TestDownloadRetentionGCTaskOtherArtifactDependents/${owner}/${dependent}/${state}`));
for (const kind of ['drill', 'preflight', 'artifact_verify', 'prune']) for (const stage of ['tombstone', 'result_deleted', 'operation_deleted']) check('rollback after actual recorded write ' + kind + '/' + stage, names.has('TestDownloadRetentionGCTaskCollectorLateArtifactDependenciesRollback/' + kind + '/' + stage));
for (const suffix of ['DependencyKeysAndOwnExclusion/same_pk_other_table', 'DependentBounds/single_range', 'DependentBounds/combined_ranges', 'DependentBounds/duplicate_public_id', 'DependentDrillInventory/late_settled_resource', 'DependentDrillInventory/late_eligible_version', 'DependentRetryPromotionAndLeases/drill/holder_missing_from_source']) check('required edge ' + suffix, names.has('TestDownloadRetentionGCTask' + suffix));
const failed = events(evidence + 'd-download-gc-dependencies-20261020-r1.jsonl').filter(e => e.Test && e.Action === 'fail');
check('original 13 failures retained and now passing', failed.length === 13 && failed.every(e => names.has(e.Test)));
const ap = eventSet(events(evidence + 'a-gc-audit-resource-20261020-r4-evidence-full-attempt1.jsonl'), ['clawreef/internal/systembackupevidence']);
check('independent A evidence set: 332 main / 2800 checks', ap.length === 2800 && ap.filter(e => !e.Test.includes('/')).length === 332);
assert.deepEqual(ap.map(e => e.Test).sort(), passed.filter(e => e.Package === 'clawreef/internal/systembackupevidence').map(e => e.Test).sort());
check('D evidence names exactly equal A independently run evidence names', true);
const log = read(stem + '-native.txt');
for (const marker of ['NATIVE_PARALLELISM build=1 gomaxprocs=1', 'NATIVE_EXIT full_packages=0', 'default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes', 'FROZEN_POSTCHECK pass=yes', 'CLEANED snapshot=True', 'd_admission_native_exit=0']) check('native ' + marker, log.includes(marker));
check('raw stderr empty', raw(stem + '-stderr.txt').length === 0);
check('native source matches manifest', log.includes(`FROZEN files=${m.files.length} sha256=${m.source_sha256} owner=`));
for (const stage of ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration']) {
  check('offline probe success: ' + stage, log.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`) && raw(stem + '-' + stage + '-stderr.txt').length === 0);
}
const seeds = eventSet(events(stem + '-tagged-seed.txt'), ['clawreef/internal/systembackupevidence']);
check('three tagged seeds / 22 checks', seeds.length === 22 && seeds.filter(e => !e.Test.includes('/')).length === 3);
const detached = read(stem + '-detached-seed.txt');
const seedNames = seeds.map(e => e.Test).sort();
const detachedNames = [...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]).sort();
assert.deepEqual(detachedNames, seedNames); check('same 22 detached seed names and terminal PASS', !detached.includes('--- FAIL:') && /\nPASS\s*$/.test(detached));
const cleanupPath = evidence + 'd-download-gc-dependencies-cleanup-20261020.json', cleanup = JSON.parse(read(cleanupPath));
check('six owned D directories absent, not modified by A', cleanup.paths.length === 6 && cleanup.paths.every(e => e.absent && path.dirname(e.path).toLowerCase() === root.toLowerCase() && !fs.existsSync(e.path)));
const receiptPath = evidence + 'd-download-gc-dependencies-accepted-20261020.json', receipt = JSON.parse(read(receiptPath));
check('D receipt agrees with raw hashes and scope', receipt.final_serial.events_sha256 === hash(raw(stem + '.jsonl')) && receipt.final_serial.native_sha256 === hash(raw(stem + '-native.txt')) && receipt.final_serial.manifest_sha256 === hash(raw(stem + '-source.json')) && receipt.final_serial.main === 737 && receipt.final_serial.all === 6114 && receipt.remote_run === false && receipt.production_approved === false);
const binaries = [...log.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m => ({name: m[1], sha256: m[2]}));
assert.deepEqual(binaries, receipt.probes.find(p => p.prefix === stem).binaries);
check('three offline binary SHA markers match original receipt', binaries.length === 3);

// Exact predicates remain broad to detect contradictory installation/source rows.
const source = read(task), testSource = read(dependencies);
check('dependent membership checked before choosing new resource ranges', source.indexOf('!reflect.DeepEqual(out.dependents, original.dependents)') < source.indexOf('resourceCount := 0'));
check('own exclusion uses task kind and accurate primary key', source.includes('f.kind == out.owner.kind && f.id == out.owner.id'));
for (const assertion of ['!reflect.DeepEqual(currentRows, originalRows)', '!reflect.DeepEqual([][]byte{f.d.body, f.d.resultBody}, originalAudits)', 'for _, write := range f.d.writes', 'f.d.reserved != before', 'len(f.d.stone) != 0', 'f.policy.taskGuard == nil']) check('reviewed rollback assertion ' + assertion, testSource.includes(assertion));
function sqlConst(name) {
  const match = source.match(new RegExp('const ' + name + ' = `([^`]+)`'));
  assert.ok(match, name); return match[1];
}
const common = 'id,origin_installation_id,public_id,task_type,schema_version,status,row_version,deadline_at,created_at,finished_at,controller_owner,controller_lease_expires_at,next_reconcile_at,source_artifact_type,source_public_id,\'\',NULL,FALSE,\'\',FALSE,FALSE,NULL,0,';
check('projection prefix read against concrete code', source.includes('q := "id,origin_installation_id,public_id,task_type,schema_version,status,row_version,deadline_at,created_at,finished_at,controller_owner,controller_lease_expires_at,next_reconcile_at,"') && source.includes('q += "source_artifact_type,source_public_id,\'\',NULL,FALSE,\'\',FALSE,FALSE,NULL,0,"'));
check('exact broad sibling predicate', source.includes('" WHERE source_public_id=? ORDER BY id LIMIT 10001 FOR UPDATE"'));
const queries = [
  ...[['drill', 'system_restore_drills'], ['preflight', 'system_backup_preflights'], ['artifact_verify', 'system_backup_artifact_verifications']].map(([kind, table]) => ({id: kind + '_source', table, sql: 'SELECT ' + common + (kind === 'drill' ? 'cleanup_status,cleanup_failure_code' : "'',''") + ' FROM ' + table + ' WHERE source_public_id=? ORDER BY id LIMIT 10001 FOR UPDATE', parameters: ['backup_public_id'], static_index_concern: 'declared source index leads with source_artifact_type; predicate uses source_public_id alone'})),
  ...[
    ['lease_state', 'system_artifact_lease_states', 'downloadGCTaskLeaseStateSQL', ['backup_public_id'], 'declared unique keys lead with origin_installation_id'],
    ['holder_lease', 'system_artifact_leases', 'downloadGCTaskHolderLeaseSQL', ['holder_type', 'holder_public_id'], 'declared holder key leads with installation and source'],
    ['staging', 'system_backup_staging_resources', 'downloadGCTaskStagingSQL', ['backup_public_id'], 'declared backup key leads with origin_installation_id'],
    ['restore_inventory', 'system_restore_drill_resources', 'downloadGCTaskRestoreSQL', ['drill_public_id'], 'declared drill key leads with origin_installation_id'],
    ['prune', 'system_backup_prune_items', 'downloadGCTaskPruneDependencySQL', ['backup_public_id'], 'declared artifact key leads with origin_installation_id']
  ].map(([id, table, name, parameters, static_index_concern]) => ({id, table, sql: sqlConst(name), parameters, static_index_concern}))
];
const after = currentInputs();
assert.deepEqual(after, before); check('enumerated path bytes stable during this read-only review; membership sampled by parent', true);
const currentMap = new Map(after.map(f => [f.path, f]));
const drift = {
  changed: m.files.filter(f => currentMap.has(f.path) && currentMap.get(f.path).sha256 !== f.sha256).map(f => f.path),
  removed: m.files.filter(f => !currentMap.has(f.path)).map(f => f.path),
  added: after.filter(f => !pins.has(f.path)).map(f => f.path)
};
const plan = {kind: 'a_gc_query_plan_capture_spec', source_sha256: m.source_sha256, sql_executed: false,
  instructions: 'Bind parameters from the same guarded disposable fixture. Capture EXPLAIN FORMAT=JSON of each exact SELECT, SHOW CREATE TABLE/SHOW INDEX, RR transaction identity, data_locks/data_lock_waits with real competing sessions, and post-release outcomes. No FORCE INDEX, narrowed predicates, EXPLAIN ANALYZE, production writes or DDL are authorized by this file.',
  actual_plan_verified: false, actual_lock_verified: false, queries};
const output = evidence + 'a-download-gc-dependencies-independent-accepted-20261020.json';
const planPath = evidence + 'a-download-gc-query-plan-20261020.json';
const record = {kind: 'a_independent_d_gc_dependencies_review', recorded_at: new Date().toISOString(),
  source_sha256: m.source_sha256, source_files: m.files.length, accepted_scope: 'Historical frozen concrete task eligibility, dependency models and collector composition only',
  packages: {main: 737, all: 6114}, task_component: {main: 14, all: 303}, new_dependencies: {main: 8, checks_under_new_roots: 182, additional_checks_under_existing_roots: 4, net_added_checks: 186},
  independently_run_a_evidence: {main: 332, all: 2800, same_source_and_test_set: true},
  raw_inputs: [stem + '-source.json', stem + '.jsonl', stem + '-native.txt', receiptPath, cleanupPath,
    evidence + 'a-gc-audit-resource-20261020-r4-source.json', evidence + 'a-gc-audit-resource-20261020-r4-evidence-full-attempt1.jsonl'].map(p => ({path: p, sha256: hash(raw(p))})),
  current_drift: drift, current_inventory: {path: inventoryPath, sha256: hash(raw(inventoryPath)), live_membership_atomicity_verified: false}, reviewed_task_collector_and_migrations_match: true,
  current_whole_worktree_verified: false, query_plan: planPath, index_risk_queries: queries.length,
  actual_plan_verified: false, actual_lock_verified: false, actual_sql_cases_run_by_a: 0,
  full_gc_policy_approved: false, production_approved: false, dependencies_installed: false,
  tests_or_builds_repeated: false, test_build_artifacts_created: false, cleanup_paths_independently_absent: cleanup.paths.map(e => e.path), checks};
if (process.argv.includes('--check')) {
  const saved = JSON.parse(read(output));
  record.recorded_at = saved.recorded_at;
  // The saved observation of a changing shared worktree is historical.
  const observedDrift = record.current_drift;
  record.current_drift = saved.current_drift;
  assert.deepEqual(record, saved); assert.deepEqual(plan, JSON.parse(read(planPath)));
  console.log(JSON.stringify({verified_saved_evidence: true, current_drift: observedDrift, checks: checks.length}));
} else {
  assert.ok(!fs.existsSync(path.join(root, output)) && !fs.existsSync(path.join(root, planPath)), 'outputs must be absent; no receipt overwritten');
  fs.writeFileSync(path.join(root, planPath), JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  fs.writeFileSync(path.join(root, output), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({receipt: output, query_plan: planPath, checks: checks.length, current_drift: drift}));
}
