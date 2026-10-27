import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const run = process.argv[2];
assert.match(run ?? '', /^[A-Za-z0-9-]+$/);
const prefix = 'docs/evidence/a-gc-nil-adapters-' + run;
const raw = p => fs.readFileSync(path.join(root, p));
const read = p => raw(p).toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const json = p => JSON.parse(read(p));
const events = p => read(p).trim().split('\n').filter(Boolean).map(JSON.parse);
const source = json(prefix + '-source.json'), log = read(prefix + '-native.txt'), stages = json(prefix + '-stages.json');
assert.equal(source.stable_copy_verified, true); assert.equal(source.dependencies_installed, false); assert.equal(source.production_approved, false);
assert.equal(new Set(source.files.map(f => f.path)).size, source.files.length);
assert.equal(hash(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), source.source_sha256);
assert.deepEqual(stages.map(s => s.name), ['old-guards', 'fixed-full']);
const expected = [
  ...['', '/interface_nil', '/pointer_nil'].map(n => 'TestAGCAuthorityRejectsNilPolicy' + n),
  ...['', '/interface_nil', '/pointer_nil', '/function_nil'].map(n => 'TestAGCRuntimeRejectsNilAbsence' + n),
  ...['', '/interface_nil', '/pointer_nil', '/function_nil'].map(n => 'TestAGCAbsenceRejectsNilVerifierBeforeSQL' + n)
].sort();
const old = events('docs/evidence/' + stages[0].jsonl), fixed = events('docs/evidence/' + stages[1].jsonl);
const names = (es, action) => es.filter(e => e.Test && e.Action === action).map(e => e.Package + '/' + e.Test).sort();
for (const [index, es] of [old, fixed].entries()) {
  assert.ok(!es.some(e => ['skip', 'build-fail'].includes(e.Action) || e.FailedBuild));
  assert.equal(new Set(names(es, 'run')).size, names(es, 'run').length);
  assert.deepEqual(names(es, 'run'), [...names(es, 'pass'), ...names(es, 'fail')].sort());
  assert.equal(read('docs/evidence/' + stages[index].stderr), '');
  assert.equal(stages[index].default_vet, true); assert.equal(stages[index].count, 1);
}
assert.deepEqual(old.filter(e => e.Test && e.Action === 'run').map(e => e.Test).sort(), expected);
assert.deepEqual(old.filter(e => e.Test && e.Action === 'fail').map(e => e.Test).sort(), expected.filter(n => !n.endsWith('/interface_nil')));
assert.equal(stages[0].exit, 1); assert.equal(stages[0].counterfactual, true);
assert.ok(!fixed.some(e => e.Action === 'fail'));
assert.equal(stages[1].exit, 0); assert.equal(stages[1].counterfactual, false);
const passed = fixed.filter(e => e.Test && e.Action === 'pass');
for (const name of expected) assert.equal(passed.filter(e => e.Test === name).length, 1);
const boundaryChecks = [
  ...['certificate_expired', 'worker', 'lease', 'deadline', 'expire_after_policy'].map(n => 'TestGCAuthorityOperationAndConfigurationFailures/' + n),
  ...['before', 'during', 'changed_claim'].map(n => 'TestGCAbsenceAuthorizationBeforeAndAfterProvider/' + n),
  ...['revoke_in_proof', 'revoke_before_result', 'claim_expiry', 'result_expiry'].map(n => 'TestGCRuntimeExactDeleteAndTransactionalResults/' + n)
];
for (const name of boundaryChecks) assert.equal(passed.filter(e => e.Test === name).length, 1, name);
assert.deepEqual(fixed.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package).sort(), ['clawreef/internal/systembackupevidence', 'clawreef/internal/systembackupsecurity']);
const oldFull = events('docs/evidence/d-download-gc-dependencies-20261020-r4.jsonl');
const priorNames = names(oldFull.filter(e => ['clawreef/internal/systembackupevidence', 'clawreef/internal/systembackupsecurity'].includes(e.Package)), 'pass');
assert.deepEqual(names(fixed, 'pass'), [...priorNames, ...expected.map(n => 'clawreef/internal/systembackupevidence/' + n)].sort());
const owner = log.match(/^LOCAL_OWNER nil-adapters=(.+) process_id=\d+$/m)[1];
assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase()); assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(fs.existsSync(owner), false);
for (const marker of ['FROZEN_POSTCHECK pass=yes dependencies-installed=no actual-mysql=no', `CLEANED owner=${owner} removed=True`, 'a_gc_nil_adapters_exit=0', `FROZEN files=${source.files.length} sha256=${source.source_sha256}`]) assert.ok(log.includes(marker), marker);
const pins = new Map(source.files.map(f => [f.path, f]));
const core = ['gc_authority.go', 'gc_runtime.go', 'gc_nil_adapters_a_test.go'].map(n => 'backend/internal/systembackupevidence/' + n);
for (const p of core) assert.equal(hash(raw(p)), pins.get(p)?.sha256, p);
const currentDrift = source.files.filter(f => { try { const b = raw(f.path); return b.length !== f.size || hash(b) !== f.sha256; } catch { return true; } }).map(f => f.path);
const record = {
  kind: 'a_gc_nil_dependency_fix_local_acceptance', recorded_at: new Date().toISOString(),
  source_manifest: prefix + '-source.json', source_sha256: source.source_sha256, source_files: source.files.length,
  source_manifest_sha256: hash(raw(prefix + '-source.json')), native: prefix + '-native.txt', native_sha256: hash(raw(prefix + '-native.txt')),
  fixed_events: 'docs/evidence/' + stages[1].jsonl, fixed_events_sha256: hash(raw('docs/evidence/' + stages[1].jsonl)),
  counterfactual_events: 'docs/evidence/' + stages[0].jsonl, counterfactual_events_sha256: hash(raw('docs/evidence/' + stages[0].jsonl)),
  old_guards: {exit: 1, main: 3, all: 11, expected_failed_checks: 8},
  fixed: {exit: 0, main: passed.filter(e => !e.Test.includes('/')).length, all: passed.length, new_main: 3, new_checks: 11, no_skip: true, default_vet: true, count: 1},
  existing_test_inventory_preserved: true, core_current_matches_frozen: true, current_pinned_drift: currentDrift,
  existing_certificate_claim_revocation_checks: boundaryChecks,
  current_whole_worktree_verified: false, source_postcheck: true, owned_directory: owner, owned_directory_absent: true,
  dependencies_installed: false, remote_executed: false, actual_mysql: false, production_approved: false,
  scope: 'Three evidence GC typed-nil dependency boundaries, existing peer/claim/revocation regressions and full local security/evidence packages. Not an actual SQL, role, material, lock or full metadata-GC approval.'
};
const output = prefix + '-accepted.json';
if (process.argv.includes('--check')) { const saved = json(output); record.recorded_at = saved.recorded_at; record.current_pinned_drift = saved.current_pinned_drift; assert.deepEqual(record, saved); }
else fs.writeFileSync(path.join(root, output), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, fixed: record.fixed, old_guards: record.old_guards, cleanup_absent: true, current_drift: currentDrift}));
