import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha,decode} from '../../scripts/system-backup-d-gc-full-collect-receiver.mjs';

export const lifecycleCases=['killed_after_delete','holder_exit_before_begin','cancel_before_begin','takeover_after_kill','two_public_holders','foreign_holder_retained','fresh_after_rollback','fresh_after_success','stale_registry_pool_ignored','temp_shadow_other_session','bad_timezone_rejected','lock_wait_restored_to_bound','public_ddl_pending','bounded_batch_plan','oversized_program_rejected'];
const root='TestDDownloadGCFullLifecycleMySQL';
const one=(text,re,label)=>{const m=[...text.matchAll(re)];assert.equal(m.length,1,label);return m[0];};
const digest=files=>sha(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');
const logPrefix='^[ \\t]+(?:[^ \\t\\r\\n]+\\.go:\\d+: )?';
const witness=(text,pattern,label)=>one(text,new RegExp(logPrefix+pattern+'\\r?$','gm'),label);

export function receiveLifecycle({text,source,review,ownerAbsent}) {
  assert.equal(review.kind,'d_gc_full_lifecycle_source_review.v1');
  assert.equal(review.reviewer,'A');
  assert.equal(review.status,'accepted_exact_lifecycle_candidate_inputs');
  assert.equal(review.production_approved,false);
  assert.equal(source.stable_copy_verified,true);
  assert.equal(source.dependencies_installed,false);
  assert.equal(source.production_approved,false);
  assert.equal(source.source_sha256,digest(source.files));
  assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
  for(const p of source.files){assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);}
  assert.deepEqual(source.files,review.files,'source differs from exact A-reviewed inputs');
  assert.equal(source.source_sha256,review.source_sha256);
  assert.ok(source.files.some(p=>p.path==='backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go'));
  const marker=one(text,/^LOCAL_SOURCE config-writer-frozen=yes source_sha256=([a-f0-9]{64}) files=(\d+)\r?$/gm,'source');
  assert.equal(marker[1],source.source_sha256);assert.equal(Number(marker[2]),source.files.length);
  const phase=one(text,/^PASS d-download-gc-full-lifecycle-mysql binary_sha256=([a-f0-9]{64}) inputs_sha256=([a-f0-9]{64}) new_cases=15 public_collect=yes authority=synthetic_known_tasks physical=synthetic old42_full33_cold7_not_recounted=yes production_approval=no namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})\r?$/gm,'candidate phase');
  const build=one(text,/^LOCAL_PASS d-download-gc-full-lifecycle-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})\r?$/gm,'build');
  assert.equal(build[1],phase[1]);assert.equal(build[2],phase[2]);assert.equal(phase[2],review.capsule_sha256);
  const start=one(text,new RegExp('^=== RUN\\s+'+root+'\\r?$','gm'),'root run');
  const end=one(text,new RegExp('^--- PASS: '+root+' \\([0-9.]+s\\)\\r?$','gm'),'root pass');
  assert.ok(start.index<end.index&&end.index<phase.index&&build.index<start.index);
  const native=text.slice(start.index,phase.index);
  for(const prefix of ['^=== RUN\\s+','^\\s+--- PASS: ']) {
    const ending=prefix.includes('PASS')?' \\([0-9.]+s\\)':'',re=new RegExp(prefix+root+'/(\\S+)'+ending+'\\r?$','gm');
    assert.deepEqual([...native.matchAll(re)].map(m=>m[1]),lifecycleCases,'exact ordered native cases');
    assert.deepEqual([...text.matchAll(re)].map(m=>m[1]),lifecycleCases,'no out-of-boundary cases');
  }
  assert.doesNotMatch(text,/^\s*--- (?:FAIL|SKIP):|^FAIL\r?$|panic:|fatal error:/m);
  one(native,/^PASS\r?$/gm,'native binary exit');
  const names=[...native.matchAll(new RegExp(logPrefix+'FULL_LIFECYCLE_CASE name=(\\S+) actual_sql=yes public_collect=yes authority=synthetic_known_tasks physical=synthetic production=no\\r?$','gm'))].map(m=>m[1]);
  assert.deepEqual(names,lifecycleCases,'assertion completion markers');
  witness(native,'PASS full_lifecycle_candidate cases=15 actual_sql=yes public_collect=yes old42_full33_cold7_not_recounted=yes production_approval=no','scope');
  witness(native,'FULL_LIFECYCLE_TAKEOVER natural_expiry=yes original_deadline_unchanged=yes old_fence_denied=yes new_fence_committed=yes','takeover');
  const holders=witness(native,'FULL_LIFECYCLE_HOLDERS first=([1-9][0-9]*) second=([1-9][0-9]*) distinct=yes first_released_second_retained=yes','holder IDs');
  assert.notEqual(holders[1],holders[2]);
  witness(native,'FULL_LIFECYCLE_POOL pooled_state_preserved=yes public_fresh_distinct=yes temp_permission_denied=yes','pool');
  witness(native,'FULL_LIFECYCLE_TEMP same_schema_foreign_shadow_preserved=yes fresh_worker_real_group=yes grants_added=no','temporary shadow');
  const ddl=witness(native,'FULL_LIFECYCLE_DDL holder=([1-9][0-9]*) waiter=([1-9][0-9]*) granted_and_pending=yes outcome=(committed|denied_atomic) released_then_effect=yes','DDL');
  assert.notEqual(ddl[1],ddl[2]);
  const plans=[...native.matchAll(new RegExp(logPrefix+'FULL_LIFECYCLE_PLAN sha256=([a-f0-9]{64}) table_nodes=([1-9][0-9]*) range_indexed=(true|false) production_scale_approved=no\\r?$','gm'))];
  assert.equal(plans.length,2,'both batch and actor plans');
  witness(native,'FULL_LIFECYCLE_SCALE inert_rows=512 explicit_frame=5000 page_limit=128 invalid129_denied=yes eligible_collected=1 production_scale_approved=no','bounded batch');
  assert.doesNotMatch(text,/^CLEANUP_PENDING|^CLEANUP_SKIPPED/m);
  const cleanup=one(text,/^CLEANED namespace=(sbk-mig-[0-9]{12}-[a-f0-9]{4}) uid=([a-f0-9-]{36})\r?$/gm,'namespace cleanup');
  assert.equal(cleanup[1],phase[3]);assert.equal(cleanup[2],phase[4]);assert.ok(cleanup.index>phase.index);
  for(const s of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'])one(text,new RegExp('^'+s+'\\r?$','gm'),s);
  const owner=one(text,/^LOCAL_CLEANUP config-writer-source-owned=(.+[\\/]\.tmp-d-index-cache-[a-f0-9]{32}) removed=True\r?$/gm,'local source cleanup')[1];
  assert.equal(ownerAbsent(owner),true);
  one(text,/^gc_full_lifecycle_exit=0\r?$/gm,'outer exit');
  assert.match(text,/^PASS fresh-migration-replay=001\.\.\d+ applied=\d+ exact_filenames=yes/m);
  return {kind:'d_gc_full_lifecycle_actual_candidate_receipt.v1',status:'native_15_candidate_cases_received_not_production',source_sha256:source.source_sha256,binary_sha256:phase[1],capsule_sha256:phase[2],cases:lifecycleCases,actual_SQL:true,failed:0,skipped:0,namespace:phase[3],namespace_uid:phase[4],local_owner:owner,local_owner_absent:true,remote_cleanup_reported:true,remote_cleanup_independently_verified:false,ddl_outcome:ddl[3],plan_probes:plans.map(p=>({sha256:p[1],nodes:Number(p[2]),range_indexed:p[3]==='true'})),production_scale_approved:false,domain_authority:'synthetic_known_tasks',physical_report:'synthetic',old42_full33_cold7_recounted:false,production_approved:false,complete_real_domain_authority:false,twelve_groups_complete:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),o={};
  for(let i=0;i<args.length;i+=2){assert.ok(['--log','--source','--review','--write'].includes(args[i]));assert.ok(args[i+1]);assert.equal(o[args[i]],undefined);o[args[i]]=path.resolve(args[i+1]);}
  for(const k of ['--log','--source','--review'])assert.ok(o[k],k);
  const evidence=import.meta.dirname,repo=path.resolve(evidence,'../..');
  for(const p of Object.values(o))assert.equal(path.dirname(p),evidence);
  const result=receiveLifecycle({text:decode(fs.readFileSync(o['--log'])),source:JSON.parse(decode(fs.readFileSync(o['--source']))),review:JSON.parse(decode(fs.readFileSync(o['--review']))),ownerAbsent:owner=>{assert.equal(path.dirname(path.resolve(owner)),repo);return !fs.existsSync(owner);}});
  result.input_pins=Object.fromEntries(['--log','--source','--review'].map(k=>[k,{path:o[k],sha256:sha(fs.readFileSync(o[k]))}]));
  if(o['--write'])fs.writeFileSync(o['--write'],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify(result)+'\n');
}
