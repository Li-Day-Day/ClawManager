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
assert.equal(receipt.kind,'d_bootstrap_consumer_mysql_preparation.v1');
assert.equal(receipt.suite,'bootstrap-consumer');assert.equal(receipt.error,null);
for(const key of ['source_postcheck','owner_removed','synthetic_proofs'])assert.equal(receipt[key],true);
for(const key of ['remote_requested','remote_scratch_removed','dependencies_installed','production_approved','actual_mysql_results_accepted'])assert.equal(receipt[key],false);
assert.equal(fs.existsSync(local(receipt.owner)),false);
assert.equal(receipt.steps.length,3);
const commands=[
  ['go','test','-tags','systembackup_mysql','-run','^TestDBootstrapConsumerMySQLSeed$','-count=1','-timeout=180s','-json','./internal/systembackupevidence'],
  ['go','test','-c','-tags','systembackup_mysql','-o',path.join(receipt.owner,'bundle/d-bootstrap-consumer.test'),'./internal/systembackupevidence'],
  ['go','build','-o',path.join(receipt.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate'],
];
for(const [i,s] of receipt.steps.entries()){assert.equal(s.exit_code,0);assert.equal(s.platform,i===0?'windows':'linux');assert.deepEqual(s.command,commands[i]);assert.equal(sha(raw(s.log)),s.log_sha256);}
assert.deepEqual(validateGoEvents(raw(receipt.steps[0].log).toString('utf8'),'clawreef/internal/systembackupevidence'),['TestDBootstrapConsumerMySQLSeed']);
const names=['backend/internal/systembackupevidence/bootstrap_consumer_mysql_test.go','backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json',
  'scripts/system-backup-d-bootstrap-consumer-mysql-inputs.mjs','scripts/system-backup-d-bootstrap-consumer-mysql-validation.ps1','scripts/system-backup-d-bootstrap-consumer-phase.sh'];
const ownPins=names.map(name=>{const pin=manifest.files.find(p=>p.path===name);assert.ok(pin);const b=raw(name);assert.equal(b.length,pin.size);assert.equal(sha(b),pin.sha256);return pin;});
assert.equal(receipt.inputs_sha256,ownPins[1].sha256);
const receiverLog='docs/evidence/d-bootstrap-consumer-mysql-receiver-tests-20261026-r3.txt';
const receiverText=raw(receiverLog).toString('utf8');
assert.match(receiverText,/tests 25/);assert.match(receiverText,/pass 25/);assert.match(receiverText,/fail 0/);assert.match(receiverText,/skipped 0/);
const syntax='docs/evidence/d-bootstrap-consumer-script-syntax-20261026.txt';
assert.match(raw(syntax).toString('utf8'),/^PS_AST_PASS\r?\nBASH_SYNTAX_PASS native_exit=0 no_script_execution=yes\r?\n$/);
const prior='docs/evidence/d-bootstrap-consumer-mysql-20261026-114903-75e285e0.json',failed=json(prior);
assert.equal(failed.steps[0].exit_code,1);assert.equal(failed.owner_removed,true);assert.equal(fs.existsSync(local(failed.owner)),false);
const artifacts=[receiptFile,receipt.source,...receipt.steps.map(s=>s.log),receiverLog,syntax,
  'docs/evidence/d-bootstrap-consumer-mysql-review-20261026.mjs','docs/evidence/d-bootstrap-consumer-mysql-review-20261026.test.mjs',
  'docs/evidence/d-bootstrap-consumer-mysql-local-review-20261026.mjs',prior];
const reviewed={kind:'d_bootstrap_consumer_mysql_local_review.v1',status:'passed_exact_local_preparation_only',
  source_sha256:manifest.source_sha256,source_files:manifest.files.length,capture_attempts:manifest.capture_attempts,
  native_terminal_exit:0,seed_roots:['TestDBootstrapConsumerMySQLSeed'],linux_builds:['evidence_probe','embedded_migration_runner'],
  binary_sha256:receipt.binary_sha256,migration_binary_sha256:receipt.migration_binary_sha256,inputs_sha256:receipt.inputs_sha256,
  source_postcheck:true,own_inputs_current_match:true,own_input_pins:ownPins,default_vet:true,modules_readonly:true,dependencies_installed:false,
  owner:receipt.owner,owner_recorded_removed:true,owner_independently_absent:true,test_build_artifacts_removed:true,
  receiver_tests:{pass:25,fail:0,skip:0,actual_mysql:false},script_syntax:{powershell_ast:true,bash_n:true},
  actual_mysql_run:false,actual_mysql_cases_passed:0,planned_mysql_cases:18,synthetic_authority:true,
  physical_capacity_verified:false,provider_permission_verified:false,production_approved:false,
  ordinary_joint_regression_claimed:false,subsequent_transaction_identity_fix_covered:false,
  prior_failed_run_preserved:prior,prior_failed_run_reclassified:false,
  artifacts:[...new Set(artifacts.map(relative))].map(name=>({path:name,sha256:sha(raw(name))}))};
if(mode==='--check')assert.deepEqual(json(output),reviewed);else fs.writeFileSync(local(output),JSON.stringify(reviewed,null,2)+'\n',{flag:'wx'});
console.log('BOOTSTRAP_CONSUMER_MYSQL_LOCAL_REVIEWED native=0 seed=1 linux_builds=2 receiver=25 cleanup=yes actual_mysql=not_run source='+manifest.source_sha256);
