import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {validateSupplementInventory} from './d2-owner-entry-supplement-inventory-20261026.mjs';

export const gcSeedRoots = [
  'TestDDownloadGCFullCollectMySQLSeed',
  'TestDDownloadGCFullLifecycleMySQLSeed',
  'TestDDownloadGCFullProfileMySQLSeed',
];
export const gcSeedPattern = '^TestDDownloadGCFull(Collect|Profile|Lifecycle)MySQLSeed$';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// Inventory checks only. This module never authorizes a target, accepts parent
// coverage, starts Go/SQL, or generates events. The caller must first validate
// A's independent exact target/scope review, and check frozen source afterwards.
export function validateGCStages({steps, read, readBinary, evidenceBinary}) {
  assert.equal(steps.length, 2, 'GC seed and current Linux compilation required');
  for (const step of steps) {
    assert.equal(step.exit_code, 0);
    assert.equal(sha(read(step.log)), step.sha256, 'GC stage log changed');
  }
  assert.equal(steps[0].platform, 'windows');
  assert.deepEqual(steps[0].command, ['go', 'test', '-json', '-tags', 'systembackup_mysql',
    '-run', gcSeedPattern, '-count=1', '-timeout=2700s', './internal/systembackupevidence']);
  const names = validateGoEvents(read(steps[0].log).toString('utf8'), 'clawreef/internal/systembackupevidence');
  assert.deepEqual(names, gcSeedRoots, 'Only the three exact local seed roots may run');
  assert.equal(steps[1].platform, 'linux');
  assert.deepEqual(steps[1].command, ['go', 'test', '-vet=off', '-c', '-tags', 'systembackup_mysql',
    '-o', evidenceBinary, './internal/systembackupevidence']);
  assert.equal(steps[1].binary, evidenceBinary);
  const binary = readBinary(evidenceBinary);
  assert.ok(Buffer.isBuffer(binary) && binary.length >= 64, 'Missing Linux evidence binary');
  assert.equal(binary.subarray(0, 7).toString('hex'), '7f454c46020101', 'Expected ELF v1, 64-bit little-endian');
  assert.ok([2, 3].includes(binary.readUInt16LE(16)), 'Expected executable ELF');
  assert.equal(binary.readUInt16LE(18), 62, 'Expected amd64 ELF');
  assert.equal(binary.readUInt32LE(20), 1);
  assert.equal(binary.readUInt16LE(52), 64);
  const phoff = binary.readBigUInt64LE(32), entry = binary.readBigUInt64LE(24);
  const phsize = binary.readUInt16LE(54), phcount = binary.readUInt16LE(56);
  assert.equal(phsize, 56);
  assert.ok(phcount > 0 && phoff >= 64n && phoff + BigInt(phsize * phcount) <= BigInt(binary.length), 'Truncated ELF program headers');
  let executableEntry = false;
  for (let i = 0; i < phcount; i++) {
    const offset = Number(phoff) + i * phsize;
    if (binary.readUInt32LE(offset) !== 1) continue;
    const fileOffset = binary.readBigUInt64LE(offset + 8), address = binary.readBigUInt64LE(offset + 16);
    const fileSize = binary.readBigUInt64LE(offset + 32), memorySize = binary.readBigUInt64LE(offset + 40);
    assert.ok(fileSize <= memorySize && fileOffset + fileSize <= BigInt(binary.length), 'Truncated ELF load segment');
    if ((binary.readUInt32LE(offset + 4) & 1) && entry >= address && entry < address + fileSize) executableEntry = true;
  }
  assert.ok(executableEntry, 'ELF entry must lie in a file-backed executable load segment');
  assert.equal(sha(binary), steps[1].binary_sha256, 'Linux binary changed');
  return {gc_seed_names:names, current_linux_evidence_binary_sha256:sha(binary),
    linux_binary_executed:false, actual_mysql:false};
}

export function validateCurrentSupplementInventory(input) {
  assert.equal(input.steps.length, 15, 'All fifteen current supplement stages required');
  const gc = validateGCStages({...input, steps:input.steps.slice(0, 2)});
  const owner = validateSupplementInventory({...input, steps:input.steps.slice(2)});
  return {...owner, ...gc, stages:15, source_scope_acceptance_claimed:false};
}

// The failed parent is read only for its actual complete evidence test names.
// This does not accept its missing postcheck or Linux stage. The independent
// pre-thin scope validator remains a separate required gate in the runner.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 6, 'Usage: inventory OWNER STAGES_JSON PARENT_RECEIPT PARENT_SHA256');
  const root = path.resolve(import.meta.dirname, '../..');
  const owner = path.resolve(process.argv[2]);
  assert.equal(path.dirname(owner), root);
  assert.match(path.basename(owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.lstatSync(owner).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(owner, 'owner.txt'), 'utf8'), path.basename(owner));
  const token = path.basename(owner).slice('.tmp-d-index-cache-'.length);
  const stagesPath = path.resolve(process.argv[3]);
  assert.equal(stagesPath, path.join(owner, 'inventory-stages.json'));
  assert.equal(fs.lstatSync(stagesPath).isSymbolicLink(), false);
  const steps = JSON.parse(fs.readFileSync(stagesPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(steps.length, 15);
  const read = file => {
    const absolute = path.resolve(file);
    assert.equal(path.dirname(absolute), path.join(root, 'docs/evidence'));
    assert.ok(path.basename(absolute).startsWith('d2-owner-entry-supplement-' + token + '-'));
    assert.equal(fs.lstatSync(absolute).isSymbolicLink(), false);
    return fs.readFileSync(absolute);
  };
  const parentPath = path.resolve(process.argv[4]);
  assert.equal(path.dirname(parentPath), path.join(root, 'docs/evidence'));
  assert.match(path.basename(parentPath), /^d-bootstrap-entry-native-[a-f0-9]{32}\.json$/);
  assert.equal(fs.lstatSync(parentPath).isSymbolicLink(), false);
  assert.match(process.argv[5], /^[a-f0-9]{64}$/);
  const parentBytes = fs.readFileSync(parentPath);
  assert.equal(sha(parentBytes), process.argv[5], 'Parent receipt changed');
  const parent = JSON.parse(parentBytes.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(parent.kind, 'd_bootstrap_entry_native.v1');
  assert.equal(parent.full_exit, 0);
  assert.equal(parent.snapshot_verified, true);
  assert.equal(parent.cleaned, true);
  assert.equal(parent.actual_mysql_executed, false);
  assert.equal(parent.actual_sql_cases_executed, 0);
  assert.equal(parent.dependencies_installed, false);
  const parentLog = parentPath.replace(/\.json$/, '.full.jsonl');
  assert.equal(fs.lstatSync(parentLog).isSymbolicLink(), false);
  const parentRows = fs.readFileSync(parentLog, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(JSON.parse);
  const evidenceRows = parentRows.filter(row => row.Package === 'clawreef/internal/systembackupevidence');
  const parentEvidenceNames = validateGoEvents(evidenceRows.map(row => JSON.stringify(row)).join('\n'), 'clawreef/internal/systembackupevidence');
  const standaloneNames = ['download_retention_gc_freeze.go', 'download_retention_gc_freeze_test.go', 'download_retention_gc_freeze_a_test.go', 'download_retention_gc_finalize.go', 'download_retention_gc_finalize_test.go'];
  const standaloneSources = Object.fromEntries(standaloneNames.map(name => [name, fs.readFileSync(path.join(owner, 'source/backend/internal/systembackupevidence', name), 'utf8')]));
  const evidenceBinary = path.join(owner, 'binary/current-evidence.test');
  const readBinary = file => {
    assert.equal(file, evidenceBinary);
    assert.equal(fs.lstatSync(path.join(owner, 'binary')).isSymbolicLink(), false);
    assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
    return fs.readFileSync(file);
  };
  const result = validateCurrentSupplementInventory({steps, read, readBinary, evidenceBinary, standaloneSources, parentEvidenceNames});
  assert.equal(steps[7].working_directory, path.join(owner, 'detached/work/probe'));
  assert.equal(sha(fs.readFileSync(parentPath)), process.argv[5]);
  process.stdout.write(JSON.stringify({...result, parent_status_observed:parent.status, parent_stage_inventory_only:true}) + '\n');
}
