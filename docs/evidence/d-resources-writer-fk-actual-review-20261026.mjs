import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReceipt, validateManifest, validateGoEvents, localRecheckPins, reviewLocalRecheck }
  from './d-resources-mysql-actual-review-20261023.mjs';
import { validateDamagedLocalLog } from './d-resources-writer-shared-local-review-20261023.mjs';

// D-only reconciliation. Preserve the original logs, frozen common receiver,
// A receiver and parent-bound local supplement. No remote calls or builds.
const root = path.resolve(import.meta.dirname, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const local = name => {
  const file = path.resolve(root, name);
  assert.ok(file.startsWith(root + path.sep), 'file outside workspace');
  return file;
};
const raw = name => fs.readFileSync(local(name));
const json = name => JSON.parse(raw(name).toString('utf8').replace(/^\uFEFF/, ''));
const relative = name => path.relative(root, local(name)).replaceAll('\\', '/');
export const cases = Object.freeze([
  'reparent_items', 'reparent_reports', 'reparent_both', 'reparent_existing_parent',
  'delete_children_and_parent', 'server_cascade_control_rollback', 'server_rejects_orphan_1452',
  'late_common_failure_rollback', 'final_denial_after_reparent_rollback', 'unique_conflict_after_new_parent_rollback',
]);

export function validateFKTranscript(text, receipt, { migrationCount, lastMigration, catalogHash }) {
  const probe = 'TestAResourcesWriteFKMySQL';
  const lines = text.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').split('\n');
  assert.ok(!lines.some(line => /CLEANUP_PENDING|CLEANUP_SKIPPED|--- FAIL:|--- SKIP:|^FAIL(?:\s|$)|panic:|fatal error:/.test(line)), 'failed or unclean transcript');
  const one = pattern => {
    const matches = lines.flatMap((line, index) => { const match = pattern.exec(line); return match ? [{ match, index }] : []; });
    assert.equal(matches.length, 1, 'missing/duplicate ' + pattern); return matches[0];
  };
  const run = one(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=(\S+@sha256:[a-f0-9]{64}) mysql_image=(\S+@sha256:[a-f0-9]{64}) mysql_version=(8\.4\.\d+)$/);
  const migrationResult = one(/^\{"config_activated":.*\}$/);
  assert.deepEqual(JSON.parse(migrationResult.match[0]), {
    config_activated: false, historical_equivalence_verified: false, history_review_sha256: '',
    human_mfa_verified: false, migration_catalog_sha256: catalogHash, migration_count: migrationCount, result: 'PASS',
  });
  const migration = one(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/);
  assert.equal(migration.match[1], receipt.migration_binary_sha256); assert.equal(migration.match[2], catalogHash);
  const replay = one(/^PASS fresh-migration-replay=001\.\.([0-9]+) applied=([0-9]+) exact_filenames=yes d_columns=blob\/blob\/blob\/char$/);
  assert.equal(replay.match[1], lastMigration); assert.equal(+replay.match[2], migrationCount);
  const start = one(new RegExp(`^=== RUN   ${probe}$`));
  const fixture = one(/^\s+\S+\.go:\d+: RESOURCES_FIXTURE mysql=(8\.4\.\d+) migrations=(\d+) tables=44 clone=LIKE foreign_key_proof=no synthetic_registry=yes$/);
  assert.equal(fixture.match[1], run.match[5]); assert.equal(+fixture.match[2], migrationCount);
  const fk = one(/^\s+\S+\.go:\d+: FK_SCHEMA canonical_and_owned=matched job_relations=2 cascade=yes checks=1$/);
  const runs = lines.filter(line => line.startsWith(`=== RUN   ${probe}/`)).map(line => line.slice(`=== RUN   ${probe}/`.length));
  const passes = lines.flatMap(line => { const m = new RegExp(`^\\s+--- PASS: ${probe}/([^ ]+) \\([0-9.]+s\\)$`).exec(line); return m ? [m[1]] : []; });
  assert.deepEqual(runs.toSorted(), cases.toSorted()); assert.deepEqual(passes.toSorted(), cases.toSorted());
  assert.ok(!lines.some(line => /^=== RUN   Test/.test(line) && line !== `=== RUN   ${probe}` && !line.startsWith(`=== RUN   ${probe}/`)), 'mixed remote roots');
  const semantic = one(/^\s+\S+\.go:\d+: PASS a-resources-write-fk-mysql cases=10 declared_job_fks=2 checks=1 synthetic_proofs=yes production=no$/);
  const database = one(/^\s+\S+\.go:\d+: CLEANED resources-mysql-owned-database-and-user=yes$/);
  const done = one(new RegExp(`^--- PASS: ${probe} \\([0-9.]+s\\)$`));
  const pass = one(/^PASS$/);
  // Native Go can print subtest summaries after parent PASS. Starts must still
  // follow FK observation; every summary must precede native package completion.
  for (const name of cases) {
    const began = lines.indexOf(`=== RUN   ${probe}/${name}`);
    const ended = lines.findIndex(line => line.trimStart().startsWith(`--- PASS: ${probe}/${name} (`));
    assert.ok(began > fk.index && began < semantic.index, 'case start outside work interval');
    assert.ok(ended > began && ((ended < semantic.index) || (ended > done.index && ended < pass.index)), 'case completion outside work/package interval');
  }
  const phase = one(/^PASS a-resources-write-fk-mysql cases=10 binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) synthetic_proofs=yes full_restore=no production=no$/);
  assert.equal(phase.match[1], receipt.binary_sha256); assert.equal(phase.match[2], receipt.inputs_sha256);
  const cleanup = one(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/);
  assert.equal(cleanup.match[1], run.match[1]); assert.equal(cleanup.match[2], run.match[2]);
  const scratch = one(/^CLEANED resources-remote-scratch=yes$/);
  const owner = one(/^CLEANED resources-local-owner=(.+) removed=True$/); assert.equal(owner.match[1], receipt.owner);
  const result = one(/^RESOURCES_MYSQL_RESULT=(.+)$/); assert.equal(path.resolve(result.match[1]), local(receipt.source).slice(0, -'-source.json'.length) + '.json');
  const exit = one(/^resources_writer_fk_exit=(\d+)$/); assert.equal(exit.match[1], '0');
  const ordered = [run, migrationResult, migration, replay, start, fixture, fk, semantic, database, done, pass, phase, cleanup, scratch, owner, result, exit];
  assert.ok(ordered.every((item, index) => !index || item.index > ordered[index - 1].index), 'event order');
  return { namespace: run.match[1], namespace_uid: run.match[2], app_image: run.match[3], mysql_image: run.match[4], mysql_version: run.match[5], remote_cases: cases.length };
}

export function validateSharedInputs(receipt, manifest, parent, parentManifest) {
  validateReceipt(receipt, { suite: 'writer-fk' }); validateReceipt(parent, { suite: 'readback' });
  assert.deepEqual(receipt.steps[0].command, parent.steps[0].command, 'shared ordinary command differs');
  assert.deepEqual(localRecheckPins(manifest), localRecheckPins(parentManifest), 'shared package/module/contracts inputs differ');
}

export function reviewFK(receiptFile, transcriptFile, supplementFile) {
  const file = local(receiptFile), prefix = file.slice(0, -5), receipt = json(file);
  assert.match(path.basename(file), /^d-resources-mysql-\d{8}-\d{6}-[a-f0-9]{8}\.json$/);
  validateReceipt(receipt, { suite: 'writer-fk' });
  assert.equal(local(receipt.source), prefix + '-source.json'); assert.equal(path.dirname(receipt.owner), root);
  assert.match(path.basename(receipt.owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/); assert.equal(fs.existsSync(receipt.owner), false);
  const manifest = json(receipt.source); validateManifest(manifest);
  const artifacts = [file, local(receipt.source)], drift = [];
  const critical = p => p.startsWith('backend/internal/systembackupresources/') || p.startsWith('backend/internal/db/migrations/') || p.startsWith('backend/cmd/system-backup-migrate/') || p.startsWith('contracts/') || [
    'backend/go.mod', 'backend/go.sum', 'backend/internal/systembackupcontroller/bootstrap.go',
    'scripts/system-backup-d-resources-mysql-validation.ps1', 'scripts/system-backup-d-resources-readback-phase.sh',
    'scripts/system-backup-d-resources-mysql-inputs.mjs', 'scripts/system-backup-d-index-source-snapshot.ps1',
    'scripts/system-backup-a-config-proof-source.ps1', 'scripts/system-backup-fresh-migration-smoke.sh',
    'scripts/system-backup-smoke-contract.sh', 'scripts/system-backup-d-invariants-phase.sh',
    'scripts/system-backup-d-migration-phase.sh', 'scripts/system-backup-a-business-history-phase.sh',
  ].includes(p);
  for (const pin of manifest.files) {
    const bytes = fs.existsSync(local(pin.path)) ? raw(pin.path) : null;
    const same = bytes !== null && bytes.length === pin.size && sha(bytes) === pin.sha256;
    if (critical(pin.path)) assert.ok(same, 'critical input drift: ' + pin.path);
    if (!same) drift.push(pin.path);
  }
  for (const dir of ['backend/internal/systembackupresources', 'backend/internal/db/migrations', 'backend/cmd/system-backup-migrate', 'contracts']) {
    const disk = fs.readdirSync(local(dir), { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => relative(path.join(e.parentPath, e.name))).filter(p => /\.(go|json|sql)$/.test(p)).sort();
    assert.deepEqual(disk, manifest.files.filter(p => p.path.startsWith(dir + '/') && /\.(go|json|sql)$/.test(p.path)).map(p => p.path).sort(), 'source set differs');
  }
  const logs = receipt.steps.map((step, index) => {
    assert.equal(local(step.log), prefix + '-step-' + index + '.jsonl'); artifacts.push(local(step.log));
    const bytes = raw(step.log); assert.equal(sha(bytes), step.log_sha256, 'native log altered'); return bytes;
  });
  assert.deepEqual(validateGoEvents(logs[1].toString('utf8')), ['TestAResourcesWriteFKMySQLSeed', 'TestDResourcesReadbackMySQLSeed', 'TestDResourcesWriteMySQLSeed']);
  const supplement = json(supplementFile), parentPath = local(supplement.parent_receipt.path), parent = json(parentPath);
  assert.match(path.basename(parentPath), /^d-resources-mysql-\d{8}-\d{6}-[a-f0-9]{8}\.json$/);
  assert.equal(local(parent.source), parentPath.slice(0, -5) + '-source.json');
  const parentManifest = json(parent.source); validateManifest(parentManifest);
  validateSharedInputs(receipt, manifest, parent, parentManifest);
  const names = reviewLocalRecheck(supplementFile, parentPath, parentManifest, artifacts);
  artifacts.push(parentPath, local(parent.source));
  const damage = validateDamagedLocalLog(logs[0].toString('utf8'), names);
  const baseline = 'docs/evidence/a-writer-fk-20261023-134215-75d1f525-fixed.jsonl', bytes = raw(baseline);
  assert.equal(sha(bytes), '53900185217d620cc37a4839fcc524e685274d912f7172134298427c38585a83'); artifacts.push(local(baseline));
  const priorNames = validateGoEvents(bytes.toString('utf8'), JSON.parse(bytes.toString('utf8').split(/\r?\n/)[0]).Package);
  assert.equal(priorNames.length, 843); assert.ok(priorNames.every(name => names.includes(name)), 'writer baseline lost');
  const inputPath = 'backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json', capsule = json(inputPath);
  assert.equal(sha(raw(inputPath)), receipt.inputs_sha256); assert.equal(capsule.kind, 'd_resources_mysql_synthetic_inputs.v1'); assert.equal(capsule.production_approved, false);
  for (const pin of capsule.migrations) assert.equal(manifest.files.find(p => p.path === 'backend/internal/db/migrations/' + pin.name)?.sha256, pin.sha256);
  const catalog = /ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(raw('backend/internal/systembackupcontroller/bootstrap.go').toString('utf8'))?.[1];
  assert.match(catalog, /^[a-f0-9]{64}$/);
  const remote = validateFKTranscript(raw(transcriptFile).toString('utf8'), receipt, { migrationCount: capsule.migrations.length, lastMigration: capsule.migrations.at(-1).name.split('_')[0], catalogHash: catalog });
  artifacts.push(local(transcriptFile));
  for (const name of ['d-resources-mysql-actual-review-20261023.mjs', 'd-resources-writer-shared-local-review-20261023.mjs', 'd-resources-writer-fk-actual-review-20261026.mjs', 'd-resources-writer-fk-actual-review-20261026.test.mjs']) artifacts.push(local('docs/evidence/' + name));
  return {
    kind: 'd_resources_writer_fk_actual_evidence_review.v1', scope: 'two_declared_job_foreign_keys_only_synthetic_proofs', result: 'PASS', ...remote,
    binary_sha256: receipt.binary_sha256, migration_binary_sha256: receipt.migration_binary_sha256, inputs_sha256: receipt.inputs_sha256,
    migration_catalog_sha256: catalog, migration_count: capsule.migrations.length,
    frozen_source_files: manifest.files.length, source_sha256: manifest.source_sha256, current_all_frozen_files_match: drift.length === 0, unrelated_source_drift: drift,
    local_pass_events: names.length, local_root_tests: names.filter(name => !name.includes('/')).length, preserved_writer_baseline_events: priorNames.length,
    original_local_step0_valid_json: false, original_local_step0_damage: damage,
    shared_local_recheck: { receipt: relative(supplementFile), original_parent: relative(parentPath), input_files: localRecheckPins(manifest).length, inputs_byte_identical: true, same_command: true, new_local_run_claimed: false },
    transcript_origin: 'user_pasted_terminal_output', original_evidence_rewritten: false, native_terminal_exit: 0,
    cleanup_recorded: true, local_owner_absence_checked: true, remote_cleanup_independently_queried: false,
    declared_job_foreign_keys_accepted: 2, generic_FK_UNIQUE_accepted: false, B_C_rules_accepted: false, physical_capacity_accepted: false,
    full_restore_accepted: false, production_approved: false, A_signoff_claimed: false,
    config_activated: false, historical_equivalence_verified: false, human_mfa_verified: false,
    dependencies_installed: false, remote_rerun_required: false,
    artifacts: [...new Set(artifacts)].map(p => ({ path: relative(p), sha256: sha(raw(p)) })), reviewer_sha256: sha(raw(fileURLToPath(import.meta.url))),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [receipt, transcript, supplement, out, mode, ...extra] = process.argv.slice(2);
    assert.ok(receipt && transcript && supplement && out && !extra.length && (mode === undefined || mode === '--check'), 'receipt transcript supplement output [--check] required');
    const result = reviewFK(receipt, transcript, supplement);
    assert.equal(path.dirname(local(out)), path.join(root, 'docs/evidence'));
    if (mode === '--check') assert.deepEqual(json(out), result, 'saved review differs');
    else fs.writeFileSync(local(out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`D_WRITER_FK_ACCEPTED cases=${result.remote_cases} local=${result.local_pass_events} remote_rerun=no`);
  } catch (error) { console.error('D_WRITER_FK_REJECTED: ' + error.message); process.exitCode = 1; }
}
