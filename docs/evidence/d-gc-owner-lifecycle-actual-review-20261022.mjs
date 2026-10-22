import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../..');
const prefix = 'docs/evidence/d-download-gc-owner-lifecycle-remote-20261022-155741-ad6ff1fd';
const output = 'docs/evidence/d-gc-owner-lifecycle-actual-accepted-20261022.json';
const raw = file => fs.readFileSync(path.join(root, file));
const decode = bytes => (bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^\uFEFF/, '');
const json = file => JSON.parse(decode(raw(file)));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pin = file => ({ path: file, size: raw(file).length, sha256: sha(raw(file)) });
const text = decode(raw(prefix + '.txt'));
const source = json(prefix + '-source.json');
assert.equal(source.source_sha256, '31353f64be59645bcbee973d238b8754176faa4b5e198d7f159b7c3c1631bd7f');
assert.equal(sha(source.files.map(file => file.path + '\0' + file.sha256 + '\0' + file.size).join('\n') + '\n'), source.source_sha256);
assert.equal(new Set(source.files.map(file => file.path)).size, source.files.length);
assert.equal(source.stable_copy_verified, true);
assert.equal(source.dependencies_installed, false);
assert.equal(source.production_approved, false);
assert.ok(text.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=${source.files.length}`));
const repaired = json('docs/evidence/d-gc-owner-cancel-repair-20261022.json');
const fileMap = new Map(source.files.map(file => [file.path, file]));
for (const file of repaired.local.current_critical_pins) {
  assert.deepEqual(fileMap.get(file.path), file, 'remote source differs from locally repaired input: ' + file.path);
  assert.deepEqual(pin(file.path), file, 'current critical bytes differ: ' + file.path);
}
const ddl = ['table_create','table_alter','table_drop','table_rename','incoming_foreign_key','procedure_create','procedure_alter','procedure_drop','function_create','function_alter','function_drop','trigger_create','trigger_drop','event_create','event_alter','event_drop','view_create','view_alter','view_algorithm','view_drop','account_create','account_alter','account_drop','account_grant','account_revoke'];
const control = ['privilege_deny','transaction_commit','transaction_rollback','unlock_no_commit','legal_dml','multiple_holders','killed_holder','pool_reuse','temporary_shadow_and_fresh_session'];
const lifecycle = ['known_commit_unlock','known_commit_discard','known_rollback_discard','commit_reply_lost','rollback_reply_lost','unlock_reply_lost','canceled_holder','killed_holder'];
const start = /^=== RUN\s+TestDDownloadGCFreezeMySQL\r?$/m.exec(text);
assert.ok(start);
const phase = 'PASS d-download-gc-freeze-mysql ';
const end = text.indexOf(phase, start.index);
assert.ok(end > start.index);
const remote = text.slice(start.index, end);
assert.doesNotMatch(remote, /^\s*--- (?:FAIL|SKIP):|^FAIL\r?$/m);
const roots = ['TestDDownloadGCFreezeMySQL','TestDDownloadGCOwnerLifecycleMySQL'];
const rootTimes = {};
for (const [index, expected] of [[0, [...ddl, ...control]], [1, lifecycle]]) {
  const name = roots[index];
  const ran = [...remote.matchAll(new RegExp('^=== RUN\\s+' + name + '\\/(\\S+)\\r?$', 'gm'))].map(match => match[1]);
  const passed = [...remote.matchAll(new RegExp('^\\s+--- PASS: ' + name + '\\/(\\S+) ', 'gm'))].map(match => match[1]);
  assert.deepEqual(ran, expected); assert.deepEqual(passed, expected);
  const parent = [...remote.matchAll(new RegExp('^--- PASS: ' + name + ' \\(([0-9.]+)s\\)\\r?$', 'gm'))];
  assert.equal(parent.length, 1); rootTimes[name] = Number(parent[0][1]);
}
assert.deepEqual([...remote.matchAll(/^=== RUN\s+(Test\w+)\r?$/gm)].map(match => match[1]), roots);
assert.equal((remote.match(/^PASS\r?$/gm) || []).length, 1);
const waits = [...remote.matchAll(/FREEZE_WAIT holder_connection=(\d+) waiter_connection=(\d+) holder_thread=(\d+) waiter_thread=(\d+) holder=SHARED\/EXPLICIT\/GRANTED waiter=INTENTION_EXCLUSIVE\/PENDING case=(\w+)/g)].map(match => ({ case:match[5], holder_connection:Number(match[1]), waiter_connection:Number(match[2]), holder_thread:Number(match[3]), waiter_thread:Number(match[4]) }));
assert.deepEqual(waits.map(item => item.case), ddl);
for (const item of waits) {
  for (const key of ['holder_connection','waiter_connection','holder_thread','waiter_thread']) assert.ok(item[key] > 0);
  assert.notEqual(item.holder_connection, item.waiter_connection); assert.notEqual(item.holder_thread, item.waiter_thread);
}
const held = [...remote.matchAll(/OWNER_LIFECYCLE_HELD case=(\w+) connection=(\d+) thread=(\d+) holder=SHARED\/EXPLICIT\/GRANTED/g)].map(match => ({case:match[1], connection:Number(match[2]), thread:Number(match[3])}));
const outcomes = [...remote.matchAll(/OWNER_LIFECYCLE case=(\w+) connection=(\d+) thread=(\d+) commit=(\w+) rollback=(\w+) unlock=(\w+) wire_ok_dropped=(true|false) canary=(\d+) original_ticket_absent=yes fresh_connection=(\d+) release_wait=(\S+) release_budget=(\d+)s/g)].map(match => ({case:match[1], connection:Number(match[2]), thread:Number(match[3]), commit:match[4], rollback:match[5], unlock:match[6], wire_ok_dropped:match[7]==='true', canary:Number(match[8]), fresh_connection:Number(match[9]), release_wait:match[10], release_budget_seconds:Number(match[11])}));
assert.deepEqual(held.map(item => item.case), lifecycle); assert.deepEqual(outcomes.map(item => item.case), lifecycle);
const expected = [
  ['known','not_attempted','known',false,101], ['known','not_attempted','not_attempted',false,102],
  ['not_attempted','known','not_attempted',false,0], ['unknown','not_attempted','not_attempted',true,104],
  ['not_attempted','unknown','not_attempted',true,0], ['known','not_attempted','unknown',true,106],
  ['not_attempted','unknown','not_attempted',false,0], ['not_attempted','unknown','not_attempted',false,0],
];
for (const [index, item] of outcomes.entries()) {
  assert.equal(item.connection, held[index].connection); assert.equal(item.thread, held[index].thread);
  assert.ok(item.connection > 0 && item.thread > 0 && item.fresh_connection > 0); assert.notEqual(item.connection,item.fresh_connection);
  assert.deepEqual([item.commit,item.rollback,item.unlock,item.wire_ok_dropped,item.canary],expected[index]);
  assert.equal(item.release_budget_seconds,item.case==='canceled_holder'?40:5);
  // This Windows capture decoded Go's UTF-8 micro sign as GBK. Preserve the
  // original text and record the exact, reproducible unit repair separately.
  assert.equal(new TextDecoder('gbk', {fatal:true}).decode(Buffer.from('µ','utf8')), '碌');
  item.release_wait_normalized = item.release_wait.replace(/碌s$/, 'µs');
  item.unit_encoding_repaired = item.release_wait_normalized !== item.release_wait;
  const duration = /^([0-9]+(?:\.[0-9]+)?)(ns|us|µs|μs|ms|s)$/.exec(item.release_wait_normalized);
  assert.ok(duration, 'unknown release duration format');
  const seconds=Number(duration[1])*({ns:1e-9,us:1e-6,'µs':1e-6,'μs':1e-6,ms:1e-3,s:1}[duration[2]]);
  assert.ok(seconds >= 0 && seconds <= item.release_budget_seconds);
}
assert.equal((remote.match(/FREEZE_FIXTURE mysql=8\.4\.8 formal_migrations=96 synthetic_accounts=yes production_approval=no/g)||[]).length, 2);
const binary = 'c48a38797ce39ab65ed371e91b75be5110020c510d746cd89cfd185233c8f272';
const inputs = 'd9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0';
assert.equal(fileMap.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json').sha256, inputs);
assert.ok(text.includes(`LOCAL_PASS d-download-gc-freeze-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${binary} ddl_sha256=${inputs}`));
assert.ok(text.includes(`${phase}binary_sha256=${binary} inputs_sha256=${inputs} new_cases=42 prerequisite_cases=34 lifecycle_cases=8 component=backup-lock-prerequisites-and-owner-lifecycle freeze_adapter=not_wired scope=synthetic full_gc=not_run role_approval=no human_mfa=no provider_read=no production_approval=no`));
assert.match(text,/^PASS fresh-migration-replay=001\.\.081 applied=96 exact_filenames=yes/m);
assert.ok(text.includes('catalog_sha256=0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe'));
assert.match(text.trimEnd(),/download_gc_owner_lifecycle_exit=0$/);
assert.doesNotMatch(text,/^CLEANUP_PENDING/m);
const namespace='sbk-mig-261022090541-3520', uid='a34978ab-85b8-4351-be8b-a2a76c72d01d';
assert.ok(text.includes(`RUN namespace=${namespace} uid=${uid} `));
assert.ok(text.includes(`CLEANED namespace=${namespace} uid=${uid}`));
for (const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True']) assert.ok(text.includes(marker));
const owner=path.join(root,'.tmp-d-index-cache-8d328c9da08b4c2facd2e8d5c2a6d613');
assert.ok(text.includes('LOCAL_OWNER config-writer-source='+owner));
assert.ok(text.includes('LOCAL_CLEANUP config-writer-source-owned='+owner+' removed=True')); assert.equal(fs.existsSync(owner),false);
const result={
  kind:'d_gc_owner_lifecycle_actual_acceptance.v1', status:'actual_mysql_42_of_42_accepted_prerequisites_and_owner_lifecycle_only',
  log:pin(prefix+'.txt'), source_manifest:pin(prefix+'-source.json'), source_sha256:source.source_sha256, source_files:source.files.length,
  repaired_input_receipt:pin('docs/evidence/d-gc-owner-cancel-repair-20261022.json'), critical_inputs:repaired.local.current_critical_pins,
  actual:{mysql:'8.4.8',migrations:96,replay:'001..081',binary_sha256:binary,inputs_sha256:inputs,prerequisite_cases:[...ddl,...control],lifecycle_cases:lifecycle,passed:42,failed:0,skipped:0,parent_seconds:rootTimes,ddl_wait_witnesses:waits,owner_outcomes:outcomes,exit:0},
  cleanup:{namespace,uid,namespace_and_remote_scratch_reported:true,local_cache_reported:true,exact_outer_owner:owner,outer_owner_independently_absent:true,remote_cleanup_independently_checked:false},
  boundaries:{synthetic_fixture:true,freeze_adapter_wired:false,full_gc:false,role_approval:false,human_mfa:false,provider_read:false,production_approval:false,reviewer_remote_run:false,current_whole_tree_tested:false,twelve_protocol_groups_complete:false},
};
if(process.argv.includes('--check')) assert.deepEqual(json(output),result);
else { assert.ok(process.argv.includes('--write')); fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'}); }
console.log('D_GC_ACTUAL_ACCEPTED cases=42 ddl_witnesses=25 lifecycle=8 exit=0 full_gc=no production=no');
