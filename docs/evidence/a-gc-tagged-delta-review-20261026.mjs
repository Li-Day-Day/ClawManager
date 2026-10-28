import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Read-only source-scope review by default. Receives rg's CURRENT path list on
// stdin. It never edits a live snapshot, runs Go/SQL or authorizes production.
const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
assert.ok((args.length === 2 || args.length === 3) && args[0] === '--parent-source' && (!args[2] || ['--write', '--check'].includes(args[2])));
const parent = path.resolve(root, args[1]), owner = path.dirname(parent);
assert.equal(path.dirname(owner).toLowerCase(), root.toLowerCase());
const id = path.basename(owner).match(/^\.tmp-d-bootstrap-entry-([a-f0-9]{32})$/)?.[1];
assert.ok(id);
assert.equal(path.basename(parent), 'source');
for (const name of [owner, parent]) assert.equal(fs.lstatSync(name).isSymbolicLink(), false);
assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
const paths = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '')).map(name => name.replaceAll('\\', '/'));
assert.ok(paths.length > 0);
assert.equal(new Set(paths).size, paths.length);
for (const name of paths) assert.ok(/^(backend|contracts)\//.test(name) && !name.split('/').some(part => ['', '.', '..'].includes(part)));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function pin(base, name) {
  const file = path.join(base, name);
  assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
  const bytes = fs.readFileSync(file);
  return {path: name, size: bytes.length, sha256: sha(bytes)};
}
function enumerate(base, name) {
  const directory = path.join(base, name);
  assert.equal(fs.lstatSync(directory).isSymbolicLink(), false);
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(item => {
    assert.equal(item.isSymbolicLink(), false);
    const next = name + '/' + item.name;
    return item.isDirectory() ? enumerate(base, next) : [next];
  });
}
const frozen = ['backend', 'contracts'].flatMap(name => enumerate(parent, name)).map(name => pin(parent, name));
const current = paths.map(name => pin(root, name));
const oldMap = new Map(frozen.map(item => [item.path, item]));
const newMap = new Map(current.map(item => [item.path, item]));
const expected = new Map([
  ['backend/internal/systembackupevidence/download_gc_full_collect_mysql_test.go', 'e9806c4892ac770ae2f3cf97e9bcb6ba2f123d125b6d5a00d9533e055d9bdf09'],
  ['backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go', '4fede77d8318d37f5955e866d4e81dcd2371e79b7512e6eda3288744fee365cd'],
]);
const changes = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort().filter(name => oldMap.get(name)?.sha256 !== newMap.get(name)?.sha256 || oldMap.get(name)?.size !== newMap.get(name)?.size).map(name => ({path: name, before: oldMap.get(name) ?? null, after: newMap.get(name) ?? null}));
assert.deepEqual(changes.map(item => item.path), [...expected.keys()].sort(), 'Additional backend/contract drift is outside this scope');
for (const change of changes) {
  assert.equal(change.after?.sha256, expected.get(change.path));
  assert.ok(change.path.endsWith('_mysql_test.go'));
  const source = fs.readFileSync(path.join(root, change.path), 'utf8');
  assert.match(source, /^\/\/go:build systembackup_mysql\r?\n/);
  assert.doesNotMatch(source, /^func init\(/m);
  assert.doesNotMatch(source, /^\/\/go:linkname\b/m);
  assert.doesNotMatch(source, /^\s*"unsafe"\s*$/m);
}
assert.ok(changes[0].before, 'Cold source is an exact modification');
assert.equal(changes[1].before, null, 'Lifecycle source must be a new tagged test');
const cold = fs.readFileSync(path.join(root, changes[0].path), 'utf8');
assert.match(cold, /p\.schema\[name\] == ""/);
assert.match(cold, /dGCColdSchemaPin\(ddl\) == ""/);
assert.match(cold, /schema\[name\] = dGCColdSchemaPin\(ddl\)/);
const frame = items => sha(Buffer.from([...items].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(item => item.path + '\0' + item.sha256 + '\0' + item.size).join('\n') + '\n'));
const result = {kind: 'a_gc_exact_tagged_delta_scope_review.v1', status: 'reviewed_exact_test_only_delta_for_narrow_local_validation_not_execution_acceptance', parent_entry_id: id, parent_backend_contracts_files: frozen.length, parent_backend_contracts_sha256: frame(frozen), current_backend_contracts_files: current.length, current_backend_contracts_sha256: frame(current), frame_algorithm: 'sha256-path-sha256-bytecount-newline-ordinal-v1', changes, ordinary_backend_contracts_unchanged: true, arbitrary_tagged_deltas_allowed: false, allowed_local_seed_roots: ['TestDDownloadGCFullCollectMySQLSeed', 'TestDDownloadGCFullLifecycleMySQLSeed'], current_Linux_tagged_evidence_recompile_required: true, parent_passed_full10_postcheck_cleanup_required_before_Go: true, original_owner_thin_obligations_preserved: true, cold_scope: 'Only synthetic policy SHOW CREATE hash calls and empty-pin rejection; production Full/Early schema algorithms unchanged', lifecycle_scope: 'New fifteen-case tagged SQL fixture and local normalizer seed; no init/linkname/unsafe or ordinary runtime changes', source_review_limit: 'Dependency scope for local compilation/seeds only; full functional case and remote result review remain mandatory', actual_Go_run_by_this_review: false, actual_SQL: false, complete_domain_authority: false, production_approved: false, current_owner_baseline_ready: false, goal_complete: false};
const output = path.join(root, 'docs/evidence/a-gc-tagged-delta-reviewed-20261026-r1.json');
if (args[2] === '--write') fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
if (args[2] === '--check') assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), result);
process.stdout.write(JSON.stringify({status: result.status, changes: changes.map(item => item.path), ordinary_backend_contracts_unchanged: true, actual_Go_SQL_run: false, current_owner_baseline_ready: false}) + '\n');
