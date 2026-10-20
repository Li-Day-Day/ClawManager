import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'docs/evidence/d-download-admission-chain-packages-20261019-r13';
const read = p => fs.readFileSync(path.join(root, p));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const source = json(prefix + '-source.json');
const log = read(prefix + '.jsonl').toString('utf8');
const events = log.split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s.replace(/^\uFEFF/, '')));
const native = read(prefix + '-native.txt').toString('utf8');
assert.equal(read(prefix + '-stderr.txt').length, 0);
assert.equal(source.stable_copy_verified, true);
assert.equal(source.dependencies_installed, false);
assert.match(native, /NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/cmd\/server default_vet=yes/);
assert.match(native, /FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native, /CLEANED snapshot=True/);
assert.match(native, /d_admission_native_exit=0/);
assert.equal(events.filter(e => e.Action === 'fail').length, 0);
assert.equal(events.filter(e => e.Action === 'skip').length, 0);
const packages = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence', 'clawreef/cmd/server'].map(pkg => {
  const terminal = events.filter(e => e.Package === pkg && !e.Test && ['pass', 'fail'].includes(e.Action));
  assert.equal(terminal.length, 1, pkg);
  assert.equal(terminal[0].Action, 'pass', pkg);
  const passed = events.filter(e => e.Package === pkg && e.Test && e.Action === 'pass');
  assert.equal(new Set(passed.map(e => e.Test)).size, passed.length, pkg);
  return {package: pkg, main_pass: passed.filter(e => !e.Test.includes('/')).length, all_pass: passed.length, terminal: 'pass', skipped: 0};
});
const testFiles = [
  'backend/internal/systembackupsecurity/sensitive_download_nonce_use_test.go',
  'backend/internal/systembackupevidence/download_admission_transaction_test.go',
  'backend/internal/systembackupevidence/download_admission_environment_test.go',
  'backend/internal/systembackupevidence/download_admission_transaction_a_test.go',
];
const roots = testFiles.flatMap(p => [...read(p).toString('utf8').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(m => m[1]));
for (const name of roots) assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, name);
const focused = events.filter(e => e.Test && e.Action === 'pass' && roots.some(name => e.Test === name || e.Test.startsWith(name + '/')));
assert.equal(hash(Buffer.from(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n')), source.source_sha256);
const drift = [];
for (const pin of source.files) {
  const resolved = path.resolve(root, pin.path);
  assert.ok(resolved.startsWith(root + path.sep));
  if (!fs.existsSync(resolved)) {drift.push({path: pin.path, reason: 'missing'}); continue;}
  const bytes = fs.readFileSync(resolved);
  if (bytes.length !== pin.size || hash(bytes) !== pin.sha256) drift.push({path: pin.path, reason: 'changed'});
}
const include = p => (!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || [
  'docs/system-backup-restore-schema-inventory.json', 'docs/evidence/a-config-canonical-request-vectors-20261014.json',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
  'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
].includes(p)) && !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p)
  && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p);
const listingPath = 'docs/evidence/d-download-admission-chain-current-files-20261019-r13.txt';
const listed = read(listingPath).toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(p => p.replaceAll('\\', '/')).filter(include);
const frozenPaths = new Set(source.files.map(f => f.path));
const listedPaths = new Set(listed);
for (const p of listedPaths) if (!frozenPaths.has(p)) drift.push({path: p, reason: 'new'});
for (const p of frozenPaths) if (!listedPaths.has(p)) drift.push({path: p, reason: 'unlisted'});
const owner = native.match(/owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase());
assert.equal(fs.existsSync(owner), false);
const cache = path.join(root, '.tmp-d-admission-20261019-chain');
assert.equal(fs.existsSync(cache), false, 'the terminal test cache must be cleaned');
const failures = ['chain-smoke-20261019-r6', 'chain-focused-20261019-r7', 'pinned-focused-20261019-r9', 'pinned-focused-20261019-r10', 'pinned-smoke-20261019-r11'].map(name => {
  const p = `docs/evidence/d-download-admission-${name}.jsonl`;
  const raw = read(p);
  const failed = raw.toString('utf8').split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s.replace(/^\uFEFF/, ''))).filter(e => e.Action === 'fail');
  assert.ok(failed.length > 0, p);
  return {path: p, sha256: hash(raw), failed_test_or_package_events: failed.length, accepted_as_pass: false};
});
const result = {
  kind: 'd_download_admission_chain_frozen_native_review', source_files: source.files.length, source_sha256: source.source_sha256,
  capture_attempts: source.capture_attempts, capture_failures: source.capture_failures,
  log_sha256: hash(read(prefix + '.jsonl')), native_sha256: hash(read(prefix + '-native.txt')), listing_sha256: hash(read(listingPath)),
  packages, main_pass: packages.reduce((n, p) => n + p.main_pass, 0), all_pass: packages.reduce((n, p) => n + p.all_pass, 0),
  transaction_and_environment_roots: roots, transaction_and_environment_all_pass: focused.length,
  current_source_drift: drift, current_frozen_source_matches: drift.length === 0,
  cleanup: [{path: owner, exists: false}, {path: cache, exists: false}], preserved_failed_runs: failures,
  installed_dependencies: false, actual_mysql: false, transaction_composition_implemented: true, full_admission_complete: false,
  http_runtime_wired: false, production_enabled: false, formal_schema_approval: false,
  limitations: 'Complete three-package native tests, real crypto/session/RBAC/file/capacity code over scripted SQL and synthetic owner/material/capacity facts. Does not prove InnoDB concurrency/FK/grants, physical capacity, reviewed owner adapter, HTTP/postcommit provider path, real deployment, historical upgrade or the six original scopes.'
};
fs.writeFileSync(path.join(root, 'docs/evidence/d-download-admission-chain-review-20261019-r13.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({main_pass: result.main_pass, all_pass: result.all_pass, source_files: result.source_files, increment_roots: roots.length, increment_all_pass: focused.length, current_source_drift: drift, cleaned_directories: result.cleanup.length}));
