import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { reviewDrill } from '../docs/evidence/d-drill-http-review-20261023.mjs';
import { validateReceipt, validateManifest, validateGoEvents } from '../docs/evidence/d-resources-mysql-actual-review-20261023.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'docs/evidence');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => JSON.parse(fs.readFileSync(name,'utf8').replace(/^\uFEFF/,''));
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  if(['--write','--check'].includes(args[i]))continue;
  assert.ok(['--resources','--ui','--freeze-request','--dispatch','--drill','--strict','--receiver-proof','--out'].includes(args[i])&&args[i+1],'invalid review arguments');
  assert.equal(options[args[i]],undefined);options[args[i]]=path.resolve(root,args[++i]);
}
for(const value of Object.values(options))assert.ok(value.startsWith(root+path.sep),'review input outside repository');
const latest = pattern => {
  const names = fs.readdirSync(evidence).filter(name => pattern.test(name)).sort((a,b) => fs.statSync(path.join(evidence,b)).mtimeMs-fs.statSync(path.join(evidence,a)).mtimeMs);
  assert.ok(names.length,'missing completed validation receipt');
  return path.join(evidence,names[0]);
};
const walk = directory => fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(directory,entry.name)) : [path.join(directory,entry.name)]);
const events = name => fs.readFileSync(name,'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line.replace(/^\uFEFF/,'')));
const passing = rows => {
  assert.equal(rows.filter(row=>row.Action==='fail'||row.Action==='skip').length,0,'failed/skipped tests');
  assert.ok(rows.some(row=>row.Action==='pass'&&!row.Test),'missing package completion');
  const tests=rows.filter(row=>row.Action==='pass'&&row.Test).map(row=>row.Test);
  assert.equal(tests.length,new Set(tests).size,'duplicate passing tests');
  return {roots:tests.filter(name=>!name.includes('/')).length,events:tests.length,names:tests};
};
const ownerAbsent = owner => {
  assert.equal(path.dirname(path.resolve(owner)),root,'owner outside repository');
  assert.match(path.basename(owner),/^\.tmp-d-(?:index-cache|freeze-protocol|backups-ui)-[0-9a-f]{32}$/);
  assert.equal(fs.existsSync(owner),false,'owned artifacts still exist');
};

const dispatchPath=options['--dispatch'];const dispatch=dispatchPath?read(dispatchPath):null;
if(dispatch){
 assert.equal(dispatch.kind,'d_local_dispatch_validation.v1');assert.equal(dispatch.error,null);assert.equal(dispatch.owner_removed,true);assert.equal(fs.existsSync(dispatch.owner),false);
 assert.equal(dispatch.actual_mysql,false);assert.equal(dispatch.actual_kubectl,false);assert.equal(dispatch.dependencies_installed,false);
 assert.deepEqual(dispatch.steps.map(step=>step.suite),['resources','drill']);
 for(const pin of dispatch.inputs)assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256,'dispatch source drift');
 for(const step of dispatch.steps){assert.equal(step.exit_code,0);const bytes=fs.readFileSync(step.log);assert.equal(hash(bytes),step.log_sha256);const lines=bytes.toString('utf8').trim().split(/\r?\n/);assert.equal(lines.length,step.suite==='resources'?13:7);assert.ok(lines.every(line=>/^PASS (?:resources-)?dispatch=\S+ actual_mysql=no actual_kubectl=no$/.test(line)));}
}
const resourcesPath=options['--resources']??latest(/^d-resources-mysql-\d{8}-\d{6}-[0-9a-f]{8}\.json$/);
const resources=read(resourcesPath);assert.equal(resources.error,null);assert.equal(resources.owner_removed,true);ownerAbsent(resources.owner);
validateReceipt(resources,{suite:resources.suite??'readback',actual:false});
validateGoEvents(fs.readFileSync(resources.steps[0].log,'utf8'));validateGoEvents(fs.readFileSync(resources.steps[1].log,'utf8'));
assert.equal(resources.remote_requested,false,'this receiver accepts local preparation only');
assert.equal(resources.dependencies_installed,false);assert.equal(resources.steps.length,4);
for(const [i,step]of resources.steps.entries()){
  assert.equal(step.exit_code,0);assert.equal(hash(fs.readFileSync(step.log)),step.log_sha256);
  assert.equal(step.platform,i<2?'windows':'linux');assert.equal(step.command[0],'go');
  assert.ok(!step.command.some(value=>/^-vet=off$|^-run=\^\$$/.test(value)));
}
assert.ok(resources.steps[0].command.includes('./internal/systembackupresources'));
assert.ok(resources.steps[0].command.includes('-json'));
const fkSeeds=resources.steps[1].command.includes('^Test(DResources(Readback|Write)|AResourcesWriteFK)MySQLSeed$');
const sharedSeeds=fkSeeds||resources.steps[1].command.includes('^TestDResources(Readback|Write)MySQLSeed$');
assert.ok(sharedSeeds||resources.steps[1].command.includes('^TestDResourcesReadbackMySQLSeed$'));
assert.ok(resources.steps[2].command.includes('-c'));assert.ok(resources.steps[3].command.includes('./cmd/system-backup-migrate'));
const resourceEvents=passing(events(resources.steps[0].log));const seedEvents=passing(events(resources.steps[1].log));
assert.deepEqual([...seedEvents.names].sort(),fkSeeds?['TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed']:sharedSeeds?['TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed']:['TestDResourcesReadbackMySQLSeed']);
for(const name of ['TestRestoreFiveCompositionThroughReadback','TestRestoreFiveCombinedBudgetAndAtomicFailure/split_user_mapping','TestRestoreFiveCombinedBudgetAndAtomicFailure/split_instance_mapping','TestRestoreFiveCombinedBudgetAndAtomicFailure/merged_user_mapping'])assert.ok(resourceEvents.names.includes(name));
const previous=passing(events(path.join(evidence,'d-resources-rules-local-a7788a3e6b8a474db6fb5bb667aa36cd.jsonl')));
assert.ok(previous.names.every(name=>resourceEvents.names.includes(name)),'previous complete resources cases lost');
if(fkSeeds){const fixed=passing(events(path.join(evidence,'a-writer-fk-20261023-134215-75d1f525-fixed.jsonl')));assert.equal(fixed.events,843);assert.ok(fixed.names.every(name=>resourceEvents.names.includes(name)),'writer FK regression coverage lost');}
const resourceSource=read(resources.source);
validateManifest(resourceSource);
const sourcePrefix='backend/internal/systembackupresources/';
const resourcePins=resourceSource.files.filter(pin=>pin.path.startsWith(sourcePrefix)||pin.path.startsWith('backend/internal/db/migrations/')||['backend/go.mod','backend/go.sum','contracts/system-backup/v12/schema-registry.json','scripts/system-backup-d-resources-mysql-validation.ps1','scripts/system-backup-d-resources-mysql-inputs.mjs','scripts/system-backup-d-resources-readback-phase.sh'].includes(pin.path));
const composedDrift=[];
for(const pin of resourcePins){const current=hash(fs.readFileSync(path.join(root,pin.path)));if(current!==pin.sha256&&pin.path==='scripts/system-backup-d-resources-readback-phase.sh'&&dispatch){assert.equal(dispatch.inputs.find(input=>input.path===pin.path)?.sha256,current);composedDrift.push(pin.path);}else assert.equal(current,pin.sha256,`resources preparation drift: ${pin.path}`);}
assert.deepEqual(walk(path.join(root,sourcePrefix)).map(name=>path.relative(root,name).replaceAll('\\','/')).sort(),resourcePins.filter(pin=>pin.path.startsWith(sourcePrefix)).map(pin=>pin.path).sort());
for(const name of ['binary_sha256','migration_binary_sha256','inputs_sha256'])assert.match(resources[name],/^[a-f0-9]{64}$/);
const probeSource=fs.readFileSync(path.join(root,'backend/internal/systembackupresources/restore_readback_mysql_test.go'),'utf8');
assert.equal([...probeSource.matchAll(/\bt\.Run\("/g)].length,12);
if(sharedSeeds){
  // WriterOnly changes remote dispatch/result labels, never the local test,
  // seed, probe or migration build. A shared local receipt therefore backs
  // default readback preparation too; it proves no actual SQL in either mode.
  const wrapper=fs.readFileSync(path.join(root,'scripts/system-backup-d-resources-mysql-validation.ps1'),'utf8');
  const beforeRemote=wrapper.slice(0,wrapper.indexOf('    if($Remote){'));
  assert.equal((beforeRemote.match(/\$WriterOnly/g)||[]).length,fkSeeds?2:1);
  const phase=fs.readFileSync(path.join(root,'scripts/system-backup-d-resources-readback-phase.sh'),'utf8');
  assert.equal((phase.match(/^resources_mysql_suite=readback$/gm)||[]).length,1);
  assert.match(phase,/readback\) (?:test_name="\^TestDResourcesReadbackMySQL\$"|test_root=TestDResourcesReadbackMySQL)/);
}
const fixtureTTL=Number(probeSource.match(/VALUES\('installation_resources_probe','installation',(\d+)\)/)[1]);
const ttlBounds=fs.readFileSync(path.join(root,'backend/internal/db/migrations/068_add_system_backup_coordination_observability.sql'),'utf8').match(/lock_ttl_seconds BETWEEN (\d+) AND (\d+)/);
assert.ok(fixtureTTL>=Number(ttlBounds[1])&&fixtureTTL<=Number(ttlBounds[2]),'control negative fixture violates real migration TTL CHECK');

const freezePath=latest(/^d-gc-freeze-protocol-[0-9a-f]{32}\.json$/);const freeze=read(freezePath);
assert.equal(freeze.error,null);assert.equal(freeze.exit_code,0);assert.equal(freeze.linux_build_exit,0);assert.equal(freeze.inputs_stable,true);assert.equal(freeze.owner_removed,true);ownerAbsent(freeze.owner);
assert.equal(freeze.collector_wired,false);assert.equal(freeze.role_approved,false);assert.equal(freeze.actual_mysql,false);
for(const pin of read(freeze.source)){assert.equal(hash(Buffer.from(pin.bytes_base64,'base64')),pin.sha256);assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256,`freeze candidate drift: ${pin.path}`)}
const freezeEvents=passing(events(freeze.log));
for(const name of ['TestDownloadGCFreezeCandidateFailures/identity_changed','TestDownloadGCFreezeCandidateFailures/commit','TestDownloadGCFreezeCandidateFailures/rollback','TestDownloadGCFreezeCandidateFailures/release_probe','TestDownloadGCFreezeCandidateFailures/cancel_after_commit'])assert.ok(freezeEvents.names.includes(name));
const peerPath=path.join(evidence,'a-gc-freeze-nil-reviewed-20261023.json');const peer=read(peerPath);
assert.equal(peer.pass_events,33);assert.equal(peer.production_approved,false);assert.equal(peer.owner_absent,true);
assert.equal(hash(fs.readFileSync(path.join(root,peer.fixed_candidate.path))),peer.fixed_candidate.sha256);
for(const pin of peer.inputs)assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256);

const uiPath=options['--ui']??latest(/^d-backups-ui-local-[0-9a-f]{32}\.json$/);const ui=read(uiPath);
assert.equal(ui.error,null);assert.equal(ui.inputs_stable,true);assert.equal(ui.owner_removed,true);ownerAbsent(ui.owner);assert.equal(ui.dependencies_installed,false);assert.equal(ui.steps.length,13);
let nodeTests=0;
for(const [i,step]of ui.steps.entries()){
  assert.equal(step.exit_code,0);const log=fs.readFileSync(step.log);assert.equal(hash(log),step.log_sha256);
  if(i<10){const text=log.toString('utf8');const count=text.match(/(?:ℹ|#) tests (\d+)/u);assert.ok(count,'missing complete node:test summary');nodeTests+=Number(count[1]);assert.match(text,/(?:ℹ|#) fail 0/u);assert.match(text,/(?:ℹ|#) skipped 0/u)}
}
assert.ok(ui.steps[10].arguments.includes('tsconfig.app.json'));assert.ok(ui.steps[11].arguments.includes('vite.backups-ui-lab.config.ts'));assert.ok(ui.steps[12].arguments.includes('build'));
for(const pin of read(ui.source))assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256,`UI input drift: ${pin.path}`);

const browserPath=path.join(evidence,'d-backups-ui-browser-20261023.json');const browser=read(browserPath);const findings=new Map(browser.findings.map(item=>[item.case,item]));
const text = name => {assert.ok(findings.has(name),`missing browser case ${name}`);return findings.get(name).text};
assert.match(text('backup_detail'),/Artifact readability\nReadable/);
assert.match(text('drill_detail'),/Cleanup status\nRunning/);assert.match(text('drill_detail'),/Drill eligibility\nNot eligible/);
assert.match(text('expired_preflight_detail'),/Report expired/);
assert.match(text('verification_detail'),/Readability before\nUnreadable/);assert.match(text('verification_detail'),/Readability after\nReadable/);
for(const name of ['stale_detail_rejected','cross_installation_rejected','malformed_detail_rejected']){assert.match(text(name),/Could not load backup information/);assert.ok(!text(name).includes('Execution status'))}
assert.match(text('partial_records_without_health'),/The overview is not ready/);assert.ok(!text('partial_records_without_health').includes('Dependency health'));
const canceled=findings.get('detail_cancel');assert.equal(canceled.detailCount,0);assert.ok(JSON.parse(canceled.stats).abortedDetails>=1);assert.equal(JSON.parse(canceled.stats).activeDetails,0);
assert.match(text('unavailable'),/测试接口尚未就绪/);
assert.match(text('polling_revocation_without_remount'),/Loading failed/);assert.ok(!text('polling_revocation_without_remount').includes('Backup records'));
const afterPoll=JSON.parse(text('polling_revocation_without_remount').match(/\{"requests":[^\n]+\}/)[0]);assert.ok(afterPoll.requests>JSON.parse(findings.get('polling_before_revoke').stats).requests);
assert.match(text('download_ready'),/19 bytes/);assert.match(text('download_ready'),/cb8daed7b30399a1c3c8b83b3b7bee4b774a30fc389afc1d375e4c23a3cc4ae8/);
assert.match(text('download_session_change'),/Your login session changed/);assert.ok(!text('download_session_change').includes('Save file'));
assert.match(text('download_permission_denied'),/Your account cannot download/);assert.equal(findings.get('download_unmount_cancels').downloadForms,0);assert.match(text('download_unmount_cancels'),/取消 1/);
const screenshot=fs.readFileSync(path.join(evidence,'d-backups-ui-browser-20261023.jpg'));assert.ok(screenshot.length>5000);assert.deepEqual([...screenshot.subarray(0,3)],[255,216,255]);
const manualOwner=path.join(root,'.tmp-d-backups-ui-20261023');assert.equal(fs.existsSync(manualOwner),false,'manual browser artifacts not cleaned');
const browserCleanupPath=path.join(evidence,'d-backups-ui-cleanup-20261023.json');const browserCleanup=read(browserCleanupPath);
assert.equal(browserCleanup.owner_removed,true);assert.equal(browserCleanup.port_available,true);assert.equal(browserCleanup.browser_tab_closed,true);
const requestPath=options['--freeze-request']??path.join(evidence,'d-gc-freeze-protocol-review-request-20261023.json');const request=read(requestPath);
assert.equal(request.production_approved,false);assert.equal(request.collector_wired,false);
for(const pin of request.inputs)assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256);

const selected=[resourcesPath,resources.source,...resources.steps.map(step=>step.log),freezePath,freeze.source,freeze.log,peerPath,...peer.inputs.map(pin=>path.join(root,pin.path)),uiPath,ui.source,...ui.steps.map(step=>step.log),browserPath,browserCleanupPath,path.join(evidence,'d-backups-ui-browser-20261023.jpg'),requestPath,fileURLToPath(import.meta.url)];
const drill=options['--drill']?reviewDrill(options['--drill'],{actual:false}):null;
if(drill)selected.push(...drill.artifacts.map(pin=>path.join(root,pin.path)),path.join(root,'docs/evidence/d-drill-http-review-20261023.mjs'));
if(dispatch)selected.push(dispatchPath,...dispatch.steps.map(step=>step.log),...dispatch.inputs.map(pin=>path.join(root,pin.path)));
let formalGates=null;
if(options['--strict']){
 const checks=read(options['--strict']);assert.deepEqual(checks.map(item=>item.name),['schema-inventory','contract-check']);
 const results=checks.map(item=>{assert.equal(item.native_exit,1);const file=path.resolve(root,item.log);assert.ok(file.startsWith(evidence+path.sep));const bytes=fs.readFileSync(file);assert.equal(hash(bytes),item.sha256);selected.push(file);return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));});
 assert.equal(results[0].summary.plan_control_without_inventory,3);assert.equal(results[1].summary.policy_pending,40);assert.equal(results[1].summary.cross_review_pending,60);assert.equal(results[1].blockers.missing_artifacts.length,4);assert.equal(results[1].blockers.schema_hash_pending,true);
 formalGates={native_exits:checks.map(item=>item.native_exit),planned_catalog_tables_missing:3,missing_contracts:4,policy_pending:40,cross_review_pending:60,schema_hash_pending:true};selected.push(options['--strict']);
}
const receiverTests=[];
if(drill){
 const proofPath=options['--receiver-proof'];assert.ok(proofPath,'explicit current receiver native proof required');
 const proof=read(proofPath);assert.equal(proof.kind,'d_readiness_receiver_validation.v1');assert.equal(proof.error,null);assert.equal(proof.inputs_stable,true);assert.equal(proof.actual_mysql,false);assert.equal(proof.dependencies_installed,false);
 assert.deepEqual(proof.steps.map(step=>step.suite),['resources','drill','A_FK_compatibility','A_writer_compatibility']);
 for(const pin of proof.inputs){assert.equal(hash(fs.readFileSync(path.join(root,pin.path))),pin.sha256,'receiver native proof source drift');selected.push(path.join(root,pin.path));}selected.push(proofPath);
 for(const [name,count,log,modules] of [
  ['resources',64,null,['d-resources-mysql-actual-review-20261023.mjs','d-resources-mysql-actual-review-20261023.test.mjs']],
  ['drill',52,'d-drill-http-receiver-tests-20261023-r4.txt',['d-drill-http-review-20261023.mjs','d-drill-http-review-20261023.test.mjs']],
  ['A_FK_compatibility',27,'d-a-fk-receiver-final-tests-20261023-r2.txt',['a-resources-writer-fk-actual-review-20261023.mjs','a-resources-writer-fk-actual-review-20261023.test.mjs']],
  ['A_writer_compatibility',14,'d-a-writer-receiver-final-tests-20261023.txt',['a-resources-writer-actual-review-20261023.mjs','a-resources-writer-actual-review-20261023.test.mjs']],
 ]){
  const step=proof.steps.find(item=>item.suite===name);assert.equal(step.tests,count);assert.equal(step.exit_code,0);assert.deepEqual(step.args,['--test','--test-isolation=none','docs/evidence/'+modules[1]]);
  for(const module of modules)assert.ok(proof.inputs.some(pin=>pin.path==='docs/evidence/'+module),'receiver proof module missing');
  const file=path.resolve(root,step.log.path);assert.ok(file.startsWith(evidence+path.sep));assert.equal(hash(fs.readFileSync(file)),step.log.sha256);const text=fs.readFileSync(file,'utf8');assert.match(text,new RegExp('(?:ℹ|#) tests '+count+'(?:\\r?\\n|$)','u'));assert.match(text,new RegExp('(?:ℹ|#) pass '+count+'(?:\\r?\\n|$)','u'));for(const label of ['fail','cancelled','skipped','todo'])assert.match(text,new RegExp('(?:ℹ|#) '+label+' 0(?:\\r?\\n|$)','u'));
  selected.push(file,...modules.map(module=>path.join(evidence,module)));receiverTests.push({suite:name,tests:count,actual_mysql:false});
 }
}
const result={kind:'d_independent_four_work_review.v1',scope:'four_D_preparation_deliverables_not_full_restore_or_GC',resources:{roots:resourceEvents.roots,pass_events:resourceEvents.events,previous_cases_preserved:previous.events,mysql_seed:seedEvents.events,shared_local_preparation:sharedSeeds,local_preparation_suite:resources.suite??'readback',remote_run:false,prepared_mysql_cases:12,receipt:path.relative(root,resourcesPath).replaceAll('\\','/')},freeze:{roots:freezeEvents.roots,pass_events:freezeEvents.events,A_typed_nil_pass_events:peer.pass_events,linux_compiled:true,collector_wired:false,role_approved:false,receipt:path.relative(root,freezePath).replaceAll('\\','/')},frontend:{node_tests:nodeTests,app_typecheck:true,lab_config_typecheck:true,production_build:true,browser_observations:findings.size,actual_business_backend:false,receipt:path.relative(root,uiPath).replaceAll('\\','/')},cleanup:true,dependencies_installed:false,cross_owner_review:false,production_approved:false,inputs:selected.map(name=>({path:path.relative(root,name).replaceAll('\\','/'),sha256:hash(fs.readFileSync(name))}))};
result.resources.current_phase_covered_by_mocked_dispatch=composedDrift;result.dispatch=dispatch?{resources_cases:13,drill_cases:7,actual_mysql:false}:null;result.drill=drill;
result.formal_gates=formalGates;
result.receiver_tests=receiverTests;
if(drill){result.kind='d_independent_local_closeout_review.v1';result.scope='D_independent_local_preparation_and_remote_handoff_not_business_restore_or_GC';result.prepared_remote_cases={readback:12,writer:9,writer_fk:10,drill_http:19,total:50};}
const output=options['--out']??path.join(evidence,'d-independent-work-reviewed-20261023.json');
assert.equal(path.dirname(output),evidence);
if(process.argv.includes('--write'))fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',options['--out']?{flag:'wx'}:{});
else assert.deepEqual(read(output),result,'published four-work review differs');
console.log(JSON.stringify({...result,inputs:result.inputs.length}));
