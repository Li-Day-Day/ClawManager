import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(decode(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prefix='docs/evidence/d-cost-snapshot-concurrent-remote-20261022-101417-6826f52e';
const logPath=prefix+'.txt',text=decode(raw(logPath));
assert.equal(sha(raw(logPath)),'45bffb02fa03d7a654700778e206020ecf47bc486dc45b03b2bd107040ae7daa');
const preparationPath='docs/evidence/d-cost-snapshot-concurrent-preparation-20261022.json';
const scopePath='docs/evidence/d-cost-snapshot-concurrent-scope-20261022.json';
const preparation=json(preparationPath),scope=json(scopePath);
assert.equal(preparation.status,'locally_validated_published_cleaned_actual_mysql_pending');
assert.equal(preparation.changed_files.length,3);
const currentRelevant=preparation.changed_files.map(p=>({path:p.path,sha256:p.after_sha256}));
for(const p of currentRelevant){assert.equal(sha(raw(p.path)),p.sha256,'Current prepared test source changed '+p.path);}
const binary='64679b73985747255ed3c73c6717e0028acf1511073aa8ffe0ca0fbcd5f0e0ed';
const migrationBinary='d70dcc018ab3b1f644a08e63b663ec3d39dffaa8fc662fb78ee6d824a12a1251';
const catalog='0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe';
const emptyDDL='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
for(const marker of [
 'LOCAL_PASS a-business-standalone-seed=yes checkout-fixtures=absent real_mysql=not_run',
 'LOCAL_PASS a-business-restore-tagged-compile=yes real_mysql=not_run',
 'LOCAL_PASS a-business-restore-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256='+binary+' ddl_sha256='+emptyDDL,
 'LOCAL_PASS pinned-migration-runner-compiled=yes migration_binary_sha256='+migrationBinary,
 'PASS pinned-migration-runner binary_sha256='+migrationBinary+' catalog_sha256='+catalog,
 'PASS fresh-migration-replay=001..081 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',
 'PASS a-business-restore-mysql binary_sha256='+binary
])assert.ok(text.includes(marker),marker);
assert.match(text,/^ok\s+clawreef\/internal\/systembackupbusinessa\s+9\.875s\r?$/m);
assert.match(text,/^bundle\.tar: OK\r?$/m);
assert.match(text,/mysql_version=8\.4\.8/);
const migrationStatus=JSON.parse(text.split(/\r?\n/).find(x=>x.startsWith('{"config_activated":')));
assert.equal(migrationStatus.result,'PASS');assert.equal(migrationStatus.migration_count,96);assert.equal(migrationStatus.migration_catalog_sha256,catalog);
for(const k of ['config_activated','historical_equivalence_verified','human_mfa_verified'])assert.equal(migrationStatus[k],false);
const rootStart=/^=== RUN\s+TestABusinessRestoreRowsMySQL\r?$/m.exec(text);assert.ok(rootStart);
assert.equal((text.match(/^=== RUN\s+TestABusinessRestoreRowsMySQL\r?$/gm)||[]).length,1);
const remote=text.slice(rootStart.index);
const expected=['cost_snapshot_concurrent_commit','cost_aggregate_money','cost_aggregate_tokens','cost_aggregate_currency_case','cost_aggregate_actual_NULL'];
const ran=[...remote.matchAll(/^=== RUN\s+TestABusinessRestoreRowsMySQL\/(\S+)\r?$/gm)].map(x=>x[1]);
const passed=[...remote.matchAll(/^\s+--- PASS: TestABusinessRestoreRowsMySQL\/(\S+) /gm)].map(x=>x[1]);
assert.deepEqual(ran,expected);assert.deepEqual(passed,expected);
assert.match(remote,/^--- PASS: TestABusinessRestoreRowsMySQL \(8\.56s\)\r?$/m);
assert.match(remote,/^\s+--- PASS: TestABusinessRestoreRowsMySQL\/cost_snapshot_concurrent_commit \(0\.10s\)\r?$/m);
assert.match(remote,/^PASS\r?$/m);
assert.doesNotMatch(text,/^FAIL\r?$|^\s*--- (?:FAIL|SKIP):|^CLEANUP_PENDING/m);
for(const marker of [
 'PASS cost-snapshot-concurrent-commit first_count_closed=yes writer_commit=observed original_rr=unchanged fresh_rr=changed writer=fixture reader=select-only production_dump_proof=no',
 'PASS A business fifteen-table complete-column roundtrip and rollback',
 'PASS A business formal FK and collation uniqueness rejection',
 'PASS A business SELECT-only permissions, NULL mismatch and final-proof rollback',
 'PASS A business SQL NULL preservation and exact decimal roundtrip',
 'PASS A business bounded-volume users=1001 quotas=1001 other_tables=1; full large-smoke.v1 not claimed',
 'CLEANED A business SELECT-only account',
 'CLEANED A business restore run-owned database'
])assert.ok(remote.includes(marker),marker);
const migrationNames=[...remote.matchAll(/Applied database migration (\S+\.sql)\r?$/gm)].map(x=>x[1]);
assert.equal(migrationNames.length,96);assert.equal(new Set(migrationNames).size,96);
assert.deepEqual(migrationNames,scope.asset_directories.find(x=>x.path==='backend/internal/db/migrations').files);
const seedPasses=[...text.matchAll(/^--- PASS: TestABusinessRestoreMySQLSeed \(([^)]+)\)\r?$/gm)].map(x=>x[1]);
assert.deepEqual(seedPasses,['0.07s','0.13s','0.04s']);
const namespace='sbk-mig-261022023330-7a22',uid='07aab8cd-5998-4b2f-90c8-1b894f4bf08e';
for(const marker of ['CLEANED namespace='+namespace+' uid='+uid,'CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True'])assert.ok(remote.includes(marker));
assert.match(text.trimEnd(),/cost_snapshot_restore_exit=0$/);
assert.equal(fs.existsSync(path.join(root,prefix+'-source.json')),false);
const inspectedEntry=[
 {path:'scripts/system-backup-a-evidence-validation.ps1',sha256:'e043992c6d318b09e5ea413253752df50db897c0913459ee83fcb52b9941a57c'},
 {path:'scripts/system-backup-a-evidence-go-step.ps1',sha256:'01b132a87031f86a5bdfe33bb5366de4c98009d015f9a2968cad1000a7c761dc'}
];
for(const p of inspectedEntry)assert.equal(sha(raw(p.path)),p.sha256);
const report={kind:'d_cost_snapshot_concurrent_actual_acceptance',status:'actual_mysql_five_cost_cases_log_accepted_synthetic_only',log:logPath,log_sha256:sha(raw(logPath)),log_bytes:raw(logPath).length,actual:{mysql:'8.4.8',parent:'TestABusinessRestoreRowsMySQL',parent_elapsed_seconds:8.56,cost_cases:5,passed:5,failed:0,skipped:0,case_names:expected,concurrent_case_elapsed_seconds:0.10,first_count_closed:true,separate_writer_commit_observed:true,original_rr_unchanged:true,fresh_rr_changed:true,binary_sha256:binary,local_and_remote_binary_markers_agree:true,migration_binary_sha256:migrationBinary,migration_catalog_sha256:catalog,migrations:96,migration_filenames: migrationNames,extra_ddl_sha256:emptyDDL,outer_exit:0,seed_stages_passed:3,local_unit_gate_reported_pass:true,local_unit_test_count_not_logged:true,bounded_volume:{users:1001,quotas:1001,other_tables:1}},preparation:{path:preparationPath,sha256:sha(raw(preparationPath)),scope_path:scopePath,scope_sha256:sha(raw(scopePath)),current_three_test_files_match_prepared:true,current_relevant_files:currentRelevant,prepared_binary_is_not_substituted_for_actual_run:true},provenance:{same_run_full_source_manifest:null,same_run_source_pre_post_hashes_logged:false,whole_source_to_binary_attestation:false,current_tree_used_as_historical_source_proof:false,current_entry_review:inspectedEntry,entry_runs_package_tests_and_compilation:true,previous_document_claim_of_per_package_input_fingerprints_corrected:true},cleanup:{namespace,uid,account_cleanup_reported:true,database_cleanup_reported:true,namespace_cleanup_reported:true,remote_scratch_cleanup_reported:true,local_cache_cleanup_reported:true,exact_local_scratch_identity_logged:false,local_scratch_independently_checked:false,remote_cleanup_independently_checked:false,socket_close_message_count:(text.match(/close - IO is still pending on closed socket/g)||[]).length},boundaries:{real_mysql:true,fixture_scope:'synthetic migrated fifteen-table business restore',production_dump_proof:false,real_b_dump_authentication:false,production_restore_writer_approval:false,full_large_smoke:false,full_gc:false,production_role_approval:false,human_mfa:false,production_approval:false,reviewer_remote_run:false,reviewer_dependencies_installed:false,current_whole_tree_tested:false}};
const output='docs/evidence/d-cost-snapshot-concurrent-actual-accepted-20261022.json';
if(process.argv.includes('--check')){assert.deepEqual(json(output),report);console.log('PASS actual cost snapshot: 5/5, RR concurrency, parent restore, 96 migrations, exit zero; synthetic/log provenance boundaries retained');}
else{fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(output);}
