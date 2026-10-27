import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Copy only newly available immutable compilation entries into a prepared owner.
// Neither the peer cache nor an existing destination entry is ever modified.
assert.equal(process.argv.length, 4, 'Usage: cache-update EXACT_ENTRY_OWNER EXACT_PREPARED_OWNER');
const root = path.resolve(import.meta.dirname, '../..');
const sourceOwner = path.resolve(process.argv[2]), owner = path.resolve(process.argv[3]);
for (const dir of [sourceOwner, owner]) {
  assert.equal(path.dirname(dir), root);
  assert.equal(fs.realpathSync(dir), dir);
  assert.equal(fs.readFileSync(path.join(dir, 'owner.txt'), 'utf8'), path.basename(dir));
}
assert.match(path.basename(sourceOwner), /^\.tmp-d-bootstrap-entry-[a-f0-9]{32}$/);
assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
const source = path.join(sourceOwner, 'cache'), target = path.join(owner, 'cache');
assert.equal(fs.realpathSync(source), source);
assert.equal(fs.realpathSync(target), target);
const preparationPath = path.join(owner, 'preparation.json');
const preparation = JSON.parse(fs.readFileSync(preparationPath, 'utf8'));
assert.equal(preparation.kind, 'd2_owner_entry_compilation_cache_handoff.v1');
assert.equal(preparation.owner, owner);
assert.equal(preparation.tests_started, false);
const original = JSON.parse(fs.readFileSync(preparation.report, 'utf8'));
assert.equal(original.sourceOwner, sourceOwner);
assert.equal(original.owner, owner);
assert.equal(original.error, null);
const report = {kind: 'd2_owner_entry_compilation_cache_update.v1', sourceOwner, owner,
  source_read_only: true, existing_entries_overwritten: false, test_result_reuse: false,
  tests_started: false, dependencies_installed: false, entries: [], skipped_existing: 0,
  source_disappeared: 0, error: null};
try {
  const names = [];
  for (const dir of fs.readdirSync(source, {withFileTypes: true})) {
    if (!dir.isDirectory() || !/^[a-f0-9]{2}$/.test(dir.name)) continue;
    const folder = path.join(source, dir.name);
    assert.equal(fs.realpathSync(folder), folder);
    for (const file of fs.readdirSync(folder, {withFileTypes: true})) {
      if (file.isFile() && /^[a-f0-9]{64}-[ad]$/.test(file.name)) names.push(dir.name + '/' + file.name);
    }
  }
  names.sort((a, b) => Number(a.endsWith('-a')) - Number(b.endsWith('-a')) || a.localeCompare(b));
  for (const name of names) {
    const from = path.join(source, name), to = path.join(target, name);
    if (fs.existsSync(to)) { report.skipped_existing++; continue; }
    let bytes;
    try { assert.equal(fs.realpathSync(from), from); bytes = fs.readFileSync(from); }
    catch (error) { if (error.code === 'ENOENT') { report.source_disappeared++; continue; } throw error; }
    fs.mkdirSync(path.dirname(to), {recursive: true});
    assert.equal(fs.realpathSync(path.dirname(to)), path.dirname(to));
    const temporary = path.join(owner, '.cache-update-' + crypto.randomUUID());
    try {
      fs.writeFileSync(temporary, bytes, {flag: 'wx'});
      try {
        fs.linkSync(temporary, to);
        report.entries.push({name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
      } catch (error) { if (error.code !== 'EEXIST') throw error; report.skipped_existing++; }
    } finally { fs.unlinkSync(temporary); }
  }
} catch (error) { report.error = error.message; process.exitCode = 1; }
const output = path.join(root, 'docs/evidence/d2-owner-entry-cache-update-' + crypto.randomUUID().replaceAll('-', '') + '.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
preparation.cache_updates = [...(preparation.cache_updates ?? []), output];
fs.writeFileSync(preparationPath, JSON.stringify(preparation, null, 2) + '\n');
console.log(JSON.stringify({owner, report: output, added: report.entries.length,
  skipped_existing: report.skipped_existing, error: report.error, tests_started: false}));
