import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const evidence = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidence, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = pins => sha(pins.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
const stages = {};
for (const stage of ['baseline', 'candidate']) {
  const prefix = `d-gc-batch-input-20261022-${stage}`;
  const native = read(`${prefix}-native.json`);
  const inputs = read(`${prefix}-inputs.json`);
  assert.equal(native.exit, stage === 'baseline' ? 1 : 0);
  assert.equal(native.input_unchanged, true);
  assert.equal(native.source_sha256, digest(inputs.files));
  assert.equal(native.default_vet, true);
  assert.equal(native.dependencies_installed, false);
  assert.equal(native.remote_executed, false);
  const output = fs.readFileSync(path.join(evidence, `${prefix}.stdout`));
  const events = output.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line.replace(/^\uFEFF/, '')));
  const failed = events.filter(e => e.Action === 'fail' && e.Test).map(e => e.Test);
  const passed = events.filter(e => e.Action === 'pass' && e.Test).map(e => e.Test);
  assert.equal(events.some(e => e.Action === 'skip'), false);
  if (stage === 'baseline') {
    const expected = [
      ...['callback', 'journal'].flatMap(channel => ['valid_ids', 'invalid_ids'].map(mode => `TestGCRuntimeFreezesBatchInputs/${channel}/${mode}`)),
      'TestGCRuntimeFreezesBatchInputs', 'TestGCRuntimeFailureCallbackCannotReplaceLaterSignal',
    ];
    assert.deepEqual(failed.sort(), expected.sort());
    assert.equal(passed.length, 2);
  } else {
    assert.equal(failed.length, 0);
    assert.equal(events.at(-1).Action, 'pass');
    assert.equal(passed.filter(name => name.startsWith('TestGCRuntimeFreezesBatchInputs/')).length, 6);
    assert.ok(passed.includes('TestGCRuntimeFailureCallbackCannotReplaceLaterSignal'));
    for (const name of ['TestGCRuntimeExactDeleteAndTransactionalResults', 'TestGCRuntimeRejectsInvalidAdmissionAndClosedWork',
      'TestJournaledGCDurableFailureAndSuccess', 'TestJournaledGCRefusesUnavailableStorageBeforeWork',
      'TestJournaledGCLossDuringWorkKeepsReferencesAndStopsBatch', 'TestJournaledGCRejectsUnboundStorageAndClosesOwnership',
      'TestJournaledGCRejectsPrivateDiagnosticsAndLatches', 'TestAGCRuntimeRejectsNilAbsence',
      'TestAGCAuthorityRejectsNilPolicy', 'TestAGCAbsenceRejectsNilVerifierBeforeSQL']) assert.ok(passed.includes(name), `Missing regression: ${name}`);
  }
  stages[stage] = { exit: native.exit, roots: passed.filter(name => !name.includes('/')).length, passed: passed.length, failed, source_sha256: inputs.source_sha256, input_count: inputs.files.length, stdout_sha256: sha(output), stderr_sha256: sha(fs.readFileSync(path.join(evidence, `${prefix}.stderr`))) };
}
const base = read('d-gc-batch-input-20261022-baseline-inputs.json');
const candidate = read('d-gc-batch-input-20261022-candidate-inputs.json');
const runtime = 'backend/internal/systembackupevidence/gc_runtime.go';
const test = 'backend/internal/systembackupevidence/gc_runtime_input_isolation_test.go';
assert.deepEqual(candidate.files.map(p => p.path), base.files.map(p => p.path));
const changed = candidate.files.filter(p => p.sha256 !== base.files.find(b => b.path === p.path)?.sha256).map(p => p.path);
assert.deepEqual(changed, [runtime]);
for (const name of [runtime, test]) assert.equal(sha(fs.readFileSync(path.join(root, name))), candidate.files.find(p => p.path === name).sha256, `Current candidate changed: ${name}`);
const current = fs.readFileSync(path.join(root, runtime), 'utf8');
const block = [
  '\t// Keep selected hints and failure associations stable across callbacks.',
  '\t// Callers must still avoid concurrent mutation while this copy is made.',
  '\tids = append([]string(nil), ids...)',
].join('\n') + '\n';
assert.equal(current.split(block).length, 2);
assert.equal(sha(current.replace(block, '')), base.files.find(p => p.path === runtime).sha256);
const cleanup = read('d-gc-batch-input-cleanup-20261022.json');
assert.equal(cleanup.owner_absent, true);
assert.equal(fs.existsSync(cleanup.owner), false);
const result = { kind: 'd_gc_batch_input_isolation_acceptance', stages, changed, current_candidate_matches: true, tested_scope: 'frozen GC runtime, journal and nil-adapter regressions; not full package or entire current workspace', cleaned: true, files_removed: cleanup.files_removed, dependencies_installed: false, actual_mysql: false, remote_executed: false, production_approved: false };
const accepted = path.join(evidence, 'd-gc-batch-input-accepted-20261022.json');
if (process.argv.includes('--check')) assert.deepEqual(read(path.basename(accepted)), result);
else fs.writeFileSync(accepted, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'accepted', ...result }));
