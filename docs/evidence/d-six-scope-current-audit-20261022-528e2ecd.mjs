import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildRegistry} from '../../scripts/system-backup-contract-check.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='docs/evidence/d-six-scope-current-audit-20261022-528e2ecd';
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
if(process.argv.includes('--prepare')){const files=pinInputs();fs.writeFileSync(path.join(root,prefix+'-source-before.json'),JSON.stringify({kind:'d_read_only_completion_audit_before',source_sha256:digest(files),files},null,2)+String.fromCharCode(10),{flag:'wx'});console.log('PREPARED audit inputs='+files.length);process.exit(0);}
const initial=read(prefix+'-source-before.json'),native=read(prefix+'-native.json');assert.equal(initial.source_sha256,digest(initial.files));
const gates=[];for(const name of ['inventory','contract']){const capture=native.gates.find(g=>g.name===name);assert.ok(capture);assert.equal(decode(bytes(capture.stderr)).trim(),'');const result=read(capture.stdout);gates.push({...capture,result,stdout_sha256:sha(bytes(capture.stdout)),stderr_sha256:sha(bytes(capture.stderr))});}
assert.equal(gates[0].native_exit,0,'Inventory check must pass');assert.equal(gates[1].native_exit,1,'Strict blockers need inspection if status changed');
const registry=buildRegistry(),contract=gates[1].result;const grouped={};for(const o of registry.objects.filter(o=>o.decision_status==='pending_owner_review'))(grouped[o.owner]??=[]).push(o.object_type+':'+o.name);
const live=decode(bytes('backend/cmd/server/system_backup_read_live.go'));assert.ok(live.includes('if kind == systembackupread.VerificationTask'));assert.ok(live.includes('ReadVerificationDetailDTO'));assert.ok(live.includes('admin.GET(route.path+"/:id", unavailable)'));
const logs=fs.readdirSync(path.join(root,'docs/evidence')).filter(n=>/^d-(?:verification-detail|download-gc-freeze)-remote-.*\.txt$/.test(n)).sort(compare).map(n=>{const p='docs/evidence/'+n,b=bytes(p);return {path:p,size:b.length,sha256:sha(b)};});
const after=pinInputs();assert.equal(digest(after),initial.source_sha256,'Read-only audit inputs changed');const sourcePath=prefix+'-source.json';fs.writeFileSync(path.join(root,sourcePath),JSON.stringify({kind:'d_read_only_completion_audit_inputs',files:after,source_sha256:digest(after),stable_read_verified:true},null,2)+String.fromCharCode(10),{flag:'wx'});
const report={kind:'d_six_scope_current_dependency_audit',recorded_utc:new Date().toISOString(),status:'incomplete_external_materials_and_actual_results_needed',source:{path:sourcePath,sha256:sha(bytes(sourcePath)),files:after.length,input_digest:digest(after),stable_read_verified:true},native:{path:prefix+'-native.json',sha256:sha(bytes(prefix+'-native.json'))},audit_scripts:[prefix+'.ps1',prefix+'.mjs'].map(p=>({path:p,sha256:sha(bytes(p))})),gates,pending_policy_by_owner:grouped,adapter_delivery:{B:'user_confirmed_not_delivered',C:'user_confirmed_not_delivered'},actual_result_logs_observed:logs,actual_result_search_scope:'local docs/evidence names and bytes only; no remote query',http_source_observation:{verification_history:'wired',other_three_details:'unavailable',source:'backend/cmd/server/system_backup_read_live.go',runtime_verified_by_this_audit:false},scopes:[{id:1,status:'incomplete',remaining:['Owner policies and cross reviews','missing catalog schemas/artifacts and observed schema hash','actual deployment grants, physical capacity, production adapters and workload/index acceptance']},{id:2,status:'incomplete',remaining:['actual verification-history HTTP/MySQL result for the newly prepared cases','current authoritative Owner facts for overview and other three details','logs/manifest and remaining catalog/prune/promotion readers']},{id:3,status:'incomplete',remaining:['B production capture/target/clock/fence/transaction writer','D nine-table normalization and reviewed resource mappings','actual D production orchestration and full large-smoke']},{id:4,status:'not_proven_for_real_deployment',remaining:['management mTLS and upper authorization','independent physical audit volume and reservation','single-writer takeover and actual IO faults']},{id:5,status:'not_proven_for_real_installation',remaining:['original historical SQL, ledger and canonical inputs','reviewed upgrade/deployment authorization','human MFA and activation transaction']},{id:6,status:'incomplete',remaining:['real backend/Owner/browser end-to-end','four deployment matrices','specified large-smoke data and measured resources/deadlines']}],registry_or_approval_rewritten:false,changes_to_running_code:false,dependencies_installed:false,build_or_test_products_created:false,remote_executed:false,original_six_scopes_complete:false};
fs.writeFileSync(path.join(root,prefix+'.json'),JSON.stringify(report,null,2)+String.fromCharCode(10),{flag:'wx'});console.log(JSON.stringify({report:prefix+'.json',source_files:after.length,inventory: gates[0].result.summary,strict_exit:gates[1].native_exit,contract:contract.summary,migration_catalog:contract.migration_catalog,missing_artifacts:contract.blockers.missing_artifacts,missing_catalog_schemas:contract.blockers.plan_control_without_inventory,schema_hash_pending:contract.blockers.schema_hash_pending,pending_policy_by_owner:Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,v.length])),actual_logs:logs.map(p=>p.path),scopes_complete:0},null,2));
