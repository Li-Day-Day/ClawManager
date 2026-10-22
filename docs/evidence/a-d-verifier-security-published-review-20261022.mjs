// A's final cross-review after the candidate was published and revalidated.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(raw(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=raw(p);return {path:p,size:b.length,sha256:sha(b)};};
const digest=files=>sha(files.map(p=>p.path+'\0'+p.sha256+'\0'+p.size).join('\n')+'\n');
const prefix='docs/evidence/d-resources-proof-isolation-20261022-fc8cb8e5';
const prep=json(prefix+'-preparation.json'),native=json(prefix+'-native.json'),scope=json(prefix+'-scope.json'),manifest=json(prefix+'-source.json');
assert.equal(prep.status,'locally_validated_published_cleaned');assert.equal(native.exit,0);assert.equal(native.source_postcheck,true);
assert.equal(prep.source_files,1561);assert.equal(manifest.files.length,1561);assert.equal(manifest.source_sha256,digest(manifest.files));
assert.equal(prep.source_sha256,manifest.source_sha256);assert.equal(prep.input_scope_sha256,digest(scope.files));assert.equal(scope.files.length,224);
for(const e of prep.evidence)assert.deepEqual(pin(e.path),e,'Archived evidence changed '+e.path);
for(const step of native.stages){assert.equal(step.exit,step.stage==='counterfactual'?1:0);assert.ok(!step.arguments.includes('-vet=off'));}
for(const stage of ['dependencies','counterfactual','isolated','published'])assert.equal(raw(prefix+'-'+stage+'.stderr').length,0);
function events(stage){return raw(prefix+'-'+stage+'.stdout').toString('utf8').trim().split(/\r?\n/).map(JSON.parse);}
function complete(stage){
  const e=events(stage);assert.ok(e.length>0);assert.ok(e.every(p=>p.Package==='clawreef/internal/systembackupresources'));
  assert.equal(e.filter(p=>['skip','fail','build-fail'].includes(p.Action)).length,0);
  const runs=e.filter(p=>p.Action==='run'&&p.Test).map(p=>p.Test).sort(),passed=e.filter(p=>p.Action==='pass'&&p.Test).map(p=>p.Test).sort();
  assert.deepEqual(runs,passed);assert.equal(new Set(runs).size,runs.length);assert.equal(passed.length,115);
  assert.equal(passed.filter(p=>!p.includes('/')).length,25);assert.equal(e.filter(p=>p.Action==='pass'&&!p.Test).length,1);
  return passed;
}
assert.deepEqual(complete('isolated'),complete('published'));
const counter=events('counterfactual'),failed=counter.filter(p=>p.Action==='fail'&&p.Test).map(p=>p.Test).sort();
const expected=[];
for(const name of ['source_rows','dump_rows','source_identity','dump_identity','source_cutoff','dump_cutoff','proof_error','proof_error_canceled','proof_canceled'])expected.push('TestResourcesCaptureProofCannotChangeValidatedInputs/'+name);
for(const name of ['shared_caller_storage','retained_source','retained_dump'])expected.push('TestResourcesCaptureProofInputsStaySeparate/'+name);
for(const name of ['rows','audit','external_rows','external_audit'])expected.push('TestResourcesCaptureProofCannotHideOriginalMismatches/'+name);
assert.deepEqual(failed.filter(p=>p.includes('/')),expected.sort());assert.equal(failed.length,19);
assert.deepEqual(counter.filter(p=>p.Action==='pass'&&p.Test).map(p=>p.Test).sort(),['TestResourcesCaptureProofCannotChangeValidatedInputs/unchanged','TestResourcesCaptureProofEmptyAuditPreservesNull'].sort());
assert.equal(counter.filter(p=>p.Action==='skip').length,0);assert.equal(counter.filter(p=>p.Action==='fail'&&!p.Test).length,1);
for(const file of prep.changed_files){
  const tested=Buffer.from(file.tested_bytes_base64,'base64');assert.equal(sha(tested),file.after_sha256);assert.deepEqual(raw(file.path),tested);
  if(file.before_bytes_base64)assert.equal(sha(Buffer.from(file.before_bytes_base64,'base64')),file.before_sha256);
}
const drift=scope.files.flatMap(p=>{const current=pin(p.path);return current.sha256===p.sha256&&current.size===p.size?[]:[{path:p.path,archived_sha256:p.sha256,current_sha256:current.sha256}];});
assert.equal(drift.length,1);assert.equal(drift[0].path,'contracts/system-backup/v12/verifier-contract.schema.json');
// Reconstruct the exact old schema from the separate D cardinality change.
const schemaChange=json('docs/evidence/d-verifier-registry-counts-20261022-r3-83ec9750-candidate.json').changes.find(p=>p.path===drift[0].path);
const oldSchema=Buffer.from(schemaChange.before_bytes_base64,'base64');assert.equal(sha(oldSchema),drift[0].archived_sha256);
const before=JSON.parse(oldSchema),currentSchema=json(drift[0].path);
assert.equal(before['x-owner-check-registries'].D.control_plane_restore_validate.required_check_count,31);
before['x-owner-check-registries'].D.control_plane_restore_validate.required_check_count=35;assert.deepEqual(before,currentSchema);
const resourcesOwner=path.resolve(root,'.tmp-d-index-cache-fc8cb8e5215e4764b578d9b4a2276ef6');
assert.equal(path.resolve(native.cleanup.owner),resourcesOwner);assert.equal(native.cleanup.removed,true);assert.equal(native.cleanup.files_removed,2806);assert.equal(fs.existsSync(resourcesOwner),false);

const validationPath='docs/evidence/a-verifier-dialect-20261022-31fe481b-result.json',v=json(validationPath);
assert.equal(v.status,'isolated_candidate_validated_live_checker_preserved');assert.equal(v.published,false);
assert.equal(v.source_postcheck,true);assert.equal(v.cleanup_verified,true);assert.equal(fs.existsSync(v.owner),false);
assert.deepEqual(v.tests,{tests:120,pass:120,fail:0,cancelled:0,skipped:0,todo:0});
const c=json('docs/evidence/a-verifier-dialect-candidate-20261022.json');
const testArchive=json('docs/evidence/a-verifier-dialect-candidate-tests-20261022.json');
assert.equal(sha(raw(c.path)),c.candidate_sha256);assert.equal(sha(Buffer.from(c.candidate_bytes_base64,'base64')),c.candidate_sha256);
assert.equal(sha(raw(testArchive.path)),testArchive.sha256);
const publishedPath='docs/evidence/a-verifier-dialect-20261022-743dc606-result.json',published=json(publishedPath);
assert.equal(published.status,'published_checker_validated_current_inputs');assert.equal(published.published,true);
assert.equal(published.source_postcheck,true);assert.equal(published.cleanup_verified,true);assert.equal(fs.existsSync(published.owner),false);
assert.deepEqual(published.tests,v.tests);
const expectedInputs=v.source_inputs.map(p=>{
  if(p.path!==c.path)return p;
  assert.equal(p.sha256,c.before_sha256);return pin(c.path);
}).concat(pin(testArchive.path)).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
assert.deepEqual(published.source_inputs,expectedInputs);
for(const p of published.source_inputs)assert.deepEqual(pin(p.path),p,'Current published input changed '+p.path);
assert.equal(published.stages.length,9);
for(const s of published.stages){for(const e of [s.stdout,s.stderr])assert.deepEqual(pin(e.path),e);assert.equal(s.exit,s.stage==='full-contract-tests'||s.stage==='normal-cli'?0:1);}
for(const key of ['dependencies_installed','remote_run','go_test_or_build_run','production_approved'])assert.equal(published[key],false);
assert.equal(v.stages.length,9);
for(const s of v.stages){for(const e of [s.stdout,s.stderr])assert.deepEqual(pin(e.path),e);assert.equal(s.exit,s.stage==='full-contract-tests'||s.stage==='normal-cli'?0:1);}
for(const key of ['dependencies_installed','remote_run','go_test_or_build_run','production_approved'])assert.equal(v[key],false);
const baseline=raw('docs/evidence/a-verifier-dialect-counter-before-20261022.txt').toString('utf8');
for(const [key,value] of Object.entries({tests:7,pass:0,fail:7,cancelled:0,skipped:0,todo:0}))assert.match(baseline,new RegExp('^[#ℹ]\\s+'+key+'\\s+'+value+'\\s*$','m'));
const report={kind:'a_d_verifier_security_published_cross_review.v1',status:'resources_original_fix_accepted_cardinality_gate_published_revalidated',
  resources:{original_source_sha256:manifest.source_sha256,original_source_files:1561,original_scoped_inputs:224,
    isolated:{roots:25,passed:115},published:{roots:25,passed:115},original_code_failed_leaves:16,original_control_passes:2,
    current_runtime_and_test_bytes_match:true,current_scoped_files_matching:223,current_scope_drift:drift,
    drift_semantics:'Only D required_check_count changed from 31 to 35; original proof test scope is not repinned.',
    original_owner_independently_absent:true,source_copies_and_build_artifacts_reported_removed:2806,
    go_tests_rerun_by_A:false,real_B_proof_accepted:false,current_whole_tree_tested:false},
  cardinality:{original_checker_sha256:c.before_sha256,finding:'Additional schema/common-ref constraints and unhandled branch properties were counted as supported finite-ID declarations.',
    old_checker_new_negative_checks:{failed:7,passed:0},candidate_sha256:c.candidate_sha256,
    isolated_candidate_tests:120,cli_rejection_cases:6,registry_unchanged_on_rejected_write:true,strict_still_blocked:true,
    live_checker_preserved_during_operator_run:true,candidate_published:true,published_tests:120,published_source_inputs:published.source_inputs.length,
    published_source_postcheck:true,patch:'docs/evidence/a-verifier-dialect-20261022.patch',
    patch_applied_after_operator_receipt_acceptance:true,does_not_claim_arbitrary_schema_satisfiability:true,
    initial_CRLF_publication_check_failure_preserved:true},
  evidence:[prefix+'-preparation.json',prefix+'-native.json',prefix+'-scope.json',prefix+'-source.json',
    ...['counterfactual','isolated','published'].map(s=>prefix+'-'+s+'.stdout'),
    'docs/evidence/a-verifier-dialect-original-checker-20261022.json','docs/evidence/a-verifier-dialect-candidate-20261022.json',
    'docs/evidence/a-verifier-dialect-candidate-tests-20261022.json','docs/evidence/a-verifier-dialect-counter-before-20261022.txt',
    validationPath,publishedPath,'docs/evidence/a-verifier-dialect-20261022-c3aa6d7a-result.json',
    'docs/evidence/a-verifier-dialect-20261022-5d521ab8-result.json',
    'docs/evidence/a-verifier-dialect-isolated-runner-original-20261022.json',
    'docs/evidence/a-verifier-dialect-validation-20261022.mjs','docs/evidence/a-verifier-dialect-20261022.patch'].map(pin),
  remote_run_by_A:false,dependencies_installed_by_A:false,production_approved:false,
  cleanup:{isolated_and_published_source_fixture_directories_absent:true,new_test_file_is_repository_source:true}};
const output='docs/evidence/a-d-verifier-security-published-review-20261022.json';
if(process.argv.length===3&&process.argv[2]==='--check')assert.deepEqual(json(output),report);
else {assert.equal(process.argv.length,2);fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log('PASS A resources proof historical review: 115 checks twice, 16 counterexamples; cardinality fix published, 120 checks before/after, six rejecting CLIs twice and 346 current inputs; owned artifacts absent');
