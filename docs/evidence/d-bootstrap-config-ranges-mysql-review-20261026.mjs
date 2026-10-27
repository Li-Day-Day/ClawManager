import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest, validateGoEvents } from './d-resources-mysql-actual-review-20261023.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const probe = 'TestDBootstrapConsumerRangesMySQL';
export const cases = Object.freeze(['existing_nonce_metadata','empty_new_origin','existing_origin_new_version']);
const catalog = '0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe';
const local = name => {
  const target = path.resolve(root, name);
  assert.ok(target.startsWith(root + path.sep), 'path outside workspace');
  return target;
};
const text = name => fs.readFileSync(local(name), 'utf8').replace(/^\uFEFF/, '');
const json = name => JSON.parse(text(name));

export function validateBootstrapTranscript(input, receipt) {
  // Windows PowerShell Tee-Object emits BOM-marked UTF-16LE; pwsh uses UTF-8.
  // Decode raw bytes strictly and retain the original bytes for artifact hashes.
  if (Buffer.isBuffer(input)) {
    const encoding = input.length >= 2 && input.readUInt16LE(0) === 0xfeff ? 'utf-16le' : 'utf-8';
    input = new TextDecoder(encoding, { fatal:true }).decode(input);
  }
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
  // The pinned catalog has 96 files; its last filename prefix is 081.
  const replay = one(/^PASS fresh-migration-replay=001\.\.081 applied=96 exact_filenames=yes d_columns=blob\/blob\/blob\/char$/);
  const start = one(new RegExp(`^=== RUN   ${probe}$`));
  const starts = lines.filter(s => s.startsWith(`=== RUN   ${probe}/`)).map(s => s.slice(`=== RUN   ${probe}/`.length));
  const passed = lines.flatMap(s => { const m = new RegExp(`^\\s+--- PASS: ${probe}/([^ ]+) \\([0-9.]+s\\)$`).exec(s); return m ? [m[1]] : []; });
  assert.deepEqual(starts.toSorted(), cases.toSorted()); assert.deepEqual(passed.toSorted(), cases.toSorted());
  assert.ok(!lines.some(s => /^=== RUN   Test/.test(s) && s !== `=== RUN   ${probe}` && !s.startsWith(`=== RUN   ${probe}/`)), 'mixed roots');
  const fixtures = lines.filter(s => /: BOOTSTRAP_FIXTURE migrations=96 candidate_tables=8 full_canonical_A_tables=8 clone=SHOW_CREATE_TABLE foreign_key_checks=required capacity_helper=real_sql synthetic_authority=yes$/.test(s));
  const cleanDB = lines.filter(s => /: CLEANED evidence run-owned database$/.test(s));
  assert.equal(fixtures.length, cases.length, 'one full canonical fixture per case');
  assert.equal(cleanDB.length, cases.length, 'one owned database cleanup per case');
  for (const name of cases) {
    const begin = lines.indexOf(`=== RUN   ${probe}/${name}`);
    const passedAt = lines.findIndex(s => s.trimStart().startsWith(`--- PASS: ${probe}/${name} (`));
    // Go may print all subtest PASS lines together after the parent completes.
    // Proofs belong to the running case, ending before the next case starts.
    const nextCase = lines.findIndex((s,i) => i > begin && s.startsWith(`=== RUN   ${probe}/`));
    const end = nextCase < 0 ? passedAt : Math.min(passedAt,nextCase);
    assert.ok(begin > start.i && passedAt > begin && end > begin, 'case event order');
    assert.equal(lines.slice(begin,end).filter(s=>/: CLEANED evidence run-owned database$/.test(s)).length,1,'owned database cleanup for '+name);
    const anchors=lines.slice(begin,end).flatMap((s,i)=>/^\s+\S+\.go:\d+: CONFIG_RANGE_ANCHORS writer=original_legacy stage=before_C1_schema producer_tables_before=0 anchors=3$/.test(s)?[begin+i]:[]);
    assert.equal(anchors.length,1,'real legacy anchors before C1 '+name);
    const layout=one(new RegExp(String.raw`^\s+\S+\.go:\d+: CONFIG_RANGE_LAYOUT case=${name} anchors=3 direct_gap=000\.\.002 target_gap=002\.\.zzz source_values=before_begin$`));
    const wait = one(new RegExp(String.raw`^\s+\S+\.go:\d+: CONFIG_RANGE_WAIT case=${name} index=(PRIMARY|uk_sb_config_version) lock_type=RECORD lock_mode=([A-Z_,]+) requester=([0-9]+) blocker=([0-9]+) direct_writer_installation_lock=no$`));
    assert.ok(layout.i>anchors[0]&&wait.i>layout.i&&wait.i<end,'lock wait not bound to separated case layout and pre-C1 anchors');
    assert.notEqual(wait.m[3],wait.m[4],'writer and blocker must differ');
    if(name!=='existing_nonce_metadata'){assert.equal(wait.m[1],'uk_sb_config_version');assert.ok(wait.m[2].includes('INSERT_INTENTION'),'actual insertion intention required');}
    const release=one(new RegExp(String.raw`^\s+\S+\.go:\d+: CONFIG_RANGE_RELEASE case=${name} bootstrap_rolled_back=yes direct_writer_committed=yes rows=1$`));
    assert.ok(release.i>wait.i&&release.i<end,'write did not follow rollback release');

  }
  const done = one(new RegExp(`^--- PASS: ${probe} \\([0-9.]+s\\)$`));
  const pass = one(/^PASS$/);
  const phase = one(/^PASS d-bootstrap-config-ranges-mysql cases=3 binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) lock_wait_graph=yes direct_writer_installation_lock=no synthetic_authority=yes production=no$/);
  assert.equal(phase.m[1], receipt.binary_sha256); assert.equal(phase.m[2], receipt.inputs_sha256);
  const namespaceClean = one(/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})$/);
  assert.equal(namespaceClean.m[1],run.m[1]); assert.equal(namespaceClean.m[2],run.m[2]);
  const scratch = one(/^CLEANED bootstrapConsumer-remote-scratch=yes$/);
  const owner = one(/^CLEANED bootstrapConsumer-local-owner=(.+) removed=True$/);
  assert.equal(owner.m[1],receipt.owner);
  const exit = one(/^bootstrap_config_ranges_exit=0$/);
  const sequence = [run,migration,migrateBinary,replay,start,done,pass,phase,namespaceClean,scratch,owner,exit];
  assert.ok(sequence.every((v,i) => !i || v.i > sequence[i-1].i), 'remote event order');
  return {namespace:run.m[1], namespace_uid:run.m[2], app_image:run.m[3], mysql_image:run.m[4], mysql_version:run.m[5], actual_mysql_cases:cases.length};
}

export function reviewBootstrap(receiptFile, transcriptFile) {
  const receipt = json(receiptFile), manifest = json(receipt.source);
  validateManifest(manifest);
  assert.equal(receipt.kind,'d_bootstrap_config_ranges_mysql_preparation.v1'); assert.equal(receipt.suite,'bootstrap-config-ranges');
  assert.equal(receipt.error,null);
  for (const name of ['owner_removed','source_postcheck','remote_requested','remote_scratch_removed','synthetic_proofs']) assert.equal(receipt[name],true,name);
  for (const name of ['dependencies_installed','production_approved','actual_mysql_results_accepted']) assert.equal(receipt[name],false,name);
  for (const name of ['binary_sha256','migration_binary_sha256','inputs_sha256']) assert.match(receipt[name],hex,name);
  assert.match(receipt.owner, /[\\/]\.tmp-d-index-cache-[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(local(receipt.owner)),false,'local build products still exist');
  const commands = [
    ['go','test','-tags','systembackup_mysql','-run','^TestDBootstrapConsumer(MySQLSeed|RangesMySQLSeed)$','-count=1','-timeout=180s','-json','./internal/systembackupevidence'],
    ['go','test','-c','-tags','systembackup_mysql','-o',path.join(receipt.owner,'bundle/d-bootstrap-config-ranges.test'),'./internal/systembackupevidence'],
    ['go','build','-o',path.join(receipt.owner,'bundle/system-backup-migrate'),'./cmd/system-backup-migrate'],
  ];
  assert.equal(receipt.steps.length,3);
  for (const [i,step] of receipt.steps.entries()) {
    assert.equal(step.exit_code,0); assert.equal(step.platform,i===0?'windows':'linux'); assert.deepEqual(step.command,commands[i]);
    assert.equal(sha(fs.readFileSync(local(step.log))),step.log_sha256);
  }
  assert.deepEqual(validateGoEvents(text(receipt.steps[0].log),'clawreef/internal/systembackupevidence'),['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed']);
  const pin = manifest.files.find(p => p.path==='backend/internal/systembackupevidence/testdata/bootstrap-consumer-mysql-inputs.json');
  assert.equal(pin?.sha256,receipt.inputs_sha256);
  // Current bytes are checked only for the input and the probe/runner chain.
  // The whole frozen source digest identifies the actual run; unrelated later
  // A/D changes cannot silently be claimed as having passed this binary.
  const selected = name => name.startsWith('backend/internal/systembackupproducer/') || name.startsWith('backend/internal/systembackupsecurity/') ||
    name.startsWith('backend/internal/systembackupevidence/') || name.startsWith('backend/internal/db/migrations/') ||
    name.startsWith('contracts/') || /^scripts\/system-backup-(?:d-bootstrap-consumer|d-bootstrap-ranges|fresh-migration|smoke-contract|d-invariants|d-migration|d-index-source|a-config-proof-source)/.test(name) || ['backend/go.mod','backend/go.sum','backend/internal/systembackupcontroller/bootstrap.go'].includes(name);
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
  const remote = validateBootstrapTranscript(fs.readFileSync(local(transcriptFile)),receipt);
  return { kind:'d_bootstrap_config_ranges_mysql_actual_review.v1', result:'PASS', ...remote,
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
  console.log('BOOTSTRAP_CONFIG_RANGES_MYSQL_ACTUAL_ACCEPTED cases=3 source='+reviewed.source_sha256+' cleanup=yes production=no');
}
