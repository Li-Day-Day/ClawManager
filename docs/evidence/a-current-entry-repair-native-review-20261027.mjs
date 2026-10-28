import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {compose} from './a2-reference-capability-supplement-review-20261027-r2.mjs';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
import {reviewCurrentRepairEvents,parityPackages,remainingPackages} from './a-bootstrap-current-repair-inventory-20261027.mjs';
import {checkTarget,enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ordinaryPrefix='docs/evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b';
const parityPrefix='docs/evidence/a2-reference-capability-supplement-b53eccbdc25449d1947e7bf90b179b92';
const parityOld='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7';
const parentPrefix='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8';
const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json';
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
const sorted=xs=>[...xs].sort();

export function requireCompleteCurrentOrdinary(r){
  assert.equal(r.kind,'d2_current_ordinary_complete_native.v1');assert.equal(r.status,'passed_selected_complete_ordinary_packages');
  assert.equal(r.error,null);assert.ok(!r.postcheck_error);
  for(const field of ['Go_started','tests_started','source_precheck','go_list_source_postcheck','windows_source_postcheck',
    'bootstrap_seed_source_postcheck','frozen_source_unchanged','owner_removed'])assert.equal(r[field],true,field);
  for(const field of ['dependencies_installed','remote_contacted','actual_mysql','production_approved'])assert.equal(r[field],false,field);
  assert.deepEqual(sorted(r.packages),sorted(remainingPackages.map(p=>p.replace(/^clawreef\//,''))));
  assert.equal(r.steps.length,8);assert.ok(r.steps.every(step=>step.exit_code===0));
  assert.deepEqual(r.linux_binaries.map(p=>p.program),['server','system-backup-bootstrap']);
  for(const binary of r.linux_binaries){assert.equal(binary.format,'ELF');assert.equal(binary.removed,true);assert.equal(binary.executed,false);
    assert.match(binary.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(binary.size)&&binary.size>100000);}
  return{native_start_authorized:false,source_scope_accepted:false};
}

function derive(){
  const current=json(ordinaryPrefix+'.json');requireCompleteCurrentOrdinary(current);
  assert.equal(path.dirname(current.owner),root);assert.equal(path.basename(current.owner),'.tmp-d-index-cache-01cb9a3a3e1d48d7b56da8ffa138bc9b');
  assert.equal(fs.existsSync(current.owner),false);
  const target=json(targetName),parent=json(parentPrefix+'.json');
  const before=[...parent.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);checkTarget(target,enumerate(root),before);
  const frozen=json(current.source_manifest);assert.equal(frozen.kind,'d_local_closeout_snapshot.v1');assert.equal(frozen.stable_copy_verified,true);
  assert.equal(pin(current.source_manifest).sha256,current.source_manifest_sha256);assert.deepEqual(frozen.files,target.target_files);
  assert.equal(sourceDigest(frozen.files),frozen.source_sha256);assert.equal(frozen.source_sha256,target.target_sha256);
  const securityReviewName='docs/evidence/a-security-linux-compile-reviewed-20261027-r1.json',securityReview=json(securityReviewName);
  assert.equal(securityReview.kind,'a_security_linux_current_compile_review.v1');
  assert.equal(securityReview.status,'accepted_exact_current_ordinary_Linux_security_compile_only');
  assert.equal(securityReview.frozen_source_postcheck_verified,true);assert.equal(securityReview.cleanup_verified,true);
  assert.deepEqual(securityReview.target_manifest,pin(targetName));assert.equal(securityReview.source_sha256,target.target_sha256);
  assert.deepEqual(securityReview.current_ordinary_receipt,pin(ordinaryPrefix+'.json'));
  const helpers={driver_sha256:'d2-current-ordinary-complete-validation-20261027.ps1',snapshotter_sha256:'d-local-closeout-snapshot-20261023.mjs',
    inventory_sha256:'d2-current-ordinary-inventory-20261027.mjs',scope_reader_sha256:'d2-current-ordinary-go-scope-20261027.mjs',
    go_list_parser_sha256:'a2-reference-capability-go-scope-20261026.mjs',native_event_reader_sha256:'d-resources-mysql-actual-review-20261023.mjs',
    parity_composition_validator_sha256:'a2-reference-capability-supplement-review-20261027-r2.mjs'};
  for(const [field,name] of Object.entries(helpers))assert.equal(pin('docs/evidence/'+name).sha256,current[field]);
  const composed=compose(path.resolve(root,parityPrefix));assert.deepEqual(composed,json(parityPrefix+'.composed.json'));
  const parity=json(parityPrefix+'.json'),old=json(parityOld+'.json');
  const a2LeafName='docs/evidence/a-a2-promoted-native-scope-reviewed-20261027-r1.json';
  assert.equal(pin(a2LeafName).sha256,'67d3d71deb69aa70596af381e8ce5691468f04ab90eb760f2ba936d4dbdbf600');
  const a2=json(a2LeafName);assert.equal(a2.native_source_stability_verified,true);assert.equal(a2.cleanup_verified,true);
  const logNames=[parentPrefix+'.full.jsonl',parityOld+'.full.jsonl',ordinaryPrefix+'.full.jsonl',
    parityPrefix+'.tagged_seed.jsonl',ordinaryPrefix+'.bootstrap-seeds.jsonl'];
  const inventory=reviewCurrentRepairEvents(Object.fromEntries(['parentText','parityFullText','currentFullText','paritySeedText','currentSeedsText']
    .map((key,i)=>[key,read(logNames[i]).toString('utf8')])));
  assert.equal(inventory.original_test_events_preserved,8546);assert.equal(inventory.bootstrap_seeds.length,4);
  for(const [i,expected] of [[4,['go','test','-json','-count=1','-timeout=2700s',...remainingPackages.map(p=>'./'+p.replace(/^clawreef\//,''))]],
    [5,['go','test','-json','-tags','systembackup_mysql','-run','^TestDBootstrap(Consumer|ConsumerRanges|Entry)MySQLSeed$','-count=1','-timeout=2700s','./internal/systembackupevidence']]]){
    assert.deepEqual(current.steps[i].command,expected);assert.equal(current.steps[i].platform,'windows');
  }
  const nativeLogs=[];
  for(const step of current.steps){assert.equal(pin(step.log).sha256,step.sha256);nativeLogs.push(pin(step.log));
    if(step.stderr){assert.equal(pin(step.stderr).sha256,step.stderr_sha256);assert.equal(read(step.stderr).length,0);nativeLogs.push(pin(step.stderr));}}
  for(const log of securityReview.native_logs){assert.deepEqual(pin(log.path),log);nativeLogs.push(log);}
  for(const name of ['windows_checkpoint','bootstrap_seed_checkpoint']){
    assert.equal(pin(current[name].path).sha256,current[name].sha256);const checkpoint=json(current[name].path);
    assert.equal(checkpoint.source_postcheck,true);assert.equal(checkpoint.source_manifest_sha256,current.source_manifest_sha256);}
  for(const [i,program] of ['server','system-backup-bootstrap'].entries())assert.deepEqual(current.steps[6+i].command,
    ['go','build','-buildvcs=false','-o',path.join(current.owner,'binary',program),'./cmd/'+program]);
  const migrationName='docs/evidence/a-entry-migration-linux-reuse-reviewed-20261027-r1.json',migration=json(migrationName);
  assert.equal(pin(migrationName).sha256,'bbc8465e385623280a72f5a0739cc6c2be98865b887a8f28292ca483913ad86b');
  assert.equal(migration.status,'accepted_original_linux_migration_build_for_identical_current_dependencies_only');
  const targetMap=new Map(target.target_files.map(p=>[p.path,p])),parityMap=new Map(parity.files.map(p=>[p.path,p]));
  for(const p of migration.source_files)assert.deepEqual(p,targetMap.get(p.path));
  const allRoots=sorted([...parityPackages,...remainingPackages]),selected=new Set(['backend/go.mod','backend/go.sum']),directories=new Set(),variants=[],currentVariants=[];
  for(const goos of ['windows','linux'])for(const tag of ['ordinary','systembackup_mysql']){
    const phase=goos+'.'+tag,globalLog=parityPrefix+'.'+phase+'.jsonl',currentLog=ordinaryPrefix+'.'+phase+'.jsonl';
    const globalRows=parseGoList(read(globalLog).toString('utf8')),currentRows=parseGoList(read(currentLog).toString('utf8'));
    const actual=selectedGoClosure(globalRows,allRoots),oldCurrent=selectedGoClosure(globalRows,remainingPackages),freshCurrent=selectedGoClosure(currentRows,remainingPackages);
    assert.deepEqual(freshCurrent,oldCurrent,'Current Go-list dependency selection differs from the global capture');
    for(const p of actual.files)selected.add(p);for(const p of actual.directories)directories.add(p);
    const globalPhase=parity.phases.find(p=>p.phase===phase);assert.ok(globalPhase);assert.equal(globalPhase.exit,0);assert.equal(globalPhase.goos,goos);
    const step=current.steps[variants.length],tags=tag==='ordinary'?'':'systembackup_mysql';
    assert.equal(step.platform,goos);assert.equal(step.tags,tag);assert.equal(pin(step.log).sha256,pin(currentLog).sha256);
    assert.deepEqual(step.command,['go','list','-deps','-test','-json',...(tags?['-tags',tags]:[]),...remainingPackages.map(p=>'./'+p.replace(/^clawreef\//,''))]);
    variants.push({goos,tags,command:['go',...globalPhase.arguments],root_packages:['./...'],exit_code:0,log:pin(globalLog)});
    currentVariants.push({goos,tags,command:step.command,exit_code:0,log:pin(currentLog)});
  }
  checkSelectedPackageSets([...directories],parity.files,target.target_files);
  const compilerSelected=[...selected];for(const name of compilerSelected)assert.deepEqual(parityMap.get(name),targetMap.get(name),'Go-list frozen source differs '+name);
  for(const p of target.target_files)if(p.path.startsWith('contracts/system-backup/')||p.path.startsWith('docs/')||
    (p.path.startsWith('scripts/')&&p.path.endsWith('.sql'))||[...directories].some(dir=>p.path.startsWith(dir+'/testdata/')))selected.add(p.path);
  const source=sorted(selected).map(name=>{const p=targetMap.get(name);assert.ok(p);assert.deepEqual(pin(name),p);return p;});
  const closure={kind:'a_owner_pre_thin_dependency_closure_review.v1',status:'complete_exact_native_dependency_scope',
    profile:'entry_complete_or_exact_repaired_scope',source_role:'target',source_files:source,source_sha256:sourceDigest(source),
    variants,supporting_current_variants:currentVariants,selected_test_roots:allRoots,
    native_global_go_list_receipt:pin(parityPrefix+'.json'),native_current_go_list_receipt:pin(ordinaryPrefix+'.json')};
  const leaf={kind:'a_owner_pre_thin_native_scope_proof.v1',status:'accepted_exact_scope_for_local_supplement',
    profile:'entry_complete_or_exact_repaired_scope',source_role:'target',native_source_stability_verified:true,cleanup_verified:true,
    actual_sql:false,production_authorized:false,native_receipts:[pin(parentPrefix+'.json'),pin(parityOld+'.json'),pin(parityPrefix+'.json'),pin(ordinaryPrefix+'.json'),securityReview.native_receipt],
    native_logs:[...nativeLogs,...logNames.map(pin)],review_validator:pin('docs/evidence/a-current-entry-repair-native-review-20261027.mjs'),
    target_manifest:pin(targetName),dependency_closure_review_path:'docs/evidence/a-current-entry-repair-closure-reviewed-20261027-r1.json',
    complete_parent_packages:parent.package_passes,complete_parent_obligations_verified:true,
    inventory,source_manifest:pin(current.source_manifest),A2_stable_exact_scope:pin(a2LeafName),migration_Linux_exact_reuse:pin(migrationName),
    current_ordinary_security_Linux_compile:pin(securityReviewName),
    current_Linux_binaries:current.linux_binaries,original_parent_status_preserved:'failed',original_final_postcheck_retroactively_claimed:false,
    accepted_scope:['stable current full six plus exact stable A2 full five with all 8546 original test events retained',
      'all four bootstrap local seeds on stable current input bytes','current server/bootstrap Linux builds and exact migration dependency reuse'],
    excluded_scope:['fifteen-stage owner supplement','GC three local seeds','actual SQL/provider and remote owner tests','27 production owner slots','whole current baseline'],
    current_baseline_ready:false,pre_thin_ready:false};
  return{leaf,closure};
}
function main(){
  const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
  const {leaf,closure}=derive();
  for(const [name,value] of [['a-current-entry-repair-closure-reviewed-20261027-r1.json',closure],['a-current-entry-repair-native-reviewed-20261027-r1.json',leaf]]){
    const output='docs/evidence/'+name;if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    else assert.deepEqual(json(output),value);
  }
  console.log(JSON.stringify({mode,dependency_files:closure.source_files.length,preserved_events:leaf.inventory.original_test_events_preserved,
    packages:leaf.inventory.current_complete_packages.length,pre_thin_ready:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
