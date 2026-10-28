import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const token='4aa89a44072a42dfa31a0eb65e777053';
const prefix=`docs/evidence/d-resources-rules-local-${token}`;
const receipt=json(`${prefix}.json`);
assert.equal(receipt.exit_code,0);assert.equal(receipt.error,null);
for(const flag of ['frozen_inputs_stable','current_inputs_stable','owner_removed','default_vet'])assert.equal(receipt[flag],true,flag);
for(const flag of ['dependencies_installed','actual_mysql','production_wired'])assert.equal(receipt[flag],false,flag);
const owner=path.resolve(receipt.owner);
assert.equal(path.dirname(owner),root);assert.equal(path.basename(owner),`.tmp-d-resources-rules-${token}`);
assert.equal(fs.existsSync(owner),false,'exact owner remains');
const snapshot=json(`${prefix}-source.json`);
for(const f of snapshot.inputs){const b=Buffer.from(f.bytes_base64,'base64');assert.equal(b.length,f.size);assert.equal(sha(b),f.sha256);assert.equal(sha(read(f.path)),f.sha256,f.path);}
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
assert.deepEqual(walk('backend/internal/systembackupresources'),snapshot.inputs.filter(f=>f.path.startsWith('backend/internal/systembackupresources/')).map(f=>f.path).sort());
const events=read(`${prefix}.jsonl`).toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
assert.equal(events.filter(e=>e.Action==='fail'||e.Action==='skip').length,0);
assert.equal(events.filter(e=>e.Action==='pass'&&!e.Test).length,1);
const passes=events.filter(e=>e.Action==='pass'&&e.Test);
for(const name of ['TestNormalizeRestoreAuditCompleteColumnsAndHistory','TestNormalizeRestoreAuditFailuresDiscardBothTables','TestNormalizeRestoreAuditNullEmptyAndReferences','TestNormalizeRestoreAuditCapacityAndCancellation'])assert.equal(passes.filter(e=>e.Test===name).length,1,name);
assert.equal(passes.filter(e=>e.Test.startsWith('TestNormalizeRestoreAuditFailuresDiscardBothTables/')).length,29);
assert.equal(passes.filter(e=>e.Test.startsWith('TestRestoreFieldsEveryColumn/')).length,111);
assert.equal(passes.filter(e=>e.Test.startsWith('TestRestoreFieldsSQLFailuresDiscardAllRows/')).length,16);
const request='docs/evidence/d-resources-audit-review-request-20261023.json';
const r=json(request);for(const f of r.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const pins=[`${prefix}.json`,`${prefix}.jsonl`,`${prefix}-source.json`,request,'docs/evidence/d-resources-audit-validation-20261023.mjs'];
const result={kind:'d_resources_audit_candidate_validation.v1',date:'2026-10-23',scope:'complete_offline_systembackupresources_package_no_actual_SQL',
  exit_code:0,root_tests:passes.filter(e=>!e.Test.includes('/')).length,pass_events:passes.length,failed_or_skipped:0,audit_failure_scenarios:29,SQL_failure_scenarios:16,field_mutations:111,
  default_vet:true,frozen_inputs:snapshot.inputs.length,current_package_set_and_bytes_match:true,request_inputs:r.source_files.length,
  owner,owner_absence_independently_checked:true,removed_files:receipt.removed_files,dependencies_installed:false,actual_mysql:false,production_wired:false,
  audit_candidate_review_approved:false,full_normalization_complete:false,B_C_user_confirmed:'not_delivered',strict_admission:'not_ready',evidence:pins.map(f=>({path:f,sha256:sha(read(f))}))};
const output='docs/evidence/d-resources-audit-validation-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log(JSON.stringify(result));
