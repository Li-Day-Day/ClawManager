import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const [mode,...args]=process.argv.slice(2);assert.ok(['--prepare','--check'].includes(mode));assert.equal(args.length,0);
const baseName='docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json';
const base=JSON.parse(raw(baseName));assert.equal(base.source_sha256,'6bf973bd11709b14fa04c13175aadfbd126020be3a10a8c514596b5dd29cb9ca');
assert.equal(base.files.length,1720);assert.deepEqual(enumerate(root),base.files,'live source changed; keep native-owner source frozen');
const baseline=new Map(base.files.map(p=>[p.path,p]));
function replaceOnce(source,before,after){assert.equal(source.split(before).length,2,'missing or ambiguous source anchor');return source.replace(before,()=>after);}
const httpPath='backend/internal/systembackupcontroller/metrics_http.go';
let http=raw(httpPath).toString('utf8');
http=replaceOnce(http,'\tController     *ControllerTelemetry\n','\tController     *ControllerTelemetry\n\tGate           GateBudgetCollector\n');
const before='\tbody, err := renderQueueBudgetMetrics(samples)\n\tif err != nil {\n\t\thttp.Error(w, "queue budget metrics invalid", http.StatusServiceUnavailable)\n\t\treturn\n\t}\n';
http=replaceOnce(http,before,before+`\tif h.Gate != nil {
\t\tprojection, err := h.Gate.Collect(ctx, h.InstallationID)
\t\tif err != nil {
\t\t\thttp.Error(w, "gate budget collection failed", http.StatusServiceUnavailable)
\t\t\treturn
\t\t}
\t\tgateBody, err := renderGateBudgetMetrics(projection)
\t\tif err != nil {
\t\t\thttp.Error(w, "gate budget metrics invalid", http.StatusServiceUnavailable)
\t\t\treturn
\t\t}
\t\tif ctx.Err() != nil {
\t\t\thttp.Error(w, "metrics collection canceled", http.StatusServiceUnavailable)
\t\t\treturn
\t\t}
\t\tbody = append(body, gateBody...)
\t}
`);
const mainPath='backend/cmd/system-backup-controller/main.go';
let main=raw(mainPath).toString('utf8');
const mainBefore='\t_ = startHealthServer(rootCtx, healthAddress, sqlDB, status, systembackupcontroller.QueueBudgetMetricsHandler{\n\t\tCollector:      systembackupcontroller.SQLQueueBudgetReader{DB: sqlDB},\n';
main=replaceOnce(main,mainBefore,mainBefore+'\t\tGate:           systembackupcontroller.SQLGateBudgetReader{DB: sqlDB},\n');
const generated=[['docs/evidence/d1-gate-budget-http-candidate-20261027-r1.go.txt',Buffer.from(http)],['docs/evidence/d1-gate-budget-main-candidate-20261027-r1.go.txt',Buffer.from(main)]];
const maps=[['docs/evidence/d1-gate-budget-sql-candidate-20261027-r1.go.txt','backend/internal/systembackupcontroller/sql_gate_budget.go'],['docs/evidence/d1-gate-budget-test-candidate-20261027-r1.go.txt','backend/internal/systembackupcontroller/sql_gate_budget_test.go'],[generated[0][0],httpPath],[generated[1][0],mainPath]];
const candidateBytes=new Map(generated);
const changes=maps.map(([from,to])=>{const bytes=candidateBytes.get(from)??raw(from);return{path:to,before:baseline.get(to)??null,after:{path:to,size:bytes.length,sha256:sha(bytes)},candidate:{path:from,size:bytes.length,sha256:sha(bytes)}};});
const future=new Map(base.files.map(p=>[p.path,p]));for(const c of changes)future.set(c.path,c.after);
const files=[...future.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const sourceInputs=['docs/system-backup-restore-division-plan.md','backend/internal/db/migrations/065_add_system_backup_configuration_and_proofs.sql','backend/internal/db/migrations/067_add_system_backup_task_execution_core.sql','backend/internal/db/migrations/068_add_system_backup_coordination_observability.sql','backend/internal/systembackupcontroller/bootstrap.go','backend/internal/systembackupcontroller/gate.go','backend/internal/systembackupcontroller/gate_initializer.go','scripts/system-backup-metrics-registry.mjs'].filter(p=>fs.existsSync(path.resolve(root,p)));
const report={kind:'d1_gate_budget_SQL_and_runtime_candidate.v1',status:'source_only_native_and_independent_review_pending',base:pin(baseName),base_source_sha256:base.source_sha256,base_source_files:1720,candidate_source_sha256:sourceDigest(files),candidate_source_files:files.length,changes,
 requirements:{authority:'same read-only RR statement joins original installation/matrix, exact active config and singleton CaptureGateScope; one UTC database clock',labels:'original 065/067 four persisted matrix values determine profile=cluster|single-node and runner=k8s|k3s; not arbitrary constructor labels or lock_owner',active_threshold:'original gate frozen acquisition/max-hold seconds, bounded by original start/deadline windows; never current active config',inactive_threshold:'positive current snapshot config only for inactive dimensions with confirmed zero age, avoiding false 0>=0',lease_expiry:'expired leases and absolute deadlines remain observable while original gate state remains active',release:'preserves held_at through releasing and never uses release_started_at as hold-age origin',runtime:'existing leader/ready HTTP handler buffers queue and gate bytes, suppresses partial/canceled/late-leader results; main explicitly constructs SQLGateBudgetReader',migration:'no new SQL columns, grants or metric labels',scope:'four existing PromQL singleton projections; not cleanup owner persistence or a full metrics collector'},
 prepared_test_roots:[...raw(maps[1][0]).toString('utf8').matchAll(/^func (Test\w+)\(/gm)].map(m=>m[1]),
 original_source_inputs:sourceInputs.map(pin),source_preparer:pin('docs/evidence/d1-gate-budget-candidate-20261027.mjs'),Go_started:false,tests_executed:false,actual_SQL:false,PromQL_executed:false,live_sources_modified:false,dependencies_installed:false,production_approved:false,whole_goal_complete:false};
const output='docs/evidence/d1-gate-budget-source-ready-20261027-r1.json';
const outputs=[...generated,[output,Buffer.from(JSON.stringify(report,null,2)+'\n')]];
if(mode==='--prepare'){for(const [p]of outputs)assert.equal(fs.existsSync(path.resolve(root,p)),false,'refusing overwrite');for(const [p,b]of outputs)fs.writeFileSync(path.resolve(root,p),b,{flag:'wx'});}else for(const [p,b]of outputs)assert.deepEqual(raw(p),b);
console.log(JSON.stringify({status:report.status,changes:4,new_source_inputs:2,base_source:base.source_sha256,candidate_source:report.candidate_source_sha256,prepared_test_roots:report.prepared_test_roots.length,Go_started:false}));
