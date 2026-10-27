import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest, validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const probe = 'TestDBootstrapOriginalMaterialsMySQL';
export const cases=Object.freeze(['commit_replay','commit_lost','replay_missing_nonce','replay_missing_ca','replay_missing_nonrbac','replay_grant_removed','replay_rbac_changed','missing_nonce_new','missing_ca_new','late_grant','late_grant_replace','late_rbac_bindings','late_nonce_material','late_retained_material','late_nonce_descriptor','late_evidence_ca_descriptor','late_evidence_ca_pem','late_parts','retained_nonce_commit','retained_unknown_rejected','late_retained_ledger','resource_wait']);
const catalog = '0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe';
const local = name => {
  const target = path.resolve(root, name);
  assert.ok(target.startsWith(root + path.sep), 'path outside workspace');
  return target;
};
const text = name => fs.readFileSync(local(name), 'utf8').replace(/^\uFEFF/, '');
const json = name => JSON.parse(text(name));

export function validateBootstrapTranscript(input, receipt) {
  const lines = input.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').split('\n');
  assert.ok(!lines.some(s => /CLEANUP_PENDING|CLEANUP_SKIPPED|--- FAIL:|--- SKIP:|^FAIL(?:\s|$)|panic:|fatal error:/.test(s)), 'failed, skipped or unclean run');
  const one = pattern => {
    const matches = lines.flatMap((s, i) => { const m = pattern.exec(s); return m ? [{ m, i }] : []; });
    assert.equal(matches.length, 1, 'missing/duplicate ' + pattern); return matches[0];
  };
  const run = one(/^RUN namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=(\S+@sha256:[a-f0-9]{64}) mysql_image=(\S+@sha256:[a-f0-9]{64}) mysql_version=(8\.4\.\d+)$/);
  const migration = one(/^\{"config_activated":.*\}$/);
  assert.deepEqual(JSON.parse(migration.m[0]), { config_activated:false, historical_equivalence_verified:false,
    history_review_sha256:'', human_mfa_verified:false, migration_catalog_sha256:catalog, migration_count:96, result:'PASS' });
  const migrateBinary = one(/^PASS pinned-migration-runner binary_sha256=([a-f0-9]{64}) catalog_sha256=([a-f0-9]{64})$/);
  assert.equal(migrateBinary.m[1], receipt.migration_binary_sha256); assert.equal(migrateBinary.m[2], catalog);
  const replay = one(/^PASS fresh-migration-replay=001\.\.096 applied=96 exact_filenames=yes d_columns=blob\/blob\/blob\/char$/);
  const start = one(new RegExp(`^=== RUN   ${probe}$`));
  const starts = lines.filter(s => s.startsWith(`=== RUN   ${probe}/`)).map(s => s.slice(`=== RUN   ${probe}/`.length));
  const passed = lines.flatMap(s => { const m = new RegExp(`^\\s+--- PASS: ${probe}/([^ ]+) \\([0-9.]+s\\)$`).exec(s); return m ? [m[1]] : []; });
  assert.deepEqual(starts.toSorted(), cases.toSorted()); assert.deepEqual(passed.toSorted(), cases.toSorted());
  assert.ok(!lines.some(s => /^=== RUN   Test/.test(s) && s !== `=== RUN   ${probe}` && !s.startsWith(`=== RUN   ${probe}/`)), 'mixed roots');
  const fixtures=lines.filter(s=>/: ORIGINAL_FIXTURE migrations=96 candidate_tables=8 full_canonical_A_tables=9 foreign_key_checks=1 authority=synthetic_original_mapping material_APIs=real$/.test(s));
  const cleanDB = lines.filter(s => /: CLEANED evidence run-owned database$/.test(s));
  assert.equal(fixtures.length, cases.length, 'one full canonical fixture per case');
  assert.equal(cleanDB.length, cases.length, 'one owned database cleanup per case');
  let expectedPrepares=0,expectedHistories=0;
  for (const name of cases) {
    const begin = lines.indexOf(`=== RUN   ${probe}/${name}`);
    const end = lines.findIndex(s => s.trimStart().startsWith(`--- PASS: ${probe}/${name} (`));
    assert.ok(begin > start.i && end > begin, 'case event order');
    const scoped=lines.slice(begin,end);
    const count=pattern=>scoped.filter(s=>pattern.test(s)).length;
    assert.equal(count(/: ORIGINAL_FIXTURE migrations=96 candidate_tables=8 full_canonical_A_tables=9 foreign_key_checks=1 authority=synthetic_original_mapping material_APIs=real$/),1,'scoped canonical fixture '+name);
    assert.equal(count(/: CLEANED evidence run-owned database$/),1,'scoped database cleanup '+name);
    const charged=!['missing_nonce_new','missing_ca_new','retained_unknown_rejected'].includes(name);
    assert.equal(count(/: BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic$/),charged?1:0,'real capacity count '+name);
    const tls=name==='missing_ca_new'?1:2;
    assert.equal(count(new RegExp('ORIGINAL_PREPARE branch=physical tls_total='+tls+' material_apis=real$')),1,'actual original TLS preparation '+name);
    const retries=['commit_replay','commit_lost','retained_nonce_commit'].includes(name)||name.startsWith('replay_');
    const earlyDenied=['replay_grant_removed','replay_rbac_changed'].includes(name);
    const delta=earlyDenied?0:name==='replay_missing_ca'?1:2;
    expectedPrepares+=retries&&!earlyDenied?2:1;
    if(retries)expectedHistories++;
    assert.equal(count(/ORIGINAL_PREPARE branch=physical tls_total=\d+ material_apis=real$/),retries&&!earlyDenied?2:1,'all actual original preparations '+name);
    if(retries&&!earlyDenied)assert.equal(count(new RegExp('ORIGINAL_PREPARE branch=physical tls_total='+(2+delta)+' material_apis=real$')),1,'original retry preparation '+name);
    if(name.startsWith('late_')){
      const kind=name==='late_grant_replace'?'grant':name.slice(5);
      assert.equal(count(new RegExp('ORIGINAL_MATERIAL_CHANGED kind='+kind+' stage=work_end$')),1,'late actual mutation '+name);
    }
    if(retries){
      const result=earlyDenied?'denied_current_authority':'locked_exact_read';
      assert.equal(count(new RegExp('ORIGINAL_HISTORY result='+result+' capacity_charge=unchanged preparation_tls_delta='+delta+' work_end_tls=none$')),1,'historical result and original preparation boundary '+name);
    }
    if(['retained_nonce_commit','retained_unknown_rejected','late_retained_ledger'].includes(name))assert.equal(count(/ORIGINAL_RETAINED_FIXTURE rows=1 key_relation=global_exact physical_authority=synthetic$/),1);
    if(name==='resource_wait')assert.equal(count(/ORIGINAL_RESOURCE_WAIT original_bound_preserved=yes duration_ms=3200$/),1,'original raw resource bound wait');

  }
  assert.equal(lines.filter(s=>/ORIGINAL_PREPARE /.test(s)).length,expectedPrepares,'unscoped original preparation');
  assert.equal(lines.filter(s=>/ORIGINAL_HISTORY /.test(s)).length,expectedHistories,'unscoped history');
  assert.equal(lines.filter(s=>/ORIGINAL_MATERIAL_CHANGED /.test(s)).length,cases.filter(s=>s.startsWith('late_')).length,'unscoped mutation');
  assert.equal(lines.filter(s=>/BOOTSTRAP_CAPACITY_RESERVED /.test(s)).length,cases.length-3,'unscoped capacity reservation');
  const done = one(new RegExp(`^--- PASS: ${probe} \\([0-9.]+s\\)$`));
  const pass = one(/^PASS$/);
  const phase = one(/^PASS d-bootstrap-original-materials-mysql cases=22 binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) original_files=yes nonce_ca=real_apis tls=loopback synthetic_mapping=yes physical_capacity=no production=no$/);
  assert.equal(phase.m[1], receipt.binary_sha256); assert.equal(phase.m[2], receipt.inputs_sha256);
  const namespaceClean = one(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/);
  assert.equal(namespaceClean.m[1],run.m[1]); assert.equal(namespaceClean.m[2],run.m[2]);
  const scratch = one(/^CLEANED bootstrapConsumer-remote-scratch=yes$/);
  const owner = one(/^CLEANED bootstrapConsumer-local-owner=(.+) removed=True$/);
  assert.equal(owner.m[1],receipt.owner);
  const exit = one(/^bootstrap_original_materials_exit=0$/);
  const sequence = [run,migration,migrateBinary,replay,start,done,pass,phase,namespaceClean,scratch,owner,exit];
  assert.ok(sequence.every((v,i) => !i || v.i > sequence[i-1].i), 'remote event order');
  return {namespace:run.m[1], namespace_uid:run.m[2], app_image:run.m[3], mysql_image:run.m[4], mysql_version:run.m[5], actual_mysql_cases:cases.length};
}

export function reviewBootstrap(receiptFile, transcriptFile) {
  const receipt = json(receiptFile), manifest = json(receipt.source);
  validateManifest(manifest);
  assert.equal(receipt.kind,'d_bootstrap_original_materials_mysql_preparation.v1'); assert.equal(receipt.suite,'bootstrap-original-materials');
  assert.equal(receipt.error,null);
  for (const name of ['owner_removed','source_postcheck','remote_requested','remote_scratch_removed','synthetic_proofs']) assert.equal(receipt[name],true,name);
  for (const name of ['dependencies_installed','production_approved','actual_mysql_results_accepted']) assert.equal(receipt[name],false,name);
  for (const name of ['binary_sha256','migration_binary_sha256','inputs_sha256']) assert.match(receipt[name],hex,name);
  assert.match(receipt.owner, /[\\/]\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(local(receipt.owner)),false,'local build products still exist');
  const commands = [
    ['go','test','-tags','systembackup_mysql','-run','^TestDBootstrap(ConsumerMySQLSeed|ConsumerRangesMySQLSeed|OriginalMaterialsMySQLSeed)$','-count=1','-timeout=180s','-json','./internal/systembackupevidence'],
    ['go','test','-c','-tags','systembackup_mysql','-o',path.join(receipt.owner,'bundle/d-bootstrap-original-materials.test'),'./internal/systembackupevidence'],
    ['go','build','-o',path.join(receipt.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate'],
  ];
  assert.equal(receipt.steps.length,3);
  for (const [i,step] of receipt.steps.entries()) {
    assert.equal(step.exit_code,0); assert.equal(step.platform,i===0?'windows':'linux'); assert.deepEqual(step.command,commands[i]);
    assert.equal(sha(fs.readFileSync(local(step.log))),step.log_sha256);
  }
  assert.deepEqual(validateGoEvents(text(receipt.steps[0].log),'clawreef/internal/systembackupevidence'),['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed']);
  const pin = manifest.files.find(p => p.path==='backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json');
  assert.equal(pin?.sha256,receipt.inputs_sha256);
  // Current bytes are checked only for the input and the probe/runner chain.
  // The whole frozen source digest identifies the actual run; unrelated later
  // A/D changes cannot silently be claimed as having passed this binary.
  const selected = name => name.startsWith('backend/internal/systembackupnoncebootstrap/') || name.startsWith('backend/internal/systembackupcatrust/') || name.startsWith('backend/internal/systembackupbootstrapsecurity/') || name.startsWith('backend/internal/systembackupproducer/') || name.startsWith('backend/internal/systembackupsecurity/') ||
    name.startsWith('backend/internal/systembackupevidence/') || name.startsWith('backend/internal/db/migrations/') ||
    name.startsWith('contracts/') || /^scripts\/system-backup-(?:d-bootstrap-consumer|d-bootstrap-original-materials|fresh-migration|smoke-contract|d-invariants|d-migration|d-index-source|a-config-proof-source)/.test(name) || ['backend/go.mod','backend/go.sum','backend/internal/systembackupcontroller/bootstrap.go'].includes(name);
  const critical = manifest.files.filter(p => selected(p.path));
  assert.ok(critical.length>100);
  const current=[];
  const walk=dir=>{
    for(const entry of fs.readdirSync(local(dir),{withFileTypes:true})) {
      if(/^(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)$/.test(entry.name))continue;
      const name=dir+'/'+entry.name;
      assert.equal(entry.isSymbolicLink(),false,'redirected current input');
      if(entry.isDirectory())walk(name);
      else if(/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)&&selected(name))current.push(name);
    }
  };
  for(const dir of ['backend','contracts','scripts'])walk(dir);
  assert.deepEqual(current.toSorted(),critical.map(p=>p.path).toSorted(),'current critical file set differs');
  for (const p of critical) { const bytes=fs.readFileSync(local(p.path));assert.equal(bytes.length,p.size,p.path);assert.equal(sha(bytes),p.sha256,p.path); }
  const remote = validateBootstrapTranscript(text(transcriptFile),receipt);
  return { kind:'d_bootstrap_original_materials_mysql_actual_review.v1', result:'PASS', ...remote,
    source_sha256:manifest.source_sha256, source_files:manifest.files.length, current_critical_inputs_match:true,
    terminal_exit:0, source_postcheck:true, test_build_products_removed:true, production_approved:false,
    synthetic_authority:true, physical_capacity_verified:false, provider_permission_verified:false, human_mfa_verified:false,
    new_remote_run_executed_by_receiver:false, original_wrapper_rewritten:false,
    artifacts:[receiptFile,receipt.source,transcriptFile,...receipt.steps.map(s=>s.log)].map(name=>({path:path.relative(root,local(name)).replaceAll('\\','/'),sha256:sha(fs.readFileSync(local(name)))})) };
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [receipt,transcript,output,mode,...extra]=process.argv.slice(2);
  assert.ok(receipt&&transcript&&output&&!extra.length&&(mode===undefined||mode==='--check'),'receipt transcript output [--check] required');
  assert.equal(path.dirname(local(output)),path.join(root,'docs/evidence'));
  const reviewed=reviewBootstrap(receipt,transcript);
  if(mode==='--check')assert.deepEqual(json(output),reviewed);else fs.writeFileSync(local(output),JSON.stringify(reviewed,null,2)+'\n',{flag:'wx'});
  console.log('BOOTSTRAP_ORIGINAL_MATERIALS_MYSQL_ACTUAL_ACCEPTED cases=22 source='+reviewed.source_sha256+' cleanup=yes production=no');
}
