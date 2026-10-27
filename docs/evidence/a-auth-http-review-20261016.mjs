// Review the archived full-package gate. No builds, installation or networking.
// --record creates a receipt once; a normal invocation only checks and prints.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rawPath = 'docs/evidence/a-auth-http-local-20261016-124641.txt';
const manifestPath = 'docs/evidence/a-auth-http-source-20261016-124641.json';
const installationPath = 'docs/evidence/a-auth-dependency-install-mirror-20261016-121154.txt';
const failedInstallationPath = 'docs/evidence/a-auth-dependency-install-20261016-121059.txt';
const receiptPath = 'docs/evidence/a-auth-http-review-20261016.json';
const bytes = p => readFileSync(resolve(root, p));
const sha = v => createHash('sha256').update(v).digest('hex');
const raw = bytes(rawPath).toString('utf8').replaceAll('\r\n', '\n');
const manifest = JSON.parse(bytes(manifestPath));
const install = bytes(installationPath).toString('utf8');
const failedInstall = bytes(failedInstallationPath).toString('utf8');
const checks = {};
function check(name, value) { assert.ok(value, name); checks[name] = true; }
const sourceSHA = sha(manifest.files.map(p => `${p.path}\0${p.sha256}\0${p.size}`).join('\n') + '\n');
check('frozen_manifest_digest', sourceSHA === manifest.source_sha256 && manifest.files.length === 1295 && manifest.stable_copy_verified === true && raw.includes(`LOCAL_SOURCE auth-http=yes source_sha256=${sourceSHA} files=1295`));
const events = raw.split('\n').filter(v => v.startsWith('{"Time":')).map(v => JSON.parse(v));
check('no_go_failure', events.length > 0 && !events.some(v => v.Action === 'fail'));
const packages = ['clawreef/internal/repository', 'clawreef/internal/services', 'clawreef/internal/middleware', 'clawreef/internal/handlers', 'clawreef/cmd/server'];
const packagePasses = events.filter(v => v.Action === 'pass' && !v.Test).map(v => v.Package);
check('five_full_packages_pass', packagePasses.length === 5 && packages.every(p => packagePasses.includes(p)));
const testPasses = events.filter(v => v.Action === 'pass' && v.Test).map(v => `${v.Package}:${v.Test}`);
check('unique_test_events', new Set(testPasses).size === testPasses.length);
const newTests = events.filter(v => v.Action === 'pass' && v.Test?.startsWith('TestAAuthHTTP'));
const newMainNames = ['TestAAuthHTTPLoginRefreshBindsRegisteredTokens', 'TestAAuthHTTPEnrollmentFailureWithholdsTokens', 'TestAAuthHTTPInvalidRequestsNeverEnroll', 'TestAAuthHTTPDirectoryUsesRequestAndProvisionedIdentity', 'TestAAuthHTTPLogoutRevokesBeforeSuccess'];
check('new_http_5_main_25_subchecks', newTests.length === 30 && newMainNames.every(n => newTests.some(v => v.Test === n)) && newTests.filter(v => v.Test.includes('/')).length === 25);
check('credential_logging_regression', events.filter(v => v.Action === 'pass' && v.Test?.startsWith('TestLoginStateFailureNeverLogsCredentialSnapshot')).length === 3);
check('browser_worker_fixture_regression', events.some(v => v.Action === 'pass' && v.Test === 'TestBrowserWorkerUnifiedDeleteCleansResourcesAndRetriesFailure'));
check('offline_default_vet_no_retry', raw.includes('LOCAL_STAGE auth-http-five-full-packages default-vet=yes retry=no dependency-downloads=no') && raw.includes('AUTH_HTTP_GO_EXIT=0') && raw.includes('LOCAL_PASS auth-http=yes five-full-packages=yes frozen-postcheck=yes default-vet=yes dependency-downloads=no real-mysql=no real-directory=no human-mfa=no production-grant=no') && !raw.includes('LOCAL_TOOL_RETRY'));
check('final_exit_zero', /^a_auth_http_exit=0$/m.test(raw));
const owned = [...raw.matchAll(/^LOCAL_CLEANUP auth-http-owned=(.+) removed=True$/gm)].map(v => v[1]);
check('two_owned_paths_absent', owned.length === 2 && owned.every(p => dirname(p) === root && /^\.tmp-(a-evidence|d-index-cache)-[a-f0-9]{32}$/.test(p.split(/[/\\]/).at(-1)) && !existsSync(p)));
const installOwners = [...(install + '\n' + failedInstall).matchAll(/CLEANED dependency-install-scratch=True path=([^\r\n]+)/g)].map(v => v[1]);
check('two_install_scratch_paths_absent', installOwners.length === 2 && installOwners.every(p => dirname(p) === root && !existsSync(p)));
const moduleSum = 'h1:c/Cqfb0r+Yi+JtIEq73FWXVkRonBlf0CRNYc8Zttxdo=';
check('pinned_dependency_installed', install.includes('AUTH_DEPENDENCY_INSTALL_EXIT=0') && install.includes('PASS dependency-module-lock-files-unchanged=yes') && install.includes(moduleSum) && bytes('backend/go.sum').toString('utf8').includes(`github.com/klauspost/compress v1.18.0 ${moduleSum}`));
check('official_proxy_failure_preserved', failedInstall.includes('AUTH_DEPENDENCY_INSTALL_EXIT=1') && failedInstall.includes('proxy.golang.org'));
const compared = manifest.files.map(p => ({ ...p, current_status: !existsSync(resolve(root, p.path)) ? 'missing' : sha(bytes(p.path)) === p.sha256 ? 'matched' : 'changed' }));
const focus = compared.filter(p => /^backend\/internal\/(handlers\/auth_|services\/(auth_|enterprise_auth|ldap_auth)|middleware\/auth_|repository\/user_|utils\/|systembackupsecurity\/login_sessions)/.test(p.path) || /^backend\/go\.(mod|sum)$/.test(p.path) || p.path === 'backend/internal/services/browser_worker_service_test.go' || p.path === 'backend/cmd/server/backup_sessions.go' || p.path === 'scripts/system-backup-a-auth-http-validation.ps1');
check('focused_auth_sources_match', focus.length > 20 && focus.every(v => v.current_status === 'matched'));
const skipped = events.filter(v => v.Action === 'skip' && v.Test).map(v => ({package: v.Package, test: v.Test}));
const receipt = {
  kind: 'a_auth_http_full_package_local_review', recorded_at: new Date().toISOString(),
  status: 'accepted_local_frozen_five_package_gate_only', checks,
  raw_log: rawPath, raw_sha256: sha(bytes(rawPath)), source_manifest: manifestPath,
  source_manifest_sha256: sha(bytes(manifestPath)), source_sha256: sourceSHA, source_files: manifest.files.length,
  packages, package_results: packagePasses,
  unique_main_tests: testPasses.filter(v => !v.split(':')[1].includes('/')).length,
  unique_subtests: testPasses.filter(v => v.split(':')[1].includes('/')).length,
  unique_checks: testPasses.length, new_http_main_tests: 5, new_http_subtests: 25,
  skipped_tests: skipped, default_vet: true, tool_retries: 0, process_exit: 0,
  focused_auth_pins: focus, current_manifest_drift: compared.filter(v => v.current_status !== 'matched'),
  current_additions_not_enumerated_or_accepted: true,
  owned_paths_independently_absent: [...owned, ...installOwners],
  dependencies: {user_authorized_install: true, module: 'github.com/klauspost/compress', version: 'v1.18.0', sum: moduleSum,
    success_log: installationPath, success_log_sha256: sha(bytes(installationPath)),
    prior_failed_log: failedInstallationPath, prior_failed_log_sha256: sha(bytes(failedInstallationPath)),
    source: 'goproxy.cn; repository go.sum verified; no version or lock-file change', retained_module_cache: true,
    network_downloads_during_test_gate: false},
  prior_full_gate_failure: 'docs/evidence/a-auth-http-initial-failure-review-20261016.json',
  corrective_changes: ['Avoid credential argument logging using the same database/sql DB/Tx and session context', 'Correct browser-worker deletion fixture root and instance path; retain production deletion guards and assert filesystem cleanup'],
  scope: {real_gin_handlers: true, real_auth_service: true, real_bcrypt_and_jwt: true, real_logout_jwt_middleware: true,
    http_transport: 'in-process httptest; no deployed HTTP or TLS-handshake evidence',
    user_repository_and_session_persistence: 'models', directory_transport: 'model',
    real_mysql: false, real_ldap_tls_bind_or_directory_revocation: false, human_mfa: false,
    production_grant: false, formal_schema_approval: false, overall_goal_complete: false},
};
if (process.argv.includes('--record')) writeFileSync(resolve(root, receiptPath), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({checks: Object.keys(checks).length, packages: packagePasses, main: receipt.unique_main_tests, sub: receipt.unique_subtests, new_http_checks: newTests.length, skipped, focus: focus.length, drift: receipt.current_manifest_drift.map(v => v.path), receipt: process.argv.includes('--record') ? receiptPath : 'not_written'}, null, 2));
