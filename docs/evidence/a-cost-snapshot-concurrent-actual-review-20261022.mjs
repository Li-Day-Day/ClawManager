// A's independent review of the original operator log; no Go, SQL or SSH runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(import.meta.dirname,'../..');
const logPath='docs/evidence/d-cost-snapshot-concurrent-remote-20261022-101417-6826f52e.txt';
const preparationPath='docs/evidence/d-cost-snapshot-concurrent-preparation-20261022.json';
const scopePath='docs/evidence/d-cost-snapshot-concurrent-scope-20261022.json';
const dReceiptPath='docs/evidence/d-cost-snapshot-concurrent-actual-accepted-20261022.json';
const output='docs/evidence/a-cost-snapshot-concurrent-actual-accepted-20261022.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=p=>fs.readFileSync(path.join(root,p));
export function decodeCostLog(bytes) {
  const utf16=bytes[0]===255&&bytes[1]===254;
  return new TextDecoder(utf16?'utf-16le':'utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
}
const json=p=>JSON.parse(decodeCostLog(raw(p)));
const pin=p=>{const bytes=raw(p);return {path:p,bytes:bytes.length,sha256:sha(bytes)};};
const binary='64679b73985747255ed3c73c6717e0028acf1511073aa8ffe0ca0fbcd5f0e0ed';
const migrationBinary='d70dcc018ab3b1f644a08e63b663ec3d39dffaa8fc662fb78ee6d824a12a1251';
const catalog='0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe';
const cases=['cost_snapshot_concurrent_commit','cost_aggregate_money','cost_aggregate_tokens','cost_aggregate_currency_case','cost_aggregate_actual_NULL'];
const rootTest='TestABusinessRestoreRowsMySQL';

export function reviewActualCostLog(text,migrationNames) {
  assert.ok(text.length>0&&Buffer.byteLength(text)<=1048576);
  assert.doesNotMatch(text,/^\s*--- (?:FAIL|SKIP):|^FAIL\s*$|^panic:|^CLEANUP_PENDING/m);
  const lines=text.split(/\r?\n/);
  const once=(marker,from=0)=>{const indexes=lines.flatMap((line,i)=>line===marker?[i]:[]);assert.equal(indexes.length,1,marker);assert.ok(indexes[0]>=from,marker);return indexes[0];};
  const local=lines.filter(line=>line.startsWith('LOCAL_PASS a-business-restore-unit-tests='));
  assert.deepEqual(local,[`LOCAL_PASS a-business-restore-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${binary} ddl_sha256=${sha('')}`]);
  once('LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256='+migrationBinary);
  once('LOCAL_PASS a-business-standalone-seed=yes checkout-fixtures=absent real_mysql=not_run');
  once('LOCAL_PASS a-business-restore-tagged-compile=yes real_mysql=not_run');
  once('bundle.tar: OK');
  const runs=lines.filter(line=>line.startsWith('RUN namespace='));assert.equal(runs.length,1);
  const run=/^RUN namespace=(sbk-mig-\d{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36}) app_image=\S+@sha256:[a-f0-9]{64} mysql_image=\S+@sha256:[a-f0-9]{64} mysql_version=8\.4\.8$/.exec(runs[0]);assert.ok(run);
  const [,namespace,uid]=run;
  once(`PASS pinned-migration-runner binary_sha256=${migrationBinary} catalog_sha256=${catalog}`);
  once('PASS fresh-migration-replay=001..081 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char');
  const migrationReports=lines.filter(line=>line.startsWith('{"config_activated":'));assert.equal(migrationReports.length,1);
  const migration=JSON.parse(migrationReports[0]);assert.equal(migration.result,'PASS');assert.equal(migration.migration_count,96);assert.equal(migration.migration_catalog_sha256,catalog);
  for(const key of ['config_activated','historical_equivalence_verified','human_mfa_verified'])assert.equal(migration[key],false);
  const start=once('=== RUN   '+rootTest),end=once('--- PASS: '+rootTest+' (8.56s)',start);
  const body=lines.slice(start,end).join('\n');
  assert.deepEqual([...body.matchAll(/^=== RUN\s+TestABusinessRestoreRowsMySQL\/(\S+)$/gm)].map(m=>m[1]),cases);
  const childPasses=lines.filter(line=>/^\s+--- PASS: TestABusinessRestoreRowsMySQL\//.test(line));
  assert.equal(childPasses.length,5);
  assert.deepEqual(childPasses.map(line=>/^\s+--- PASS: TestABusinessRestoreRowsMySQL\/(\S+) \([0-9.]+s\)$/.exec(line)?.[1]),cases);
  const concurrent='    --- PASS: '+rootTest+'/cost_snapshot_concurrent_commit (0.10s)';
  once(concurrent,end);
  assert.equal([...body.matchAll(/PASS cost-snapshot-concurrent-commit first_count_closed=yes writer_commit=observed original_rr=unchanged fresh_rr=changed writer=fixture reader=select-only production_dump_proof=no$/gm)].length,1);
  for(const marker of [
    'PASS A business fifteen-table complete-column roundtrip and rollback',
    'PASS A business formal FK and collation uniqueness rejection',
    'PASS A business SELECT-only permissions, NULL mismatch and final-proof rollback',
    'PASS A business SQL NULL preservation and exact decimal roundtrip',
    'PASS A business bounded-volume users=1001 quotas=1001 other_tables=1; full large-smoke.v1 not claimed',
    'CLEANED A business SELECT-only account','CLEANED A business restore run-owned database',
  ])assert.equal(body.split(marker).length,2,marker);
  const applied=[...body.matchAll(/Applied database migration (\S+\.sql)$/gm)].map(m=>m[1]);
  assert.equal(applied.length,96);assert.equal(new Set(applied).size,96);assert.deepEqual(applied,migrationNames);
  const seeds=lines.filter(line=>/^--- PASS: TestABusinessRestoreMySQLSeed \(/.test(line));
  assert.deepEqual(seeds,['--- PASS: TestABusinessRestoreMySQLSeed (0.07s)','--- PASS: TestABusinessRestoreMySQLSeed (0.13s)','--- PASS: TestABusinessRestoreMySQLSeed (0.04s)']);
  const terminal=once('PASS a-business-restore-mysql binary_sha256='+binary,end);
  once(`CLEANED namespace=${namespace} uid=${uid}`,terminal);
  assert.equal(lines.filter(line=>line.startsWith('CLEANED namespace=')).length,1);
  once('CLEANED remote-registration-scratch=yes',terminal);once('CLEANED local-registration-build-cache=True',terminal);
  once('cost_snapshot_restore_exit=0',terminal);assert.equal(lines.filter(line=>line.startsWith('cost_snapshot_restore_exit=')).length,1);
  assert.equal(lines.filter(Boolean).at(-1),'cost_snapshot_restore_exit=0');
  assert.doesNotMatch(text,/source_sha256=|SourceManifestPath/);
  return {namespace,uid,mysql:'8.4.8',parent:rootTest,parent_seconds:8.56,cases,passed:5,failed:0,skipped:0,
    concurrency:{first_count_closed:true,writer_commit_observed:true,original_rr_unchanged:true,fresh_rr_changed:true},
    probe_sha256:binary,migration_binary_sha256:migrationBinary,migration_catalog_sha256:catalog,migrations:96,
    cleanup_reported:{account:true,database:true,namespace:true,remote_scratch:true,local_cache:true},
    socket_close_messages:lines.filter(line=>line.startsWith('close - IO is still pending on closed socket.')).length,exit:0};
}

function buildReview() {
  for(const [p,expected] of [[logPath,'45bffb02fa03d7a654700778e206020ecf47bc486dc45b03b2bd107040ae7daa'],
    [preparationPath,'7a9b0c8d520cf863785988d37d88564edcdbca1960f81a3890c80152d0345842'],
    [scopePath,'e108a6983737a320e61503e2c6b2a9125ceac0938ce0d1e1db546136a0dfb0e0'],
    [dReceiptPath,'0adc063cabd9b100fd81431455a54d4b1b7ab6e5ac54117cc738d033d37307e1']])assert.equal(sha(raw(p)),expected,p);
  const preparation=json(preparationPath),scope=json(scopePath),d=json(dReceiptPath);
  const migrationNames=scope.asset_directories.find(group=>group.path==='backend/internal/db/migrations').files;
  const actual=reviewActualCostLog(decodeCostLog(raw(logPath)),migrationNames);
  assert.deepEqual(actual.cases,d.actual.case_names);assert.deepEqual(migrationNames,d.actual.migration_filenames);
  for(const [a,b] of [[actual.namespace,d.cleanup.namespace],[actual.uid,d.cleanup.uid],[actual.probe_sha256,d.actual.binary_sha256],
    [actual.migration_binary_sha256,d.actual.migration_binary_sha256],[actual.socket_close_messages,d.cleanup.socket_close_message_count]])assert.equal(a,b);
  assert.equal(preparation.changed_files.length,3);
  const current=preparation.changed_files.map(file=>{
    const archived=Buffer.from(file.tested_bytes_base64,'base64');assert.equal(sha(archived),file.after_sha256,file.path);
    const observed=pin(file.path);
    return {...observed,prepared_sha256:file.after_sha256,matches_prepared:observed.sha256===file.after_sha256};
  });
  return {kind:'a_cost_snapshot_concurrent_actual_independent_review.v1',status:'accepted_original_mysql_log_five_cost_cases_synthetic_only',
    evidence:[logPath,preparationPath,scopePath,dReceiptPath].map(pin),actual,current_test_source_observation:current,
    provenance:{same_run_full_source_manifest_supplied:false,same_run_source_before_after_hashes_logged:false,
      whole_source_to_binary_attestation:false,original_preparation_binary_substituted:false,current_source_used_to_prove_historical_source:false,
      exact_local_scratch_identity_logged:false,local_scratch_independently_verified:false,remote_cleanup_independently_verified:false},
    boundaries:{real_mysql_log:true,fixture:'synthetic_formally_migrated_fifteen_table_business_restore',
      production_dump_proof:false,real_B_capture_proof:false,production_restore_writer:false,production_role_approval:false,
      full_large_smoke:false,full_gc:false,human_mfa:false,production_approved:false,current_whole_tree_tested:false,
      reviewer_remote_run:false,reviewer_go_test_or_build_run:false,reviewer_dependencies_installed:false}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--check'));
  const report=buildReview();
  if(process.argv[2]==='--check')assert.deepEqual(json(output),report);
  else fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('PASS A original cost MySQL log: five cases, RR observations, parent, 96 migrations and exit zero; historical/source/cleanup limits retained');
}
