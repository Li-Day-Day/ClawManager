// Independent archived preparation review. No Go, Docker, SQL or SSH execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDownloadAuditInputs} from '../../scripts/system-backup-d-download-audit-bundle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bytes=p=>readFileSync(resolve(root,p));
const json=p=>JSON.parse(bytes(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks={};function check(name,v){assert.ok(v,name);checks[name]=true;}
const dPath='docs/evidence/system-backup-d-download-audit-review-20261016-r50.json';
const d=json(dPath),m=json(d.source_manifest),a=json('docs/evidence/a-download-audit-review-20261016.json');
const log=bytes(d.raw_log).toString('utf8').replaceAll('\r\n','\n');
check('D_archived_bytes',sha(bytes(d.raw_log))===d.raw_log_sha256&&sha(bytes(d.source_manifest))===d.source_manifest_sha256);
const digest=sha(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
check('same_exact_snapshot_as_A_storage_review',m.files.length===1310&&m.source_sha256===digest&&d.source_sha256===digest&&a.source_sha256===digest);
const events=log.split('\n').filter(l=>l.startsWith('{"Time":')).map(l=>JSON.parse(l));
check('no_failure_or_skip',events.length>0&&!events.some(e=>['fail','skip'].includes(e.Action))&&!/^\s*--- FAIL:|CLEANUP_PENDING|^panic:|^fatal error:/m.test(log));
const active=new Map(),groups=[];
for(const e of events){
 if(e.Action==='start')active.set(e.Package,[]);
 if(e.Action==='pass'&&e.Test){assert.ok(active.has(e.Package));active.get(e.Package).push(e.Test);}
 if(e.Action==='pass'&&!e.Test){assert.ok(active.has(e.Package));groups.push({package:e.Package,tests:active.get(e.Package)});}
}
check('three_complete_package_groups',groups.length===3&&groups.every(g=>new Set(g.tests).size===g.tests.length));
const seedName='TestDDownloadAdmissionAuditMySQLSeed';
const defaults=groups.filter(g=>!g.tests.includes(seedName)),seed=groups.filter(g=>g.tests.includes(seedName));
const defaultTests=defaults.flatMap(g=>g.tests);
check('two_full_packages_3246_checks',defaults.length===2&&new Set(defaults.map(g=>g.package)).size===2&&defaults.some(g=>g.package==='clawreef/internal/systembackupsecurity')&&defaults.some(g=>g.package==='clawreef/internal/systembackupevidence')&&defaultTests.length===3246&&defaultTests.filter(t=>!t.includes('/')).length===434&&d.default_including_subtests===3246&&d.default_main===434);
check('seed_six_checks_not_real_MySQL',seed.length===1&&seed[0].tests.length===6&&seed[0].tests.filter(t=>!t.includes('/')).length===1&&!events.some(e=>/^TestDDownloadAdmissionAuditMySQL(?:\/|$)/.test(e.Test??''))&&d.actual_mysql_case_executions===0&&d.remote_executed===false);
check('detached_seed_repeat_not_added',(log.match(/^--- PASS: TestDDownloadAdmissionAuditMySQLSeed \(/gm)??[]).length===1&&(log.match(/^    --- PASS: TestDDownloadAdmissionAuditMySQLSeed\//gm)??[]).length===5&&d.detached_seed_repeat_not_added===true);
const ownNames=p=>[...bytes(p).toString('utf8').matchAll(/^func (TestDownloadAdmissionAudit\w+)\(/gm)].map(x=>x[1]);
const DNames=ownNames('backend/internal/systembackupevidence/download_admission_audit_test.go');
const ANames=ownNames('backend/internal/systembackupevidence/download_admission_audit_a_test.go');
check('separate_D34_and_A27',DNames.length===5&&ANames.length===3&&defaultTests.filter(t=>DNames.includes(t.split('/')[0])).length===34&&defaultTests.filter(t=>ANames.includes(t.split('/')[0])).length===27);
check('vet_dispatch_and_zero_exit',log.includes('PASS download-audit dispatch bindings=13 dedicated-root=yes network=no products=none')&&log.includes('LOCAL_STAGE download-audit buffered-reports=yes default-vet=yes retry=no')&&log.includes('go version go1.26.1 linux/amd64')&&/^d_download_admission_audit_exit=0$/m.test(log)&&d.default_vet===true&&d.per_gate_test_retries===0);
const bundle=log.split('\n').filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return {};}}).find(v=>v.kind==='d_download_audit_bundle');
check('Linux_binary_capsule_runner_pins',bundle&&bundle.image_pull_policy==='Never'&&bundle.catalog_migrations===95&&bundle.schema_ddl_installed===false&&JSON.stringify(bundle.pins)===JSON.stringify(d.payloads)&&bundle.pins.length===3&&bundle.pins.every(p=>/^[a-f0-9]{64}$/.test(p.sha256)&&p.bytes>0));
const capsule=buildDownloadAuditInputs();
check('current_95_file_catalog_capsule',capsule.migration_files.length===95&&capsule.catalog_sha256==='2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237'&&sha(Buffer.from(JSON.stringify(capsule)))===bundle.pins.find(p=>p.path==='d-download-audit-inputs.json').sha256);
check('postchecks_and_local_cleanup',log.includes('LOCAL_PASS d-download-audit-frozen-postcheck=yes remote-requested=False dependencies-installed=no')&&log.includes('CLEANED download-audit-local-source-cache=True')&&/^\.tmp-d-index-cache-[a-f0-9]{32}$/.test(d.owner_directory_checked_absent)&&!existsSync(resolve(root,d.owner_directory_checked_absent)));
const containerPath='docs/evidence/a-download-audit-preparation-container-check-20261016.json',container=json(containerPath);
check('exact_D_container_read_only_absence',container.container===d.container_name&&container.escalated_exit===0&&container.escalated_stdout_empty===true&&container.exact_container_confirmed_absent===true&&container.container_mutations===0&&container.remote_executed===false);
const compared=m.files.map(p=>({...p,status:!existsSync(resolve(root,p.path))?'missing':sha(bytes(p.path))===p.sha256?'matched':'changed'}));
const focused=compared.filter(p=>p.path.startsWith('backend/internal/systembackupevidence/')||p.path.startsWith('backend/internal/systembackupsecurity/')||p.path.startsWith('scripts/system-backup-d-download-audit-')||p.path.startsWith('backend/internal/db/migrations/')||/^backend\/go\.(mod|sum)$/.test(p.path)||['scripts/system-backup-d-index-source-snapshot.ps1','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-fresh-migration-smoke.sh','scripts/system-backup-smoke-contract.sh','scripts/system-backup-d-invariants-phase.sh','scripts/system-backup-d-migration-phase.sh','backend/internal/systembackupcontroller/bootstrap.go'].includes(p.path));
check('387_preparation_inputs_match',focused.length===387&&focused.every(p=>p.status==='matched'));
const decision=json(d.decision),erratum=json(d.erratum);
check('original_decision_preserved',sha(bytes(d.decision))===d.decision_sha256&&d.decision_sha256==='8b14d0804e9bfb4b5169bc585fd1aa50d38877b61b228984184c7427d73d8eac'&&erratum.decision_sha256===d.decision_sha256&&sha(bytes(d.erratum))===d.erratum_sha256);
check('D_erratum_closes_semantic_discrepancy',erratum.overrides['signed_request.empty_content'].includes('rejects ContentSize <= 0')&&erratum.overrides['signed_request.empty_content'].includes('reserved future encoding')&&erratum.audit_timestamp_clarification.includes('TIMESTAMP(0)')&&erratum.key_grammar_clarification.includes('[A-Za-z0-9._:-]{16,128}')&&erratum.production_approval===false&&erratum.migration_catalog_modified===false);
check('scope_stays_pending',decision.production_approval===false&&decision.runtime_adapter_enabled===false&&d.nonce_consumption_implemented===false&&d.full_prelocked_prefix_implemented===false&&d.operation_receipt_atomic_admission_implemented===false&&d.production_adapter_enabled===false&&d.overall_goal_complete===false);
const receipt={kind:'a_independent_D_download_audit_remote_preparation_review',recorded_at:new Date().toISOString(),status:'prepared_for_operator_four_case_remote_execution_actual_result_pending',checks,D_receipt:dPath,D_receipt_sha256:sha(bytes(dPath)),raw_log:d.raw_log,raw_log_sha256:d.raw_log_sha256,source_manifest:d.source_manifest,source_manifest_sha256:d.source_manifest_sha256,source_sha256:digest,source_files:m.files.length,default_main:434,default_subtests:2812,default_checks:3246,D_audit_checks:34,A_audit_checks:27,unique_seed_checks:6,detached_seed_repeat_not_added:true,payloads:bundle.pins,catalog_sha256:capsule.catalog_sha256,focused_current_pins:focused,current_manifest_drift:compared.filter(p=>p.status!=='matched'),additions_not_enumerated_or_accepted:true,decision:d.decision,decision_sha256:d.decision_sha256,erratum:d.erratum,erratum_sha256:d.erratum_sha256,container_observation:containerPath,container_observation_sha256:sha(bytes(containerPath)),owned_source_independently_absent:resolve(root,d.owner_directory_checked_absent),reviewer_sha256:sha(bytes('docs/evidence/a-download-audit-remote-preparation-review-20261016.mjs')),tests_or_builds_rerun:false,dependencies_installed:false,remote_executed:false,actual_MySQL_cases:0,expected_remote_cases:['actual_insert_id_and_timestamp','rollback_visibility','same_transaction_mutation','cross_transaction_anchor'],requires_new_remote_source_and_payload_pins:true,fixture_root_grants_only:true,full_admission:false,nonce_consumption:false,production_approval:false,overall_goal_complete:false};
if(process.argv.includes('--record'))writeFileSync(resolve(root,'docs/evidence/a-download-audit-remote-preparation-review-20261016.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:Object.keys(checks).length,default_checks:3246,unique_seed:6,focused:focused.length,drift:receipt.current_manifest_drift.map(p=>p.path),actual_MySQL_cases:0,remote_ready:true,recorded:process.argv.includes('--record')},null,2));
