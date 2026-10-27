import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {loadReviewedOwnerBaseline} from './a-download-owners-actual-review-20261020.mjs';
import {enumerate} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const text=p=>read(p).toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)};};
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));assert.equal(extra.length,0);
const beforeName='docs/evidence/a-owner-current-baseline-registration-before-20261027.mjs.txt';
const receiver='docs/evidence/a-download-owners-actual-review-20261020.mjs';
assert.equal(pin(beforeName).sha256,'69dfb9d6c0d43115aa21825134e9217554dc8c555c49e01a4cee06478bc62c18');
const before=text(beforeName),at=before.indexOf('\n  ];\n  const ordinary =');assert.ok(at>0);assert.equal(before.indexOf('\n  ];\n  const ordinary =',at+1),-1);
const addition=`
    {sourcePath: 'docs/evidence/a-owner-current-reviewed-source-20261027.json',
      eventsPath: 'docs/evidence/a-owner-current-native-20261027.jsonl',
      // Original complete 4003 native owner events: all 5190 historical names
      // retained. Exact metrics and affected tagged contexts have separate
      // stable native supplements; this does not claim a new ordinary rerun.
      sourcePin: 'a115790cd1b8eaf1ffc92d2ae9b30784b4d4cd088568c1116bf53f6c6e6b7c8a',
      eventsPin: '69674bc9b805b89945066131caa87c1e5033d0a0a1cd98f516b0a4a8dcd9d65b',
      acceptance: 'docs/evidence/a-owner-current-local-accepted-20261027.json',
      acceptancePin: 'e5117c2d438d9ec6f9b3d62243601e43e78796faf33720490a57a6b485dcb46c'}`;
assert.equal(text(receiver),before.slice(0,at)+','+addition+before.slice(at),'registration must only append the exact reviewed baseline definition');
const sourceName='docs/evidence/a-owner-current-reviewed-source-20261027.json',s=json(sourceName);
const selected=loadReviewedOwnerBaseline(read(sourceName));assert.equal(selected.baselineSource.source_sha256,s.source_sha256);
const pass=selected.baselineEvents.filter(e=>e.Test&&e.Action==='pass');assert.equal(pass.length,5530);assert.equal(pass.filter(e=>!e.Test.includes('/')).length,703);
const historicalName='docs/evidence/a-owner-final-source-20261026.json',historical=loadReviewedOwnerBaseline(read(historicalName));
assert.equal(historical.baselineSource.source_sha256,'2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0');
assert.equal(historical.baselineEvents.filter(e=>e.Test&&e.Action==='pass').length,5190);
const supportName='docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json',support=json(supportName);
assert.equal(support.status,'complete_exact_current_input_composition_with_source_only_PromQL_preparer');
assert.equal(support.source_sha256,'6bf973bd11709b14fa04c13175aadfbd126020be3a10a8c514596b5dd29cb9ca');
assert.deepEqual(support.native_owner_baseline_source,pin(sourceName));assert.equal(support.only_added_inputs.length,2);
const ordinary=files=>files.filter(p=>/^(backend|contracts)\//.test(p.path));
const current=enumerate(root);assert.deepEqual(current,support.files);assert.deepEqual(ordinary(current),ordinary(s.files));
const logName='docs/evidence/a-owner-current-registration-and-receiver-tests-20261027.txt',log=text(logName);
for(const key of ['tests 25','pass 25','fail 0','cancelled 0','skipped 0'])assert.match(log,new RegExp('^ℹ '+key+'\\r?$','m'));
const parser=log.split(/\r?\n/).filter(l=>l.startsWith('{"status":"PASS"')).map(JSON.parse);
assert.deepEqual(parser.map(p=>p.parser_checks).sort((a,b)=>a-b),[64,67]);
for(const p of parser){assert.equal(p.actual_mysql_cases_executed,0);assert.equal(p.actual_acceptance_receipts_written,0);assert.equal(p.test_build_artifacts_created,false);}
const gates=['docs/evidence/a-owner-current-preflight-registered-20261027.json','docs/evidence/a-owner-current-worktree-preflight-ready-20261027.json'];
for(const name of gates){const p=json(name);assert.equal(p.status,'ready_for_original_snapshot_gate');assert.equal(p.reviewed_source_sha256,s.source_sha256);assert.equal(p.tests_started,false);assert.equal(p.actual_sql,false);}
const result={kind:'a_owner_current_baseline_registration_review.v1',reviewer:'A1',
 status:'current_owner_baseline_registered_and_original_snapshot_preflight_ready',
 source:pin(sourceName),source_sha256:s.source_sha256,source_files:s.files.length,
 current_complete_source:pin(supportName),current_complete_source_sha256:support.source_sha256,current_complete_source_files:1720,
 baseline_scope:'Exact backend/contracts ordinary inventory; the two non-owner PromQL preparation inputs have their own explicit source/mock review.',
 receiver_before:pin(beforeName),receiver_after:pin(receiver),only_exact_definition_appended:true,
 all_historical_definitions_and_parser_bytes_preserved:true,current_owner_roots:703,current_owner_pass_events:5530,
 original_5190_inventory_remains_separately_registered:true,
 regression_log:pin(logName),Node_tests:25,Node_passed:25,Node_failed:0,
 synthetic_actual_receiver_parser_checks:131,synthetic_actual_receiver_counts:[64,67],
 preflight_outputs:gates.map(pin),actual_current_byte_and_set_enumeration_verified:true,
 tests_or_SSH_started_by_preflight:false,actual_SQL_cases_executed:0,actual_SQL_acceptance_receipts_created:0,
 dependencies_installed:false,test_build_artifacts_created:false,
 remote_owner_eleven_still_requires_actual_receipt:true,metrics_runtime_collector_and_PromQL_proven:false,
 bootstrap_27_slots_cleared:false,production_approved:false,whole_goal_complete:false};
const output='docs/evidence/a-owner-current-baseline-registered-reviewed-20261027.json',encoded=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.resolve(root,output),encoded,{flag:'wx'});else assert.equal(text(output),encoded);
console.log('A_CURRENT_OWNER_BASELINE_REGISTERED roots=703 events=5530 Node=25/25 parser=131 preflight=ready SQL=not_run');
