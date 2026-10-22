import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(raw(p));
const pin=p=>{const b=raw(p);return {path:p,size:b.length,sha256:hash(b)};};
const acceptedPath='docs/evidence/d-resources-proof-presence-accepted-20261022.json';
assert.equal(hash(raw(acceptedPath)),'ae92dd877e4b853b1bf5e0984c22bf1764f5412818ada3ecc534f7a858ded31b');
const accepted=json(acceptedPath),stages={};
for(const stage of ['baseline','candidate']){
 const prefix=`docs/evidence/d-resources-proof-presence-20261022-${stage}`;
 const inputs=json(prefix+'-inputs.json'),native=json(prefix+'-native.json');
 const events=raw(prefix+'.stdout').toString('utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line.replace(/^\uFEFF/,'')));
 assert.equal(hash(inputs.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),inputs.source_sha256);
 assert.equal(hash(raw(prefix+'.stdout')),accepted.stages[stage].stdout_sha256);
 assert.equal(hash(raw(prefix+'.stderr')),accepted.stages[stage].stderr_sha256);
 assert.equal(native.input_unchanged,true);assert.equal(native.default_vet,true);assert.equal(native.remote_executed,false);assert.equal(native.dependencies_installed,false);
 assert.equal(native.exit,stage==='baseline'?1:0);assert.equal(events.some(e=>e.Action==='skip'),false);
 const passed=events.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test),failed=events.filter(e=>e.Action==='fail'&&e.Test).map(e=>e.Test);
 assert.deepEqual(failed,accepted.stages[stage].failed);assert.equal(passed.length,accepted.stages[stage].passed);
 if(stage==='candidate'){
  assert.equal(passed.length,139);assert.equal(passed.filter(x=>!x.includes('/')).length,27);assert.equal(events.at(-1).Action,'pass');
  for(const p of inputs.files)assert.deepEqual(pin(p.path),p);
  const packageFiles=fs.readdirSync(path.join(root,'backend/internal/systembackupresources'),{recursive:true,withFileTypes:true}).filter(p=>p.isFile()).map(p=>path.relative(root,path.join(p.parentPath,p.name)).replaceAll('\\','/')).sort();
  assert.deepEqual(packageFiles,inputs.files.filter(p=>p.path.startsWith('backend/internal/systembackupresources/')).map(p=>p.path).sort());
 }else{
  const leaves=['Capture','Target'].flatMap(kind=>['pointer','function','map','slice','channel'].map(type=>`TestResources${kind}ProofPresence/${type}_nil`));
  assert.deepEqual(failed.filter(x=>x.includes('/')).sort(),leaves.sort());assert.equal(passed.length,12);
 }
 stages[stage]={inputs:pin(prefix+'-inputs.json'),native:pin(prefix+'-native.json'),stdout:pin(prefix+'.stdout'),stderr:pin(prefix+'.stderr'),source_sha256:inputs.source_sha256};
}
const old=json('docs/evidence/d-resources-proof-presence-20261022-baseline-inputs.json');
for(const [name,from,to] of [['verifier.go','if missingProofVerifier(proof) {','if proof == nil {'],['control_exclusion.go','|| missingProofVerifier(v.Proof) {','|| v.Proof == nil {']]){
 const file='backend/internal/systembackupresources/'+name,source=raw(file).toString('utf8');assert.equal(source.split(from).length,2);
 assert.equal(hash(Buffer.from(source.replace(from,to))),old.files.find(x=>x.path===file).sha256);
}
const cleanup=json('docs/evidence/d-resources-proof-presence-cleanup-20261022.json');
assert.equal(path.dirname(cleanup.owner),root);assert.match(path.basename(cleanup.owner),/^\.tmp-d-proof-presence-[a-f0-9]{32}$/);assert.equal(fs.existsSync(cleanup.owner),false);assert.equal(cleanup.owner_absent,true);
const result={kind:'a_d_resources_proof_presence_independent_review.v1',status:'typed_nil_rejection_fix_accepted_within_original_resources_scope',owner_acceptance:pin(acceptedPath),stages,original_failing_leaves:10,original_controls_passed:12,candidate_roots:27,candidate_pass_events:139,selected_current_inputs:18,two_original_conditions_exactly_reconstructed:true,cleanup:{owner:cleanup.owner,independently_absent:true,reported_files_removed:cleanup.files_removed},boundaries:{real_B_proof_accepted:false,nine_table_normalization_approved:false,six_table_policy_changes_required:true,current_whole_tree_tested:false,actual_MySQL:false,dependencies_installed:false,production_approved:false}};
const output=path.join(root,'docs/evidence/a-d-resources-proof-presence-accepted-20261022.json');
if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),result);
else fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('A_RESOURCES_PROOF_PRESENCE old_nil_failures=10 candidate=27/139 selected_inputs=18 cleanup=verified real_B_proof=pending');
