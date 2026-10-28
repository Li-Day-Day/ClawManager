import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return {path:p,size:b.length,sha256:sha(b)};};
const events=p=>read(p).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const stem='docs/evidence/d-resources-rules-local-d25149d0a27c4a7395680767a8f40802';
const r=json(stem+'.json'),s=json(stem+'-source.json');
assert.equal(r.exit_code,0);assert.equal(r.error,null);
for(const k of ['frozen_inputs_stable','current_inputs_stable','owner_removed','default_vet'])assert.equal(r[k],true);
for(const k of ['dependencies_installed','actual_mysql','cross_review_approval','production_wired'])assert.equal(r[k],false);
assert.equal(path.dirname(r.owner),root);assert.equal(path.basename(r.owner),'.tmp-d-resources-rules-d25149d0a27c4a7395680767a8f40802');assert.equal(fs.existsSync(r.owner),false);
assert.equal(s.inputs.length,39);assert.equal(new Set(s.inputs.map(p=>p.path)).size,39);
for(const p of s.inputs){const b=Buffer.from(p.bytes_base64,'base64');assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);assert.deepEqual(pin(p.path),{path:p.path,size:p.size,sha256:p.sha256});}
const e=events(stem+'.jsonl');
assert.equal(new Set(e.map(v=>v.Package)).size,1);assert.equal(e.some(v=>['fail','skip','build-fail'].includes(v.Action)),false);
assert.equal(e.filter(v=>v.Action==='start').length,1);assert.equal(e.filter(v=>v.Action==='pass'&&!v.Test).length,1);
assert.equal(e.at(-1).Action,'pass');assert.equal(e.at(-1).Test,undefined);
const passed=e.filter(v=>v.Action==='pass'&&v.Test),names=passed.map(v=>v.Test).sort();
assert.equal(passed.length,826);assert.equal(passed.filter(v=>!v.Test.includes('/')).length,68);
assert.equal(new Set(names).size,826);assert.deepEqual(e.filter(v=>v.Action==='run'&&v.Test).map(v=>v.Test).sort(),names);
assert.equal(passed.filter(v=>v.Test.startsWith('TestRestoreWrite')).length,76);
assert.equal(passed.filter(v=>v.Test.startsWith('TestRestoreWriteMutationFailuresRollBack/')).length,54);
assert.equal(passed.filter(v=>v.Test.startsWith('TestRestoreWriteRejectsInvalidAndLateFacts/')).length,19);
const prior='docs/evidence/d-resources-rules-local-a7788a3e6b8a474db6fb5bb667aa36cd.jsonl';
const old=events(prior).filter(v=>v.Test&&v.Action==='pass');assert.equal(old.length,678);assert.ok(old.every(v=>names.includes(v.Test)));
const failedStem='docs/evidence/d-resources-rules-local-707446ecef2d48b0ba3552ddd937f7ea';
const failed=events(failedStem+'.jsonl');
assert.deepEqual(failed.filter(v=>v.Action==='fail'&&v.Test?.includes('/')).map(v=>v.Test).sort(),['TestRestoreWriteRejectsInvalidAndLateFacts/control_after','TestRestoreWriteRejectsInvalidAndLateFacts/control_before']);
assert.notEqual(json(failedStem+'.json').exit_code,0);
const writer='backend/internal/systembackupresources/restore_write.go',migration='backend/internal/db/migrations/063_add_security_scan_tables.sql';
const source=read(writer).toString('utf8'),ddl=read(migration).toString('utf8');
assert.equal([...ddl.matchAll(/FOREIGN KEY \(job_id\) REFERENCES security_scan_jobs\(id\) ON DELETE CASCADE/g)].length,2);
const deletion=source.indexOf('for i := len(tables) - 1; i >= 0; i-- {');
const updates=source.indexOf('for _, table := range tables {\n\t\tcolumns := definitions[table]');
assert.ok(deletion>0&&updates>deletion,'review requires current delete-before-write schedule');
assert.ok(source.includes('if affected, err := result.RowsAffected(); err != nil || affected != 1'));
// An in-memory relational counterexample, NOT execution of the Go writer or
// MySQL. The two declared FK/CASCADE relations and production phase order are
// modeled explicitly. All unrelated columns and proofs are outside this model.
const db=new DatabaseSync(':memory:');
let model;
try {
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE security_scan_jobs(id INTEGER PRIMARY KEY); CREATE TABLE security_scan_job_items(id INTEGER PRIMARY KEY,job_id INTEGER NOT NULL REFERENCES security_scan_jobs(id) ON DELETE CASCADE); CREATE TABLE security_scan_reports(id INTEGER PRIMARY KEY,job_id INTEGER NOT NULL UNIQUE REFERENCES security_scan_jobs(id) ON DELETE CASCADE); INSERT INTO security_scan_jobs VALUES(1); INSERT INTO security_scan_job_items VALUES(7,1); INSERT INTO security_scan_reports VALUES(9,1);');
  const state=()=>({jobs:db.prepare('SELECT * FROM security_scan_jobs ORDER BY id').all().map(r=>({...r})),items:db.prepare('SELECT * FROM security_scan_job_items ORDER BY id').all().map(r=>({...r})),reports:db.prepare('SELECT * FROM security_scan_reports ORDER BY id').all().map(r=>({...r}))});
  const before=state();assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.exec('BEGIN');db.prepare('DELETE FROM security_scan_jobs WHERE id=?').run(1);
  const afterDelete=state();assert.equal(afterDelete.items.length,0);assert.equal(afterDelete.reports.length,0);
  db.prepare('INSERT INTO security_scan_jobs(id) VALUES(?)').run(2);
  const update=db.prepare('UPDATE security_scan_job_items SET job_id=? WHERE id=?').run(2,7);
  assert.equal(update.changes,0);db.exec('ROLLBACK');assert.deepEqual(state(),before);
  // A control ordering demonstrates FK-valid endpoints. It is not a generic
  // planner proposal: production must also solve other FK/UNIQUE dependencies.
  db.exec('BEGIN');db.prepare('INSERT INTO security_scan_jobs(id) VALUES(?)').run(2);
  assert.equal(db.prepare('UPDATE security_scan_job_items SET job_id=? WHERE id=?').run(2,7).changes,1);
  assert.equal(db.prepare('UPDATE security_scan_reports SET job_id=? WHERE id=?').run(2,9).changes,1);
  db.prepare('DELETE FROM security_scan_jobs WHERE id=?').run(1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const after=state();assert.deepEqual(after,{jobs:[{id:2}],items:[{id:7,job_id:2}],reports:[{id:9,job_id:2}]});
  db.exec('ROLLBACK');assert.deepEqual(state(),before);
  model={engine:'Node built-in SQLite in-memory',executes_Go_writer:false,actual_MySQL:false,before,after,production_phase_model:{delete_old_parent_first:true,cascaded_retained_children:2,first_retained_child_UPDATE_affected:0,writer_requires_affected:1,rollback_restores_before:true},FK_valid_control_order_succeeds:true,files_created:0};
} finally {db.close();}
const result={kind:'a_resources_writer_incremental_review.v1',date:'2026-10-23',status:'offline_test_receipt_verified_FK_transition_policy_or_schedule_changes_required',frozen_inputs:39,roots:68,pass_events:826,writer_pass_events:76,mutation_failure_leaves:54,preflight_late_failure_leaves:19,prior_pass_names_preserved:678,old_failed_control_cases_preserved:true,owner_independently_absent:true,default_vet:true,dependencies_installed:false,Go_tests_repeated:false,actual_SQL:false,production_approved:false,registry_written:false,scope:'private writer transaction/control boundaries; no B/C proof or field normalization approval',finding:{id:'A-WRITER-FK-01',severity:'P2',status:'requires_explicit_plan_policy_or_FK_safe_scheduling_and_real_FK_regression',source:writer,trigger:'retain child IDs while changing their job_id from a deleted old job to a new job',effect:'delete phase cascades retained children; later UPDATE cannot affect exactly one row, so a FK-valid transition is rejected and must roll back',qualification:'B/C domain rules are not delivered. If this transition is prohibited, the candidate adapter must enforce that explicitly; the current helper contract does not state such a restriction.',real_MySQL_reproduction_pending:true},model,inputs:[stem+'.json',stem+'-source.json',stem+'.jsonl',prior,failedStem+'.json',failedStem+'.jsonl',migration,'docs/system-backup-d-resources-writer-20261023.md','docs/evidence/a-resources-writer-review-20261023.mjs'].map(pin),reviewed_source_pins:s.inputs.map(({path,size,sha256})=>({path,size,sha256}))};
const output='docs/evidence/a-resources-writer-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_WRITER_REVIEW roots=68 events=826 prior=678 writer=76 FK_model=retained_child_deleted actual_MySQL=no production_approved=no');
