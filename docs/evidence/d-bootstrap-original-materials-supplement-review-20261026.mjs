import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..'),evidence=path.join(root,'docs/evidence');
const local=name=>{const p=path.resolve(root,name);assert.ok(p.startsWith(root+path.sep));return p;};
const raw=name=>fs.readFileSync(local(name));
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const json=name=>JSON.parse(decode(raw(name)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const relative=name=>path.relative(root,local(name)).replaceAll('\\','/');
const [receiptFile,output,mode,...extra]=process.argv.slice(2);
assert.ok(receiptFile&&output&&!extra.length&&(mode===undefined||mode==='--check'));
assert.equal(path.dirname(local(output)),evidence);
const receipt=json(receiptFile),source=json(receipt.source_manifest);
assert.equal(receipt.kind,'d_gc_full_supplement_validation.v1');assert.equal(receipt.error,null);
for(const key of ['frozen_inputs_stable','owner_removed','binary_removed'])assert.equal(receipt[key],true,key);
for(const key of ['dependencies_installed','actual_mysql','production_approved'])assert.equal(receipt[key],false,key);
assert.equal(receipt.bootstrap_actual_cases_executed,0);
assert.match(receipt.linux_binary_sha256,/^[a-f0-9]{64}$/);
assert.equal(fs.existsSync(local(receipt.owner)),false);
assert.equal(source.kind,'d_gc_full_frozen_source.v1');assert.equal(source.stable_copy_verified,true);
assert.equal(source.dependencies_installed,false);
assert.deepEqual(source.files.map(p=>p.path),source.files.map(p=>p.path).toSorted());
assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
for(const p of source.files){assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);local(p.path);}
assert.equal(sha(source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),source.source_sha256);
const driver='docs/evidence/d-gc-full-supplement-validation-20261026.ps1';
assert.equal(sha(raw(driver)),receipt.driver_sha256);
const driverText=decode(raw(driver));
assert.ok(driverText.includes('^Test(DDownloadGCFullCollectMySQLSeed|DDownloadGCFullProfileMySQLSeed|DBootstrapOriginalMaterialsMySQLSeed)$'));
assert.ok(driverText.includes("'-mod=readonly'"));assert.ok(driverText.includes("$env:GOPROXY='off'"));
assert.ok(driverText.includes("'-tags','systembackup_mysql','-c'"));
assert.deepEqual(receipt.steps.map(s=>s.name),['evidence','metadata','seeds','linux-tagged','linux-server','linux-bootstrap','linux-nonce','linux-ca']);
const logs=receipt.steps.map(s=>{assert.equal(s.exit_code,0,s.name);if(s.name.startsWith('linux-'))assert.match(s.binary_sha256,/^[a-f0-9]{64}$/);return {name:s.name,path:relative(s.log),sha256:sha(raw(s.log)),exit_code:0,...(s.binary_sha256?{binary_sha256:s.binary_sha256}:{})};});
validateGoEvents(decode(raw(receipt.steps.find(s=>s.name==='evidence').log)),'clawreef/internal/systembackupevidence');
validateGoEvents(decode(raw(receipt.steps.find(s=>s.name==='metadata').log)),'clawreef/internal/systembackupgcmetadata');
assert.equal(receipt.steps.find(s=>s.name==='linux-tagged').binary_sha256,receipt.linux_binary_sha256);
assert.equal(source.ordinary_backend_from_joint_only,true);assert.equal(source.whole_current_tree_ready,false);
const seedLog=receipt.steps.find(s=>s.name==='seeds').log;
assert.deepEqual(validateGoEvents(decode(raw(seedLog)),'clawreef/internal/systembackupevidence'),['TestDBootstrapOriginalMaterialsMySQLSeed','TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullProfileMySQLSeed']);
assert.match(decode(raw(seedLog)),/PASS bootstrap-original-materials-seed new_compatible_lifecycle=yes original_files=yes nonce_material=actual_owned_bytes ca_tls=actual_loopback handshakes=2 actual_mysql=not_run production=no/);
const names=['backend/internal/systembackupevidence/bootstrap_original_materials_mysql_test.go',
 'backend/internal/systembackupevidence/bootstrap_consumer_mysql_test.go','backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json',
 'scripts/system-backup-d-bootstrap-consumer-mysql-inputs.mjs','scripts/system-backup-d-bootstrap-original-materials-mysql-validation.ps1','scripts/system-backup-d-bootstrap-original-materials-phase.sh',
 'backend/internal/systembackupsecurity/config_bootstrap_candidates.go','backend/internal/systembackupsecurity/bootstrap_candidate_files.go',
 'backend/internal/systembackupsecurity/bootstrap_candidate_authority.go','backend/internal/systembackupsecurity/bootstrap_candidate_capacity.go',
 'backend/internal/systembackupnoncebootstrap/candidate_adapter.go','backend/internal/systembackupcatrust/candidate_adapter.go'];
const pins=names.map(name=>{const pin=source.files.find(p=>p.path===name);assert.ok(pin,name);return pin;});
assert.equal(pins[0].sha256,'19b1c83160c3cc93f707ed90dfbe06155e2ae6a5f04d727a8d1e3e97496ee2ad');
assert.equal(pins[0].size,25537);assert.equal(sha(raw(names[0])),pins[0].sha256);assert.equal(raw(names[0]).length,pins[0].size);
const probe=decode(raw(names[0]));
assert.match(probe,/!inner\.preparedReady/);assert.match(probe,/s\.nonce\.DependencyDeadline\(\) != nil/);assert.match(probe,/c\.DependencyDeadline\(\) != nil/);
const receiverLog='docs/evidence/d-bootstrap-original-materials-mysql-receiver-tests-20261026-r4.txt';
for(const pattern of [/tests 40/,/pass 40/,/fail 0/,/skipped 0/])assert.match(decode(raw(receiverLog)),pattern);
const syntax='docs/evidence/d-bootstrap-original-materials-script-syntax-20261026.txt';
assert.match(decode(raw(syntax)),/^PS_AST_PASS\r?\nBASH_SYNTAX_PASS native_exit=0 no_script_execution=yes\r?\n$/);
const rejected='docs/evidence/d-bootstrap-original-materials-local-rejected-20261026-3ff8211f.json';
assert.equal(json(rejected).native_terminal_exit,1);assert.equal(json(rejected).seed_roots_executed,0);
const artifacts=[receiptFile,receipt.source_manifest,driver,...receipt.steps.map(s=>s.log),receiverLog,syntax,rejected,
 'docs/evidence/d-bootstrap-original-materials-mysql-review-20261026.mjs','docs/evidence/d-bootstrap-original-materials-mysql-review-20261026.test.mjs',
 'docs/evidence/d-bootstrap-original-materials-supplement-review-20261026.mjs'];
const result={kind:'d_bootstrap_original_materials_local_supplement_review.v1',status:'passed_exact_seed_and_linux_tagged_compile_only',
 source_sha256:source.source_sha256,source_files:source.files.length,seed_root:'TestDBootstrapOriginalMaterialsMySQLSeed',
 native_steps:logs,linux_probe_sha256:receipt.linux_binary_sha256,original_probe_pin_current_match:true,compiled_dependency_pins:pins,current_whole_dependency_match_claimed:false,
 original_nonce_preparation_ready:true,original_two_ca_preparation_ready:true,actual_loopback_tls_handshakes:2,seed_sql_is_fake:true,
 owner:receipt.owner,owner_recorded_removed:true,owner_independently_absent:true,build_products_removed:true,
 receiver_tests:{pass:40,fail:0,skip:0,actual_mysql:false},script_syntax:{powershell_ast:true,bash_n:true},
 dedicated_wrapper_succeeded:false,embedded_migration_runner_new_build_claimed:false,ordinary_regression_claimed:false,
 actual_mysql_run:false,actual_mysql_cases_passed:0,planned_mysql_cases:22,actual_material_transaction_rollback_executed:false,
 historical_tls_scope:'Original APIs on every attempt before BEGIN; whole attempt may perform TLS. Work-end forbids redial. No unlocked history hint.',
 synthetic_deployment_authority:true,physical_capacity_verified:false,provider_permission_verified:false,production_approved:false,
 dependencies_installed:false,first_failed_run_preserved:rejected,first_failed_run_reclassified:false,
 artifacts:[...new Set(artifacts.map(relative))].map(name=>({path:name,sha256:sha(raw(name))}))};
if(mode==='--check')assert.deepEqual(json(output),result);else fs.writeFileSync(local(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('BOOTSTRAP_ORIGINAL_MATERIALS_LOCAL_SUPPLEMENT seed=1 linux_tagged_compile=1 receiver=40 cleanup=yes actual_mysql=not_run source='+source.source_sha256);
