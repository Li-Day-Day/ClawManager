// Read-only ordinary package inventory. This cannot accept a full owner gate.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {validateGoEvents} from './d-resources-mysql-actual-review-20261023.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p);
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const sourcePath='docs/evidence/d-local-closeout-53f39288bb914e1ca2f2bd9287e7874a-source.json';
const previousPath='docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json';
const source=json(sourcePath);
assert.equal(source.kind,'d_local_closeout_snapshot.v1');
assert.equal(source.stable_copy_verified,true);
assert.equal(source.dependencies_installed,false);
assert.ok(Array.isArray(source.files)&&source.files.length>0);
const paths=source.files.map(p=>p.path);
assert.deepEqual(paths,[...new Set(paths)].sort());
for(const p of source.files){
  assert.match(p.path,/^(backend|contracts|scripts|docs)\//);
  assert.ok(!p.path.includes('\\')&&!p.path.split('/').some(p=>p==='..'||p==='.'||p===''));
  assert.match(p.sha256,/^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);
}
assert.equal(source.source_sha256,sha(source.files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n'));
const previous=json(previousPath);
assert.deepEqual(previous.packages.map(p=>p.package).sort(),['clawreef/internal/systembackupevidence','clawreef/internal/systembackupsecurity']);
const packages=previous.packages.map(p=>{
  const index=p.package==='clawreef/internal/systembackupevidence'?1:5;
  const file='docs/evidence/d-local-closeout-53f39288bb914e1ca2f2bd9287e7874a-step-'+index+'.log';
  const names=validateGoEvents(read(file).toString('utf8'),p.package);
  assert.deepEqual(p.tests.filter(n=>!names.includes(n)),[],'Previous owner check omitted');
  return {package:p.package,log:pin(file),roots:names.filter(n=>!n.includes('/')).length,pass_events:names.length,previous_checks_preserved:p.tests.length,added:names.filter(n=>!p.tests.includes(n))};
});
assert.equal(packages.reduce((n,p)=>n+p.previous_checks_preserved,0),5138);
assert.equal(packages.reduce((n,p)=>n+p.pass_events,0),5148);
assert.equal(packages.reduce((n,p)=>n+p.roots,0),640);
const report={kind:'a2_owner_ordinary_native_inventory_review.v1',status:'two_complete_ordinary_packages_only_full_owner_profile_pending',source:pin(sourcePath),source_sha256:source.source_sha256,source_snapshot_format_validated:true,prior_inventory:pin(previousPath),packages,roots:640,pass_events:5148,original_checks_preserved:5138,failures:0,skips:0,Go_repeated_by_this_review:false,remaining:['D terminal fifteen-stage receipt, source postcheck and cleanup','A1 successful packaged/detached owner seeds, Linux owner probe, postcheck and cleanup','exact combined current source and full profile review before baseline registration'],owner_profile_accepted:false,current_baseline_registration_permitted:false,actual_SQL:false,production_approved:false,dependencies_installed:false,reviewer_inputs:['docs/evidence/a2-owner-ordinary-inventory-review-20261023.mjs','docs/evidence/d-resources-mysql-actual-review-20261023.mjs'].map(pin)};
const output='docs/evidence/a2-owner-ordinary-inventory-reviewed-20261023.json';
assert.ok(['--write','--check'].includes(process.argv[2]));
if(process.argv[2]==='--write')fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),report);
console.log('A2_OWNER_ORDINARY_INVENTORY_REVIEWED roots=640 checks=5148 original_preserved=5138 full_gate_accepted=no');
