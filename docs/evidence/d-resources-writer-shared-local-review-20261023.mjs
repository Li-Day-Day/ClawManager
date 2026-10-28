import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReceipt, validateManifest, validateGoEvents, validateRemoteTranscript,
  localRecheckPins, reviewLocalRecheck, legacyWindows936Name } from './d-resources-mysql-actual-review-20261023.mjs';

// A separate D reconciliation: the frozen common receiver and its original
// parent-bound supplement stay unchanged. Reuse only the ordinary local package
// evidence whose entire source/module/contracts input set is byte-identical.
// Remote writer evidence always belongs to its own receipt/binary/namespace.
const root = path.resolve(import.meta.dirname, '../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const local = name => {
  const file = path.resolve(root, name);
  assert.ok(file.startsWith(root + path.sep), 'file outside workspace');
  return file;
};
const raw = name => fs.readFileSync(local(name));
const json = name => JSON.parse(raw(name).toString('utf8').replace(/^\uFEFF/, ''));
const relative = name => path.relative(root, local(name)).replaceAll('\\', '/');

export function validateSharedInputs(writer, manifest, localParent, localManifest) {
  validateReceipt(writer, { suite: 'writer' });
  validateReceipt(localParent, { suite: 'readback' });
  assert.deepEqual(writer.steps[0].command, localParent.steps[0].command, 'shared ordinary command differs');
  assert.deepEqual(localRecheckPins(manifest), localRecheckPins(localManifest), 'shared package/module/contracts inputs differ');
}

export function validateDamagedLocalLog(text, replacementNames) {
  let error;
  try { validateGoEvents(text); } catch (caught) { error = caught; }
  assert.ok(error instanceof SyntaxError, 'only invalid JSON can use shared local supplement');
  const malformedLines = [], events = [];
  text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).forEach((line, index) => {
    try { events.push(JSON.parse(line)); } catch { malformedLines.push(index + 1); }
  });
  assert.ok(events.every(e => e.Package === 'clawreef/internal/systembackupresources'), 'mixed local package');
  assert.ok(!events.some(e => ['fail', 'skip'].includes(e.Action)), 'failed/skipped local event');
  assert.equal(events.filter(e => e.Action === 'start' && !e.Test).length, 1);
  assert.equal(events.filter(e => e.Action === 'pass' && !e.Test).length, 1);
  assert.equal(events.at(-1)?.Action, 'pass'); assert.equal(events.at(-1)?.Test, undefined);
  const legacyNames = [];
  for (const name of new Set(events.filter(e => e.Test && ['run', 'pass'].includes(e.Action)).map(e => e.Test))) {
    if (replacementNames.includes(name)) continue;
    const matches = replacementNames.filter(native => legacyWindows936Name(native) === name);
    assert.equal(matches.length, 1, 'shared supplement lost original test coverage');
    legacyNames.push({ original_encoded_name: name, rechecked_native_name: matches[0] });
  }
  return { malformed_lines: malformedLines, json_error: error.message, legacy_test_names: legacyNames };
}

export function reviewWriterSharedLocal(receiptFile, transcriptFile, localRecheckFile) {
  const file = local(receiptFile), prefix = file.slice(0, -5), writer = json(file);
  assert.match(path.basename(file), /^d-resources-mysql-\d{8}-\d{6}-[a-f0-9]{8}\.json$/);
  validateReceipt(writer, { suite: 'writer' });
  assert.equal(local(writer.source), prefix + '-source.json');
  assert.equal(path.dirname(writer.owner), root);
  assert.match(path.basename(writer.owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(writer.owner), false);
  const manifest = json(writer.source); validateManifest(manifest);
  const artifacts = [file, local(writer.source)], drift = [];
  const critical = pin => pin.path.startsWith('backend/internal/systembackupresources/') ||
    pin.path.startsWith('backend/internal/db/migrations/') || pin.path.startsWith('backend/cmd/system-backup-migrate/') ||
    ['backend/go.mod', 'backend/go.sum', 'backend/internal/systembackupcontroller/bootstrap.go',
      'scripts/system-backup-d-resources-mysql-validation.ps1', 'scripts/system-backup-d-resources-readback-phase.sh',
      'scripts/system-backup-d-resources-mysql-inputs.mjs', 'scripts/system-backup-d-index-source-snapshot.ps1',
      'scripts/system-backup-a-config-proof-source.ps1', 'scripts/system-backup-fresh-migration-smoke.sh',
      'scripts/system-backup-smoke-contract.sh', 'scripts/system-backup-d-invariants-phase.sh',
      'scripts/system-backup-d-migration-phase.sh', 'scripts/system-backup-a-business-history-phase.sh'].includes(pin.path);
  for (const pin of manifest.files) {
    const current = fs.existsSync(local(pin.path)) ? raw(pin.path) : null;
    const same = current !== null && current.length === pin.size && sha(current) === pin.sha256;
    if (critical(pin)) assert.ok(same, 'critical input drift: ' + pin.path);
    if (!same) drift.push(pin.path);
  }
  for (const dir of ['backend/internal/systembackupresources', 'backend/internal/db/migrations', 'backend/cmd/system-backup-migrate']) {
    const disk = fs.readdirSync(local(dir), { recursive: true, withFileTypes: true }).filter(e => e.isFile())
      .map(e => relative(path.join(e.parentPath, e.name))).filter(name => /\.(go|json|sql)$/.test(name)).sort();
    assert.deepEqual(disk, manifest.files.filter(p => p.path.startsWith(dir + '/') && /\.(go|json|sql)$/.test(p.path)).map(p => p.path).sort());
  }
  const logs = writer.steps.map((step, index) => {
    assert.equal(local(step.log), prefix + '-step-' + index + '.jsonl');
    const bytes = raw(step.log); assert.equal(sha(bytes), step.log_sha256, 'native log altered');
    artifacts.push(local(step.log)); return bytes;
  });
  assert.deepEqual(validateGoEvents(logs[1].toString('utf8')), ['TestAResourcesWriteFKMySQLSeed', 'TestDResourcesReadbackMySQLSeed', 'TestDResourcesWriteMySQLSeed']);
  const supplement = json(localRecheckFile), parentPath = local(supplement.parent_receipt.path), parent = json(parentPath);
  assert.match(path.basename(parentPath), /^d-resources-mysql-\d{8}-\d{6}-[a-f0-9]{8}\.json$/);
  assert.equal(local(parent.source), parentPath.slice(0, -5) + '-source.json');
  const oldManifest = json(parent.source); validateManifest(oldManifest);
  validateSharedInputs(writer, manifest, parent, oldManifest);
  const names = reviewLocalRecheck(localRecheckFile, parentPath, oldManifest, artifacts);
  artifacts.push(parentPath, local(parent.source));
  const damage = validateDamagedLocalLog(logs[0].toString('utf8'), names);
  const baseline = 'docs/evidence/a-writer-fk-20261023-134215-75d1f525-fixed.jsonl';
  const baselineBytes = raw(baseline);
  assert.equal(sha(baselineBytes), '53900185217d620cc37a4839fcc524e685274d912f7172134298427c38585a83');
  const oldNames = validateGoEvents(baselineBytes.toString('utf8'), JSON.parse(baselineBytes.toString('utf8').split(/\r?\n/)[0]).Package);
  assert.equal(oldNames.length, 843); assert.ok(oldNames.every(n => names.includes(n)), 'complete writer baseline lost');
  artifacts.push(local(baseline));
  const inputPath = 'backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json';
  const capsule = json(inputPath);
  assert.equal(sha(raw(inputPath)), writer.inputs_sha256);
  assert.equal(capsule.kind, 'd_resources_mysql_synthetic_inputs.v1'); assert.equal(capsule.production_approved, false);
  for (const p of capsule.migrations) assert.equal(manifest.files.find(f => f.path === 'backend/internal/db/migrations/' + p.name)?.sha256, p.sha256);
  const catalog = /ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(raw('backend/internal/systembackupcontroller/bootstrap.go').toString('utf8'))?.[1];
  assert.match(catalog, /^[a-f0-9]{64}$/);
  const text = raw(transcriptFile).toString('utf8'); artifacts.push(local(transcriptFile));
  const remote = validateRemoteTranscript(text, writer, { migrationCount: capsule.migrations.length,
    lastMigration: capsule.migrations.at(-1).name.split('_')[0], catalogHash: catalog });
  assert.equal(text.split(/\r?\n/).filter(line => line === 'resources_writer_exit=0').length, 1, 'native terminal exit missing');
  const commonFile = 'docs/evidence/d-resources-mysql-actual-review-20261023.mjs';
  const commonTests = 'docs/evidence/d-resources-mysql-actual-review-20261023.test.mjs';
  const frozen = json('docs/evidence/d-readback-coordination-20261023.json');
  assert.equal(sha(raw(commonFile)), frozen.receiver.sha256, 'common receiver no longer frozen');
  assert.equal(sha(raw(commonTests)), frozen.receiver_tests.sha256, 'common tests no longer frozen');
  artifacts.push(local(commonFile), local(commonTests));
  return {
    kind: 'd_resources_writer_actual_evidence_review.v1', scope: 'nine_storage_tables_transaction_only_synthetic_proofs',
    ...remote, binary_sha256: writer.binary_sha256, inputs_sha256: writer.inputs_sha256,
    source_sha256: manifest.source_sha256, unrelated_source_drift: drift,
    local_pass_events: names.length, preserved_writer_baseline_events: oldNames.length,
    original_local_step0_valid_json: false, original_local_step0_damage: damage,
    shared_local_recheck: { receipt: relative(localRecheckFile), original_parent: relative(parentPath),
      input_files: localRecheckPins(manifest).length, inputs_byte_identical: true, same_command: true, new_local_run_claimed: false },
    transcript_origin: 'user_pasted_terminal_output', original_evidence_rewritten: false,
    cleanup_recorded: true, local_owner_absence_checked: true, remote_cleanup_independently_queried: false,
    foreign_keys_accepted: false, full_restore_accepted: false, production_approved: false, A_signoff_claimed: false,
    dependencies_installed: false, remote_rerun_required: false,
    artifacts: [...new Set(artifacts)].map(p => ({ path: relative(p), sha256: sha(raw(p)) })),
    reviewer_sha256: sha(raw(fileURLToPath(import.meta.url))),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [receipt, transcript, supplement, out, ...extra] = process.argv.slice(2);
    assert.ok(receipt && transcript && supplement && out && !extra.length, 'receipt transcript local-supplement new-output required');
    const result = reviewWriterSharedLocal(receipt, transcript, supplement);
    assert.equal(path.dirname(local(out)), path.join(root, 'docs/evidence'));
    fs.writeFileSync(local(out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('WRITER_ACTUAL_ACCEPTED cases=' + result.remote_cases + ' local=' + result.local_pass_events + ' remote_rerun=no');
  } catch (error) { console.error('WRITER_SHARED_LOCAL_REJECTED: ' + error.message); process.exitCode = 1; }
}
