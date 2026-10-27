import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const local=p=>{const x=path.resolve(root,p);assert.ok(x.startsWith(root+path.sep));return x;};
const raw=p=>fs.readFileSync(local(p));
const text=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const [input,output,...flags]=process.argv.slice(2);assert.ok(input&&output&&flags.every(x=>x==='--check')&&flags.length<=1);
assert.equal(path.dirname(local(output)),path.join(root,'docs/evidence'));
const id=path.basename(input).match(/^d-bootstrap-entry-linux-([a-f0-9]{32})\.json$/)?.[1];assert.ok(id);
const r=json(input);assert.equal(r.kind,'d_bootstrap_entry_linux_supplement.v1');assert.equal(r.id,id);assert.equal(r.status,'passed_exact_linux_supplement');assert.ok(!r.error&&!r.postcheck_error);
for(const k of ['go_started','precheck','postcheck','cleaned'])assert.equal(r[k],true,k);
for(const k of ['parent_postcheck_retroactively_claimed','combined_acceptance','dependencies_installed','tests_rerun','actual_mysql_executed','production_approved'])assert.equal(r[k],false,k);
assert.equal(r.parent_status,'failed');assert.equal(r.telemetry,'off_owned_directory_verified');assert.ok(r.free_bytes_before>=10*1024**3);
const parentFile='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json',parent=json(parentFile);
assert.equal(r.parent_receipt,parentFile);assert.equal(sha(raw(parentFile)),r.parent_receipt_sha256);assert.equal(r.parent_receipt_sha256,'fb27a21187e66442dc80191279fc225d5c857d8fd7c78891905b20e958ed0c1f');assert.equal(parent.status,'failed');assert.equal(parent.error,'Entry Linux build/compile failed: server');assert.equal(parent.cleaned,true);assert.equal(parent.snapshot_unchanged??null,null);
const owner=path.join(root,'.tmp-d-bootstrap-linux-'+id);assert.equal(fs.existsSync(owner),false);assert.equal(fs.existsSync(path.join(root,'.tmp-d-bootstrap-entry-ae7af3833e1f424f946638b88c7f68d8')),false);
assert.deepEqual(r.files,parent.files);assert.equal(r.input_count,1741);assert.equal(r.recovered_input_count,4);
const recoveryFile='docs/evidence/d2-entry-parent-recovery-20261027.json',recovery=json(recoveryFile);assert.equal(sha(raw(recoveryFile)),r.recovery_receipt_sha256);assert.equal(recovery.parent_receipt_sha256,r.parent_receipt_sha256);assert.equal(recovery.recovered.length,4);
const sourceMap=new Map(parent.files.map(p=>[p.path,p]));assert.equal(sourceMap.size,1741);
for(const p of recovery.recovered){const b=raw(p.artifact),pin=sourceMap.get(p.path);assert.ok(pin);assert.equal(b.length,pin.size);assert.equal(sha(b),pin.sha256);}
const driver='scripts/system-backup-d-bootstrap-entry-linux-supplement.ps1';assert.equal(sha(raw(driver)),r.driver_sha256);
assert.equal(r.prior_parity.id,'9c2f727f86c548a38792cebd423489e7');assert.equal(r.prior_parity.status,'failed');
const priorFile='docs/evidence/a2-reference-capability-native-'+r.prior_parity.id+'.json',prior=json(priorFile);assert.equal(sha(raw(priorFile)),r.prior_parity.receipt_sha256);assert.equal(prior.status,'failed');assert.equal(prior.cleanup,true);assert.equal(fs.existsSync(path.join(root,'.tmp-a-reference-parity-'+r.prior_parity.id)),false);
const expected=[['server','./cmd/server'],['bootstrap','./cmd/system-backup-bootstrap'],['migration-runner','./cmd/system-backup-migrate'],['tagged-evidence-test-compile-only','./internal/systembackupevidence']];
assert.deepEqual(r.linux_steps.map(s=>s.name),expected.map(x=>x[0]));
const logs=[];
for(let i=0;i<expected.length;i++){
 const [name,pkg]=expected[i],s=r.linux_steps[i],binary=path.join(owner,'linux-'+name);
 const args=name==='tagged-evidence-test-compile-only'?['test','-tags','systembackup_mysql','-c','-o',binary,pkg]:['build','-o',binary,pkg];
 assert.deepEqual(s.arguments,args);assert.equal(s.exit_code,0);assert.match(s.binary_sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(s.binary_size)&&s.binary_size>0);assert.equal(s.binary_removed,true);assert.equal(fs.existsSync(binary),false);
 for(const stream of ['stdout','stderr']){const log=input.replace(/\.json$/,'')+'.'+name+'.'+stream+'.txt';raw(log);logs.push(log);}
}
const failedReview='docs/evidence/d-bootstrap-entry-native-rejected-20261027-ae7.json',failure=json(failedReview);assert.equal(failure.parent_receipt,parentFile);assert.equal(failure.status,'rejected_linux_disk_full');assert.equal(failure.frozen_complete_run_accepted,false);assert.equal(failure.final_snapshot_postcheck_completed,false);
for(const p of failure.artifacts)assert.equal(sha(raw(p.path)),p.sha256,'parent failure observation changed '+p.path);
assert.equal(failure.observed_partial_test_events.target.pass_events,164);assert.equal(failure.observed_partial_test_events.full.pass_events,8546);assert.equal(failure.observed_partial_test_events.seeds.pass_events,4);
const files=[input,parentFile,recoveryFile,driver,priorFile,failedReview,...recovery.recovered.map(p=>p.artifact),...logs,'docs/evidence/d1-bootstrap-entry-linux-review-20261027.mjs'];
const result={kind:'d1_bootstrap_entry_linux_supplement_independent_review.v1',status:'passed_exact_frozen_linux_four_only',supplement:input,failed_parent_preserved:parentFile,parent_status:'failed',original_final_postcheck_retroactively_claimed:false,original_complete_run_reclassified:false,source_files:1741,source_sha256:failure.source_sha256,exact_original_input_set_rebuilt:true,recovered_original_inputs:4,supplement_precheck:true,supplement_postcheck:true,linux_steps:r.linux_steps,owner_independently_absent:true,all_run_build_products_removed:true,previous_windows_test_events_retained_as_partial_observations:{targeted:164,full:8546,seeds:4},new_windows_tests_executed:false,whole_current_tree_accepted:false,new_api_materials_or_parser_accepted:false,dedicated_remote_wrapper_executed:false,actual_mysql_executed:false,production_approved:false,dependencies_installed:false,whole_goal_complete:false,artifacts:[...new Set(files)].map(p=>({path:p,sha256:sha(raw(p))}))};
if(flags.includes('--check'))assert.deepEqual(json(output),result);else fs.writeFileSync(local(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('ENTRY_LINUX_FROZEN_REVIEWED inputs=1741 linux=4 source_postcheck=yes cleanup=yes parent_still_failed=yes current_tree_approval=no');
