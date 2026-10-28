import assert from 'node:assert/strict';
import test from 'node:test';
import { cases, validateBootstrapTranscript } from './d-bootstrap-consumer-mysql-review-20261026.mjs';

const receipt={binary_sha256:'a'.repeat(64),migration_binary_sha256:'b'.repeat(64),inputs_sha256:'c'.repeat(64),owner:'C:\\workspace\\.tmp-d-index-cache-'+ 'd'.repeat(32)};
const namespace='sbk-mig-261026120000-abcd',uid='12345678-1234-1234-1234-123456789abc';
const probe='TestDBootstrapConsumerMySQL';
const lines=[
  `RUN namespace=${namespace} uid=${uid} app_image=app@sha256:${'e'.repeat(64)} mysql_image=mysql@sha256:${'f'.repeat(64)} mysql_version=8.4.8`,
  JSON.stringify({config_activated:false,historical_equivalence_verified:false,history_review_sha256:'',human_mfa_verified:false,migration_catalog_sha256:'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe',migration_count:96,result:'PASS'}),
  `PASS pinned-migration-runner binary_sha256=${receipt.migration_binary_sha256} catalog_sha256=0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`,
  'PASS fresh-migration-replay=001..081 applied=96 exact_filenames=yes d_columns=blob/blob/blob/char',
  `=== RUN   ${probe}`,
  ...cases.flatMap(name=>[
    `=== RUN   ${probe}/${name}`,
    '    bootstrap_consumer_mysql_test.go:1: BOOTSTRAP_FIXTURE migrations=96 candidate_tables=8 full_canonical_A_tables=8 clone=SHOW_CREATE_TABLE foreign_key_checks=required capacity_helper=real_sql synthetic_authority=yes',
    ...(!['admin_revoked','authority_revoked','missing_capacity_new_consume','stale_capacity_new_consume'].includes(name)?['    bootstrap_consumer_mysql_test.go:2: BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic']:[]),
    ...(name.startsWith('late_')?[`    bootstrap_consumer_mysql_test.go:2: BOOTSTRAP_MUTATION_STORED kind=${name} rows=1`]:[]),
    '    d_producer_mysql_test.go:3: CLEANED evidence run-owned database',
    `    --- PASS: ${probe}/${name} (0.10s)`,
  ]),
  `--- PASS: ${probe} (72.10s)`,'PASS',
  `PASS d-bootstrap-consumer-mysql cases=26 binary_sha256=${receipt.binary_sha256} inputs_sha256=${receipt.inputs_sha256} capacity_helper=real_sql synthetic_authority=yes physical_capacity=no provider=no production=no`,
  `CLEANED namespace=${namespace} uid=${uid}`,'CLEANED bootstrapConsumer-remote-scratch=yes',
  `CLEANED bootstrapConsumer-local-owner=${receipt.owner} removed=True`,'bootstrap_consumer_exit=0',
];
const fixture=lines.join('\n');
test('accepts complete synthetic receiver fixture only',()=>{const r=validateBootstrapTranscript(fixture,receipt);assert.equal(r.actual_mysql_cases,26);assert.equal(r.namespace,namespace);});
const utf16le=value=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(value,'utf16le')]);
test('accepts UTF-8 operator bytes',()=>assert.equal(validateBootstrapTranscript(Buffer.from(fixture),receipt).actual_mysql_cases,26));
test('accepts UTF-8 BOM operator bytes',()=>assert.equal(validateBootstrapTranscript(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(fixture)]),receipt).actual_mysql_cases,26));
test('accepts PowerShell UTF-16LE BOM CRLF operator bytes',()=>assert.equal(validateBootstrapTranscript(utf16le(fixture.replaceAll('\n','\r\n')),receipt).actual_mysql_cases,26));
test('rejects failure in UTF-16LE operator bytes',()=>assert.throws(()=>validateBootstrapTranscript(utf16le(fixture+'\nFAIL'),receipt)));
test('rejects truncated UTF-16LE operator bytes',()=>assert.throws(()=>validateBootstrapTranscript(utf16le(fixture).subarray(0,-1),receipt)));
const childPasses=lines.filter(s=>s.trimStart().startsWith(`--- PASS: ${probe}/`));
const groupedFixture=lines.filter(s=>!childPasses.includes(s)).flatMap(s=>s.startsWith(`--- PASS: ${probe} (`)?[s,...childPasses]:[s]).join('\n');
test('accepts Go grouped subtest PASS summary',()=>assert.equal(validateBootstrapTranscript(groupedFixture,receipt).actual_mysql_cases,26));
test('accepts Go grouped summary in PowerShell UTF-16LE',()=>assert.equal(validateBootstrapTranscript(utf16le(groupedFixture),receipt).actual_mysql_cases,26));
test('rejects capacity proof moved into another grouped case',()=>{
  const charge='    bootstrap_consumer_mysql_test.go:2: BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic';
  const moved=groupedFixture.replace(charge+'\n','').replace(`=== RUN   ${probe}/admin_revoked\n`,`=== RUN   ${probe}/admin_revoked\n${charge}\n`);
  assert.throws(()=>validateBootstrapTranscript(moved,receipt));
});
test('rejects cleanup moved into another grouped case',()=>{
  const clean='    d_producer_mysql_test.go:3: CLEANED evidence run-owned database';
  const moved=groupedFixture.replace(clean+'\n','').replace(`=== RUN   ${probe}/admin_revoked\n`,`=== RUN   ${probe}/admin_revoked\n${clean}\n`);
  assert.throws(()=>validateBootstrapTranscript(moved,receipt));
});
const mutations={
  empty:()=>'',
  missing_case:s=>s.replace(`=== RUN   ${probe}/first_atomic\n`,''),
  duplicate_case:s=>s+`\n=== RUN   ${probe}/first_atomic`,
  missing_pass:s=>s.replace(`    --- PASS: ${probe}/fail_config (0.10s)`,''),
  no_mutation_proof:s=>s.replace('BOOTSTRAP_MUTATION_STORED kind=late_config rows=1','SQL_ERROR kind=late_config'),
  operation_mutation_rejected_by_sql:s=>s.replace('BOOTSTRAP_MUTATION_STORED kind=late_operation rows=1',"SQL_ERROR kind=late_operation Check constraint 'chk_sb_operation_target_id' is violated"),
  duplicate_mutation:s=>s+'\n    x.go:1: BOOTSTRAP_MUTATION_STORED kind=late_config rows=1',
  mutation_before_case:s=>s.replace('BOOTSTRAP_MUTATION_STORED kind=late_audit rows=1','SQL_REJECTED kind=late_audit'),
  wrong_charge:s=>s.replace('charge=73728','charge=73729'),
  capacity_callback_without_helper:s=>s.replace('capacity_helper=real_sql','capacity_helper=marker'),
  old_18_case_phase:s=>s.replace('cases=26','cases=18'),
  missing_ledger_mutation:s=>s.replace('BOOTSTRAP_MUTATION_STORED kind=late_capacity_ledger rows=1','SQL_ERROR kind=late_capacity_ledger'),
  duplicate_capacity_charge:s=>s.replace('BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic','BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic\n    x.go:1: BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic'),
  revoked_attempt_charged:s=>s.replace('=== RUN   '+probe+'/admin_revoked\n','=== RUN   '+probe+'/admin_revoked\n    x.go:1: BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic\n'),
  missing_real_capacity:s=>s.replace('BOOTSTRAP_CAPACITY_RESERVED helper=real_sql charge=73728 physical_report=synthetic','CAPACITY_CALLBACK_ONLY'),
  missing_database_cleanup:s=>s.replace('    d_producer_mysql_test.go:3: CLEANED evidence run-owned database\n',''),
  missing_full_schema:s=>s.replace('full_canonical_A_tables=8','full_canonical_A_tables=7'),
  wrong_namespace:s=>s.replace(`CLEANED namespace=${namespace}`, 'CLEANED namespace=sbk-mig-261026120001-abcd'),
  wrong_uid:s=>s.replace(`CLEANED namespace=${namespace} uid=${uid}`,`CLEANED namespace=${namespace} uid=00000000-0000-0000-0000-000000000000`),
  wrong_binary:s=>s.replace(`binary_sha256=${receipt.binary_sha256}`,`binary_sha256=${'1'.repeat(64)}`),
  missing_migration:s=>s.replace('applied=96','applied=95'),
  migration_count_used_as_last_prefix:s=>s.replace('fresh-migration-replay=001..081','fresh-migration-replay=001..096'),
  production_claim:s=>s.replace('provider=no production=no','provider=yes production=yes'),
  pending_cleanup:s=>s+'\nCLEANUP_PENDING database',
  foreign_root:s=>s+'\n=== RUN   TestDProducerMySQL',
  skip:s=>s+`\n    --- SKIP: ${probe}/owner_cutoff_expired (0.10s)`,
  failure:s=>s+'\nFAIL',
  nonzero_exit:s=>s.replace('bootstrap_consumer_exit=0','bootstrap_consumer_exit=1'),
  duplicate_exit:s=>s+'\nbootstrap_consumer_exit=0',
  early_exit:s=>'bootstrap_consumer_exit=0\n'+s.replace('bootstrap_consumer_exit=0',''),
  owner_not_removed:s=>s.replace('removed=True','removed=False'),
  owner_changed:s=>s.replace(`local-owner=${receipt.owner}`,`local-owner=C:\\workspace\\.tmp-d-index-cache-${'e'.repeat(32)}`),
  missing_parent_pass:s=>s.replace(`--- PASS: ${probe} (72.10s)`,''),
};
for(const [name,mutate] of Object.entries(mutations))test('rejects '+name,()=>assert.throws(()=>validateBootstrapTranscript(mutate(fixture),receipt)));
