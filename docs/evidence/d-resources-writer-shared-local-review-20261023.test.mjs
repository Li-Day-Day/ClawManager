import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSharedInputs, validateDamagedLocalLog, reviewWriterSharedLocal } from './d-resources-writer-shared-local-review-20261023.mjs';

const prefix = 'docs/evidence/d-resources-mysql-20261023-155828-671eb051';
const oldPrefix = 'docs/evidence/d-resources-mysql-20261023-145940-5210d96e';
const json = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const inputs = () => [json(prefix + '.json'), json(prefix + '-source.json'), json(oldPrefix + '.json'), json(oldPrefix + '-source.json')];

test('ordinary package inputs and command match across the distinct remote runs', () => {
  const values = inputs(); validateSharedInputs(...values);
  assert.notEqual(values[0].binary_sha256, values[2].binary_sha256);
});
for (const [name, mutate] of Object.entries({
  'changed resource source': values => { values[1].files.find(p => p.path.startsWith('backend/internal/systembackupresources/')).sha256 = 'a'.repeat(64); },
  'changed module': values => { values[1].files.find(p => p.path === 'backend/go.mod').sha256 = 'a'.repeat(64); },
  'changed contract': values => { values[1].files.find(p => p.path.startsWith('contracts/')).sha256 = 'a'.repeat(64); },
  'added package input': values => { values[1].files.push({ path: 'backend/internal/systembackupresources/new_test.go', size: 1, sha256: 'a'.repeat(64) }); },
  'filtered command': values => { values[0].steps[0].command.push('-run', 'OneTest'); },
  'wrong suite': values => { values[0].suite = 'readback'; },
  'failed native exit': values => { values[0].steps[0].exit_code = 1; },
})) test('reject cross-run reuse: ' + name, () => {
  const values = inputs(); mutate(values); assert.throws(() => validateSharedInputs(...values));
});

const pkg = 'clawreef/internal/systembackupresources';
const events = [
  { Action: 'start', Package: pkg }, { Action: 'run', Package: pkg, Test: 'TestExample' },
  { Action: 'pass', Package: pkg, Test: 'TestExample' }, { Action: 'pass', Package: pkg },
];
const damaged = values => [JSON.stringify(values[0]), '{', ...values.slice(1).map(e => JSON.stringify(e))].join('\n');
test('damaged JSON remains explicit; no reconstruction of the old line', () => {
  assert.deepEqual(validateDamagedLocalLog(damaged(events), ['TestExample']).malformed_lines, [2]);
});
for (const Action of ['fail', 'skip']) test('damage cannot hide ' + Action, () => {
  const values = structuredClone(events); values.splice(2, 0, { Action, Package: pkg });
  assert.throws(() => validateDamagedLocalLog(damaged(values), ['TestExample']), /failed\/skipped/);
});
test('a valid original log cannot use the damaged-log path', () => {
  assert.throws(() => validateDamagedLocalLog(events.map(e => JSON.stringify(e)).join('\n'), ['TestExample']));
});
test('shared supplement cannot lose original named tests', () => {
  assert.throws(() => validateDamagedLocalLog(damaged(events), ['TestOther']), /lost original test coverage/);
});
test('incomplete package is rejected despite replacement success', () => {
  assert.throws(() => validateDamagedLocalLog(damaged(events.slice(0, -1)), ['TestExample']));
});

test('real writer evidence reviewed without creating or executing a test/binary/remote run', () => {
  const result = reviewWriterSharedLocal(prefix + '.json',
    'docs/evidence/d-resources-writer-operator-20261023-671eb051.txt',
    'docs/evidence/d-resources-local-recheck-c5fe0b025c054ef4b239bc8cc6c71f81.json');
  assert.equal(result.remote_cases, 9); assert.equal(result.local_pass_events, 843);
  assert.equal(result.shared_local_recheck.input_files, 122);
  assert.equal(result.shared_local_recheck.new_local_run_claimed, false);
  assert.equal(result.foreign_keys_accepted, false); assert.equal(result.remote_rerun_required, false);
});
