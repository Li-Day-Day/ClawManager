import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildRegistry} from '../../scripts/system-backup-contract-check.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='docs/evidence/d-six-scope-current-audit-20261021';
const bytes=p=>fs.readFileSync(path.join(root,p));
const decode=b=>b.toString('utf8').replace(/^\uFEFF/,'');
const read=p=>JSON.parse(decode(bytes(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=pins=>sha(pins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
const compare=(a,b)=>a<b?-1:a>b?1:0;
function pinInputs(){
  const paths=[];
  const excluded=new Set(['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__']);
  function walk(directory){
    for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){
      if(excluded.has(entry.name))continue;
      const p=directory+'/'+entry.name;
      assert.equal(entry.isSymbolicLink(),false,'Redirected audit input: '+p);
      if(entry.isDirectory())walk(p);
      else if(entry.isFile()&&/\.(go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p))paths.push(p);
    }
  }
  for(const p of ['backend','contracts','scripts'])walk(p);
  paths.push('docs/system-backup-restore-division-plan.md','docs/system-backup-restore-schema-inventory.json');
  for(const flavor of ['k8s','k3s'])for(const profile of ['cluster','single-node'])paths.push(`deployments/${flavor}/${profile}/clawmanager.yaml`);
  return [...new Set(paths)].sort(compare).map(p=>{const b=bytes(p);return {path:p,size:b.length,sha256:sha(b)};});
}
if(process.argv.includes('--prepare')){
  const files=pinInputs();
  fs.writeFileSync(path.join(root,prefix+'-source-before.json'),JSON.stringify({kind:'d_read_only_completion_audit_before',source_sha256:digest(files),files},null,2)+'\n',{flag:'wx'});
  console.log('PREPARED audit source inputs='+files.length);
  process.exit(0);
}
const initial=read(prefix+'-source-before.json'),before=initial.files;
assert.equal(digest(before),initial.source_sha256);
const native=read(prefix+'-native.json');
const gates=[];
for(const [name,args] of [['inventory',['scripts/system-backup-schema-inventory.mjs','--check']],['contract',['scripts/system-backup-contract-check.mjs','--check','--strict']]]){
  const capture=native.gates.find(g=>g.name===name);
  assert.equal(capture.native_exit,name==='inventory'?0:1);
  assert.deepEqual(capture.arguments,args);assert.equal(decode(bytes(capture.stderr)).trim(),'');
  const output=read(capture.stdout);
  gates.push({name,command:[native.node,...args],native_exit:capture.native_exit,stdout:capture.stdout,stdout_sha256:sha(bytes(capture.stdout)),stderr:capture.stderr,stderr_sha256:sha(bytes(capture.stderr)),result:output});
}
const registry=buildRegistry();
const inventory=read('docs/system-backup-restore-schema-inventory.json');
const contract=gates.find(g=>g.name==='contract').result;
assert.deepEqual(contract.summary,{object_count:100,policy_recorded:60,policy_pending:40,cross_review_pending:60});
const oldAudit=read('docs/evidence/system-backup-d-goal-readiness-audit-20261015-r36.json');
const oldPending=oldAudit.gates.find(g=>g.blockers).blockers.policy_pending;
const newlyPending=contract.blockers.policy_pending.filter(p=>!oldPending.includes(p));
assert.deepEqual(newlyPending,['table:instance_browser_workers']);
const added=inventory.objects.find(o=>o.name==='instance_browser_workers');
assert.equal(added.owner,'B');assert.equal(added.category,'instances');assert.deepEqual(added.migration_sources,['backend/internal/db/migrations/064_add_instance_browser_workers.sql']);
const grouped={};
for(const o of registry.objects.filter(o=>o.decision_status==='pending_owner_review'))(grouped[o.owner]??=[]).push(`${o.object_type}:${o.name}`);
const livePath='backend/cmd/server/system_backup_read_live.go',live=decode(bytes(livePath));
assert.ok(live.includes('admin.GET(route.path+"/:id", unavailable)'));
assert.ok(live.includes('admin.GET(route.path+"/:id/logs", unavailable)'));
assert.ok(live.includes('admin.GET("/system-backups/:id/manifest", unavailable)'));
const implementations=[],normalizerCalls=[];
for(const p of before.filter(p=>p.path.startsWith('backend/')&&p.path.endsWith('.go')&&!p.path.endsWith('_test.go'))){
  const text=decode(bytes(p.path));
  for(const m of text.matchAll(/^\s*func\s*\([^)]*\)\s*(VerifyBusinessRestoreSources|RecheckBusinessRestoreSources)\s*\(/gm))implementations.push({path:p.path,method:m[1]});
  for(const [i,line] of text.split(/\r?\n/).entries())if(line.includes('NormalizeBusinessForRestore(')&&!/^\s*func NormalizeBusinessForRestore\(/.test(line))normalizerCalls.push({path:p.path,line:i+1});
}
const remote=fs.readdirSync(path.join(root,'docs/evidence')).filter(n=>/^d-download-gc-task-remote-.*\.txt$/.test(n)).sort(compare);
assert.deepEqual(remote,['d-download-gc-task-remote-20261021-100302.txt']);
const failed=read('docs/evidence/d-download-gc-task-local-failure-20261021-100302.json');
assert.equal(sha(bytes(failed.log)),failed.log_sha256);assert.equal(failed.remote_started,false);assert.equal(failed.actual_sql_cases,0);
const after=pinInputs();assert.equal(digest(before),digest(after),'Audit inputs changed while read');
const sourcePath=prefix+'-source.json';
fs.writeFileSync(path.join(root,sourcePath),JSON.stringify({kind:'d_read_only_completion_audit_inputs',source_sha256:digest(after),files:after,stable_read_verified:true},null,2)+'\n',{flag:'wx'});
const scopes=[
  {id:1,status:'incomplete',remaining:['owner policy and cross review','three catalog schemas and four missing artifacts','observed schema hash and actual deployment grants/authority/physical capacity']},
  {id:2,status:'incomplete',remaining:['A/B/C current Owner readers','current report/attempt/phase selection','complete overview/detail/log/manifest HTTP composition'],source:livePath},
  {id:3,status:'incomplete',remaining:['B authenticated restore source proof and transaction writer','D production normalization call and real target/schema freeze','integrated large-data smoke']},
  {id:4,status:'not_proven_for_real_deployment',remaining:['management mTLS and upper authorization','independent physical audit volume/reservation','single-writer takeover and actual IO faults']},
  {id:5,status:'not_proven_for_real_installation',remaining:['original historical SQL/ledger/canonical source','reviewed upgrade and installation authorization','human MFA and activation evidence']},
  {id:6,status:'incomplete',remaining:['real backend/Owner/browser end-to-end','four independent deployment matrices','specified large-smoke datasets and measured resources/deadlines']},
];
const report={kind:'d_six_scope_current_dependency_audit',recorded_utc:new Date().toISOString(),status:'incomplete_external_materials_and_owner_handoffs_needed',source:{path:sourcePath,sha256:sha(bytes(sourcePath)),input_digest:digest(after),files:after.length,stable_read_verified:true},native_capture:{path:prefix+'-native.json',sha256:sha(bytes(prefix+'-native.json'))},gates,pending_policy_by_owner:grouped,newly_identified_against_old_r36_audit:{object:added,old_policy_pending:39,current_policy_pending:40,old_inventoried_objects:99,current_inventoried_objects:100},production_source_search:{proof_implementations:implementations,normalizer_call_sites:normalizerCalls,scope:'inspected non-test backend source only; textual search is not runtime attestation'},gc_task:{logs:remote,latest_failure:failed.log,sha256:failed.log_sha256,remote_started:false,actual_cases:0,new_actual_receipt_found:false},scopes,changes_to_running_code:false,registry_or_approval_rewritten:false,dependencies_installed:false,build_or_test_products_created:false,remote_executed:false,original_six_scopes_complete:false};
fs.writeFileSync(path.join(root,prefix+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:prefix+'.json',inventory_exit:gates[0].native_exit,strict_exit:gates[1].native_exit,policy_pending:contract.summary.policy_pending,pending_policy_by_owner:Object.fromEntries(Object.entries(grouped).map(([owner,items])=>[owner,items.length])),missing_catalog_schemas:contract.blockers.plan_control_without_inventory,missing_artifacts:contract.blockers.missing_artifacts,proof_implementations:implementations.length,normalizer_call_sites:normalizerCalls.length,new_gc_task_actual_receipt:false,scopes_complete:0},null,2));
