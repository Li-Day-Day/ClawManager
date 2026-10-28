import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const readyName='docs/evidence/d1-gate-budget-source-ready-20261027-r3.json',r=json(readyName);
const oldReviewName='docs/evidence/a-gate-budget-source-reviewed-20261027.json',old=json(oldReviewName);
assert.deepEqual(pin(r.base.path),r.base);const base=json(r.base.path);
assert.deepEqual(enumerate(root),base.files);assert.equal(sourceDigest(base.files),r.base_source_sha256);
assert.equal(r.changes.length,4);
for(const c of r.changes){assert.deepEqual(pin(c.candidate.path),c.candidate);if(c.before)assert.deepEqual(pin(c.path),c.before);}
// HTTP/runtime wiring is byte-identical to the first independently read candidate.
for(const i of [2,3])assert.equal(r.changes[i].after.sha256,old.changes[i].after.sha256);
const code=read(r.changes[0].candidate.path).toString('utf8'),tests=read(r.changes[1].candidate.path).toString('utf8');
for(const s of ['ReadOnly: true, Isolation: sql.LevelRepeatableRead','LIMIT 2','rows.Err(), rows.Close()',
 's.Acquisition.Int64','s.Hold.Int64','gateMetricExactWindow(s.AcquiringAt.Time, s.AcquisitionDeadline.Time',
 'gateMetricExactWindow(s.HeldAt.Time, s.HoldDeadline.Time','gateMetricWindow(s.Heartbeat.Time, s.LeaseExpires.Time, s.LockTTL)',
 'end.UnixMicro()-start.UnixMicro() == budget*1000000'])assert.ok(code.includes(s),s);
for(const s of ['shortened_acquisition','shortened_hold','TestGateBudgetClippedLeaseKeepsOriginalFrozenBudget','late_cancel','leader_lost'])assert.ok(tests.includes(s),s);
const roots=[...tests.matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]);assert.deepEqual(roots,r.prepared_test_roots);assert.equal(roots.length,8);
const result={...old,status:'source_reviewed_native_pending',source_ready:pin(readyName),candidate_source_sha256:r.candidate_source_sha256,
 changes:r.changes,tests:roots,previous_source_review:pin(oldReviewName),
 correction:'Active acquisition and hold deadlines must exactly match their frozen original budget; only the renewable lease may be shorter than TTL. Supersedes the first source review on this point.',
 original_contract_sources:['backend/internal/db/migrations/065_add_system_backup_control_metadata_core.sql','backend/internal/db/migrations/067_add_system_backup_task_execution_core.sql','backend/internal/db/migrations/068_add_system_backup_coordination_observability.sql','backend/internal/systembackupcontroller/gate.go','backend/internal/systembackupcontroller/gate_initializer.go'].map(pin),
 base_source_sha256:r.base_source_sha256,new_native_still_required:true};
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-gate-budget-source-reviewed-20261027-r2.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
console.log(JSON.stringify({status:result.status,roots:8,candidate:result.candidate_source_sha256,native:false,SQL:false}));
