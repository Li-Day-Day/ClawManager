import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
export const vectorReferenceInputs = ['contracts/system-backup/v12/producer-authority-vectors.json', 'backend/internal/systembackupproducer/bootstrap_inline_domain_test.go', 'backend/internal/systembackupevidence/bootstrap_entry_mysql_test.go'];
// This validates fixture references, never deployment/resource authorization.
export function reviewEntryVectorReferences(readFile = name => fs.readFileSync(path.join(root, name))) {
  const inputs = new Map(vectorReferenceInputs.map(name => [name, Buffer.from(readFile(name))]));
  const text = name => inputs.get(name).toString('utf8').replace(/^\uFEFF/, '');
  const vectors = JSON.parse(text(vectorReferenceInputs[0]));
  assert.ok(Array.isArray(vectors.positive) && vectors.positive.length > 0, 'Missing original positive vector group');
  const positive = new Set(vectors.positive.map(item => item.id));
  assert.equal(positive.size, vectors.positive.length, 'Duplicate original vector ID');
  const producerSource = text(vectorReferenceInputs[1]);
  const producerIDs = [...producerSource.matchAll(/\bresultFixture\(\s*t,\s*"([^"]+)"\s*\)/g)].map(match => match[1]);
  assert.ok(producerIDs.length >= 2, 'Producer entry branch fixture references missing');
  for (const id of producerIDs) assert.ok(positive.has(id), 'Unknown original producer vector: ' + id);
  const entrySource = text(vectorReferenceInputs[2]);
  const groups = [...entrySource.matchAll(/\bdIntegrationVector\(\s*t,\s*"([^"]+)"\s*,/g)].map(match => match[1]);
  assert.ok(groups.length >= 2, 'Entry vector lookups missing');
  for (const group of groups) assert.ok(Array.isArray(vectors[group]), 'Unknown original vector group: ' + group);
  const literalLookups = [...entrySource.matchAll(/\bdIntegrationVector\(\s*t,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)].map(match => ({group: match[1], id: match[2]}));
  // dIntegrationVector resolves ID or Definition; record examples use the
  // latter. Keep the real helper's exact lookup semantics rather than aliases.
  for (const {group, id} of literalLookups) assert.ok(vectors[group].some(item => item.id === id || item.definition === id), 'Unknown original entry vector: ' + group + '/' + id);
  const start = entrySource.indexOf('func bootstrapEntryAdmissionValue(');
  assert.ok(start >= 0, 'Admission selector missing');
  const next = entrySource.indexOf('\nfunc ', start + 1);
  const selector = entrySource.slice(start, next < 0 ? undefined : next);
  const selectorIDs = [...selector.matchAll(/\bname\s*(?::=|=)\s*"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(selectorIDs.sort(), ['disabled_artifact', 'unconfigured_artifact']);
  assert.match(selector, /\bdIntegrationVector\(\s*t,\s*"positive"\s*,\s*name\s*\)/);
  for (const id of selectorIDs) assert.ok(positive.has(id), 'Missing original admission vector: ' + id);
  return {kind: 'a_bootstrap_entry_vector_reference_review.v1', status: 'original_vector_references_match_not_execution', inputs: [...inputs].map(([name, bytes]) => ({path: name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')})), producer_positive_ids: producerIDs, entry_literal_lookups: literalLookups, admission_selector_ids: selectorIDs, actual_SQL: false, production_approved: false};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'), 'Use no arguments or --check (read-only)');
  process.stdout.write(JSON.stringify(reviewEntryVectorReferences()) + '\n');
}
