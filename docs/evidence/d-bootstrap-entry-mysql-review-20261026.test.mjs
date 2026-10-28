import assert from 'node:assert/strict';
import test from 'node:test';
import {cases,validateEntryTranscript as review} from './d-bootstrap-entry-mysql-review-20261026.mjs';
const receipt={binary_sha256:'a'.repeat(64),migration_binary_sha256:'b'.repeat(64),inputs_sha256:'c'.repeat(64),owner:'C:\\workspace\\.tmp-d-index-cache-'+ 'd'.repeat(32)};
const probe='TestDBootstrapEntryMySQL',namespace='sbk-mig-261026120000-abcd',uid='12345678-1234-1234-1234-123456789abc';
const hasDomain=n=>n.startsWith('history_configured_')||n.startsWith('history_unconfigured_')||['schema_full_unconfigured_first','history_wrong_hash','history_wrong_version','late_domain_mutation'].includes(n);
const configured=n=>n.startsWith('history_configured_')||['history_wrong_hash','history_wrong_version','late_domain_mutation'].includes(n);
const outcome=n=>n==='schema_absent_first'?'created capacity_callbacks=1 disabled_v1=yes':n==='commit_lost'?'commit_unknown_then_history capacity_callbacks=1 A_D_rows=unchanged_on_retry':n==='scope_gap_lock'?'gap_observed_then_released A_rows=unchanged direct_domain_rows=1':(['history_schema_absent','history_full_no_domain'].includes(n)||n.startsWith('history_configured_'))?'history capacity_callbacks=0 A_D_rows=unchanged':'denied A_D_rows=unchanged';
const fixture=[
 `RUN namespace=${namespace} uid=${uid} app_image=app@sha256:${'e'.repeat(64)} mysql_image=mysql@sha256:${'f'.repeat(64)} mysql_version=8.4.8`,
 JSON.stringify({config_activated:false,historical_equivalence_verified:false,history_review_sha256:'',human_mfa_verified:false,migration_catalog_sha256:'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe',migration_count:96,result:'PASS'}),
 `PASS pinned-migration-runner binary_sha256=${receipt.migration_binary_sha256} catalog_sha256=0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`,
 'PASS fresh-migration-replay=001..096 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',`=== RUN   ${probe}`,
 ...cases.flatMap(n=>[`=== RUN   ${probe}/${n}`,
 `    x.go:1: ENTRY_FIXTURE migrations=96 canonical_A=8 c1=${['schema_absent_first','history_schema_absent','commit_lost'].includes(n)?0:n==='schema_partial_first'?1:8} foreign_key_checks=1 history_pre_C1=${n.startsWith('history_')||n==='late_domain_mutation'} authority=synthetic`,
 ...(hasDomain(n)?[`    x.go:2: ENTRY_DOMAIN provision=real_DomainOpener configured=${configured(n)} management_authority=synthetic`]:[]),
 ...(hasDomain(n)&&(/_(closed|revoked)$/.test(n)||['history_wrong_hash','history_wrong_version'].includes(n))?['    x.go:2: ENTRY_DOMAIN_VARIANT canonical_codec=yes controlled_fixture_only=yes']:[]),
 ...(n==='hidden_c1_a_only'?['    x.go:2: ENTRY_VISIBILITY real_tables=8 metadata_visible=0 direct_error=1142 identity=A_tables_only A_prefix_access=verified helper_denied=yes']:[]),
 ...(n==='late_domain_mutation'?['    x.go:2: ENTRY_LATE_DOMAIN mutation_rows=1 original_tx=yes stage=final_authorize']:[]),
 ...(n==='scope_gap_lock'?['    x.go:2: ENTRY_GAP index=PRIMARY insertion_intention=yes actual_wait_graph=yes direct_installation_lock=no']:[]),
 `    x.go:3: ENTRY_RESULT case=${n} result=${outcome(n)}`,
 ...(n==='hidden_c1_a_only'?['    x.go:4: CLEANED entry run-owned mysql account']:[]),
 '    x.go:5: CLEANED evidence run-owned database',`    --- PASS: ${probe}/${n} (0.10s)`]),
 `--- PASS: ${probe} (9.30s)`,'PASS',
 `PASS d-bootstrap-entry-mysql cases=22 binary_sha256=${receipt.binary_sha256} inputs_sha256=${receipt.inputs_sha256} visibility=typed1142 domain_gap=actual_wait authority=synthetic physical_capacity=no production=no`,
 `CLEANED namespace=${namespace} uid=${uid}`,'CLEANED bootstrapConsumer-remote-scratch=yes',`CLEANED bootstrapConsumer-local-owner=${receipt.owner} removed=True`,'bootstrap_entry_exit=0',
].join('\n');
test('accepts complete synthetic receiver fixture only',()=>assert.equal(review(fixture,receipt).actual_mysql_cases,22));
const bad={
 missing_case:s=>s.replace(`=== RUN   ${probe}/hidden_c1_a_only`,''),duplicate_case:s=>s+`\n=== RUN   ${probe}/hidden_c1_a_only`,
 wrong_schema_count:s=>s.replace('canonical_A=8 c1=1','canonical_A=8 c1=8'),
 hidden_metadata_visible:s=>s.replace('metadata_visible=0','metadata_visible=8'),
 missing_actual_1142:s=>s.replace('direct_error=1142','direct_error=synthetic'),
 A_prefix_not_verified:s=>s.replace('A_prefix_access=verified','A_prefix_access=not_run'),
 fence_not_checked:s=>s.replace('helper_denied=yes','helper_denied=no'),
 missing_visibility_proof:s=>s.replace('ENTRY_VISIBILITY','NOTE_ONLY'),
 missing_domain_real_API:s=>s.replace('provision=real_DomainOpener','provision=INSERT_fixture'),
 wrong_domain_branch:s=>s.replace('configured=true','configured=false'),
 missing_variant:s=>s.replace('ENTRY_DOMAIN_VARIANT','VARIANT_NOT_CHECKED'),
 history_charged:s=>s.replace('history capacity_callbacks=0','history capacity_callbacks=1'),
 history_falsely_denied:s=>s.replace('result=history capacity_callbacks=0 A_D_rows=unchanged','result=denied A_D_rows=unchanged'),
 denied_falsely_history:s=>s.replace('result=denied A_D_rows=unchanged','result=history capacity_callbacks=0 A_D_rows=unchanged'),
 missing_late_mutation:s=>s.replace('ENTRY_LATE_DOMAIN mutation_rows=1','ENTRY_LATE_DOMAIN mutation_rows=0'),
 mutation_outside_tx:s=>s.replace('original_tx=yes','original_tx=no'),
 no_actual_gap:s=>s.replace('actual_wait_graph=yes','actual_wait_graph=no'),
 wrong_gap_index:s=>s.replace('ENTRY_GAP index=PRIMARY','ENTRY_GAP index=uk_sb_config_version'),
 gap_not_insert_intention:s=>s.replace('insertion_intention=yes','insertion_intention=no'),
 direct_installation_lock:s=>s.replace('direct_installation_lock=no','direct_installation_lock=yes'),
 no_commit_unknown_recovery:s=>s.replace('result=commit_unknown_then_history','result=created'),
 account_cleanup_missing:s=>s.replace('CLEANED entry run-owned mysql account','ACCOUNT_RETAINED'),
 DB_cleanup_missing:s=>s.replace('CLEANED evidence run-owned database','DATABASE_RETAINED'),
 unscoped_result:s=>s+'\n    x.go:3: ENTRY_RESULT case=wrong_context result=denied A_D_rows=unchanged',
 unscoped_gap:s=>s+'\n    x.go:2: ENTRY_GAP index=PRIMARY insertion_intention=yes actual_wait_graph=yes direct_installation_lock=no',
 wrong_UID:s=>s.replace(`CLEANED namespace=${namespace} uid=${uid}`,`CLEANED namespace=${namespace} uid=00000000-0000-0000-0000-000000000000`),
 wrong_binary:s=>s.replace(`binary_sha256=${receipt.binary_sha256}`,`binary_sha256=${'1'.repeat(64)}`),
 nonzero:s=>s.replace('bootstrap_entry_exit=0','bootstrap_entry_exit=1'),
 skipped:s=>s+'\n--- SKIP: '+probe+' (0.1s)',failed:s=>s+'\nFAIL',no_native_pass:s=>s.replace('\nPASS\n','\n'),foreign_root:s=>s+'\n=== RUN   TestDBootstrapConsumerMySQL',
};
for(const [name,mutate]of Object.entries(bad))test('rejects '+name,()=>assert.throws(()=>review(mutate(fixture),receipt)));
