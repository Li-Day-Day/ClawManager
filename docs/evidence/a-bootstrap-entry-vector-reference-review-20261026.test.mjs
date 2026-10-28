import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewEntryVectorReferences, vectorReferenceInputs} from './a-bootstrap-entry-vector-reference-review-20261026.mjs';

const original = new Map(vectorReferenceInputs.map(name => [name, fs.readFileSync(name)]));
function altered(index, transform) {
  return name => name === vectorReferenceInputs[index] ? Buffer.from(transform(original.get(name).toString('utf8'))) : original.get(name);
}
test('current entry fixtures resolve only original catalog groups and IDs', () => {
  const result = reviewEntryVectorReferences(name => original.get(name));
  assert.equal(result.inputs.length, 3);
  assert.deepEqual(result.admission_selector_ids, ['disabled_artifact', 'unconfigured_artifact']);
  assert.equal(result.actual_SQL, false);
});
test('unknown configured_artifact producer fixture is rejected', () => {
  assert.throws(() => reviewEntryVectorReferences(altered(1, source => source.replace('"disabled_artifact"', '"configured_artifact"'))), /Unknown original producer vector/);
});
test('nonexistent results group is rejected before claiming a seed', () => {
  assert.throws(() => reviewEntryVectorReferences(altered(2, source => source.replace('"positive", name', '"results", name'))), /Unknown original vector group/);
});
test('changed dynamic admission selector is rejected', () => {
  assert.throws(() => reviewEntryVectorReferences(altered(2, source => source.replace('name = "disabled_artifact"', 'name = "unreviewed_artifact"'))));
});
test('missing canonical configured vector is rejected', () => {
  assert.throws(() => reviewEntryVectorReferences(altered(0, source => {
    const vectors = JSON.parse(source);
    vectors.positive = vectors.positive.filter(item => item.id !== 'disabled_artifact');
    return JSON.stringify(vectors);
  })), /Unknown original producer vector|Missing original admission vector/);
});
test('missing literal record fixture is rejected', () => {
  assert.throws(() => reviewEntryVectorReferences(altered(2, source => source.replace('"records", "DomainRecord"', '"records", "UnknownDomainRecord"'))), /Unknown original entry vector/);
});
