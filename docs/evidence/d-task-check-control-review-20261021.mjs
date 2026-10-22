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
const basePath='docs/evidence/d-task-check-control-base-20261021.json',base=read(basePath);
const own=['backend/internal/systembackupread/task_check_control.go','backend/internal/systembackupread/task_check_control_test.go'];
assert.equal(base.stable_copy_verified,true);assert.equal(digest(base.files),base.source_sha256);
const runs=[];let accepted;
for(const [attempt,stage] of [['r1','target'],['r2','target'],['r2','full']]){
  const prefix=`docs/evidence/d-task-check-control-20261021-${attempt}-${stage}`;
  const source=read(prefix+'-source.json'),native=read(prefix+'-native.json');
  const events=decode(raw(prefix+'.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(digest(source.files),source.source_sha256);assert.equal(source.files.length,base.files.length+2);
  assert.equal(source.base_source_sha256,base.source_sha256);
  assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
  for(const p of base.files)assert.deepEqual(source.files.find(q=>q.path===p.path),p,p.path);
  assert.deepEqual(source.files.filter(p=>!base.files.some(q=>q.path===p.path)).map(p=>p.path).sort(),own.slice().sort());
  assert.equal(native.source_sha256,source.source_sha256);assert.equal(native.source_postcheck,true);
  assert.equal(native.exit,0);assert.equal(native.default_vet,true);assert.equal(native.dependencies_installed,false);assert.equal(native.remote,false);
  assert.equal(decode(raw(prefix+'-stderr.txt')).trim(),'');
  assert.equal(events.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
  const ran=events.filter(e=>e.Test&&e.Action==='run'),passed=events.filter(e=>e.Test&&e.Action==='pass');
  assert.equal(new Set(ran.map(e=>e.Package+'\0'+e.Test)).size,ran.length);
  assert.deepEqual(ran.map(e=>e.Package+'\0'+e.Test).sort(),passed.map(e=>e.Package+'\0'+e.Test).sort());
  assert.equal(passed.filter(e=>e.Test.startsWith('TestTaskCheckControl')).length,attempt==='r1'?69:73);
  const packages=events.filter(e=>!e.Test&&e.Action==='pass');
  assert.deepEqual(packages.map(e=>e.Package).sort(),stage==='full'?['clawreef/internal/systembackupread','clawreef/internal/systembackupsecurity']:['clawreef/internal/systembackupread']);
  if(attempt==='r2'){
    if(accepted)assert.equal(source.source_sha256,accepted.source_sha256);
    accepted=source;
    for(const name of ['KindsHistoryAndPrivacy','RejectsCorruptRecords','ModeAndCategory','EmptyAndBudget','AuthorityAndCompletion','FutureBuilderIsAtomic','UsesCheckTimeAndIDOrder','SQLContract'])assert.equal(passed.filter(e=>e.Test==='TestTaskCheckControl'+name).length,1);
  }
  runs.push({attempt,stage,source_sha256:source.source_sha256,files:source.files.length,main:ran.filter(e=>!e.Test.includes('/')).length,checks:ran.length,new_main:attempt==='r1'?7:8,new_checks:attempt==='r1'?69:73,exit:0,default_vet:true,source_postcheck:true,packages:packages.map(e=>({package:e.Package,elapsed_seconds:e.Elapsed})),source_manifest:prefix+'-source.json',source_manifest_sha256:sha(raw(prefix+'-source.json')),events_sha256:sha(raw(prefix+'.jsonl')),native_sha256:sha(raw(prefix+'-native.json'))});
}
for(const p of [...own,'backend/go.mod','backend/go.sum'])assert.equal(sha(raw(p)),accepted.files.find(q=>q.path===p).sha256,'published bytes changed: '+p);
const production=decode(raw(own[0]));
assert.ok(production.includes('const maxTaskCheckControlRows = 10000'));
const columns=production.match(/const taskCheckControlColumns = "([^"]+)"/)[1];
assert.doesNotMatch(columns,/expected_|actual_|canonical_json/);
assert.ok(production.includes('ORDER BY checked_at,id LIMIT 10001'));
const migration='backend/internal/db/migrations/072_add_system_backup_check_authority.sql';
assert.ok(decode(raw(migration)).includes('KEY idx_sb_check_result_target (target_type, target_public_id, checked_at, id)'));
assert.equal(sha(raw(migration)),accepted.files.find(p=>p.path===migration).sha256);
const contextPath='docs/evidence/d-task-check-control-published-context-20261021.json',context=read(contextPath);
assert.equal(context.stable_copy_verified,true);assert.equal(digest(context.files),context.source_sha256);
const changes=accepted.files.filter(p=>!context.files.some(q=>p.path===q.path&&p.sha256===q.sha256&&p.size===q.size)).map(p=>p.path);
const additions=context.files.filter(p=>!accepted.files.some(q=>p.path===q.path)).map(p=>p.path);
const cleanupPath='docs/evidence/d-task-check-control-cleanup-20261021.json',cleanup=read(cleanupPath);
assert.equal(cleanup.removed,true);assert.equal(cleanup.process_terminal,true);assert.equal(cleanup.source_postcheck,true);assert.equal(cleanup.source_sha256,accepted.source_sha256);
assert.equal(path.dirname(path.resolve(cleanup.absolute_owner)).toLowerCase(),root.toLowerCase());
assert.equal(path.basename(cleanup.absolute_owner),'.tmp-d-index-cache-22896c73544948059a4d218c9e3e226f');assert.equal(fs.existsSync(cleanup.absolute_owner),false);
const output='docs/evidence/d-task-check-control-preparation-20261021.json';
const report={kind:'d_task_check_control_read_preparation',status:'local_check_metadata_contribution_only',base_source_sha256:base.source_sha256,base_manifest_sha256:sha(raw(basePath)),added:own,runs,published:{source_context_sha256:context.source_sha256,source_context_manifest_sha256:sha(raw(contextPath)),matches_frozen_full:changes.length===0&&additions.length===0,concurrent_changes:changes,concurrent_additions:additions,own_two_files_and_module_match:true},reviewed_migration:{path:migration,sha256:sha(raw(migration)),index_order_compatible:true,actual_explain_or_server_work_proven:false},cleanup:{receipt:cleanupPath,sha256:sha(raw(cleanupPath)),removed:true},dependencies_installed:false,remote:false,boundaries:{maximum_check_rows:10000,overflow_probe_rows:1,all_original_attempts_preserved:true,expected_actual_payloads_selected:false,public_summary_or_current_report_selection:false,evidence_owner_hash_verified:false,evidence_current_availability_proven:false,complete_detail_or_http_enabled:false,actual_mysql_or_deployment_proven:false,production_approval:false,original_six_scopes_complete:false}};
if(process.argv.includes('--check')){assert.deepEqual(read(output),report);console.log(`PASS task check metadata: target 8/73; full ${runs[2].main}/${runs[2].checks}; original snapshot, exact published bytes, cleanup`);}
else{assert.equal(fs.existsSync(path.join(root,output)),false);fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n');console.log(output);}
