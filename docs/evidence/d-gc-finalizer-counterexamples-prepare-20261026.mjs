import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const owner = path.resolve(process.argv[2]);
assert.equal(path.dirname(owner), root);
assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
assert.equal(fs.lstatSync(owner).isSymbolicLink(), false);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const dir = path.join(owner, 'counterexamples');
fs.mkdirSync(dir, { recursive: false });
const cases = [
  {
    name: 'missing_finalizer', file: 'download_retention_gc_freeze.go',
    old: '\tif finalize != nil && finalize(ctx, tx) != nil {\n\t\treturn out, errDownloadGCFreezeDenied\n\t}\n', replacement: '',
    test: 'TestDownloadGCFinalizerProtectedCandidate/worker_claim',
  },
  {
    name: 'earlier_clock_floor', file: 'download_retention_gc.go',
    old: '\tif now, err = s.clock(ctx, tx, now, until); err != nil {',
    replacement: '\tif _, err = s.clock(ctx, tx, now, until); err != nil {',
    test: 'TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback',
  },
];
const records = [];
for (const c of cases) {
  const original = path.join(owner, 'source/backend/internal/systembackupevidence', c.file);
  const bytes = fs.readFileSync(original);
  const source = bytes.toString('utf8').replaceAll('\r\n', '\n');
  assert.equal(source.split(c.old).length, 2, `Ambiguous predecessor transform: ${c.name}`);
  const altered = source.replace(c.old, () => c.replacement);
  const target = path.join(dir, `${c.name}.go`);
  fs.writeFileSync(target, altered, { flag: 'wx' });
  const overlay = path.join(dir, `${c.name}.json`);
  fs.writeFileSync(overlay, JSON.stringify({ Replace: { [original]: target } }) + '\n', { flag: 'wx' });
  records.push({ name: c.name, original, original_sha256: hash(bytes), overlay, test: c.test,
    replacement_sha256: hash(Buffer.from(altered)), replacement_bytes_base64: Buffer.from(altered).toString('base64'),
    overlay_sha256: hash(fs.readFileSync(overlay)), expected_native_exit: 1,
    scope: 'intentional_single_regression_overlay_not_current_source_pass' });
}
const out = path.join(root, 'docs/evidence', `d-gc-finalizer-counterexamples-${path.basename(owner).slice('.tmp-d-index-cache-'.length)}.json`);
fs.writeFileSync(out, JSON.stringify({ kind: 'd_gc_finalizer_counterexamples.v1', records, dependencies_installed: false, remote_contacted: false }, null, 2) + '\n', { flag: 'wx' });
console.log(`COUNTEREXAMPLES_PREPARED=${out}`);
