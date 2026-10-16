import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { summarizeIndexReview } from './system-backup-d-admin-read-index-report.mjs';
import { summarizeIndexGroups, summarizeIndexGroupRun } from './system-backup-d-index-group-report.mjs';
import { buildIndexVariantDDL, indexGroupPlan, normalizeIndexDDL } from './system-backup-d-index-groups.mjs';
import { hash, baselineFixture, text } from './system-backup-d-index-report-fixture.mjs';
import { verifyIndexGroupSuite, groupTranscriptNames } from './system-backup-d-index-group-verify.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
function groupedFixtures() {
  return indexGroupPlan.map(({ round, variant }, n) => {
    const f = baselineFixture(), s = f.records[0];
    const old = { run: s.run, namespace_uid: s.namespace_uid, database: s.database };
    s.run = `sbk-mig-26101400000${n}-abcd`;
    s.namespace_uid = `11111111-2222-3333-4444-${String(n).padStart(12, '0')}`;
    s.database = 'didx_' + String(n).repeat(24);
    s.index_variant = variant; s.applied_ddl = buildIndexVariantDDL(variant); s.applied_ddl_sha256 = digest(s.applied_ddl);
    const fullHash = digest(buildIndexVariantDDL('all')); s.ddl_sha256 = fullHash;
    f.markers = f.markers.map(line => line.replace(old.run, s.run).replace(old.namespace_uid, s.namespace_uid).replace(old.database, s.database)
      .replace(`ddl_sha256=${hash} synthetic`, `ddl_sha256=${fullHash} synthetic`));
    f.markers.push(`D_INDEX_GROUP_BEGIN round=${round} variant=${variant}`, `D_INDEX_GROUP_END round=${round} variant=${variant} exit=0`,
      `LOCAL_PASS a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${hash} ddl_sha256=${hash}`,
      `PASS a-admin-read-mysql binary_sha256=${hash} ddl_sha256=${hash}`,
      `LOCAL_PASS d-admin-read-http-probe-compiled=yes http_binary_sha256=${hash} real_mysql=not_run`,
      `PASS d-admin-read-live-http-mysql binary_sha256=${hash}`);
    for (const name of ['TestAAdminReadAuthorityMySQL', 'TestDAdminReadFullSchemaMySQL', 'TestDAdminReadLiveHTTPMySQL',
      'TestDAdminReadFullSchemaMySQL/task_execution_scoped_attempts_and_progress',
      'TestDAdminReadFullSchemaMySQL/overview_control_complete_counts_and_installation_isolation',
      'TestDAdminReadFullSchemaMySQL/overview_current_promotion_binding_and_availability_loss']) f.markers.push(`--- PASS: ${name} (0.01s)`);
    return f;
  });
}
const suiteText = fixtures => fixtures.map(f => [
  ...f.markers.filter(x => x.startsWith('D_INDEX_GROUP_BEGIN')),
  text({ records: f.records, markers: f.markers.filter(x => !x.startsWith('D_INDEX_GROUP_BEGIN') && !x.startsWith('D_INDEX_GROUP_END')) }),
  ...f.markers.filter(x => x.startsWith('D_INDEX_GROUP_END')),
].join('\r\n'));

function suiteReceiptFixture() {
  const transcriptBytes = suiteText(groupedFixtures()).map(x => Buffer.from(x));
  const saved = summarizeIndexGroups(transcriptBytes.map(x => x.toString('utf8')));
  saved.inputs = groupTranscriptNames.map(x => 'C:/example/evidence/' + x);
  const reportBytes = Buffer.from(JSON.stringify(saved));
  return { reportBytes, transcriptBytes, cacheExists: false, receipt: {
    kind:'d_index_group_suite_completion',rounds:2,runs:6,exit:0,production_approved:false,
    local_build_cache_cleaned:true,local_build_cache_directory:'.tmp-d-index-cache-'+'a'.repeat(32),
    report_sha256:digest(reportBytes),transcripts:transcriptBytes.map((x,i)=>({name:groupTranscriptNames[i],sha256:digest(x)})),
  } };
}

test('completion verifier recomputes original measurements and checks removed cache identity', () => {
  assert.equal(verifyIndexGroupSuite(suiteReceiptFixture()).local_cache_absent, true);
});

function frozenSuiteFixture(){
  const files=[{path:'backend/go.mod',sha256:hash,size:123}];
  const sourceHash=digest(files.map(x=>`${x.path}\0${x.sha256}\0${x.size}`).join('\n')+'\n');
  const snapshotBytes=Buffer.from(JSON.stringify({kind:'d_index_group_source_snapshot',version:1,stable_copy_verified:true,production_approved:false,files,source_sha256:sourceHash}));
  const f=suiteReceiptFixture();
  f.transcriptBytes=f.transcriptBytes.map(x=>Buffer.from(x.toString('utf8')+'\nD_INDEX_GROUP_SOURCE_SHA256='+sourceHash+'\n'));
  const saved=summarizeIndexGroups(f.transcriptBytes.map(x=>x.toString('utf8')));saved.inputs=groupTranscriptNames;
  f.reportBytes=Buffer.from(JSON.stringify(saved));f.receipt.report_sha256=digest(f.reportBytes);
  f.receipt.transcripts=f.transcriptBytes.map((x,i)=>({name:groupTranscriptNames[i],sha256:digest(x)}));
  f.receipt.source_snapshot_sha256=digest(snapshotBytes);f.snapshotBytes=snapshotBytes;
  return f;
}
test('frozen suite verifies manifest file pins and all six matching source markers',()=>{
  assert.equal(verifyIndexGroupSuite(frozenSuiteFixture()).runs,6);
});
for(const [name,mutate] of [
  ['missing manifest',f=>delete f.snapshotBytes],
  ['changed manifest bytes',f=>f.snapshotBytes=Buffer.from('{}')],
  ['rehashed forged source pin',f=>{const s=JSON.parse(f.snapshotBytes);s.files[0].sha256='f'.repeat(64);f.snapshotBytes=Buffer.from(JSON.stringify(s));f.receipt.source_snapshot_sha256=digest(f.snapshotBytes);}]
])test('rejects frozen suite '+name,()=>{const f=frozenSuiteFixture();mutate(f);assert.throws(()=>verifyIndexGroupSuite(f));});
test('source marker drift or missing marker rejects grouped comparison',()=>{
  const f=frozenSuiteFixture(),texts=f.transcriptBytes.map(x=>x.toString('utf8'));
  const changed=[...texts];changed[5]=changed[5].replace(/D_INDEX_GROUP_SOURCE_SHA256=[a-f0-9]{64}/,'D_INDEX_GROUP_SOURCE_SHA256='+'f'.repeat(64));
  assert.throws(()=>summarizeIndexGroups(changed),/snapshot drift/);
  const missing=[...texts];missing[0]=missing[0].replace(/D_INDEX_GROUP_SOURCE_SHA256=[a-f0-9]{64}/,'');
  assert.throws(()=>summarizeIndexGroups(missing),/snapshot drift/);
});
for(const [name, mutate] of [
  ['changed raw transcript', f=>f.transcriptBytes[0]=Buffer.from('changed')],
  ['changed report', f=>f.reportBytes=Buffer.from('{}')],
  ['forged report ratio with recomputed hash', f=>{const r=JSON.parse(f.reportBytes);r.comparisons.page[0].tables.system_backups.queries.page.median_pair_ratio.p50=0.0001;f.reportBytes=Buffer.from(JSON.stringify(r));f.receipt.report_sha256=digest(f.reportBytes);}],
  ['changed transcript name', f=>f.receipt.transcripts[0].name='../r1-page.txt'],
  ['cache still present', f=>f.cacheExists=true],
  ['cache absence unchecked', f=>delete f.cacheExists],
  ['unsafe cache identity', f=>f.receipt.local_build_cache_directory='../outside'],
  ['missing cleanup', f=>f.receipt.local_build_cache_cleaned=false],
  ['claimed production approval', f=>f.receipt.production_approved=true],
  ['failed suite exit', f=>f.receipt.exit=1],
  ['missing completion', f=>f.receipt=null],
]) test(`rejects suite completion ${name}`,()=>{const f=suiteReceiptFixture();mutate(f);assert.throws(()=>verifyIndexGroupSuite(f));});

test('six independent forward/reverse runs retain per-round ratios and evidence', () => {
  const report = summarizeIndexGroups(suiteText(groupedFixtures()));
  assert.equal(report.production_approved, false);
  assert.equal(report.runs.length, 6);
  assert.deepEqual(report.comparisons.page.map(x => x.round), [1, 2]);
  assert.equal(report.comparisons.status[0].tables.system_backup_operations.queries.page.pairs, 12);
  assert.equal(report.comparisons.all[0].tables.system_backups.queries.cutoff.median_pair_ratio.p50, 1);
});

test('each run gate requires A/D/HTTP and pins before the next remote action', () => {
  const f = groupedFixtures();
  assert.equal(summarizeIndexGroupRun(suiteText(f)[0], indexGroupPlan[0]).variant, 'page');
  f[0].markers = f[0].markers.filter(x => !x.startsWith('--- PASS: TestDAdminReadLiveHTTPMySQL'));
  assert.throws(() => summarizeIndexGroupRun(suiteText(f)[0], indexGroupPlan[0]), /assertion missing/);
  assert.throws(() => summarizeIndexGroupRun(suiteText(groupedFixtures())[0], {round:3,variant:'page'}), /Invalid/);
});

test('closed subsets match the reviewed source and leave status-only operations untouched', () => {
  const full = readFileSync(new URL('../docs/system-backup-d-admin-read-index-candidate-20261012.sql', import.meta.url), 'utf8');
  assert.equal(normalizeIndexDDL(full), normalizeIndexDDL(buildIndexVariantDDL('all')));
  assert.equal((buildIndexVariantDDL('page').match(/ADD INDEX/g) ?? []).length, 5);
  assert.equal((buildIndexVariantDDL('status').match(/ADD INDEX/g) ?? []).length, 4);
  assert.ok(!buildIndexVariantDDL('status').includes('system_backup_operations'));
  assert.throws(() => buildIndexVariantDDL('custom'));
});

test('zero-rounded query baseline produces null without invented ratio', () => {
  const f = groupedFixtures();
  f[0].records.find(row => row.kind === 'cutoff' && row.phase === 'before').warm_cache_us.p50 = 0;
  assert.equal(summarizeIndexGroups(suiteText(f)).comparisons.page[0].tables.system_backups.queries.cutoff.median_pair_ratio.p50, null);
});

for (const [name, mutate] of [
  ['missing run', f => f.pop()],
  ['swapped group order', f => [f[0], f[1]] = [f[1], f[0]]],
  ['reused namespace', f => {const a=f[0].records[0], b=f[1].records[0];f[1].markers=f[1].markers.map(x=>x.replace(b.namespace_uid,a.namespace_uid));b.namespace_uid=a.namespace_uid;}],
  ['missing HTTP PASS', f => f[0].markers=f[0].markers.filter(x=>!x.startsWith('--- PASS: TestDAdminReadLiveHTTPMySQL'))],
  ['only printed HTTP PASS command', f => f[0].markers=f[0].markers.map(x=>x.startsWith('--- PASS: TestDAdminReadLiveHTTPMySQL')?`PS> Write-Output '${x}'`:x)],
  ['duplicate HTTP PASS', f => f[0].markers.push(f[0].markers.find(x=>x.startsWith('--- PASS: TestDAdminReadLiveHTTPMySQL')))],
  ['HTTP pin drift', f => f[0].markers=f[0].markers.map(x=>x.startsWith('PASS d-admin-read-live-http')?x.replace(hash,'b'.repeat(64)):x)],
  ['A final proof drift', f => f[0].markers=f[0].markers.map(x=>x.startsWith('PASS a-admin-read-mysql')?x.replaceAll(hash,'b'.repeat(64)):x)],
  ['source schema drift', f => f[1].records[0].source_schema_sha256.system_backups='b'.repeat(64)],
  ['query SQL drift', f => f[1].records.filter(x=>x.kind==='page').forEach(x=>x.sql+=' WHERE 1=1')],
  ['missing final group marker', f => f[0].markers=f[0].markers.filter(x=>!x.startsWith('D_INDEX_GROUP_END'))],
  ['only printed group command', f => f[0].markers=f[0].markers.map(x=>x.startsWith('D_INDEX_GROUP_END')?`PS> Write-Output '${x}'`:x)],
  ['duplicate group marker', f => f[0].markers.push(f[0].markers.find(x=>x.startsWith('D_INDEX_GROUP_END')))],
  ['incomplete writer baseline', f => f[0].records.find(x=>x.kind==='ddl_writer_baseline').write_pairs=29],
  ['DDL SQL injection', f => {const s=f[0].records[0];s.applied_ddl+='DROP TABLE users;';s.applied_ddl_sha256=digest(s.applied_ddl);}],
  ['variant spoof', f => f[0].records[0].index_variant='status'],
  ['applied hash drift', f => f[0].records[0].applied_ddl_sha256='b'.repeat(64)],
  ['subset metadata missing', f => delete f[0].records[0].applied_ddl],
  ['old full-scope downgrade', f => {const s=f[0].records[0];delete s.index_variant;delete s.applied_ddl;delete s.applied_ddl_sha256;}],
]) test(`rejects grouped ${name}`, () => {
  const f=groupedFixtures(); mutate(f); assert.throws(()=>summarizeIndexGroups(suiteText(f)));
});

test('both archived successful reports reproduce exactly; failed v2 remains rejected', () => {
  for(const suffix of ['', '-v2-r2']) {
    const input=readFileSync(new URL(`../docs/evidence/d-admin-read-index-mysql-remote-20261014${suffix}.txt`, import.meta.url),'utf8');
    const saved=JSON.parse(readFileSync(new URL(`../docs/evidence/system-backup-d-admin-read-index-report-20261014${suffix}.json`, import.meta.url),'utf8'));
    assert.deepEqual(summarizeIndexReview(input), saved);
  }
  const failed=readFileSync(new URL('../docs/evidence/d-admin-read-index-mysql-remote-20261014-v2.txt', import.meta.url),'utf8');
  assert.throws(()=>summarizeIndexReview(failed));
});
