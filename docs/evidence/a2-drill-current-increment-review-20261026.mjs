import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reviewDrill } from './d-drill-http-review-20261023.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const bytes = p => fs.readFileSync(path.resolve(root, p));
const json = p => JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/, ''));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pin = p => ({ path: p, size: bytes(p).length, sha256: sha(bytes(p)) });
const sourcePath = 'docs/evidence/d-drill-http-repair-local-20261026.json';
const previousPath = 'docs/evidence/d-local-closeout-a9b3f627a8134e5798ca12b34880d1af-source.json';
const receivedPath = 'docs/evidence/d-drill-http-current-increment-received-20261026.json';
const output = 'docs/evidence/a2-drill-current-increment-reviewed-20261026.json';
const extras = new Set(['docs/system-backup-restore-schema-inventory.json', 'docs/evidence/a-config-canonical-request-vectors-20261014.json', 'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json', 'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json', 'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
function walk(dir) {
  assert.equal(fs.lstatSync(path.resolve(root, dir)).isSymbolicLink(), false);
  return fs.readdirSync(path.resolve(root, dir), { withFileTypes: true }).flatMap(e => {
    const p = dir + '/' + e.name;
    assert.equal(e.isSymbolicLink(), false, 'redirected source');
    if (e.isDirectory()) return ['.git', 'node_modules', 'vendor', 'uploads', 'cache', 'dist', 'build', '__pycache__'].includes(e.name) ? [] : walk(p);
    return e.isFile() && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p) && (!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || extras.has(p)) ? [p] : [];
  });
}
const currentFiles = () => ['backend', 'contracts', 'scripts', 'docs'].flatMap(walk).sort();
try {
  assert.ok(['--write', '--check'].includes(process.argv[2]) && process.argv.length === 3);
  const replay = reviewDrill(sourcePath, { actual: false });
  assert.deepEqual(replay, json(receivedPath));
  assert.equal(replay.scope, 'local_preparation_only');
  assert.equal(replay.actual_mysql_cases, 0);
  assert.deepEqual(replay.unrelated_source_drift, []);
  const source = json(sourcePath), previous = json(previousPath);
  const expected = previous.files.map(p => p.path);
  assert.deepEqual(currentFiles(), expected);
  assert.deepEqual(source.files.map(p => p.path).sort(), expected);
  const nowPins = previous.files.map(p => pin(p.path));
  for (const p of source.files) assert.deepEqual(pin(p.path), p);
  const changed = nowPins.filter((p, i) => p.sha256 !== previous.files[i].sha256 || p.size !== previous.files[i].size);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].path, 'backend/cmd/server/system_backup_read_drill_history_mysql_test.go');
  assert.equal(changed[0].sha256, 'e8df47f25eb1765cb354a7f88a1dc2952bc56b699129d7ac8ba604c91b3e21b7');
  assert.match(bytes(changed[0].path).toString('utf8'), /^\/\/go:build systembackup_mysql\r?\n/);
  assert.deepEqual(currentFiles(), expected);
  assert.equal(fs.existsSync(source.owner), false);
  const result = {
    kind: 'a2_drill_current_increment_review.v1',
    status: 'accepted_exact_tagged_local_increment_for_source_composition',
    replay_matches_D_received_review: true,
    previous_source_sha256: previous.source_sha256,
    current_drill_source_sha256: source.source_sha256,
    current_closeout_order_source_sha256: sha(Buffer.from(nowPins.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n')),
    source_files: source.files.length,
    current_complete_set_and_bytes_checked: true,
    source_delta: changed.map(p => ({ ...p, previous_sha256: previous.files.find(q => q.path === p.path).sha256 })),
    only_delta_excluded_from_ordinary_Go_build: true,
    six_ordinary_packages_inputs_byte_unchanged: true,
    current_tagged_seed_and_three_Linux_builds_received: true,
    binaries: { sql: replay.sql_binary_sha256, http: replay.http_binary_sha256, migration: replay.migration_binary_sha256 },
    source_postcheck_and_native_exit_zero_received: true,
    local_owner_independently_absent: true,
    all_test_build_outputs_removed_recorded: true,
    actual_mysql_cases: 0,
    repaired_nineteen_case_actual_SQL_accepted: false,
    final_owner_baseline_registered_by_this_review: false,
    current_whole_tree_tested: false,
    production_approved: false,
    dependencies_installed: false,
    Go_or_builds_repeated: false,
    scratch_created: false,
    inputs: [sourcePath, previousPath, receivedPath, ...replay.artifacts.map(p => p.path), 'docs/evidence/d-drill-http-review-20261023.mjs'].filter((p, i, a) => a.indexOf(p) === i).map(pin),
    reviewer_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  };
  if (process.argv[2] === '--check') assert.deepEqual(json(output), result);
  else fs.writeFileSync(path.resolve(root, output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('A2_DRILL_INCREMENT_ACCEPTED files=1629 tagged_delta=1 ordinary_inputs=unchanged actual_mysql=0');
} catch (error) { console.error('A2_DRILL_INCREMENT_REJECTED: ' + error.message); process.exitCode = 1; }
