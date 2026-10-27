import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const evidence = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidence, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8').replace(/^\uFEFF/, ''));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pinDigest = pins => sha(pins.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
const stages = {};
for (const stage of ['baseline', 'candidate']) {
  const prefix = `d-resources-proof-presence-20261022-${stage}`;
  const native = read(`${prefix}-native.json`);
  const inputs = read(`${prefix}-inputs.json`);
  assert.equal(native.exit, stage === 'baseline' ? 1 : 0);
  assert.equal(native.input_unchanged, true);
  assert.equal(native.default_vet, true);
  assert.equal(native.dependencies_installed, false);
  assert.equal(native.remote_executed, false);
  assert.equal(native.source_sha256, pinDigest(inputs.files));
  const output = fs.readFileSync(path.join(evidence, `${prefix}.stdout`), 'utf8');
  const events = output.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line.replace(/^\uFEFF/, '')));
  const failed = events.filter(e => e.Action === 'fail' && e.Test).map(e => e.Test);
  const passed = events.filter(e => e.Action === 'pass' && e.Test).map(e => e.Test);
  assert.equal(events.some(e => e.Action === 'skip'), false);
  if (stage === 'baseline') {
    const expected = ['Capture', 'Target'].flatMap(kind => ['pointer', 'function', 'map', 'slice', 'channel'].map(type => `TestResources${kind}ProofPresence/${type}_nil`));
    assert.deepEqual(failed.filter(name => name.includes('/')).sort(), expected.sort());
    assert.equal(failed.length, 12);
    assert.equal(passed.length, 12);
  } else {
    assert.equal(failed.length, 0);
    assert.equal(events.at(-1).Action, 'pass');
    assert.equal(passed.filter(name => /^TestResources(Capture|Target)ProofPresence\//.test(name)).length, 22);
    for (const pin of inputs.files) {
      const bytes = fs.readFileSync(path.join(root, pin.path));
      assert.equal(bytes.length, pin.size, `Current input size changed: ${pin.path}`);
      assert.equal(sha(bytes), pin.sha256, `Current input changed: ${pin.path}`);
    }
    const packageFiles = fs.readdirSync(path.join(root, 'backend/internal/systembackupresources'), { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => path.relative(root, path.join(f.parentPath, f.name)).replaceAll('\\', '/')).sort();
    assert.deepEqual(packageFiles, inputs.files.filter(p => p.path.startsWith('backend/internal/systembackupresources/')).map(p => p.path).sort());
  }
  stages[stage] = { exit: native.exit, roots: passed.filter(name => !name.includes('/')).length, passed: passed.length, failed, source_sha256: inputs.source_sha256, input_count: inputs.files.length, stdout_sha256: sha(output), stderr_sha256: sha(fs.readFileSync(path.join(evidence, `${prefix}.stderr`))) };
}
const base = read('d-resources-proof-presence-20261022-baseline-inputs.json');
const candidate = read('d-resources-proof-presence-20261022-candidate-inputs.json');
const changed = candidate.files.filter(p => base.files.find(b => b.path === p.path)?.sha256 !== p.sha256).map(p => p.path);
assert.deepEqual(changed, [
  'backend/internal/systembackupresources/control_exclusion.go',
  'backend/internal/systembackupresources/proof_presence.go',
  'backend/internal/systembackupresources/verifier.go',
]);
for (const [file, from, to] of [
  ['verifier.go', 'if missingProofVerifier(proof) {', 'if proof == nil {'],
  ['control_exclusion.go', '|| missingProofVerifier(v.Proof) {', '|| v.Proof == nil {'],
]) {
  const relative = `backend/internal/systembackupresources/${file}`;
  const current = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.equal(current.split(from).length, 2);
  assert.equal(sha(current.replace(from, to)), base.files.find(p => p.path === relative).sha256);
}
const cleanup = read('d-resources-proof-presence-cleanup-20261022.json');
assert.equal(cleanup.owner_absent, true);
assert.equal(fs.existsSync(cleanup.owner), false);
const result = { kind: 'd_resources_proof_presence_acceptance', stages, changed, selected_current_inputs_match: true, cleaned: true, files_removed: cleanup.files_removed, dependencies_installed: false, remote_executed: false, actual_mysql: false, production_approved: false };
const accepted = path.join(evidence, 'd-resources-proof-presence-accepted-20261022.json');
if (process.argv.includes('--check')) assert.deepEqual(read(path.basename(accepted)), result);
else fs.writeFileSync(accepted, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'accepted', ...result }));
