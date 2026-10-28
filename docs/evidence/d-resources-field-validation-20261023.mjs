import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'docs/evidence/d-resources-rules-local-cefe39ff7c6f414b83c549df2ad70cbb';
const output = 'docs/evidence/d-resources-field-validation-20261023.json';
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file).toString('utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const receipt = json(`${prefix}.json`);
assert.equal(receipt.exit_code, 0);
assert.equal(receipt.error, null);
for (const flag of ['frozen_inputs_stable','current_inputs_stable','owner_removed','default_vet']) assert.equal(receipt[flag], true, flag);
assert.equal(receipt.dependencies_installed, false);
assert.equal(receipt.actual_mysql, false);
assert.equal(receipt.production_wired, false);
const owner = path.resolve(receipt.owner);
assert.equal(path.dirname(owner), root);
assert.equal(path.basename(owner), '.tmp-d-resources-rules-cefe39ff7c6f414b83c549df2ad70cbb');
assert.equal(fs.existsSync(owner), false, 'accurate test owner must be absent');
const snapshot = json(`${prefix}-source.json`);
for (const file of snapshot.inputs) {
  const frozen = Buffer.from(file.bytes_base64, 'base64');
  assert.equal(frozen.length, file.size);
  assert.equal(sha(frozen), file.sha256);
  assert.equal(sha(read(file.path)), file.sha256, `current source drift: ${file.path}`);
}
const events = read(`${prefix}.jsonl`).toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
assert.equal(events.filter(event => ['fail','skip'].includes(event.Action)).length, 0);
assert.equal(events.filter(event => event.Action === 'pass' && !event.Test).length, 1);
const passes = events.filter(event => event.Action === 'pass' && event.Test);
for (const name of ['TestRestoreFieldsEveryColumn','TestRestoreFieldsStructure','TestRestoreFieldsNullAndLosslessValues','TestRestoreFieldsIDsBudgetsAndEmptyTables','TestRestoreFieldsRowAndColumnOrder']) {
  assert.equal(passes.filter(event => event.Test === name).length, 1, name);
}
assert.equal(passes.filter(event => event.Test.startsWith('TestRestoreFieldsEveryColumn/')).length, 111);
const request = json('docs/evidence/d-resources-field-review-request-20261023.json');
for (const file of request.source_files) assert.equal(sha(read(file.path)), file.sha256, file.path);
const files = [`${prefix}.json`, `${prefix}-source.json`, `${prefix}.jsonl`, 'docs/evidence/d-resources-field-review-request-20261023.json', 'docs/evidence/d-resources-field-validation-20261023.mjs'];
const result = {
  kind: 'd_resources_field_local_validation.v1', date: '2026-10-23',
  scope: 'complete_offline_systembackupresources_package', exit_code: 0,
  root_tests: passes.filter(event => !event.Test.includes('/')).length, pass_events: passes.length,
  field_column_mutations_rejected: 111, failed_or_skipped: 0, default_vet: true,
  frozen_inputs: snapshot.inputs.length, current_input_bytes_match: true,
  request_inputs: request.source_files.length, owner_absence_independently_checked: true,
  owner, removed_files: receipt.removed_files,
  dependencies_installed: false, actual_mysql: false, production_wired: false,
  normalization_complete: false, review_approved: false, strict_admission: 'not_ready',
  evidence: files.map(file => ({path:file, sha256:sha(read(file))})),
};
if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, output), JSON.stringify(result,null,2)+'\n', {flag:'wx'});
else { assert.ok(process.argv.includes('--check')); assert.deepEqual(json(output),result); }
console.log(JSON.stringify(result));
