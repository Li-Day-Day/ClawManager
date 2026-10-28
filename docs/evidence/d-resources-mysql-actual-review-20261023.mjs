import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This receiver lives outside the remote runner's source-selection set. It does
// not connect to a server, build anything, remove anything, or approve production.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const probe = 'TestDResourcesReadbackMySQL';
export const expectedCases = Object.freeze([
  'five_candidates_and_nine_storage_tables', 'null_is_not_empty',
  'decimal_scale_and_fractional_time', 'readonly_identity_denies_write',
  'readonly_transaction_denies_write', 'row_budget', 'byte_budget',
  'repeatable_read_concurrent_change', 'non_utc_session', 'missing_column',
  'empty_tables', 'control_row_denied',
]);
export const writerCases = Object.freeze([
  'commit_updates_then_select_only_readback', 'insert_into_complete_empty_target',
  'delete_complete_row_set', 'later_common_stage_rollback', 'final_authority_failure_rollback',
  'late_sql_failure_rollback', 'old_rr_snapshot_rejects_current_drift',
  'existing_primary_row_lock', 'empty_primary_range_lock',
]);
const inputPath = 'backend/internal/systembackupresources/testdata/restore-readback-mysql-inputs.json';
const fixedCritical = [
  'backend/go.mod', 'backend/go.sum', 'backend/internal/systembackupcontroller/bootstrap.go',
  'scripts/system-backup-d-resources-mysql-validation.ps1',
  'scripts/system-backup-d-resources-readback-phase.sh',
  'scripts/system-backup-d-resources-mysql-inputs.mjs',
  'scripts/system-backup-d-index-source-snapshot.ps1',
  'scripts/system-backup-a-config-proof-source.ps1',
  'scripts/system-backup-fresh-migration-smoke.sh', 'scripts/system-backup-smoke-contract.sh',
  'scripts/system-backup-d-invariants-phase.sh', 'scripts/system-backup-d-migration-phase.sh',
  inputPath,
];

export function validateReceipt(receipt, { suite = 'readback', actual = true } = {}) {
  assert.equal(receipt.kind, 'd_resources_mysql_preparation.v1', 'receipt kind');
  assert.ok(['readback', 'writer', 'writer-fk'].includes(suite), 'unsupported resources suite');
  assert.equal(receipt.suite, suite, 'writer-only results cannot qualify readback');
  assert.equal(receipt.remote_requested, actual, 'local preparation is not actual MySQL evidence');
  assert.equal(receipt.error, null, 'remote wrapper failed');
  assert.equal(receipt.remote_scratch_removed, actual, 'remote scratch cleanup');
  for (const key of ['owner_removed', 'synthetic_proofs']) {
    assert.equal(receipt[key], true, key);
  }
  for (const key of ['dependencies_installed', 'production_approved']) assert.equal(receipt[key], false, key);
  for (const key of ['binary_sha256', 'migration_binary_sha256', 'inputs_sha256']) {
    assert.match(receipt[key], hashPattern, key);
  }
  assert.equal(receipt.steps.length, 4, 'four native local steps required');
  const seedSelector=receipt.steps[1].command[5];
  assert.ok(['^TestDResources(Readback|Write)MySQLSeed$','^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$'].includes(seedSelector),'unreviewed seed selection');
  const expectedCommands = [
    ['go', 'test', '-count=1', '-timeout=180s', '-json', './internal/systembackupresources'],
    ['go', 'test', '-tags', 'systembackup_mysql', '-run', seedSelector, '-count=1', '-json', './internal/systembackupresources'],
    ['go', 'test', '-c', '-tags', 'systembackup_mysql', '-o', path.join(receipt.owner, 'bundle/d-resources-readback.test'), './internal/systembackupresources'],
    ['go', 'build', '-o', path.join(receipt.owner, 'bundle/system-backup-migrate'), './cmd/system-backup-migrate'],
  ];
  receipt.steps.forEach((step, index) => {
    assert.equal(step.exit_code, 0, `native step ${index}`);
    assert.equal(step.platform, index < 2 ? 'windows' : 'linux', `platform ${index}`);
    assert.deepEqual(step.command, expectedCommands[index], `command ${index}`);
    assert.match(step.log_sha256, hashPattern, `log hash ${index}`);
  });
}

export function validateGoEvents(text, expectedPackage = 'clawreef/internal/systembackupresources') {
  const events = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.ok(events.length > 0, 'empty Go events');
  assert.ok(events.every(event => event.Package === expectedPackage), 'wrong Go package');
  assert.ok(!events.some(event => event.Action === 'fail' || event.Action === 'skip'), 'failed/skipped Go event');
  assert.equal(events.filter(event => event.Action === 'start' && !event.Test).length, 1, 'one package start');
  assert.equal(events.filter(event => event.Action === 'pass' && !event.Test).length, 1, 'one package completion');
  assert.equal(events.at(-1).Action, 'pass', 'incomplete Go package');
  assert.equal(events.at(-1).Test, undefined, 'missing package completion');
  const runs = events.filter(event => event.Action === 'run').map(event => event.Test).sort();
  const passes = events.filter(event => event.Action === 'pass' && event.Test).map(event => event.Test).sort();
  assert.ok(runs.length > 0, 'no tests run');
  assert.deepEqual(passes, runs, 'every Go test must pass exactly once');
  assert.equal(new Set(passes).size, passes.length, 'duplicate Go test');
  for (const name of passes) assert.ok(events.findIndex(event => event.Action === 'run' && event.Test === name) < events.findIndex(event => event.Action === 'pass' && event.Test === name), 'Go pass before run');
  return passes;
}

export function validateManifest(manifest) {
  assert.equal(manifest.kind, 'd_index_group_source_snapshot');
  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, 'empty source capsule');
  const paths = new Set();
  for (const pin of manifest.files) {
    assert.match(pin.path, /^(backend|contracts|scripts|docs)\//, 'source path root');
    assert.ok(!pin.path.includes('\\') && !pin.path.split('/').some(part => ['', '.', '..'].includes(part)), 'unsafe source path');
    assert.ok(!paths.has(pin.path), 'duplicate source path'); paths.add(pin.path);
    assert.match(pin.sha256, hashPattern);
    assert.ok(Number.isSafeInteger(pin.size) && pin.size >= 0, 'source size');
  }
  assert.equal(sha(manifest.files.map(pin => `${pin.path}\0${pin.sha256}\0${pin.size}`).join('\n') + '\n'), manifest.source_sha256, 'source aggregate hash');
  for (const required of fixedCritical) assert.ok(paths.has(required), 'source pin missing: ' + required);
}

export function validateRemoteTranscript(text, receipt, { migrationCount, lastMigration, catalogHash }) {
  assert.ok(['readback', 'writer'].includes(receipt.suite), 'unsupported resources suite');
  const writing = receipt.suite === 'writer';
  const probe = writing ? 'TestDResourcesWriteMySQL' : 'TestDResourcesReadbackMySQL';
  const cases = writing ? writerCases : expectedCases;
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  assert.ok(!lines.some(line => /CLEANUP_PENDING|CLEANUP_SKIPPED|--- FAIL:|--- SKIP:|^FAIL(?:\s|$)|panic:|fatal error:/.test(line)), 'failure or unconfirmed cleanup in transcript');
  const exactlyOne = (pattern, label) => {
    const matches = lines.flatMap((line, index) => {
      const match = pattern.exec(line); return match ? [{ match, index }] : [];
    });
    assert.equal(matches.length, 1, `expected one ${label}`); return matches[0];
  };
  const run = exactlyOne(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=\S+ mysql_image=\S+ mysql_version=8\.4\.\S+$/, 'namespace identity');
  const migration = exactlyOne(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/, 'pinned migration runner');
  assert.equal(migration.match[1], receipt.migration_binary_sha256, 'migration binary differs');
  assert.equal(migration.match[2], catalogHash, 'migration catalog differs');
  const replay = exactlyOne(/^PASS fresh-migration-replay=001\.\.([0-9]+) applied=([0-9]+) exact_filenames=yes d_columns=blob\/blob\/blob\/char$/, 'complete migration replay');
  assert.equal(replay.match[1], lastMigration); assert.equal(Number(replay.match[2]), migrationCount);
  const fixture = exactlyOne(/^\s+\S+\.go:\d+: RESOURCES_FIXTURE mysql=8\.4\.\S+ migrations=(\d+) tables=44 clone=LIKE foreign_key_proof=no synthetic_registry=yes$/, 'MySQL storage fixture');
  assert.equal(Number(fixture.match[1]), migrationCount);
  const start = exactlyOne(new RegExp(`^=== RUN   ${probe}$`), 'remote probe start');
  const runs = lines.filter(line => line.startsWith(`=== RUN   ${probe}/`)).map(line => line.slice(`=== RUN   ${probe}/`.length));
  const passes = lines.flatMap(line => {
    const match = new RegExp(`^\\s+--- PASS: ${probe}/([^ ]+) \\([0-9.]+s\\)$`).exec(line); return match ? [match[1]] : [];
  });
  assert.deepEqual([...runs].sort(), [...cases].sort(), 'exact remote case starts');
  assert.deepEqual([...passes].sort(), [...cases].sort(), 'exact remote case passes');
  for (const name of cases) {
    assert.ok(lines.indexOf(`=== RUN   ${probe}/${name}`) < lines.findIndex(line => line.trimStart().startsWith(`--- PASS: ${probe}/${name} (`)), 'remote case pass before start');
  }
  assert.ok(!lines.some(line => /^=== RUN   Test/.test(line) && !line.startsWith(`=== RUN   ${probe}/`) && line !== `=== RUN   ${probe}`), 'mixed remote test roots');
  const semantic = exactlyOne(writing
    ? /^\s+\S+\.go:\d+: PASS resources-write-mysql cases=9 tables=9 independent_select_only=yes synthetic_proofs=yes foreign_key_proof=no ddl_freeze_proof=no production=no$/
    : /^\s+\S+\.go:\d+: PASS resources-readback-mysql cases=12 five_normalizers=yes nine_storage_tables=yes controls=35 synthetic_proofs=yes foreign_key_proof=no ddl_freeze_proof=no production=no$/, 'semantic completion');
  const database = exactlyOne(/^\s+\S+\.go:\d+: CLEANED resources-mysql-owned-database-and-user=yes$/, 'database and user cleanup');
  const done = exactlyOne(new RegExp(`^--- PASS: ${probe} \\([0-9.]+s\\)$`), 'remote probe completion');
  const nativePass = exactlyOne(/^PASS$/, 'native Go completion');
  const phase = exactlyOne(new RegExp(`^PASS d-resources-${writing ? 'write' : 'readback'}-mysql cases=${cases.length} binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) synthetic_proofs=yes full_restore=no production=no$`), 'remote phase completion');
  assert.equal(phase.match[1], receipt.binary_sha256, 'probe binary differs');
  assert.equal(phase.match[2], receipt.inputs_sha256, 'probe inputs differ');
  const cleanup = exactlyOne(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/, 'namespace cleanup');
  assert.equal(cleanup.match[1], run.match[1], 'cleanup namespace differs');
  assert.equal(cleanup.match[2], run.match[2], 'cleanup UID differs');
  const scratch = exactlyOne(/^CLEANED resources-remote-scratch=yes$/, 'remote scratch cleanup');
  const owner = exactlyOne(/^CLEANED resources-local-owner=(.+) removed=True$/, 'local owner cleanup');
  assert.equal(owner.match[1], receipt.owner, 'local owner differs');
  const ordered = [run, migration, replay, start, fixture, semantic, database, done, nativePass, phase, cleanup, scratch, owner];
  assert.ok(ordered.every((item, index) => index === 0 || item.index > ordered[index - 1].index), 'remote event order');
  // go test -v can print child PASS summaries after the parent PASS. Child
  // starts still belong to the fixture/semantic interval; deferred summaries
  // must follow the parent completion and precede the native package PASS.
  lines.forEach((line, index) => {
    if (line.startsWith(`=== RUN   ${probe}/`)) {
      assert.ok(index > fixture.index && index < semantic.index, 'case start outside probe');
    } else if (line.trimStart().startsWith(`--- PASS: ${probe}/`)) {
      assert.ok((index > fixture.index && index < semantic.index) ||
        (index > done.index && index < nativePass.index), 'case pass outside probe');
    }
  });
  return { namespace: run.match[1], namespace_uid: run.match[2], remote_cases: passes.length };
}

const raw = file => fs.readFileSync(file);
const json = file => JSON.parse(raw(file).toString('utf8').replace(/^\uFEFF/, ''));
function localPath(file) {
  const resolved = path.resolve(root, file);
  assert.ok(resolved.startsWith(root + path.sep), 'evidence path outside workspace');
  return resolved;
}

// Only the ordinary resources package and its explicit on-disk contract inputs
// are needed for this local supplement. No other local Go package is present
// in the isolated source tree, so an added local import fails closed.
export function localRecheckPins(manifest) {
  const pins = manifest.files.filter(pin => ['backend/go.mod', 'backend/go.sum'].includes(pin.path) ||
    pin.path.startsWith('backend/internal/systembackupresources/') || pin.path.startsWith('contracts/'));
  for (const required of ['backend/go.mod', 'backend/go.sum',
    'contracts/system-backup/v12/schema-registry.json', 'contracts/system-backup/v12/verifier-contract.schema.json']) {
    assert.ok(pins.some(pin => pin.path === required), 'local recheck input missing: ' + required);
  }
  return pins;
}

export function reviewLocalRecheck(recheckFile, parentFile, manifest, files) {
  const file = localPath(recheckFile), receipt = json(file);
  assert.equal(receipt.kind, 'd_resources_local_recheck.v1');
  assert.equal(receipt.parent_receipt.path, path.relative(root, parentFile).replaceAll('\\', '/'));
  assert.equal(receipt.parent_receipt.sha256, sha(raw(parentFile)), 'recheck parent receipt differs');
  const parent = json(parentFile);
  assert.equal(receipt.source_manifest.sha256, sha(raw(localPath(parent.source))), 'recheck source manifest differs');
  assert.equal(localPath(receipt.source_manifest.path), localPath(parent.source));
  assert.deepEqual(receipt.inputs, localRecheckPins(manifest), 'recheck inputs differ from original source');
  for (const pin of receipt.inputs) {
    const bytes = raw(localPath(pin.path));
    assert.equal(bytes.length, pin.size, 'recheck current input size differs');
    assert.equal(sha(bytes), pin.sha256, 'recheck current input differs');
  }
  assert.deepEqual(receipt.command, parent.steps[0].command, 'recheck command differs');
  assert.deepEqual(receipt.environment, localRecheckEnvironment, 'recheck offline environment differs');
  assert.equal(receipt.exit_code, 0, 'recheck native exit');
  assert.equal(receipt.error, null, 'recheck error');
  for (const key of ['owner_removed', 'source_verified_before_and_after']) assert.equal(receipt[key], true, key);
  for (const key of ['dependencies_installed', 'remote_executed']) assert.equal(receipt[key], false, key);
  const runner = localPath('docs/evidence/d-resources-local-recheck-20261023.mjs');
  assert.equal(receipt.runner_sha256, sha(raw(runner)), 'recheck runner differs');
  assert.equal(path.dirname(receipt.owner), root, 'recheck owner outside workspace');
  assert.match(path.basename(receipt.owner), /^\.tmp-d-resources-recheck-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(receipt.owner), false, 'recheck owner still present');
  const prefix = file.slice(0, -5);
  assert.match(path.basename(file), /^d-resources-local-recheck-[a-f0-9]{32}\.json$/);
  files.push(file, runner);
  for (const [key, suffix] of [['log', '.jsonl'], ['stderr', '.stderr.txt']]) {
    const artifact = localPath(receipt[key].path);
    assert.equal(artifact, prefix + suffix, 'mixed recheck log');
    assert.equal(sha(raw(artifact)), receipt[key].sha256, 'recheck log altered');
    files.push(artifact);
  }
  return validateGoEvents(raw(prefix + '.jsonl').toString('utf8'));
}

export const localRecheckEnvironment = Object.freeze({
  GO111MODULE: 'on', GOWORK: 'off', GOFLAGS: '-mod=readonly -p=2', GOMAXPROCS: '2',
  GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off',
});

// Reproduce the legacy Windows CP936 console decoder for test NAME matching
// only. Unlike the WHATWG replacement decoder, Windows consumes an invalid
// two-byte sequence and writes '?'. Never apply this to values or repair logs.
export function legacyWindows936Name(name) {
  const bytes = Buffer.from(name, 'utf8'), decoder = new TextDecoder('gbk', { fatal: true });
  let text = '';
  for (let index = 0; index < bytes.length;) {
    const byte = bytes[index];
    if (byte < 0x80) { text += String.fromCharCode(byte); index++; continue; }
    const length = byte >= 0x81 && byte <= 0xfe ? 2 : 1;
    try { text += decoder.decode(bytes.subarray(index, index + length)); }
    catch { text += '?'; }
    index += length;
  }
  return text;
}

export function reviewResourcesMySQL(receiptFile, transcriptFile, { localRecheckFile } = {}) {
  const receiptPath = localPath(receiptFile);
  assert.match(path.basename(receiptPath), /^d-resources-mysql-\d{8}-\d{6}-[a-f0-9]{8}\.json$/, 'explicit run receipt required');
  const prefix = receiptPath.slice(0, -5);
  const receipt = json(receiptPath); validateReceipt(receipt, { suite: receipt.suite });
  assert.equal(path.resolve(receipt.source), prefix + '-source.json', 'mixed source capsule');
  assert.equal(path.dirname(path.resolve(receipt.owner)), root, 'owner outside workspace');
  assert.match(path.basename(receipt.owner), /^\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(receipt.owner), false, 'local owner still exists');
  const files = [receiptPath, localPath(receipt.source)];
  const manifest = json(files[1]); validateManifest(manifest);
  const critical = pin => fixedCritical.includes(pin.path) || pin.path.startsWith('backend/internal/systembackupresources/') || pin.path.startsWith('backend/internal/db/migrations/') || pin.path.startsWith('backend/cmd/system-backup-migrate/');
  const changed = [];
  for (const pin of manifest.files) {
    const file = localPath(pin.path);
    const bytes = fs.existsSync(file) ? raw(file) : null;
    const same = bytes !== null && bytes.length === pin.size && sha(bytes) === pin.sha256;
    if (!same) changed.push(pin.path);
    if (critical(pin)) assert.ok(same, 'critical source changed; recover exact frozen bytes before review: ' + pin.path);
  }
  for (const dir of ['backend/internal/systembackupresources', 'backend/internal/db/migrations', 'backend/cmd/system-backup-migrate']) {
    const disk = fs.readdirSync(localPath(dir), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).filter(name => /\.(go|json|sql)$/.test(name)).sort();
    assert.deepEqual(disk, manifest.files.filter(pin => pin.path.startsWith(dir + '/') && /\.(go|json|sql)$/.test(pin.path)).map(pin => pin.path).sort(), 'critical source file set changed: ' + dir);
  }
  assert.equal(sha(raw(localPath(inputPath))), receipt.inputs_sha256, 'capsule bytes differ');
  const capsule = json(localPath(inputPath));
  assert.equal(capsule.kind, 'd_resources_mysql_synthetic_inputs.v1'); assert.equal(capsule.production_approved, false);
  for (const migration of capsule.migrations) {
    const pin = manifest.files.find(item => item.path === 'backend/internal/db/migrations/' + migration.name);
    assert.ok(pin, 'migration pin missing'); assert.equal(pin.sha256, migration.sha256, 'migration input mismatch');
  }
  const bootstrap = raw(localPath('backend/internal/systembackupcontroller/bootstrap.go')).toString('utf8');
  const catalog = /ContractMigrationCatalogHash\s*=\s*"([a-f0-9]{64})"/.exec(bootstrap)?.[1];
  assert.match(catalog, hashPattern, 'catalog hash absent');
  const goNames = [];
  let localRechecked = false;
  let originalLocalJSONError = null;
  const legacyTestNames = [];
  receipt.steps.forEach((step, index) => {
    const file = localPath(step.log); assert.equal(file, `${prefix}-step-${index}.jsonl`, 'mixed native step log');
    files.push(file); const bytes = raw(file); assert.equal(sha(bytes), step.log_sha256, 'native step log altered');
    if (index < 2) {
      try { goNames.push(validateGoEvents(bytes.toString('utf8'))); }
      catch (error) {
        // Hash checks above still bind the damaged original. Only JSON decoding
        // failure in step 0 admits an explicitly bound same-source supplement;
        // failed/skipped tests and invalid metadata never use this path.
        if (index !== 0 || !(error instanceof SyntaxError) || !localRecheckFile) throw error;
        const parseable = bytes.toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).flatMap(line => {
          try { return [JSON.parse(line)]; } catch { return []; }
        });
        assert.ok(parseable.every(event => event.Package === 'clawreef/internal/systembackupresources'), 'damaged log contains another package');
        assert.ok(!parseable.some(event => event.Action === 'fail' || event.Action === 'skip'), 'damaged log contains failed/skipped event');
        assert.equal(parseable.at(-1)?.Action, 'pass', 'damaged log lacks terminal package pass');
        assert.equal(parseable.at(-1)?.Test, undefined, 'damaged log lacks terminal package pass');
        const names = reviewLocalRecheck(localRecheckFile, receiptPath, manifest, files);
        for (const name of new Set(parseable.filter(event => event.Test && ['run', 'pass'].includes(event.Action)).map(event => event.Test))) {
          if (names.includes(name)) continue;
          const matches = names.filter(native => legacyWindows936Name(native) === name);
          assert.equal(matches.length, 1, 'recheck lost original test coverage');
          legacyTestNames.push({ original_encoded_name: name, rechecked_native_name: matches[0] });
        }
        goNames.push(names);
        originalLocalJSONError = error.message;
        localRechecked = true;
      }
    }
  });
  assert.ok(!localRecheckFile || localRechecked, 'unnecessary local recheck override');
  const expectedSeeds=['TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed'];
  if(receipt.steps[1].command[5].includes('AResourcesWriteFK'))expectedSeeds.unshift('TestAResourcesWriteFKMySQLSeed');
  assert.deepEqual(goNames[1],expectedSeeds,'seed coverage');
  const writing = receipt.suite === 'writer';
  const baselinePath = localPath(writing ? 'docs/evidence/a-writer-fk-20261023-134215-75d1f525-fixed.jsonl' : 'docs/evidence/d-resources-rules-local-a7788a3e6b8a474db6fb5bb667aa36cd.jsonl');
  files.push(baselinePath);
  const baselineText = raw(baselinePath).toString('utf8').replace(/^\uFEFF/, '');
  const baselinePackage = JSON.parse(baselineText.split(/\r?\n/)[0]).Package;
  assert.match(baselinePackage, writing ? /^_\/.*\/\.tmp-a-writer-fk-[a-f0-9]{32}\/source\/backend\/internal\/systembackupresources$/ : /^_\/.*\/\.tmp-d-resources-rules-a7788a3e6b8a474db6fb5bb667aa36cd\/source\/backend\/internal\/systembackupresources$/);
  const baseline = validateGoEvents(baselineText, baselinePackage);
  assert.equal(baseline.length, writing ? 843 : 678, 'historical baseline case count');
  assert.ok(baseline.every(name => goNames[0].includes(name)), 'existing resources coverage lost');
  const transcriptPath = localPath(transcriptFile ?? prefix + '.txt'); files.push(transcriptPath);
  const remote = validateRemoteTranscript(raw(transcriptPath).toString('utf8'), receipt, {
    migrationCount: capsule.migrations.length, lastMigration: capsule.migrations.at(-1).name.split('_')[0], catalogHash: catalog,
  });
  return {
    kind: 'd_resources_mysql_actual_evidence_review.v1', scope: receipt.suite === 'writer' ? 'isolated_synthetic_writer_only' : 'isolated_synthetic_readback_only',
    ...remote, local_pass_events: goNames[0].length, old_pass_events_preserved: baseline.length,
    original_local_step0_valid_json: !localRechecked, local_step0_rechecked_same_inputs: localRechecked,
    original_local_step0_json_error: originalLocalJSONError,
    original_local_step0_legacy_test_names: legacyTestNames,
    source_sha256: manifest.source_sha256, current_all_frozen_files_match: changed.length === 0,
    unrelated_source_drift: changed, cleanup_recorded: true, local_owner_absence_checked: true,
    remote_cleanup_independently_queried: false, full_restore_accepted: false,
    C_scan_semantics_accepted: false, foreign_keys_accepted: false, ddl_freeze_accepted: false,
    production_approved: false, dependencies_installed: false,
    artifacts: [...new Set(files)].map(file => ({ path: path.relative(root, file).replaceAll('\\', '/'), sha256: sha(raw(file)) })),
    reviewer_sha256: sha(raw(fileURLToPath(import.meta.url))),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length >= 1, 'Usage: node docs/evidence/d-resources-mysql-actual-review-20261023.mjs <receipt.json> [--transcript <console.txt>] [--local-recheck <receipt.json>] [--out <new-review.json>]');
    const receipt = args.shift(); let transcript; let output; let localRecheckFile;
    while (args.length) {
      const flag = args.shift(); assert.ok(args.length && ['--transcript', '--local-recheck', '--out'].includes(flag), 'invalid arguments');
      if (flag === '--transcript') { assert.equal(transcript, undefined); transcript = args.shift(); }
      else if (flag === '--local-recheck') { assert.equal(localRecheckFile, undefined); localRecheckFile = args.shift(); }
      else { assert.equal(output, undefined); output = args.shift(); }
    }
    const result = reviewResourcesMySQL(receipt, transcript, { localRecheckFile });
    if (output) {
      const destination = localPath(output);
      assert.ok(destination.startsWith(path.join(root, 'docs/evidence') + path.sep), 'review output must be in docs/evidence');
      fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('RESOURCES_ACTUAL_REVIEW_REJECTED: ' + error.message); process.exitCode = 1;
  }
}
