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
const oldName='docs/evidence/a-api-linux-native-4428875c0b734a4ea952580fb2c71680.json';
function derive(){
  const old=json(oldName);assert.equal(old.kind,'a_api_linux_supplement.v1');assert.equal(old.status,'passed_for_exact_native_test_bytes');
  assert.equal(old.cleanup,true);assert.equal(old.source_unchanged,true);assert.equal(old.source_paths_unchanged,false);
  assert.equal(old.systembackupsecurity_exit,0);assert.equal(old.linux_compile_vet,false);
  assert.equal(old.actual_sql,false);assert.equal(old.production_authorized,false);assert.equal(old.dependencies_installed,false);
  assert.equal(fs.existsSync(path.join(root,'.tmp-a-api-linux-'+old.id)),false);
  assert.equal(pin('scripts/system-backup-a-api-linux-supplement.ps1').sha256,old.driver_sha256);
  const native=json(prefix+'.json'),scope=json(prefix+'.scope.json');assert.equal(native.status,'passed_exact_candidate_supplement');
  assert.equal(native.snapshot_unchanged,true);assert.equal(native.cleanup,true);
  const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json',target=json(targetName);
  const original=new Map(old.files.map(p=>[p.path,p])),current=new Map(target.target_files.map(p=>[p.path,p]));
  const graphSource=new Map(native.files.map(p=>[p.path,p]));
  const selected=new Set(['backend/go.mod','backend/go.sum']),directories=new Set(),variants=[];
  for(const goos of ['windows','linux'])for(const tag of ['ordinary','systembackup_mysql']){
    const phase=goos+'.'+tag,step=native.phases.filter(p=>p.phase===phase);assert.equal(step.length,1);assert.equal(step[0].exit,0);assert.equal(step[0].goos,goos);
    const log=prefix+'.'+phase+'.jsonl',capture=scope.captures.filter(c=>c.goos_label===goos&&c.tags_label===tag);assert.equal(capture.length,1);
    assert.equal(pin(log).sha256,capture[0].input.sha256);assert.equal(pin(log).size,capture[0].input.size);
    const actual=selectedGoClosure(parseGoList(read(log).toString('utf8')),['clawreef/internal/systembackupsecurity']);
    assert.ok(!actual.files.includes('backend/internal/systembackupbootstrapsecurity/reference.go'),
      'Changed parity decoder entered the security test-program dependency scope');
    for(const name of actual.files)selected.add(name);for(const dir of actual.directories)directories.add(dir);
    variants.push({goos,tags:tag==='ordinary'?'':'systembackup_mysql',command:['go',...step[0].arguments],exit_code:0,
      log:pin(log),selected_file_count:actual.files.length,metadata_only_for_tagged_variant:tag!=='ordinary'});
  }
  checkSelectedPackageSets([...directories],old.files,target.target_files);
  for(const p of target.target_files)if(p.path.startsWith('contracts/system-backup/')||[...directories].some(dir=>p.path.startsWith(dir+'/testdata/')))selected.add(p.path);
  const source=[...selected].sort().map(name=>{const p=current.get(name);assert.ok(p);
    assert.deepEqual(p,original.get(name),'Original security compile input differs '+name);
    assert.deepEqual(p,graphSource.get(name),'Actual graph input differs '+name);assert.deepEqual(pin(name),p);return p;});
  const combinedChanges=old.tested_dependency_files.filter(p=>{const now=current.get(p.path);return !now||now.sha256!==p.sha256||now.size!==p.size;}).map(p=>p.path).sort();
  assert.deepEqual(combinedChanges,['backend/internal/systembackupbootstrapsecurity/reference.go']);
  const binary=old.linux_binaries.filter(p=>p.package==='systembackupsecurity');assert.equal(binary.length,1);
  assert.equal(binary[0].format,'ELF');assert.ok(binary[0].size>100000);assert.match(binary[0].sha256,/^[a-f0-9]{64}$/);
  const otherName='docs/evidence/a-a2-promoted-native-scope-reviewed-20261027-r1.json',other=json(otherName);
  assert.equal(pin(otherName).sha256,'67d3d71deb69aa70596af381e8ce5691468f04ab90eb760f2ba936d4dbdbf600');
  for(const name of ['systembackupbootstrapmaterials','systembackupcatrust','systembackupnoncebootstrap'])
    assert.equal(other.linux_test_programs.filter(p=>p.package==='clawreef/internal/'+name).length,1);
  return{kind:'a_api_security_linux_dependency_audit.v1',status:'dependencies_match_original_frozen_source_end_postcheck_unproven',
    target_manifest:pin(targetName),original_Linux_receipt:pin(oldName),actual_current_go_list_receipt:pin(prefix+'.json'),
    source_files:source,source_sha256:sourceDigest(source),variants,observed_original_binary:binary[0],linux_compile_vet:false,
    original_four_program_combined_dependency_changes:combinedChanges,combined_401_dependency_proof_reused_wholesale:false,
    changed_decoder_outside_actual_security_program_scope:true,other_three_current_Linux_programs:pin(otherName),
    review_validator:pin('docs/evidence/a-api-security-linux-dependency-audit-20261027.mjs'),
    original_live_protected_inputs_after_check:true,original_frozen_source_end_postcheck_proven:false,
    original_live_path_set_unchanged:false,original_cleanup_verified:true,reuse_accepted:false,
    required_next_action:'Fresh ordinary Linux security test-program compile on exact frozen current inputs, with actual frozen postcheck and owned cleanup',
    tagged_security_program_accepted:false,
    original_failed_Windows_final_postcheck_retroactively_claimed:false,Go_repeated:false,binary_executed:false,
    current_baseline_ready:false,actual_SQL:false,production_approved:false};
}
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
const output='docs/evidence/a-api-security-linux-dependency-audit-20261027-r1.json',value=derive();
if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),value);
console.log(JSON.stringify({mode,security_dependency_files:value.source_files.length,reuse_accepted:false,required_fresh_security_compile:true,Go_repeated:false}));
