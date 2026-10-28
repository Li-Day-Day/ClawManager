import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {lifecyclePlan} from './d-gc-full-lifecycle-source-20261026.mjs';

// Source preparation only. Never invokes the operator, a subprocess, Go,
// tests, SSH, SQL, an existing capture, or an active run's source directory.
const evidence=import.meta.dirname,repo=path.resolve(evidence,'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bytes=p=>fs.readFileSync(path.join(repo,p));
const pin=p=>{const b=bytes(p);return {path:p,size:b.length,sha256:sha(b)};};
const json=p=>JSON.parse(bytes(p).toString('utf8').replace(/^\uFEFF/,''));
const [mode='--check-version',version='r5',...extra]=process.argv.slice(2);
assert.ok(['--write-version','--check-version'].includes(mode));
assert.match(version,/^r[1-9][0-9]*$/);
assert.equal(extra.length,2,'supply an explicit A component review; no latest fallback');
assert.equal(extra[0],'--component-review');
const componentAbsolute=path.resolve(repo,extra[1]);
assert.equal(path.dirname(componentAbsolute),evidence);
const componentPath=path.relative(repo,componentAbsolute).replaceAll('\\','/');
const names={candidate:`docs/evidence/d-gc-full-lifecycle-source-candidate-20261027-${version}.json`,rendered:`docs/evidence/d-gc-full-lifecycle-rendered-harness-20261027-${version}.ps1`,request:`docs/evidence/d-gc-full-lifecycle-review-request-20261027-${version}.json`};
const {bytes:planned,result:base}=lifecyclePlan(repo);
const original=new Map(base.original_files.map(p=>[p.path,p]));
const files=new Map(base.files.map(p=>[p.path,p]));
const component=json(componentPath);
assert.equal(component.status,'reviewed_exact_two_tagged_test_components_only_global_source_NOT_ready');
for(const c of component.changes)assert.deepEqual(original.get(c.path),c.after,'tagged component drift');
const parserObservationPath='docs/evidence/d1-parser-promotion-observed-20261027-b53.json';
const parserObservation=json(parserObservationPath);
assert.equal(parserObservation.status,'exact_two_file_promotion_and_recorded_source_pins_verified');
for(const p of parserObservation.live_changed_pair)assert.deepEqual(original.get(p.path),p,'live parser promotion drift');
assert.equal(original.get('backend/internal/systembackupbootstrapsecurity/reference.go').sha256,'bf76dcb6301fa2ffc331d45231e458e2806f1f7b01026cac02422c51510ea183');
assert.equal(original.get('backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go').sha256,'c05714705f0e489f13004095ca9648f90edd5e2786fed1b182400083913f3e55');
const compositionPath='docs/evidence/d1-a2-reference-capability-composed-reviewed-20261027-b53.json';
const composition=json(compositionPath);
assert.equal(composition.status,'accepted_exact_local_parser_candidate_composition_only');
assert.equal(sha(bytes(compositionPath)),parserObservation.independent_native_review_sha256);
assert.equal(sha(bytes(parserObservation.promotion)),parserObservation.promotion_sha256);
assert.equal(composition.all_native_phases_exit_zero,true);
assert.equal(composition.source_and_inputs_postcheck,true);
assert.equal(composition.owners_independently_absent,true);
assert.equal(composition.run_build_products_removed,true);
const expectedCases=json('docs/evidence/d-gc-full-lifecycle-requirements-20261026.json').cases;
const go=bytes('backend/internal/systembackupevidence/download_gc_full_lifecycle_mysql_test.go').toString('utf8');
const catalog=go.match(/var dGCFullLifecycleCases = \[\]string\{([\s\S]*?)\r?\n\}/)?.[1];
assert.ok(catalog);assert.equal(expectedCases.length,15);
assert.deepEqual([...catalog.matchAll(/"([a-z0-9_]+)"/g)].map(m=>m[1]),expectedCases,'static case catalog drift');
const runner='scripts/system-backup-a-evidence-validation.ps1';
const phase='scripts/system-backup-d-download-gc-full-lifecycle-phase.sh';
const rendered=planned.get(runner);assert.ok(rendered);
const renderedPin={path:names.rendered,size:rendered.length,sha256:sha(rendered)};
assert.equal(renderedPin.sha256,files.get(runner).sha256);
const capsule=original.get('backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json');assert.ok(capsule);
const candidate={...base,status:'source_only_native_and_global_review_pending',source_version:`20261027-${version}`,prepared_on_client_date:'2026-10-27',current_exact_component_review:pin(componentPath),current_parser_promotion_observation:pin(parserObservationPath),rendered_runner_review_artifact:renderedPin,operator_capture_or_Go_started:false,native_or_global_review_approved:false,formal_A_operator_source_review_created_by_this_preparation:false};
const candidateBytes=Buffer.from(JSON.stringify(candidate,null,2)+'\n');
const candidatePin={path:names.candidate,size:candidateBytes.length,sha256:sha(candidateBytes)};
const oldCandidate='docs/evidence/d-gc-full-lifecycle-source-candidate-20261026-r3.json';
const old=json(oldCandidate);
const oldMap=new Map(old.original_files.map(p=>[p.path,p]));
const delta=[...new Set([...oldMap.keys(),...original.keys()])].sort().filter(p=>oldMap.get(p)?.sha256!==original.get(p)?.sha256||oldMap.get(p)?.size!==original.get(p)?.size).map(p=>({path:p,before:oldMap.get(p)??null,after:original.get(p)??null}));
const harnessPaths=[
  'docs/evidence/d-gc-full-lifecycle-operator-20261026.ps1',
  'docs/evidence/d-gc-full-lifecycle-source-20261026.mjs',
  'docs/evidence/d-gc-full-lifecycle-phase-20261026.sh',
  'docs/evidence/d-gc-full-lifecycle-receiver-20261026.mjs',
  'docs/evidence/d-gc-full-lifecycle-requirements-20261026.json',
  'scripts/system-backup-d-gc-full-collect-receiver.mjs',
  'scripts/system-backup-a-evidence-validation.ps1',
  'scripts/system-backup-a-evidence-go-step.ps1',
  'scripts/system-backup-a-download-mfa-inputs.mjs',
  'docs/evidence/d-gc-full-lifecycle-source-preparation-20261027-r2.mjs',
  'docs/evidence/d-gc-full-collect-capsule-fix-20261027.mjs',
  'docs/evidence/d-gc-full-collect-capsule-fix-source-ready-20261027-r1.json'
];
const request={kind:'d_gc_full_lifecycle_operator_source_review_request.v2',status:'source_only_native_and_global_review_pending',source_version:`20261027-${version}`,prepared_on_client_date:'2026-10-27',candidate:candidatePin,source_sha256:base.source_sha256,source_file_count:base.files.length,original_source_sha256:base.original_source_sha256,original_source_file_count:base.original_files.length,inventory_scope:['backend','contracts','scripts','selected immutable docs inputs'],inventory_frame:'sha256 of ordinal sorted path NUL sha256 NUL bytecount LF entries',cases:expectedCases,case_count:15,capsule,component_pins:component.changes.map(c=>c.after),parser_pins:parserObservation.live_changed_pair,origin_harness_pins:base.origin_harness_pins,additional_harness_and_preparation_pins:harnessPaths.map(pin),rendered_runner:renderedPin,overlays:base.overlays,overlay_byte_pins:[{path:runner,before:original.get(runner),after:files.get(runner)},{path:phase,before:null,after:files.get(phase)}],old_r3_preserved:[oldCandidate,'docs/evidence/d-gc-full-lifecycle-review-request-20261026-r3.json'].map(pin),all_original_inventory_deltas_since_old_r3:delta,
  capsule_standalone_fix:{source_ready:pin('docs/evidence/d-gc-full-collect-capsule-fix-source-ready-20261027-r1.json'),failed_run:pin('docs/evidence/d-gc-full-lifecycle-remote-5c1c51457b1f42aa94223469a5f2ae92.txt'),failure:'In-checkout GC3 passed, but detached FullCollect seed tried to read checkout docs; phase/receiver correctly rejected and remote did not start',both_seed_and_remote_fixture_use_capsule:true,native_empty_cwd_GC3_regression_pending:true,ordinary_model_loader_modified:false,receiver_weakened:false,missing_docs_fabricated:false},
  prior_native_context:{scope:'Accepted parser composition and exact tagged component are context only; checkout GC3 and detached Owner3 did not prove detached GC3. New current-binary source and genuine empty-cwd GC3 evidence is required before retry.',pins:[componentPath,compositionPath,parserObservationPath,parserObservation.promotion].map(pin),composition_status:composition.status,current_whole_baseline_accepted:false,formal_A_operator_source_review_exists:false},
  preparation_actions:{current_source_inventory_twice:true,rendered_selector_to_independent_review_artifact:true,capture_into_execution_owner:false,Go_started:false,tests_rerun:false,SSH:false,kubectl:false,SQL:false,backend_contracts_central_scripts_changed:false,active_frozen_sources_changed:false,dependencies_installed:false,build_products_created:false},
  required_before_formal_operator_execution:['Current ordinary eight-stage closure terminal/postcheck/cleanup and exact source match','Root fifteen-stage owner and seed obligations terminal/postcheck/cleanup, including exact GC seed events','A review of this exact complete source inventory, seven runner selector substitutions, phase and transitive harness pins','Recompute a new version if any inventoried source or harness input changes; never promote this draft or reuse a stale accepted source review'],
  required_future_A_review_contract:{kind:'d_gc_full_lifecycle_source_review.v1',reviewer:'A',status:'accepted_exact_lifecycle_candidate_inputs',exact_fields:['source_sha256','files','original_source_sha256','original_files','origin_harness_pins'],capsule_sha256:capsule.sha256,production_approved:false,note:'This is the expected schema for a future actual A-created review; this request is not that review'},
  operator:{path:'docs/evidence/d-gc-full-lifecycle-operator-20261026.ps1',reviewed_source_argument:'Future actual A-created exact review JSON, not this draft request',source_manifest_argument:'New exclusive manifest directly in docs/evidence',remote_default:false,execution_authorized_by_this_draft:false},
  native_and_global_review_pending:true,ordinary_scope_review_complete:false,actual_new_lifecycle_SQL_cases:0,actual_SQL_executed_by_this_preparation:false,production_approved:false,complete_real_domain_authority:false,whole_goal_complete:false};
const outputs=[[names.rendered,rendered],[names.candidate,candidateBytes],[names.request,Buffer.from(JSON.stringify(request,null,2)+'\n')]];
if(mode==='--write-version'){
  for(const [p] of outputs)assert.equal(fs.existsSync(path.join(repo,p)),false,'choose a new version; never overwrite '+p);
  for(const [p,b] of outputs)fs.writeFileSync(path.join(repo,p),b,{flag:'wx'});
}else for(const [p,b] of outputs)assert.ok(bytes(p).equals(b),'source/harness/request drift; prepare a new version: '+p);
process.stdout.write(JSON.stringify({status:request.status,source_version:request.source_version,source_sha256:base.source_sha256,source_files:base.files.length,original_source_sha256:base.original_source_sha256,original_files:base.original_files.length,old_r3_inventory_deltas:delta.length,artifacts:outputs.map(([p])=>pin(p)),Go:false,tests_rerun:false,SSH:false,formal_A_source_review:false})+'\n');
