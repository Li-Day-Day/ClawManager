// Source/parser compatibility only. Actual acceptance is separately pinned.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const before='docs/evidence/a-owner-footer-locale-receiver-before-20261027.mjs.txt';
const receiver='docs/evidence/a-download-owners-actual-review-20261020.mjs';
const old=read(before).toString('utf8').replaceAll('\r\n','\n'),code=read(receiver).toString('utf8').replaceAll('\r\n','\n');
const oldLine=old.split('\n').find(s=>s.includes("'transcript_completed'"));assert.ok(oldLine);
const start=code.indexOf('  const localizedFooter = '),end=code.indexOf('\n',code.indexOf("'transcript_completed'",start));assert.ok(start>0&&end>start);
assert.equal(code.slice(0,start)+oldLine+code.slice(end),old,'Unrelated receiver logic changed');
const tests='docs/evidence/a-owner-footer-locale-parser-tests-20261027.txt',testText=read(tests).toString('utf8');
const controls=testText.split(/\r?\n/).filter(s=>s.startsWith('{')).map(JSON.parse);
assert.deepEqual(controls.map(x=>x.parser_checks).sort((a,b)=>a-b),[64,72]);
assert.ok(controls.every(x=>x.status==='PASS'&&x.actual_mysql_cases_executed===0&&x.actual_acceptance_receipts_written===0));
assert.match(testText,/tests 2/);assert.match(testText,/fail 0/);
const accepted='docs/evidence/a-download-owners-mysql-accepted-sbk-mig-261027083544-2360.json',a=json(accepted);
assert.equal(a.status,'accepted_exact_eleven_task_owner_cases_only');assert.equal(a.actual_case_count,11);assert.equal(a.checks_passed,161);
assert.equal(a.reviewer_sha256,pin(receiver).sha256);assert.equal(a.log_sha256,pin(a.log).sha256);assert.equal(a.source_manifest_sha256,pin(a.source).sha256);
assert.equal(a.actual_mysql,true);assert.equal(a.production_approved,false);assert.equal(a.catalog.file_count,96);assert.equal(a.cleaned_databases.length,11);
assert.equal(fs.existsSync(a.local_source_owner),false);assert.deepEqual(a.current_pinned_drift,[]);
const oldFailure='docs/evidence/a-owner-footer-locale-old-failure-rejection-20261027.txt',failed=json(oldFailure);
assert.equal(failed.status,'rejected');assert.equal(failed.code,'no_test_failure_skip_panic_or_pending_cleanup');assert.equal(failed.receipt_written,false);
const result={kind:'a_owner_transcript_locale_compatibility_review.v1',status:'locale_fix_regressions_and_exact_actual_owner_intake_passed',
 before:pin(before),receiver:pin(receiver),tests:pin(tests),parser_controls:136,synthetic_controls_are_not_actual_SQL:true,
 receiver_delta:'Only add anchored Chinese PowerShell 7 terminal footer with stars, exact fourteen-digit end time and end-of-log. Existing English/Windows behavior and all SQL/source/inventory/cleanup gates unchanged.',
 historical_synthetic_fixture:'Old INPLACE test reads its retained 14522-byte/19a5705a... archive, verified against its original source manifest; no fabricated current test bytes.',
 actual_acceptance:pin(accepted),actual_cases:11,actual_checks:161,old_failed_SQL_run_still_rejected:pin(oldFailure),
 SQL_rerun_for_locale_fix:false,original_transcript_edited:false,Go_started:false,dependencies_installed:false,production_approved:false,whole_goal_complete:false};
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-owner-footer-locale-reviewed-20261027.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
console.log(JSON.stringify({status:result.status,controls:136,actual_cases:11,actual_checks:161,old_failed_run_accepted:false}));
