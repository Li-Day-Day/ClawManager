// Offline acceptance of the exact eleven-owner transcript, never an SQL runner.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
export const decode = b => b.toString(b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
export const ownerCases = ['backup', 'drill', 'preflight', 'artifact_verify', 'wrong_installation', 'revoked_actor', 'changed_original_deadline', 'unknown_reference_column', 'missing_reference_column', 'original_owner_lock', 'empty_reference_range'];
const testRoot = 'TestASQLTaskDownloadOwnersMySQL';
const seedNames = [
  'TestASQLTaskDownloadOwnersMySQLSeed', 'TestADownloadAdmissionMySQLSeed',
  ...['detached_embedded_config', 'historical_config_projection', 'independent_encrypted_object'].map(n => 'TestADownloadAdmissionMySQLSeed/' + n),
  'TestASensitiveDownloadMFAMySQLSeed',
  ...['actual_config_required_cells', 'duplicate', 'unknown', 'trailing', 'catalog', 'ddl', 'budget'].map(n => 'TestASensitiveDownloadMFAMySQLSeed/' + n)
].sort();
const packages = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence'];
// Windows PowerShell's native-output decoder rendered these four exact names
// as 碌s in real transcripts. Preserve raw bytes and accept only this bijection.
const localNameAliases = new Map(['TestGCSchedulingDueTimeEnforcedUnderClaimLock', 'TestRecoverySchedulingRecheckedUnderClaimLock'].flatMap(root =>
  ['-1', '1'].map(value => [`${root}/${value}碌s`, `${root}/${value}µs`])));
export const canonicalLocalName = name => localNameAliases.get(name) ?? name;
class EvidenceError extends Error { constructor(code) { super(code); this.code = code; } }
function requireEvidence(ok, code) { if (!ok) throw new EvidenceError(code); }
// A derived inventory is never presented as native Go JSON. Only the loader's
// independently pinned baseline definitions may supply this metadata.
export function ownerInventoryEvents(inventory, sourceSHA256) {
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  requireEvidence(inventory?.kind === 'a_owner_preparation_derived_inventory.v1' && inventory.origin === 'derived_from_verified_verbose_local_transcript_not_native_Go_JSON', 'derived_inventory_kind');
  requireEvidence(hash(sourceSHA256) && inventory.source_sha256 === sourceSHA256 && ['source_manifest_sha256', 'local_log_sha256', 'prior_native_events_sha256'].every(key => hash(inventory[key])), 'derived_inventory_source_pins');
  const scope = {full_two_ordinary_packages: true, original_default_vet: true, all_previous_tests_preserved: true, packaged_and_detached_seed_checks: 13, actual_MySQL: false, production_approved: false};
  requireEvidence(inventory.scopes && Object.keys(inventory.scopes).length === Object.keys(scope).length && Object.entries(scope).every(([key, value]) => inventory.scopes[key] === value), 'derived_inventory_scope');
  requireEvidence(Array.isArray(inventory.packages) && inventory.packages.length === packages.length && inventory.packages.every((p, i) => p.package === packages[i]), 'derived_inventory_packages');
  return inventory.packages.flatMap(p => {
    requireEvidence(Array.isArray(p.tests) && p.tests.length > 0 && p.tests.every(name => typeof name === 'string' && /^Test\S+$/.test(name) && !/[\x00-\x1f\x7f]/.test(name)) && new Set(p.tests).size === p.tests.length, 'derived_inventory_unique_names');
    requireEvidence(p.pass_events === p.tests.length && p.roots === p.tests.filter(name => !name.includes('/')).length && p.roots > 0 && Number.isSafeInteger(p.previous_tests_preserved) && p.previous_tests_preserved > 0 && p.previous_tests_preserved <= p.tests.length, 'derived_inventory_counts');
    return [...p.tests.map(Test => ({Package: p.package, Test, Action: 'run'})), ...p.tests.map(Test => ({Package: p.package, Test, Action: 'pass'})), {Package: p.package, Action: 'pass'}];
  });
}
const runs = text => [...text.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]);
const passes = text => [...text.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]);
const equalNames = (a, b) => a.length === b.length && new Set(a).size === a.length && JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
export function localStages(text) {
  const summaries = [...text.matchAll(/^ok\s+(\S+)\s+([0-9.]+s)\s*$/gm)];
  requireEvidence(equalNames(summaries.slice(0, 2).map(m => m[1]), packages) && summaries.length === 3 && summaries[2][1] === packages[1], 'local_complete_package_stages');
  let start = 0;
  return summaries.map(m => {
    const segment = text.slice(start, m.index); start = m.index + m[0].length;
    const ran = runs(segment), passed = passes(segment);
    requireEvidence(equalNames(ran, passed) && ran.length > 0, 'local_run_pass_pairing');
    return {package: m[1], names: passed, elapsed: m[2], end: start};
  });
}
function sourceDigest(s) {
  requireEvidence(s.stable_copy_verified === true && s.dependencies_installed === false && s.production_approved === false, 'source_stable_offline_unapproved');
  requireEvidence(Array.isArray(s.files) && s.files.length > 0 && new Set(s.files.map(f => f.path)).size === s.files.length && s.files.every(f =>
    typeof f.path === 'string' && /^(backend|contracts|scripts|docs)\//.test(f.path) && !f.path.includes('\\') && !f.path.split('/').some(p => ['..', '.', ''].includes(p)) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.size) && f.size >= 0), 'source_safe_unique_paths');
  requireEvidence(sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === s.source_sha256, 'source_digest');
}
const migrationFiles = s => s.files.filter(f => f.path.startsWith('backend/internal/db/migrations/') && f.path.endsWith('.sql'));
export function frozenMigrationCatalog(source, readFile = p => fs.readFileSync(path.join(workspace,p))) {
  sourceDigest(source);
  const files=migrationFiles(source).sort((a,b)=>path.basename(a.path).localeCompare(path.basename(b.path),'en'));
  requireEvidence(files.length>0,'frozen_catalog_not_empty');
  const h=crypto.createHash('sha256');h.update('system-backup-migration-catalog.v1\0','utf8');
  const frame=value=>{const b=Buffer.from(value,'utf8'),n=Buffer.alloc(8);n.writeBigUInt64BE(BigInt(b.length));h.update(n);h.update(b);};
  for(const f of files){const b=readFile(f.path);requireEvidence(b.length===f.size&&sha256(b)===f.sha256,'frozen_catalog_file_pin');frame(path.basename(f.path));frame(b.toString('utf8').replace(/\r\n?/g,'\n'));}
  return {algorithm:'sha256-length-prefixed-filename-normalized-content-v1',file_count:files.length,hash:h.digest('hex')};
}
export function frozenMigrationReplay(source) {
  const files=migrationFiles(source),versions=files.map(f=>path.basename(f.path).match(/^(\d{3})_/));
  requireEvidence(files.length>0&&versions.every(Boolean),'frozen_catalog_version_names');
  return `PASS fresh-migration-replay=001..${String(Math.max(...versions.map(m=>Number(m[1])))).padStart(3,'0')} applied=${files.length} exact_filenames=yes`;
}
export function validateOwnerEvidence({logBytes, sourceBytes, baselineSource, baselineEvents, catalog, exists = fs.existsSync, readFile = p => fs.readFileSync(path.join(workspace, p))}) {
  const log = decode(logBytes), source = JSON.parse(decode(sourceBytes));
  const checks = [];
  const check = (ok, code) => { requireEvidence(ok, code); checks.push(code); };
  const one = (re, code) => { const ms = [...log.matchAll(re)]; check(ms.length === 1, code); return ms[0]; };
  sourceDigest(source); sourceDigest(baselineSource); checks.push('both_manifest_digests');
  check(!/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^.*CLEANUP_PENDING/m.test(log), 'no_test_failure_skip_panic_or_pending_cleanup');
  const bound = one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm, 'one_frozen_source');
  check(bound[1] === source.source_sha256 && Number(bound[2]) === source.files.length, 'log_manifest_binding');
  const run = one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm, 'one_actual_remote_run');
  check(/^sbk-mig-\d{12}-[a-f0-9]{4}$/.test(run[1]) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(run[2]) && /^8\.4\.\d+(?:[-.\w]*)$/.test(run[5]) && [run[3], run[4]].every(p => /@sha256:[a-f0-9]{64}$/.test(p)), 'actual_run_identity_images_version');
  const local = log.slice(0, run.index), remote = log.slice(run.index);
  const stages = localStages(local);
  const baselineFailures = baselineEvents.some(e => ['fail', 'build-fail', 'skip'].includes(e.Action));
  check(!baselineFailures && packages.every(p => baselineEvents.filter(e => e.Package === p && !e.Test && e.Action === 'pass').length === 1), 'ordinary_inventory_complete_baseline');
  for (const stage of stages.slice(0, 2)) {
    const expected = baselineEvents.filter(e => e.Package === stage.package && e.Test && e.Action === 'pass').map(e => e.Test);
    const ran = baselineEvents.filter(e => e.Package === stage.package && e.Test && e.Action === 'run').map(e => e.Test);
    check(equalNames(ran, expected) && equalNames(stage.names.map(canonicalLocalName), expected), 'ordinary_exact_test_inventory_' + stage.package);
  }
  // Historical ordinary results supply the full test inventory. New tagged
  // MySQL files are permitted only after matching the current pinned bytes;
  // ordinary Go/module/embed/contract drift requires a new reviewed baseline.
  const pins = new Map(source.files.map(f => [f.path, f])), old = new Map(baselineSource.files.map(f => [f.path, f]));
  for (const f of source.files.filter(f => /^(backend|contracts)\//.test(f.path))) {
    if (old.get(f.path)?.sha256 === f.sha256 && old.get(f.path)?.size === f.size) continue;
    check(f.path.endsWith('_mysql_test.go'), 'ordinary_input_drift_requires_new_baseline');
    const bytes = readFile(f.path);
    check(bytes.length === f.size && sha256(bytes) === f.sha256 && /^\/\/go:build systembackup_mysql\r?\n/.test(bytes.toString('utf8')), 'new_tagged_input_verified');
  }
  check(baselineSource.files.filter(f => /^(backend|contracts)\//.test(f.path)).every(f => pins.has(f.path)), 'ordinary_input_not_removed');
  check(equalNames(stages[2].names, seedNames), 'exact_three_packaged_seeds_13_checks');
  const standaloneAt = local.indexOf('LOCAL_PASS config-standalone-seed=yes', stages[2].end);
  check(standaloneAt > stages[2].end, 'standalone_seed_boundary');
  const standalone = local.slice(stages[2].end, standaloneAt);
  check(equalNames(runs(standalone), seedNames) && equalNames(passes(standalone), seedNames) && /\nPASS\s*$/.test(standalone), 'exact_three_detached_seeds_13_checks');
  for (const marker of ['PASS download-owners-dispatch:', 'LOCAL_PASS isolated-go-telemetry=off', 'LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent', 'bundle.tar: OK']) check(local.includes(marker), 'local_marker_' + marker.split(' ')[0] + '_' + marker.split(' ')[1]);
  const probe = one(/^LOCAL_PASS a-download-owners-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm, 'one_compiled_probe');
  check(probe[2] === pins.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json')?.sha256, 'compiled_capsule_pinned');
  const runner = one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm, 'one_compiled_migration_runner');
  check(remote.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`), 'remote_migration_runner_pin');
  check(catalog.file_count === migrationFiles(source).length && catalog.file_count === migrationFiles(baselineSource).length && remote.includes(frozenMigrationReplay(source)), 'complete_formal_catalog_from_reviewed_source');
  for (const f of source.files.filter(f => f.path.startsWith('backend/internal/db/migrations/') && f.path.endsWith('.sql'))) check(sha256(readFile(f.path)) === f.sha256, 'catalog_current_equals_frozen_' + path.basename(f.path));
  const migrations = [...remote.matchAll(/^\{"config_activated":false,.*"result":"PASS"\}\s*$/gm)];
  check(migrations.length === 1, 'one_migration_result');
  const migrated = JSON.parse(migrations[0][0]);
  check(migrated.migration_count === catalog.file_count && migrated.migration_catalog_sha256 === catalog.hash && migrated.human_mfa_verified === false && migrated.historical_equivalence_verified === false, 'migration_identity_and_scope');
  const expected = [testRoot, ...ownerCases.map(n => testRoot + '/' + n)];
  check(equalNames(runs(remote), expected) && equalNames(passes(remote), expected), 'exact_eleven_sql_leaves_and_root');
  const databases = [];
  for (let n = 0; n < ownerCases.length; n++) {
    const name = ownerCases[n], start = remote.indexOf('=== RUN   ' + testRoot + '/' + name + '\n');
    check(start >= 0, 'canonical_case_boundary_' + name);
    const next = remote.indexOf('=== RUN', start + 10), segment = remote.slice(start, next < 0 ? remote.length : next);
    const cleaned = [...segment.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)];
    check(cleaned.length === 1, 'one_owned_database_cleaned_' + name); databases.push(cleaned[0][1]);
    if (name === 'original_owner_lock') check(segment.includes('OBSERVED actual SQL owner/reference lock wait system_backups'), 'actual_original_owner_lock_observed_in_correct_case');
    if (name === 'empty_reference_range') check(segment.includes('OBSERVED actual SQL owner/reference lock wait system_backup_dependency_health'), 'actual_empty_reference_lock_observed_in_correct_case');
  }
  check(new Set(databases).size === 11 && [...remote.matchAll(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g)].length === 11, 'eleven_distinct_databases_no_extra_cleanup_claims');
  check(remote.includes('PASS actual SQL task owner cases=11 owner_adapter=SQLTaskDownloadOwners production_tasks=no provider_read=no production_approval=no'), 'go_root_actual_owner_boundary');
  check(remote.includes(`PASS a-download-owners-mysql binary_sha256=${probe[1]} inputs_sha256=${probe[2]} new_cases=11 owner_adapter=SQLTaskDownloadOwners production_tasks=no human_mfa=no provider_read=no production_approval=no`), 'remote_probe_capsule_exact_pins');
  check(remote.includes(`CLEANED namespace=${run[1]} uid=${run[2]}`) && [...remote.matchAll(/^CLEANED namespace=/gm)].length === 1, 'original_namespace_uid_cleanup');
  const owner = one(/^LOCAL_OWNER config-writer-source=(.+)$/gm, 'one_local_snapshot_owner')[1].trim();
  check(path.dirname(path.resolve(owner)).toLowerCase() === workspace.toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)), 'owned_local_snapshot_path');
  check(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`) && !exists(owner), 'local_snapshot_cleanup_independently_absent');
  for (const marker of ['CLEANED remote-registration-scratch=yes', 'CLEANED local-registration-build-cache=True', 'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True']) check(remote.includes(marker), 'final_' + marker.split(' ').slice(0, 2).join('_'));
  const exit = [...remote.matchAll(/^a_download_owners_mysql_remote_exit=(-?\d+)$/gm)];
  check(exit.length === 1 && exit[0][1] === '0', 'one_outer_exit_zero');
  const localizedFooter = /\n\*{10,}\nPowerShell 记录结束\n结束时间: \d{14}\n\*{10,}\n?$/.test(remote);
  check((/(?:PowerShell transcript end|Windows PowerShell 脚本结束)/.test(remote) && /(?:End time:|结束时间:)/.test(remote)) || localizedFooter, 'transcript_completed');
  const drift = source.files.filter(f => { try { const b = readFile(f.path); return b.length !== f.size || sha256(b) !== f.sha256; } catch { return true; } }).map(f => f.path);
  return {kind: 'a_download_sql_task_owners_actual_mysql_independent_acceptance', recorded_at: new Date().toISOString(), status: 'accepted_exact_eleven_task_owner_cases_only',
    log_sha256: sha256(logBytes), source_manifest_sha256: sha256(sourceBytes), source_sha256: source.source_sha256, source_files: source.files.length,
    ordinary_inventory_source_sha256: baselineSource.source_sha256, stages: stages.map(s => ({package: s.package, main: s.names.filter(n => !n.includes('/')).length, all: s.names.length, elapsed: s.elapsed})),
    ordinary_test_name_encoding_aliases: stages.slice(0, 2).flatMap(s => s.names.filter(n => canonicalLocalName(n) !== n).map(n => ({original: n, canonical: canonicalLocalName(n)}))),
    detached_seed_checks: 13, namespace: run[1], namespace_uid: run[2], app_image: run[3], mysql_image: run[4], mysql_version: run[5],
    probe_sha256: probe[1], inputs_sha256: probe[2], migration_runner_sha256: runner[1], catalog, actual_case_names: ownerCases, actual_case_count: 11,
    lock_observations: ['system_backups', 'system_backup_dependency_health'], cleaned_databases: databases, local_source_owner: owner, local_source_owner_exists: false,
    current_pinned_drift: drift, current_new_inputs_not_covered: true, current_whole_worktree_verified: false, actual_mysql: true, production_tasks: false, human_mfa: false, provider_read: false,
    production_approved: false, dependencies_installed: false, checks_passed: checks.length, checks};
}

function fileInEvidence(name) {
  requireEvidence(typeof name === 'string' && path.basename(name) === name && /^[A-Za-z0-9._-]+$/.test(name), 'evidence_basename_required');
  const full = path.join(workspace, 'docs/evidence', name);
  requireEvidence(!fs.lstatSync(full).isSymbolicLink(), 'evidence_file_not_redirected');
  return full;
}
// Each baseline retains its complete ordinary test inventory. A later reviewed
// baseline adds coverage; it never changes the meaning of a historical receipt.
export function loadReviewedOwnerBaseline(sourceBytes) {
  const source = JSON.parse(decode(sourceBytes));
  const definitions = [
    {prefix: 'docs/evidence/a-gc-nil-adapters-20261020-r1', eventsSuffix: '-fixed-full-attempt1.jsonl',
      sourcePin: '1d6ce94938f8bdf822492b1132c60d7c11ddb27d0f7b4dddb12283ae23261798',
      eventsPin: 'b280475eeb42553c06aed22fa3e8bafcf10eff9e081b4e58c257d57460a51f8f'},
    {prefix: 'docs/evidence/d-download-gc-batch-20261020-r3', eventsSuffix: '.jsonl',
      sourcePin: '70ba3043184f012cc0278762d4e03a509ab41e05c1bad674766b608a6cede1ef',
      eventsPin: 'fd7bc902bae8ee7028adeae48cc05e7873397b44bb979e996d31fcd1cf0617fb',
      acceptance: 'docs/evidence/a-download-gc-batch-independent-accepted-20261021.json',
      acceptancePin: '3c0b33adf6bbbad51dc98b5c59dea01cbda6b669fe9cc691357437d913ecbcd3'},
    {prefix: 'docs/evidence/d-download-gc-producer-20261021-r5', eventsSuffix: '.jsonl',
      sourcePin: 'd80b0d3da94760e36dbc2ad71724c94865ae11e2144b2667a360c013391274c8',
      eventsPin: '71b8c00f682f564862672fadde206aec06205a2b3ca87aafaa1524b60c3bdea9',
      acceptance: 'docs/evidence/a-download-gc-producer-independent-accepted-20261021.json',
      acceptancePin: '481843dc264ea3d7bd5d8a1534168b58e0c17ee08fe57a13d62789f25bb827c8'},
    {prefix: 'docs/evidence/a-gc-journal-20261021-r1-full', eventsSuffix: '.jsonl',
      sourcePin: '546fab85f8c0f4be5e2021021a59130f4a00649cd2de221a8a503a36f0757f4e',
      eventsPin: '4303e3f383042778e38af1894d5365be1b45ebec0d62ba9346effeec298b1b5d',
      acceptance: 'docs/evidence/a-gc-journal-accepted-20261021-r1.json',
      acceptancePin: '94ba4e573ccd1ef62ea00cd061ba383debaf15b6ca2be2055d31969f7368e322'},
    {prefix: 'docs/evidence/a-journal-cancel-20261021-r1-full', eventsSuffix: '.jsonl',
      sourcePin: 'c0c653396271c738a0ffbe4c701b3a88cde11481dd2ab2278de2c41bb92004a5',
      eventsPin: '7910bbd6276a6455eaefc87028b819526220aea802faff017be3015b6c75eed1',
      acceptance: 'docs/evidence/a-journal-cancel-accepted-20261021-r1.json',
      acceptancePin: '21706f5f0db6cb3fb11ce50b3b407cc89dfbb75c2737567babe269b868ce0bbe'},
    {prefix: 'docs/evidence/a-gc-connection-integration-20261021-r1', eventsSuffix: '.jsonl',
      sourcePin: '7d496e23fd3356d3e123d0b24187e904e2af627c41e7ac5206429ff949deab8c',
      eventsPin: 'd74140de074bef58483bf3bc4314f4d4cdf76f204d243de3884044672ed4e749',
      acceptance: 'docs/evidence/a-gc-connection-integration-accepted-20261021-r1.json',
      acceptancePin: 'bc6463d4853b1ef479c8a5d5c26f60173aaf2f7174e128622b0f9571af0a5df3'},
    {prefix: 'docs/evidence/a-read-completion-integration-20261021-r1', eventsSuffix: '.jsonl',
      sourcePin: '51e5f96b3833cbbb4d0db0971573d3659a21dd65e1cf6e04d621d84a59af8e06',
      eventsPin: 'bf4a28e63453a88c5a2ec3a107bf28c1cd7e55dc8c16caebea82d405f068b77d',
      acceptance: 'docs/evidence/a-read-completion-integration-accepted-20261021-r1.json',
      acceptancePin: 'be7ab9f2ec06163f5f475542ea6023ba399d21d4bfc8a727145cffbe6a078b7d'},
    {prefix: 'docs/evidence/a-check-evidence-binding-20261021-r2', eventsSuffix: '.jsonl',
      sourcePin: '0875dd029c3ecfcfce3d698baf0a3606d23095cffcaa9e69ccdd663fa877eee2',
      eventsPin: 'b9c3fa0998bc0e843ef9149a59dd708d24719263273feb08de136f8abdbeea3b',
      acceptance: 'docs/evidence/a-check-evidence-binding-accepted-20261021-r2.json',
      acceptancePin: 'f2d0f7407d881191e28684af60f6af3bc4a63f54e5094b3af06dcbc2d0e31e0d'},
    {sourcePath: 'docs/evidence/a-download-gc-role-mysql-remote-source-20261021-142757-6ad9fc5f.json',
      eventsPath: 'docs/evidence/a-check-evidence-binding-20261021-r2.jsonl',
      sourcePin: 'aeab38e5cc529eabfc127d9ec4024c5c6dc5334858a151d532bc1daa0d419a3d',
      eventsPin: 'b9c3fa0998bc0e843ef9149a59dd708d24719263273feb08de136f8abdbeea3b',
      acceptance: 'docs/evidence/a-download-owners-inplace-fixture-accepted-20261021.json',
      acceptancePin: '9c6d3d2df9aaaf5221228174e7b6b1bbad1942da4d784ad7103f32a58ae2bc94'},
    {sourcePath: 'docs/evidence/d-prune-identity-published-context-20261021.json',
      eventsPath: 'docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl',
      sourcePin: '74018af71ecab212d80a9c46120257909c9b67913de7d5b917c8bc2e3da6f868',
      eventsPin: '990aae2b00cf723d7c520d28843d667909f414f6872f196104faafc6db2f9c67',
      acceptance: 'docs/evidence/a-prune-identity-baseline-accepted-20261021.json',
      acceptancePin: '1c5cfbda45973f3f9760baf9e9c2ff5c523575e05c7a14cd6e57ecd016666c89'},
    {sourcePath: 'docs/evidence/a-owner-dependency-freeze-20261021-source.json',
      eventsPath: 'docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl',
      sourcePin: '94baabff932e6adb43edcebba9b7010495da35be322b754a876fc078ef25d885',
      eventsPin: '990aae2b00cf723d7c520d28843d667909f414f6872f196104faafc6db2f9c67',
      acceptance: 'docs/evidence/a-owner-dependency-baseline-accepted-20261021.json',
      acceptancePin: '0d9225989f15bc5b99f5c65302cb876f7f0b85d6dd21e022916d94fbf112f779'},
    {sourcePath: 'docs/evidence/a-download-gc-role-mysql-remote-source-20261021-164523-7cba478a.json',
      eventsPath: 'docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl',
      sourcePin: '82d99363dcf0dd7be2a31576fb601089b02df9799903f198224de6e80fa65098',
      eventsPin: '990aae2b00cf723d7c520d28843d667909f414f6872f196104faafc6db2f9c67',
      acceptance: 'docs/evidence/a-owner-cost-context-baseline-accepted-20261021.json',
      acceptancePin: '6d90236573a4680ba703dc25f0774830568f7007e067ff7e275d1ea0984d64ef'},
    {sourcePath: 'docs/evidence/a-owner-current-full-local-20261023-093734-source.json',
      eventsPath: 'docs/evidence/a-owner-current-full-local-20261023-093734-inventory.json', derivedInventory: true,
      sourcePin: '44356e4c741add7b330dc0b616bcae776c4fece91c44f5219b3e0a83c42366ec',
      eventsPin: '91915db1aa359370e67bfd5a7aa1cb3da9906f1ed2fed2cc6e7b5005700eadc4',
      acceptance: 'docs/evidence/a-owner-current-full-accepted-20261023.json',
      acceptancePin: '815ec8f60fd755880f2046fe7bd6df52bec2776df91c066e8559bf79cd0f1b75'},
    {sourcePath: 'docs/evidence/a-owner-dependency-freeze-20261023-source.json',
      eventsPath: 'docs/evidence/a-owner-current-full-local-20261023-093734-inventory.json', derivedInventory: true,
      // Only the two reviewed resources files changed outside the actual
      // owner graph. Preserve the inventory's original tested source identity.
      inventorySourceSHA256: 'd27224a655b1dbb2f332f77a06f0fc412043b3e5daa25a9c25f5fd7301e71885',
      sourcePin: '998bee558d1707b7c46b68ec6afb59150b04f8be35b0654c1d7d8c4968621c7a',
      eventsPin: '91915db1aa359370e67bfd5a7aa1cb3da9906f1ed2fed2cc6e7b5005700eadc4',
      acceptance: 'docs/evidence/a-owner-readback-dependency-accepted-20261023.json',
      acceptancePin: 'a059985f3d54c9318a5acae46bfdc2875b02bbbad6b2873d944eb12a8de116d4'},
    {sourcePath: 'docs/evidence/a-owner-dependency-freeze-20261023-r2-source.json',
      eventsPath: 'docs/evidence/a-owner-current-full-local-20261023-093734-inventory.json', derivedInventory: true,
      inventorySourceSHA256: 'd27224a655b1dbb2f332f77a06f0fc412043b3e5daa25a9c25f5fd7301e71885',
      sourcePin: '5c8bd979bd1b90e14d86499c4d8906a3a8721495cf9c2528eca3200e90aeab88',
      eventsPin: '91915db1aa359370e67bfd5a7aa1cb3da9906f1ed2fed2cc6e7b5005700eadc4',
      acceptance: 'docs/evidence/a-owner-readback-dependency-accepted-20261023-r2.json',
      acceptancePin: 'a52b77083e0b141e2272058100d3074d50cdc68c56640e74de15b711b7a673f9'},
    {sourcePath: 'docs/evidence/a-owner-gc-full-local-20261023-111154-source.json',
      eventsPath: 'docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json', derivedInventory: true,
      sourcePin: '121d6586f0ce06eda7887e40e21e5dbca12591e8c29a736336262b04481503bd',
      eventsPin: '2985bb09929aec33e6afa0d7c5ebb49b90b18ac7caf4adb69932cf8894addcd6',
      acceptance: 'docs/evidence/a-owner-gc-full-accepted-20261023.json',
      acceptancePin: '73058cc7276e80eef360c71cccf40154bdc9e858d46fa7f2740053ba4bd96978'},
    {sourcePath: 'docs/evidence/a-owner-dependency-freeze-20261023-r3-source.json',
      eventsPath: 'docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json', derivedInventory: true,
      inventorySourceSHA256: 'a2e69921b109dbf12fa7ed9b40689332feb93f99834e3c3ad97a8016e9f4246b',
      sourcePin: 'db80f7e33e3cb5d72efb2cebd3ea2b3856b28e9663977a35cbb2712bee89d588',
      eventsPin: '2985bb09929aec33e6afa0d7c5ebb49b90b18ac7caf4adb69932cf8894addcd6',
      acceptance: 'docs/evidence/a-owner-gc-dependency-accepted-20261023-r3.json',
      acceptancePin: '293b0530be1efea88f3ea39fe3ce6f8a830f4819d3f67cde7840b305cb9ddbef'},
    {sourcePath: 'docs/evidence/a-owner-final-source-20261026.json',
      eventsPath: 'docs/evidence/a-owner-final-native-20261026.jsonl',
      // Native owner events remain bound to the unchanged owner dependencies;
      // the sole nonowner tagged HTTP delta has its own compiled/seed receipt.
      sourcePin: '977aac1c9e74bdf27738ccc832534f7530d9708130d8f74cb2a863e632ae2d67',
      eventsPin: '2fcf2b6420ea728024ba6ac6a3c203d226126ff3472967f39ce9cedfad4ba6e5',
      acceptance: 'docs/evidence/a-owner-final-local-accepted-20261026.json',
      acceptancePin: '3605ddebcac81ef1ce806da6a9199f1bc6a8147277e36dc738e70381f42fe289'},
    {sourcePath: 'docs/evidence/a-owner-current-reviewed-source-20261027.json',
      eventsPath: 'docs/evidence/a-owner-current-native-20261027.jsonl',
      // Original complete 4003 native owner events: all 5190 historical names
      // retained. Exact metrics and affected tagged contexts have separate
      // stable native supplements; this does not claim a new ordinary rerun.
      sourcePin: 'a115790cd1b8eaf1ffc92d2ae9b30784b4d4cd088568c1116bf53f6c6e6b7c8a',
      eventsPin: '69674bc9b805b89945066131caa87c1e5033d0a0a1cd98f516b0a4a8dcd9d65b',
      acceptance: 'docs/evidence/a-owner-current-local-accepted-20261027.json',
      acceptancePin: 'e5117c2d438d9ec6f9b3d62243601e43e78796faf33720490a57a6b485dcb46c'}
  ];
  const ordinary = m => m.files.filter(f => /^(backend|contracts)\//.test(f.path) && !f.path.endsWith('_mysql_test.go')).map(f => `${f.path}\0${f.size}\0${f.sha256}`).sort();
  const baselines = definitions.map(d => {
    const sourceRaw = fs.readFileSync(path.join(workspace, d.sourcePath ?? (d.prefix + '-source.json')));
    const eventRaw = fs.readFileSync(path.join(workspace, d.eventsPath ?? (d.prefix + d.eventsSuffix)));
    requireEvidence(sha256(sourceRaw) === d.sourcePin && sha256(eventRaw) === d.eventsPin, 'independently_reviewed_baseline_pins');
    if (d.acceptance) {
      requireEvidence(sha256(fs.readFileSync(path.join(workspace, d.acceptance))) === d.acceptancePin, 'independent_batch_acceptance_pin');
    }
    const baselineSource = JSON.parse(decode(sourceRaw));
    const baselineEvents = d.derivedInventory
      ? ownerInventoryEvents(JSON.parse(decode(eventRaw)), d.inventorySourceSHA256 ?? baselineSource.source_sha256)
      : decode(eventRaw).trim().split('\n').map(JSON.parse);
    return {baselineSource, baselineEvents};
  });
  // No matching ordinary source is still rejected by validateOwnerEvidence;
  // selecting the newest inventory here does not exempt any input from checks.
  return baselines.find(b => JSON.stringify(ordinary(b.baselineSource)) === JSON.stringify(ordinary(source))) ?? baselines.at(-1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    requireEvidence(args.length === 4 || args.length === 5, 'usage_log_source_optional_write');
    requireEvidence(args[0] === '--log' && args[2] === '--source' && (args.length === 4 || args[4] === '--write'), 'usage_log_source_optional_write');
    const sourceBytes = fs.readFileSync(fileInEvidence(args[3]));
    const report = validateOwnerEvidence({logBytes: fs.readFileSync(fileInEvidence(args[1])), sourceBytes,
      ...loadReviewedOwnerBaseline(sourceBytes), catalog: frozenMigrationCatalog(JSON.parse(decode(sourceBytes)))});
    report.log = 'docs/evidence/' + args[1]; report.source = 'docs/evidence/' + args[3];
    report.reviewer_sha256 = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
    if (args[4] === '--write') fs.writeFileSync(path.join(workspace, 'docs/evidence', `a-download-owners-mysql-accepted-${report.namespace}.json`), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: report.status, namespace: report.namespace, actual_cases: 11, checks: report.checks_passed, receipt_written: args[4] === '--write'}));
  } catch (error) {
    console.error(JSON.stringify({status: 'rejected', code: error instanceof EvidenceError ? error.code : 'invalid_or_unavailable_input', receipt_written: false})); process.exitCode = 1;
  }
}
