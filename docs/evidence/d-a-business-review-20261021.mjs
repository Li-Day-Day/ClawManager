import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>b.toString('utf8').replace(/^\uFEFF/,'');
const read=p=>JSON.parse(decode(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=pins=>sha(pins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
const basePath='docs/evidence/d-a-business-review-base-20261021.json',base=read(basePath);
const existing=['capture.go','restore_verify.go'].map(p=>'backend/internal/systembackupbusinessa/'+p);
const test='backend/internal/systembackupbusinessa/d_review_commit_context_test.go',own=[...existing,test];
assert.equal(base.stable_copy_verified,true);assert.equal(digest(base.files),base.source_sha256);
const roots=['TestDReviewABusinessReadCommitBoundary','TestDReviewARestoreMismatchAndCanceledResult'];
const expectedFailures=[roots[0],...['capture_counts','restore_verifier'].flatMap(p=>[roots[0]+'/'+p,roots[0]+'/'+p+'/canceled_commit']),roots[1],roots[1]+'/canceled_mismatch_commit'].sort();
const records={};
for(const stage of ['counterfactual','target','full']){
  const prefix=`docs/evidence/d-a-business-review-20261021-r1-${stage}`;
  const source=read(prefix+'-source.json'),native=read(prefix+'-native.json');
  const events=decode(raw(prefix+'.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(digest(source.files),source.source_sha256);assert.equal(source.files.length,base.files.length+1);
  assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
  assert.equal(source.base_source_sha256,base.source_sha256);
  for(const p of base.files){if(stage!=='counterfactual'&&existing.includes(p.path))continue;assert.deepEqual(source.files.find(q=>q.path===p.path),p,p.path);}
  assert.equal(native.source_sha256,source.source_sha256);assert.equal(native.source_postcheck,true);
  assert.equal(native.default_vet,true);assert.equal(native.dependencies_installed,false);assert.equal(native.remote,false);
  assert.equal(native.exit,stage==='counterfactual'?1:0);assert.equal(decode(raw(prefix+'-stderr.txt')).trim(),'');
  const ran=events.filter(e=>e.Test&&e.Action==='run'),passed=events.filter(e=>e.Test&&e.Action==='pass');
  const failed=events.filter(e=>e.Test&&e.Action==='fail').map(e=>e.Test).sort();
  assert.equal(events.filter(e=>['skip','build-fail'].includes(e.Action)).length,0);
  assert.equal(new Set(ran.map(e=>e.Package+'\0'+e.Test)).size,ran.length);assert.equal(passed.length+failed.length,ran.length);
  assert.equal(events.filter(e=>e.Action==='output'&&/^panic:/.test(e.Output||'')).length,0);
  const selected=ran.filter(e=>roots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
  assert.equal(selected.length,12);
  if(stage==='counterfactual'){
    assert.deepEqual(failed,expectedFailures);assert.equal(passed.length,5);
    for(const p of ['capture_counts','restore_verifier'])for(const mode of ['healthy','commit_error'])assert.ok(passed.some(e=>e.Test===roots[0]+'/'+p+'/'+mode));
    assert.ok(passed.some(e=>e.Test===roots[1]+'/live_mismatch'));
  }else{assert.deepEqual(failed,[]);assert.equal(events.filter(e=>e.Action==='fail').length,0);assert.equal(passed.filter(e=>roots.some(r=>e.Test===r||e.Test.startsWith(r+'/'))).length,12);}
  const packages=events.filter(e=>!e.Test&&e.Action==='pass');
  if(stage==='full')assert.deepEqual(packages.map(e=>e.Package).sort(),['clawreef/internal/systembackupbusinessa','clawreef/internal/systembackupsecurity']);
  records[stage]={source,summary:{stage,source_sha256:source.source_sha256,files:source.files.length,main:ran.filter(e=>!e.Test.includes('/')).length,checks:ran.length,passed:passed.length,failed,exit:native.exit,default_vet:true,source_postcheck:true,packages:packages.map(e=>({package:e.Package,elapsed_seconds:e.Elapsed})),source_manifest:prefix+'-source.json',source_manifest_sha256:sha(raw(prefix+'-source.json')),events_sha256:sha(raw(prefix+'.jsonl')),native_sha256:sha(raw(prefix+'-native.json'))}};
}
assert.equal(records.target.source.source_sha256,records.full.source.source_sha256);
const before=records.counterfactual.source.files,after=records.full.source.files;
assert.deepEqual(before.filter(p=>p.sha256!==after.find(q=>q.path===p.path)?.sha256).map(p=>p.path).sort(),existing.slice().sort());
for(const p of existing){
  assert.equal(sha(raw(p)),after.find(q=>q.path===p).sha256,'published file changed: '+p);
  const type=p.endsWith('/capture.go')?'SourceSnapshot':'CategoryChecks';
  const text=decode(raw(p)),eol=text.includes('\r\n')?'\r\n':'\n';
  const guard=`\tif err := ctx.Err(); err != nil {${eol}\t\treturn ${type}{}, err${eol}\t}${eol}`;
  // An identical entry check exists. Remove only the guard immediately after Commit.
  const commitEnd=text.indexOf(eol+'\t}'+eol,text.indexOf('\tif err := tx.Commit();'))+eol.length+2+eol.length;
  assert.ok(commitEnd>0);assert.equal(text.slice(commitEnd,commitEnd+guard.length),guard);
  assert.equal(sha(text.slice(0,commitEnd)+text.slice(commitEnd+guard.length)),base.files.find(q=>q.path===p).sha256,'changes beyond post-Commit guard: '+p);
}
for(const p of [test,'backend/go.mod','backend/go.sum'])assert.equal(sha(raw(p)),after.find(q=>q.path===p).sha256);
const publicPath='docs/evidence/d-a-public-review-20261021-r1-native.json',publicRun=read(publicPath);
assert.equal(publicRun.source_sha256,records.counterfactual.source.source_sha256);assert.equal(publicRun.source_postcheck,true);
assert.equal(publicRun.dependencies_installed,false);assert.equal(publicRun.remote,false);
const publicEvidence=publicRun.runs.map(run=>{
  const prefix='docs/evidence/d-a-public-review-20261021-r1-'+run.stage,tap=decode(raw(prefix+'.tap')),count=run.stage==='schemas'?4:10;
  assert.equal(run.exit,0);assert.match(tap,new RegExp('^# tests '+count+'\\r?$','m'));assert.match(tap,new RegExp('^# pass '+count+'\\r?$','m'));
  for(const field of ['fail','cancelled','skipped','todo'])assert.match(tap,new RegExp('^# '+field+' 0\\r?$','m'));
  assert.equal(decode(raw(prefix+'-stderr.txt')).trim(),'');
  return {stage:run.stage,checks:count,tap_sha256:sha(raw(prefix+'.tap'))};
});
const correctionPath='docs/evidence/d-six-scope-audit-correction-20261021.json',correction=read(correctionPath);
assert.equal(correction.fixture.all_fifteen_A_policies_unchanged,true);assert.deepEqual(correction.fixture.added_objects,['table:instance_browser_workers']);
const queuePath='docs/evidence/d-owner-review-queue-20261021.json',queue=read(queuePath);
assert.equal(queue.schema_policy_reviews.length,15);
const contextPath='docs/evidence/d-a-business-review-published-context-20261021.json',context=read(contextPath);
assert.equal(context.stable_copy_verified,true);assert.equal(digest(context.files),context.source_sha256);
const changes=after.filter(p=>!context.files.some(q=>p.path===q.path&&p.sha256===q.sha256&&p.size===q.size)).map(p=>p.path);
const additions=context.files.filter(p=>!after.some(q=>p.path===q.path)).map(p=>p.path);
const cleanupPath='docs/evidence/d-a-business-review-cleanup-20261021.json',cleanup=read(cleanupPath);
assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);
assert.equal(cleanup.source_sha256,records.full.source.source_sha256);
assert.equal(path.dirname(path.resolve(cleanup.absolute_owner)).toLowerCase(),root.toLowerCase());
assert.equal(path.basename(cleanup.absolute_owner),'.tmp-d-index-cache-37969f59c7594194bc3d4236179ad8c3');assert.equal(fs.existsSync(cleanup.absolute_owner),false);
const reviewPath='docs/system-backup-d-a-cross-review-20261021.md';
const output='docs/evidence/d-a-business-review-preparation-20261021.json';
const report={kind:'d_a_business_and_public_contract_substantive_review',status:'local_review_and_two_read_completion_corrections',base_source_sha256:base.source_sha256,base_manifest_sha256:sha(raw(basePath)),changes:own,post_commit_guards:2,new_main:2,new_checks:12,runs:Object.values(records).map(r=>r.summary),public_contracts:{native:publicPath,native_sha256:sha(raw(publicPath)),runs:publicEvidence,full_wire_parity_proven:false,online_provider_proven:false},review:{document:reviewPath,sha256:sha(raw(reviewPath)),queue:queuePath,queue_sha256:sha(raw(queuePath)),policy_count:15,public_contract_groups:4,fixture_comparison:correctionPath,fixture_comparison_sha256:sha(raw(correctionPath)),approvals_written:false},published:{source_context_sha256:context.source_sha256,source_context_manifest_sha256:sha(raw(contextPath)),matches_frozen_full:changes.length===0&&additions.length===0,concurrent_changes:changes,concurrent_additions:additions,own_three_files_and_module_match:true},cleanup:{receipt:cleanupPath,sha256:sha(raw(cleanupPath)),removed:true},dependencies_installed:false,remote:false,boundaries:{healthy_commit_error_and_live_mismatch_preserved:true,late_commit_returns_zero_and_context_cause:true,no_commit_retry_or_rollback_claim:true,sql_proof_and_isolation_unchanged:true,old_mysql_receipt_not_expanded:true,real_B_dump_and_target_writer_proven:false,current_global_registry_frozen:false,production_approval:false,original_six_scopes_complete:false}};
if(process.argv.includes('--check')){assert.deepEqual(read(output),report);console.log(`PASS A review: old late results reproduced; target 2/12; full ${report.runs[2].main}/${report.runs[2].checks}; public 14; two guards, published bytes and cleanup`);}
else{fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(output);}
