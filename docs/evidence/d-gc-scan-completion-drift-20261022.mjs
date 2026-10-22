import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const evidence = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidence, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = pins => sha(pins.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
const candidate = read('d-gc-scan-completion-candidate-20261022.json');
const current = read('d-gc-scan-completion-current-20261022.json');
const native = read('d-gc-scan-completion-20261022-published-native.json');
assert.equal(digest(current), native.input_after_sha256);
const old = new Map(candidate.files.map(p => [p.path, p]));
const differences = current.filter(p => old.get(p.path)?.sha256 !== p.sha256);
assert.equal(differences.length, 3);
assert.equal(candidate.files.some(p => !current.some(c => c.path === p.path)), false);
const matches = [];
// Find the exact pre-test pin list by its already-recorded SHA256. Frozen
// and post-test pins are the only choices; a missing match fails the audit.
for (let mask = 0; mask < 2 ** differences.length; mask++) {
  const choices = new Map(differences.map((p, i) => [p.path, mask & (1 << i) ? old.get(p.path) : p]));
  const pins = current.flatMap(p => choices.has(p.path) ? (choices.get(p.path) ? [choices.get(p.path)] : []) : [p]);
  if (pins.length === native.input_count && digest(pins) === native.input_before_sha256) matches.push(pins);
}
assert.equal(matches.length, 1, 'Cannot uniquely recover the recorded pre-test pins');
const before = matches[0];
const beforeIndex = new Map(before.map(p => [p.path, p]));
const changes = current.filter(p => beforeIndex.get(p.path)?.sha256 !== p.sha256);
assert.deepEqual(changes.map(p => p.path), ['backend/internal/systembackupevidence/download_gc_owner_lifecycle_mysql_test.go']);
const changed = changes[0];
const packageInfo = read('d-gc-scan-completion-package-20261022.json');
const filename = path.basename(changed.path);
assert.equal(packageInfo.IgnoredGoFiles.includes(filename), true);
for (const field of ['GoFiles', 'CgoFiles', 'TestGoFiles', 'XTestGoFiles', 'EmbedFiles', 'TestEmbedFiles', 'XTestEmbedFiles']) {
  assert.equal((packageInfo[field] ?? []).includes(filename), false);
}
const frozenFile = path.join(root, '.tmp-d-index-cache-91d7897bdfb34761ad4adce2669bb651/source', changed.path);
const savedPath = path.join(evidence, 'd-gc-scan-completion-drift-bytes-20261022.json');
let bytes;
if (process.argv.includes('--check')) bytes = read(path.basename(savedPath));
else {
  bytes = { before_base64: fs.readFileSync(frozenFile).toString('base64'), after_base64: fs.readFileSync(path.join(root, changed.path)).toString('base64') };
  fs.writeFileSync(savedPath, JSON.stringify(bytes, null, 2) + '\n', { flag: 'wx' });
}
assert.equal(sha(Buffer.from(bytes.before_base64, 'base64')), beforeIndex.get(changed.path).sha256);
assert.equal(sha(Buffer.from(bytes.after_base64, 'base64')), changed.sha256);
for (const encoded of [bytes.before_base64, bytes.after_base64]) {
  assert.match(Buffer.from(encoded, 'base64').toString('utf8'), /^\/\/go:build systembackup_mysql\r?\n/);
}
// Every ordinary Go source, module file, SQL/JSON fixture and other selected
// asset is identical across the actual run. The sole delta was excluded.
const selectedBefore = before.filter(p => p.path !== changed.path);
const selectedAfter = current.filter(p => p.path !== changed.path);
assert.equal(digest(selectedBefore), digest(selectedAfter));
const result = {
  kind: 'd_gc_scan_completion_concurrent_input_review',
  original_wrapper_input_unchanged: native.input_unchanged,
  original_wrapper_preserved: true,
  pre_test_sha256: digest(before), post_test_sha256: digest(current),
  changed_during_run: changes.map(p => ({ path: p.path, before_sha256: beforeIndex.get(p.path).sha256, after_sha256: p.sha256, excluded_by_build_tag: 'systembackup_mysql' })),
  selected_input_count: selectedBefore.length, selected_before_sha256: digest(selectedBefore), selected_after_sha256: digest(selectedAfter),
  scripts_changed_before_run: differences.filter(p => p.path.startsWith('scripts/')).map(p => p.path),
  full_package_result_accepted: true, actual_mysql: false, tagged_probe_changes_accepted: false,
};
const out = path.join(evidence, 'd-gc-scan-completion-drift-accepted-20261022.json');
if (process.argv.includes('--check')) assert.deepEqual(read(path.basename(out)), result);
else fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
