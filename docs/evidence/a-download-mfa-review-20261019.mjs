import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const [prefix, mode = '--inspect'] = process.argv.slice(2);
assert.match(prefix ?? '', /^a-download-mfa-packages-20261019-r[1-9][0-9]*$/);
const base = `docs/evidence/${prefix}`;
const read = name => fs.readFileSync(name, 'utf8').replace(/^\uFEFF/, '');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const raw = read(base + '.jsonl');
const lines = raw.split(/\r?\n/).filter(line => line.startsWith('{'));
const events = [], incomplete = [];
for (let i = 0; i < lines.length; i++) {
  try { events.push(JSON.parse(lines[i])); } catch { incomplete.push(i); }
}
const passed = events.filter(e => e.Action === 'pass' && e.Test);
const failures = events.filter(e => e.Action === 'fail' || e.Action === 'build-fail');
const mfa = e => /^(TestSensitiveDownload(TOTP|ProofHTTP|MFA)|TestPinnedDownloadMFA)/.test(e.Test ?? '');
const roots = [...new Set(events.filter(e => e.Test && !e.Test.includes('/') && mfa(e)).map(e => e.Test))];
const counts = roots.map(name => ({name, passed: passed.filter(e => e.Test === name || e.Test.startsWith(name + '/')).length}));
const summary = { prefix, incomplete, failures: failures.map(e => ({action:e.Action,package:e.Package,importPath:e.ImportPath, test:e.Test})), build_diagnostics:events.filter(e=>e.Action==='build-output' && (failures.some(f=>f.ImportPath===e.ImportPath) || /error|failed|cannot|unable|denied|resource|timeout|access|exhaust|compile:|vet:/i.test(e.Output??''))).map(e=>({importPath:e.ImportPath,output:e.Output})), packages:events.filter(e => !e.Test && ['pass','fail'].includes(e.Action)), passed:passed.length, mfa:counts, latest:events.at(-1) && {time:events.at(-1).Time,action:events.at(-1).Action, test:events.at(-1).Test} };
if (mode === '--inspect') { console.log(JSON.stringify(summary)); process.exit(0); }
assert.equal(mode, '--record');
const checks = [], check = (name, value) => { assert.ok(value,name); checks.push(name); };
const sourcePath = base+'-source.json', nativePath = base+'-native.txt';
const source = JSON.parse(read(sourcePath)), native = read(nativePath);
check('original JSON stream complete', incomplete.length === 0);
check('all test and package events green with no skips', failures.length === 0 && !events.some(e => e.Action === 'skip'));
check('all package tests unique', new Set(passed.map(e => e.Package+':'+e.Test)).size === passed.length);
const packages = ['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
check('exact two final affected packages passed', summary.packages.length === 2 && packages.every(p => summary.packages.filter(e => e.Package===p && e.Action==='pass').length===1));
check('default vet and Go exit zero for both final affected packages', /^NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence default_vet=yes\s*$/m.test(native) && /^NATIVE_EXIT full_two_packages=0\s*$/m.test(native));
check('outer exit zero and frozen postcheck', /^d_admission_native_exit=0\s*$/m.test(native) && native.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'));
check('frozen capture stable without dependency installation', source.stable_copy_verified && source.dependencies_installed===false && source.capture_attempts>=1 && source.capture_attempts<=3);
check('frozen input paths unique', new Set(source.files.map(p=>p.path)).size===source.files.length);
check('logical source digest independently recomputed', hash(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===source.source_sha256);
check('native transcript binds exact manifest count and digest', native.includes(`FROZEN files=${source.files.length} sha256=${source.source_sha256} owner=`));
check('native stderr empty', read(base+'-stderr.txt').trim()==='');
const focus = [
  'backend/internal/systembackupsecurity/sensitive_download_totp.go',
  'backend/internal/systembackupsecurity/sensitive_download_totp_test.go',
  'backend/internal/systembackupsecurity/sensitive_download_request.go',
  'backend/internal/systembackupsecurity/totp_sql.go',
  'backend/internal/systembackupsecurity/totp.go',
  'backend/internal/systembackupsecurity/config_mutation_totp.go',
  'backend/internal/systembackupsecurity/config_mutation_totp_test.go',
  'backend/internal/systembackupsecurity/registration_api.go',
  'backend/internal/systembackupsecurity/providerproof_http.go',
  'backend/internal/systembackupsecurity/providerproof_transaction.go',
  'backend/internal/systembackupevidence/sensitive_download_totp.go',
  'backend/internal/systembackupevidence/sensitive_download_totp_test.go',
  'backend/internal/systembackupevidence/sensitive_download_request.go',
  'backend/internal/systembackupevidence/download_admission_environment.go',
  'backend/internal/systembackupsecurity/sensitive_download_config.go',
  'backend/internal/systembackupsecurity/sensitive_download_nonce_scope.go',
  'backend/internal/systembackupsecurity/config_mutation_session.go',
  'backend/internal/systembackupsecurity/config_mutation_strongauth.go',
  'backend/internal/systembackupsecurity/evidence_rbac.go',
  'backend/internal/systembackupsecurity/registration_files.go',
  'backend/internal/systembackupsecurity/providerproof_registry.go',
  'scripts/system-backup-d-download-admission-native-validation.ps1',
];
const pins = focus.map(name => {
  const pin = source.files.find(p=>p.path===name), current = fs.readFileSync(name);
  check('current reviewed pin matches: '+name, pin && pin.size===current.length && pin.sha256===hash(current));
  return pin;
});
const runner = read(focus.at(-1));
check('runner offline with clear inherited Go flags and telemetry off', runner.includes("$env:GOPROXY='off';$env:GOSUMDB='off';$env:GOTOOLCHAIN='local';$env:GOENV='off';$env:GOFLAGS=''") && runner.includes("'off 2026-10-19'") && !runner.includes('-vet=off'));
const expected = new Map([
  ['TestSensitiveDownloadTOTPIssuesOriginalRequestOnce',1],
  ['TestSensitiveDownloadTOTPRejectsAuthoritySessionAndCommitFailures',24],
  ['TestSensitiveDownloadProofHTTPClosedSelectorsAndActualMFA',14],
  ['TestSensitiveDownloadMFASelectorStrictWire',24],
  ['TestSensitiveDownloadMFARejectsMissingRuntimeBeforeSQL',9],
  ['TestPinnedDownloadMFAUsesIdenticalGETBindingWithoutAdmissionEffects',6],
  ['TestPinnedDownloadMFARereadsOriginalAuthorityAndMaterial',15],
]);
for (const [name,n] of expected) check(`MFA ${name}: ${n} main/child results passed`, passed.filter(e=>e.Test===name || e.Test.startsWith(name+'/')).length===n);
check('new MFA group has exactly seven root tests', roots.length===7);
const owner = native.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\s*$/m)?.[1].trim();
check('accurate snapshot and build/cache owner removed', owner && path.dirname(path.resolve(owner)).toLowerCase()===process.cwd().toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)) && !fs.existsSync(owner) && /^CLEANED snapshot=True\s*$/m.test(native));
const drifts = source.files.flatMap(pin => {
  if (!fs.existsSync(pin.path)) return [{path:pin.path,missing:true}];
  const current = fs.readFileSync(pin.path);
  return current.length===pin.size && hash(current)===pin.sha256 ? [] : [{path:pin.path,frozen_sha256:pin.sha256,current_sha256:hash(current)}];
});
const earlierBase='docs/evidence/a-download-mfa-packages-20261019-r1';
const earlierNative=read(earlierBase+'-native.txt'),earlierSource=JSON.parse(read(earlierBase+'-source.json'));
const earlierEvents=read(earlierBase+'.jsonl').split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
check('earlier three packages retain passing test execution without a test fail or skip', !earlierEvents.some(e=>['fail','skip'].includes(e.Action)) && ['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/cmd/server'].every(p=>earlierEvents.filter(e=>e.Package===p && !e.Test && e.Action==='pass').length===1));
const earlierBuildFailures=earlierEvents.filter(e=>e.Action==='build-fail');
check('earlier native gate remains failed with exact dependency vet failure', earlierBuildFailures.length===1 && earlierBuildFailures[0].ImportPath==='vendor/golang.org/x/net/http/httpproxy' && earlierEvents.some(e=>e.Action==='build-output' && e.ImportPath==='vendor/golang.org/x/net/http/httpproxy' && e.Output.includes('vet.exe: exit status 0xc0000043')));
check('earlier actual Go/outer exits one and successful source postcheck retained', /^NATIVE_EXIT full_packages=1 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/cmd\/server default_vet=yes\s*$/m.test(earlierNative) && /^d_admission_native_exit=1\s*$/m.test(earlierNative) && earlierNative.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'));
check('earlier integration manifest logical digest independently recomputed', hash(earlierSource.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===earlierSource.source_sha256 && earlierNative.includes(`FROZEN files=${earlierSource.files.length} sha256=${earlierSource.source_sha256} owner=`));
const earlierOwner=earlierNative.match(/^FROZEN files=\d+ sha256=[a-f0-9]{64} owner=(.+)\s*$/m)?.[1].trim();
check('earlier integration exact source/build/cache owner independently absent', earlierOwner && earlierOwner!==owner && path.dirname(path.resolve(earlierOwner)).toLowerCase()===process.cwd().toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(earlierOwner)) && !fs.existsSync(earlierOwner) && /^CLEANED snapshot=True\s*$/m.test(earlierNative));
const incrementalPins = pins.flatMap(p=>earlierSource.files.some(old=>old.path===p.path && old.sha256===p.sha256 && old.size===p.size)?[]:[p]);
const result = {
  kind:'a_sensitive_download_mfa_local_review', status:'accepted_frozen_local_candidate_only', recorded_at:new Date().toISOString(),
  log:base+'.jsonl',log_sha256:hash(fs.readFileSync(base+'.jsonl')), native:nativePath,native_sha256:hash(fs.readFileSync(nativePath)),
  source:sourcePath,source_manifest_sha256:hash(fs.readFileSync(sourcePath)),source_files:source.files.length,source_sha256:source.source_sha256,
  executor:'A invocation of shared D frozen native gate', checks_passed:checks.length,checks,
  packages:packages.map(p=>({package:p,main:passed.filter(e=>e.Package===p && !e.Test.includes('/')).length,children:passed.filter(e=>e.Package===p && e.Test.includes('/')).length})),
  passed_including_subtests:passed.length,new_mfa_checks:counts,new_mfa_including_subtests:[...expected.values()].reduce((a,b)=>a+b,0),
  focus_pins:pins,current_unrelated_drifts_excluded:drifts,entire_current_tree_accepted:false,newly_added_files_accepted:false,
  earlier_failed_native_gate:{status:'failed_original_not_reclassified',actual_exit:1,reason:'vendor/golang.org/x/net/http/httpproxy vet.exe exited 0xc0000043; no further operating-system cause inferred',log:earlierBase+'.jsonl',log_sha256:hash(fs.readFileSync(earlierBase+'.jsonl')),native:earlierBase+'-native.txt',native_sha256:hash(fs.readFileSync(earlierBase+'-native.txt')),source:earlierBase+'-source.json',source_manifest_sha256:hash(fs.readFileSync(earlierBase+'-source.json')),source_sha256:earlierSource.source_sha256,source_files:earlierSource.files.length,passing_test_events_including_subtests:earlierEvents.filter(e=>e.Action==='pass' && e.Test).length,build_failures:earlierBuildFailures,exact_owned_path_independently_absent:earlierOwner,scope:'original three frozen packages had passing test events but native gate exit one; not accepted as a successful integration gate. Later MFA changes covered only by final two affected packages.',later_focus_pins:incrementalPins},
  exact_owned_path_independently_absent:owner,dependencies_installed:false,default_vet:true,
  actual_password_AESGCM_TOTP_JWT_Ed25519:true, SQL_transport_and_owner_facts:'scripted model with synthetic material files',
  real_human_MFA_accepted:false,real_owner_adapter_accepted:false,real_MySQL_issuance_accepted:false,
  runtime_download_source_enabled:false,formal_schema_approved:false,production_download_route_enabled:false,
};
const output='docs/evidence/a-download-mfa-review-20261019.json';
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,checks:checks.length,passed:passed.length,mfa:result.new_mfa_including_subtests,drifts:drifts.length}));
