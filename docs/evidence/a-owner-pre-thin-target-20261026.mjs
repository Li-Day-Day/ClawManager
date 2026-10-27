import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

// Target capture/byte validation only. This module cannot issue a scope review,
// accept native evidence, start Go, or register a baseline.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const extras = new Set(['docs/system-backup-restore-schema-inventory.json',
  'docs/evidence/a-config-canonical-request-vectors-20261014.json',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
  'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
  'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
export const gcPaths = ['backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go',
  'backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go'];
export const obligations = [
  'GC_three_seed_roots', 'Linux_current_tagged_evidence_compile',
  'owner_original_thirteen_stages', 'frozen_source_postcheck', 'exact_owner_cleanup'];
export function checkPins(pins) {
  assert.ok(Array.isArray(pins) && pins.length > 0);
  let previous = '';
  const folded = new Set();
  for (const p of pins) {
    assert.deepEqual(Object.keys(p).sort(), ['path', 'sha256', 'size']);
    assert.match(p.path, /^(backend|contracts|scripts|docs)\/[A-Za-z0-9_./@+ -]+$/);
    assert.ok(!p.path.split('/').some(s => ['', '.', '..'].includes(s)));
    assert.ok(p.path > previous, 'Unsorted or duplicate source path'); previous = p.path;
    assert.ok(!folded.has(p.path.toLowerCase()), 'Case-colliding source path'); folded.add(p.path.toLowerCase());
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(p.size) && p.size >= 0);
  }
}
export function sourceDigest(pins) {
  checkPins(pins);
  return hash(pins.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
}
export function changesBetween(before, after) {
  checkPins(before); checkPins(after);
  const a = new Map(before.map(p => [p.path, p])), b = new Map(after.map(p => [p.path, p]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap(name => {
    const oldPin = a.get(name) ?? null, newPin = b.get(name) ?? null;
    if (oldPin && newPin && oldPin.sha256 === newPin.sha256 && oldPin.size === newPin.size) return [];
    return [{path:name, before:oldPin, after:newPin,
      classification:gcPaths.includes(name) ? 'gc_tagged_component' :
        /^(backend|contracts)\//.test(name) ? 'ordinary_or_contract_requires_scope_proof' : 'support_input_requires_scope_proof',
      proof_ids:[]}];
  });
}
export function enumerate(base) {
  const selected = [];
  function walk(rel) {
    for (const entry of fs.readdirSync(path.join(base, rel), {withFileTypes:true})) {
      const name = `${rel}/${entry.name}`, absolute = path.join(base, name);
      assert.equal(fs.lstatSync(absolute).isSymbolicLink(), false, `Redirected source: ${name}`);
      if (entry.isDirectory()) {
        if (!['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(entry.name)) walk(name);
      } else if (entry.isFile() && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)
        && (!name.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(name) || extras.has(name))) selected.push(name);
    }
  }
  for (const top of ['backend','contracts','scripts','docs']) {
    assert.equal(fs.lstatSync(path.join(base, top)).isSymbolicLink(), false); walk(top);
  }
  return selected.sort().map(name => {
    const bytes = fs.readFileSync(path.join(base, name));
    return {path:name,size:bytes.length,sha256:hash(bytes)};
  });
}
const parse = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function artifactPin(name) {
  assert.match(name, /^docs\/evidence\/[a-zA-Z0-9_.-]+$/);
  assert.equal(fs.lstatSync(path.join(root, name)).isSymbolicLink(), false);
  const bytes = fs.readFileSync(path.join(root, name));
  return {path:name,size:bytes.length,sha256:hash(bytes)};
}
function checkGC(files, reviewName) {
  assert.match(reviewName,/^docs\/evidence\/a-gc-tagged-component-reviewed-[0-9]{8}-r[1-9][0-9]*\.json$/);
  const review = parse(path.join(root,reviewName));
  assert.equal(review.kind,'a_gc_tagged_component_scope_review.v1');
  assert.equal(review.status,'reviewed_exact_two_tagged_test_components_only_global_source_NOT_ready');
  assert.equal(review.ordinary_scope_review_complete,false);
  assert.deepEqual(review.changes.map(c=>c.path).sort(),[...gcPaths].sort());
  for (const name of gcPaths) assert.deepEqual(files.find(p=>p.path===name),review.changes.find(c=>c.path===name)?.after,
    'GC bytes differ from exact component review');
}
export function checkTarget(manifest, actual, parentFiles) {
  assert.equal(manifest.kind, 'a_owner_pre_thin_target.v1');
  assert.equal(manifest.status, 'pending_native_scope_review');
  assert.equal(manifest.native_start_authorized, false);
  assert.equal(manifest.current_baseline_ready, false);
  assert.equal(manifest.actual_sql_authorized, false);
  assert.equal(manifest.scope_review, null);
  assert.deepEqual(manifest.post_target_obligations, obligations);
  assert.equal(manifest.source_selection, 'd_local_closeout_snapshot.v1');
  assert.equal(sourceDigest(manifest.target_files), manifest.target_sha256);
  assert.deepEqual(actual, manifest.target_files, 'Target file set/bytes changed');
  assert.deepEqual(manifest.deltas, changesBetween(parentFiles, manifest.target_files), 'Delta inventory/proof state differs');
  assert.deepEqual(manifest.proofs, [], 'Draft target must not claim accepted native coverage');
  return {kind:'a_owner_pre_thin_target_byte_check.v1',status:'exact_target_bytes_only',
    files:actual.length,deltas:manifest.deltas.length,native_start_authorized:false,current_baseline_ready:false};
}
function main() {
  const [mode, input, output, gcReviewOverride] = process.argv.slice(2);
  assert.ok(['--capture','--check-bytes'].includes(mode) && input);
  assert.ok(mode==='--capture' ? [3,4].includes(process.argv.slice(2).length) : process.argv.slice(2).length===2);
  if (mode === '--capture') {
    assert.ok(output); const parentPin = artifactPin(input), parent = parse(path.join(root,input));
    assert.equal(parent.kind, 'd_bootstrap_entry_native.v1');
    const parentFiles = [...parent.files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    checkPins(parentFiles);
    const targetFiles = enumerate(root);
    const gcReview = gcReviewOverride ?? 'docs/evidence/a-gc-tagged-component-reviewed-20261026-r1.json';
    checkGC(targetFiles,gcReview);
    const manifest = {kind:'a_owner_pre_thin_target.v1',status:'pending_native_scope_review',
      source_selection:'d_local_closeout_snapshot.v1',
      snapshotter:artifactPin('docs/evidence/d-local-closeout-snapshot-20261023.mjs'),
      parent_receipt:parentPin,parent_status_observed:parent.status,
      parent_source_sha256:sourceDigest(parentFiles),target_sha256:sourceDigest(targetFiles),target_files:targetFiles,
      deltas:changesBetween(parentFiles,targetFiles),gc_component_review:artifactPin(gcReview),
      proofs:[],scope_review:null,post_target_obligations:obligations,
      native_start_authorized:false,current_baseline_ready:false,actual_sql_authorized:false};
    const result = checkTarget(manifest,enumerate(root),parentFiles);
    // Bind parent/selector/review too; refuse a capture crossing their changes.
    assert.deepEqual(artifactPin(input),parentPin);
    assert.deepEqual(artifactPin(manifest.snapshotter.path),manifest.snapshotter);
    assert.deepEqual(artifactPin(gcReview),manifest.gc_component_review);
    artifactOutput(output,manifest); console.log(JSON.stringify({...result,output}));
  } else {
    const manifest = parse(path.join(root,input));
    for (const pin of [manifest.parent_receipt,manifest.snapshotter,manifest.gc_component_review]) assert.deepEqual(artifactPin(pin.path),pin);
    const parent = parse(path.join(root,manifest.parent_receipt.path));
    assert.equal(parent.kind,'d_bootstrap_entry_native.v1');
    assert.equal(parent.status,manifest.parent_status_observed);
    assert.equal(manifest.snapshotter.path,'docs/evidence/d-local-closeout-snapshot-20261023.mjs');
    checkGC(manifest.target_files,manifest.gc_component_review.path);
    const parentFiles = [...parent.files].sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    assert.equal(sourceDigest(parentFiles),manifest.parent_source_sha256);
    console.log(JSON.stringify(checkTarget(manifest,enumerate(root),parentFiles)));
  }
}
function artifactOutput(name, value) {
  assert.match(name, /^docs\/evidence\/[a-zA-Z0-9_.-]+\.json$/);
  fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
