import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {derivePhaseObservation} from './a-bootstrap-entry-phase-review-20261027.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return{path:p,size:b.length,sha256:sha(b)}};
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const parentName='docs/evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json';
const phaseName='docs/evidence/a-bootstrap-entry-phase-observed-20261027-ae7af383.json';
const linuxName='docs/evidence/d-bootstrap-entry-linux-d846e3793f0242cd96da1912a39c49de.json';
const reviewedName='docs/evidence/a-bootstrap-entry-linux-independent-reviewed-20261027-d846.json';
function derive(){
  const phase=json(phaseName);assert.deepEqual(phase,derivePhaseObservation(parentName));
  const parent=json(parentName),linux=json(linuxName),review=json(reviewedName);
  assert.equal(linux.kind,'d_bootstrap_entry_linux_supplement.v1');assert.equal(linux.status,'passed_exact_linux_supplement');
  assert.equal(linux.parent_receipt,parentName);assert.equal(linux.parent_receipt_sha256,pin(parentName).sha256);
  assert.deepEqual(linux.files,parent.files);assert.equal(linux.precheck,true);assert.equal(linux.postcheck,true);assert.equal(linux.cleaned,true);
  assert.equal(linux.parent_postcheck_retroactively_claimed,false);assert.equal(linux.combined_acceptance,false);
  assert.equal(review.kind,'d1_bootstrap_entry_linux_supplement_independent_review.v1');
  assert.equal(review.status,'passed_exact_frozen_linux_four_only');assert.equal(review.supplement,linuxName);
  // D1 preserves the original PowerShell manifest order; the A target interface
  // uses ASCII path order. Bind both ordered digests to the same exact tuples.
  const originalOrderDigest=sha(parent.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
  assert.equal(review.source_sha256,originalOrderDigest);assert.deepEqual(review.linux_steps,linux.linux_steps);
  assert.equal(review.original_final_postcheck_retroactively_claimed,false);assert.equal(review.whole_current_tree_accepted,false);
  for(const artifact of review.artifacts)assert.equal(pin(artifact.path).sha256,artifact.sha256);
  const owner=path.join(root,'.tmp-d-bootstrap-linux-'+linux.id);assert.equal(fs.existsSync(owner),false);
  assert.deepEqual(linux.linux_steps.map(s=>s.name),['server','bootstrap','migration-runner','tagged-evidence-test-compile-only']);
  for(const step of linux.linux_steps){assert.equal(step.exit_code,0);assert.equal(step.binary_removed,true);
    assert.ok(step.binary_size>0);assert.match(step.binary_sha256,/^[a-f0-9]{64}$/);}
  assert.equal(linux.actual_mysql_executed,false);assert.equal(linux.dependencies_installed,false);assert.equal(linux.production_approved,false);
  return{kind:'a_bootstrap_entry_observed_phase_linux_composition.v1',status:'native_phase_observations_plus_exact_linux_supplement_only',
    parent_receipt:pin(parentName),original_phase_observation:pin(phaseName),linux_receipt:pin(linuxName),linux_independent_review:pin(reviewedName),
    review_validator:pin('docs/evidence/a-bootstrap-entry-observed-composition-20261027.mjs'),
    source_files:1741,source_sha256:phase.source_sha256,original_manifest_order_source_sha256:originalOrderDigest,
    digest_order_note:'source_sha256 uses ASCII path order; the original-order digest preserves D1/PowerShell ordering over the identical 1741 tuples',
    observed_windows:{targeted_roots:phase.stages.targeted.roots,targeted_pass_events:phase.stages.targeted.passed_events,
      full_packages:phase.stages.full.packages,full_roots:phase.stages.full.roots,full_pass_events:phase.stages.full.passed_events,
      seed_roots:phase.stages.seeds.roots,seed_pass_events:phase.stages.seeds.passed_events},
    accepted_linux_steps:linux.linux_steps,new_linux_own_precheck:true,new_linux_own_postcheck:true,new_linux_cleanup_verified:true,
    original_parent_status:'failed',original_final_postcheck_observed:false,original_run_accepted:false,
    strict_original_windows_source_stability_accepted:false,complete_parent_obligations_verified:false,
    native_start_authorized:false,current_tree_ready:false,current_baseline_ready:false,
    actual_SQL:false,production_approved:false,
    remaining:'Current stable-source package/seed coverage and exact dependency closure must independently repair the strict pre-thin prerequisite; this composition cannot register itself as the complete-parent proof'};
}
const [mode,...extra]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode)&&!extra.length);
const output='docs/evidence/a-bootstrap-entry-observed-composed-20261027-r1.json',value=derive();
if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),value);
console.log(JSON.stringify({mode,linux_steps:4,original_final_postcheck_observed:false,current_tree_ready:false}));
