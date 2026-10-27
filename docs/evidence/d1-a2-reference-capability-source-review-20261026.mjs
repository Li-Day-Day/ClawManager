import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(p),text=p=>raw(p).toString('utf8').replace(/^\uFEFF/,''),json=p=>JSON.parse(text(p));
const request='docs/evidence/a2-reference-capability-parity-candidate-20261026.json',r=json(request);
for(const p of [r.original_schema,r.current_decoder,r.candidate,r.before_archive,r.candidate_test]){
 const b=raw(p.path);assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);
}
assert.equal(r.live_runtime_applied,false);assert.equal(r.Go_tests_or_builds_executed,false);assert.equal(r.production_approved,false);
const before=text(r.before_archive.path),after=text(r.candidate.path);
const oldLine='"evidence_read_write": {"exact_write", "exact_read", "exact_delete", "conditional_create", "append_record", "range_read", "snapshot_list", "inventory_read"}';
const newLine='"evidence_read_write": {"exact_write", "exact_read", "conditional_create", "range_read"}';
assert.equal(before.split(oldLine).length-1,1);assert.equal(after.split(newLine).length-1,1);assert.equal(after.replace(newLine,oldLine),before,'change outside one capability literal');
function capabilitySets(source){
 const start=source.indexOf('capabilities := map[string][]string{');assert.ok(start>=0);
 const end=source.indexOf('\n\t\t}',start);assert.ok(end>start);
 return new Map([...source.slice(start,end).matchAll(/"([a-z_]+)":\s*\{([^}]+)\}/g)].map(m=>[m[1],[...m[2].matchAll(/"([a-z_]+)"/g)].map(x=>x[1]).toSorted()]));
}
const schema=json(r.original_schema.path),body=schema.$defs.ProviderCredentialRef.allOf.find(n=>n.properties?.credential_capability?.enum);
assert.ok(body);const all=body.properties.credential_capability.enum;assert.equal(all.length,8);
const oldSets=capabilitySets(before),newSets=capabilitySets(after),rows=[];
assert.equal(oldSets.size,10);assert.equal(newSets.size,10);
const accepts=(c,v)=>c?.const===v||c?.enum?.includes(v)===true;
for(const purpose of body.properties.purpose.enum){
 let allowed=[...all],clauses=0;
 for(const clause of body.allOf){
  if(!accepts(clause.if?.properties?.purpose,purpose))continue;
  assert.deepEqual(Object.keys(clause.if.properties),['purpose']);assert.deepEqual(clause.if.required,['purpose']);
  const limit=clause.then?.properties?.credential_capability;if(!limit)continue;
  allowed=allowed.filter(v=>accepts(limit,v));clauses++;
 }
 assert.ok(clauses>0);allowed.sort();assert.deepEqual(newSets.get(purpose),allowed,'candidate versus original schema '+purpose);
 const extra=oldSets.get(purpose).filter(v=>!allowed.includes(v));
 if(purpose==='evidence_read_write')assert.deepEqual(extra.toSorted(),['exact_delete','append_record','snapshot_list','inventory_read'].toSorted());else assert.deepEqual(oldSets.get(purpose),allowed);
 rows.push({purpose,original_schema:allowed,candidate:newSets.get(purpose),old_extra:extra});
}
const test=text(r.candidate_test.path);
for(const s of ['secret-ref.schema.json','schema.Definitions["ProviderCredentialRef"].AllOf','body.Properties["credential_capability"].Enum','body.AllOf','DecodeSecurityReference(input, sha(input))'])assert.ok(test.includes(s),s);
assert.ok(!test.includes('referenceVariant('));assert.ok(!test.includes('capabilities := map[string][]string'));
const output='docs/evidence/d1-a2-reference-capability-source-reviewed-20261026.json';
const result={kind:'d1_a2_reference_capability_candidate_source_review.v1',status:'narrow_candidate_matches_existing_contract_native_not_reviewed',before_sha256:r.before_archive.sha256,candidate_sha256:r.candidate.sha256,original_schema_sha256:r.original_schema.sha256,exact_one_literal_change:true,provider_purposes_checked:10,other_nine_sets_unchanged:true,removed:['exact_delete','append_record','snapshot_list','inventory_read'],rows,regression_expected_from_original_schema:true,planned_regression_children:8,old_negative_failures_executed:false,new_native_tests_executed:false,live_source_not_modified_by_reviewer:true,source_only_not_admission:true,original_draft_contract_not_promoted:true,actual_mysql:false,production_approved:false,remaining:['After ae7 terminal/cleanup, old-source actual four negative failures and fixed-source complete package plus dependent material/integration checks','Exact new frozen source, native exit and cleanup receipts; no expansion of ae7 snapshot'],artifacts:[request,r.original_schema.path,r.before_archive.path,r.candidate.path,r.candidate_test.path,'docs/evidence/d1-a2-reference-capability-source-review-20261026.mjs'].map(path=>({path,sha256:sha(raw(path))}))};
if(process.argv.includes('--check'))assert.deepEqual(json(output),result);else fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('D1_A2_REFERENCE_CANDIDATE_SOURCE_REVIEWED purposes=10 narrowed=4 native=not_run production=no');
