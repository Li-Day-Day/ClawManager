import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const self='docs/evidence/d-current-scope-audit-20261023.mjs';
const prefix='docs/evidence/d-current-scope-audit-20261023';
const output=prefix+'.json';
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const pin=f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};};
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
  if(['node_modules','vendor','.git'].includes(e.name))return [];
  assert.ok(!e.isSymbolicLink(),'unsupported source symlink');const f=dir+'/'+e.name;
  return e.isDirectory()?walk(f):(/\.(go|sql|json|mjs|ps1|sh|mod|sum|yaml|yml)$/.test(e.name)?[f]:[]);
}).sort();}
function inputs(){const files=[...walk('backend'),...walk('contracts/system-backup/v12'),...walk('scripts'),
  'docs/system-backup-restore-division-plan.md','docs/system-backup-restore-schema-inventory.json',self,
  ...['k8s','k3s'].flatMap(flavor=>['cluster','single-node'].map(profile=>`deployments/${flavor}/${profile}/clawmanager.yaml`))];
  return [...new Set(files)].sort().map(pin);
}
if(process.argv.includes('--prepare')){
  fs.writeFileSync(path.join(root,prefix+'-before.json'),JSON.stringify(inputs(),null,2)+'\n',{flag:'wx'});
  console.log('D_SCOPE_AUDIT_PREPARED native_commands=direct_tool_only');process.exit(0);
}
if(process.argv.includes('--finish')){
  assert.ok(!fs.existsSync(path.join(root,output)),'preserve previous audit');
  const before=json(prefix+'-before.json');
  const commands=[['inventory',['scripts/system-backup-schema-inventory.mjs','--check']],
    ['inventory-strict',['scripts/system-backup-schema-inventory.mjs','--check','--strict']],
    ['contract-strict',['scripts/system-backup-contract-check.mjs','--check','--strict']],
    ['readback-validation',['docs/evidence/d-resources-readback-validation-20261023.mjs','--check']],
    ['A-northbound-review',['docs/evidence/a-resources-northbound-review-20261023.mjs','--check']]];
  const runs=commands.map(([name,args])=>{const r=json(`${prefix}-${name}.json`);assert.equal(r.name,name);assert.deepEqual(r.args,args);return r;});
  const after=inputs();
  const stable=JSON.stringify(before)===JSON.stringify(after);
  const executions=runs.map(r=>({name:r.name,exit_code:r.exit_code,log:pin(`${prefix}-${r.name}.json`)}));
  const inventory=JSON.parse(runs.find(r=>r.name==='inventory').stdout);
  const contract=JSON.parse(runs.find(r=>r.name==='contract-strict').stdout);
  const blockers=contract.blockers;
  const latest=json('docs/evidence/d-resources-readback-validation-20261023.json');
  const review=json('docs/evidence/a-resources-northbound-reviewed-20261023.json');
  const result={kind:'d_current_scope_dependency_audit.v1',date:'2026-10-23',
    sources_stable:stable,source_files:before,source_after:stable?null:after,source_digest:sha(Buffer.from(JSON.stringify(before))),executions,
    inventory:inventory.summary,inventory_gaps:inventory.gaps,migration_catalog:contract.migration_catalog,contract_summary:contract.summary,
    blockers:{policy_pending:blockers.policy_pending,cross_review_pending:blockers.cross_review_pending,missing_artifacts:blockers.missing_artifacts,draft_artifact_count:blockers.draft_artifacts.length,schema_hash_pending:blockers.schema_hash_pending,planned_control_tables_missing:blockers.plan_control_without_inventory},
    resources:{offline_table_candidates:5,scan_table_candidates_missing:['security_scan_configs','security_scan_jobs','security_scan_job_items','security_scan_reports'],last_synthetic_roots:latest.root_tests,last_synthetic_pass_events:latest.pass_events,readback_production_proof_implemented:latest.production_proof_implemented,actual_mysql:false,full_normalization_complete:false},
    historical_A_northbound_review:{path:'docs/evidence/a-resources-northbound-reviewed-20261023.json',status:review.status,production_approved:review.production_approved},
    dependencies:{B_C_production_delivery:'user_confirmed_not_delivered',B:'source_target_mapping_clock_fence_transaction_writer_SELECT_only_schema_startup_gates',C:'scan_domain_rules_capability_result_versions_report_schema_provider_catalog',A_B_GC:'approved_exact_BACKUP_ADMIN_profile_lock_order_full_metadata_freeze_and_runtime_policy',operator:'reviewed_installation_identity_canonical_ledger_mTLS_MFA_grants_physical_journal_capacity_four_deployments'},
    full_objective_achieved:false,registry_approval_written:false,production_enabled:false,dependencies_installed:false,tests_or_builds_started:false,
    evidence:['docs/evidence/d-resources-readback-validation-20261023.json','docs/evidence/d-resources-readback-review-request-20261023.json','docs/evidence/a-resources-northbound-reviewed-20261023.json','docs/evidence/d-gc-owner-lifecycle-actual-accepted-20261022.json','docs/evidence/d-gc-backup-lock-protocol-requirements-20261021.json',prefix+'-spawn-failure.json',prefix+'-before.json'].map(pin)};
  fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
} else assert.ok(process.argv.includes('--check'),'use --prepare, direct native commands, --finish once or --check');
const saved=json(output);
assert.equal(saved.sources_stable,true,'concurrent input drift; audit cannot describe one current source set');
for(const e of saved.executions)assert.deepEqual(pin(e.log.path),e.log);
for(const e of saved.evidence)assert.deepEqual(pin(e.path),e);
assert.deepEqual(inputs(),saved.source_files,'current source set/bytes changed; keep the old audit historical');
assert.equal(sha(Buffer.from(JSON.stringify(saved.source_files))),saved.source_digest);
const byName=Object.fromEntries(saved.executions.map(e=>[e.name,e.exit_code]));
assert.equal(byName.inventory,0);assert.equal(byName['readback-validation'],0);assert.equal(byName['A-northbound-review'],0);
assert.equal(byName['contract-strict'],1);assert.equal(byName['inventory-strict'],1);
console.log(JSON.stringify({kind:saved.kind,inputs:saved.source_files.length,native_exits:byName,policy_pending:saved.blockers.policy_pending.length,cross_review_pending:saved.blockers.cross_review_pending.length,missing_artifacts:saved.blockers.missing_artifacts,planned_control_tables_missing:saved.blockers.planned_control_tables_missing,source_stable:true,objective_complete:false,production:false}));
