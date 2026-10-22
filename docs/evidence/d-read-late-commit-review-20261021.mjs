import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>b.toString('utf8').replace(/^\uFEFF/,'');
const read=p=>JSON.parse(decode(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=pins=>sha(pins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
const basePath='docs/evidence/d-read-late-commit-base-20261021.json',base=read(basePath);
const existing=['config_list.go','config_snapshot.go','operation_detail.go','operation_list.go','overview_control.go','task_detail_base.go','task_pages.go'].map(p=>'backend/internal/systembackupread/'+p);
const newPath='backend/internal/systembackupread/read_commit_context_test.go',own=[...existing,newPath];
assert.equal(base.stable_copy_verified,true);assert.equal(digest(base.files),base.source_sha256);
const records={};
for(const stage of ['counterfactual','target','full']){
  const prefix=`docs/evidence/d-read-late-commit-20261021-r2-${stage}`;
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
  assert.equal(new Set(ran.map(e=>e.Package+'\0'+e.Test)).size,ran.length);
  assert.equal(passed.length+failed.length,ran.length);
  assert.equal(events.filter(e=>e.Action==='output'&&/^panic:/.test(e.Output||'')).length,0);
  const newChecks=ran.filter(e=>e.Test==='TestReadCommitContextBoundary'||e.Test.startsWith('TestReadCommitContextBoundary/'));
  assert.equal(newChecks.length,161);
  const canceled=newChecks.filter(e=>e.Test.endsWith('/canceled_in_commit'));
  assert.equal(canceled.length,40);
  if(stage==='counterfactual'){
    const leaves=canceled.filter(e=>!e.Test.includes('/config_backfill_control/')).map(e=>e.Test);
    assert.equal(leaves.length,39);
    assert.deepEqual(failed,[...leaves,...leaves.map(n=>n.slice(0,n.lastIndexOf('/'))),'TestReadCommitContextBoundary'].sort());
    assert.equal(passed.filter(e=>e.Test.endsWith('/healthy')).length,40);
    assert.equal(passed.filter(e=>e.Test.endsWith('/commit_error')).length,40);
    assert.equal(passed.filter(e=>e.Test==='TestReadCommitContextBoundary/config_backfill_control/canceled_in_commit').length,1);
  }else{
    assert.deepEqual(failed,[]);assert.equal(events.filter(e=>e.Action==='fail').length,0);
    assert.equal(passed.filter(e=>e.Test==='TestReadCommitContextBoundary'||e.Test.startsWith('TestReadCommitContextBoundary/')).length,161);
  }
  const packages=events.filter(e=>!e.Test&&e.Action==='pass');
  if(stage==='full')assert.deepEqual(packages.map(e=>e.Package).sort(),['clawreef/internal/systembackupread','clawreef/internal/systembackupsecurity']);
  records[stage]={source,summary:{stage,source_sha256:source.source_sha256,files:source.files.length,main:ran.filter(e=>!e.Test.includes('/')).length,checks:ran.length,passed:passed.length,failed,exit:native.exit,default_vet:true,source_postcheck:true,packages:packages.map(e=>({package:e.Package,elapsed_seconds:e.Elapsed})),source_manifest:prefix+'-source.json',source_manifest_sha256:sha(raw(prefix+'-source.json')),events_sha256:sha(raw(prefix+'.jsonl')),native_sha256:sha(raw(prefix+'-native.json'))}};
}
assert.equal(records.target.source.source_sha256,records.full.source.source_sha256);
const initialPrefix='docs/evidence/d-read-late-commit-20261021-counterfactual';
const initial=read(initialPrefix+'-source.json'),initialNative=read(initialPrefix+'-native.json');
const terminationPath='docs/evidence/d-read-late-commit-fixture-termination-20261021.json',termination=read(terminationPath);
assert.equal(initialNative.exit,1);assert.equal(initialNative.source_postcheck,true);
assert.equal(digest(initial.files),initial.source_sha256);
assert.deepEqual(initial.files.filter(p=>p.sha256!==records.counterfactual.source.files.find(q=>q.path===p.path)?.sha256).map(p=>p.path),[newPath]);
assert.equal(termination.terminated_owned_process,true);assert.equal(termination.remote,false);
assert.equal(termination.pid,30724);assert.equal(path.basename(termination.owner),'.tmp-d-index-cache-0af4f725101940e0927331237c9303de');
assert.ok(termination.executable.toLowerCase().startsWith((termination.owner+'\\tmp\\').toLowerCase()));
const before=records.counterfactual.source.files,after=records.full.source.files;
assert.equal(before.find(p=>p.path===newPath).sha256,after.find(p=>p.path===newPath).sha256);
assert.deepEqual(before.filter(p=>p.sha256!==after.find(q=>q.path===p.path)?.sha256).map(p=>p.path).sort(),existing.slice().sort());
let guards=0;
for(const p of existing){
  assert.equal(sha(raw(p)),after.find(q=>q.path===p).sha256,'published file changed: '+p);
  let count=0;
  const reversed=decode(raw(p)).replace(/if err (:=|=) tx\.Commit\(\); err != nil \|\| ctx\.Err\(\) != nil/g,(_,op)=>{count++;return `if err ${op} tx.Commit(); err != nil`;});
  assert.equal(count,p.endsWith('/task_pages.go')?2:1);guards+=count;
  assert.equal(sha(reversed),base.files.find(q=>q.path===p).sha256,'changes beyond post-Commit context check: '+p);
}
assert.equal(guards,8);
for(const p of [newPath,'backend/go.mod','backend/go.sum'])assert.equal(sha(raw(p)),after.find(q=>q.path===p).sha256);
const contextPath='docs/evidence/d-read-late-commit-published-context-20261021.json',context=read(contextPath);
assert.equal(context.stable_copy_verified,true);assert.equal(digest(context.files),context.source_sha256);
const changes=after.filter(p=>!context.files.some(q=>p.path===q.path&&p.sha256===q.sha256&&p.size===q.size)).map(p=>p.path);
const additions=context.files.filter(p=>!after.some(q=>p.path===q.path)).map(p=>p.path);
const cleanupPath='docs/evidence/d-read-late-commit-cleanup-20261021.json',cleanup=read(cleanupPath);
assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);
assert.equal(cleanup.source_sha256,records.full.source.source_sha256);
assert.equal(path.dirname(path.resolve(cleanup.absolute_owner)).toLowerCase(),root.toLowerCase());
assert.equal(path.basename(cleanup.absolute_owner),'.tmp-d-index-cache-0af4f725101940e0927331237c9303de');assert.equal(fs.existsSync(cleanup.absolute_owner),false);
const output='docs/evidence/d-read-late-commit-preparation-20261021.json';
const report={kind:'d_read_post_commit_cancellation_preparation',status:'local_authorized_read_completion_boundary',base_source_sha256:base.source_sha256,base_manifest_sha256:sha(raw(basePath)),changes:own,post_commit_guards:guards,new_cases:40,new_checks:161,initial_fixture_probe:{status:'partial_owned_process_terminated_not_acceptance',native_sha256:sha(raw(initialPrefix+'-native.json')),source_manifest_sha256:sha(raw(initialPrefix+'-source.json')),events_sha256:sha(raw(initialPrefix+'.jsonl')),termination:terminationPath,termination_sha256:sha(raw(terminationPath)),repaired_test_only:true},runs:Object.values(records).map(r=>r.summary),published:{source_context_sha256:context.source_sha256,source_context_manifest_sha256:sha(raw(contextPath)),matches_frozen_full:changes.length===0&&additions.length===0,concurrent_changes:changes,concurrent_additions:additions,own_eight_files_and_module_match:true},cleanup:{receipt:cleanupPath,sha256:sha(raw(cleanupPath)),removed:true},dependencies_installed:false,remote:false,boundaries:{healthy_missing_and_empty_outcomes_preserved:true,late_commit_returns_zero_no_cursor_or_404:true,no_commit_retry_or_rollback_claim:true,sql_authority_and_isolation_unchanged:true,detail_owner_sources_complete:false,actual_mysql_or_deployment_proven:false,production_approval:false,original_six_scopes_complete:false}};
if(process.argv.includes('--check')){assert.deepEqual(read(output),report);console.log(`PASS read commit boundary: 39 old-code late returns reproduced; target ${report.runs[1].main}/${report.runs[1].checks}; full ${report.runs[2].main}/${report.runs[2].checks}; eight guards, exact published bytes, cleanup`);}
else{assert.equal(fs.existsSync(path.join(root,output)),false);fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n');console.log(output);}
