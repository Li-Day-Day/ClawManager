import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {compose} from './a2-reference-capability-supplement-review-20261027-r2.mjs';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {reviewGoEvents} from './a-bootstrap-entry-phase-review-20261027.mjs';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
import {checkTarget,enumerate,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix='docs/evidence/a2-reference-capability-supplement-b53eccbdc25449d1947e7bf90b179b92';
const oldPrefix='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7';
const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json';
const roots=['clawreef/cmd/system-backup-bootstrap','clawreef/internal/systembackupbootstrapmaterials',
  'clawreef/internal/systembackupbootstrapsecurity','clawreef/internal/systembackupcatrust','clawreef/internal/systembackupnoncebootstrap'];
const closureRoots=[...roots,'clawreef/internal/systembackupevidence'];
const read=name=>fs.readFileSync(path.resolve(root,name));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=name=>JSON.parse(read(name).toString('utf8').replace(/^\uFEFF/,''));
const pin=name=>{const b=read(name);return{path:path.relative(root,path.resolve(root,name)).replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
const sorted=xs=>[...xs].sort();
function derive(){
  const target=json(targetName),parent=json(target.parent_receipt.path);
  const parentFiles=[...parent.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  checkTarget(target,enumerate(root),parentFiles);
  const composed=compose(path.resolve(root,prefix));assert.deepEqual(composed,json(prefix+'.composed.json'));
  const native=json(prefix+'.json'),old=json(oldPrefix+'.json'),promotion=json(prefix+'.promoted.json');
  assert.equal(promotion.status,'exact_composed_candidate_promoted');assert.equal(promotion.source_postcheck,true);
  const composedPin=pin(prefix+'.composed.json');assert.equal(promotion.composed_review.sha256,composedPin.sha256);
  assert.equal(promotion.composed_review.size,composedPin.size);assert.equal(promotion.all_candidate_source_files,native.files.length);
  assert.equal(promotion.current_whole_baseline_accepted,false);assert.equal(promotion.actual_SQL,false);assert.equal(promotion.production_approved,false);
  const targetMap=new Map(target.target_files.map(p=>[p.path,p])),frozenMap=new Map(native.files.map(p=>[p.path,p]));
  for(const p of promotion.changed_source){assert.deepEqual(p,targetMap.get(p.path));assert.deepEqual(pin(p.path),p);}
  assert.equal(old.snapshot_unchanged,true);assert.equal(old.reviewed_inputs_unchanged,true);assert.equal(old.cleanup,true);assert.equal(old.status,'failed');
  const windows=reviewGoEvents(read(oldPrefix+'.full.jsonl').toString('utf8'),roots);
  assert.equal(windows.roots,42);assert.equal(windows.passed_events,347);
  const fixed=reviewGoEvents(read(oldPrefix+'.fixed.jsonl').toString('utf8'),['clawreef/internal/systembackupbootstrapsecurity'],
    ['TestSecurityReferenceCombinedEvidenceCapabilitiesFollowExistingSchema']);assert.equal(fixed.passed_events,9);
  const seed=reviewGoEvents(read(prefix+'.tagged_seed.jsonl').toString('utf8'),['clawreef/internal/systembackupevidence'],
    ['TestDBootstrapOriginalMaterialsMySQLSeed']);assert.equal(seed.passed_events,1);
  const selected=new Set(['backend/go.mod','backend/go.sum']),directories=new Set(),variants=[];
  const scope=json(prefix+'.scope.json');
  for(const goos of ['windows','linux'])for(const tag of ['ordinary','systembackup_mysql']){
    const phase=goos+'.'+tag,steps=native.phases.filter(p=>p.phase===phase);assert.equal(steps.length,1);
    const args=['list','-deps','-test','-json',...(tag==='ordinary'?[]:['-tags','systembackup_mysql']),'./...'];
    assert.deepEqual(steps[0].arguments,args);assert.equal(steps[0].goos,goos);assert.equal(steps[0].exit,0);
    const log=prefix+'.'+phase+'.jsonl',capture=scope.captures.filter(c=>c.goos_label===goos&&c.tags_label===tag);
    assert.equal(capture.length,1);assert.equal(pin(log).sha256,capture[0].input.sha256);assert.equal(pin(log).size,capture[0].input.size);
    assert.equal(read(prefix+'.'+phase+'.stderr.txt').length,0);
    const actual=selectedGoClosure(parseGoList(read(log).toString('utf8')),closureRoots);
    for(const name of actual.files)selected.add(name);for(const dir of actual.directories)directories.add(dir);
    variants.push({goos,tags:tag==='ordinary'?'':'systembackup_mysql',command:['go',...args],root_packages:['./...'],exit_code:0,log:pin(log)});
  }
  checkSelectedPackageSets([...directories],native.files,target.target_files);
  const uncopiedSupportDocs=target.target_files.filter(p=>p.path.startsWith('docs/')&&!frozenMap.has(p.path)).map(p=>p.path).sort();
  assert.deepEqual(uncopiedSupportDocs,[
    'docs/system-backup-d-config-canonical-081-proposal-20261014.sql',
    'docs/system-backup-d-config-canonical-candidate-20261012.sql',
    'docs/system-backup-d-control-health-proposal-20261016.sql',
    'docs/system-backup-restore-schema-inventory.json']);
  // Runtime fixtures supplement the compiler's embed metadata. Close all
  // contract bytes plus local testdata under every selected project package.
  for(const p of target.target_files)if(p.path.startsWith('contracts/system-backup/')||(p.path.startsWith('docs/')&&frozenMap.has(p.path))||
    (p.path.startsWith('scripts/')&&p.path.endsWith('.sql'))||
    [...directories].some(dir=>p.path.startsWith(dir+'/testdata/')))selected.add(p.path);
  const source=sorted(selected).map(name=>{const p=targetMap.get(name);assert.ok(p,'Selected input absent from target '+name);
    assert.deepEqual(p,frozenMap.get(name),'Selected native dependency differs '+name);assert.deepEqual(pin(name),p);return p;});
  const closure={kind:'a_owner_pre_thin_dependency_closure_review.v1',status:'complete_exact_native_dependency_scope',
    profile:'a2_reference_capability_parity',source_role:'target',source_files:source,source_sha256:sourceDigest(source),variants,
    selected_test_roots:closureRoots,ordinary_full_test_roots:roots,native_go_list_receipt:pin(prefix+'.json'),promotion:pin(prefix+'.promoted.json'),
    graph_parser:pin('docs/evidence/a2-reference-capability-go-scope-20261026.mjs'),
    explicitly_uncovered_support_inputs:uncopiedSupportDocs,
    selected_input_receiver:pin('docs/evidence/a-native-selected-go-closure-20261027.mjs')};
  const oldPhases=['old','fixed','full'],nativeLogs=[...oldPhases.map(phase=>pin(oldPrefix+'.'+phase+'.jsonl')),
    ...native.phases.flatMap(phase=>[pin(prefix+'.'+phase.phase+'.jsonl'),pin(prefix+'.'+phase.phase+'.stderr.txt')])];
  const leaf={kind:'a_owner_pre_thin_native_scope_proof.v1',status:'accepted_exact_scope_for_local_supplement',
    profile:'a2_reference_capability_parity',source_role:'target',native_source_stability_verified:true,cleanup_verified:true,
    actual_sql:false,production_authorized:false,native_receipts:[pin(oldPrefix+'.json'),pin(prefix+'.json')],native_logs:nativeLogs,
    review_validator:pin('docs/evidence/a-a2-promoted-native-scope-review-20261027.mjs'),target_manifest:pin(targetName),
    dependency_closure_review_path:'docs/evidence/a-a2-promoted-dependency-closure-reviewed-20261027-r1.json',
    independent_D_review:pin('docs/evidence/d1-a2-reference-capability-composed-reviewed-20261027-b53.json'),
    promotion:pin(prefix+'.promoted.json'),ordinary_full:windows,fixed_schema_regression:fixed,original_materials_seed:seed,
    linux_test_programs:[...native.linux_binaries,native.linux_tagged_evidence],
    failed_parent_preserved:true,ordinary_Go_repeated:false,linux_programs_executed:false,
    accepted_scope:['exact promoted two-file parity fix','stable ordinary full five packages','OriginalMaterials local seed','six Linux test-program compiles'],
    excluded_scope:['other complete ordinary packages','GC three seeds','current server Linux build','whole current baseline','27 production owner slots','real SQL/provider'],
    current_baseline_ready:false,pre_thin_ready:false};
  return{closure,leaf};
}
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
const {closure,leaf}=derive();
for(const [name,value] of [['a-a2-promoted-dependency-closure-reviewed-20261027-r1.json',closure],['a-a2-promoted-native-scope-reviewed-20261027-r1.json',leaf]]){
  const output='docs/evidence/'+name;
  if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  else assert.deepEqual(json(output),value);
}
console.log(JSON.stringify({mode,dependency_files:closure.source_files.length,ordinary_roots:42,ordinary_events:347,linux_compiles:6,pre_thin_ready:false}));
