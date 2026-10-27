import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Same source selection as Get-DIndexSourceFiles, with synchronous byte copies
// and before/after byte checks. No child process, dependency installation or
// network. A changed source is refused, never silently omitted.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [mode, ownerArg, manifestArg] = process.argv.slice(2);
const owner = path.resolve(ownerArg), manifest = path.resolve(manifestArg);
assert.equal(path.dirname(owner), root);
assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
assert.equal(fs.lstatSync(owner).isSymbolicLink(), false);
assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
assert.equal(path.dirname(manifest), path.join(root, 'docs/evidence'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const extraDocs = new Set(['docs/system-backup-restore-schema-inventory.json', 'docs/evidence/a-config-canonical-request-vectors-20261014.json', 'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json', 'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json', 'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
function files(base) {
  const selected = [];
  function walk(rel) {
    for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      const name = `${rel}/${e.name}`;
      if (e.isSymbolicLink()) throw new Error(`Redirected source: ${name}`);
      if (e.isDirectory()) {
        if (!['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name)) walk(name);
      } else if (e.isFile() && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)
        && (!name.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(name) || extraDocs.has(name))) selected.push(name);
    }
  }
  for (const name of ['backend','contracts','scripts','docs']) walk(name);
  return selected.sort();
}
const pins = (base, names) => names.map(name => {
  const b = fs.readFileSync(path.join(base, name));
  return { path: name, size: b.length, sha256: hash(b) };
});
const digest = p => hash(p.map(x => `${x.path}\0${x.sha256}\0${x.size}`).join('\n') + '\n');
const source = path.join(owner, 'source');
if (mode === 'create') {
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.existsSync(manifest), false);
  const names = files(root), before = pins(root, names);
  for (const pin of before) {
    const b = fs.readFileSync(path.join(root, pin.path));
    assert.equal(hash(b), pin.sha256, `Source changed before copy: ${pin.path}`);
    const target = path.join(source, pin.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, b, { flag: 'wx' });
    assert.equal(hash(fs.readFileSync(target)), pin.sha256);
  }
  assert.deepEqual(files(root), names, 'Source set changed during freeze');
  assert.deepEqual(pins(root, names), before, 'Source bytes changed during freeze');
  fs.writeFileSync(manifest, JSON.stringify({ kind: 'd_local_closeout_snapshot.v1', source_sha256: digest(before), files: before, stable_copy_verified: true, dependencies_installed: false }, null, 2) + '\n', { flag: 'wx' });
  console.log(`LOCAL_SOURCE files=${names.length} sha256=${digest(before)} stable=yes`);
} else {
  assert.equal(mode, 'check');
  const saved = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.deepEqual(files(source), saved.files.map(p => p.path));
  assert.deepEqual(pins(source, saved.files.map(p => p.path)), saved.files);
  assert.equal(digest(saved.files), saved.source_sha256);
  console.log('LOCAL_SOURCE frozen_postcheck=yes');
}
