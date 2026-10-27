import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(path.join(root,file));
const json=file=>JSON.parse(read(file).toString('utf8').replace(/^\uFEFF/,''));
const pin=file=>({path:file,size:read(file).length,sha256:sha(read(file))});
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const prefix='docs/evidence/d-resources-rules-local-';
const runs=['2b6a995375a44f2991e43dc481e1466f','27c8c6af4cf0495a8d6578b4b7a47dde'];
const required=['TestRestoreTypedMapping','TestRestoreAuditReferencesAndOccupiedHistory','TestRestoreWholeBodyRedaction','TestRestoreTargetNorthboundCASAndDecimal','TestRestoreWholeNetworkAdmission','TestRestoreStrictScanScope'];
const summaries=[];
for(const [index,id] of runs.entries()) {
  const receipt=json(prefix+id+'.json');
  assert.equal(receipt.exit_code,0); assert.equal(receipt.error,null);
  for(const key of ['frozen_inputs_stable','current_inputs_stable','owner_removed','default_vet']) assert.equal(receipt[key],true);
  for(const key of ['dependencies_installed','actual_mysql','cross_review_approval','production_wired']) assert.equal(receipt[key],false);
  assert.equal(path.dirname(receipt.owner),root);
  assert.equal(path.basename(receipt.owner),'.tmp-d-resources-rules-'+id);
  assert.equal(fs.existsSync(receipt.owner),false);
  assert.ok(receipt.removed_files>0);
  const snapshot=json(relative(receipt.snapshot));
  const inputs=snapshot.inputs;
  assert.equal(new Set(inputs.map(file=>file.path)).size,inputs.length);
  for(const file of inputs) {
    const bytes=Buffer.from(file.bytes_base64,'base64');
    assert.equal(bytes.length,file.size); assert.equal(sha(bytes),file.sha256);
    // The first harness was corrected after its start. Only the second run
    // freezes the harness itself; package/schema bytes are current in both.
    assert.equal(sha(read(file.path)),file.sha256);
  }
  const lines=read(relative(receipt.log)).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const nonJSON=lines.filter(line=>!line.startsWith('{'));
  if(index===0) {
    assert.equal(nonJSON.length,1); assert.match(nonJSON[0],/^error acquiring upload token: creating token file: open .*Access is denied\.$/);
    assert.ok(!inputs.some(file=>file.path==='scripts/system-backup-d-resources-rules-validation.ps1'));
  } else {
    assert.deepEqual(nonJSON,[]);
    assert.ok(inputs.some(file=>file.path==='scripts/system-backup-d-resources-rules-validation.ps1'));
  }
  const events=lines.filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  assert.equal(events.filter(event=>event.Action==='fail'||event.Action==='skip').length,0);
  const ran=events.filter(event=>event.Action==='run'&&event.Test).map(event=>event.Test);
  const passed=events.filter(event=>event.Action==='pass'&&event.Test).map(event=>event.Test);
  assert.deepEqual([...ran].sort(),[...passed].sort()); assert.equal(new Set(ran).size,ran.length);
  assert.equal(events.filter(event=>event.Action==='pass'&&!event.Test).length,1);
  const roots=passed.filter(name=>!name.includes('/'));
  for(const name of required) assert.ok(roots.includes(name));
  summaries.push({receipt:pin(prefix+id+'.json'),snapshot:pin(relative(receipt.snapshot)),log:pin(relative(receipt.log)),inputs:inputs.length,roots:roots.length,pass_events:passed.length,new_rule_roots:required,failed:0,skipped:0,removed_files:receipt.removed_files,owner:receipt.owner,owner_independently_absent:true,telemetry_warning_preserved:index===0,isolated_telemetry_verified_by_frozen_harness:index===1});
}
const request=json('docs/evidence/d-resources-review-request-v2-20261022.json');
assert.equal(request.production_wired,false);assert.equal(request.full_normalization_implemented,false);
const result={kind:'d_resources_rules_local_review.v1',status:'offline_helpers_complete_package_passed_same_version_cross_review_pending',runs:summaries,request:pin('docs/evidence/d-resources-review-request-v2-20261022.json'),total_removed_files:summaries.reduce((sum,run)=>sum+run.removed_files,0),scope:'complete_resources_package_and_six_new_offline_helper_roots',real_B_C_proof:false,full_nine_table_normalization:false,field_verifier:false,actual_mysql:false,production_approval:false};
const output='docs/evidence/d-resources-rules-reviewed-20261022.json';
if(process.argv.includes('--check'))assert.deepEqual(json(output),result);
else{assert.ok(process.argv.includes('--write'));fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
console.log(`D_RESOURCES_RULES_ACCEPTED roots=${summaries[1].roots} pass_events=${summaries[1].pass_events} new_roots=6 removed_files=${result.total_removed_files} actual_mysql=no production=no`);
