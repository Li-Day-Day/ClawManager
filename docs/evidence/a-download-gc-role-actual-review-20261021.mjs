// Offline receipt validation for the isolated ten-case role probe; no SQL runner.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {workspace, decode, sha256, localStages, canonicalLocalName, loadReviewedOwnerBaseline, frozenMigrationCatalog, frozenMigrationReplay} from './a-download-owners-actual-review-20261020.mjs';
export const roleCases = ['least_privilege_metadata_and_lock', 'forbidden_data_and_ddl', 'table_revoke_old_and_new_sessions', 'column_revoke_old_and_new_sessions', 'database_revoke_old_and_new_sessions', 'global_revoke_old_and_new_sessions', 'active_role_rejected', 'cross_schema_restrict_rejected', 'cross_schema_cascade_rejected', 'metadata_drift'];
const testRoot = 'TestADownloadGCRoleMySQL';
const seedNames = ['TestADownloadGCRoleMySQLSeed', 'TestASensitiveDownloadMFAMySQLSeed', ...['actual_config_required_cells', 'duplicate', 'unknown', 'trailing', 'catalog', 'ddl', 'budget'].map(n => 'TestASensitiveDownloadMFAMySQLSeed/' + n)];
const packages = ['clawreef/internal/systembackupsecurity', 'clawreef/internal/systembackupevidence'];
class RoleEvidenceError extends Error {constructor(code) {super(code); this.code = code;}}
const requireEvidence = (ok, code) => {if (!ok) throw new RoleEvidenceError(code);};
const runs = s => [...s.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map(m => m[1]);
const passes = s => [...s.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m => m[1]);
const exact = (a, b) => a.length === b.length && new Set(a).size === a.length && JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
function manifest(s) {
  requireEvidence(s.stable_copy_verified === true && s.dependencies_installed === false && s.production_approved === false, 'source_stable_offline_unapproved');
  requireEvidence(Array.isArray(s.files) && s.files.length > 0 && new Set(s.files.map(f => f.path)).size === s.files.length && s.files.every(f => typeof f.path === 'string' && /^(backend|contracts|scripts|docs)\//.test(f.path) && !f.path.includes('\\') && !f.path.split('/').some(p => ['', '.', '..'].includes(p)) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isSafeInteger(f.size) && f.size >= 0), 'safe_unique_source_paths');
  requireEvidence(sha256(s.files.map(f => `${f.path}\0${f.sha256}\0${f.size}`).join('\n') + '\n') === s.source_sha256, 'source_digest');
}
export function validateRoleEvidence({logBytes, sourceBytes, baselineSource, baselineEvents, catalog, exists = fs.existsSync, readFile = p => fs.readFileSync(path.join(workspace, p))}) {
  const log = decode(logBytes), source = JSON.parse(decode(sourceBytes)), checks = [];
  const check = (ok, code) => {requireEvidence(ok, code); checks.push(code);};
  const one = (re, code, text = log) => {const ms = [...text.matchAll(re)]; check(ms.length === 1, code); return ms[0];};
  manifest(source); manifest(baselineSource); checks.push('source_and_reviewed_manifest_digests');
  // Preserve the exact observed build-only tool crash. This is the original
  // gate's bounded same-command retry, never a retry of failed tests or SQL.
  const toolCrash = 'internal/abi: C:\\Program Files\\Go\\pkg\\tool\\windows_amd64\\vet.exe: exit status 0xc0000043\nFAIL\n警告: Windows vet/asm/compile process exited with a known tool crash; retrying the SAME mysql-probe-build command (1/3 failed). Vet remains enabled; isolated cache is retained only until this run ends.\n';
  const toolAt=log.indexOf(toolCrash),toolFailures=[];
  if(toolAt>=0){
    const detachedEnd=log.indexOf('LOCAL_PASS config-standalone-seed=yes'),probeEnd=log.indexOf('LOCAL_PASS a-download-gc-role-unit-tests=yes'),remoteStart=log.indexOf('RUN namespace=');
    check(detachedEnd>=0&&toolAt>detachedEnd&&probeEnd>toolAt&&remoteStart>probeEnd&&log.indexOf(toolCrash,toolAt+1)<0,'known_build_retry_in_original_local_stage_once');
    const gate=source.files.find(f=>f.path==='scripts/system-backup-a-evidence-go-step.ps1'),bytes=gate&&readFile(gate.path);
    check(gate&&bytes.length===gate.size&&sha256(bytes)===gate.sha256,'known_retry_gate_frozen_bytes');
    toolFailures.push({package:'internal/abi',tool:'vet.exe',status:'0xc0000043',stage:'mysql-probe-build',failed_attempt:1,max_attempts:3,original_failure_retained:true,same_command_retry_completed:true});
  }
  check(!/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^fatal error:|^.*CLEANUP_PENDING/m.test(toolAt<0?log:log.replace(toolCrash,'')), 'no_failure_skip_panic_or_pending_cleanup');
  const frozen = one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm, 'one_frozen_source');
  check(frozen[1] === source.source_sha256 && Number(frozen[2]) === source.files.length, 'log_source_binding');
  const run = one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm, 'one_actual_remote_run');
  check(/^sbk-mig-\d{12}-[a-f0-9]{4}$/.test(run[1]) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(run[2]) && /^8\.4\.\d+(?:[-.\w]*)$/.test(run[5]) && [run[3], run[4]].every(p => /@sha256:[a-f0-9]{64}$/.test(p)), 'actual_namespace_images_mysql_identity');
  const local = log.slice(0, run.index), remote = log.slice(run.index), stages = localStages(local);
  check(!baselineEvents.some(e => ['fail', 'skip', 'build-fail'].includes(e.Action)) && packages.every(p => baselineEvents.filter(e => e.Package === p && !e.Test && e.Action === 'pass').length === 1), 'reviewed_ordinary_baseline_success');
  for (const stage of stages.slice(0, 2)) {
    const expected = baselineEvents.filter(e => e.Package === stage.package && e.Test && e.Action === 'pass').map(e => e.Test);
    check(expected.length > 0 && exact(baselineEvents.filter(e => e.Package === stage.package && e.Test && e.Action === 'run').map(e => e.Test), expected) && exact(stage.names.map(canonicalLocalName), expected), 'complete_ordinary_inventory_' + stage.package);
  }
  const pins = new Map(source.files.map(f => [f.path, f])), old = new Map(baselineSource.files.map(f => [f.path, f]));
  for (const f of source.files.filter(f => /^(backend|contracts)\//.test(f.path))) {
    if (old.get(f.path)?.sha256 === f.sha256 && old.get(f.path)?.size === f.size) continue;
    check(f.path.endsWith('_mysql_test.go'), 'ordinary_input_change_requires_reviewed_baseline');
    const b = readFile(f.path);
    check(b.length === f.size && sha256(b) === f.sha256 && /^\/\/go:build systembackup_mysql\r?\n/.test(b.toString('utf8')), 'changed_tagged_input_current_and_tagged');
  }
  check(baselineSource.files.filter(f => /^(backend|contracts)\//.test(f.path)).every(f => pins.has(f.path)), 'no_baseline_input_removed');
  check(exact(stages[2].names, seedNames), 'exact_two_packaged_seeds_nine_checks');
  const detachedAt = local.indexOf('LOCAL_PASS config-standalone-seed=yes', stages[2].end);
  check(detachedAt > stages[2].end, 'detached_seed_boundary');
  const detached = local.slice(stages[2].end, detachedAt);
  check(exact(runs(detached), seedNames) && exact(passes(detached), seedNames) && /\nPASS\s*$/.test(detached), 'exact_two_detached_seeds_nine_checks');
  for (const marker of ['PASS download-gc-role-dispatch:', 'LOCAL_PASS isolated-go-telemetry=off', 'LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent', 'VALIDATION_SCOPE download-gc-role-only=yes isolated-candidate-accounts=yes privileged-metadata-observer=yes maintenance=absent full-gc=not-run role-approval=no production-approval=no real_mysql=not_run', 'bundle.tar: OK']) check(local.includes(marker), 'local_' + marker.split(' ')[0] + '_' + marker.split(' ')[1]);
  const probe = one(/^LOCAL_PASS a-download-gc-role-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm, 'one_compiled_probe');
  check(probe[2] === pins.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json')?.sha256, 'probe_capsule_frozen_pin');
  const runner = one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm, 'one_migration_runner');
  const migrationPins = source.files.filter(f => f.path.startsWith('backend/internal/db/migrations/') && f.path.endsWith('.sql'));
  const baselineMigrationCount=baselineSource.files.filter(f=>f.path.startsWith('backend/internal/db/migrations/')&&f.path.endsWith('.sql')).length;
  check(catalog.file_count === migrationPins.length && catalog.file_count === baselineMigrationCount && remote.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`) && remote.includes(frozenMigrationReplay(source)), 'runner_and_complete_migration_catalog');
  check(migrationPins.every(f => {const b = readFile(f.path); return b.length === f.size && sha256(b) === f.sha256;}), 'frozen_formal_migrations_match_current_catalog');
  const migrated = JSON.parse(one(/^\{"config_activated":false,.*"result":"PASS"\}\s*$/gm, 'one_migration_result', remote)[0]);
  check(migrated.migration_count === catalog.file_count && migrated.migration_catalog_sha256 === catalog.hash && migrated.human_mfa_verified === false && migrated.historical_equivalence_verified === false, 'migration_identity_and_limited_scope');
  const expected = [testRoot, ...roleCases.map(n => testRoot + '/' + n)];
  check(exact(runs(remote), expected) && exact(passes(remote), expected) && /\nPASS\n/.test(remote), 'exact_ten_actual_cases_and_root');
  const databases = [], accounts = [], roles = [], foreignSchemas = [];
  for (const name of roleCases) {
    const start = remote.indexOf('=== RUN   ' + testRoot + '/' + name + '\n'); check(start >= 0, 'case_boundary_' + name);
    const next = remote.indexOf('=== RUN', start + 10), segment = remote.slice(start, next < 0 ? remote.length : next);
    const database = one(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g, 'one_cleaned_database_' + name, segment)[1];
    const account = one(/CLEANED GC role owned account (a_gc_[a-f0-9]{20})\b/g, 'one_cleaned_account_' + name, segment)[1];
    databases.push(database); accounts.push(account);
    if (name === 'least_privilege_metadata_and_lock') check(segment.includes('OBSERVED restricted metadata parity tables/columns/incoming-FKs/indexes and users.id FOR UPDATE; maintenance=absent full_gc=not_run'), 'restricted_metadata_parity_and_real_row_lock');
    if (name === 'forbidden_data_and_ddl') check(segment.includes('OBSERVED seven actual MySQL permission denials; no raw error/credential output'), 'seven_actual_permission_denials');
    if (name.includes('_revoke_')) check(segment.includes('OBSERVED original-session and new-session grant denial; failed guard stays failed after regrant; fresh post-restore session succeeds'), 'old_new_revoke_regrant_' + name);
    if (name === 'global_revoke_old_and_new_sessions') check(/OBSERVED post-REFERENCES-revocation metadata_matches_privileged= (?:true|false)\b/.test(segment), 'actual_post_global_revoke_metadata_observation');
    if (name === 'active_role_rejected') {
      check(segment.includes('OBSERVED CURRENT_ROLE activation and component denial; assigned roles also change the pinned direct-grant set'), 'actual_role_activation_and_rejection');
      const role = one(/CLEANED GC role owned role (a_gc_[a-f0-9]{20}_r)\b/g, 'one_cleaned_role', segment)[1];
      check(role === account + '_r', 'cleaned_role_bound_to_case_account'); roles.push(role);
    }
    if (name.startsWith('cross_schema_')) {
      const rule = name.includes('cascade') ? 'CASCADE' : 'RESTRICT';
      check(segment.includes('OBSERVED complete cross-schema incoming FK visibility and structural denial after privileged re-pin ' + rule) && /OBSERVED foreign-schema FK pin matches privileged observer after REFERENCES revocation= (?:true|false)\b/.test(segment), 'actual_incoming_fk_and_revoked_visibility_' + rule);
      const foreign = one(/CLEANED GC role owned foreign schema (agcfk_[a-f0-9]{20})\b/g, 'one_cleaned_foreign_schema_' + rule, segment)[1];
      check(foreign === 'agcfk_' + account.slice('a_gc_'.length), 'foreign_schema_bound_to_case_account_' + rule); foreignSchemas.push(foreign);
    }
    if(name==='metadata_drift'&&toolAt>=0)check(segment.includes('OBSERVED privileged column metadata drift; original pin rejected; isolated repin accepted'),'repaired_metadata_drift_actual_pin_rejection_and_repin');
  }
  for (const [kind, list, count, re] of [
    ['databases', databases, 10, /CLEANED download MFA owned database amfa_[a-f0-9]{32}\b/g],
    ['accounts', accounts, 10, /CLEANED GC role owned account a_gc_[a-f0-9]{20}\b/g],
    ['roles', roles, 1, /CLEANED GC role owned role a_gc_[a-f0-9]{20}_r\b/g],
    ['foreign_schemas', foreignSchemas, 2, /CLEANED GC role owned foreign schema agcfk_[a-f0-9]{20}\b/g]
  ]) check(list.length === count && new Set(list).size === count && [...remote.matchAll(re)].length === count, 'exact_distinct_cleanup_' + kind);
  check(remote.includes(`PASS a-download-gc-role-mysql binary_sha256=${probe[1]} inputs_sha256=${probe[2]} new_cases=10 actual_sql_accounts=yes metadata_observer=privileged maintenance=absent full_gc=not_run role_approval=no human_mfa=no provider_read=no production_approval=no`), 'phase_pass_exact_probe_capsule_and_scope');
  const namespaceCleanup = one(/^CLEANED namespace=(\S+) uid=(\S+)$/gm, 'one_namespace_cleanup', remote);
  check(namespaceCleanup[1] === run[1] && namespaceCleanup[2] === run[2], 'original_namespace_uid_cleanup');
  const owner = one(/^LOCAL_OWNER config-writer-source=(.+)$/gm, 'one_local_source_owner')[1].trim();
  check(path.dirname(path.resolve(owner)).toLowerCase() === workspace.toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)), 'local_source_owner_inside_workspace');
  check(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`) && !exists(owner), 'local_source_cleanup_independently_absent');
  for (const marker of ['CLEANED remote-registration-scratch=yes', 'CLEANED local-registration-build-cache=True', 'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True']) check(remote.includes(marker), 'final_' + marker.split(' ').slice(0, 2).join('_'));
  const outer = one(/^a_download_gc_role_mysql_remote_exit=(-?\d+)$/gm, 'one_outer_exit', remote); check(outer[1] === '0', 'outer_exit_zero');
  check(/(?:PowerShell transcript end|Windows PowerShell 脚本结束)/.test(remote) && /(?:End time:|结束时间:)/.test(remote), 'transcript_completed');
  const drift = source.files.filter(f => {try {const b = readFile(f.path); return b.length !== f.size || sha256(b) !== f.sha256;} catch {return true;}}).map(f => f.path);
  return {kind: 'a_gc_restricted_role_actual_mysql_acceptance', recorded_at: new Date().toISOString(), status: 'accepted_isolated_ten_role_cases_only',
    log_sha256: sha256(logBytes), source_manifest_sha256: sha256(sourceBytes), source_sha256: source.source_sha256, source_files: source.files.length,
    ordinary_inventory_source_sha256: baselineSource.source_sha256, local_stages: stages.map(s => ({package: s.package, main: s.names.filter(n => !n.includes('/')).length, all: s.names.length})), detached_seed_checks: 9,
    ordinary_test_name_encoding_aliases: stages.slice(0, 2).flatMap(s => s.names.filter(n => canonicalLocalName(n) !== n).map(n => ({original: n, canonical: canonicalLocalName(n)}))),
    namespace: run[1], namespace_uid: run[2], app_image: run[3], mysql_image: run[4], mysql_version: run[5], probe_sha256: probe[1], inputs_sha256: probe[2], migration_runner_sha256: runner[1], catalog,
    actual_case_names: roleCases, actual_case_count: 10, cleaned_databases: databases, cleaned_accounts: accounts, cleaned_roles: roles, cleaned_foreign_schemas: foreignSchemas, local_source_owner: owner, retained_local_tool_failures:toolFailures,
    current_pinned_drift: drift, current_whole_worktree_verified: false, actual_mysql: true, maintenance_receipts: 'absent', full_gc: false, role_approval: false, production_approved: false, dependencies_installed: false, checks_passed: checks.length, checks};
}
function inputPath(name) {
  requireEvidence(typeof name === 'string' && path.basename(name) === name && /^[A-Za-z0-9._-]+$/.test(name), 'evidence_basename_required');
  const p = path.join(workspace, 'docs/evidence', name); requireEvidence(!fs.lstatSync(p).isSymbolicLink(), 'evidence_not_redirected'); return p;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    requireEvidence((args.length === 4 || args.length === 5) && args[0] === '--log' && args[2] === '--source' && (args.length === 4 || args[4] === '--write'), 'usage_log_source_optional_write');
    const sourceBytes = fs.readFileSync(inputPath(args[3]));
    const result = validateRoleEvidence({logBytes: fs.readFileSync(inputPath(args[1])), sourceBytes, ...loadReviewedOwnerBaseline(sourceBytes), catalog: frozenMigrationCatalog(JSON.parse(decode(sourceBytes)))});
    result.log = 'docs/evidence/' + args[1]; result.source = 'docs/evidence/' + args[3]; result.reviewer_sha256 = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
    if (args[4] === '--write') fs.writeFileSync(path.join(workspace, 'docs/evidence', `a-download-gc-role-mysql-accepted-${result.namespace}.json`), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: result.status, namespace: result.namespace, actual_cases: 10, checks: result.checks_passed, receipt_written: args[4] === '--write'}));
  } catch (error) {console.error(JSON.stringify({status: 'rejected', code: error instanceof RoleEvidenceError ? error.code : 'invalid_or_unavailable_input', receipt_written: false})); process.exitCode = 1;}
}
