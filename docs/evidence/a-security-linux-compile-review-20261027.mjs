import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:path.relative(root,path.resolve(root,p)).replaceAll('\\','/'),size:b.length,sha256:sha(b)}};
export function inspectSecurityCompileShape(r){
  assert.equal(r.kind,'a_security_linux_compile_supplement.v1');assert.equal(r.status,'passed_exact_current_ordinary_security_Linux_compile');
  assert.equal(r.error,null);assert.ok(!r.postcheck_error);
  for(const field of ['Go_started','source_precheck','source_postcheck','cleanup','compiler_cache_hints_only'])assert.equal(r[field],true,field);
  for(const field of ['tests_executed','dependencies_installed','actual_SQL','production_approved','test_results_reused'])assert.equal(r[field],false,field);
  assert.equal(r.telemetry,'off_owned_directory_verified');assert.equal(r.steps.length,1);
  assert.deepEqual(r.steps[0].command,['go','test','-c','-o',path.join(r.owner,'security.test'),'./internal/systembackupsecurity']);
  assert.equal(r.steps[0].goos,'linux');assert.equal(r.steps[0].goarch,'amd64');assert.equal(r.steps[0].tags,'');assert.equal(r.steps[0].exit_code,0);
  assert.equal(r.binary.format,'ELF');assert.equal(r.binary.class,64);assert.equal(r.binary.machine,'amd64');assert.equal(r.binary.executed,false);
  assert.ok(Number.isSafeInteger(r.binary.size)&&r.binary.size>100000);assert.match(r.binary.sha256,/^[a-f0-9]{64}$/);
  return{native_start_authorized:false,current_baseline_ready:false};
}
function derive(nativeName){
  const nativePin=pin(nativeName);assert.match(nativePin.path,/^docs\/evidence\/a-security-linux-compile-native-[a-f0-9]{32}\.json$/);
  const r=json(nativeName);inspectSecurityCompileShape(r);
  assert.equal(path.dirname(r.owner),root);assert.equal(path.basename(r.owner),'.tmp-d-index-cache-'+r.id);
  assert.equal(fs.existsSync(r.owner),false);assert.equal(fs.existsSync(path.join(r.owner,'security.test')),false);
  const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json',target=json(targetName),manifest=json(r.source_manifest);
  assert.equal(manifest.kind,'d_local_closeout_snapshot.v1');assert.equal(manifest.stable_copy_verified,true);
  assert.equal(pin(r.source_manifest).sha256,r.source_manifest_sha256);assert.deepEqual(manifest.files,target.target_files);
  assert.equal(sourceDigest(manifest.files),target.target_sha256);assert.equal(r.source_sha256,target.target_sha256);
  for(const control of r.control_pins)assert.equal(pin(control.path).sha256,control.sha256);
  assert.equal(r.control_pins.length,4);
  const logs=[];
  for(const stream of ['stdout','stderr']){const file=r.steps[0][stream];assert.equal(pin(file).sha256,r.steps[0][stream+'_sha256']);assert.equal(read(file).length,0);logs.push(pin(file));}
  assert.equal(pin(r.current_ordinary_receipt.path).sha256,r.current_ordinary_receipt.sha256);
  const ordinary=json(r.current_ordinary_receipt.path);assert.equal(ordinary.status,'passed_selected_complete_ordinary_packages');
  assert.equal(ordinary.frozen_source_unchanged,true);assert.equal(ordinary.owner_removed,true);assert.equal(ordinary.steps.length,8);
  assert.ok(ordinary.steps.every(step=>step.exit_code===0));
  return{kind:'a_security_linux_current_compile_review.v1',status:'accepted_exact_current_ordinary_Linux_security_compile_only',
    native_receipt:nativePin,native_logs:logs,source_manifest:pin(r.source_manifest),target_manifest:pin(targetName),
    source_sha256:target.target_sha256,source_files:manifest.files.length,binary:r.binary,binary_removed_independently_verified:true,
    source_precheck_verified:true,frozen_source_postcheck_verified:true,cleanup_verified:true,
    current_ordinary_receipt:pin(r.current_ordinary_receipt.path),compile_control_pins:r.control_pins.map(p=>pin(p.path)),
    compiler_cache_hints_only:true,test_results_reused:false,tests_executed:false,binary_executed:false,
    actual_SQL:false,production_approved:false,original_442_frozen_postcheck_retroactively_claimed:false,
    review_validator:pin('docs/evidence/a-security-linux-compile-review-20261027.mjs'),
    native_start_authorized:false,current_baseline_ready:false};
}
function main(){
  const [mode,nativeName,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&nativeName&&!extra.length);
  const output='docs/evidence/a-security-linux-compile-reviewed-20261027-r1.json',value=derive(nativeName);
  if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  else assert.deepEqual(json(output),value);
  console.log(JSON.stringify({mode,source_files:value.source_files,frozen_postcheck_verified:true,cleanup_verified:true,current_baseline_ready:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
