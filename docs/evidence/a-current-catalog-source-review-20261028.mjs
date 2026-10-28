// Read-only deterministic source review. Never executes SQL or changes a pin.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '../..');
const baseline = '52117deea14df5a3a8dcceb8abed5b9c7cada17e';
// Git metadata is collected by the existing shell, since this environment
// denies Node subprocess spawning. This verifier uses filesystem reads only.
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/a-current-catalog-git-inputs-20261028.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(metadata.baseline, baseline);
const head = metadata.head;
assert.match(head, /^[a-f0-9]{40}$/);
const directory = 'backend/internal/db/migrations/';
const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
const newNames = fs.readdirSync(path.join(root, directory)).filter(x => x.endsWith('.sql')).map(x => directory + x);
function catalog(names, read) {
  const h = crypto.createHash('sha256').update(Buffer.from('system-backup-migration-catalog.v1\0'));
  const frame = raw => { const n = Buffer.alloc(8); n.writeBigUInt64BE(BigInt(raw.length)); h.update(n).update(raw); };
  const files = [];
  for (const name of [...names].sort()) {
    const raw = read(name);
    const text = raw.toString('utf8');
    assert.deepEqual(Buffer.from(text), raw, 'Invalid UTF-8 SQL');
    const normalized = Buffer.from(text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));
    frame(Buffer.from(name.slice(directory.length)));
    frame(normalized);
    files.push({ path: name, raw_sha256: sha(raw), normalized_sha256: sha(normalized) });
  }
  return { count: files.length, hash: h.digest('hex'), files };
}
const previous = { count: metadata.baseline_names.length, hash: '0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe',
  hash_source: 'Existing accepted baseline pin, not recomputed in this review', filenames: metadata.baseline_names };
const current = catalog(newNames, name => fs.readFileSync(path.join(root, name)));
assert.equal(previous.count, 96);
assert.equal(previous.hash, '0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe');
assert.equal(current.count, 136);
assert.equal(current.hash, 'dba576ad9efd3f377d8d07de2a9a86d4e523d8dafe8943751beb057a64e52441');
const after = new Map(current.files.map(x => [x.path, x]));
const changes = metadata.changes.map(x => {
  assert.ok(x.path.startsWith(directory) && !x.path.slice(directory.length).includes('/') && x.path.endsWith('.sql'));
  assert.ok(['A', 'M', 'D'].includes(x.status));
  return { path: x.path, kind: ({A:'added',M:'modified',D:'removed'})[x.status], original_git_blob: x.original_git_blob,
    current: after.get(x.path) ?? null };
});
const removed = changes.filter(x => x.kind === 'removed');
const controlPath = 'backend/internal/systembackupcontroller/bootstrap.go';
const source = fs.readFileSync(path.join(root, controlPath), 'utf8');
const linkedCount = Number(source.match(/ContractMigrationCatalogFileCount\s*=\s*(\d+)/)?.[1]);
const linkedHash = source.match(/ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/)?.[1];
assert.ok((linkedCount === previous.count && linkedHash === previous.hash) || (linkedCount === current.count && linkedHash === current.hash));
const record = {
  kind: 'a_current_catalog_deterministic_source_review.v1', date: '2026-10-28', baseline, head,
  algorithm: 'sha256-length-prefixed-filename-normalized-content-v1', previous, current, changes, removed,
  controller: { path: controlPath, raw_sha256: sha(fs.readFileSync(path.join(root, controlPath))), linkedCount, linkedHash },
  pin_refresh_boundary: 'Exact byte/count pin refresh only; keep fixed pin equality. Not a schema, migration-upgrade or deployment approval.',
  existing_migration_bytes_changed: changes.some(x => x.kind === 'modified'),
  strict_schema_policy_review_gates_waived: false, old_receipts_reinterpreted: false,
  SQL_executed: false, dependencies_installed: false, tests_or_builds_rerun: false, production_approved: false,
  initial_attempt: { status: 'blocked_before_source_review', reason: 'Node spawnSync git EPERM', recovery: 'Native shell Git metadata + filesystem-only Node computation' },
};
const output = path.join(root, 'docs/evidence/a-current-catalog-source-review-20261028.json');
const raw = JSON.stringify(record, null, 2) + '\n';
if (fs.existsSync(output)) assert.equal(fs.readFileSync(output, 'utf8'), raw);
else fs.writeFileSync(output, raw, { flag: 'wx' });
console.log(JSON.stringify({ current_count: current.count, current_hash: current.hash,
  added: changes.filter(x => x.kind === 'added').length, modified: changes.filter(x => x.kind === 'modified').map(x => x.path),
  removed: removed.length, controller_pin_current: linkedHash === current.hash, scope: record.pin_refresh_boundary }));
