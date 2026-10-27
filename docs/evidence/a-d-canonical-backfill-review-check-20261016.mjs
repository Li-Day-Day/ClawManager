// Run from the repository root. Read-only verification; writes one new receipt.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(p);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const receiptPath = 'docs/evidence/system-backup-d-canonical-backfill-service-mysql-accepted-20261016.json';
const receipt = JSON.parse(read(receiptPath));
const raw = read(receipt.raw_transcript).toString('utf8').replaceAll('\r\n', '\n');
const manifest = JSON.parse(read(receipt.source_manifest));
const currentManifestPath = 'docs/evidence/a-config-proof-mysql-source-20261016-095009.json';
const current = JSON.parse(read(currentManifestPath));
const checks = {};
const check = (name, value) => { checks[name] = value; assert.equal(value, true, name); };
const pinMatches = p => fs.existsSync(p.path) && read(p.path).length === p.size && sha(read(p.path)) === p.sha256;
const pinDigest = files => sha(Buffer.from(files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n'));
check('raw_hash', sha(read(receipt.raw_transcript)) === receipt.raw_sha256);
check('manifest_hash', sha(read(receipt.source_manifest)) === receipt.source_manifest_sha256);
check('manifest_digest', manifest.files.length === 1265 && pinDigest(manifest.files) === manifest.source_sha256 && manifest.source_sha256 === receipt.source_sha256);
check('current_snapshot_digest', pinDigest(current.files) === current.source_sha256);
check('comparison_snapshot_1274_files', current.files.length === 1274);
const comparisonSnapshotDrift = current.files.filter(p => !pinMatches(p)).map(p => p.path);
const names = ['service_apply_replay_nochange', 'service_audit_failure_rollback', 'service_receipt_failure_rollback', 'service_final_revoke_rollback', 'service_capacity_expiry_after_callback', 'service_lost_commit_observe_only', 'service_observed_lock_single_apply'];
const lines = raw.split('\n');
const cases = names.map(name => ({ name, starts: lines.filter(l => l === '=== RUN   TestDConfigCanonicalBackfillMySQL/' + name).length, passes: lines.filter(l => l.startsWith('    --- PASS: TestDConfigCanonicalBackfillMySQL/' + name + ' (')).length }));
check('seven_exact_cases', cases.every(c => c.starts === 1 && c.passes === 1) && lines.filter(l => l.startsWith('=== RUN   TestDConfigCanonicalBackfillMySQL/')).length === 7);
const remote = raw.slice(raw.indexOf('RUN namespace='));
check('no_remote_failure', !/^[\s]*--- (FAIL|SKIP):|^FAIL\b|CLEANUP_PENDING|panic:/m.test(remote));
check('root_pass', lines.filter(l => l.startsWith('--- PASS: TestDConfigCanonicalBackfillMySQL (')).length === 1);
check('run_identity', raw.includes(`RUN namespace=${receipt.namespace} uid=${receipt.namespace_uid} app_image=${receipt.app_image} mysql_image=${receipt.mysql_image} mysql_version=8.4.8`));
check('namespace_cleanup', raw.includes(`CLEANED namespace=${receipt.namespace} uid=${receipt.namespace_uid}`));
check('remote_cleanup', raw.includes('CLEANED remote-registration-scratch=yes'));
check('local_cleanup', raw.includes('CLEANED local-registration-build-cache=True'));
check('frozen_postcheck', raw.includes('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'));
check('exit_zero', lines.filter(l => l === 'd_canonical_backfill_remote_exit=0').length === 1 && receipt.native_terminal_exit === 0);
check('probe_pin', raw.includes(`PASS d-config-canonical-backfill-mysql binary_sha256=${receipt.probe_binary_sha256} inputs_sha256=${receipt.inputs_sha256} synthetic_authority=yes synthetic_capacity=yes production_approval=no`));
check('local_probe_pin', raw.includes(`linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${receipt.probe_binary_sha256} ddl_sha256=${receipt.inputs_sha256}`));
check('runner_pin', raw.includes(`PASS pinned-migration-runner binary_sha256=${receipt.migration_binary_sha256} catalog_sha256=${receipt.migration_catalog_sha256}`));
check('fresh_94', raw.includes('PASS fresh-migration-replay=001..080 applied=94 exact_filenames=yes'));
check('owned_installation_cleanup', (remote.match(/CLEANED backfill service owned installation state/g) || []).length === 7);
check('owned_receipt_cleanup', (remote.match(/CLEANED maintenance owned receipts\/audits\/config rows/g) || []).length === 7);
check('two_observed_waits', (remote.match(/OBSERVED session lock wait table=system_backup_configs/g) || []).length === 2);
check('local_69_paths_absent', receipt.cleanup.paths.length === 69 && receipt.cleanup.paths.every(p => !fs.existsSync(p)));
const servicePins = receipt.service_source_pins.map(p => ({ path: p.path, match: pinMatches(p) }));
check('service_22_pins_current', servicePins.length === 22 && servicePins.every(p => p.match));
const oldNames = new Set(manifest.files.map(p => p.path));
const currentNames = new Set(current.files.map(p => p.path));
const drift = manifest.files.filter(p => !pinMatches(p)).map(p => p.path);
const added = current.files.filter(p => !oldNames.has(p.path)).map(p => p.path);
const removed = manifest.files.filter(p => !currentNames.has(p.path)).map(p => p.path);
const report = {
  kind: 'a_independent_d_canonical_backfill_service_mysql_review', recorded_at: new Date().toISOString(),
  status: 'accepted_for_exact_frozen_seven_case_service_only', receipt: receiptPath, receipt_sha256: sha(read(receiptPath)),
  raw_transcript: receipt.raw_transcript, raw_sha256: receipt.raw_sha256, source_manifest: receipt.source_manifest,
  source_sha256: manifest.source_sha256, source_files: manifest.files.length, checks, cases,
  namespace: receipt.namespace, namespace_uid: receipt.namespace_uid, local_paths_independently_absent: 69,
  current_source_manifest: currentManifestPath, current_source_sha256: current.source_sha256,
  comparison_snapshot_live_drift: comparisonSnapshotDrift,
  input_set_comparison_scope: '09:50 local proof snapshot; subsequent concurrent additions not attested',
  current_input_drift: drift, current_added_inputs: added, current_removed_inputs: removed,
  current_worktree_accepted: false, current_focused_service_pins: servicePins,
  authentication_denials_before_upload: 2, socket_close_diagnostics_preserved: 4,
  prior_interrupted_run_cleanup: 'unproven; new run does not attest old run cleanup',
  a_eight_case_authority: 'separately accepted; not combined with seven cases',
  synthetic_authority: true, synthetic_capacity: true, production_approval: false,
  reviewer_reran_mysql_or_ssh: false, dependencies_installed: false,
  limits: ['Frozen 94-migration run only; current merged catalog adds browser-worker migration',
    'No actual grant/archive/current-target/physical-capacity authentication',
    'Formal 081/082, actual installation upgrade and human MFA remain pending'],
};
const output = 'docs/evidence/a-d-canonical-backfill-service-review-20261016.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ result: 'PASS', checks: Object.keys(checks).length, cases: cases.length, service_pins: servicePins.length, current_drift: drift.length, added: added.length, removed: removed.length, output }));
