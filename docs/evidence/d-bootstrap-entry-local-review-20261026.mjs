import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const local=name=>{const p=path.resolve(root,name);assert.ok(p.startsWith(root+path.sep));return p;};
const raw=name=>fs.readFileSync(local(name));
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const json=name=>JSON.parse(decode(raw(name)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const relative=name=>path.relative(root,local(name)).replaceAll('\\','/');
const [receiptFile,output,...flags]=process.argv.slice(2);
assert.ok(receiptFile&&output&&flags.every(f=>['--check','--frozen-only'].includes(f))&&new Set(flags).size===flags.length);
const checking=flags.includes('--check'),frozenOnly=flags.includes('--frozen-only');
assert.equal(path.dirname(local(output)),path.join(root,'docs/evidence'));
const r=json(receiptFile),id=path.basename(receiptFile).match(/^d-bootstrap-entry-native-([a-f0-9]{32})\.json$/)?.[1];assert.ok(id);
assert.equal(r.kind,'d_bootstrap_entry_native.v1');assert.equal(r.status,'passed_exact_entry_snapshot');assert.ok(!r.error);
for(const k of ['tests_started','cleaned','snapshot_verified','snapshot_unchanged'])assert.equal(r[k],true,k);
for(const k of ['dependencies_installed','actual_mysql_executed','production_approved'])assert.equal(r[k],false,k);
for(const k of ['targeted_exit','full_exit','seeds_exit','actual_sql_cases_executed'])assert.equal(r[k],0,k);
assert.equal(r.telemetry,'off_owned_directory_verified');
const owner=path.join(root,'.tmp-d-bootstrap-entry-'+id);assert.equal(fs.existsSync(owner),false);
assert.ok(Array.isArray(r.files)&&r.files.length>1000);const sourceMap=new Map();
for(const p of r.files){assert.match(p.path,/^(backend|contracts|scripts|docs)\//);assert.ok(!p.path.includes('\\')&&!p.path.split('/').some(s=>['','.','..'].includes(s)));assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);assert.ok(!sourceMap.has(p.path));sourceMap.set(p.path,p);}
const driver='scripts/system-backup-d-bootstrap-entry-validation.ps1';assert.equal(sha(raw(driver)),r.driver_sha256);assert.equal(sourceMap.get(driver)?.sha256,r.driver_sha256);
const readyFiles=['docs/evidence/a-bootstrap-entry-source-ready-20261026-r2.json','docs/evidence/d2-bootstrap-entry-source-ready-20261026-r2.json','docs/evidence/d-bootstrap-entry-source-ready-20261026-r2.json'];
const ready=readyFiles.map(json);assert.equal(ready[0].kind,'a_bootstrap_entry_source_ready.v1');assert.equal(ready[1].kind,'d_bootstrap_entry_source_ready.v1');assert.equal(ready[2].kind,'d_bootstrap_entry_probe_source_ready.v1');
const nodeOnly=new Set(['docs/evidence/d-bootstrap-entry-mysql-review-20261026.mjs','docs/evidence/d-bootstrap-entry-mysql-review-20261026.test.mjs']);
const selected=new Map();for(const list of ready){assert.equal(list.production_approved,false);for(const p of list.files){if(!nodeOnly.has(p.path))assert.deepEqual(sourceMap.get(p.path),p,'ready pin not in tested snapshot '+p.path);if(!frozenOnly||nodeOnly.has(p.path)){assert.equal(sha(raw(p.path)),p.sha256,'current owned source changed '+p.path);assert.equal(raw(p.path).length,p.size);}selected.set(p.path,p);}}
const runtimeSource=r.files.filter(p=>/^(backend|contracts)\//.test(p.path));
if(!frozenOnly)for(const p of runtimeSource){assert.equal(sha(raw(p.path)),p.sha256,'current backend/contract dependency changed '+p.path);assert.equal(raw(p.path).length,p.size);}
const sourceExtension=/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/;
const currentRuntime=[];const walk=dir=>{for(const e of fs.readdirSync(local(dir),{withFileTypes:true})){if(/^(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)$/.test(e.name))continue;const name=dir+'/'+e.name;assert.equal(e.isSymbolicLink(),false);if(e.isDirectory())walk(name);else if(sourceExtension.test(name))currentRuntime.push(name);}};
if(!frozenOnly){for(const dir of ['backend','contracts'])walk(dir);assert.deepEqual(currentRuntime.toSorted(),runtimeSource.filter(p=>sourceExtension.test(p.path)).map(p=>p.path).toSorted(),'backend/contract file set changed');}
const observedKnownDrift=[];
if(frozenOnly&&checking){
 const historical=json(output).observed_known_source_drift;assert.ok(Array.isArray(historical));
 for(const d of historical){assert.deepEqual(d.frozen,sourceMap.get(d.path));if(d.current){assert.match(d.current.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(d.current.size));}observedKnownDrift.push(d);}
}
if(frozenOnly&&!checking)for(const p of r.files){
 const file=local(p.path);if(!fs.existsSync(file)){observedKnownDrift.push({path:p.path,status:'currently_absent',frozen:p});continue;}
 if(fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).startsWith(root+path.sep)){observedKnownDrift.push({path:p.path,status:'currently_redirected_not_read',frozen:p});continue;}
 const b=raw(p.path),digest=sha(b);if(b.length!==p.size||digest!==p.sha256)observedKnownDrift.push({path:p.path,frozen:p,current:{size:b.length,sha256:digest}});
}
const prefix=relative(receiptFile).replace(/\.json$/,''),targetLog=prefix+'.targeted.jsonl',fullLog=prefix+'.full.jsonl',seedLog=prefix+'.seeds.jsonl';
const parse=name=>decode(raw(name)).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
function checked(name,packages){
 const events=parse(name);assert.ok(events.length);assert.ok(!events.some(e=>['fail','build-fail','skip'].includes(e.Action)),'failure or skip');
 assert.deepEqual(events.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package).toSorted(),packages.toSorted());
 const passed=events.filter(e=>e.Action==='pass'&&e.Test),runs=events.filter(e=>e.Action==='run'&&e.Test);
 const key=e=>e.Package+'\0'+e.Test;assert.deepEqual(passed.map(key).toSorted(),runs.map(key).toSorted());assert.equal(new Set(passed.map(key)).size,passed.length);
 for(const pkg of packages)assert.equal(events.filter(e=>e.Action==='start'&&!e.Test&&e.Package===pkg).length,1);
 return passed;
}
const fullPackages=['clawreef/internal/systembackupproducer','clawreef/internal/systembackupsecurity','clawreef/internal/systembackupbootstrapsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupresources','clawreef/internal/systembackupread','clawreef/cmd/server','clawreef/internal/systembackupnoncebootstrap','clawreef/internal/systembackupcatrust','clawreef/cmd/system-backup-bootstrap'];
const target=checked(targetLog,['clawreef/internal/systembackupproducer','clawreef/internal/systembackupsecurity','clawreef/cmd/system-backup-bootstrap']),full=checked(fullLog,fullPackages);
assert.deepEqual(r.package_passes.toSorted(),fullPackages.toSorted());assert.equal(r.targeted_pass_events,target.length);assert.equal(r.full_pass_events,full.length);
const roots=[...ready[0].new_roots,...ready[1].new_test_roots,'TestBootstrapCandidateServiceConsumerIntegration','TestRequirementsReportDoesNotPretendOwnersAreDelivered','TestCommandRejectsMixedModesBypassFlagsAndUnpinnedFiles'];
for(const name of new Set(roots)){assert.equal(target.filter(e=>e.Test===name).length,1,'target root '+name);assert.equal(full.filter(e=>e.Test===name).length,1,'full root '+name);}
const seedRoots=['TestDBootstrapConsumerMySQLSeed','TestDBootstrapConsumerRangesMySQLSeed','TestDBootstrapEntryMySQLSeed','TestDBootstrapOriginalMaterialsMySQLSeed'];
assert.deepEqual(validateGoEvents(decode(raw(seedLog)),'clawreef/internal/systembackupevidence'),seedRoots);assert.deepEqual(r.local_seed_roots.toSorted(),seedRoots);
assert.match(decode(raw(seedLog)),/PASS bootstrap-entry-seed cases=22 original_pre_C1_writer=yes domain_open=real_API hidden_C1_requires_typed1142=yes actual_mysql=not_run production=no/);
assert.deepEqual(r.linux_steps.map(s=>s.name),['server','bootstrap','migration-runner','tagged-evidence-test-compile-only']);
for(const s of r.linux_steps){assert.equal(s.exit_code,0);assert.match(s.binary_sha256,/^[a-f0-9]{64}$/);raw(prefix+'.linux-'+s.name+'.txt');}
const nodeLogs=[['docs/evidence/d-bootstrap-entry-mysql-receiver-tests-20261026.txt',33],['docs/evidence/d-bootstrap-original-materials-mysql-receiver-tests-20261026-r4.txt',40],['docs/evidence/d-bootstrap-config-ranges-mysql-receiver-tests-20261026-r4.txt',25]];
for(const [name,count]of nodeLogs){const s=decode(raw(name));for(const re of [new RegExp('tests '+count+'(?:\\r?\\n|$)'),new RegExp('pass '+count+'(?:\\r?\\n|$)'),/fail 0(?:\r?\n|$)/,/skipped 0(?:\r?\n|$)/])assert.match(s,re);}
const syntax='docs/evidence/d-bootstrap-entry-script-syntax-20261026.txt';assert.match(decode(raw(syntax)),/^PS_AST_PASS\r?\nBASH_SYNTAX_PASS native_exit=0 no_script_execution=yes\r?\n$/);
const rejected='docs/evidence/d-bootstrap-entry-native-87e37e212675408789054de7f2f43028.json',old=json(rejected);assert.equal(old.tests_started,false);assert.equal(old.cleaned,true);assert.match(old.error,/Source changed during entry capture/);assert.equal(fs.existsSync(path.join(root,'.tmp-d-bootstrap-entry-87e37e212675408789054de7f2f43028')),false);
const negativeFile='docs/evidence/d1-entry-frozen-scope-negative-checks-20261026.json',negative=json(negativeFile);assert.equal(negative.checks.length,2);for(const c of negative.checks){assert.notEqual(c.native_exit,0);assert.equal(c.accepted,false);assert.equal(c.output_created,false);assert.equal(sha(raw(c.log)),c.log_sha256);}
const artifacts=[receiptFile,driver,...readyFiles,targetLog,fullLog,seedLog,...r.linux_steps.map(s=>prefix+'.linux-'+s.name+'.txt'),...nodeLogs.map(s=>s[0]),syntax,rejected,negativeFile,...negative.checks.map(c=>c.log),'docs/evidence/d-bootstrap-entry-independent-requirements-20261026.json','docs/evidence/d-bootstrap-entry-local-review-20261026.mjs'];
const result={kind:frozenOnly?'d_bootstrap_entry_independent_frozen_local_review.v1':'d_bootstrap_entry_independent_local_review.v1',status:frozenOnly?'passed_exact_frozen_entry_only_not_current_tree':'passed_exact_entry_native_and_probe_preparation_only',native_receipt:relative(receiptFile),source_files:r.files.length,source_sha256:sha(r.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'),driver_sha256:r.driver_sha256,
 targeted_pass_events:target.length,full_packages:10,full_roots:full.filter(e=>!e.Test.includes('/')).length,full_pass_events:full.length,required_new_roots:[...new Set(roots)],seed_roots:seedRoots,linux_steps:r.linux_steps,
 snapshot_verified:true,snapshot_unchanged:true,whole_current_source_match_reported:r.current_source_matches_snapshot,current_backend_contract_match_claimed:!frozenOnly,current_entry_owned_match_claimed:!frozenOnly,observed_known_source_drift:observedKnownDrift,drift_observation_is_historical_not_live_approval:frozenOnly,live_new_file_set_not_approved:frozenOnly,live_API_or_materials_increment_not_approved:frozenOnly,owned_pins:[...selected.values()],node_receiver_pins_outside_native_snapshot:[...selected.values()].filter(p=>nodeOnly.has(p.path)),owner,owner_recorded_removed:true,owner_independently_absent:true,test_build_artifacts_removed:true,
 receiver_tests:{entry:33,original_materials:40,config_ranges:25,actual_mysql:false},script_syntax:{powershell_ast:true,bash_n:true},dedicated_operator_wrapper_succeeded:false,actual_mysql_executed:false,actual_sql_cases_passed:0,planned_sql_scopes:{consumer:26,config_ranges:3,original_materials:22,entry:22},synthetic_authority:true,physical_capacity_verified:false,provider_permission_verified:false,production_approved:false,dependencies_installed:false,whole_goal_complete:false,prior_failed_capture_preserved:rejected,prior_failure_reclassified:false,artifacts:[...new Set(artifacts.map(relative))].map(name=>({path:name,sha256:sha(raw(name))}))};
if(checking)assert.deepEqual(json(output),result);else fs.writeFileSync(local(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('BOOTSTRAP_ENTRY_LOCAL_REVIEWED scope='+(frozenOnly?'exact_frozen_only':'current_backend_contract')+' packages=10 seed=4 linux=4 cleanup=yes actual_mysql=not_run source='+result.source_sha256);
