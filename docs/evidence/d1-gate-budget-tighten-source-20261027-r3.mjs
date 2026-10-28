import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const [mode,...rest]=process.argv.slice(2);assert.ok(['--prepare','--check'].includes(mode));assert.equal(rest.length,0);
const names=k=>`docs/evidence/d1-gate-budget-${k}-candidate-20261027-r3.go.txt`;
const old=k=>`docs/evidence/d1-gate-budget-${k}-candidate-20261027-r2.go.txt`;
function replaceOnce(s,b,a){assert.equal(s.split(b).length,2,'ambiguous source transform');return s.replace(b,()=>a);}
let sql=raw(old('sql')).toString('utf8');
sql=replaceOnce(sql,'func projectGateBudget(',`// Acquisition and hold deadlines are written with the exact same frozen
// integer budget in the original single-statement gate CAS. Only a lease
// renewal uses LEAST and may legitimately have a shorter TTL window.
func gateMetricExactWindow(start, end time.Time, budget int64) bool {
\treturn gateMetricWindow(start, end, budget) && end.UnixMicro()-start.UnixMicro() == budget*1000000
}

func projectGateBudget(`);
sql=replaceOnce(sql,'!gateMetricWindow(s.AcquiringAt.Time, s.AcquisitionDeadline.Time, s.Acquisition.Int64)','!gateMetricExactWindow(s.AcquiringAt.Time, s.AcquisitionDeadline.Time, s.Acquisition.Int64)');
sql=replaceOnce(sql,'!gateMetricWindow(s.HeldAt.Time, s.HoldDeadline.Time, s.Hold.Int64)','!gateMetricExactWindow(s.HeldAt.Time, s.HoldDeadline.Time, s.Hold.Int64)');
let tests=raw(old('test')).toString('utf8');
tests=replaceOnce(tests,'cases := map[string]func(*gateBudgetSnapshot){',`cases := map[string]func(*gateBudgetSnapshot){
\t\t"shortened_acquisition": func(s *gateBudgetSnapshot) {
\t\t\ts.AcquisitionDeadline.Time = s.AcquiringAt.Time.Add(15 * time.Second)
\t\t},
\t\t"shortened_hold": func(s *gateBudgetSnapshot) {
\t\t\ts.HoldDeadline.Time = s.HeldAt.Time.Add(60 * time.Second)
\t\t\ts.Heartbeat.Time = s.HeldAt.Time.Add(30 * time.Second)
\t\t\ts.LeaseExpires = s.HoldDeadline
\t\t},`);
tests=replaceOnce(tests,'func TestSQLGateBudgetReadsBoundedOriginalSourcesInOneUTCReadOnlySnapshot(',`func TestGateBudgetClippedLeaseKeepsOriginalFrozenBudget(t *testing.T) {
\tfor _, state := range []GateState{GateAcquiring, GateHeld, GateReleasing} {
\t\ts := gateBudgetFixture(state)
\t\ts.LeaseExpires.Time = s.Heartbeat.Time.Add(time.Second)
\t\tp, err := projectGateBudget(s, s.Installation)
\t\tif err != nil || p.AcquisitionTimeoutSeconds != 30 || (state != GateAcquiring && p.MaxHoldSeconds != 300) {
\t\t\tt.Fatalf("clipped lease replaced the immutable gate budget: %+v %v", p, err)
\t\t}
\t}
}

func TestSQLGateBudgetReadsBoundedOriginalSourcesInOneUTCReadOnlySnapshot(`);
const data=new Map([['sql',Buffer.from(sql)],['test',Buffer.from(tests)],['http',raw(old('http'))],['main',raw(old('main'))]]);
const targets={sql:'backend/internal/systembackupcontroller/sql_gate_budget.go',test:'backend/internal/systembackupcontroller/sql_gate_budget_test.go',http:'backend/internal/systembackupcontroller/metrics_http.go',main:'backend/cmd/system-backup-controller/main.go'};
const oldReady=JSON.parse(raw('docs/evidence/d1-gate-budget-source-ready-20261027-r1.json'));
const changes=[...data].map(([k,b])=>{const previous=oldReady.changes.find(c=>c.path===targets[k]);assert.ok(previous);if(previous.before)assert.deepEqual(pin(previous.path),previous.before,'main/HTTP live source changed');return{path:targets[k],before:previous.before,after:{path:targets[k],size:b.length,sha256:sha(b)},candidate:{path:names(k),size:b.length,sha256:sha(b)}};});
const current=enumerate(root),currentMap=new Map(current.map(p=>[p.path,p]));
for(const c of changes)currentMap.set(c.path,c.after);
const files=[...currentMap.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const sourceName='docs/evidence/d1-gate-budget-current-base-20261027-r3.json';
const sourceBytes=Buffer.from(JSON.stringify({kind:'d1_gate_budget_current_base.v1',files:current,source_sha256:sourceDigest(current)},null,2)+'\n');
const report={kind:'d1_gate_budget_SQL_and_runtime_candidate.v3',status:'source_only_native_and_independent_review_pending',base:{path:sourceName,size:sourceBytes.length,sha256:sha(sourceBytes)},base_source_sha256:sourceDigest(current),base_source_files:current.length,candidate_source_sha256:sourceDigest(files),candidate_source_files:files.length,changes,prepared_test_roots:[...tests.matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]),
 tightening:{frozen_acquisition_window:'equals original frozen seconds exactly',frozen_hold_window:'equals original frozen seconds exactly',lease_window:'positive and at most the original TTL; LEAST clipping remains accepted',new_negative_cases:['shortened_acquisition','shortened_hold'],new_positive_case:'TestGateBudgetClippedLeaseKeepsOriginalFrozenBudget'},
 previous_source_preparation:pin('docs/evidence/d1-gate-budget-source-ready-20261027-r1.json'),format_parse:pin('docs/evidence/d1-gate-budget-formatted-source-20261027-r2.json'),source_preparer:pin('docs/evidence/d1-gate-budget-tighten-source-20261027-r3.mjs'),
 current_tagged_fixes_captured_in_base:true,whole_ordinary_baseline_reapproved_by_this_command:false,Go_started:false,tests_executed:false,actual_SQL:false,PromQL_executed:false,live_sources_modified:false,dependencies_installed:false,production_approved:false};
const reportPath='docs/evidence/d1-gate-budget-source-ready-20261027-r3.json';
const outputs=[...[...data].map(([k,b])=>[names(k),b]),[sourceName,sourceBytes],[reportPath,Buffer.from(JSON.stringify(report,null,2)+'\n')]];
if(mode==='--prepare'){for(const [p]of outputs)assert.equal(fs.existsSync(path.resolve(root,p)),false,'refuse overwrite');for(const [p,b]of outputs)fs.writeFileSync(path.resolve(root,p),b,{flag:'wx'});}else for(const [p,b]of outputs)assert.deepEqual(raw(p),b);
console.log(JSON.stringify({status:report.status,changes:4,base_files:current.length,base_source:report.base_source_sha256,candidate_source:report.candidate_source_sha256,prepared_test_roots:report.prepared_test_roots.length,Go_started:false}));
