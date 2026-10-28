import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {workspace,loadReviewedOwnerBaseline,decode} from './a-download-owners-actual-review-20261020.mjs';
const read=f=>fs.readFileSync(path.join(workspace,f));
const frozen='docs/evidence/a-owner-current-full-local-20261023-093734-source.json';
const composed='docs/evidence/a-owner-dependency-freeze-20261023-r2-source.json';
const gcFrozen='docs/evidence/a-owner-gc-full-local-20261023-111154-source.json';
const gcComposed='docs/evidence/a-owner-dependency-freeze-20261023-r3-source.json';
const finalCurrent='docs/evidence/a-owner-final-source-20261026.json';
function cli(args,input){return spawnSync(process.execPath,args,{cwd:workspace,input,encoding:'utf8'});}
function preflight(source){const r=cli(['docs/evidence/a-download-retest-source-preflight-20261021.mjs'],JSON.stringify(source));assert.equal(r.error,undefined);return {exit:r.status,body:JSON.parse(r.stdout)};}

test('current finalizer source selects all 5190 native owner names without approving SQL',()=>{
  const s=JSON.parse(decode(read(finalCurrent))),b=loadReviewedOwnerBaseline(read(finalCurrent));
  assert.equal(b.baselineSource.source_sha256,'2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0');
  assert.equal(s.tested_owner_source_sha256,'41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16');
  assert.equal(s.production_approved,false);assert.equal(s.actual_SQL,false);
  const passed=b.baselineEvents.filter(e=>e.Test&&e.Action==='pass');assert.equal(passed.length,5190);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,647);
  const r=preflight(s);assert.equal(r.exit,0);assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);
});

test('current finalizer code drift still rejects before tests or SSH',()=>{
  const s=JSON.parse(decode(read(finalCurrent)));s.files.find(f=>f.path.endsWith('/download_retention_gc_finalize.go')).sha256='0'.repeat(64);
  const r=preflight(s);assert.equal(r.exit,1);assert.equal(r.body.code,'ordinary_source_changed_requires_reviewed_baseline');assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);
});
test('both exact reviewed sources retain all 5105 names with original inventory lineage',()=>{
  for(const f of [frozen,composed]){const s=JSON.parse(decode(read(f))),b=loadReviewedOwnerBaseline(read(f));assert.equal(b.baselineSource.source_sha256,s.source_sha256);assert.equal(b.baselineEvents.filter(e=>e.Test&&e.Action==='pass').length,5105);}
});

test('new GC sources retain the complete 5138 names and original tested inventory identity',()=>{
  for(const f of [gcFrozen,gcComposed]){const s=JSON.parse(decode(read(f))),b=loadReviewedOwnerBaseline(read(f));assert.equal(b.baselineSource.source_sha256,s.source_sha256);assert.equal(b.baselineEvents.filter(e=>e.Test&&e.Action==='pass').length,5138);const r=preflight(s);assert.equal(r.exit,0);assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);}
});

test('new GC code is still an owner dependency and cannot be silently excluded',()=>{
  const s=JSON.parse(decode(read(gcComposed)));
  s.files.find(f=>f.path.endsWith('/download_retention_gc_freeze.go')).sha256='0'.repeat(64);
  const r=preflight(s);assert.equal(r.exit,1);assert.equal(r.body.code,'ordinary_source_changed_requires_reviewed_baseline');assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);
});
test('reviewed composed-source snapshot is ready but does not start tests or SQL',()=>{
  const r=preflight(JSON.parse(decode(read(composed))));assert.equal(r.exit,0);assert.equal(r.body.status,'ready_for_original_snapshot_gate');assert.equal(r.body.actual_sql,false);assert.equal(r.body.tests_started,false);
});
test('actual current worktree enumeration and bytes match the approved ordinary source',()=>{
  const r=spawnSync('rg',['--files','--hidden','backend','contracts'],{cwd:workspace,encoding:'utf8'});assert.equal(r.error,undefined);assert.equal(r.status,0);
  const files=r.stdout.trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).filter(p=>!/((^|\/)(\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)\/)/.test(p)&&/\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p));
  const source={files:files.map(p=>{const b=read(p);return {path:p,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};})};
  const result=preflight(source);assert.equal(result.exit,0);assert.equal(result.body.status,'ready_for_original_snapshot_gate');assert.equal(result.body.actual_sql,false);assert.equal(result.body.tests_started,false);
});
for(const [name,change] of [
  ['changed ordinary Go bytes',s=>{s.files.find(f=>f.path.endsWith('/download_runtime_test.go')).sha256='0'.repeat(64);} ],
  ['new unreviewed ordinary Go file',s=>s.files.push({path:'backend/internal/systembackupevidence/unreviewed_a.go',size:0,sha256:'0'.repeat(64)})],
  ['removed ordinary Go input',s=>{s.files=s.files.filter(f=>!f.path.endsWith('/download_runtime_test.go'));}],
])test(name+' still rejects before tests or SSH',()=>{const s=JSON.parse(decode(read(composed)));change(s);const r=preflight(s);assert.equal(r.exit,1);assert.equal(r.body.status,'not_ready');assert.equal(r.body.code,'ordinary_source_changed_requires_reviewed_baseline');assert.equal(r.body.tests_started,false);assert.equal(r.body.actual_sql,false);});
test('historical 5019-name source still selects its original native inventory',()=>{
  const b=loadReviewedOwnerBaseline(read('docs/evidence/a-owner-dependency-freeze-20261021-source.json'));assert.equal(b.baselineEvents.filter(e=>e.Test&&e.Action==='pass').length,5019);
});
for(const [name,reader] of [['owner','a-download-owners-actual-review-20261020.mjs'],['role','a-download-gc-role-actual-review-20261021.mjs']])for(const [source,log] of [[frozen,'a-owner-current-full-local-20261023-093734.txt'],[gcFrozen,'a-owner-gc-full-local-20261023-111154.txt']])test(name+' actual receiver rejects complete local preparation '+log+' and writes no SQL acceptance',()=>{
  const receipts=()=>fs.readdirSync(path.join(workspace,'docs/evidence')).filter(f=>/^a-download-(?:owners|gc-role)-mysql-accepted-/.test(f)).sort();
  const before=receipts();const r=cli(['docs/evidence/'+reader,'--log',log,'--source',path.basename(source),'--write']);assert.equal(r.error,undefined);assert.equal(r.status,1);const result=JSON.parse(r.stderr.trim());assert.equal(result.status,'rejected');assert.equal(result.receipt_written,false);assert.deepEqual(receipts(),before);
});
