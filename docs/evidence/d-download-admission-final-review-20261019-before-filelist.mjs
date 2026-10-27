import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(path.join(root, p));
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const logPath = 'docs/evidence/d-download-admission-packages-20261019-r5.jsonl';
const sourcePath = 'docs/evidence/d-download-admission-packages-20261019-r5-source.json';
const nativePath = 'docs/evidence/d-download-admission-packages-20261019-r5-native.txt';
const source = json(sourcePath);
const events = read(logPath).toString('utf8').split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s.replace(/^\uFEFF/, '')));
const native = read(nativePath).toString('utf8');
assert.match(native, /NATIVE_EXIT full_two_packages=0/);
assert.match(native, /FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native, /CLEANED snapshot=True/);
assert.match(native, /d_admission_native_exit=0/);
assert.equal(events.filter(e => e.Action === 'fail').length, 0);
const packages = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence'].map(pkg => {
  const outcomes = events.filter(e => e.Package === pkg && !e.Test && ['pass', 'fail'].includes(e.Action));
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].Action, 'pass');
  const passed = events.filter(e => e.Package === pkg && e.Test && e.Action === 'pass');
  assert.equal(new Set(passed.map(e => e.Test)).size, passed.length);
  return { package: pkg, main_pass: passed.filter(e => !e.Test.includes('/')).length, all_pass: passed.length,
    skips: events.filter(e => e.Package === pkg && e.Test && e.Action === 'skip').length, terminal: 'pass' };
});

const newFiles = [
  'backend/internal/systembackupsecurity/sensitive_download_nonce_scope_test.go',
  'backend/internal/systembackupsecurity/sensitive_download_verification_identity_test.go',
  'backend/internal/systembackupevidence/download_admission_keys_test.go',
  'backend/internal/systembackupevidence/download_admission_records_test.go',
];
const expectedRoots = newFiles.flatMap(p => [...read(p).toString('utf8').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(m => m[1]));
expectedRoots.push('TestDProducerPendingAfterSlowLocalSetup');
assert.equal(expectedRoots.length, 12);
for (const name of expectedRoots) assert.equal(events.filter(e => e.Test === name && e.Action === 'pass').length, 1, name);
const focused = events.filter(e => e.Test && e.Action === 'pass' && expectedRoots.some(name => e.Test === name || e.Test.startsWith(name + '/')));

assert.equal(digest(Buffer.from(source.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n')), source.source_sha256);
const currentDrift = [];
for (const pin of source.files) {
  const resolved = path.resolve(root, pin.path);
  assert.ok(resolved.startsWith(root + path.sep));
  if (!fs.existsSync(resolved)) { currentDrift.push({ path: pin.path, reason: 'missing' }); continue; }
  const bytes = fs.readFileSync(resolved);
  if (digest(bytes) !== pin.sha256 || bytes.length !== pin.size) currentDrift.push({ path: pin.path, reason: 'changed' });
}
// Same inclusion boundary as the snapshot helper, including new runtime files.
const include = p => (!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || [
  'docs/system-backup-restore-schema-inventory.json', 'docs/evidence/a-config-canonical-request-vectors-20261014.json',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
  'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
].includes(p)) && !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p)
  && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p);
const listed = execFileSync('rg', ['--files', '--hidden', 'backend', 'contracts', 'scripts', 'docs'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).map(p => p.replaceAll('\\', '/')).filter(include);
const frozenPaths = new Set(source.files.map(p => p.path));
for (const p of listed) if (!frozenPaths.has(p)) currentDrift.push({ path: p, reason: 'new' });
const listedSet = new Set(listed);
for (const p of frozenPaths) if (!listedSet.has(p)) currentDrift.push({ path: p, reason: 'unlisted' });

const ownerLogs = [
  'docs/evidence/d-download-admission-native-20261019-r1.txt',
  'docs/evidence/d-download-admission-native-20261019-r2.txt',
  'docs/evidence/d-download-admission-native-20261019-r4.txt', nativePath,
];
const cleanup = [];
for (const p of ownerLogs) {
  const text = read(p).toString('utf8');
  assert.match(text, /CLEANED snapshot=True/);
  const owner = text.match(/owner=([^\r\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
  assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase());
  assert.equal(fs.existsSync(owner), false);
  cleanup.push({ path: owner, exists: false });
}
const cacheOwner = path.join(root, '.tmp-d-admission-20261019-nonce');
assert.equal(fs.existsSync(cacheOwner), false, 'owned compiler cache must be cleaned after the terminal run');
cleanup.push({ path: cacheOwner, exists: false });

const schemaPath = 'docs/evidence/d-download-admission-schema-review-20261019-r2.json';
const schema = json(schemaPath);
assert.equal(schema.checks.length, 12);
assert.ok(schema.checks.every(c => c.pass));
assert.equal(schema.actual_mysql, false);
assert.equal(schema.files.at(-1).sha256, digest(read('docs/system-backup-d-download-admission-schema-proposal-20261019.sql')));
const failure = json('docs/evidence/d-download-admission-packages-review-20261019-r1.json');
assert.equal(failure.native_exit, 1);
assert.ok(failure.failures.some(f => f.test === 'TestDProducerActualAAdaptersAtomicFailures/result/insert:system_backup_producer_result_receipts'));

const result = { kind: 'd_download_admission_final_native_review', source_files: source.files.length,
  source_sha256: source.source_sha256, capture_attempts: source.capture_attempts, capture_failures: source.capture_failures,
  log_sha256: digest(read(logPath)), native_sha256: digest(read(nativePath)), packages,
  main_pass: packages.reduce((n, p) => n + p.main_pass, 0), all_pass: packages.reduce((n, p) => n + p.all_pass, 0),
  new_and_fixture_roots: expectedRoots, new_and_fixture_all_pass: focused.length,
  current_source_drift: currentDrift, current_frozen_source_matches: currentDrift.length === 0,
  schema_static_checks: 12, cleanup, installed_dependencies: false, actual_mysql: false,
  full_admission_complete: false, production_enabled: false, formal_schema_approval: false,
  limitations: 'Native model/crypto/storage tests and exact frozen-source checks; no real MySQL, complete prelocked authorization/capacity, claim CAS/nonce/commit integration, current server gate or original six-scope completion.' };
fs.writeFileSync(path.join(root, 'docs/evidence/d-download-admission-final-review-20261019-r5.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ main_pass: result.main_pass, all_pass: result.all_pass, source_files: result.source_files,
  new_and_fixture_roots: expectedRoots.length, new_and_fixture_all_pass: focused.length,
  current_source_drift: currentDrift, cleanup: cleanup.length }));
