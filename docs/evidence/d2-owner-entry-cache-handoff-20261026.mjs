import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Run only in the source owner's explicitly offered Linux-stage handoff window.
// This copies existing compilation cache bytes. All later tests use -count=1.
assert.equal(process.argv.length, 3, 'Usage: cache-handoff EXACT_ENTRY_OWNER');
const root = path.resolve(import.meta.dirname, '../..');
const sourceOwner = path.resolve(process.argv[2]);
assert.equal(path.dirname(sourceOwner), root);
assert.match(path.basename(sourceOwner), /^\.tmp-d-bootstrap-entry-[a-f0-9]{32}$/);
assert.equal(fs.realpathSync(sourceOwner), sourceOwner);
assert.equal(fs.readFileSync(path.join(sourceOwner, 'owner.txt'), 'utf8'), path.basename(sourceOwner));
const source = path.join(sourceOwner, 'cache');
assert.equal(fs.realpathSync(source), source);
const token = crypto.randomUUID().replaceAll('-', '');
const owner = path.join(root, '.tmp-d-index-cache-' + token);
const target = path.join(owner, 'cache');
assert.equal(fs.existsSync(owner), false);
fs.mkdirSync(owner);
fs.writeFileSync(path.join(owner, 'owner.txt'), path.basename(owner), {flag: 'wx'});
fs.mkdirSync(target);
const report = {kind: 'd2_owner_entry_compilation_cache_handoff.v1', sourceOwner, owner,
  source_read_only: true, existing_entries_overwritten: false, test_result_reuse: false,
  tests_started: false, dependencies_installed: false, entries: [], source_disappeared: 0, error: null};
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
    let bytes;
    try { assert.equal(fs.realpathSync(from), from); bytes = fs.readFileSync(from); }
    catch (error) { if (error.code === 'ENOENT') { report.source_disappeared++; continue; } throw error; }
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.writeFileSync(to, bytes, {flag: 'wx'});
    report.entries.push({name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
  }
} catch (error) { report.error = error.message; process.exitCode = 1; }
const output = path.join(root, 'docs/evidence/d2-owner-entry-cache-handoff-' + token + '.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
fs.writeFileSync(path.join(owner, 'preparation.json'), JSON.stringify({kind: report.kind, owner,
  report: output, cache_only: true, tests_started: false, test_result_reuse: false}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({owner, report: output, entries: report.entries.length, error: report.error, tests_started: false}));
