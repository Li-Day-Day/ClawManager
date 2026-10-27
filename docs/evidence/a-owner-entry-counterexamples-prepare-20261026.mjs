import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Prepare intentional single-regression overlays only in the exact frozen
// owner. Historical 2099 scripts and receipts are never edited or overwritten.
const root = path.resolve(import.meta.dirname, '../..');
assert.equal(process.argv.length, 3, 'Usage: node a-owner-entry-counterexamples-prepare-20261026.mjs EXACT_OWNER');
const owner = path.resolve(process.argv[2]);
assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase());
assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(fs.lstatSync(owner).isSymbolicLink(), false);
assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const folder = path.join(owner, 'entry-owner-counterexamples');
assert.equal(fs.existsSync(folder), false, 'Refuse replacing an existing overlay');
const cases = [
  {
    name: 'missing_finalizer', file: 'download_retention_gc_freeze.go',
    before: '\tif finalize != nil && finalize(ctx, tx) != nil {\n\t\treturn out, errDownloadGCFreezeDenied\n\t}\n', after: '',
    test: 'TestDownloadGCFinalizerProtectedCandidate/worker_claim',
  },
  {
    name: 'earlier_clock_floor', file: 'download_retention_gc.go',
    before: '\tif now, err = clock(ctx, tx, now, until); err != nil {',
    after: '\tif _, err = clock(ctx, tx, now, until); err != nil {',
    test: 'TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback',
  },
];
// Validate both exact transformations before creating any output.
const prepared = cases.map(item => {
  const original = path.join(owner, 'source/backend/internal/systembackupevidence', item.file);
  assert.equal(fs.lstatSync(original).isSymbolicLink(), false);
  const originalBytes = fs.readFileSync(original);
  const source = originalBytes.toString('utf8').replaceAll('\r\n', '\n');
  assert.equal(source.split(item.before).length, 2, 'Missing or ambiguous exact transform: ' + item.name);
  const replacement = Buffer.from(source.replace(item.before, () => item.after));
  return {item, original, originalBytes, replacement};
});
fs.mkdirSync(folder);
const records = prepared.map(({item, original, originalBytes, replacement}) => {
  const target = path.join(folder, item.name + '.go');
  const overlay = path.join(folder, item.name + '.json');
  const overlayBytes = Buffer.from(JSON.stringify({Replace: {[original]: target}}) + '\n');
  fs.writeFileSync(target, replacement, {flag: 'wx'});
  fs.writeFileSync(overlay, overlayBytes, {flag: 'wx'});
  return {name: item.name, original, original_sha256: sha(originalBytes), replacement_sha256: sha(replacement), replacement_bytes_base64: replacement.toString('base64'), overlay, overlay_sha256: sha(overlayBytes), test: item.test, expected_native_exit: 1, expected_failure: 'unsafe committed assertion, never compiler failure or timeout', scope: 'one intentional regression in frozen copy; no current source or production acceptance'};
});
const manifest = path.join(root, 'docs/evidence', 'a-owner-entry-counterexamples-' + path.basename(owner).slice('.tmp-d-index-cache-'.length) + '.json');
fs.writeFileSync(manifest, JSON.stringify({kind: 'a_owner_entry_counterexamples.v1', records, dependencies_installed: false, remote_contacted: false}, null, 2) + '\n', {flag: 'wx'});
process.stdout.write(JSON.stringify({manifest, prepared: records.length, tests_started: false, historical_scripts_unchanged: true}) + '\n');
