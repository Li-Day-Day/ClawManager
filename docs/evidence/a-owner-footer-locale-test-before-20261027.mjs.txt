// Parser counterexamples only. The successful transcript below exists solely
// in memory; it is synthetic and MUST NOT become an actual-MySQL receipt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateOwnerEvidence, loadReviewedOwnerBaseline, localStages, decode, workspace, ownerCases, sha256, frozenMigrationCatalog} from './a-download-owners-actual-review-20261020.mjs';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';

const fromEvidence = p => fs.readFileSync(path.join(workspace, 'docs/evidence', p));
const actualLocal = decode(fromEvidence('a-download-owners-local-repair-20261020-144930-6819f05e.txt'));
const sourceBytes = fromEvidence('a-download-owners-local-repair-source-20261020-144930-6819f05e.json');
const source = JSON.parse(decode(sourceBytes));
const stages = localStages(actualLocal);
assert.equal(stages[0].names.length + stages[1].names.length, 4623);
assert.equal(stages[2].names.length, 13);
const baselineEvents = stages.slice(0, 2).flatMap(s => [
  ...s.names.flatMap(Test => [{Package: s.package, Test, Action: 'run'}, {Package: s.package, Test, Action: 'pass'}]),
  {Package: s.package, Action: 'pass'}
]);
const prefix = actualLocal.slice(0, actualLocal.indexOf('CLEANED local-registration-build-cache=True'));
const owner = prefix.match(/^LOCAL_OWNER config-writer-source=(.+)$/m)[1].trim();
const probe = prefix.match(/binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})/);
const runner = prefix.match(/migration_binary_sha256=([a-f0-9]{64})/)[1];
const catalog = frozenMigrationCatalog(source);
const root = 'TestASQLTaskDownloadOwnersMySQL';
const namespace = 'sbk-mig-261020000000-aaaa', uid = '11111111-2222-4333-8444-555555555555';
const fixture = prefix + 'bundle.tar: OK\n' +
  `RUN namespace=${namespace} uid=${uid} app_image=fixture/app@sha256:${'a'.repeat(64)} mysql_image=fixture/mysql@sha256:${'b'.repeat(64)} mysql_version=8.4.8\n` +
  JSON.stringify({config_activated: false, historical_equivalence_verified: false, human_mfa_verified: false, migration_catalog_sha256: catalog.hash, migration_count: 95, result: 'PASS'}) + '\n' +
  `PASS pinned-migration-runner binary_sha256=${runner} catalog_sha256=${catalog.hash}\n` +
  'PASS fresh-migration-replay=001..080 applied=95 exact_filenames=yes\n' +
  `=== RUN   ${root}\n` + ownerCases.map((name, n) => `=== RUN   ${root}/${name}\n` +
    (name === 'original_owner_lock' ? '    owner.go:1: OBSERVED actual SQL owner/reference lock wait system_backups\n' : '') +
    (name === 'empty_reference_range' ? '    owner.go:1: OBSERVED actual SQL owner/reference lock wait system_backup_dependency_health\n' : '') +
    `    fixture.go:1: CLEANED download MFA owned database amfa_${(n + 1).toString(16).padStart(32, '0')}\n` +
    `--- PASS: ${root}/${name} (0.01s)\n`).join('') +
  '    owner.go:1: PASS actual SQL task owner cases=11 owner_adapter=SQLTaskDownloadOwners production_tasks=no provider_read=no production_approval=no\n' +
  `--- PASS: ${root} (0.11s)\nPASS\n` +
  `PASS a-download-owners-mysql binary_sha256=${probe[1]} inputs_sha256=${probe[2]} new_cases=11 owner_adapter=SQLTaskDownloadOwners production_tasks=no human_mfa=no provider_read=no production_approval=no\n` +
  `CLEANED namespace=${namespace} uid=${uid}\nCLEANED remote-registration-scratch=yes\nCLEANED local-registration-build-cache=True\n` +
  'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True\n' +
  `LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True\n` +
  'a_download_owners_mysql_remote_exit=0\n**********************\nPowerShell transcript end\nEnd time: 20261020000100\n';
const cache = new Map();
const readFile = p => { if (!cache.has(p)) cache.set(p, fs.readFileSync(path.join(workspace, p))); return cache.get(p); };
const options = {sourceBytes, baselineSource: source, baselineEvents, catalog, readFile};
const validate = (log, extra = {}) => validateOwnerEvidence({...options, logBytes: Buffer.from(log), ...extra});
const passed = [];
function accept(name, logBytes, extra = {}) {
  const result = validateOwnerEvidence({...options, logBytes, ...extra});
  assert.equal(result.actual_case_count, 11); assert.equal(result.cleaned_databases.length, 11);
  assert.equal(result.production_approved, false); passed.push(name);
}
accept('synthetic UTF-8 complete fixture (not SQL evidence)', Buffer.from(fixture));
accept('synthetic UTF-16LE transcript and manifest', Buffer.concat([Buffer.from([255, 254]), Buffer.from(fixture, 'utf16le')]), {sourceBytes: Buffer.concat([Buffer.from([255, 254]), Buffer.from(decode(sourceBytes), 'utf16le')])});
function rejected(name, log, extra = {}, code) {
  assert.throws(() => validate(log, extra), e => e instanceof Error && (!code || e.message === code), name); passed.push(name);
}
function replace(old, next) { assert.ok(fixture.includes(old), 'mutation target exists: ' + old); return fixture.replace(old, next); }
rejected('real local-only successful preparation is not actual SQL', actualLocal, {}, 'one_actual_remote_run');
rejected('real 15:29 snapshot failure is not actual SQL', decode(fromEvidence('a-download-owners-mysql-remote-20261020-152911-f87d0e35.txt')), {}, 'one_frozen_source');
rejected('real 13:34 failed Go gate is not actual SQL', decode(fromEvidence('a-download-owners-mysql-remote-20261020-133409-ebbf810b.txt')), {}, 'no_test_failure_skip_panic_or_pending_cleanup');
rejected('missing leaf RUN', replace(`=== RUN   ${root}/backup\n`, ''));
rejected('duplicate leaf RUN', replace(`=== RUN   ${root}/backup\n`, `=== RUN   ${root}/backup\n=== RUN   ${root}/backup\n`));
rejected('missing leaf PASS', replace(`--- PASS: ${root}/backup (0.01s)\n`, ''));
rejected('extra previously accepted MFA suite', replace(`=== RUN   ${root}\n`, `=== RUN   ${root}\n=== RUN   TestASensitiveDownloadMFAMySQL\n`));
rejected('SKIP masked by a total PASS', replace(`--- PASS: ${root}/backup`, `--- SKIP: ${root}/backup`));
rejected('failure before later success', 'FAIL clawreef/internal/systembackupevidence\n' + fixture);
rejected('wrong frozen source in log', replace(`source_sha256=${source.source_sha256}`, `source_sha256=${'e'.repeat(64)}`));
const badSource = structuredClone(source); badSource.files[0].size++;
rejected('manifest bytes changed without logical SHA', fixture, {sourceBytes: Buffer.from(JSON.stringify(badSource))});
const unsafe = structuredClone(source); unsafe.files[0].path = 'backend/../secrets.txt';
rejected('unsafe manifest path', fixture, {sourceBytes: Buffer.from(JSON.stringify(unsafe))});
rejected('packaged seed omitted', replace('--- PASS: TestASQLTaskDownloadOwnersMySQLSeed (0.10s)', ''));
rejected('duplicate remote run', replace(`RUN namespace=${namespace}`, `RUN namespace=${namespace} uid=${uid} app_image=a mysql_image=b mysql_version=8.4.8\nRUN namespace=${namespace}`));
rejected('namespace cleanup uses different UID', replace(`CLEANED namespace=${namespace} uid=${uid}`, `CLEANED namespace=${namespace} uid=99999999-2222-4333-8444-555555555555`));
rejected('only ten databases cleaned', replace('CLEANED download MFA owned database amfa_00000000000000000000000000000001', 'database cleanup omitted'));
rejected('same database claimed by two cases', replace('amfa_00000000000000000000000000000002', 'amfa_00000000000000000000000000000001'));
rejected('lock wait wrong table', replace('OBSERVED actual SQL owner/reference lock wait system_backups', 'OBSERVED actual SQL owner/reference lock wait wrong_table'));
rejected('lock observation attached to wrong case', replace(`=== RUN   ${root}/backup\n`, `=== RUN   ${root}/backup\nOBSERVED actual SQL owner/reference lock wait system_backups\n`).replace('    owner.go:1: OBSERVED actual SQL owner/reference lock wait system_backups\n', ''));
rejected('remote binary differs from compiled binary', replace(`PASS a-download-owners-mysql binary_sha256=${probe[1]}`, `PASS a-download-owners-mysql binary_sha256=${'e'.repeat(64)}`));
rejected('remote capsule differs from frozen bytes', replace(`inputs_sha256=${probe[2]}`, `inputs_sha256=${'e'.repeat(64)}`));
rejected('94 migrations presented as complete', replace('"migration_count":95', '"migration_count":94'));
rejected('runner mismatch', replace(`PASS pinned-migration-runner binary_sha256=${runner}`, `PASS pinned-migration-runner binary_sha256=${'e'.repeat(64)}`));
rejected('pending cleanup masked by success', fixture + 'CLEANUP_PENDING namespace=fixture\n');
rejected('outer exit remains failure', replace('a_download_owners_mysql_remote_exit=0', 'a_download_owners_mysql_remote_exit=1'));
rejected('local owned source still exists', fixture, {exists: p => p === owner});
rejected('source owner not a direct workspace child', fixture.replaceAll(owner, path.resolve(workspace, '..', '.tmp-d-index-cache-' + 'a'.repeat(32))));
rejected('final frozen postcheck missing', replace('LOCAL_PASS config-writer-frozen-postcheck=yes', 'postcheck missing'));
rejected('local-only flag despite remote-looking appended log', replace('remote-requested=True', 'remote-requested=False'));
rejected('bundle digest transfer check missing', replace('bundle.tar: OK', 'bundle check omitted'));
rejected('truncated transcript', fixture.slice(0, fixture.indexOf('PowerShell transcript end')));
rejected('baseline missing a full-package PASS', fixture, {baselineEvents: baselineEvents.filter(e => e.Test || e.Package !== 'clawreef/internal/systembackupsecurity')});
function rebind(manifest) {
  manifest.source_sha256 = sha256(manifest.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n');
  return {log: fixture.replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${manifest.source_sha256} files=${manifest.files.length}`), sourceBytes: Buffer.from(JSON.stringify(manifest))};
}
const ordinaryChanged = structuredClone(source);
ordinaryChanged.files.find(f => f.path.endsWith('/download_retention_gc_task.go')).sha256 = 'e'.repeat(64);
const changed = rebind(ordinaryChanged);
rejected('new ordinary source requires new full test inventory baseline', changed.log, {sourceBytes: changed.sourceBytes}, 'ordinary_input_drift_requires_new_baseline');
const removedGo = structuredClone(source); removedGo.files = removedGo.files.filter(f => !f.path.endsWith('/download_retention_gc_task.go'));
const removed = rebind(removedGo);
rejected('removed ordinary source is not hidden', removed.log, {sourceBytes: removed.sourceBytes}, 'ordinary_input_not_removed');
const newGo = structuredClone(source), fakePath = 'backend/internal/systembackupevidence/fake_mysql_test.go', fakeBytes = Buffer.from('package systembackupevidence\n');
newGo.files.push({path: fakePath, size: fakeBytes.length, sha256: sha256(fakeBytes)});
const added = rebind(newGo);
rejected('mysql filename without actual build tag is ordinary input', added.log, {sourceBytes: added.sourceBytes, readFile: p => p === fakePath ? fakeBytes : readFile(p)}, 'new_tagged_input_verified');

// Complete new-baseline fixtures stay in memory. They do not represent SQL.
const nilSourceBytes = fromEvidence('a-gc-nil-adapters-20261020-r1-source.json');
const nilBaseline = loadReviewedOwnerBaseline(nilSourceBytes);
assert.equal(nilBaseline.baselineSource.source_sha256, JSON.parse(decode(nilSourceBytes)).source_sha256);
passed.push('historical nil source still selects original complete baseline');
const batchSourceBytes = fromEvidence('d-download-gc-batch-20261020-r3-source.json');
const batchSource = JSON.parse(decode(batchSourceBytes));
const batchBaseline = loadReviewedOwnerBaseline(batchSourceBytes);
assert.equal(batchBaseline.baselineSource.source_sha256, batchSource.source_sha256);
passed.push('reviewed batch source selects new complete baseline');
const packageNames = stages.slice(0, 2).map(s => s.package);
const batchLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = batchBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const batchFixture = fixture.replace(prefix, batchLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${batchSource.source_sha256} files=${batchSource.files.length}`);
const batchOptions = {sourceBytes: batchSourceBytes, ...batchBaseline};
accept('synthetic complete batch-baseline fixture (not SQL evidence)', Buffer.from(batchFixture), batchOptions);
rejected('new batch tests cannot use old nil inventory', batchFixture, {...batchOptions, baselineEvents: nilBaseline.baselineEvents}, 'ordinary_exact_test_inventory_clawreef/internal/systembackupevidence');
rejected('old tests cannot be accepted as new complete inventory', fixture, {baselineEvents: batchBaseline.baselineEvents}, 'ordinary_exact_test_inventory_clawreef/internal/systembackupevidence');
const batchMissing = batchFixture.replace('--- PASS: TestDownloadRetentionGCBatchUsesFreshCollector/collected (0.01s)\n', '');
rejected('new batch inventory missing a PASS still rejected', batchMissing, batchOptions, 'local_run_pass_pairing');
const batchChanged = structuredClone(batchSource);
batchChanged.files.find(f => f.path.endsWith('/download_retention_gc_batch.go')).sha256 = 'e'.repeat(64);
batchChanged.source_sha256 = sha256(batchChanged.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n');
rejected('reviewed batch baseline does not allow further ordinary changes', batchFixture.replace(`source_sha256=${batchSource.source_sha256}`, `source_sha256=${batchChanged.source_sha256}`), {...batchOptions, sourceBytes: Buffer.from(JSON.stringify(batchChanged))}, 'ordinary_input_drift_requires_new_baseline');
const ps51Fixture = batchFixture.replaceAll('TestGCSchedulingDueTimeEnforcedUnderClaimLock/-1µs', 'TestGCSchedulingDueTimeEnforcedUnderClaimLock/-1碌s').replaceAll('TestGCSchedulingDueTimeEnforcedUnderClaimLock/1µs', 'TestGCSchedulingDueTimeEnforcedUnderClaimLock/1碌s').replaceAll('TestRecoverySchedulingRecheckedUnderClaimLock/-1µs', 'TestRecoverySchedulingRecheckedUnderClaimLock/-1碌s').replaceAll('TestRecoverySchedulingRecheckedUnderClaimLock/1µs', 'TestRecoverySchedulingRecheckedUnderClaimLock/1碌s');
accept('four exact PowerShell native-output aliases preserve complete inventory', Buffer.from(ps51Fixture), batchOptions);
rejected('unregistered encoding alias is not accepted', batchFixture.replaceAll('TestGCSchedulingDueTimeEnforcedUnderClaimLock/0s', 'TestGCSchedulingDueTimeEnforcedUnderClaimLock/0碌s'), batchOptions, 'ordinary_exact_test_inventory_clawreef/internal/systembackupevidence');
const gcSourceBytes = fromEvidence('d-download-gc-producer-20261021-r5-source.json');
const gcSource = JSON.parse(decode(gcSourceBytes)), gcBaseline = loadReviewedOwnerBaseline(gcSourceBytes);
assert.equal(gcBaseline.baselineSource.source_sha256, gcSource.source_sha256);
passed.push('repaired GC producer source selects its independently reviewed complete baseline');
const gcLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = gcBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const gcFixture = fixture.replace(prefix, gcLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${gcSource.source_sha256} files=${gcSource.files.length}`);
const gcOptions = {sourceBytes: gcSourceBytes, ...gcBaseline};
accept('synthetic complete repaired GC producer baseline fixture (not SQL evidence)', Buffer.from(gcFixture), gcOptions);
rejected('new GC producer tests cannot use prior batch inventory', gcFixture, {...gcOptions, baselineEvents: batchBaseline.baselineEvents}, 'ordinary_exact_test_inventory_clawreef/internal/systembackupevidence');
rejected('prior batch tests cannot pass as new GC producer complete inventory', batchFixture, {...batchOptions, baselineEvents: gcBaseline.baselineEvents}, 'ordinary_exact_test_inventory_clawreef/internal/systembackupevidence');
const gcMissing = gcFixture.replace('--- PASS: TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback/late_expired_reference (0.01s)\n', '');
rejected('previously failed collector leaf cannot be omitted', gcMissing, gcOptions, 'local_run_pass_pairing');
const gcChanged = structuredClone(gcSource);
gcChanged.files.find(f => f.path.endsWith('/download_retention_gc_producer.go')).sha256 = 'e'.repeat(64);
gcChanged.source_sha256 = sha256(gcChanged.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n');
rejected('new GC producer baseline still rejects ordinary source changes', gcFixture.replace(`source_sha256=${gcSource.source_sha256}`, `source_sha256=${gcChanged.source_sha256}`), {...gcOptions, sourceBytes: Buffer.from(JSON.stringify(gcChanged))}, 'ordinary_input_drift_requires_new_baseline');
rejected('real completed 10:06 local failure cannot be accepted with repaired inventory', decode(fromEvidence('a-download-owners-mysql-remote-20261021-100630-92ddbad0.txt')), {sourceBytes: fromEvidence('a-download-owners-mysql-remote-source-20261021-100630-92ddbad0.json'), ...gcBaseline}, 'no_test_failure_skip_panic_or_pending_cleanup');
const journalSourceBytes = fromEvidence('a-gc-journal-20261021-r1-full-source.json');
const journalSource = JSON.parse(decode(journalSourceBytes)), journalBaseline = loadReviewedOwnerBaseline(journalSourceBytes);
assert.equal(journalBaseline.baselineSource.source_sha256, journalSource.source_sha256);
assert.equal(journalBaseline.baselineEvents.filter(e => packageNames.includes(e.Package) && e.Test && e.Action === 'pass').length, 4967);
const journalLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = journalBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const journalFixture = fixture.replace(prefix, journalLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${journalSource.source_sha256} files=${journalSource.files.length}`);
accept('synthetic current journal baseline preserves all 4967 ordinary checks (not SQL evidence)', Buffer.from(journalFixture), {sourceBytes: journalSourceBytes, ...journalBaseline});
const cancelSourceBytes = fromEvidence('a-journal-cancel-20261021-r1-full-source.json');
const cancelSource = JSON.parse(decode(cancelSourceBytes)), cancelBaseline = loadReviewedOwnerBaseline(cancelSourceBytes);
assert.equal(cancelBaseline.baselineSource.source_sha256, cancelSource.source_sha256);
assert.equal(cancelBaseline.baselineEvents.filter(e => packageNames.includes(e.Package) && e.Test && e.Action === 'pass').length, 4977);
const cancelLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = cancelBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const cancelFixture = fixture.replace(prefix, cancelLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${cancelSource.source_sha256} files=${cancelSource.files.length}`);
accept('synthetic frozen queue-cancellation baseline preserves all 4977 ordinary checks (not SQL evidence)', Buffer.from(cancelFixture), {sourceBytes: cancelSourceBytes, ...cancelBaseline});
const connectionSourceBytes = fromEvidence('a-gc-connection-integration-20261021-r1-source.json');
const connectionSource = JSON.parse(decode(connectionSourceBytes)), connectionBaseline = loadReviewedOwnerBaseline(connectionSourceBytes);
assert.equal(connectionBaseline.baselineSource.source_sha256, connectionSource.source_sha256);
assert.equal(connectionBaseline.baselineEvents.filter(e => packageNames.includes(e.Package) && e.Test && e.Action === 'pass').length, 5012);
const connectionLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = connectionBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const connectionFixture = fixture.replace(prefix, connectionLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${connectionSource.source_sha256} files=${connectionSource.files.length}`);
accept('synthetic merged connection and journal baseline preserves all 5012 ordinary checks (not SQL evidence)', Buffer.from(connectionFixture), {sourceBytes: connectionSourceBytes, ...connectionBaseline});
const readSourceBytes = fromEvidence('a-read-completion-integration-20261021-r1-source.json');
const readSource = JSON.parse(decode(readSourceBytes)), readBaseline = loadReviewedOwnerBaseline(readSourceBytes);
assert.equal(readBaseline.baselineSource.source_sha256, readSource.source_sha256);
assert.equal(readBaseline.baselineEvents.filter(e => packageNames.includes(e.Package) && e.Test && e.Action === 'pass').length, 5019);
const readLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = readBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const readFixture = fixture.replace(prefix, readLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${readSource.source_sha256} files=${readSource.files.length}`);
accept('synthetic merged HTTP and read boundary baseline preserves all 5019 ordinary checks (not SQL evidence)', Buffer.from(readFixture), {sourceBytes: readSourceBytes, ...readBaseline});
const bindingSourceBytes = fromEvidence('a-check-evidence-binding-20261021-r2-source.json');
const bindingSource = JSON.parse(decode(bindingSourceBytes)), bindingBaseline = loadReviewedOwnerBaseline(bindingSourceBytes);
assert.equal(bindingBaseline.baselineSource.source_sha256, bindingSource.source_sha256);
assert.equal(bindingBaseline.baselineEvents.filter(e => packageNames.includes(e.Package) && e.Test && e.Action === 'pass').length, 5019);
const bindingLocal = prefix.slice(0, prefix.indexOf('=== RUN')) + packageNames.map(p => {
  const names = bindingBaseline.baselineEvents.filter(e => e.Package === p && e.Test && e.Action === 'pass').map(e => e.Test);
  return names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + `ok  ${p}  1.000s\n`;
}).join('') + prefix.slice(stages[1].end);
const bindingFixture = fixture.replace(prefix, bindingLocal).replace(`source_sha256=${source.source_sha256} files=${source.files.length}`, `source_sha256=${bindingSource.source_sha256} files=${bindingSource.files.length}`);
accept('synthetic check/evidence binding source retains all 5019 ordinary checks (not SQL evidence)', Buffer.from(bindingFixture), {sourceBytes: bindingSourceBytes, ...bindingBaseline});
const inplaceSourceBytes = fromEvidence('a-download-owners-inplace-fixture-20261021-r1-source.json');
const inplaceSource = JSON.parse(decode(inplaceSourceBytes)), inplaceBaseline = loadReviewedOwnerBaseline(inplaceSourceBytes);
const composedSource = JSON.parse(decode(fromEvidence('a-download-gc-role-mysql-remote-source-20261021-142757-6ad9fc5f.json')));
assert.equal(inplaceBaseline.baselineSource.source_sha256, composedSource.source_sha256);
assert.equal(inplaceBaseline.baselineEvents.filter(e => packageNames.includes(e.Package) && e.Test && e.Action === 'pass').length, 5019);
const inplaceFixture = bindingFixture.replace(`source_sha256=${bindingSource.source_sha256} files=${bindingSource.files.length}`, `source_sha256=${inplaceSource.source_sha256} files=${inplaceSource.files.length}`);
accept('synthetic composed business source and current tagged INPLACE fixture retain all 5019 checks (not SQL evidence)', Buffer.from(inplaceFixture), {sourceBytes: inplaceSourceBytes, ...inplaceBaseline});
const pruneSourceBytes=fromEvidence('d-prune-identity-published-context-20261021.json'),pruneSource=JSON.parse(decode(pruneSourceBytes)),pruneBaseline=loadReviewedOwnerBaseline(pruneSourceBytes),pruneCatalog=frozenMigrationCatalog(pruneSource);
assert.equal(pruneBaseline.baselineSource.source_sha256,pruneSource.source_sha256);assert.equal(pruneCatalog.file_count,96);
const newCapsule=pruneSource.files.find(f=>f.path==='backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json').sha256;
const pruneFixture=bindingFixture.replace(`source_sha256=${bindingSource.source_sha256} files=${bindingSource.files.length}`,`source_sha256=${pruneSource.source_sha256} files=${pruneSource.files.length}`).replaceAll(catalog.hash,pruneCatalog.hash).replaceAll(probe[2],newCapsule).replace('"migration_count":95','"migration_count":96').replace('001..080 applied=95','001..081 applied=96');
const pruneOptions={sourceBytes:pruneSourceBytes,...pruneBaseline,catalog:pruneCatalog};
accept('synthetic reviewed 96-file source and complete unchanged owner inventory (not SQL evidence)',Buffer.from(pruneFixture),pruneOptions);
rejected('95-count result cannot satisfy reviewed 96-file source',pruneFixture.replace('"migration_count":96','"migration_count":95'),pruneOptions,'migration_identity_and_scope');
rejected('old 95-file replay marker cannot satisfy 96-file source',pruneFixture.replace('001..081 applied=96','001..080 applied=95'),pruneOptions,'complete_formal_catalog_from_reviewed_source');
const actual95Source=JSON.parse(decode(fromEvidence('a-download-owners-mysql-remote-source-20261021-134326-f36b8b74.json')));
const actual95Log=decode(fromEvidence('a-download-owners-mysql-remote-20261021-134326-f36b8b74.txt'));
const migrated95=JSON.parse(actual95Log.match(/^\{"config_activated":false,.*"result":"PASS"\}\s*$/m)[0]);
assert.equal(frozenMigrationCatalog(actual95Source).hash,migrated95.migration_catalog_sha256);passed.push('95-file frozen catalog matches original real migration hash; failed SQL suite remains failed');
assert.deepEqual(pruneCatalog,computeMigrationCatalog());passed.push('96-file frozen catalog matches official current catalog algorithm');
const firstSQL=source.files.find(f=>f.path.startsWith('backend/internal/db/migrations/')&&f.path.endsWith('.sql')).path;
assert.throws(()=>frozenMigrationCatalog(source,p=>p===firstSQL?Buffer.concat([readFile(p),Buffer.from(' ')]):readFile(p)),e=>e.message==='frozen_catalog_file_pin');passed.push('frozen catalog rejects changed SQL bytes before deriving a hash');
const depSourceBytes=fromEvidence('a-owner-dependency-freeze-20261021-source.json'),depSource=JSON.parse(decode(depSourceBytes)),depBaseline=loadReviewedOwnerBaseline(depSourceBytes);
assert.equal(depBaseline.baselineSource.source_sha256,depSource.source_sha256);
const depFixture=pruneFixture.replace(`source_sha256=${pruneSource.source_sha256} files=${pruneSource.files.length}`,`source_sha256=${depSource.source_sha256} files=${depSource.files.length}`),depOptions={sourceBytes:depSourceBytes,...depBaseline,catalog:pruneCatalog};
accept('synthetic reviewed unchanged owner dependency closure; resources failures not accepted',Buffer.from(depFixture),depOptions);
const badDep=structuredClone(depSource);badDep.files.find(f=>f.path==='backend/internal/systembackupresources/sql_counts.go').sha256='0'.repeat(64);badDep.source_sha256=sha256(badDep.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n');
rejected('further resources edits still require another reviewed source',depFixture.replace(depSource.source_sha256,badDep.source_sha256),{...depOptions,sourceBytes:Buffer.from(JSON.stringify(badDep))},'ordinary_input_drift_requires_new_baseline');
console.log(JSON.stringify({status: 'PASS', parser_checks: passed.length, checks: passed, successful_transcripts: 'synthetic_in_memory_only', actual_mysql_cases_executed: 0, actual_acceptance_receipts_written: 0, dependencies_installed: false, test_build_artifacts_created: false}));
