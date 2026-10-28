import assert from 'node:assert/strict';
import test from 'node:test';
import { cases,validateBootstrapTranscript as review } from './d-bootstrap-config-ranges-mysql-review-20261026.mjs';
const receipt={binary_sha256:'a'.repeat(64),migration_binary_sha256:'b'.repeat(64),inputs_sha256:'c'.repeat(64),owner:'C:\\workspace\\.tmp-d-index-cache-'+ 'd'.repeat(32)};
const probe='TestDBootstrapConsumerRangesMySQL',namespace='sbk-mig-261026120000-abcd',uid='12345678-1234-1234-1234-123456789abc';
const fixture=[
 `RUN namespace=${namespace} uid=${uid} app_image=app@sha256:${'e'.repeat(64)} mysql_image=mysql@sha256:${'f'.repeat(64)} mysql_version=8.4.8`,
 JSON.stringify({config_activated:false,historical_equivalence_verified:false,history_review_sha256:'',human_mfa_verified:false,migration_catalog_sha256:'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe',migration_count:96,result:'PASS'}),
 `PASS pinned-migration-runner binary_sha256=${receipt.migration_binary_sha256} catalog_sha256=0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`,
 'PASS fresh-migration-replay=001..081 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',`=== RUN   ${probe}`,
 ...cases.flatMap(name=>[`=== RUN   ${probe}/${name}`,
 '    x.go:1: CONFIG_RANGE_ANCHORS writer=original_legacy stage=before_C1_schema producer_tables_before=0 anchors=3',
 '    x.go:1: BOOTSTRAP_FIXTURE migrations=96 candidate_tables=8 full_canonical_A_tables=8 clone=SHOW_CREATE_TABLE foreign_key_checks=required capacity_helper=real_sql synthetic_authority=yes',
 `    x.go:1: CONFIG_RANGE_LAYOUT case=${name} anchors=3 direct_gap=000..002 target_gap=002..zzz source_values=before_begin`,
 `    x.go:2: CONFIG_RANGE_WAIT case=${name} index=uk_sb_config_version lock_type=RECORD lock_mode=${name==='existing_nonce_metadata'?'X':'X,GAP,INSERT_INTENTION'} requester=12 blocker=13 direct_writer_installation_lock=no`,
 `    x.go:3: CONFIG_RANGE_RELEASE case=${name} bootstrap_rolled_back=yes direct_writer_committed=yes rows=1`,
 '    x.go:4: CLEANED evidence run-owned database',`    --- PASS: ${probe}/${name} (0.10s)`]),
 `--- PASS: ${probe} (0.30s)`,'PASS',
 `PASS d-bootstrap-config-ranges-mysql cases=3 binary_sha256=${receipt.binary_sha256} inputs_sha256=${receipt.inputs_sha256} lock_wait_graph=yes direct_writer_installation_lock=no synthetic_authority=yes production=no`,
 `CLEANED namespace=${namespace} uid=${uid}`,'CLEANED bootstrapConsumer-remote-scratch=yes',
 `CLEANED bootstrapConsumer-local-owner=${receipt.owner} removed=True`,'bootstrap_config_ranges_exit=0',
].join('\n');
test('accepts complete synthetic receiver fixture only',()=>assert.equal(review(fixture,receipt).actual_mysql_cases,3));
const utf16le=value=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(value,'utf16le')]);
test('accepts UTF-8 operator bytes',()=>assert.equal(review(Buffer.from(fixture),receipt).actual_mysql_cases,3));
test('accepts UTF-8 BOM operator bytes',()=>assert.equal(review(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(fixture)]),receipt).actual_mysql_cases,3));
test('accepts PowerShell UTF-16LE BOM CRLF operator bytes',()=>assert.equal(review(utf16le(fixture.replaceAll('\n','\r\n')),receipt).actual_mysql_cases,3));
test('rejects failure in UTF-16LE operator bytes',()=>assert.throws(()=>review(utf16le(fixture+'\nFAIL'),receipt)));
test('rejects truncated UTF-16LE operator bytes',()=>assert.throws(()=>review(utf16le(fixture).subarray(0,-1),receipt)));
const fixtureLines=fixture.split('\n'),childPasses=fixtureLines.filter(s=>s.trimStart().startsWith(`--- PASS: ${probe}/`));
const groupedFixture=fixtureLines.filter(s=>!childPasses.includes(s)).flatMap(s=>s.startsWith(`--- PASS: ${probe} (`)?[s,...childPasses]:[s]).join('\n');
test('accepts Go grouped subtest PASS summary',()=>assert.equal(review(groupedFixture,receipt).actual_mysql_cases,3));
test('accepts Go grouped summary in PowerShell UTF-16LE',()=>assert.equal(review(utf16le(groupedFixture),receipt).actual_mysql_cases,3));
test('rejects anchors moved into another grouped case',()=>{
  const anchor='    x.go:1: CONFIG_RANGE_ANCHORS writer=original_legacy stage=before_C1_schema producer_tables_before=0 anchors=3';
  const moved=groupedFixture.replace(anchor+'\n','').replace(`=== RUN   ${probe}/empty_new_origin\n`,`=== RUN   ${probe}/empty_new_origin\n${anchor}\n`);
  assert.throws(()=>review(moved,receipt));
});
test('rejects cleanup moved into another grouped case',()=>{
  const clean='    x.go:4: CLEANED evidence run-owned database';
  const moved=groupedFixture.replace(clean+'\n','').replace(`=== RUN   ${probe}/empty_new_origin\n`,`=== RUN   ${probe}/empty_new_origin\n${clean}\n`);
  assert.throws(()=>review(moved,receipt));
});
const mutate={
 migration_count_used_as_last_prefix:s=>s.replace('fresh-migration-replay=001..081','fresh-migration-replay=001..096'),
 no_pre_C1_anchors:s=>s.replace('CONFIG_RANGE_ANCHORS writer=original_legacy','NO_ANCHORS writer=original_legacy'),
 late_legacy_bypass:s=>s.replace('stage=before_C1_schema','stage=after_C1_schema'),
 installed_C1_tables:s=>s.replace('producer_tables_before=0','producer_tables_before=8'),
 old_adjacent_gap:s=>s.replace('anchors=3 direct_gap=000..002 target_gap=002..zzz','anchors=1 direct_gap=000..zzz target_gap=000..zzz'),
 no_graph:s=>s.replace('CONFIG_RANGE_WAIT case=empty_new_origin','TRACE_ONLY case=empty_new_origin'),
 wrong_waited_index:s=>s.replace('case=empty_new_origin index=uk_sb_config_version','case=empty_new_origin index=PRIMARY'),
 source_row_lock:s=>s.replace('case=empty_new_origin index=uk_sb_config_version lock_type=RECORD lock_mode=X,GAP,INSERT_INTENTION','case=empty_new_origin index=uk_sb_config_version lock_type=RECORD lock_mode=S'),
 same_connection:s=>s.replace('requester=12 blocker=13','requester=12 blocker=12'),
 installation_lock_used:s=>s.replace('direct_writer_installation_lock=no','direct_writer_installation_lock=yes'),
 commit_not_proven:s=>s.replace('direct_writer_committed=yes','direct_writer_committed=no'),
 original_not_rolled_back:s=>s.replace('bootstrap_rolled_back=yes','bootstrap_rolled_back=no'),
 missing_release:s=>s.replace('CONFIG_RANGE_RELEASE case=existing_nonce_metadata','UNKNOWN_RELEASE case=existing_nonce_metadata'),
 missing_case:s=>s.replace(`=== RUN   ${probe}/empty_new_origin`,''),
 duplicate_case:s=>s+`\n=== RUN   ${probe}/empty_new_origin`,
 missing_database_cleanup:s=>s.replace('    x.go:4: CLEANED evidence run-owned database\n',''),
 namespace_mismatch:s=>s.replace(`CLEANED namespace=${namespace}`,`CLEANED namespace=sbk-mig-261026120001-abcd`),
 nonzero:s=>s.replace('bootstrap_config_ranges_exit=0','bootstrap_config_ranges_exit=1'),
 failed:s=>s+'\nFAIL',
 pending_cleanup:s=>s+'\nCLEANUP_PENDING worker',
 wrong_binary:s=>s.replace(`binary_sha256=${receipt.binary_sha256}`,`binary_sha256=${'1'.repeat(64)}`),
 old_consumer_profile:s=>s.replace('cases=3','cases=26'),
 missing_fk:s=>s.replace('foreign_key_checks=required','foreign_key_checks=disabled'),
 skipped:s=>s+`\n    --- SKIP: ${probe}/empty_new_origin (0.1s)`,
 missing_native_pass:s=>s.replace('\nPASS\n','\n'),
};
for(const [name,fn] of Object.entries(mutate))test('rejects '+name,()=>assert.throws(()=>review(fn(fixture),receipt)));
