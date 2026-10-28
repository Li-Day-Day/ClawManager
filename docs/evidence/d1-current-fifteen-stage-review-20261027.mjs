import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
import {validateSupplementInventory} from './d2-owner-entry-supplement-inventory-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const local=p=>{const f=path.resolve(root,p);assert.ok(f.startsWith(root+path.sep));return f;};
const raw=p=>fs.readFileSync(local(p));
const text=b=>b.toString('utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(text(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rel=p=>path.relative(root,local(p)).replaceAll('\\','/');
assert.ok(process.argv.slice(2).length<=1&&process.argv.slice(2).every(x=>x==='--check'));
const token='2d061b75213d45d1af1b29acfda4ee95';
const prefix='docs/evidence/d2-owner-entry-supplement-'+token;
const receipt=prefix+'.json',r=json(receipt),owner=path.join(root,'.tmp-d-index-cache-'+token);
assert.equal(r.kind,'d2_owner_current_baseline_supplement.v1');assert.equal(r.error,null);
for(const k of ['Go_started','tests_started','frozen_postcheck','owner_removed'])assert.equal(r[k],true,k);
for(const k of ['dependencies_installed','remote_contacted','actual_mysql','production_approved','current_baseline_accepted'])assert.equal(r[k],false,k);
assert.equal(r.owner,owner);assert.equal(fs.existsSync(owner),false);assert.equal(r.steps.length,15);
const manifest=json(r.source);assert.equal(manifest.files.length,1718);assert.equal(sourceDigest(manifest.files),'4003f0f06aae84ff8d2da3640203cf4a14de97cdc5c8b05e3523808004c95964');
assert.equal(manifest.source_sha256,sourceDigest(manifest.files));assert.deepEqual(enumerate(root),manifest.files,'live source bytes or set changed');
const ordinaryReceipt='docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b.json',ordinary=json(ordinaryReceipt);
assert.deepEqual(manifest.files,json(ordinary.source_manifest).files);
const helperPins=[[r.runner,r.runner_sha256],['docs/evidence/d-local-closeout-snapshot-20261023.mjs',r.snapshotter_sha256],['docs/evidence/a-owner-entry-counterexamples-prepare-20261026.mjs',r.counterexample_helper_sha256],['docs/evidence/d2-owner-current-supplement-inventory-20261027.mjs',r.inventory_checker_sha256],...r.scope_artifacts.map(p=>[p.path,p.sha256])];
for(const [p,h]of helperPins)assert.equal(sha(raw(p)),h,p);
assert.equal(sha(raw(r.entry_validation)),r.entry_validation_sha256);
const parent=json(r.entry_validation);assert.equal(parent.status,'failed');assert.equal(parent.full_exit,0);assert.equal(parent.cleaned,true);assert.equal(parent.actual_mysql_executed,false);assert.equal(parent.actual_sql_cases_executed,0);
const parentLog=r.entry_validation.replace(/\.json$/,'.full.jsonl');
const rows=text(raw(parentLog)).trim().split(/\r?\n/).map(JSON.parse).filter(x=>x.Package==='clawreef/internal/systembackupevidence');
const parentNames=validateGoEvents(rows.map(x=>JSON.stringify(x)).join('\n'),'clawreef/internal/systembackupevidence');
for(const [i,s]of r.steps.entries()){
 assert.equal(s.exit_code,i>=13?1:0);assert.equal(sha(raw(s.log)),s.sha256);
 if(i!==7){assert.equal(s.attempts.length,1);const a=s.attempts[0];assert.equal(a.attempt,1);assert.equal(a.exit_code,s.exit_code);assert.equal(a.log,s.log);assert.equal(a.sha256,s.sha256);assert.equal(a.known_tool_crash,false);assert.equal(a.assertion_failure,i>=13);}
}
const seed=(pattern,pkg)=>['go','test','-json','-tags','systembackup_mysql','-run',pattern,'-count=1','-timeout=2700s',pkg];
const compile=(name,pkgs,vet=true)=>['go','test',...vet?[]:['-vet=off'],'-c','-tags','systembackup_mysql','-o',path.join(owner,'binary',name),...pkgs];
const http=['./cmd/server/system_backup_read_live.go','./cmd/server/system_backup_read_cursor_key.go','./cmd/server/system_backup_read_live_test.go','./cmd/server/system_backup_read_cursor_key_test.go','./cmd/server/system_backup_read_live_mysql_test.go','./cmd/server/system_backup_read_verification_history_mysql_test.go','./cmd/server/system_backup_read_drill_history_mysql_test.go'];
const ownerPattern='^Test(ASQLTaskDownloadOwnersMySQLSeed|ADownloadAdmissionMySQLSeed|ASensitiveDownloadMFAMySQLSeed)$';
const commands=[seed('^TestDDownloadGCFull(Collect|Profile|Lifecycle)MySQLSeed$','./internal/systembackupevidence'),compile('current-evidence.test',['./internal/systembackupevidence'],false),seed('^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$','./internal/systembackupresources'),[...seed('^TestDDrillDetailHTTPSeed$','').slice(0,-1),...http],seed('^TestAAdminReadMySQLSeed$','./internal/systembackupsecurity'),seed(ownerPattern,'./internal/systembackupevidence'),compile('owner-seeds.exe',['./internal/systembackupevidence']),[path.join(owner,'binary/owner-seeds.exe'),'-test.run',ownerPattern,'-test.v','-test.count=1','-test.timeout=2700s'],compile('resources.test',['./internal/systembackupresources']),compile('drill-http.test',http),compile('admin-read.test',['./internal/systembackupsecurity']),['go','test','-json','-count=1','-timeout=2700s','.'],['go','test','-c','-o',path.join(owner,'binary/freeze-finalizer.test'),'.'],...['missing_finalizer','earlier_clock_floor'].map((name,i)=>['go','test','-json','-count=1','-timeout=2700s','-overlay',path.join(owner,'entry-owner-counterexamples',name+'.json'),'-run',i?'^TestDownloadGCFinalizerProtectedCandidate$/^clock_intermediate_rollback$':'^TestDownloadGCFinalizerProtectedCandidate$/^worker_claim$','./internal/systembackupevidence'])];
for(let i=0;i<15;i++){assert.deepEqual(r.steps[i].command,commands[i],`command ${i}`);assert.equal(r.steps[i].platform,[1,8,9,10,12].includes(i)?'linux':'windows');}
assert.equal(r.steps[7].working_directory,path.join(owner,'detached/work/probe'));assert.equal(r.steps[7].initial_directory_empty,true);
const standaloneNames=['download_retention_gc_freeze.go','download_retention_gc_freeze_test.go','download_retention_gc_freeze_a_test.go','download_retention_gc_finalize.go','download_retention_gc_finalize_test.go'];
const standaloneSources=Object.fromEntries(standaloneNames.map(n=>[n,text(raw('backend/internal/systembackupevidence/'+n))]));
const inventory=validateSupplementInventory({steps:r.steps.slice(2),read:raw,standaloneSources,parentEvidenceNames:parentNames});
for(const [k,v]of Object.entries(inventory))assert.deepEqual(r.native_inventory[k],v,k);
const gcNames=validateGoEvents(text(raw(r.steps[0].log)),'clawreef/internal/systembackupevidence');assert.deepEqual(gcNames,['TestDDownloadGCFullCollectMySQLSeed','TestDDownloadGCFullLifecycleMySQLSeed','TestDDownloadGCFullProfileMySQLSeed']);assert.deepEqual(r.native_inventory.gc_seed_names,gcNames);
assert.equal(r.native_inventory.stages,15);assert.equal(r.native_inventory.parent_stage_inventory_only,true);assert.equal(r.native_inventory.parent_status_observed,'failed');assert.equal(r.native_inventory.source_scope_acceptance_claimed,false);assert.equal(r.native_inventory.actual_mysql,false);assert.equal(r.native_inventory.linux_binary_executed,false);
const binaryNames=['admin-read.test','current-evidence.test','drill-http.test','freeze-finalizer.test','owner-seeds.exe','resources.test'];assert.deepEqual(r.binaries.map(b=>b.name).sort(),binaryNames);
for(const b of r.binaries){assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.equal(fs.existsSync(path.join(owner,'binary',b.name)),false);}
assert.equal(r.steps[1].binary,path.join(owner,'binary/current-evidence.test'));assert.equal(r.steps[1].binary_sha256,r.binaries.find(b=>b.name==='current-evidence.test').sha256);assert.equal(r.native_inventory.current_linux_evidence_binary_sha256,r.steps[1].binary_sha256);
const counterPath='docs/evidence/a-owner-entry-counterexamples-'+token+'.json',counter=json(counterPath);assert.equal(counter.kind,'a_owner_entry_counterexamples.v1');assert.equal(counter.records.length,2);
const mutations=[['missing_finalizer','download_retention_gc_freeze.go','\tif finalize != nil && finalize(ctx, tx) != nil {\n\t\treturn out, errDownloadGCFreezeDenied\n\t}\n',''],['earlier_clock_floor','download_retention_gc.go','\tif now, err = clock(ctx, tx, now, until); err != nil {','\tif _, err = clock(ctx, tx, now, until); err != nil {']];
for(let i=0;i<2;i++){const c=counter.records[i],[name,file,before,after]=mutations[i],original=raw('backend/internal/systembackupevidence/'+file);assert.equal(c.name,name);assert.equal(c.original,path.join(owner,'source/backend/internal/systembackupevidence',file));assert.equal(c.original_sha256,sha(original));const source=text(original).replaceAll('\r\n','\n');assert.equal(source.split(before).length,2);const changed=Buffer.from(source.replace(before,()=>after));assert.deepEqual(Buffer.from(c.replacement_bytes_base64,'base64'),changed);assert.equal(sha(changed),c.replacement_sha256);const overlay=Buffer.from(JSON.stringify({Replace:{[c.original]:path.join(owner,'entry-owner-counterexamples',name+'.go')}})+'\n');assert.equal(sha(overlay),c.overlay_sha256);assert.equal(c.expected_native_exit,1);}
const scope=r.source_binding.independent_scope_check;assert.equal(scope.status,'ready_for_fifteen_stage_local_supplement_only');assert.equal(scope.native_start_authorized,true);assert.equal(scope.current_baseline_ready,false);assert.equal(scope.actual_sql_authorized,false);assert.equal(r.source_binding.parent_final_postcheck_retroactively_claimed,false);assert.equal(r.source_binding.current_baseline_accepted,false);
const files=[receipt,r.source,ordinaryReceipt,ordinary.source_manifest,r.entry_validation,parentLog,counterPath,...r.steps.map(s=>s.log),...helperPins.map(p=>p[0]),'docs/evidence/d1-current-fifteen-stage-review-20261027.mjs'];
const result={kind:'d1_current_fifteen_stage_independent_review.v1',status:'accepted_exact_native_fifteen_stage_supplement_only',native_receipt:receipt,source_sha256:manifest.source_sha256,source_inputs:1718,current_source_bytes_and_set_match:true,same_source_as_ordinary_eight_stage:true,stage_count:15,successful_stages:13,expected_assertion_failure_stages:2,commands_and_original_log_hashes_checked:true,gc_seed_names:gcNames,...inventory,binary_compile_exits_and_recorded_hashes_checked:true,binary_bytes_reinspected_after_cleanup:false,linux_binary_executed:false,linux_evidence_compile_vet_disabled:true,other_stages_vet_unchanged:true,frozen_postcheck:true,owner_independently_absent:true,all_owned_build_products_removed:true,failed_parent_reclassified:false,parent_final_postcheck_retroactively_claimed:false,current_baseline_accepted:false,formal_GC_operator_source_accepted:false,actual_mysql:false,actual_sql_cases_executed:0,production_approved:false,dependencies_installed:false,Go_repeated_by_D1:false,whole_goal_complete:false,artifacts:[...new Set(files.map(rel))].map(p=>({path:p,sha256:sha(raw(p))}))};
const output=local('docs/evidence/d1-current-fifteen-stage-reviewed-20261027-2d061.json');if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),result);else fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('CURRENT_FIFTEEN_STAGE_REVIEWED source=4003f0f0 inputs=1718 stages=15 exits=13zero+2expected roots=GC3 cleanup=yes whole_baseline=no actual_sql=0');
