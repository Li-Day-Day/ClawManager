import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {compose} from './a2-reference-capability-supplement-review-20261027-r2.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.resolve(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,sha256:sha(read(p))});
assert.ok(process.argv.slice(2).every(x=>x==='--check')&&process.argv.slice(2).length<=1);
const rel='docs/evidence/a2-reference-capability-supplement-b53eccbdc25449d1947e7bf90b179b92';
// Keep the original Windows literal prefix used by the immutable composition.
const prefix=path.join(root,rel),composedFile=rel+'.composed.json',r=json(rel+'.json');
const c=compose(prefix);assert.deepEqual(json(composedFile),c);
assert.equal(sha(read(composedFile)),'ea4e1176716a1c0735a8cc77315fd50cf9b6b392c17ef010f7941785011855ed');
assert.equal(c.status,'passed_exact_candidate_windows_and_supplement');assert.equal(c.source_files.length,1765);
const ready='docs/evidence/a2-reference-capability-supplement-source-ready-20261027-r2.json';
assert.equal(sha(read(ready)),'d80ed1417f341835e60af1372873d173885df8ddb594dfa753e40cd6b6dd45bc');
const old=json('docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7.json');
assert.equal(old.status,'failed');assert.equal(old.error,'Go phase failed: tagged_seed');
assert.equal(c.windows_full_pass_events,347);assert.equal(c.windows_full_roots,42);assert.equal(c.tagged_original_materials_seed_pass_events,1);assert.equal(c.linux_test_programs,6);
assert.equal(c.supplement_source_deltas.length,2);
assert.deepEqual(c.supplement_source_deltas.map(p=>p.path).sort(),['backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go','scripts/system-backup-d-bootstrap-entry-linux-supplement.ps1']);
const decoder='backend/internal/systembackupbootstrapsecurity/reference.go',test='backend/internal/systembackupbootstrapsecurity/reference_contract_parity_test.go';
const pins=new Map(r.files.map(p=>[p.path,p]));
assert.equal(pins.get(decoder).sha256,'bf76dcb6301fa2ffc331d45231e458e2806f1f7b01026cac02422c51510ea183');assert.equal(pins.get(test).sha256,'6c7e3e9a7d7d0f507b1799c2941d9ce83ab55cc95e11b214798fd3a260a24340');
const seed=read(rel+'.tagged_seed.jsonl').toString('utf8');assert.match(seed,/ORIGINAL_PREPARE branch=physical tls_total=2 material_apis=real/);assert.match(seed,/actual_mysql=not_run production=no/);
assert.equal(r.phases.length,11);assert.ok(r.phases.every(p=>p.exit===0));assert.equal(r.cleanup,true);assert.equal(r.snapshot_unchanged,true);assert.equal(r.reviewed_inputs_unchanged,true);assert.equal(fs.existsSync(r.owner),false);
for(const b of [...r.linux_binaries,r.linux_tagged_evidence]){assert.equal(b.elf_magic,'7f454c46');assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.ok(b.size>100000);}
// Accept only the coherent pre-application or exact reviewed two-file pair.
// This is a pair check, not an approval of other live source files.
const liveHash=sha(read(decoder));
if(liveHash==='99de31e723c22e1b3f8cbf33f0689054ae7ec589bab0c4c3e3666c26ca083022')assert.equal(fs.existsSync(path.join(root,test)),false);
else {assert.equal(liveHash,pins.get(decoder).sha256);assert.equal(sha(read(test)),pins.get(test).sha256);}
const artifacts=[composedFile,rel+'.json',rel+'.scope.json',rel+'.tagged_seed.jsonl',ready,'docs/evidence/d1-a2-reference-capability-windows-reviewed-20261027-9c2f.json','docs/evidence/d1-a2-parity-b53-replay-20261027.txt','docs/evidence/d1-a2-reference-capability-composed-review-20261027.mjs'];
const result={kind:'d1_a2_reference_capability_composed_independent_review.v1',status:'accepted_exact_local_parser_candidate_composition_only',failed_parent_preserved:c.failed_parent_preserved,old_negative_native_exit:1,old_forbidden_capabilities_failed:4,old_permitted_controls_passed:4,fixed_regression_pass_events:9,windows_runtime_packages:c.windows_full_packages,windows_runtime_roots:42,windows_runtime_pass_events:347,ordinary_tests_repeated:false,candidate_source_files:1765,supplement_source_deltas:c.supplement_source_deltas,local_original_materials_seed_pass_events:1,seed_real_loopback_tls_handshakes:2,linux_compile_programs:6,linux_programs_executed:false,all_native_phases_exit_zero:true,source_and_inputs_postcheck:true,owners_independently_absent:true,run_build_products_removed:true,reviewed_application_pair:[pins.get(decoder),pins.get(test)],ready_for_exact_two_file_application:true,live_pair_check:'original_pair_or_exact_reviewed_pair_only',live_patch_applied_by_D1:false,current_whole_source_accepted:false,actual_SQL:false,production_approved:false,dependencies_installed:false,whole_goal_complete:false,replay_path_requirement:'original_absolute_Windows_literal_prefix',first_forward_slash_alias_check_rejected:true,exact_literal_prefix_check_exit:0,artifacts:artifacts.map(pin)};
const out=path.join(root,'docs/evidence/d1-a2-reference-capability-composed-reviewed-20261027-b53.json');
if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),result);else fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('PARITY_COMPOSED_INDEPENDENT_REVIEWED old_negative=4 fixed=9 windows_full=347 seed=1 linux=6 cleaned=yes exact_pair_ready=yes whole_tree=no');
