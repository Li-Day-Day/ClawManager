import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {selectedGoClosure,checkSelectedPackageSets} from './a-native-selected-go-closure-20261027.mjs';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
const prefix='docs/evidence/a2-reference-capability-supplement-b53eccbdc25449d1947e7bf90b179b92';
const linuxName='docs/evidence/d-bootstrap-entry-linux-d846e3793f0242cd96da1912a39c49de.json';
function derive(){
  const native=json(prefix+'.json'),scope=json(prefix+'.scope.json'),linux=json(linuxName),parent=json(linux.parent_receipt);
  assert.equal(native.status,'passed_exact_candidate_supplement');assert.equal(native.snapshot_unchanged,true);
  assert.equal(native.reviewed_inputs_unchanged,true);assert.equal(native.cleanup,true);
  assert.equal(linux.status,'passed_exact_linux_supplement');assert.equal(linux.precheck,true);assert.equal(linux.postcheck,true);assert.equal(linux.cleaned,true);
  assert.deepEqual(linux.files,parent.files);assert.equal(pin(linux.parent_receipt).sha256,linux.parent_receipt_sha256);
  const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json',target=json(targetName);
  const targetMap=new Map(target.target_files.map(p=>[p.path,p])),parentMap=new Map(parent.files.map(p=>[p.path,p])),nativeMap=new Map(native.files.map(p=>[p.path,p]));
  const selected=new Set(['backend/go.mod','backend/go.sum']),directories=new Set(),variants=[];
  for(const goos of ['windows','linux'])for(const tag of ['ordinary','systembackup_mysql']){
    const phase=goos+'.'+tag,steps=native.phases.filter(p=>p.phase===phase);assert.equal(steps.length,1);
    assert.equal(steps[0].exit,0);assert.equal(steps[0].goos,goos);
    const args=['list','-deps','-test','-json',...(tag==='ordinary'?[]:['-tags','systembackup_mysql']),'./...'];assert.deepEqual(steps[0].arguments,args);
    const log=prefix+'.'+phase+'.jsonl',captures=scope.captures.filter(c=>c.goos_label===goos&&c.tags_label===tag);assert.equal(captures.length,1);
    assert.equal(pin(log).sha256,captures[0].input.sha256);assert.equal(pin(log).size,captures[0].input.size);
    // A production build does not compile dependency test files or test mains.
    const rows=parseGoList(read(log).toString('utf8')).filter(r=>!r.ForTest&&!r.ImportPath.endsWith('.test')&&!r.ImportPath.includes(' ['))
      .map(r=>({...r,TestGoFiles:[],XTestGoFiles:[],TestEmbedFiles:[],XTestEmbedFiles:[]}));
    const actual=selectedGoClosure(rows,['clawreef/cmd/system-backup-migrate']);
    for(const p of actual.files)selected.add(p);for(const p of actual.directories)directories.add(p);
    variants.push({goos,tags:tag==='ordinary'?'':'systembackup_mysql',command:['go',...args],exit_code:0,log:pin(log),selected_production_files:actual.files});
  }
  checkSelectedPackageSets([...directories],parent.files,target.target_files);
  const source=[...selected].sort().map(name=>{const p=targetMap.get(name);assert.ok(p,'Migration dependency absent from target '+name);
    assert.deepEqual(p,parentMap.get(name),'Original Linux migration build source differs '+name);
    assert.deepEqual(p,nativeMap.get(name),'Go-list frozen dependency differs '+name);assert.deepEqual(pin(name),p);return p;});
  const step=linux.linux_steps.filter(s=>s.name==='migration-runner');assert.equal(step.length,1);assert.equal(step[0].exit_code,0);
  assert.equal(step[0].binary_removed,true);assert.ok(step[0].binary_size>0);assert.match(step[0].binary_sha256,/^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(root,'.tmp-d-bootstrap-linux-'+linux.id)),false);
  assert.equal(linux.parent_postcheck_retroactively_claimed,false);assert.equal(linux.actual_mysql_executed,false);
  return{kind:'a_entry_migration_linux_exact_dependency_reuse.v1',status:'accepted_original_linux_migration_build_for_identical_current_dependencies_only',
    target_manifest:pin(targetName),original_linux_receipt:pin(linuxName),original_parent_receipt:pin(linux.parent_receipt),
    source_files:source,source_sha256:sourceDigest(source),variants,native_build:step[0],
    native_go_list_receipt:pin(prefix+'.json'),original_linux_independent_review:pin('docs/evidence/a-bootstrap-entry-linux-independent-reviewed-20261027-d846.json'),
    selected_input_receiver:pin('docs/evidence/a-native-selected-go-closure-20261027.mjs'),review_validator:pin('docs/evidence/a-entry-migration-linux-reuse-20261027.mjs'),
    original_linux_own_source_stability_verified:true,cleanup_independently_verified:true,
    original_Windows_final_postcheck_retroactively_claimed:false,current_server_or_bootstrap_build_accepted:false,
    Go_repeated:false,binary_executed:false,native_start_authorized:false,current_baseline_ready:false,actual_SQL:false,production_approved:false};
}
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
const output='docs/evidence/a-entry-migration-linux-reuse-reviewed-20261027-r1.json',value=derive();
if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),value);
console.log(JSON.stringify({mode,migration_dependency_files:value.source_files.length,Go_repeated:false,current_baseline_ready:false}));
