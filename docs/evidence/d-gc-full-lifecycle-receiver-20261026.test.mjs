import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleCases,receiveLifecycle} from './d-gc-full-lifecycle-receiver-20261026.mjs';
import {sha} from '../../scripts/system-backup-d-gc-full-collect-receiver.mjs';

// In-memory parser fixtures only: none of these strings is native SQL evidence.
function fixture(){
  const a='a'.repeat(64),b='b'.repeat(64),r='TestDDownloadGCFullLifecycleMySQL',ns='sbk-mig-261026123456-abcd',uid='12345678-1234-1234-1234-123456789abc';
  const files=[{path:'backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go',sha256:a,size:1}];
  const source={files,source_sha256:sha(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),stable_copy_verified:true,dependencies_installed:false,production_approved:false};
  const review={kind:'d_gc_full_lifecycle_source_review.v1',reviewer:'A',status:'accepted_exact_lifecycle_candidate_inputs',production_approved:false,files:structuredClone(files),source_sha256:source.source_sha256,capsule_sha256:b};
  const text=[
    `LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=1`,
    `LOCAL_PASS d-download-gc-full-lifecycle-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${a} ddl_sha256=${b}`,
    `=== RUN   ${r}`,
    ...lifecycleCases.flatMap(n=>[`=== RUN   ${r}/${n}`,`    fixture.go:1: FULL_LIFECYCLE_CASE name=${n} actual_sql=yes public_collect=yes authority=synthetic_known_tasks physical=synthetic production=no`]),
    '    fixture.go:1: FULL_LIFECYCLE_TAKEOVER natural_expiry=yes original_deadline_unchanged=yes old_fence_denied=yes new_fence_committed=yes',
    '    fixture.go:1: FULL_LIFECYCLE_HOLDERS first=5 second=6 distinct=yes first_released_second_retained=yes',
    '    fixture.go:1: FULL_LIFECYCLE_POOL pooled_state_preserved=yes public_fresh_distinct=yes temp_permission_denied=yes',
    '    fixture.go:1: FULL_LIFECYCLE_TEMP same_schema_foreign_shadow_preserved=yes fresh_worker_real_group=yes grants_added=no',
    '    fixture.go:1: FULL_LIFECYCLE_DDL holder=7 waiter=8 granted_and_pending=yes outcome=denied_atomic released_then_effect=yes',
    `    fixture.go:1: FULL_LIFECYCLE_PLAN sha256=${a} table_nodes=1 range_indexed=false production_scale_approved=no`,
    `    fixture.go:1: FULL_LIFECYCLE_PLAN sha256=${b} table_nodes=2 range_indexed=true production_scale_approved=no`,
    '    fixture.go:1: FULL_LIFECYCLE_SCALE inert_rows=512 explicit_frame=5000 page_limit=128 invalid129_denied=yes eligible_collected=1 production_scale_approved=no',
    '    fixture.go:1: PASS full_lifecycle_candidate cases=15 actual_sql=yes public_collect=yes old42_full33_cold7_not_recounted=yes production_approval=no',
    `--- PASS: ${r} (12.00s)`,...lifecycleCases.map(n=>`    --- PASS: ${r}/${n} (0.50s)`),'PASS',
    `PASS d-download-gc-full-lifecycle-mysql binary_sha256=${a} inputs_sha256=${b} new_cases=15 public_collect=yes authority=synthetic_known_tasks physical=synthetic old42_full33_cold7_not_recounted=yes production_approval=no namespace=${ns} uid=${uid}`,
    `CLEANED namespace=${ns} uid=${uid}`,'CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True',
    'LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True',
    'LOCAL_CLEANUP config-writer-source-owned=C:/repo/.tmp-d-index-cache-0123456789abcdef0123456789abcdef removed=True',
    'PASS fresh-migration-replay=001..052 applied=52 exact_filenames=yes','gc_full_lifecycle_exit=0',''].join('\n');
  return {text,source,review,ownerAbsent:()=>true};
}
test('complete synthetic parser fixture retains all limits',()=>{const r=receiveLifecycle(fixture());assert.equal(r.cases.length,15);assert.equal(r.production_approved,false);assert.equal(r.production_scale_approved,false);assert.equal(r.remote_cleanup_independently_verified,false);assert.equal(r.ddl_outcome,'denied_atomic');});
const badText=[
  ['missing leaf',s=>s.replace('    --- PASS: TestDDownloadGCFullLifecycleMySQL/killed_after_delete (0.50s)\n','')],
  ['duplicate leaf',s=>s+'    --- PASS: TestDDownloadGCFullLifecycleMySQL/killed_after_delete (0.50s)\n'],
  ['skip',s=>s.replace('--- PASS: TestDDownloadGCFullLifecycleMySQL/killed_after_delete','--- SKIP: TestDDownloadGCFullLifecycleMySQL/killed_after_delete')],
  ['native failure',s=>s+'FAIL\n'],
  ['missing native exit',s=>s.replace('\nPASS\n','\n')],
  ['missing case assertion marker',s=>s.replace('FULL_LIFECYCLE_CASE name=cancel_before_begin','OTHER name=cancel_before_begin')],
  ['same holder ID',s=>s.replace('first=5 second=6','first=5 second=5')],
  ['same DDL waiter ID',s=>s.replace('holder=7 waiter=8','holder=7 waiter=7')],
  ['missing plan',s=>s.replace(/^.*FULL_LIFECYCLE_PLAN.*\n/m,'')],
  ['production-scale claim',s=>s.replaceAll('production_scale_approved=no','production_scale_approved=yes')],
  ['changed physical claim',s=>s.replaceAll('physical=synthetic','physical=production')],
  ['namespace mismatch',s=>s.replace('CLEANED namespace=sbk-mig-261026123456-abcd','CLEANED namespace=sbk-mig-261026123456-abce')],
  ['binary mismatch',s=>s.replace('binary_sha256='+'a'.repeat(64),'binary_sha256='+'c'.repeat(64))],
  ['cleanup pending',s=>s+'CLEANUP_PENDING namespace=x\n'],
  ['outer failure',s=>s.replace('gc_full_lifecycle_exit=0','gc_full_lifecycle_exit=1')],
  ['duplicate root',s=>s+'=== RUN   TestDDownloadGCFullLifecycleMySQL\n'],
];
for(const [name,mutate] of badText)test('reject '+name,()=>{const f=fixture();f.text=mutate(f.text);assert.throws(()=>receiveLifecycle(f));});
for(const [name,mutate] of [
  ['unreviewed source',f=>f.review.files[0].sha256='c'.repeat(64)],
  ['non-A review',f=>f.review.reviewer='D'],
  ['owner remains',f=>f.ownerAbsent=()=>false],
  ['capsule mismatch',f=>f.review.capsule_sha256='c'.repeat(64)],
  ['unstable snapshot',f=>f.source.stable_copy_verified=false],
  ['source digest drift',f=>f.source.files[0].size=2],
])test('reject '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>receiveLifecycle(f));});
