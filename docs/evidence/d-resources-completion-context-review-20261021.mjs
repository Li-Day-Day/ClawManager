import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const prefix = 'docs/evidence/d-resources-completion-context-';
const receiptPath = `${prefix}accepted-20261021.json`;
const base = JSON.parse(fs.readFileSync(`${prefix}base-20261021.json`, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const expectedRemaining = [
  'TestCaptureTableAllowlistFailsClosed',
  'TestCaptureTableAllowlistFailsClosed/unreviewed_other_domain',
  'TestControlExclusionDetectsSourceRows',
  'TestControlExclusionEmptyTarget',
].sort();
const repaired = [
  'TestResourcesCountCompletionContext',
  'TestResourcesCountCompletionContext/canceled',
  'TestResourcesCountCompletionContext/deadline',
  'TestResourcesCountCompletionContext/collect_canceled',
  'TestResourcesProofCompletionContext',
  'TestResourcesProofCompletionContext/canceled',
  'TestResourcesProofCompletionContext/canceled_mismatch',
  'TestResourcesProofCompletionContext/deadline',
].sort();

function readRun(stage) {
  const file = `${prefix}${stage}-20261021.jsonl`;
  const stderr = `${prefix}${stage}-20261021.stderr.txt`;
  const nativeFile = `${prefix}${stage}-native-20261021.json`;
  const native = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
  const events = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  const failed = events.filter(e => e.Test && e.Action === 'fail').map(e => e.Test).sort();
  const passed = events.filter(e => e.Test && e.Action === 'pass').map(e => e.Test).sort();
  const skipped = events.filter(e => e.Action === 'skip');
  assert.equal(skipped.length, 0, `${stage}: unexpected skipped test`);
  const end = events.filter(e => !e.Test && ['pass', 'fail'].includes(e.Action)).at(-1);
  assert.ok(end, `${stage}: missing package completion`);
  assert.equal(end.Package, 'clawreef/internal/systembackupresources');
  assert.equal(native.exit, end.Action === 'pass' ? 0 : 1, `${stage}: native exit differs`);
  return { file, sha256: fileHash(file), stderr, stderr_sha256: fileHash(stderr),
    native_file: nativeFile, native_sha256: fileHash(nativeFile), native_exit: native.exit, package_status: end.Action,
    main_passed: passed.filter(name => !name.includes('/')).length,
    checks_passed: passed.length, failed, passed };
}

const runs = Object.fromEntries(['baseline', 'target', 'full', 'module-target', 'module-full'].map(stage => [stage, readRun(stage)]));
assert.deepEqual(runs.baseline.failed, [...expectedRemaining, ...repaired].sort());
for (const stage of ['full', 'module-full']) {
  assert.equal(runs[stage].package_status, 'fail');
  assert.deepEqual(runs[stage].failed, expectedRemaining);
}
for (const stage of ['target', 'module-target']) {
  assert.equal(runs[stage].package_status, 'pass');
  assert.equal(runs[stage].checks_passed, 13);
  assert.deepEqual(runs[stage].failed, []);
}
assert.deepEqual(runs.full.passed, runs['module-full'].passed);

if (process.argv.includes('--write')) {
  const files = ['sql_counts.go', 'verifier.go', 'completion_context_test.go'].map(name => {
    const file = `backend/internal/systembackupresources/${name}`;
    assert.equal(fileHash(file), fileHash(path.join(base.root, file)), `${file}: publication differs from tested source`);
    return { path: file, sha256: fileHash(file) };
  });
  for (const name of ['sql_counts.go', 'verifier.go']) {
    const file = `backend/internal/systembackupresources/${name}`;
    const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(
      /\tif err := ctx.Err\(\); err != nil \{\n\t\treturn (SourceSnapshot\{\}|nil), err\n\t\}\n/g,
      (match, value, offset) => offset === fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').indexOf(match) ? match : '');
    const before = base.files.find(entry => entry.path === file).sha256;
    assert.ok([hash(original), hash(original.replace(/\n/g, '\r\n'))].includes(before), `${file}: change exceeds one completion guard`);
  }
  const frozen = [...base.files.map(entry => entry.path), ...base.contracts.map(entry => entry.path),
    'backend/internal/systembackupresources/completion_context_test.go', 'backend/go.mod', 'backend/go.sum']
    .map(file => ({ path: file, sha256: fileHash(path.join(base.root, file)) }));
  fs.writeFileSync(receiptPath, JSON.stringify({
    kind: 'd_resources_completion_context_limited_acceptance', recorded_utc: new Date().toISOString(),
    status: 'completion_guards_accepted_package_has_preexisting_failures',
    coordination: 'Other D chat handles prune migration and cost aggregation; resources files were unchanged against baseline before publication. No messages sent to other chats.',
    changes: files, frozen_inputs: frozen, runs,
    validation: 'Initial counterfactual/full checks used an isolated standard-library module with go 1.23.0 under Go 1.26.1. Final module-target/module-full used exact project go.mod/go.sum (go 1.26.1), default vet, GOPROXY=off, GOSUMDB=off and GOTOOLCHAIN=local.',
    initial_telemetry_warning: 'Initial go invocations could not create the user telemetry token; subsequent runs used an isolated TEST_TELEMETRY_DIR with mode off. No escalation or dependency installation.',
    remaining: 'Three existing failing cases (four fail events including parent): stale negative review fixture and two control-exclusion cases blocked by four new runtime tables. No contract, registry, control-exclusion, deployment or production enablement changes.',
    cleanup_receipt: `${prefix}cleanup-20261021.json`,
  }, null, 2) + '\n');
}
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
for (const file of receipt.changes) assert.equal(fileHash(file.path), file.sha256, `${file.path}: changed after acceptance`);
for (const [stage, run] of Object.entries(runs)) {
  for (const key of ['sha256', 'stderr_sha256', 'native_sha256']) assert.equal(run[key], receipt.runs[stage][key]);
}
if (!process.argv.includes('--write')) {
  const cleanup = JSON.parse(fs.readFileSync(receipt.cleanup_receipt, 'utf8'));
  assert.equal(cleanup.root, base.root);
  assert.equal(cleanup.removed, true);
  assert.equal(fs.existsSync(base.root), false, 'owned test directory remains');
}
console.log(JSON.stringify({ status: receipt.status, focused_checks: 13,
  module_full_passed: runs['module-full'].checks_passed, remaining_fail_events: expectedRemaining.length }));
