import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Mechanical intake of native logs; this is not an independent human/security
// sign-off. It never installs, runs Go, touches SQL/providers, or grants access.
const [mode, receiptPath, compileReceiptPath] = process.argv.slice(2);
assert.ok(['--write', '--check'].includes(mode) && receiptPath,
  'node docs/evidence/a-api-readiness-review-20261026.mjs --write|--check docs/evidence/a-api-readiness-native-<id>.json [docs/evidence/a-api-linux-native-<id>.json]');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(p);
const json = p => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/, ''));
const pin = p => { const b = read(p); return { path:p.replaceAll('\\','/'), size:b.length, sha256:sha(b) }; };
const receipt = json(receiptPath);
assert.match(receipt.id, /^[a-f0-9]{32}$/);
assert.equal(receipt.kind, 'a_api_readiness_native.v1');
let compile;
if (compileReceiptPath) {
  compile = json(compileReceiptPath);
  assert.equal(compile.kind, 'a_api_linux_supplement.v1');
  assert.equal(compile.status, 'passed_for_exact_native_test_bytes');
  assert.equal(compile.native_receipt.sha256, pin(receiptPath).sha256);
  assert.equal(compile.cleanup, true);
  assert.equal(compile.dependencies_installed, false);
  assert.equal(compile.actual_sql, false);
  assert.equal(compile.production_authorized, false);
  assert.equal(compile.source_unchanged, true);
  assert.equal(compile.linux_compile_vet, false);
  assert.equal(fs.existsSync(`.tmp-a-api-linux-${compile.id}`), false);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.failure, 'Go phase failed: linux_systembackupsecurity');
  assert.match(read(receiptPath.replace(/\.json$/, '.linux_systembackupsecurity.jsonl')).toString('utf8'),
    /There is not enough space on the disk/);
  assert.equal(compile.native_tests_reused_only_for_identical_bytes, true);
  const nativePins = new Map(receipt.files.map(x => [x.path,x]));
  const buildPins = new Map(compile.files.map(x => [x.path,x]));
  assert.ok(compile.tested_dependency_files.length > 100);
  for (const dep of compile.tested_dependency_files) {
    assert.deepEqual(dep, nativePins.get(dep.path), `Untested dependency ${dep.path}`);
    assert.deepEqual(dep, buildPins.get(dep.path), `Build copied different dependency ${dep.path}`);
  }
  for (const pkg of ['systembackupsecurity','systembackupbootstrapmaterials','systembackupcatrust','systembackupnoncebootstrap'])
    assert.ok(compile.dependency_directories.includes(`backend/internal/${pkg}`));
} else assert.equal(receipt.status, 'passed_for_exact_snapshot');
assert.equal(receipt.tests_started, true);
assert.equal(receipt.dependencies_installed, false);
assert.equal(receipt.actual_sql, false);
assert.equal(receipt.production_authorized, false);
assert.equal(receipt.cleanup, true);
assert.equal(fs.existsSync(`.tmp-a-api-readiness-${receipt.id}`), false);
assert.ok(receipt.files.length > 100);
assert.equal(new Set(receipt.files.map(x => x.path)).size, receipt.files.length);
const requiredFiles = [
  'backend/internal/systembackupsecurity/action_scope.go',
  'backend/internal/systembackupsecurity/action_scope_test.go',
  'backend/internal/systembackupsecurity/read_scope.go',
  'backend/internal/systembackupbootstrapmaterials/materials.go',
  'backend/internal/systembackupbootstrapmaterials/materials_test.go',
  'backend/internal/systembackupbootstrapmaterials/inputs.go',
  'backend/internal/systembackupcatrust/inputs.go',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
];
for (const file of requiredFiles) assert.ok(receipt.files.some(x => x.path === file), `Missing frozen input ${file}`);
const drift = [];
for (const original of receipt.files) {
  assert.ok(!path.isAbsolute(original.path) && !original.path.split('/').includes('..'));
  if (!fs.existsSync(original.path) || pin(original.path).sha256 !== original.sha256) drift.push(original.path);
}
const expected = {
  targeted: ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupbootstrapmaterials',
    'clawreef/internal/systembackupcatrust', 'clawreef/internal/systembackupnoncebootstrap',
    'clawreef/internal/systembackupproducer', 'clawreef/cmd/system-backup-bootstrap'],
  full: ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupbootstrapsecurity',
    'clawreef/internal/systembackupbootstrapmaterials', 'clawreef/internal/systembackupcatrust',
    'clawreef/internal/systembackupnoncebootstrap'],
};
const requiredRoots = [
  'TestSystemBackupActionScopePolicyAndSession', 'TestSystemBackupActionScopeBoundaries',
  'TestSystemBackupActionScopeTransportClosed', 'TestSystemBackupActionPolicyMatchesContract',
  'TestSystemBackupReadScopeRechecksSessionAndConfig',
  'TestMaterialsPreserveOriginalAuthorityAndFinalChecks', 'TestMaterialsCompositionAndInputInspectionClosed',
];
const stages = {};
for (const phase of ['targeted', 'full']) {
  assert.equal(receipt[`${phase}_exit`], 0);
  const log = receiptPath.replace(/\.json$/, `.${phase}.jsonl`);
  const events = read(log).toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.filter(e => ['fail', 'build-fail', 'skip'].includes(e.Action)).length, 0);
  const packages = events.filter(e => e.Action === 'pass' && !e.Test).map(e => e.Package).sort();
  assert.deepEqual(packages, [...expected[phase]].sort());
  const roots = events.filter(e => e.Action === 'pass' && e.Test && !e.Test.includes('/'));
  for (const root of requiredRoots) assert.equal(roots.filter(e => e.Test === root).length, 1, `${phase}: missing exact root ${root}`);
  for (const event of events.filter(e => e.Action === 'run'))
    assert.equal(events.filter(e => e.Action === 'pass' && e.Test === event.Test && e.Package === event.Package).length, 1, `No unique completion ${event.Test}`);
  assert.deepEqual([...receipt[`${phase}_passed_roots`]].sort(), roots.map(e => `${e.Package}::${e.Test}`).sort());
  stages[phase] = {log:pin(log), packages, roots:roots.length, passed_events:events.filter(e => e.Action === 'pass' && e.Test).length};
}
const binaries = [...(compile ?? receipt).linux_binaries].sort((a,b) => a.package.localeCompare(b.package));
assert.deepEqual(binaries.map(x => x.package), ['systembackupbootstrapmaterials','systembackupcatrust','systembackupnoncebootstrap','systembackupsecurity']);
for (const binary of binaries) {
  assert.equal(compile ? compile[`${binary.package}_exit`] : receipt[`linux_${binary.package}_exit`], 0);
  if (compile) assert.equal(binary.format,'ELF');
  assert.ok(binary.size > 1000); assert.match(binary.sha256,/^[a-f0-9]{64}$/);
}
const result = {
  kind:'a_api_readiness_mechanical_review.v1', status:'exact_snapshot_verified',
  native_receipt:pin(receiptPath), source_files:receipt.files.length,
  current_source_matches_all_recorded_bytes:drift.length === 0,
  current_drift:drift, source_unchanged_at_runner_finish:receipt.source_unchanged ?? null,
  stages, linux_binaries:binaries,
  ...(compile ? {compile_supplement:pin(compileReceiptPath),
    // PowerShell Tee-Object creates no output file when compilation is silent.
    // Keep that absence explicit; do not synthesize a successful compiler log.
    compile_logs:binaries.map(x => {
      const p = compileReceiptPath.replace(/\.json$/, `.${x.package}.txt`);
      return fs.existsSync(p) ? pin(p) : {path:p, output_file_present:false};
    }),
    linux_compile_vet:false,
    tested_dependency_files:compile.tested_dependency_files.length,
    current_tested_dependencies_match:compile.tested_dependency_files.every(x => fs.existsSync(x.path) && pin(x.path).sha256 === x.sha256),
    compilation_dependency_source_unchanged:compile.source_unchanged,
    uncovered_changed_paths:compile.uncovered_changed_paths,
    uncovered_added_paths:compile.uncovered_added_paths} : {}),
  cleanup_verified:true, actual_sql:false,
  production_authorized:false, independent_security_reviewer_signed:false,
};
const output = receiptPath.replace(/\.json$/, '.reviewed.json');
if (mode === '--write') fs.writeFileSync(output, JSON.stringify(result,null,2)+'\n');
else assert.deepEqual(json(output), result);
console.log(JSON.stringify({status:result.status, current_source_matches:result.current_source_matches_all_recorded_bytes,
  targeted_roots:stages.targeted.roots, full_roots:stages.full.roots, output}));
