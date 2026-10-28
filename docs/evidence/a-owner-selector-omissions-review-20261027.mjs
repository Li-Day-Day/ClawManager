import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {enumerate,changesBetween,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>fs.readFileSync(path.join(root,name));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=name=>JSON.parse(read(name).toString('utf8').replace(/^\uFEFF/,''));
const pin=name=>{const b=read(name);return{path:name,size:b.length,sha256:sha(b)}};

function derive(){
  const parentName='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json',parent=json(parentName);
  assert.equal(parent.kind,'d_bootstrap_entry_native.v1');assert.equal(parent.status,'failed');
  const parentFiles=[...parent.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const target=enumerate(root),targetNames=new Set(target.map(p=>p.path));
  const omissions=changesBetween(parentFiles,target).filter(row=>row.after===null);
  assert.equal(omissions.length,51);
  const selectedExtensions=/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/;
  for(const row of omissions){
    assert.ok(row.path.startsWith('backend/')||row.path.startsWith('scripts/'));
    assert.equal(targetNames.has(row.path),false);assert.equal(selectedExtensions.test(row.path),false);
    assert.deepEqual(pin(row.path),row.before,'Omitted live input changed or was removed: '+row.path);
  }
  assert.equal(omissions.filter(row=>row.path.endsWith('.py')).length,45);
  assert.equal(omissions.filter(row=>row.path.startsWith('backend/')).length,6);
  return{kind:'a_owner_selector_omissions_review.v1',status:'exact_selection_difference_live_bytes_unchanged_execution_scope_still_required',
    parent_receipt:pin(parentName),parent_source_sha256:sourceDigest(parentFiles),parent_status_preserved:'failed',
    snapshotter:pin('docs/evidence/d-local-closeout-snapshot-20261023.mjs'),
    target_selector:pin('docs/evidence/a-owner-pre-thin-target-20261026.mjs'),
    review_validator:pin('docs/evidence/a-owner-selector-omissions-review-20261027.mjs'),
    omissions:omissions.map(({path,before,after})=>({path,before,after})),
    omitted_python_files:45,omitted_backend_support_files:6,all_live_original_bytes_verified:true,physical_deletion_observed:false,
    functional_change_accepted:false,executed_input_inventory_complete:false,source_scope_approved:false,
    native_start_authorized:false,current_baseline_ready:false,actual_SQL:false,production_approved:false,
    remaining:'Bind these exact rows into the independent support scope together with the complete applicable native execution-input inventory; excluded deployment/Python paths have no functional acceptance from this Go supplement'};
}
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&extra.length===0);
const output='docs/evidence/a-owner-selector-omissions-reviewed-20261027-r1.json',review=derive();
if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(review,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),review);
console.log(JSON.stringify({mode,omissions:review.omissions.length,live_bytes_unchanged:true,native_start_authorized:false}));
