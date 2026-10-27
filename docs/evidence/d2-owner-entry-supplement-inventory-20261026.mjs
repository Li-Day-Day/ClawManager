import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {ownerSeedNames, validateOwnerDetached, validateOwnerCounterexample} from './a-owner-finalizer-native-20261026.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const standaloneFiles = ['download_retention_gc_freeze.go', 'download_retention_gc_freeze_test.go', 'download_retention_gc_freeze_a_test.go', 'download_retention_gc_finalize.go', 'download_retention_gc_finalize_test.go'];

// This checks actual native logs. It never generates PASS events or starts Go.
export function validateSupplementInventory({steps, read, standaloneSources, parentEvidenceNames}) {
  assert.equal(steps.length, 13, 'all thin supplement stages required');
  for (const [index, step] of steps.entries()) {
    assert.equal(step.exit_code, index >= 11 ? 1 : 0, 'unexpected native exit at stage ' + index);
    assert.equal(sha(read(step.log)), step.sha256, 'native log changed at stage ' + index);
  }
  const inventory = (index, pkg) => validateGoEvents(read(steps[index].log).toString('utf8'), pkg);
  const resourceNames = ['TestAResourcesWriteFKMySQLSeed', 'TestDResourcesReadbackMySQLSeed', 'TestDResourcesWriteMySQLSeed'];
  assert.deepEqual(inventory(0, 'clawreef/internal/systembackupresources'), resourceNames);
  const httpNames = ['TestDDrillDetailHTTPSeed', 'TestDDrillDetailHTTPSeed/foreign_installation_fk_fixture',
    'TestDDrillDetailHTTPSeed/foreign_installation_fk_fixture/drill_history_foreign_installation'];
  assert.deepEqual(inventory(1, 'command-line-arguments'), httpNames);
  assert.deepEqual(inventory(2, 'clawreef/internal/systembackupsecurity'), ['TestAAdminReadMySQLSeed']);
  assert.deepEqual(inventory(3, 'clawreef/internal/systembackupevidence'), ownerSeedNames);
  assert.equal(steps[5].initial_directory_empty, true);
  assert.deepEqual(validateOwnerDetached(read(steps[5].log)), ownerSeedNames);
  const standaloneBytes = read(steps[9].log).toString('utf8').replace(/^\uFEFF/, '');
  const first = JSON.parse(standaloneBytes.trim().split(/\r?\n/)[0]);
  assert.equal(typeof first.Package, 'string');
  const standaloneNames = validateGoEvents(standaloneBytes, first.Package);
  const roots = standaloneFiles.filter(name => name.endsWith('_test.go')).flatMap(name => {
    assert.equal(typeof standaloneSources[name], 'string', 'missing frozen standalone source');
    return [...standaloneSources[name].matchAll(/^func (Test\w+)\(/gm)].map(match => match[1]);
  }).sort();
  assert.deepEqual(standaloneNames.filter(name => !name.includes('/')), roots);
  assert.ok(parentEvidenceNames.length > 0, 'parent complete evidence inventory required');
  for (const name of standaloneNames) assert.ok(parentEvidenceNames.includes(name), 'standalone test omitted from complete parent: ' + name);
  const counterexamples = [
    'TestDownloadGCFinalizerProtectedCandidate/worker_claim',
    'TestDownloadGCFinalizerProtectedCandidate/clock_intermediate_rollback',
  ].map((target, index) => {
    const stage = steps[index + 11];
    assert.equal(stage.expected_failure_test, target);
    return validateOwnerCounterexample(read(stage.log), target, stage.exit_code);
  });
  return {resource_seed_names: resourceNames, http_seed_names: httpNames, admin_seed_checks: 1,
    packaged_owner_seed_names: [...ownerSeedNames], detached_owner_seed_names: [...ownerSeedNames],
    standalone_roots: roots, standalone_pass_events: standaloneNames.length, counterexamples,
    real_native_inventory_checked: true, actual_mysql: false};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 5, 'Usage: inventory EXACT_OWNER STAGES_JSON ENTRY_RECEIPT');
  const root = path.resolve(import.meta.dirname, '../..');
  const owner = path.resolve(process.argv[2]);
  assert.equal(path.dirname(owner), root);
  assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.lstatSync(owner).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
  const token = path.basename(owner).slice('.tmp-d-index-cache-'.length);
  const stagesPath = path.resolve(process.argv[3]);
  assert.equal(stagesPath, path.join(owner, 'inventory-stages.json'));
  const stages = JSON.parse(fs.readFileSync(stagesPath, 'utf8').replace(/^\uFEFF/, ''));
  const read = file => {
    const absolute = path.resolve(file);
    assert.equal(path.dirname(absolute), path.join(root, 'docs/evidence'));
    assert.ok(path.basename(absolute).startsWith('d2-owner-entry-supplement-' + token + '-'));
    return fs.readFileSync(absolute);
  };
  const parentPath = path.resolve(process.argv[4]);
  assert.equal(path.dirname(parentPath), path.join(root, 'docs/evidence'));
  assert.match(path.basename(parentPath), /^d-bootstrap-entry-native-[a-f0-9]{32}\.json$/);
  const parent = JSON.parse(fs.readFileSync(parentPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(parent.status, 'passed_exact_entry_snapshot');
  const parentRows = fs.readFileSync(parentPath.replace(/\.json$/, '.full.jsonl'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(JSON.parse);
  const evidenceRows = parentRows.filter(row => row.Package === 'clawreef/internal/systembackupevidence');
  const parentEvidenceNames = validateGoEvents(evidenceRows.map(row => JSON.stringify(row)).join('\n'), 'clawreef/internal/systembackupevidence');
  const standaloneSources = Object.fromEntries(standaloneFiles.map(name => [name, fs.readFileSync(path.join(owner, 'source/backend/internal/systembackupevidence', name), 'utf8')]));
  const result = validateSupplementInventory({steps: stages, read, standaloneSources, parentEvidenceNames});
  assert.equal(stages[5].working_directory, path.join(owner, 'detached/work/probe'));
  assert.ok(JSON.parse(fs.readFileSync(parentPath, 'utf8').replace(/^\uFEFF/, '')).snapshot_unchanged);
  process.stdout.write(JSON.stringify(result) + '\n');
}
