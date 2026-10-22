// A independently verifies the new producer SQL log. No Go/SSH/SQL or cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {workspace, decode, sha256, localStages, canonicalLocalName, loadReviewedOwnerBaseline} from './a-download-owners-actual-review-20261020.mjs';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const stem = 'docs/evidence/d-download-producer-remote-20261021-091802';
const logBytes = raw(stem + '.txt'), sourceBytes = raw(stem + '-source.json');
const text = decode(logBytes), source = JSON.parse(decode(sourceBytes));
const checks = [];
function check(name, ok) { assert.ok(ok, name); checks.push(name); }
function exact(name, a, b) { assert.equal(new Set(a).size, a.length, name); assert.deepEqual(a.slice().sort(), b.slice().sort(), name); checks.push(name); }
function one(re, part = text) { const m = [...part.matchAll(re)]; assert.equal(m.length, 1, String(re)); checks.push(String(re)); return m[0]; }
check('stable offline unapproved source', source.stable_copy_verified === true && source.dependencies_installed === false && source.production_approved === false);
check('safe unique manifest paths', new Set(source.files.map(f => f.path)).size === source.files.length && source.files.every(f => /^(backend|contracts|scripts|docs)\//.test(f.path) && !f.path.includes('\\') && !f.path.split('/').some(p => ['..', '.', ''].includes(p)) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.size) && f.size >= 0));
check('source logical digest', sha256(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === source.source_sha256);
const baseline = loadReviewedOwnerBaseline(sourceBytes);
check('producer round is exactly the independently reviewed batch source', source.files.length === 1455 && source.source_sha256 === 'd9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542');
const pins = new Map(source.files.map(f => [f.path, f]));
const expectedPins = new Map(baseline.baselineSource.files.map(f => [f.path, f]));
exact('complete source membership equals reviewed baseline', source.files.map(f => f.path), baseline.baselineSource.files.map(f => f.path));
check('all frozen file hashes and sizes equal reviewed baseline', source.files.every(f => f.sha256 === expectedPins.get(f.path).sha256 && f.size === expectedPins.get(f.path).size));
check('no failed/skipped tests, panic or pending cleanup', !/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^.*CLEANUP_PENDING/m.test(text));
const frozen = one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm);
check('native source binding', frozen[1] === source.source_sha256 && Number(frozen[2]) === source.files.length);
const run = one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm);
check('same disposable run identity and pinned images', /^sbk-mig-\d{12}-[a-f0-9]{4}$/.test(run[1]) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(run[2]) && run[5] === '8.4.8' && [run[3], run[4]].every(v => /@sha256:[a-f0-9]{64}$/.test(v)));
const local = text.slice(0, run.index), remote = text.slice(run.index), stages = localStages(local);
for (const stage of stages.slice(0, 2)) {
  const es = baseline.baselineEvents.filter(e => e.Package === stage.package);
  check('complete baseline package PASS ' + stage.package, !es.some(e => ['fail', 'build-fail', 'skip'].includes(e.Action)) && es.filter(e => !e.Test && e.Action === 'pass').length === 1);
  exact('exact baseline RUN/PASS ' + stage.package, es.filter(e => e.Test && e.Action === 'run').map(e => e.Test), es.filter(e => e.Test && e.Action === 'pass').map(e => e.Test));
  exact('complete local test inventory ' + stage.package, stage.names.map(canonicalLocalName), es.filter(e => e.Test && e.Action === 'pass').map(e => e.Test));
}
const seedEvents = decode(raw('docs/evidence/d-download-gc-batch-20261020-r3-tagged-seed.txt')).trim().split('\n').map(JSON.parse);
check('seed baseline has no fail or skip', !seedEvents.some(e => ['fail', 'build-fail', 'skip'].includes(e.Action)));
const seeds = seedEvents.filter(e => e.Test && e.Action === 'pass').map(e => e.Test);
check('three complete packaged producer seeds / 22 checks', seeds.length === 22 && seeds.filter(n => !n.includes('/')).length === 3);
exact('baseline seed RUN/PASS', seedEvents.filter(e => e.Test && e.Action === 'run').map(e => e.Test), seeds);
exact('actual packaged seed names', stages[2].names, seeds);
const detachedEnd = local.indexOf('LOCAL_PASS config-standalone-seed=yes', stages[2].end);
check('detached boundary', detachedEnd > stages[2].end);
const detached = local.slice(stages[2].end, detachedEnd);
exact('detached seed RUN', [...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), seeds);
exact('detached seed PASS', [...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), seeds);
check('detached terminal PASS', /\nPASS\s*$/.test(detached));
for (const marker of ['LOCAL_PASS isolated-go-telemetry=off', 'LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent', 'bundle.tar: OK']) check('local marker ' + marker, local.includes(marker));
const probe = one(/^LOCAL_PASS d-download-producer-owner-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm);
const capsule = 'backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json';
check('producer capsule is the original v2 pin', probe[2] === 'a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0' && probe[2] === pins.get(capsule).sha256 && sha256(raw(capsule)) === probe[2]);
const runner = one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm);
const catalog = computeMigrationCatalog();
check('formal catalog still exact 95 files', catalog.file_count === 95 && catalog.hash === '2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
check('actual runner matches local binary and catalog', remote.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`));
check('actual 95 migration replay', remote.includes('PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes'));
const migration = JSON.parse(one(/^\{"config_activated":false,.*"result":"PASS"\}\s*$/gm, remote)[0]);
check('migration scope and pins', migration.migration_count === 95 && migration.migration_catalog_sha256 === catalog.hash && migration.human_mfa_verified === false && migration.historical_equivalence_verified === false);
const root = 'TestDProducerDownloadOwnersMySQL';
const cases = ['http_result', 'expired_owner_write_read', 'superseded_run', 'wrong_root', 'run_projection', 'history_manifest', 'receipt_manifest', 'receipt_version', 'foreign_reference', 'partial_schema', 'missing_history', 'original_run_lock', 'original_history_lock', 'empty_receipt_range', 'empty_hold_range', 'revoked_result', 'result_link_rollback', 'late_history_rollback'];
const expected = [root, ...cases.map(n => root + '/' + n)];
exact('exact eighteen SQL leaves and one root RUN', [...remote.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), expected);
exact('exact eighteen SQL leaves and one root PASS', [...remote.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), expected);
const databases = [], locks = [];
const lockTables = {original_run_lock: 'system_backup_producer_runs', original_history_lock: 'system_backup_producer_evidence_bindings', empty_receipt_range: 'system_backup_producer_result_receipts', empty_hold_range: 'system_backup_producer_evidence_refs'};
for (const name of cases) {
  const start = remote.indexOf(`=== RUN   ${root}/${name}\n`); check('canonical boundary ' + name, start >= 0);
  const next = remote.indexOf('=== RUN', start + 10), segment = remote.slice(start, next < 0 ? remote.length : next);
  const cleaned = [...segment.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)];
  check('one owned database cleaned in ' + name, cleaned.length === 1); databases.push(cleaned[0][1]);
  if (lockTables[name]) {
    const m = one(new RegExp(`OBSERVED exact task reference lock table=${lockTables[name]} holder=(\\d+) writer=(\\d+) writer_rolled_back=yes`, 'g'), segment);
    check('distinct exact holder/writer connections ' + name, Number(m[1]) > 0 && Number(m[2]) > 0 && m[1] !== m[2]);
    locks.push({case: name, table: lockTables[name], holder: Number(m[1]), writer: Number(m[2]), writer_rolled_back: true});
  }
}
check('eighteen distinct cleaned child databases and no extra claims', new Set(databases).size === 18 && [...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)].length === 18);
check('actual Go root scope marker', remote.includes('PASS actual producer download owner cases=18 owner_adapter=SQLDownloadOwners provider_transport=synthetic production_approval=no'));
check('actual probe/capsule scope pins', remote.includes(`PASS d-download-producer-owner-mysql binary_sha256=${probe[1]} inputs_sha256=${probe[2]} new_cases=18 owner_adapter=SQLDownloadOwners production_tasks=no human_mfa=no provider_transport=synthetic production_approval=no`));
const cleanup = one(/^CLEANED namespace=(\S+) uid=(\S+)$/gm, remote);
check('original namespace UID cleaned', cleanup[1] === run[1] && cleanup[2] === run[2]);
for (const marker of ['CLEANED remote-registration-scratch=yes', 'CLEANED local-registration-build-cache=True', 'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True']) check('final ' + marker, remote.includes(marker));
const owner = one(/^LOCAL_OWNER config-writer-source=(.+)$/gm)[1].trim();
check('exact local owner path', path.dirname(path.resolve(owner)).toLowerCase() === workspace.toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)));
check('snapshot cleanup independently absent', remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`) && !fs.existsSync(owner));
check('exact final outer exit zero', one(/^download_producer_exit=(-?\d+)$/gm, remote)[1] === '0' && /download_producer_exit=0\s*$/.test(remote));
for (const f of source.files.filter(f => f.path.startsWith('backend/internal/db/migrations/') || [capsule, 'backend/internal/systembackupevidence/download_producer_owner_mysql_test.go', 'backend/internal/systembackupevidence/download_producer_owner.go', 'backend/internal/systembackupevidence/download_producer_owner_schema.go'].includes(f.path))) check('current SQL-critical frozen bytes ' + f.path, sha256(raw(f.path)) === f.sha256);
const drift = source.files.filter(f => {try {const b = raw(f.path); return b.length !== f.size || sha256(b) !== f.sha256;} catch {return true;}}).map(f => f.path);
check('log unchanged during read-only review', sha256(raw(stem + '.txt')) === sha256(logBytes));
const record = {kind: 'a_independent_producer_owner_actual_mysql_review', recorded_at: new Date().toISOString(), status: 'accepted_exact_eighteen_producer_sql_cases_only',
  log: stem + '.txt', log_sha256: sha256(logBytes), source: stem + '-source.json', source_manifest_sha256: sha256(sourceBytes), source_sha256: source.source_sha256, source_files: source.files.length,
  local_packages: stages.slice(0, 2).map(s => ({package: s.package, main: s.names.filter(n => !n.includes('/')).length, all: s.names.length})), packaged_seed_checks: 22, detached_seed_checks: 22,
  exact_encoding_aliases: stages.slice(0, 2).flatMap(s => s.names.filter(n => canonicalLocalName(n) !== n).map(n => ({original: n, canonical: canonicalLocalName(n)}))),
  namespace: run[1], namespace_uid: run[2], mysql_version: run[5], probe_sha256: probe[1], inputs_sha256: probe[2], migration_runner_sha256: runner[1], catalog,
  actual_case_names: cases, actual_case_count: 18, exact_lock_observations: locks, cleaned_databases: databases,
  namespace_and_remote_cleanup: 'original_log_reported_not_independently_reconnected', local_snapshot_independently_absent: true,
  current_pinned_drift: drift, current_new_inputs_not_covered: true, current_whole_worktree_verified: false,
  production_tasks: false, human_mfa: false, provider_transport: 'synthetic', full_gc_verified: false, production_approved: false, dependencies_installed: false, tests_or_builds_repeated: false, test_build_artifacts_created: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-download-producer-actual-review-20261021.mjs')), checks_passed: checks.length, checks};
const output = path.join(workspace, 'docs/evidence/a-download-producer-mysql-accepted-20261021.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);}
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, checks: checks.length, actual_cases: 18, exact_lock_observations: 4, cleaned_databases: 18, production_approved: false}));
