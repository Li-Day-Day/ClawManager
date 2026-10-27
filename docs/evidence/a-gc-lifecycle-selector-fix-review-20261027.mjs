import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {overlayLifecycleRunner} from './d-gc-full-lifecycle-source-20261026.mjs';
import {sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)}};
function derive(){
  const requestName='docs/evidence/d-gc-full-lifecycle-review-request-20261027-r2.json',request=json(requestName);
  assert.equal(request.status,'source_only_native_and_global_review_pending');assert.equal(request.source_version,'20261027-r2');
  assert.deepEqual(pin(request.candidate.path),request.candidate);const candidate=json(request.candidate.path);
  assert.equal(candidate.status,'source_only_native_and_global_review_pending');
  const targetName='docs/evidence/a-owner-pre-thin-target-20261027-r2.json',target=json(targetName);
  assert.deepEqual(candidate.original_files,target.target_files);assert.equal(candidate.original_source_sha256,target.target_sha256);
  assert.equal(sourceDigest(candidate.files),candidate.source_sha256);assert.equal(candidate.files.length,1719);
  assert.deepEqual(candidate.origin_harness_pins,request.origin_harness_pins);
  for(const p of request.origin_harness_pins)assert.deepEqual(pin(p.path),p);
  for(const p of request.additional_harness_and_preparation_pins)assert.deepEqual(pin(p.path),p);
  const operator='docs/evidence/d-gc-full-lifecycle-operator-20261026.ps1',source=read(operator).toString('utf8');
  const fixed=' -ConfigWriterOnly -ConfigDownloadGCFullCollectOnly';assert.equal(source.split(fixed).length-1,1);
  assert.equal(sha(Buffer.from(source.replace(fixed,' -ConfigProofOnly'+fixed))),
    '455cc8245b9802e4b71a3a8fb9571ba7679f635965a665b45ae33b0153b2870c');
  assert.equal(pin(operator).sha256,'cd6451a1ddeeb6eb74a99b730107bccd495cf3298daf8c6774ab83a981b4b9d4');
  const beforeName='docs/evidence/a-gc-lifecycle-selector-before-20261027.json',before=json(beforeName);
  const afterName='docs/evidence/a-gc-lifecycle-selector-after-independent-20261027-r2.json',after=json(afterName);
  assert.equal(before.actual_prefix_accepted,false);assert.equal(before.actual_prefix_error,'Choose the config proof or writer profile separately');
  assert.equal(after.actual_prefix_accepted,true);assert.equal(after.actual_prefix_error,null);
  assert.deepEqual(after.actual_operator_selectors,['ConfigDownloadGCFullCollectOnly','ConfigWriterOnly']);
  assert.equal(after.operator_sha256,pin(operator).sha256);
  for(const observation of [before,after])for(const field of ['invoked_operator','Go_started','SSH','SQL','source_capture','formal_operator_source_accepted','production_approved'])assert.equal(observation[field],false);
  assert.deepEqual(pin(request.rendered_runner.path),request.rendered_runner);
  const rendered=Buffer.from(overlayLifecycleRunner(read('scripts/system-backup-a-evidence-validation.ps1').toString('utf8')));
  assert.ok(rendered.equals(read(request.rendered_runner.path)));assert.equal(after.rendered_harness_sha256,sha(rendered));
  return{kind:'a_gc_lifecycle_selector_fix_source_review.v1',status:'selector_conflict_fixed_source_preparation_only',
    request:pin(requestName),candidate:pin(request.candidate.path),target_manifest:pin(targetName),
    original_source_files:1718,original_source_sha256:target.target_sha256,operator_source_files:1719,operator_source_sha256:candidate.source_sha256,
    operator:pin(operator),original_operator_sha256:before.operator_sha256,exact_single_argument_removal_reversible:true,
    selector_before:pin(beforeName),selector_after:pin(afterName),parameter_only_receiver:pin('docs/evidence/a-gc-lifecycle-selector-review-20261027.ps1'),
    rendered_harness:pin(request.rendered_runner.path),review_validator:pin('docs/evidence/a-gc-lifecycle-selector-fix-review-20261027.mjs'),
    no_operator_or_native_execution_by_this_review:true,formal_operator_source_accepted:false,
    current_eight_and_fifteen_native_prerequisites_still_required:true,
    actual_SQL:false,production_approved:false,whole_goal_complete:false};
}
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
const output='docs/evidence/a-gc-lifecycle-selector-fix-reviewed-20261027-r2.json',value=derive();
if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),value);
console.log(JSON.stringify({mode,selector_conflict_fixed:true,formal_operator_source_accepted:false,Go_started:false}));
