// A1 independent source review only; scripted driver tests await native intake.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)};};
const readiness='docs/evidence/d1-gate-budget-source-ready-20261027-r1.json';
const r=JSON.parse(read(readiness));assert.equal(r.changes.length,4);
for(const c of r.changes){assert.deepEqual(pin(c.candidate.path),c.candidate);if(c.before)assert.deepEqual(pin(c.path),c.before);}
const code=read(r.changes[0].candidate.path).toString('utf8');
const tests=read(r.changes[1].candidate.path).toString('utf8');
const http=read(r.changes[2].candidate.path).toString('utf8');
const main=read(r.changes[3].candidate.path).toString('utf8');
for(const required of ['ReadOnly: true, Isolation: sql.LevelRepeatableRead','UTC_TIMESTAMP(6)',
 'i.active_config_version','g.scope = ?','LIMIT 2','count != 1','rows.Err(), rows.Close()',
 'tx.Commit()','s.HeldAt.Time','s.Acquisition.Int64','s.Hold.Int64'])assert.ok(code.includes(required),required);
assert.doesNotMatch(code,/lease_expires_at\s*>\s*(?:UTC_TIMESTAMP|CURRENT_TIMESTAMP)/i);
for(const required of ['GateAcquiring','GateHeld','GateReleasing','clock_offset','late_cancel','leader_lost','readiness_lost','window_exceeds_frozen_budget'])assert.ok(tests.includes(required),required);
assert.ok(main.includes('Gate:           systembackupcontroller.SQLGateBudgetReader{DB: sqlDB}'));
assert.ok(http.indexOf('gate budget collection failed')<http.indexOf('w.Write(body)'));
const roots=[...tests.matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]);assert.equal(roots.length,7);
const result={kind:'a_gate_budget_independent_source_review.v1',status:'source_reviewed_native_pending',
 source_ready:pin(readiness),candidate_source_sha256:r.candidate_source_sha256,changes:r.changes,
 reviewed_invariants:['installation matrix labels from original persisted installation','singleton original gate and matching active config in bounded read-only RR transaction','single SQL UTC clock with UTC-session validation','frozen acquisition and hold thresholds for active dimensions','expired lease never hides still acquiring/held/releasing gate','releasing retains original held_at','positive inactive thresholds prevent zero>=zero false firing','partial scan/read/close/commit/cancel failure never publishes metrics','buffered HTTP output and final leader/readiness checks','runtime controller command mount explicitly wired'],
 original_contract_sources:['backend/internal/db/migrations/065_add_system_backup_control_metadata_core.sql','backend/internal/db/migrations/067_add_system_backup_runtime_schema.sql','backend/internal/db/migrations/068_add_system_backup_coordination_observability.sql','backend/internal/systembackupcontroller/gate_initializer.go'],
 tests:roots,scripted_SQL_driver_is_not_actual_MySQL:true,Go_executed:false,SQL_executed:false,
 live_source_changed:false,dependencies_installed:false,production_approved:false};
// Migration 067 filename may vary; preserve the actual published matching path.
result.original_contract_sources=result.original_contract_sources.filter(p=>fs.existsSync(path.join(root,p)));
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const out='docs/evidence/a-gate-budget-source-reviewed-20261027.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,out),text,{flag:'wx'});else assert.equal(read(out).toString('utf8'),text);
console.log(JSON.stringify({status:result.status,changes:4,roots:roots.length,actual_SQL:false}));
