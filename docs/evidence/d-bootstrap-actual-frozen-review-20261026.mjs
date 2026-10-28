// Audit exactly the two operator runs supplied by the user. This records later
// source drift explicitly; the strict current-source receivers remain unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateManifest, validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';
import { validateBootstrapTranscript as consumer } from './d-bootstrap-consumer-mysql-review-20261026.mjs';
import { validateBootstrapTranscript as ranges } from './d-bootstrap-config-ranges-mysql-review-20261026.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const local=name=>{const p=path.resolve(root,name);assert.ok(p.startsWith(root+path.sep));return p;};
const raw=name=>fs.readFileSync(local(name));
const json=name=>JSON.parse(raw(name).toString('utf8').replace(/^\uFEFF/,''));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const rel=name=>path.relative(root,local(name)).replaceAll('\\','/');
const artifacts=new Set([
  'docs/evidence/d-bootstrap-actual-frozen-review-20261026.mjs',
  'docs/evidence/d-resources-mysql-actual-review-20261023.mjs',
  'docs/evidence/d-bootstrap-consumer-mysql-review-20261026.mjs',
  'docs/evidence/d-bootstrap-config-ranges-mysql-review-20261026.mjs',
  'docs/evidence/d-bootstrap-consumer-mysql-review-20261026.test.mjs',
  'docs/evidence/d-bootstrap-config-ranges-mysql-review-20261026.test.mjs',
  'docs/evidence/d-bootstrap-actual-receivers-grouped-tests-20261026.txt',
]);
const jobs=[
  {suite:'bootstrap-consumer',kind:'d_bootstrap_consumer_mysql_preparation.v1',validate:consumer,
    receipt:'docs/evidence/d-bootstrap-consumer-mysql-20261026-154623-72b5ae6d.json',
    log:'docs/evidence/d-bootstrap-consumer-operator-20261026-154612.txt',
    attachment:'C:/Users/zhanghui08/.codex/attachments/2db1e5c7-6774-45f1-a2f5-4f1393820d95/已粘贴的文本.txt',
    seeds:['TestDBootstrapConsumerMySQLSeed'],binary:'d-bootstrap-consumer.test'},
  {suite:'bootstrap-config-ranges',kind:'d_bootstrap_config_ranges_mysql_preparation.v1',validate:ranges,
    receipt:'docs/evidence/d-bootstrap-config-ranges-mysql-20261026-154625-f0f6587b.json',
    log:'docs/evidence/d-bootstrap-config-ranges-operator-20261026-154616.txt',
    attachment:'C:/Users/zhanghui08/.codex/attachments/9ece7981-f029-4501-8b40-f70b3ce1e7b4/已粘贴的文本.txt',
    seeds:['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed'],binary:'d-bootstrap-config-ranges.test'},
];
const selected=name=>name.startsWith('backend/internal/systembackupproducer/')||name.startsWith('backend/internal/systembackupsecurity/')||
  name.startsWith('backend/internal/systembackupevidence/')||name.startsWith('backend/internal/db/migrations/')||name.startsWith('contracts/')||
  /^scripts\/system-backup-(?:d-bootstrap-consumer|d-bootstrap-ranges|fresh-migration|smoke-contract|d-invariants|d-migration|d-index-source|a-config-proof-source)/.test(name)||
  ['backend/go.mod','backend/go.sum','backend/internal/systembackupcontroller/bootstrap.go'].includes(name);
const current=[];
function walk(dir){
  for(const entry of fs.readdirSync(local(dir),{withFileTypes:true})){
    if(/^(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)$/.test(entry.name))continue;
    const name=dir+'/'+entry.name;
    assert.equal(entry.isSymbolicLink(),false,'redirected current input');
    if(entry.isDirectory())walk(name);
    else if(/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)&&selected(name))current.push(name);
  }
}
for(const dir of ['backend','contracts','scripts'])walk(dir);
const runs=jobs.map(job=>{
  const receipt=json(job.receipt),manifest=json(receipt.source);
  validateManifest(manifest);
  assert.equal(manifest.stable_copy_verified,true);
  assert.equal(receipt.kind,job.kind);assert.equal(receipt.suite,job.suite);assert.equal(receipt.error,null);
  for(const key of ['owner_removed','source_postcheck','remote_requested','remote_scratch_removed','synthetic_proofs'])assert.equal(receipt[key],true,key);
  for(const key of ['dependencies_installed','actual_mysql_results_accepted','production_approved'])assert.equal(receipt[key],false,key);
  assert.match(receipt.owner,/[\\/]\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(local(receipt.owner)),false);
  for(const key of ['binary_sha256','migration_binary_sha256','inputs_sha256'])assert.match(receipt[key],/^[a-f0-9]{64}$/);
  const selector=job.suite==='bootstrap-consumer'?'^TestDBootstrapConsumerMySQLSeed$':'^TestDBootstrapConsumer(MySQLSeed|RangesMySQLSeed)$';
  const commands=[
    ['go','test','-tags','systembackup_mysql','-run',selector,'-count=1','-timeout=180s','-json','./internal/systembackupevidence'],
    ['go','test','-c','-tags','systembackup_mysql','-o',path.join(receipt.owner,'bundle',job.binary),'./internal/systembackupevidence'],
    ['go','build','-o',path.join(receipt.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate'],
  ];
  assert.equal(receipt.steps.length,3);
  for(const [i,step] of receipt.steps.entries()){
    assert.equal(step.exit_code,0);assert.equal(step.platform,i===0?'windows':'linux');
    assert.deepEqual(step.command,commands[i]);assert.equal(sha(raw(step.log)),step.log_sha256);
    artifacts.add(rel(step.log));
  }
  assert.deepEqual(validateGoEvents(raw(receipt.steps[0].log).toString('utf8'),'clawreef/internal/systembackupevidence'),job.seeds);
  assert.equal(manifest.files.find(p=>p.path==='backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json')?.sha256,receipt.inputs_sha256);
  const critical=manifest.files.filter(p=>selected(p.path));assert.ok(critical.length>100);
  // Refuse any file additions/removals. Byte changes are recorded, never excused
  // as current-source success, regardless of whether the file is a test.
  assert.deepEqual(current.toSorted(),critical.map(p=>p.path).toSorted());
  const drift=critical.flatMap(pin=>{
    const bytes=raw(pin.path),digest=sha(bytes);
    return bytes.length===pin.size&&digest===pin.sha256?[]:[{path:pin.path,frozen_size:pin.size,frozen_sha256:pin.sha256,current_size:bytes.length,current_sha256:digest}];
  });
  const remote=job.validate(raw(job.log),receipt);
  const attachmentBytes=fs.readFileSync(job.attachment);
  assert.deepEqual(job.validate(attachmentBytes,receipt),remote,'pasted run and original operator log disagree');
  for(const name of [job.receipt,receipt.source,job.log])artifacts.add(rel(name));
  return {suite:job.suite,result:'PASS_EXACT_FROZEN_RUN_ONLY',...remote,
    source_sha256:manifest.source_sha256,source_files:manifest.files.length,
    current_critical_inputs_match:drift.length===0,current_source_drift:drift,
    native_step_exits:[0,0,0],operator_exit:0,source_postcheck:true,
    owner_independently_absent:true,test_build_products_removed:true,
    binary_sha256:receipt.binary_sha256,migration_binary_sha256:receipt.migration_binary_sha256,
    inputs_sha256:receipt.inputs_sha256,operator_log:job.log,
    pasted_attachment:{path:job.attachment,sha256:sha(attachmentBytes)},
    strict_current_source_acceptance:false,production_approved:false};
});
assert.equal(runs[0].source_sha256,runs[1].source_sha256);
const testLog=raw('docs/evidence/d-bootstrap-actual-receivers-grouped-tests-20261026.txt').toString('utf8');
for(const marker of ['tests 78','pass 78','fail 0','skipped 0'])assert.ok(testLog.includes(marker));
const reviewed={kind:'d_bootstrap_actual_frozen_run_audit.v1',result:'PASS_EXACT_FROZEN_RUN_ONLY',
  scope:'two user-supplied operator runs; later workspace edits are not covered',
  source_sha256:runs[0].source_sha256,actual_mysql_cases_passed:29,
  strict_current_source_acceptance:false,original_wrappers_rewritten:false,
  new_remote_execution:false,dependencies_installed:false,production_approved:false,
  synthetic_authority:true,physical_capacity_verified:false,provider_permission_verified:false,human_mfa_verified:false,
  receiver_tests:{pass:78,fail:0,skip:0},runs,
  artifacts:[...artifacts].map(name=>({path:name,sha256:sha(raw(name))}))};
const out='docs/evidence/d-bootstrap-actual-frozen-reviewed-20261026.json';
if(process.argv.includes('--check'))assert.deepEqual(json(out),reviewed);
else fs.writeFileSync(local(out),JSON.stringify(reviewed,null,2)+'\n',{flag:'wx'});
console.log('BOOTSTRAP_FROZEN_RUNS_REVIEWED consumer=26 ranges=3 native_exit=0 cleanup=yes current_source_acceptance=no source='+reviewed.source_sha256);
