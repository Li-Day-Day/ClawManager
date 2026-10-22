// Read frozen validation results only. No tests, builds, SQL or cleanup.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace, decode, sha256} from './a-download-owners-actual-review-20261020.mjs';
const raw = p => fs.readFileSync(path.join(workspace, p));
const json = p => JSON.parse(decode(raw(p)));
const events = p => decode(raw(p)).trim().split('\n').filter(Boolean).map(JSON.parse);
const full = 'docs/evidence/a-gc-journal-20261021-r1-full', focused = 'docs/evidence/a-gc-journal-20261021-r1-focused';
const base = 'docs/evidence/d-download-gc-producer-20261021-r5';
const packages = ['systembackupsecurity', 'systembackupevidence', 'systembackupread', 'systembackupproducer'].map(p => 'clawreef/internal/' + p);
function exact(a, b) {assert.equal(new Set(a).size, a.length); assert.deepEqual(a.slice().sort(), b.slice().sort());}
function source(p) {
  const s = json(p + '-source.json');
  assert.equal(s.stable_copy_verified, true); assert.equal(s.dependencies_installed, false); assert.equal(s.production_approved, false);
  assert.equal(new Set(s.files.map(f => f.path)).size, s.files.length);
  for (const f of s.files) {assert.match(f.path, /^(backend|contracts|scripts|docs)\//); assert.ok(!f.path.includes('\\') && !f.path.split('/').some(n => ['', '.', '..'].includes(n))); assert.match(f.sha256, /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(f.size) && f.size >= 0);}
  assert.equal(sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n'), s.source_sha256);
  return s;
}
function inventory(p, terminalPackages) {
  const es = events(p);
  assert.ok(!es.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)));
  exact(es.filter(e => e.Test && e.Action === 'run').map(e => `${e.Package}\0${e.Test}`), es.filter(e => e.Test && e.Action === 'pass').map(e => `${e.Package}\0${e.Test}`));
  exact(es.filter(e => !e.Test && e.Action === 'pass').map(e => e.Package), terminalPackages);
  return es.filter(e => e.Test && e.Action === 'pass');
}
function native(p, s) {
  const text = decode(raw(p + '-native.txt'));
  for (const marker of ['default_vet=yes', 'FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no', 'FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no', 'CLEANED snapshot=True', 'PowerShell transcript end', 'End time:']) assert.ok(text.includes(marker), marker);
  assert.deepEqual([...text.matchAll(/^d_admission_native_exit=(-?\d+)$/gm)].map(m => m[1]), ['0']);
  assert.equal(raw(p + '-stderr.txt').length, 0); assert.ok(!/^RUN namespace=/m.test(text));
  const owners = [...text.matchAll(/^FROZEN files=(\d+) sha256=([a-f0-9]{64}) owner=(.+)$/gm)]; assert.equal(owners.length, 1);
  assert.equal(Number(owners[0][1]), s.files.length); assert.equal(owners[0][2], s.source_sha256);
  const owner = owners[0][3].trim(); assert.equal(path.dirname(path.resolve(owner)).toLowerCase(), workspace.toLowerCase()); assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/); assert.equal(fs.existsSync(owner), false);
  return {text, owner, source_manifest_sha256: sha256(raw(p + '-source.json')), events_sha256: sha256(raw(p + '.jsonl')), native_sha256: sha256(raw(p + '-native.txt'))};
}
const s = source(full), f = source(focused), old = source(base);
const ns = native(full, s), nf = native(focused, f);
assert.match(ns.text, /NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/internal\/systembackupproducer default_vet=yes/);
assert.match(nf.text, /NATIVE_EXIT focused_packages=0/);
const passed = inventory(full + '.jsonl', packages), previous = inventory(base + '.jsonl', packages), targeted = inventory(focused + '.jsonl', [packages[1]]);
const oldNames = new Set(previous.map(e => `${e.Package}\0${e.Test}`)), names = new Set(passed.map(e => `${e.Package}\0${e.Test}`));
assert.equal(oldNames.size, 6242); assert.ok([...oldNames].every(n => names.has(n)));
const added = passed.filter(e => !oldNames.has(`${e.Package}\0${e.Test}`));
assert.equal(added.length, 28); assert.equal(added.filter(e => !e.Test.includes('/')).length, 5); assert.ok(added.every(e => e.Test.startsWith('TestJournaledGC') && e.Package === packages[1]));
assert.equal(passed.length, 6270); assert.equal(passed.filter(e => !e.Test.includes('/')).length, 759);
assert.equal(targeted.length, 152); assert.equal(targeted.filter(e => !e.Test.includes('/')).length, 19); assert.ok(targeted.every(e => names.has(`${e.Package}\0${e.Test}`)));
const two = passed.filter(e => packages.slice(0, 2).includes(e.Package)); assert.equal(two.length, 4967); assert.equal(two.filter(e => !e.Test.includes('/')).length, 609);
const changed = (current, original) => {const pins = new Map(original.files.map(p => [p.path, p])); return current.files.filter(p => pins.get(p.path)?.sha256 !== p.sha256 || pins.get(p.path)?.size !== p.size).map(p => p.path);};
exact(changed(s, old).filter(p => /^(backend|contracts)\//.test(p)), ['gc_runtime.go', 'gc_runtime_journal.go', 'gc_runtime_journal_test.go', 'gc_authority.go', 'gc_registry.go', 'system_recovery_audit_journal.go'].map(n => 'backend/internal/systembackupevidence/' + n));
assert.ok(old.files.every(p => s.files.some(f => f.path === p.path)));
// The final source adds a post-token journal check after the focused freeze;
// all original and new tests are rerun in the final complete four-package run.
exact(changed(s, f), ['backend/internal/systembackupevidence/gc_authority.go']);
for (const pin of s.files) {const b = raw(pin.path); assert.equal(b.length, pin.size, pin.path); assert.equal(sha256(b), pin.sha256, pin.path);}
const stages = ['tagged-seed', 'windows-probe', 'detached-seed', 'linux-probe', 'linux-migration'].map(stage => {
  assert.ok(ns.text.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`)); assert.equal(raw(full + '-' + stage + '-stderr.txt').length, 0);
  return {stage, output_sha256: sha256(raw(full + '-' + stage + '.txt')), stderr_sha256: sha256(raw(full + '-' + stage + '-stderr.txt'))};
});
const seeds = inventory(full + '-tagged-seed.txt', [packages[1]]).map(e => e.Test); assert.equal(seeds.length, 22);
exact(seeds, inventory(base + '-tagged-seed.txt', [packages[1]]).map(e => e.Test));
const detached = decode(raw(full + '-detached-seed.txt')); exact([...detached.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]), seeds); exact([...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]), seeds); assert.match(detached, /\nPASS\s*$/); assert.ok(!/--- (?:FAIL|SKIP):|panic:/.test(detached));
const binaries = [...ns.text.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m => ({name: m[1], sha256: m[2]})); exact(binaries.map(b => b.name), ['download-admission.test.exe', 'download-admission.test', 'system-backup-migrate']);
const cleanupPath = 'docs/evidence/a-gc-journal-cleanup-20261021-r1.json', cleanup = json(cleanupPath);
assert.equal(cleanup.validation_exit, 0); assert.equal(cleanup.dependencies_installed, false); assert.equal(cleanup.remote_executed, false); assert.equal(cleanup.exists, false);
assert.equal(path.resolve(cleanup.path), path.join(workspace, '.tmp-d-admission-a-gc-journal-20261021-r1')); assert.equal(fs.existsSync(cleanup.path), false);
const baselineProof = 'docs/evidence/a-download-gc-producer-independent-accepted-20261021.json'; assert.equal(sha256(raw(baselineProof)), '481843dc264ea3d7bd5d8a1534168b58e0c17ee08fe57a13d62789f25bb827c8');
const record = {kind: 'a_gc_durable_failure_journal_local_acceptance', recorded_at: new Date().toISOString(), status: 'accepted_frozen_local_runtime_and_models_only',
  source: full + '-source.json', source_files: s.files.length, source_sha256: s.source_sha256, ...Object.fromEntries(Object.entries(ns).filter(([k]) => !['text', 'owner'].includes(k))),
  events: full + '.jsonl', native: full + '-native.txt', focused: {prefix: focused, main: 19, all: 152, source_sha256: f.source_sha256, ...Object.fromEntries(Object.entries(nf).filter(([k]) => !['text', 'owner'].includes(k))), superseded_input: 'gc_authority.go post-token check, covered by final full run'},
  full: {main: 759, all: 6270}, owner_baseline: {main: 609, all: 4967}, previous_full_tests_retained: 6242, previous_owner_tests_retained: 4939, new_tests: {main: 5, all: 28, names: added.map(e => e.Test).sort()}, changed_backend_contract_inputs: changed(s, old).filter(p => /^(backend|contracts)\//.test(p)),
  default_vet: true, native_exit: 0, final_postcheck: true, probe_stages: stages, binaries, cleanup: cleanupPath, cleanup_sha256: sha256(raw(cleanupPath)), owned_directories_independently_absent: [nf.owner, ns.owner, cleanup.path],
  current_frozen_bytes_match: true, current_whole_worktree_verified: false, actual_sql: false, actual_provider: false, durable_volume_verified: false, full_gc_policy_approved: false, production_approved: false, dependencies_installed: false,
  reviewer_sha256: sha256(raw('docs/evidence/a-gc-journal-review-20261021.mjs'))};
const output = path.join(workspace, 'docs/evidence/a-gc-journal-accepted-20261021-r1.json');
if (process.argv[2] === '--check') {const saved = JSON.parse(fs.readFileSync(output, 'utf8')); record.recorded_at = saved.recorded_at; assert.deepEqual(record, saved);}
else {assert.deepEqual(process.argv.slice(2), ['--write']); fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});}
console.log(JSON.stringify({status: record.status, full: record.full, added: 28, owner_checks: 4967, cleaned_owned_directories: 3}));
