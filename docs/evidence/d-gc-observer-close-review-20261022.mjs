import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const basePath = 'docs/evidence/d-gc-observer-close-base-20261022.json';
const base = json(basePath);
const owner = path.resolve(base.owner);
const prefix = 'docs/evidence/d-gc-observer-close-20261022-v2-';
const catalog = 'backend/internal/systembackupgcmetadata/catalog.go';
const test = 'backend/internal/systembackupgcmetadata/connection_close_test.go';
const result = mode => {
  const native = json(prefix + mode + '-native.json');
  const source = json(prefix + mode + '-source.json');
  assert.equal(native.source_postcheck, true);
  assert.equal(native.source_sha256, source.source_sha256);
  assert.equal(native.default_vet, true);
  for (const k of ['dependencies_installed', 'remote_executed', 'actual_mysql']) assert.equal(native[k], false);
  assert.equal(source.files.length, 7);
  assert.equal(sha(source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n'), source.source_sha256);
  const text = read(prefix + mode + '.jsonl').toString('utf8');
  assert.ok(text.endsWith('\n'));
  const rows = text.trim().split(/\r?\n/).map(x => JSON.parse(x));
  assert.equal(rows.filter(x => x.Action === 'skip').length, 0);
  return { native, source, rows };
};
const old = result('old'), candidate = result('candidate');
assert.equal(old.native.exit, 1);
assert.deepEqual(old.rows.filter(x => x.Action === 'fail' && x.Test?.includes('/')).map(x => x.Test), [
  'TestProgramObservationAfterConnectionClose/canceled',
  'TestProgramObservationAfterConnectionClose/deadline',
]);
assert.deepEqual(old.rows.filter(x => x.Action === 'pass' && x.Test).map(x => x.Test), [
  'TestProgramObservationAfterConnectionClose/live',
  'TestProgramObservationAfterConnectionClose/close_error',
]);
assert.equal(old.source.files.find(x => x.path === catalog).sha256, base.files.find(x => x.path === catalog).sha256);
for (const p of old.source.files) {
  const c = candidate.source.files.find(x => x.path === p.path);
  assert.ok(c);
  if (p.path !== catalog) assert.deepEqual(c, p);
}
const successful = r => {
  assert.equal(r.native.exit, 0);
  assert.equal(r.rows.filter(x => x.Action === 'fail').length, 0);
  assert.deepEqual(r.rows.filter(x => x.Action === 'pass' && !x.Test).map(x => x.Package), ['clawreef/internal/systembackupgcmetadata']);
  const passed = r.rows.filter(x => x.Action === 'pass' && x.Test);
  assert.equal(passed.filter(x => !x.Test.includes('/')).length, 13);
  assert.equal(passed.length, 281);
};
successful(candidate);
const receiptPath = 'docs/evidence/d-gc-observer-close-preparation-20261022.json';
const publishedInputs = () => {
  const published = result('published');
  successful(published);
  assert.deepEqual(published.source.files, candidate.source.files);
  for (const p of published.source.files) assert.equal(sha(read(p.path)), p.sha256, p.path);
  const dir = path.join(root, 'backend/internal/systembackupgcmetadata');
  assert.equal(fs.readdirSync(dir).filter(p => fs.statSync(path.join(dir, p)).isFile()).length, 5);
  return published;
};
if (process.argv.includes('--precleanup')) {
  assert.equal(json(receiptPath).status, 'locally_validated_published_postcheck_pending');
  publishedInputs();
  console.log('PASS observer published inputs and full package; exact cleanup pending');
  process.exit(0);
}
if (process.argv.includes('--check')) {
  const r = json(receiptPath);
  publishedInputs();
  assert.equal(r.status, 'locally_validated_published_cleaned');
  for (const p of r.changed_files) {
    assert.equal(sha(read(p.path)), p.after_sha256);
    assert.equal(sha(Buffer.from(p.tested_bytes_base64, 'base64')), p.after_sha256);
  }
  for (const p of r.evidence) assert.equal(sha(read(p.path)), p.sha256);
  const cleanup = json('docs/evidence/d-gc-observer-close-cleanup-20261022.json');
  assert.equal(cleanup.removed, true);
  assert.equal(path.resolve(cleanup.owner), owner);
  assert.equal(fs.existsSync(owner), false);
  console.log('PASS observer close boundary: old cancellation/deadline fail; candidate and published 13 roots/281 tests; exact cleanup; no MySQL/freeze approval');
} else {
  assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
  for (const p of base.files) assert.equal(sha(read(p.path)), p.sha256, 'Concurrent change ' + p.path);
  assert.equal(fs.existsSync(path.join(root, test)), false);
  const changed_files = [catalog, test].map(p => {
    const bytes = fs.readFileSync(path.join(owner, 'source', p));
    const pin = candidate.source.files.find(x => x.path === p);
    assert.equal(sha(bytes), pin.sha256);
    const before = p === catalog ? read(p) : null;
    return { path: p, before_exists: before !== null, before_sha256: before ? sha(before) : null, before_bytes_base64: before?.toString('base64'), after_sha256: sha(bytes), tested_bytes_base64: bytes.toString('base64') };
  });
  const evidencePaths = [basePath, 'docs/evidence/d-gc-observer-close-change-20261022.json', 'docs/evidence/d-gc-observer-close-sql-semantics-20261022.json', 'docs/evidence/d-gc-observer-close-validation-20261022.ps1', 'docs/evidence/d-gc-observer-close-validation-v2-20261022.ps1', ...['old', 'candidate'].flatMap(m => ['-source.json', '-native.json', '.jsonl', '.stderr'].map(s => prefix + m + s)), ...['-source.json', '-native.json', '.jsonl', '.stderr'].map(s => 'docs/evidence/d-gc-observer-close-20261022-old' + s)];
  const evidence = evidencePaths.map(p => ({ path: p, sha256: sha(read(p)), size: read(p).length }));
  const receipt = { kind: 'd_gc_program_observer_close_boundary', status: 'locally_validated_unpublished', source_sha256: candidate.source.source_sha256, source_files: 7, full_package_roots: 13, full_package_tests: 281, valid_counterexample: ['canceled', 'deadline'], first_fixture_attempt_accepted: false, first_fixture_error: 'incorrect expectation that sql.Conn.Close reports physical driver Close errors; original failed logs preserved', changed_files, evidence, dependencies_installed: false, actual_mysql: false, production_freeze_enabled: false, full_gc: false, current_whole_tree_tested: false, driver_close_interruptible: false, remote_release_proved: false };
  fs.writeFileSync(path.join(root, receiptPath), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log('OBSERVER_CLOSE_PREPARED old-code counterexample and full package verified; publication/cleanup pending');
}
