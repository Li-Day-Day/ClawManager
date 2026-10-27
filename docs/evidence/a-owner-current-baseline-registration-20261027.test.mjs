import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {workspace,loadReviewedOwnerBaseline,decode} from './a-download-owners-actual-review-20261020.mjs';
const sourceName='docs/evidence/a-owner-current-reviewed-source-20261027.json';
const read=p=>fs.readFileSync(path.join(workspace,p));
const source=()=>JSON.parse(decode(read(sourceName)));
function cli(args,input){const r=spawnSync(process.execPath,args,{cwd:workspace,input,encoding:'utf8',windowsHide:true});assert.equal(r.error,undefined);return r;}
function preflight(s){const r=cli(['docs/evidence/a-download-retest-source-preflight-20261021.mjs'],JSON.stringify(s));return {exit:r.status,body:JSON.parse(r.stdout)};}
test('new current source selects all 5530 native names while historical 5190 inventory remains distinct',()=>{
 const b=loadReviewedOwnerBaseline(read(sourceName));assert.equal(b.baselineSource.source_sha256,'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101');
 const passed=b.baselineEvents.filter(e=>e.Test&&e.Action==='pass');assert.equal(passed.length,5530);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,703);
 const historical=loadReviewedOwnerBaseline(read('docs/evidence/a-owner-final-source-20261026.json'));
 assert.equal(historical.baselineSource.source_sha256,'2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0');
 for(const e of historical.baselineEvents.filter(e=>e.Test&&e.Action==='pass'))assert.ok(passed.some(p=>p.Package===e.Package&&p.Test===e.Test));
 assert.equal(source().production_approved,false);assert.equal(source().actual_SQL,false);
});
test('actual preflight accepts the new exact local preparation without starting tests or SQL',()=>{
 const r=preflight(source());assert.equal(r.exit,0);assert.equal(r.body.status,'ready_for_original_snapshot_gate');
 assert.equal(r.body.reviewed_source_sha256,source().source_sha256);assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);
});
for(const [name,mutate]of [
 ['controller code drift',s=>{s.files.find(p=>p.path==='backend/internal/systembackupcontroller/controller_state_alerts.go').sha256='0'.repeat(64);}],
 ['metrics registry drift',s=>{s.files.find(p=>p.path==='contracts/system-backup/v12/metrics-alert-registry.json').sha256='0'.repeat(64);}],
 ['new unreviewed ordinary source',s=>s.files.push({path:'backend/internal/systembackupsecurity/unreviewed_current.go',size:0,sha256:'0'.repeat(64)})],
 ['removed ordinary source',s=>{s.files=s.files.filter(p=>p.path!=='backend/internal/systembackupsecurity/read_scope.go');}]
])test(name+' is rejected by the real preflight before tests or SSH',()=>{
 const s=source();mutate(s);const r=preflight(s);assert.equal(r.exit,1);assert.equal(r.body.status,'not_ready');
 assert.equal(r.body.code,'ordinary_source_changed_requires_reviewed_baseline');assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);
});
for(const reviewer of ['a-download-owners-actual-review-20261020.mjs','a-download-gc-role-actual-review-20261021.mjs'])test(reviewer+' cannot turn the current local preparation into SQL acceptance',()=>{
 const receiptNames=()=>fs.readdirSync(path.join(workspace,'docs/evidence')).filter(p=>/^a-download-(?:owners|gc-role)-mysql-accepted-/.test(p)).sort();
 const before=receiptNames(),r=cli(['docs/evidence/'+reviewer,'--log','a-owner-current-native-20261027.jsonl','--source',path.basename(sourceName),'--write']);
 assert.equal(r.status,1);const failure=JSON.parse(r.stderr.trim());assert.equal(failure.status,'rejected');assert.equal(failure.receipt_written,false);assert.deepEqual(receiptNames(),before);
});
