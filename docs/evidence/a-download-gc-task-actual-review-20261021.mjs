// Independent A review of the completed GC eligibility component, not full GC.
// Reads evidence only. Never executes Go, SSH, SQL, grants, or cleanup.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,decode,sha256,localStages,canonicalLocalName,loadReviewedOwnerBaseline,frozenMigrationCatalog,frozenMigrationReplay} from './a-download-owners-actual-review-20261020.mjs';
export const gcTaskCases=['backup','drill','preflight','artifact_verify','active_drill','active_preflight','active_artifact_verify','prune_reference','owner_deadline_not_expired','backup_row_lock','dependent_row_lock','empty_drill_range','empty_preflight_range','empty_artifact_verify_range','empty_prune_range','late_owner_fact','late_dependent_fact','late_prune_reference'];
const root='TestDDownloadGCTaskMySQL',packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence'];
const raw=p=>fs.readFileSync(path.join(workspace,p));
const json=p=>JSON.parse(decode(raw(p)));
const names=(text,action)=>[...text.matchAll(action==='run'?/^=== RUN\s+(\S+)\s*$/gm:/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);
export function validateGCTaskActual({logBytes,sourceBytes,baselineSource,baselineEvents,seedEvents,catalog,exists=fs.existsSync,readFile=raw}){
  const text=decode(logBytes),source=JSON.parse(decode(sourceBytes)),checks=[];
  const check=(ok,code)=>{if(!ok)throw new Error(code);checks.push(code);};
  const exact=(a,b,code)=>check(a.length===b.length&&new Set(a).size===a.length&&JSON.stringify(a.slice().sort())===JSON.stringify(b.slice().sort()),code);
  const one=(re,code,part=text)=>{const ms=[...part.matchAll(re)];check(ms.length===1,code);return ms[0];};
  check(source.stable_copy_verified===true&&source.dependencies_installed===false&&source.production_approved===false,'stable_offline_unapproved_source');
  check(new Set(source.files.map(f=>f.path)).size===source.files.length&&source.files.every(f=>/^(backend|contracts|scripts|docs)\//.test(f.path)&&!f.path.includes('\\')&&!f.path.split('/').some(p=>['.','..',''].includes(p))&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.size)&&f.size>=0),'safe_unique_source_files');
  check(sha256(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')===source.source_sha256,'source_digest');
  check(source.source_sha256===baselineSource.source_sha256&&JSON.stringify(source.files)===JSON.stringify(baselineSource.files),'exact_independently_reviewed_source');
  // Retain the one observed pre-test Windows assembler crash. The pinned gate
  // retries this exact command with vet enabled; assertions and SQL never retry.
  const crash='math: C:\\Program Files\\Go\\pkg\\tool\\windows_amd64\\asm.exe: exit status 0xc0000043\nFAIL\tclawreef/internal/systembackupsecurity [build failed]\nFAIL\tclawreef/internal/systembackupevidence [build failed]\nFAIL\n\u001b[33;1m警告: Windows vet/asm/compile process exited with a known tool crash; retrying the SAME test-vet command (1/3 failed). Vet remains enabled; isolated cache is retained only until this run ends.\u001b[0m\n';
  const crashAt=text.indexOf(crash),firstTest=text.indexOf('=== RUN');
  check(crashAt>=0&&crashAt<firstTest&&text.indexOf(crash,crashAt+1)<0,'one_retained_pre_test_windows_assembler_crash');
  const gatePin=source.files.find(f=>f.path==='scripts/system-backup-a-evidence-go-step.ps1'),gateBytes=readFile(gatePin.path);
  check(gateBytes.length===gatePin.size&&sha256(gateBytes)===gatePin.sha256,'known_retry_gate_matches_frozen_source');
  check(!/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^fatal error:|^.*CLEANUP_PENDING/m.test(text.replace(crash,'')),'no_assertion_skip_panic_pending_or_other_failed_attempt');
  const frozen=one(/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)$/gm,'one_frozen_binding');
  check(frozen[1]===source.source_sha256&&Number(frozen[2])===source.files.length,'log_source_binding');
  const run=one(/^RUN namespace=(\S+) uid=(\S+) app_image=(\S+) mysql_image=(\S+) mysql_version=(\S+)$/gm,'one_actual_remote_run');
  check(/^sbk-mig-\d{12}-[a-f0-9]{4}$/.test(run[1])&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(run[2])&&/^8\.4\.\d+(?:[-.\w]*)?$/.test(run[5])&&[run[3],run[4]].every(v=>/@sha256:[a-f0-9]{64}$/.test(v)),'run_uid_images_and_mysql');
  const local=text.slice(0,run.index),remote=text.slice(run.index),stages=localStages(local);
  check(!baselineEvents.some(e=>['fail','skip','build-fail'].includes(e.Action)),'reviewed_baseline_no_failures');
  for(const p of packages){const es=baselineEvents.filter(e=>e.Package===p),stage=stages.find(s=>s.package===p);check(es.filter(e=>!e.Test&&e.Action==='pass').length===1,'baseline_complete_'+p);exact(es.filter(e=>e.Test&&e.Action==='run').map(e=>e.Test),es.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test),'baseline_pairs_'+p);exact(stage.names.map(canonicalLocalName),es.filter(e=>e.Test&&e.Action==='pass').map(e=>e.Test),'full_local_inventory_'+p);}
  check(!seedEvents.some(e=>['fail','skip','build-fail'].includes(e.Action)),'seed_reference_no_failure');
  const seeds=seedEvents.filter(e=>e.Test&&e.Action==='pass'&&(e.Test==='TestDDownloadGCTaskMySQLSeed'||e.Test.startsWith('TestDDownloadGCTaskMySQLSeed/')||e.Test==='TestASensitiveDownloadMFAMySQLSeed'||e.Test.startsWith('TestASensitiveDownloadMFAMySQLSeed/'))).map(e=>e.Test);
  check(seeds.length===13&&seeds.filter(n=>!n.includes('/')).length===2,'two_seed_roots_thirteen_checks');exact(stages[2].names,seeds,'exact_packaged_seed_inventory');
  const end=local.indexOf('LOCAL_PASS config-standalone-seed=yes',stages[2].end);check(end>stages[2].end,'detached_boundary');const detached=local.slice(stages[2].end,end);exact(names(detached,'run'),seeds,'detached_seed_runs');exact(names(detached,'pass'),seeds,'detached_seed_passes');check(/\nPASS\s*$/.test(detached),'detached_terminal_pass');
  for(const marker of ['PASS download-gc-task-dispatch:','LOCAL_PASS isolated-go-telemetry=off','LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent','bundle.tar: OK','VALIDATION_SCOPE download-gc-task-only=yes component=SQLDownloadGCTaskEligibility scope=synthetic full-gc=not-run role-approval=no production-approval=no real_mysql=not_run'])check(local.includes(marker),'local_'+marker.split(' ').slice(0,2).join('_'));
  const probe=one(/^LOCAL_PASS d-download-gc-task-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})$/gm,'one_compiled_probe');
  check(probe[2]===source.files.find(f=>f.path==='backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json')?.sha256,'capsule_frozen_pin');
  const runner=one(/^LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})$/gm,'one_compiled_runner');
  check(catalog.file_count===96&&remote.includes(frozenMigrationReplay(source))&&remote.includes(`PASS pinned-migration-runner binary_sha256=${runner[1]} catalog_sha256=${catalog.hash}`),'complete_96_replay_and_runner_pin');
  const migrationPins=source.files.filter(f=>f.path.startsWith('backend/internal/db/migrations/')&&f.path.endsWith('.sql'));
  check(migrationPins.length===96&&migrationPins.every(f=>{const b=readFile(f.path);return b.length===f.size&&sha256(b)===f.sha256}),'exact_frozen_migrations');
  const migrated=JSON.parse(one(/^\{"config_activated":false,.*"result":"PASS"\}\s*$/gm,'one_migration_result',remote)[0]);check(migrated.migration_count===96&&migrated.migration_catalog_sha256===catalog.hash&&migrated.human_mfa_verified===false&&migrated.historical_equivalence_verified===false,'migration_scope_and_catalog');
  const expected=[root,...gcTaskCases.map(n=>root+'/'+n)];exact(names(remote,'run'),expected,'exact_eighteen_cases_and_root_run');exact(names(remote,'pass'),expected,'exact_eighteen_cases_and_root_pass');check(/^--- PASS: TestDDownloadGCTaskMySQL \([0-9.]+s\)$/m.test(remote)&&/^PASS$/m.test(remote),'actual_root_terminal_pass');
  const databases=[],locks=[],plans=[];
  const lockTables={backup_row_lock:'system_backups',dependent_row_lock:'system_backup_preflights',empty_drill_range:'system_restore_drills',empty_preflight_range:'system_backup_preflights',empty_artifact_verify_range:'system_backup_artifact_verifications',empty_prune_range:'system_backup_prune_items'};
  const planTables={drill:'system_restore_drills',preflight:'system_backup_preflights',artifact_verify:'system_backup_artifact_verifications',prune:'system_backup_prune_items'};
  for(const name of gcTaskCases){
    const at=remote.indexOf(`=== RUN   ${root}/${name}\n`);check(at>=0,'case_boundary_'+name);const next=remote.indexOf('=== RUN',at+10),segment=remote.slice(at,next<0?undefined:next);
    databases.push(one(/CLEANED download MFA owned database (amfa_[a-f0-9]{32})\b/g,'case_database_'+name,segment)[1]);
    const ls=[...segment.matchAll(/OBSERVED gc_task_lock table=(\w+) index=([A-Za-z0-9_]+) requesting_mode=(\S+) holder=(\d+) writer=(\d+) writer_rolled_back=yes/g)];
    check(ls.length===(lockTables[name]?1:0),'lock_count_in_case_'+name);
    if(lockTables[name]){const m=ls[0];check(m[1]===lockTables[name]&&Number(m[4])>0&&Number(m[5])>0&&m[4]!==m[5]&&m[3].includes('X'),'actual_lock_table_sessions_'+name);locks.push({case:name,table:m[1],index:m[2],requesting_mode:m[3],holder:Number(m[4]),writer:Number(m[5]),writer_rolled_back:true});}
    const expectedPlans=name==='backup'?['drill','preflight','artifact_verify','prune']:name.startsWith('empty_')?[name.slice(6,-6)]:[];
    const ps=[...segment.matchAll(/PLAN gc_task kind=(\w+) table=(\w+) access=(\S+) key=(\S+) sha256=([a-f0-9]{64})/g)];exact(ps.map(m=>m[1]),expectedPlans,'plan_kinds_'+name);
    for(const p of ps){check(planTables[p[1]]===p[2],'plan_table_'+name+'_'+p[1]);plans.push({case:name,kind:p[1],table:p[2],access:p[3],key:p[4],sha256:p[5]});}
    if(name==='empty_prune_range'){const m=one(/OBSERVED gc_task_prune_lock_equivalence component_and_predicate=same record_locks=(\d+) sha256=([a-f0-9]{64}) parent_fk_wait_excluded=yes/g,'prune_component_predicate_lock_equivalence',segment);check(Number(m[1])>0,'prune_actual_record_locks_nonempty');}
  }
  check(new Set(databases).size===18&&[...remote.matchAll(/CLEANED download MFA owned database amfa_[a-f0-9]{32}\b/g)].length===18,'eighteen_distinct_owned_databases');check(locks.length===6&&[...remote.matchAll(/OBSERVED gc_task_lock /g)].length===6,'six_exact_lock_observations');check(plans.length===8&&[...remote.matchAll(/PLAN gc_task /g)].length===8,'eight_exact_plan_summaries');
  check(remote.includes('PASS actual SQL GC task component cases=18 scope=synthetic full_gc=not_run role_approval=no production_approval=no'),'go_component_scope');
  check(remote.includes(`PASS d-download-gc-task-mysql binary_sha256=${probe[1]} inputs_sha256=${probe[2]} new_cases=18 component=SQLDownloadGCTaskEligibility scope=synthetic full_gc=not_run role_approval=no human_mfa=no provider_read=no production_approval=no`),'remote_probe_input_pins_and_scope');
  const cleaned=one(/^CLEANED namespace=(\S+) uid=(\S+)$/gm,'one_namespace_cleanup',remote);check(cleaned[1]===run[1]&&cleaned[2]===run[2],'original_namespace_uid');
  const owner=one(/^LOCAL_OWNER config-writer-source=(.+)$/gm,'one_local_source_owner')[1].trim();check(path.dirname(path.resolve(owner)).toLowerCase()===workspace.toLowerCase()&&/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(path.basename(owner)),'local_owner_in_workspace');check(remote.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`)&&!exists(owner),'local_owner_independently_absent');
  for(const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'])check(remote.includes(marker),'final_'+marker.split(' ').slice(0,2).join('_'));
  const exit=one(/^download_gc_task_exit=(-?\d+)$/gm,'one_outer_exit',remote);check(exit[1]==='0'&&/download_gc_task_exit=0\s*$/.test(remote),'terminal_outer_exit_zero');
  return {kind:'a_download_gc_task_actual_mysql_independent_acceptance',status:'accepted_exact_eighteen_gc_task_component_cases_only',log_sha256:sha256(logBytes),source_manifest_sha256:sha256(sourceBytes),source_sha256:source.source_sha256,source_files:source.files.length,namespace:run[1],namespace_uid:run[2],mysql_version:run[5],app_image:run[3],mysql_image:run[4],local_packages:stages.slice(0,2).map(s=>({package:s.package,main:s.names.filter(n=>!n.includes('/')).length,all:s.names.length})),retained_local_infrastructure_failure:{package:'math',tool:'asm.exe',status:'0xc0000043',failed_attempt:1,max_attempts:3,stage:'test-vet',before_any_test:true,full_same_command_retry_passed:true,failure_retained_in_raw_log:true},packaged_seed_checks:13,detached_seed_checks:13,probe_sha256:probe[1],inputs_sha256:probe[2],migration_runner_sha256:runner[1],catalog,actual_cases:gcTaskCases,actual_case_count:18,locks,plans,prune_parent_fk_wait_excluded:true,cleaned_databases:databases,local_owner:owner,local_owner_independently_absent:true,remote_cleanup:'reported_in_original_log_not_independently_reconnected',actual_mysql:true,full_gc:false,role_approval:false,human_mfa:false,provider_read:false,production_approved:false,existing_installation_upgrade_proven:false,scan_cost_bound_proven:false,global_writer_lock_order_proven:false,dependencies_installed:false,reviewer_executed_sql:false,checks_passed:checks.length,checks};
}
export function gcActualInputs(){const stem='docs/evidence/d-download-gc-task-remote-20261021-154631-7f8bf868',sourceBytes=raw(stem+'-source.json'),source=JSON.parse(decode(sourceBytes));return {logBytes:raw(stem+'.txt'),sourceBytes,...loadReviewedOwnerBaseline(sourceBytes),seedEvents:decode(raw('docs/evidence/d-prune-identity-20261021-r2-probe.jsonl')).trim().split('\n').map(JSON.parse),catalog:frozenMigrationCatalog(source)};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const record=validateGCTaskActual(gcActualInputs()),dPath='docs/evidence/d-download-gc-task-actual-accepted-20261021.json',d=json(dPath);
  assert.equal(d.status,'actual_mysql_18_of_18_accepted_component_only');assert.equal(d.log_sha256,record.log_sha256);assert.equal(d.source_manifest_sha256,record.source_manifest_sha256);
  record.d_receipt=dPath;record.d_receipt_sha256=sha256(raw(dPath));record.reviewer_sha256=sha256(raw('docs/evidence/a-download-gc-task-actual-review-20261021.mjs'));
  const output='docs/evidence/a-download-gc-task-actual-accepted-20261021.json';
  if(process.argv[2]==='--check')assert.deepEqual(json(output),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
  console.log(JSON.stringify({status:record.status,actual_cases:18,migrations:96,locks:6,plans:8,checks:record.checks_passed,full_gc:false,role_approval:false}));
}
