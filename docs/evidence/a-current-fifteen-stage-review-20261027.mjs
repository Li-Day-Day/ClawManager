import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const prefix='docs/evidence/d2-owner-entry-supplement-2d061b75213d45d1af1b29acfda4ee95';
const checker='docs/evidence/d1-current-fifteen-stage-review-20261027.mjs';
const peer='docs/evidence/d1-current-fifteen-stage-reviewed-20261027-2d061.json';
const output='docs/evidence/a-current-fifteen-stage-reviewed-20261027-r1.json';
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return {path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const args=process.argv.slice(2);
assert.equal(args.length,1);assert.ok(['--write','--check'].includes(args[0]));
assert.equal(pin(checker).sha256,'724002d3ee31117c261e22628d182cca6e6c90d23835110ee36294acd7009d9b');
// Replay the reviewed strict validator, including commands, overlay bytes,
// original-name inventory and all scope/helper pins. It only reads files.
const replay=spawnSync(process.execPath,[path.resolve(root,checker),'--check'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
if(replay.error)throw replay.error;
assert.equal(replay.status,0,replay.stderr||replay.stdout);
assert.match(replay.stdout,/CURRENT_FIFTEEN_STAGE_REVIEWED source=4003f0f0 inputs=1718 stages=15 exits=13zero\+2expected/);
const r=json(prefix+'.json'),d=json(peer),manifest=json(r.source);
assert.equal(d.status,'accepted_exact_native_fifteen_stage_supplement_only');
assert.equal(r.kind,'d2_owner_current_baseline_supplement.v1');assert.equal(r.error,null);
const expected='4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964';
assert.equal(sourceDigest(manifest.files),expected);assert.equal(manifest.files.length,1718);
assert.deepEqual(enumerate(root),manifest.files);
assert.equal(fs.existsSync(r.owner),false);assert.equal(path.dirname(r.owner),root);
for(const field of ['frozen_postcheck','owner_removed','Go_started','tests_started'])assert.equal(r[field],true,field);
for(const field of ['actual_mysql','remote_contacted','dependencies_installed','production_approved','current_baseline_accepted'])assert.equal(r[field],false,field);
assert.equal(r.steps.length,15);
for(const [i,s] of r.steps.entries()){
  assert.equal(s.exit_code,i<13?0:1);assert.equal(pin(s.log).sha256,s.sha256);
  if(i>=13){assert.equal(s.attempts.length,1);assert.equal(s.attempts[0].assertion_failure,true);assert.equal(s.attempts[0].known_tool_crash,false);}
}
const gc=validateGoEvents(read(r.steps[0].log).toString('utf8'),'clawreef/internal/systembackupevidence');
assert.deepEqual([...gc].sort(),['TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullLifecycleMySQLSeed','TestDDownloadGCFullProfileMySQLSeed']);
assert.deepEqual(d.packaged_owner_seed_names,d.detached_owner_seed_names);assert.equal(d.packaged_owner_seed_names.length,13);
assert.equal(d.standalone_roots.length,9);assert.equal(d.standalone_pass_events,49);
assert.equal(d.linux_evidence_compile_vet_disabled,true);assert.equal(d.binary_bytes_reinspected_after_cleanup,false);
for(const p of d.artifacts)assert.equal(pin(p.path).sha256,p.sha256,p.path);
const result={
  kind:'a_current_fifteen_stage_independent_review.v1',reviewer:'A1',
  status:'accepted_exact_native_fifteen_stage_supplement_only',
  source_sha256:expected,source_files:manifest.files.length,
  native_receipt:pin(prefix+'.json'),source_manifest:pin(r.source),
  strict_peer_validator:pin(checker),strict_peer_review:pin(peer),
  strict_peer_validator_replayed:true,strict_peer_validator_exit:replay.status,
  strict_peer_stdout:replay.stdout.trim(),
  current_source_bytes_and_set_match:true,scope_and_helper_pins_verified:true,
  native_log_hashes_verified:true,stage_count:15,successful_stages:13,
  expected_assertion_failure_stages:2,GC_seed_names:[...gc].sort(),
  packaged_owner_seed_events:13,detached_owner_seed_events:13,
  standalone_roots:9,standalone_pass_events:49,
  exact_counterexample_overlays_verified:true,
  linux_evidence_compile_vet_disabled:true,linux_binaries_executed:false,
  recorded_binary_hashes_verified:true,binary_bytes_reinspected_after_cleanup:false,
  frozen_source_postcheck_verified:true,owned_build_products_removed:true,
  original_failed_parent_reclassified:false,original_parent_final_postcheck_claimed:false,
  Go_repeated_by_this_review:false,dependencies_installed:false,SSH:false,
  actual_SQL_cases:0,current_baseline_accepted:false,
  formal_GC_operator_source_accepted:false,production_approved:false,whole_goal_complete:false
};
const bytes=JSON.stringify(result,null,2)+'\n';
if(args[0]==='--write')fs.writeFileSync(path.resolve(root,output),bytes,{flag:'wx'});
else assert.equal(read(output).toString('utf8'),bytes);
console.log('A_CURRENT_FIFTEEN_STAGE_ACCEPTED source=4003f0f0 stages=15 exits=13zero+2expected actual_SQL=0 current_baseline=no');
