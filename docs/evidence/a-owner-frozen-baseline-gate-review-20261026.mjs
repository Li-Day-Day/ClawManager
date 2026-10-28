// Independent intake of the frozen-source gate and its native mock regression.
// No Go, SSH, SQL, snapshot mutation or test-result rewriting occurs here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const local=p=>{const q=path.resolve(root,p);assert.ok(q.startsWith(root+path.sep));return q;};
const raw=p=>fs.readFileSync(local(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:path.relative(root,local(p)).replaceAll('\\','/'),sha256:sha(raw(p))});
const check=p=>assert.equal(sha(raw(p.path)),p.sha256,'input drift: '+p.path);
const formalPath='docs/evidence/d-owner-frozen-baseline-gate-fixed-20261026-r2.json',formal=json(formalPath);
assert.equal(formal.status,'future_retest_snapshot_gate_fixed_exact_native_mock_scope');
for(const p of [...formal.implementation,...formal.old_predecessors,formal.native_mock_regression,formal.previous_receipt,...formal.failed_fixture_attempts_preserved,formal.observed_race.source,formal.observed_race.immutable_startup_prefix])check(p);
assert.equal(formal.observed_driver_process.native_exit,0);assert.equal(formal.observed_driver_process.outer_explicit_LASTEXITCODE,0);
assert.equal(formal.A_independent_prior_inline_outer_exit,1);assert.equal(formal.prior_inline_outer_exit_reclassified,false);
const regression=json(formal.native_mock_regression.path);
const independentPath='docs/evidence/a-owner-frozen-gate-independent-20261026.json',independent=json(independentPath);
for(const r of [regression,independent]){
 assert.equal(r.error,null);assert.equal(r.inputs_stable,true);assert.equal(r.owner_removed,true);assert.equal(r.cases.length,14);
 assert.equal(path.dirname(r.owner),root);assert.match(path.basename(r.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(r.owner),false);
 assert.equal(r.real_snapshot_copy_executed,false);assert.equal(r.real_registered_baseline_parser_executed,true);
 assert.equal(r.Go_or_builds_run,false);assert.equal(r.SSH_or_SQL_executed,false);
 for(const c of r.cases){check(c.log);assert.equal(c.runner_owner_absent,true);assert.equal(c.invocation_succeeded,c.expected_mock_dispatch);assert.equal(c.dispatch_mock_calls,Number(c.expected_mock_dispatch));assert.equal(c.validation_mock_calls,Number(c.expected_mock_dispatch));}
}
for(const p of regression.input_pins)check(p);
const caseShape=c=>({name:c.name,snapshot_mutation:c.snapshot_mutation,fault:c.fault,dispatch:c.dispatch_mock_calls,validation:c.validation_mock_calls,events:c.events});
assert.deepEqual(regression.cases.map(caseShape),independent.cases.map(caseShape));
const driver='docs/evidence/d-owner-frozen-gate-regression-20261026.ps1',bytes=raw(driver),text=bytes.toString('utf8');
assert.match(text,/exit 0\s*$/);
const oldPin=independent.input_pins.find(p=>p.path===driver).sha256;
const beforeExit=text.slice(0,text.lastIndexOf('exit 0'));
assert.ok([beforeExit,beforeExit.replace(/\r?\n$/,''),beforeExit.replace(/(?:\r?\n){2}$/,'\n')].some(s=>sha(Buffer.from(s))===oldPin),'success completion code was not the only driver delta');
const wrapper='scripts/system-backup-d-config-writer-validation.ps1',entry='docs/evidence/a-download-owner-role-retest-20261021.ps1';
const w=raw(wrapper).toString('utf8'),e=raw(entry).toString('utf8');
const capture=w.indexOf('$writerSnapshot=New-AConfigProofSourceSnapshot'),gate=w.indexOf('if($RequireReviewedOwnerBaseline){'),dispatch=w.indexOf("& (Join-Path $writerFrozen 'scripts/system-backup-a-evidence-dispatch.test.ps1')");
assert.ok(capture>=0&&gate>capture&&dispatch>gate);
assert.ok(w.slice(gate,dispatch).includes('($writerSnapshot|ConvertTo-Json'));
assert.ok(!w.slice(gate,dispatch).includes('Get-DIndexSourceFiles'));
assert.match(e,/RequireReviewedOwnerBaseline\s*=\s*\$true/);
assert.equal(formal.production_approved,false);
const report={kind:'a_owner_frozen_baseline_gate_independent_review.v1',status:'accepted_exact_future_remote_owner_role_gate_and_mock_regression',production_script_pins:[pin(wrapper),pin(entry)],captured_snapshot_checked_before_dispatch:true,live_tree_not_rescanned_for_frozen_gate:true,local_new_source_preparation_preserved:true,independent_mock_cases:14,independent_outer_exit:1,independent_outer_exit_is_preserved_negative_child_status:true,D_corrected_driver_native_exit:0,only_driver_success_exit_delta_verified:true,actual_Go_SSH_SQL_executed:false,dependencies_installed:false,test_owners_independently_absent:[independent.owner,regression.owner],actual_owner_eleven_accepted:false,bootstrap_consumer_accepted:false,production_approved:false,inputs:[formalPath,formal.native_mock_regression.path,independentPath,'docs/evidence/a-owner-frozen-gate-independent-20261026.txt',driver,'docs/evidence/a-owner-frozen-baseline-gate-review-20261026.mjs'].map(pin)};
const output='docs/evidence/a-owner-frozen-baseline-gate-reviewed-20261026.json';
assert.ok(['--write','--check'].includes(process.argv[2])&&process.argv.length===3);
if(process.argv[2]==='--write')fs.writeFileSync(local(output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});else assert.deepEqual(json(output),report);
console.log('A_FROZEN_BASELINE_GATE_ACCEPTED cases=14 old_inline_outer=1_preserved fixed_native=0 actual_SQL=no');
