import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const [round='r1',mode='--inspect']=process.argv.slice(2);
assert.match(round,/^r[1-9][0-9]*$/);
const logName=`docs/evidence/a-download-mfa-mysql-local-20261019-${round}.txt`;
const sourceName=`docs/evidence/a-download-mfa-mysql-source-20261019-${round}.json`;
const read=name=>fs.readFileSync(name,'utf8').replace(/^\uFEFF/,'');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const log=read(logName),lines=log.split(/\r?\n/);
const passes=[...log.matchAll(/^\s*--- PASS: (\S+) \(/gm)].map(m=>m[1]);
const fails=lines.filter(l=>/^\s*--- FAIL:|^FAIL\s|^panic:|^fatal error:|\.exe: exit status/.test(l));
const packages=lines.filter(l=>/^ok\s+clawreef\//.test(l));
const inspect={round,passing_events:passes.length,packages,failures:fails,new_preview:passes.filter(n=>n.startsWith('TestDownloadPreview')).length,seed:passes.filter(n=>n.startsWith('TestASensitiveDownloadMFAMySQLSeed')).length,complete:log.includes('a_download_mfa_preparation_exit=0'),last:lines.filter(Boolean).at(-1)};
if(mode==='--inspect'){console.log(JSON.stringify(inspect));process.exit(0)}
assert.equal(mode,'--record');
const checks=[],check=(name,condition)=>{assert.ok(condition,name);checks.push(name)};
check('final original transcript reports exit zero',/^a_download_mfa_preparation_exit=0\s*$/m.test(log));
const toolFailures=fails.filter(l=>/\b(?:compile|vet|asm)\.exe: exit status 0xc000(?:0043|026b)\s*$/.test(l));
const toolRetries=lines.filter(l=>l.includes('retrying the SAME ') && l.includes('Vet remains enabled'));
check('no failed or skipped test assertions',!/^\s*--- (?:FAIL|SKIP):|^panic:|^fatal error:/m.test(log));
check('original tool crashes retained with matching bounded retries',fails.every(l=>toolFailures.includes(l) || /^FAIL\s+clawreef\/.*\[build failed\]\s*$/.test(l)) && toolFailures.length===toolRetries.length && toolFailures.length<=2);
check('both complete affected packages and tagged evidence seed passed',packages.length===3 && packages.filter(l=>/^ok\s+clawreef\/internal\/systembackupsecurity\s/.test(l)).length===1 && packages.filter(l=>/^ok\s+clawreef\/internal\/systembackupevidence\s/.test(l)).length===2);
check('new preview main/children all passed',passes.filter(n=>n==='TestDownloadPreviewLoadsActualManifestWithoutLateLocks').length===1 && passes.filter(n=>n==='TestDownloadPreviewFailsClosedBeforeChunkOrAuthority' || n.startsWith('TestDownloadPreviewFailsClosedBeforeChunkOrAuthority/')).length===17);
check('seed ran both package and detached binary: eight checks each',passes.filter(n=>n==='TestASensitiveDownloadMFAMySQLSeed' || n.startsWith('TestASensitiveDownloadMFAMySQLSeed/')).length===16);
check('detached seed executed outside checkout',log.includes('LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent'));
check('Linux probe, inputs and pinned migration runner built',/^LOCAL_PASS a-download-mfa-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=[a-f0-9]{64} ddl_sha256=[a-f0-9]{64}\s*$/m.test(log) && /^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=[a-f0-9]{64}\s*$/m.test(log));
check('frozen postcheck and no remote/no installs',log.includes('LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False'));
check('telemetry disabled',log.includes('LOCAL_PASS isolated-go-telemetry=off'));
const source=JSON.parse(read(sourceName));
check('stable bounded source capture and no dependency install',source.stable_copy_verified && source.dependencies_installed===false && source.capture_attempts>=1 && source.capture_attempts<=3);
check('unique frozen source paths',new Set(source.files.map(p=>p.path)).size===source.files.length);
check('source digest independently recomputed',hash(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===source.source_sha256);
const focus=[
 'backend/internal/systembackupevidence/sql.go',
 'backend/internal/systembackupevidence/sensitive_download_preview.go',
 'backend/internal/systembackupevidence/sensitive_download_preview_test.go',
 'backend/internal/systembackupevidence/sensitive_download_mfa_mysql_test.go',
 'backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json',
 'backend/internal/systembackupevidence/sensitive_download_totp.go',
 'backend/internal/systembackupevidence/download_admission_environment.go',
 'backend/internal/systembackupevidence/download_admission_environment_test.go',
 'backend/internal/systembackupevidence/download_admission_transaction_model_test.go',
 'backend/internal/systembackupsecurity/sensitive_download_totp.go',
 'backend/internal/systembackupsecurity/totp_sql.go',
 'scripts/system-backup-a-download-mfa-inputs.mjs',
 'scripts/system-backup-a-download-mfa-phase.sh',
 'scripts/system-backup-a-download-mfa-dispatch.test.ps1',
 'scripts/system-backup-a-evidence-validation.ps1',
 'scripts/system-backup-d-config-writer-validation.ps1',
 'scripts/system-backup-a-evidence-go-step.ps1',
 'docs/system-backup-d-download-admission-schema-proposal-20261019.sql',
 'docs/system-backup-d-config-canonical-081-proposal-20261014.sql',
];
const excludedFocusDrifts=[];
const mutableDInputs=new Set(['backend/internal/systembackupevidence/download_admission_environment.go','backend/internal/systembackupevidence/download_admission_transaction_model_test.go']);
const pins=focus.map(name=>{const p=source.files.find(p=>p.path===name),b=fs.readFileSync(name);check('required frozen pin exists: '+name,!!p);const matches=p.sha256===hash(b) && p.size===b.length;if(mutableDInputs.has(name) && !matches){excludedFocusDrifts.push({path:name,frozen_sha256:p.sha256,current_sha256:hash(b),reason:'D added public/internal preparation and known-commit/streaming SQL model paths after capture; new bytes excluded from this frozen MFA preparation acceptance'});}else{check('current required pin: '+name,matches)};return p});
const currentModel=read('backend/internal/systembackupevidence/download_admission_transaction_model_test.go');
check('current D model retains detached fixture factory hooks without claiming it tested',currentModel.includes('return newAdmissionTxFixtureWithConfig(t, admissionConfigFixture)') && currentModel.includes('config, cells := configFactory(t, hash(rbac))') && currentModel.includes('decoder := json.NewDecoder(bytes.NewReader(raw))'));
const transportName='docs/evidence/a-download-mfa-mysql-transport-20261019.txt',transport=read(transportName);
check('PS7 new/nonce and four old profile transport QA exit zero',/^download_mfa_transport_check_exit=0\s*$/m.test(transport) && (transport.match(/^PASS download-mfa-dispatch:/gm)??[]).length===1 && (transport.match(/^PASS nonce-acceptance-dispatch:/gm)??[]).length===1 && (transport.match(/^PASS config-writer-dispatch /gm)??[]).length===4);
const nativeTransportName='docs/evidence/a-download-mfa-mysql-transport-native-20261019.txt',nativeTransport=read(nativeTransportName);
check('WinPS native new/nonce QA exit zero with stdout captured',/^download_mfa_native_transport_check_exit=0\s*$/m.test(nativeTransport) && (nativeTransport.match(/^PASS download-mfa-dispatch:/gm)??[]).length===1 && (nativeTransport.match(/^PASS nonce-acceptance-dispatch:/gm)??[]).length===1 && nativeTransport.includes('"files":95'));
const capsule=JSON.parse(read(focus[4]));
check('candidate capsules exact pinned bytes',hash(capsule.canonical_ddl)===capsule.canonical_sha256 && hash(capsule.ownership_ddl)===capsule.ownership_sha256 && capsule.migration_files.length===95);
const owned=[...log.matchAll(/^LOCAL_CLEANUP config-writer-source-owned=(.+?) removed=True\s*$/gm)].map(m=>m[1].trim());
const outer=log.match(/^LOCAL_OWNER config-writer-source=(.+)\s*$/m)?.[1].trim();
check('exact source owner logged and independently absent',outer && owned.includes(outer) && path.dirname(path.resolve(outer)).toLowerCase()===process.cwd().toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(outer)) && !fs.existsSync(outer));
check('nested build/cache cleanup reported and enclosing exact source absent',owned.length===1 && log.includes('CLEANED local-registration-build-cache=True') && !fs.existsSync(outer));
const oldLogName='docs/evidence/a-download-mfa-mysql-local-20261019-r1.txt',oldSourceName='docs/evidence/a-download-mfa-mysql-source-20261019-r1.json';
const oldLog=read(oldLogName),oldSource=JSON.parse(read(oldSourceName));
check('initial detached seed failure retains exit one and missing-checkout diagnosis',/^a_download_mfa_preparation_exit=1\s*$/m.test(oldLog) && oldLog.includes('open ../../../docs/evidence/a-config-canonical-request-vectors-20261014.json') && /^--- FAIL: TestASensitiveDownloadMFAMySQLSeed /m.test(oldLog) && !oldLog.includes('LOCAL_PASS config-writer-frozen-postcheck=yes'));
check('initial frozen manifest logical digest independently recomputed',hash(oldSource.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===oldSource.source_sha256);
const oldOwner=oldLog.match(/^LOCAL_OWNER config-writer-source=(.+)\s*$/m)?.[1].trim();
check('initial exact source owner independently absent with build cleanup reported',oldOwner && oldOwner!==outer && path.dirname(path.resolve(oldOwner)).toLowerCase()===process.cwd().toLowerCase() && /^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(oldOwner)) && !fs.existsSync(oldOwner) && oldLog.includes('LOCAL_CLEANUP config-writer-source-owned='+oldOwner+' removed=True') && oldLog.includes('CLEANED local-registration-build-cache=True'));
owned.push(oldOwner);
const drifts=source.files.flatMap(p=>{if(!fs.existsSync(p.path))return [{path:p.path,missing:true}];const b=fs.readFileSync(p.path);return p.sha256===hash(b) && p.size===b.length?[]:[{path:p.path,frozen_sha256:p.sha256,current_sha256:hash(b)}]});
const probe=log.match(/^LOCAL_PASS a-download-mfa-unit-tests=yes .* binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})\s*$/m);
const runner=log.match(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})\s*$/m);
const result={kind:'a_download_mfa_mysql_preparation_review',status:'prepared_frozen_local_inputs_actual_sql_pending',recorded_at:new Date().toISOString(),log:logName,log_sha256:hash(fs.readFileSync(logName)),source:sourceName,source_manifest_sha256:hash(fs.readFileSync(sourceName)),source_files:source.files.length,source_sha256:source.source_sha256,checks_passed:checks.length,checks,transport_log:transportName,transport_log_sha256:hash(fs.readFileSync(transportName)),packages,passing_events:passes.length,ordinary_package_passes:passes.filter(n=>!n.startsWith('TestASensitiveDownloadMFAMySQLSeed')).length,new_preview_checks:18,seed_checks:16,probe_sha256:probe[1],inputs_sha256:probe[2],migration_runner_sha256:runner[1],required_pins:pins,current_required_drifts_excluded:excludedFocusDrifts,current_input_drifts_excluded:drifts,entire_current_tree_accepted:false,newly_added_current_files_accepted:false,exact_owned_paths_independently_absent:owned,nested_build_cache_cleanup_reported:true,nested_build_exact_name_independently_recorded:false,original_tool_failures_retained:toolFailures,tool_retry_markers:toolRetries,initial_failed_round:{log:oldLogName,log_sha256:hash(fs.readFileSync(oldLogName)),source:oldSourceName,source_manifest_sha256:hash(fs.readFileSync(oldSourceName)),source_sha256:oldSource.source_sha256,actual_exit:1,reason:'detached seed exposed a checkout-relative canonical fixture read; now embedded, with unchanged production validation',postcheck_claimed:false},dependencies_installed:false,remote_executed:false,actual_new_MySQL_cases_run:0,prepared_new_MySQL_cases:9,real_owner_or_human_MFA_approved:false,formal_schema_approved:false,production_route_enabled:false};
Object.assign(result,{native_transport_log:nativeTransportName,native_transport_log_sha256:hash(fs.readFileSync(nativeTransportName)),original_transport_native_stdout_not_captured:true});
const output='docs/evidence/a-download-mfa-mysql-preparation-review-20261019.json';fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,checks:checks.length,ordinary:result.ordinary_package_passes,seed:16,drifts:drifts.length,cleaned:owned.length}));
