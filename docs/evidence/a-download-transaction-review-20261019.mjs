import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [logName, sourceName, initialLogName, initialSourceName, middleLogName, middleSourceName, nativeLogName] = process.argv.slice(2);
assert.ok(logName && sourceName && initialLogName && initialSourceName && middleLogName && middleSourceName, 'final and both failed rounds require their original transcripts and manifests');
const bytes = name => fs.readFileSync(name);
const text = name => bytes(name).toString('utf8').replace(/^\uFEFF/, '');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const source = JSON.parse(text(sourceName)), log = text(logName), checks = [];
const initialSource = JSON.parse(text(initialSourceName)), initialLog = text(initialLogName);
const middleSource = JSON.parse(text(middleSourceName)), middleLog = text(middleLogName);
const nativeLog = nativeLogName ? text(nativeLogName) : null;
const nativeRunnerPath = 'scripts/system-backup-d-download-admission-native-validation.ps1';
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
check('stable source snapshot without dependency installation', source.stable_copy_verified && source.dependencies_installed === false);
check('source capture bounded before build', source.capture_attempts >= 1 && source.capture_attempts <= 3);
check('frozen input paths unique', source.files.length === new Set(source.files.map(p => p.path)).size);
const canonicalPins = source.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n';
check('source logical digest independently recomputed', sha256(Buffer.from(canonicalPins)) === source.source_sha256);
check('original D contract decision remains unchanged at independent review', sha256(bytes('docs/evidence/system-backup-d-sensitive-download-contract-20261016.json')) === (source.contract_decision_sha256 ?? middleSource.contract_decision_sha256));
if (nativeLog) {
  check('native executor reported exact three packages with default vet and exit zero', /^NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/cmd\/server default_vet=yes\s*$/m.test(nativeLog));
  check('native outer wrapper exit zero', /^d_admission_native_exit=0\s*$/m.test(nativeLog));
  check('native frozen source postcheck passed', nativeLog.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'));
  const runner = bytes(nativeRunnerPath), runnerPin = source.files.find(p => p.path === nativeRunnerPath);
  check('actual native runner code matches its frozen pin', runnerPin && runner.length === runnerPin.size && sha256(runner) === runnerPin.sha256);
  const runnerText = runner.toString('utf8');
  check('runner disables downloads and inherited Go flags without disabling vet', runnerText.includes("$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS=''") && !runnerText.includes('-vet=off') && runnerText.includes("'test','-mod=readonly','-p=2','-count=1','-timeout=300s','-json'"));
  check('runner isolates and disables telemetry', runnerText.includes("$env:TEST_TELEMETRY_DIR=Join-Path $nativeOwner 'telemetry'") && runnerText.includes("'off 2026-10-19'"));
} else {
  check('full security and evidence package invocation with default vet', log.includes('LOCAL_STAGE sensitive-download-two-full-packages default-vet=yes retry=no dependency-downloads=no'));
  check('Go process exit zero', /^SENSITIVE_DOWNLOAD_GO_EXIT=0\s*$/m.test(log));
  check('outer process exit zero', /^a_download_transaction_validation_exit=0\s*$/m.test(log));
  check('frozen source and contract postchecks passed', log.includes('frozen-postcheck=yes d-decision-postcheck=yes default-vet=yes'));
  check('isolated Go telemetry disabled', log.includes('LOCAL_PASS isolated-go-telemetry=off'));
}
const events = log.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
check('no test or package failed', !events.some(e => e.Action === 'fail'));
check('no tests or packages skipped', !events.some(e => e.Action === 'skip'));
const passed = events.filter(e => e.Action === 'pass' && e.Test);
check('passed test names unique within each package', new Set(passed.map(e => `${e.Package}:${e.Test}`)).size === passed.length);
const packageNames = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence', ...(nativeLog ? ['clawreef/cmd/server'] : [])];
check('every complete package passed once with no extra package terminal', events.filter(e => e.Action === 'pass' && !e.Test).length === packageNames.length && packageNames.every(p => events.filter(e => e.Action === 'pass' && !e.Test && e.Package === p).length === 1));
const initialEvents = initialLog.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
const initialFailures = initialEvents.filter(e => e.Action === 'fail');
check('first round remains failed with actual Go and wrapper exit one', /^SENSITIVE_DOWNLOAD_GO_EXIT=1\s*$/m.test(initialLog) && /^a_download_transaction_validation_exit=1\s*$/m.test(initialLog));
check('first round failure is only the invalid whitespace attack and its parent/package', initialFailures.length === 3 && initialFailures.some(e => e.Test === 'TestAAdmissionFinalCallbackCannotReplaceOriginalRows/audit_original_bytes') && initialFailures.every(e => !e.Test || ['TestAAdmissionFinalCallbackCannotReplaceOriginalRows/audit_original_bytes', 'TestAAdmissionFinalCallbackCannotReplaceOriginalRows'].includes(e.Test)));
check('first round stable source digest recomputed', initialSource.stable_copy_verified && sha256(Buffer.from(initialSource.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n')) === initialSource.source_sha256);
check('first round security package was already green', initialEvents.filter(e => e.Action === 'pass' && !e.Test && e.Package === packageNames[0]).length === 1);
const middleEvents = middleLog.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
const middleFailures = middleEvents.filter(e => e.Action === 'fail');
check('second frozen round remains failed with exit one', /^SENSITIVE_DOWNLOAD_GO_EXIT=1\s*$/m.test(middleLog) && /^a_download_transaction_validation_exit=1\s*$/m.test(middleLog));
check('second round failures explicitly include the pinned environment fixture and publication execution expiry', middleFailures.length === 15 && middleFailures.every(e => !e.Test || e.Test === 'TestDownloadAdmissionPinnedEnvironmentCombinesRealModules' || e.Test === 'TestDownloadAdmissionPinnedEnvironmentRejectsChangedSourcesAtomically' || e.Test.startsWith('TestDownloadAdmissionPinnedEnvironmentRejectsChangedSourcesAtomically/') || e.Test === 'TestSystemPublicationConstructorAndReadBoundaries'));
check('second round publication failure retains its actual expiry diagnostic', middleEvents.some(e => e.Test === 'TestSystemPublicationConstructorAndReadBoundaries' && e.Output?.includes('system_publication_test.go:404: producer_committed_but_execution_expired')));
check('publication boundary root passed in the final complete gate', passed.some(e => e.Test === 'TestSystemPublicationConstructorAndReadBoundaries'));
check('second round source digest independently recomputed', middleSource.stable_copy_verified && sha256(Buffer.from(middleSource.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n')) === middleSource.source_sha256);
const expected = new Map([
  ['TestAAdmissionFinalCallbackCannotReplaceOriginalRows', 15],
  ['TestAAdmissionRejectsTransportBeforeOpeningTransaction', 6],
  ['TestAAdmissionProofAndHistoryFailuresPrecedeKeyOrNonceEffects', 7],
  ['TestAAdmissionFinalAuditJSONFormattingIsEquivalent', 1],
]);
for (const [name, count] of expected) check(`${name}: all ${count} main/child results passed`, passed.filter(e => e.Test === name || e.Test.startsWith(name + '/')).length === count);
check('A corrected 29 checks were already green before the ACR fixture correction', [...expected].every(([name, count]) => middleEvents.filter(e => e.Action === 'pass' && e.Test && (e.Test === name || e.Test.startsWith(name + '/'))).length === count));
for (const name of [
  'TestDownloadAdmissionTransactionCommitsAllOriginalRowsOnce',
  'TestDownloadAdmissionTransactionClaimOwnershipAndVersion',
  'TestDownloadAdmissionTransactionEveryFailureRollsBackWholeGroup',
  'TestDownloadAdmissionTransactionKeyAndNonceReplayOrdering',
  'TestDownloadAdmissionTransactionUnknownOrLateCommitNeverReturnsCapability',
  'TestDownloadAdmissionTransactionOriginalTransportSnapshotAndFutureAuth',
  'TestDownloadAdmissionPinnedEnvironmentCombinesRealModules',
  'TestDownloadAdmissionPinnedEnvironmentRejectsChangedSourcesAtomically',
  'TestDownloadAdmissionPinnedEnvironmentRequiresDeploymentInputs',
]) check(`D original transaction control passed: ${name}`, passed.some(e => e.Test === name));
const owned = [initialLog, middleLog, ...(nativeLog ? [] : [log])].flatMap(value => [...value.matchAll(/^LOCAL_CLEANUP sensitive-download-owned=(.+) removed=True\s*$/gm)].map(m => m[1].trim()));
if (nativeLog) {
  const nativeOwner = nativeLog.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\s*$/m);
  check('native run reported and cleaned its exact frozen owner', nativeOwner && /^CLEANED snapshot=True\s*$/m.test(nativeLog));
  owned.push(nativeOwner[1].trim());
  const externalCache = nativeLog.match(/^EXTERNAL_OWNED_CACHE caller_cleanup_required=(.+)\s*$/m);
  if (externalCache) {
    check('external cache has the guarded run-owned workspace layout', path.basename(externalCache[1].trim()) === 'cache' && /^\.tmp-d-admission-[A-Za-z0-9-]+$/.test(path.basename(path.dirname(externalCache[1].trim()))));
    owned.push(path.dirname(externalCache[1].trim()));
  }
}
check('all failed and successful rounds have distinct cleanup paths', owned.length >= 5 && new Set(owned).size === owned.length);
for (const name of owned) check(`owned path independently absent: ${path.basename(name)}`, path.dirname(path.resolve(name)).toLowerCase() === process.cwd().toLowerCase() && !fs.existsSync(name));
const focus = [
  'backend/internal/systembackupevidence/download_admission_transaction_a_test.go',
  'backend/internal/systembackupevidence/download_admission_transaction.go',
  'backend/internal/systembackupevidence/download_admission_transaction_model_test.go',
  'backend/internal/systembackupevidence/download_admission_transaction_test.go',
  'backend/internal/systembackupevidence/download_admission_claim.go',
  'backend/internal/systembackupevidence/download_admission_nonce.go',
  'backend/internal/systembackupevidence/download_admission_records.go',
  'backend/internal/systembackupevidence/download_admission_keys.go',
  'backend/internal/systembackupevidence/download_admission_binding.go',
  'backend/internal/systembackupevidence/download_admission_audit.go',
  'backend/internal/systembackupevidence/download_admission_content.go',
  'backend/internal/systembackupevidence/download_admission_environment.go',
  'backend/internal/systembackupevidence/download_admission_environment_test.go',
  'backend/internal/systembackupsecurity/sensitive_download_config.go',
  'backend/internal/systembackupsecurity/sensitive_download_nonce_scope.go',
  'backend/internal/systembackupsecurity/sensitive_download_request.go',
  'backend/internal/systembackupsecurity/sensitive_download_deadline.go',
  'backend/internal/systembackupsecurity/config_mutation_session.go',
  'backend/internal/systembackupsecurity/config_mutation_strongauth.go',
  'backend/internal/systembackupsecurity/config_mutation_capacity.go',
  'backend/internal/systembackupsecurity/evidence_rbac.go',
  'backend/internal/systembackupsecurity/registration_files.go',
  'backend/internal/systembackupsecurity/providerproof_registry.go',
  'scripts/system-backup-a-sensitive-download-validation.ps1',
  ...(nativeLog ? [nativeRunnerPath] : []),
];
const currentDrifts = [], focusPins = focus.map(name => {
  const pin = source.files.find(p => p.path === name);
  check(`required frozen review input exists: ${name}`, !!pin);
  const current = fs.existsSync(name) ? bytes(name) : null;
  const matches = current !== null && pin.size === current.length && pin.sha256 === sha256(current);
  if (!matches) currentDrifts.push({ path: name, frozen_sha256: pin.sha256, current_sha256: current && sha256(current) });
  if (name.endsWith('_a_test.go') || name.startsWith('scripts/')) check(`A owned source remains the reviewed bytes: ${name}`, matches);
  return pin;
});
const allOriginalDrifts = source.files.flatMap(pin => {
  if (!fs.existsSync(pin.path)) return [{ path: pin.path, missing: true }];
  const value = bytes(pin.path);
  return value.length === pin.size && sha256(value) === pin.sha256 ? [] : [{ path: pin.path, frozen_sha256: pin.sha256, current_sha256: sha256(value) }];
});
const betweenRounds = source.files.flatMap(pin => {
  const original = initialSource.files.find(p => p.path === pin.path);
  return original && original.sha256 === pin.sha256 && original.size === pin.size ? [] : [{ path: pin.path, original_sha256: original?.sha256 ?? null, final_sha256: pin.sha256 }];
});
const strictRegistryPath = 'backend/internal/systembackupsecurity/providerproof_registry.go';
check('ACR fix did not relax production registry decoding', source.files.find(p => p.path === strictRegistryPath)?.sha256 === middleSource.files.find(p => p.path === strictRegistryPath)?.sha256);
const packages = packageNames.map(name => ({ package: name, main: passed.filter(e => e.Package === name && !e.Test.includes('/')).length, subtests: passed.filter(e => e.Package === name && e.Test.includes('/')).length }));
const report = {
  kind: 'a_independent_download_atomic_orchestration_review', recorded_at: new Date().toISOString(),
  status: 'accepted_frozen_local_orchestration_model_only',
  log: logName, log_sha256: sha256(bytes(logName)), source: sourceName, source_manifest_sha256: sha256(bytes(sourceName)),
  final_executor: nativeLog ? 'D frozen native gate including A authored checks; A independently audits original evidence' : 'A frozen native gate',
  final_native_wrapper: nativeLog ? { path: nativeLogName, sha256: sha256(bytes(nativeLogName)) } : null,
  executor_contract_postcheck_claimed: !nativeLog,
  original_failed_test_round: { log: initialLogName, log_sha256: sha256(bytes(initialLogName)), source: initialSourceName, source_manifest_sha256: sha256(bytes(initialSourceName)), actual_exit: 1, reason: 'A test treated semantically equivalent SQL JSON whitespace as tampering; corrected to actual claim digest substitution and added a successful equivalent-format control', failed_round_postcheck_claimed: false },
  original_failed_ACR_fixture_round: { log: middleLogName, log_sha256: sha256(bytes(middleLogName)), source: middleSourceName, source_manifest_sha256: sha256(bytes(middleSourceName)), actual_exit: 1, reason: 'D pinned fixture serialized omitted ACR as null; strict production registry requires a non-null array; fixture corrected to an empty array. The same failed round also reported producer_committed_but_execution_expired at system_publication_test.go:404; its root passed in the final complete gate. Both original failures are retained.', failed_round_postcheck_claimed: false },
  source_files: source.files.length, source_sha256: source.source_sha256, checks_passed: checks.length, checks,
  packages, passed_including_subtests: passed.length, A_independent_main: 4, A_independent_including_subtests: 29,
  frozen_focus_pins: focusPins, current_focus_drifts_excluded: currentDrifts, original_input_drifts_excluded: allOriginalDrifts,
  changed_or_added_inputs_between_rounds: betweenRounds,
  newly_added_current_files_covered: false, current_entire_worktree_accepted: false,
  exact_owned_paths_independently_absent: owned,
  actual_JWT_Ed25519_and_orchestration: true, SQL_transport_is_scripted_model: true,
  same_transaction_orchestration_verified_in_model: true,
  actual_session_RBAC_material_capacity_modules_combined_under_model_SQL: true,
  default_vet: true, dependencies_installed: false, remote_executed: false, actual_MySQL_atomic_admission_verified: false,
  human_MFA_verified: false, formal_schema_approved: false, production_download_route_enabled: false,
  earlier_D_failed_rounds_reclassified: false,
  remaining: [
    'reviewed actual owner/hold/reference adapter and runtime authority inputs; pinned session/RBAC/material modules are implemented but their SQL transport and inputs remain synthetic in this gate',
    'download-bound proof issuance from authorized real immutable Manifest and actual MFA',
    'real physical capacity and owner/hold/reference adapters',
    'reviewed DDL, historical ownership upgrade, retention and least-privilege database grants',
    'real MySQL rollback, cross-version concurrent replay and unknown-commit verification',
    'known-commit provider/plaintext path with fresh authorization and deployment/E2E',
  ],
};
const output = 'docs/evidence/a-download-transaction-review-20261019.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, checks: checks.length, packages, total: passed.length, A_independent: 29, cleaned: owned.length, excluded_focus_drift: currentDrifts.length }));
