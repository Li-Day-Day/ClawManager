import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const token='a4e855a078d14aabbe760cbd93bb6ac0',prefix=`docs/evidence/d-resources-rules-local-${token}`;
const receipt=json(`${prefix}.json`);assert.equal(receipt.exit_code,0);assert.equal(receipt.error,null);
for(const flag of ['frozen_inputs_stable','current_inputs_stable','owner_removed','default_vet'])assert.equal(receipt[flag],true,flag);
for(const flag of ['dependencies_installed','actual_mysql','production_wired'])assert.equal(receipt[flag],false,flag);
const owner=path.resolve(receipt.owner);assert.equal(path.dirname(owner),root);assert.equal(path.basename(owner),`.tmp-d-resources-rules-${token}`);assert.equal(fs.existsSync(owner),false);
const snapshot=json(`${prefix}-source.json`);
for(const f of snapshot.inputs){const b=Buffer.from(f.bytes_base64,'base64');assert.equal(b.length,f.size);assert.equal(sha(b),f.sha256);assert.equal(sha(read(f.path)),f.sha256,f.path);}
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
assert.deepEqual(walk('backend/internal/systembackupresources'),snapshot.inputs.filter(f=>f.path.startsWith('backend/internal/systembackupresources/')).map(f=>f.path).sort());
const events=read(`${prefix}.jsonl`).toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
assert.equal(events.filter(e=>e.Action==='fail'||e.Action==='skip').length,0);assert.equal(events.filter(e=>e.Action==='start').length,1);assert.equal(events.filter(e=>e.Action==='pass'&&!e.Test).length,1);
const packageName='_/'+owner.replaceAll('\\','/').replace(':','_')+'/source/backend/internal/systembackupresources';assert.ok(events.every(e=>e.Package===packageName));assert.equal(events.at(-1).Action,'pass');assert.equal(events.at(-1).Test,undefined);
const passes=events.filter(e=>e.Action==='pass'&&e.Test),runs=events.filter(e=>e.Action==='run'&&e.Test);assert.equal(new Set(passes.map(e=>e.Test)).size,passes.length);assert.deepEqual(runs.map(e=>e.Test).sort(),passes.map(e=>e.Test).sort());
for(const name of ['TestNormalizeRestoreNorthboundCompleteClosedCandidate','TestNormalizeRestoreNorthboundEveryNumericBound','TestNormalizeRestoreNorthboundFailuresDiscardCandidate','TestNormalizeRestoreNorthboundEmptyCapacityAndCancellation'])assert.equal(passes.filter(e=>e.Test===name).length,1,name);
for(const [name,count] of [['TestNormalizeRestoreNorthboundEveryNumericBound/',69],['TestNormalizeRestoreNorthboundFailuresDiscardCandidate/',40],['TestNormalizeRestoreImagesFailuresDiscardCandidate/',29],['TestNormalizeRestoreImagesDuplicateLogicalIdentity/',3],['TestNormalizeRestoreEgressFailuresDiscardCandidate/',29],['TestNormalizeRestoreAuditFailuresDiscardBothTables/',29],['TestRestoreFieldsEveryColumn/',111],['TestRestoreFieldsSQLFailuresDiscardAllRows/',16]])assert.equal(passes.filter(e=>e.Test.startsWith(name)).length,count,name);
const request='docs/evidence/d-resources-northbound-review-request-20261023.json',r=json(request);for(const f of r.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
assert.deepEqual(r.independent_service_alignment,{integer_ranges:20,CPU_ranges:3,CPU_SQL_intersection:'DECIMAL_4_2_max_99_99',runtime_types:5});
const pins=[`${prefix}.json`,`${prefix}.jsonl`,`${prefix}-source.json`,request,'docs/evidence/d-resources-northbound-validation-20261023.mjs'];
const result={kind:'d_resources_northbound_candidate_validation.v1',date:'2026-10-23',scope:'complete_offline_systembackupresources_package_no_actual_SQL',exit_code:0,
  root_tests:passes.filter(e=>!e.Test.includes('/')).length,pass_events:passes.length,failed_or_skipped:0,northbound_range_scenarios:69,northbound_failure_scenarios:40,
  image_failure_scenarios:29,image_duplicate_scenarios:3,egress_failure_scenarios:29,audit_failure_scenarios:29,SQL_failure_scenarios:16,field_mutations:111,
  default_vet:true,frozen_inputs:snapshot.inputs.length,current_package_set_and_bytes_match:true,request_inputs:r.source_files.length,owner,owner_absence_independently_checked:true,removed_files:receipt.removed_files,
  dependencies_installed:false,actual_mysql:false,production_wired:false,northbound_candidate_review_approved:false,full_normalization_complete:false,strict_admission:'not_ready',evidence:pins.map(f=>({path:f,sha256:sha(read(f))}))};
const output='docs/evidence/d-resources-northbound-validation-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log(JSON.stringify(result));
