import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateManifest, validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const local=name=>{const p=path.resolve(root,name);assert.ok(p.startsWith(root+path.sep));return p;};
const raw=name=>fs.readFileSync(local(name));
const json=name=>JSON.parse(raw(name).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const relative=name=>path.relative(root,local(name)).replaceAll('\\','/');
const [receiptFile,output,mode,...extra]=process.argv.slice(2);
assert.ok(receiptFile&&output&&!extra.length&&(mode===undefined||mode==='--check'));
assert.equal(path.dirname(local(output)),path.join(root,'docs/evidence'));
const receipt=json(receiptFile),manifest=json(receipt.source);
validateManifest(manifest);
assert.equal(receipt.kind,'d_bootstrap_original_materials_mysql_preparation.v1');
assert.equal(receipt.suite,'bootstrap-original-materials');assert.equal(receipt.error,null);
for(const key of ['source_postcheck','owner_removed','synthetic_proofs'])assert.equal(receipt[key],true);
for(const key of ['remote_requested','remote_scratch_removed','dependencies_installed','production_approved','actual_mysql_results_accepted'])assert.equal(receipt[key],false);
assert.equal(fs.existsSync(local(receipt.owner)),false);
assert.equal(receipt.steps.length,3);
const commands=[
  ['go','test','-tags','systembackup_mysql','-run','^TestDBootstrap(ConsumerMySQLSeed|ConsumerRangesMySQLSeed|OriginalMaterialsMySQLSeed)$','-count=1','-timeout=180s','-json','./internal/systembackupevidence'],
  ['go','test','-c','-tags','systembackup_mysql','-o',path.join(receipt.owner,'bundle/d-bootstrap-original-materials.test'),'./internal/systembackupevidence'],
  ['go','build','-o',path.join(receipt.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate'],
];
for(const [i,s] of receipt.steps.entries()){assert.equal(s.exit_code,0);assert.equal(s.platform,i===0?'windows':'linux');assert.deepEqual(s.command,commands[i]);assert.equal(sha(raw(s.log)),s.log_sha256);}
assert.deepEqual(validateGoEvents(raw(receipt.steps[0].log).toString('utf8'),'clawreef/internal/systembackupevidence'),['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed']);
assert.match(raw(receipt.steps[0].log).toString('utf8'),/capacity_report_prepare=real_helper/);
assert.match(raw(receipt.steps[0].log).toString('utf8'),/PASS bootstrap-original-materials-seed new_compatible_lifecycle=yes original_files=yes nonce_material=actual_owned_bytes ca_tls=actual_loopback handshakes=2 actual_mysql=not_run production=no/);
const names=['backend/internal/systembackupevidence/bootstrap_original_materials_mysql_test.go',
 'backend/internal/systembackupevidence/bootstrap_consumer_mysql_test.go','backend/internal/systembackupevidence/bootstrap_consumer_ranges_mysql_test.go','backend/internal/systembackupevidence/d_producer_mysql_test.go','backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json',
 'scripts/system-backup-d-bootstrap-consumer-mysql-inputs.mjs','scripts/system-backup-d-bootstrap-original-materials-mysql-validation.ps1','scripts/system-backup-d-bootstrap-original-materials-phase.sh',
 'backend/internal/systembackupsecurity/config_bootstrap_candidates.go','backend/internal/systembackupsecurity/bootstrap_candidate_files.go',
 'backend/internal/systembackupsecurity/bootstrap_candidate_authority.go','backend/internal/systembackupsecurity/bootstrap_candidate_capacity.go',
 'backend/internal/systembackupnoncebootstrap/candidate_adapter.go','backend/internal/systembackupcatrust/candidate_adapter.go'];
const ownPins=names.map(name=>{const pin=manifest.files.find(p=>p.path===name);assert.ok(pin);const b=raw(name);assert.equal(b.length,pin.size);assert.equal(sha(b),pin.sha256);return pin;});
assert.equal(receipt.inputs_sha256,ownPins.find(p=>p.path.endsWith('bootstrap-consumer-mysql-inputs.json')).sha256);
const go=raw(names[0]).toString('utf8');
assert.match(go,/!inner\.preparedReady/);assert.match(go,/s\.nonce\.DependencyDeadline\(\) != nil/);assert.match(go,/c\.DependencyDeadline\(\) != nil/);
const receiverLog='docs/evidence/d-bootstrap-original-materials-mysql-receiver-tests-20261026-r4.txt';
const receiverText=raw(receiverLog).toString('utf8');
for(const pattern of [/tests 40/,/pass 40/,/fail 0/,/skipped 0/])assert.match(receiverText,pattern);
const syntax='docs/evidence/d-bootstrap-original-materials-script-syntax-20261026.txt';
assert.match(raw(syntax).toString('utf8'),/^PS_AST_PASS\r?\nBASH_SYNTAX_PASS native_exit=0 no_script_execution=yes\r?\n$/);
const prior='docs/evidence/d-bootstrap-original-materials-local-rejected-20261026-3ff8211f.json',failed=json(prior);
assert.equal(failed.native_terminal_exit,1);assert.equal(failed.seed_roots_executed,0);assert.equal(failed.owner_independently_absent,true);
const artifacts=[receiptFile,receipt.source,...receipt.steps.map(s=>s.log),receiverLog,syntax,
 'docs/evidence/d-bootstrap-original-materials-mysql-review-20261026.mjs','docs/evidence/d-bootstrap-original-materials-mysql-review-20261026.test.mjs',
 'docs/evidence/d-bootstrap-original-materials-mysql-local-review-20261026.mjs',prior];
const reviewed={kind:'d_bootstrap_original_materials_mysql_local_review.v1',status:'passed_exact_local_preparation_only',
 source_sha256:manifest.source_sha256,source_files:manifest.files.length,capture_attempts:manifest.capture_attempts,
 native_terminal_exit:0,seed_roots:['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed'],linux_builds:['evidence_probe','embedded_migration_runner'],
 binary_sha256:receipt.binary_sha256,migration_binary_sha256:receipt.migration_binary_sha256,inputs_sha256:receipt.inputs_sha256,
 source_postcheck:true,selected_input_pins_current_match:true,selected_input_pins:ownPins,default_vet:true,modules_readonly:true,dependencies_installed:false,
 owner:receipt.owner,owner_recorded_removed:true,owner_independently_absent:true,test_build_artifacts_removed:true,
 receiver_tests:{pass:40,fail:0,skip:0,actual_mysql:false},script_syntax:{powershell_ast:true,bash_n:true},
 actual_mysql_run:false,actual_mysql_cases_passed:0,planned_mysql_cases:22,synthetic_authority:true,
 seed_real_nonce_prepared:true,seed_real_ca_prepared:true,seed_actual_loopback_tls_handshakes:2,seed_sql_is_fake:true,
 historical_tls_scope:'Real nonce and CA Prepare on every attempt before BEGIN; physical failure remains closed until locked L3 chooses history/new use. No Work-end redial, producer reexecution, receipt refresh or repeated charge. Whole historical attempt may perform TLS.',
 physical_capacity_verified:false,provider_permission_verified:false,production_approved:false,
 ordinary_joint_regression_claimed:false,copy_regression_execution_claimed:false,actual_material_transaction_rollback_executed:false,
 prior_failed_run_preserved:prior,prior_failed_run_reclassified:false,
 artifacts:[...new Set(artifacts.map(relative))].map(name=>({path:name,sha256:sha(raw(name))}))};
if(mode==='--check')assert.deepEqual(json(output),reviewed);else fs.writeFileSync(local(output),JSON.stringify(reviewed,null,2)+'\n',{flag:'wx'});
console.log('BOOTSTRAP_ORIGINAL_MATERIALS_MYSQL_LOCAL_REVIEWED native=0 seed=3 linux_builds=2 receiver=40 cleanup=yes actual_mysql=not_run source='+manifest.source_sha256);
