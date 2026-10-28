import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const resolve = p => path.resolve(root, p);
const read = p => fs.readFileSync(resolve(p), 'utf8').replace(/^\uFEFF/, '');
const json = p => JSON.parse(read(p));
const pin = p => ({ path: path.relative(root, resolve(p)).replaceAll('\\','/'), sha256: hash(fs.readFileSync(resolve(p))) });
const [mode, validationPath, freezePath, outputArg] = process.argv.slice(2);
assert.ok(['--write','--check'].includes(mode) && validationPath && freezePath && outputArg, 'use --write/--check <explicit local validation.json> <explicit freeze.json> <new baseline output.json>');
const output=resolve(outputArg);
assert.equal(path.dirname(output),resolve('docs/evidence'));
assert.match(path.basename(output),/^d-local-closeout-baseline-[A-Za-z0-9._-]+\.json$/,'The pre-finalizer baseline must not publish the final goal acceptance');
const validation = json(validationPath), freeze = json(freezePath);
assert.equal(validation.kind, 'd_local_closeout_validation.v1');
assert.equal(validation.error, null);
for (const key of ['dependencies_installed','remote_contacted','actual_mysql','production_approved']) assert.equal(validation[key], false);
assert.equal(validation.frozen_postcheck, true);
assert.equal(validation.owner_removed, true);
assert.equal(fs.existsSync(validation.owner), false);
assert.equal(validation.runner_profile, 'http_native_producer_diagnostic_then_six_serial_packages');
assert.equal(validation.steps.length, 15);
const manifest = json(validation.source);
assert.equal(manifest.stable_copy_verified, true);
const sourceDrift = [];
for (const p of manifest.files) {
  if (!fs.existsSync(resolve(p.path)) || pin(p.path).sha256 !== p.sha256) sourceDrift.push({path:p.path,frozen_sha256:p.sha256,current_sha256:fs.existsSync(resolve(p.path))?pin(p.path).sha256:null});
}
// These separate validators are not invoked by the local runner or referenced
// by the six tested Go packages. Keep their concurrent edits visible; no Go,
// contract, fixture, executed script or unknown drift is accepted here.
const unrelatedValidators = new Set(['scripts/system-backup-a-nonce-bootstrap-validation.ps1','scripts/system-backup-d-independent-work-review.mjs']);
for(const drift of sourceDrift) assert.ok(unrelatedValidators.has(drift.path) && drift.current_sha256,'Current compiled/executed/unknown source drift');
assert.equal(pin(validation.runner).path,'docs/evidence/d-local-closeout-validation-r2-20261023.ps1');
assert.equal(validation.runner_sha256, pin(validation.runner).sha256);
assert.equal(validation.snapshotter_sha256, pin('docs/evidence/d-local-closeout-snapshot-20261023.mjs').sha256);
function events(step) {
  assert.equal(step.exit_code, 0);
  assert.equal(pin(step.log).sha256, step.sha256);
  const result = read(step.log).split(/\r?\n/).filter(l => l.trim().startsWith('{')).map(l => JSON.parse(l));
  assert.ok(result.length > 0);
  assert.equal(result.filter(e => ['fail','skip'].includes(e.Action)).length, 0);
  return result;
}
const diagnostic=events(validation.steps[0]);
const diagnosticRoots=['TestAdmittedHTTPFixtureStillRejectsStaleSQLClock','TestAdmittedDownloadHTTPCompleteRangeAuditAndNoReplay','TestAdmittedDownloadHTTPInterruptionRevocationAndResultFailure','TestAdmittedDownloadHTTPPublicInternalAndClassificationRace','TestADownloadNativeBufferedOutputKeepsOriginalDeadline','TestGCProducerResultCapacitySamplingDoesNotRenewAdmission','TestDownloadRetentionGCProducerCollectorOriginalResultAndRollback'];
assert.deepEqual(diagnostic.filter(e=>e.Action==='pass' && e.Test && !e.Test.includes('/')).map(e=>e.Test).sort(),diagnosticRoots.sort());
const packages = ['systembackupevidence','systembackupproducer','systembackupresources','systembackupread','systembackupsecurity'].map(p => `clawreef/internal/${p}`).concat('clawreef/cmd/server');
const full=validation.steps.slice(1,7).flatMap((step,index)=>{
  const e=events(step), expected=packages[index];
  assert.equal(step.command.at(-1),expected.replace('clawreef/','./'));
  assert.ok(!step.command.includes('-run') && !step.command.includes('-tags'));
  assert.ok(step.command.includes('-count=1'));
  assert.deepEqual(e.filter(x=>x.Action==='pass' && !x.Test).map(x=>x.Package),[expected]);
  return e;
});
assert.deepEqual(full.filter(e => e.Action === 'pass' && !e.Test).map(e => e.Package).sort(), packages.sort());
const passed = new Set(full.filter(e => e.Action === 'pass' && e.Test).map(e => e.Test));
const newCases = ['TestDownloadRetentionGCProtectedWorkWithFreezeOwner', ...['commit','caller_late_failure','final_lock_loss','last_delete_failure'].map(c => `TestDownloadRetentionGCProtectedWorkWithFreezeOwner/${c}`), 'TestDownloadRetentionGCProtectedWorkRejectsUnboundContext'];
for (const name of newCases) assert.ok(passed.has(name), `Missing protected work test ${name}`);
assert.ok(passed.has('TestAFreezeTypedNilConnectorBoundary'));
for(const name of diagnosticRoots)assert.ok(passed.has(name),'Diagnostic root missing from complete package');
const seeds = [
  ['TestAResourcesWriteFKMySQLSeed','TestDResourcesReadbackMySQLSeed','TestDResourcesWriteMySQLSeed'],
  ['TestDDrillDetailHTTPSeed'], ['TestAAdminReadMySQLSeed']
];
for (let i=0;i<3;i++) {
  const e = events(validation.steps[i+7]);
  assert.deepEqual(e.filter(x => x.Action === 'pass' && x.Test && !x.Test.includes('/')).map(x => x.Test).sort(), seeds[i].sort());
  assert.equal(e.filter(x => x.Action === 'pass' && !x.Test).length, 1);
}
for (const s of validation.steps.slice(10)) { assert.equal(s.exit_code, 0); assert.equal(s.platform, 'linux'); assert.equal(pin(s.log).sha256, s.sha256); }
assert.deepEqual(validation.binaries.map(b=>b.name).sort(), ['admin-read.test','drill-http.test','resources.test','server','system-backup-migrate'].sort());
for (const b of validation.binaries) assert.match(b.sha256, /^[a-f0-9]{64}$/);
assert.equal(freeze.error, null);
for (const key of ['actual_mysql','collector_wired','role_approved','dependencies_installed']) assert.equal(freeze[key], false);
for (const key of ['exit_code','linux_build_exit']) assert.equal(freeze[key], 0);
assert.equal(freeze.inputs_stable, true);
assert.equal(freeze.owner_removed, true);
assert.equal(fs.existsSync(freeze.owner), false);
const freezePins = json(freeze.source);
assert.ok(freezePins.some(p => p.path.endsWith('download_retention_gc_freeze_a_test.go')));
for (const p of freezePins) assert.equal(pin(p.path).sha256, p.sha256);
const freezeEvents = read(freeze.log).split(/\r?\n/).filter(l=>l.trim().startsWith('{')).map(l=>JSON.parse(l));
assert.equal(freezeEvents.filter(e=>['fail','skip'].includes(e.Action)).length,0);
assert.ok(freezeEvents.some(e=>e.Action==='pass' && e.Test==='TestAFreezeTypedNilConnectorBoundary'));
assert.equal(freezeEvents.filter(e=>e.Action==='pass' && !e.Test).length,1);
const receiversPath = 'docs/evidence/d-readiness-receivers-8ebd755ee44f4c4caa08f2ec05b0047a.json';
const receiverProof = json(receiversPath),receivers=receiverProof.steps;
assert.equal(receiverProof.kind,'d_readiness_receiver_validation.v1');
assert.equal(receiverProof.inputs_stable,true);assert.equal(receiverProof.error,null);
assert.equal(receiverProof.dependencies_installed,false);assert.equal(receiverProof.actual_mysql,false);
for(const p of receiverProof.inputs)assert.equal(pin(p.path).sha256,p.sha256,'Receiver source drift');
assert.deepEqual(receivers.map(r=>r.tests),[64,52,27,14]);
for (const r of receivers) {
  assert.equal(r.exit_code,0);
  assert.equal(pin(r.log.path).sha256,r.log.sha256);
  const log=read(r.log.path);
  for(const key of ['fail','cancelled','skipped','todo']) assert.match(log,new RegExp(`(?:ℹ |# )${key} 0(?:\\r?\\n|$)`));
  assert.match(log,new RegExp(`(?:ℹ |# )pass ${r.tests}(?:\\r?\\n|$)`));
}
const rgListPath = 'docs/evidence/d-local-closeout-rg-inputs-20261023.txt';
const extraDocs = new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const selected = read(rgListPath).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).filter(p => (!p.startsWith('docs/') || /^docs\/[^/]+\.sql$/.test(p) || extraDocs.has(p)) && !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/.test(p) && /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(p));
assert.deepEqual(manifest.files.map(p=>p.path).sort(),selected.sort(), 'Synchronous snapshot must preserve original rg-based source set');
const failurePaths = ['docs/evidence/a-owner-eof-20261023-151136.json','docs/evidence/a-owner-eof-20261023-151709.json','docs/evidence/d-local-closeout-drill-20261023.json.result.json','docs/evidence/d-local-closeout-drill-20261023-r2.json.result.json','docs/evidence/d-resources-mysql-20261023-151235-75de10fc.json','docs/evidence/d-local-closeout-interrupted-20261023.json','docs/evidence/d-local-closeout-becb8b4d45194f83bcd50d6423f8e8b4.json','docs/evidence/d-local-closeout-c182ef28424d4b999793f44fd8f8f153.json'];
const failedOwners = failurePaths.map(p => {
  const r = json(p), owner = r.owner ?? r.cleanup?.owner;
  assert.ok(owner);
  assert.equal(fs.existsSync(owner),false,'Failed/stopped run left artifacts');
  assert.ok(r.cleanup === true || r.cleanup?.removed === true || r.owner_removed === true || r.owner_removed_independently === true);
  return owner;
});
const gatesPath = 'docs/evidence/d-local-closeout-gates-20261023.json';
const gates = json(gatesPath);
assert.deepEqual(gates.map(g=>g.gate), ['inventory','contract']);
for(const g of gates) assert.equal(g.exit_code,1,'Strict gate is an unresolved dependency, not local acceptance');
const cacheSeedPath='docs/evidence/d-local-closeout-cache-seed-20261023.json';
const cacheSeed=json(cacheSeedPath);
assert.equal(cacheSeed.peer_source_read_only,true);
for(const key of ['existing_entries_overwritten','test_result_reuse','tests_restarted','dependencies_installed'])assert.equal(cacheSeed[key],false);
assert.equal(fs.existsSync(cacheSeed.target),false,'Seeded compilation artifacts must be cleaned with this owner');
const cacheHandoffPath='docs/evidence/d-local-closeout-cache-handoff-20261023.json';
const cacheHandoff=json(cacheHandoffPath);
assert.equal(cacheHandoff.peer_source_read_only,true);assert.equal(cacheHandoff.test_result_reuse,false);
assert.equal(fs.existsSync(cacheHandoff.owner),false);
const logInitPath='docs/evidence/d-local-closeout-log-initialization-20261023.json';
const logInit=json(logInitPath);
for(const key of ['runner_edited','frozen_source_edited','tests_restarted','existing_logs_overwritten','dependencies_installed','remote_contacted'])assert.equal(logInit[key],false);
assert.deepEqual(logInit.files.map(f=>f.stage),[10,11,12,13,14]);
for(const f of logInit.files){assert.equal(resolve(f.path),resolve(validation.steps[f.stage].log));assert.equal(f.initial_bytes,0);assert.equal(f.initial_sha256,hash(''));assert.equal(f.existing_preserved,true);}
const logFixPath='docs/evidence/d-local-closeout-runner-log-fix-20261023.json';
const logFix=json(logFixPath);
assert.equal(logFix.current_running_script_modified,false);
assert.equal(logFix.actual_sha256,validation.runner_sha256);
assert.equal(pin(logFix.future_entry).sha256,logFix.future_sha256);
const logRegressionPath='docs/evidence/d-local-closeout-log-sink-test-aa0ccba72f11452d9b6b3407890125c9.json';
const logRegression=json(logRegressionPath);
assert.equal(logRegression.error,null);assert.equal(logRegression.owner_removed,true);assert.equal(fs.existsSync(logRegression.owner),false);
assert.equal(logRegression.Go_executed,false);assert.equal(logRegression.synthetic_status_seam,true);
assert.deepEqual(logRegression.cases.map(c=>c.synthetic_exit),[0,9]);assert.deepEqual(logRegression.cases.map(c=>c.threw),[false,true]);
assert.equal(logRegression.runner_sha256,logFix.future_sha256);
const readbackPath='docs/evidence/d-readback-coordination-20261023.json';
const readback=json(readbackPath);
assert.equal(readback.actual_readback.status,'accepted_isolated_synthetic_only');
assert.equal(readback.actual_readback.cases,12);assert.equal(readback.actual_readback.remote_rerun_required,false);
assert.equal(pin(readback.actual_readback.receipt.path).sha256,readback.actual_readback.receipt.sha256);
const writerPath='docs/evidence/d-resources-writer-actual-accepted-20261023.json';
const writer=json(writerPath);
assert.equal(writer.kind,'d_resources_writer_actual_evidence_review.v1');
assert.equal(writer.remote_cases,9);assert.equal(writer.cleanup_recorded,true);assert.equal(writer.production_approved,false);
const aWorkPath='docs/evidence/a-gc-work-extraction-reviewed-20261023.json';
const aWork=json(aWorkPath);
assert.equal(aWork.decision,'exact_extraction_confirmed_production_freeze_composition_pending');
assert.equal(pin(aWork.current.path).sha256,aWork.current.sha256);
assert.equal(aWork.protected_body_byte_identical_after_reversing_extraction,true);
assert.equal(aWork.original_connection_owner_retains_sole_commit,true);
assert.equal(aWork.joint_privileges_and_freeze_approved,false);assert.equal(aWork.production_approved,false);
const inputs = [validationPath,validation.source,validation.runner,freezePath,freeze.source,freeze.log,receiversPath,rgListPath,gatesPath,cacheSeedPath,cacheHandoffPath,readbackPath,readback.actual_readback.receipt.path,writerPath,'docs/evidence/d-resources-writer-independent-recheck-20261023.json','docs/evidence/d-local-closeout-cache-seed-20261023.mjs','docs/evidence/d-local-closeout-cache-handoff-20261023.mjs',...gates.map(g=>g.log),...failurePaths,'docs/evidence/d-local-closeout-validation-20261023.ps1','docs/evidence/d-local-closeout-snapshot-20261023.mjs','docs/evidence/d-local-closeout-review-20261023.mjs','docs/system-backup-d-gc-work-handoff-20261023.md','docs/system-backup-d-local-closeout-20261023.md','docs/evidence/d-a-nonce-ca-reviewed-20261023-r2.json', ...validation.steps.map(s=>s.log),...receiverProof.inputs.map(p=>p.path),...receivers.map(r=>r.log.path)];
inputs.push(aWorkPath,...aWork.inputs.map(p=>p.path));
inputs.push(logInitPath,logFixPath,logFix.future_entry,logRegressionPath,'docs/evidence/d-local-closeout-log-sink-test-20261023.ps1','docs/evidence/d-gc-finalizer-local-plan-20261023.json');
const result = {
  kind:'d_local_closeout_review.v1',status:'exact_15_stage_baseline_verified_finalizer_local_preparation_pending',goal_complete:false,
  validation:pin(validationPath).path, freeze_validation:pin(freezePath).path,
  source_sha256:manifest.source_sha256, source_files:manifest.files.length,
  snapshot_selection_matches_original_rg:true,current_snapshot_bytes_match:sourceDrift.length===0,current_tested_backend_contract_bytes_match:true,unrelated_validator_drift:sourceDrift,
  packages:packages.map(p=>({name:p,roots:full.filter(e=>e.Package===p && e.Action==='pass' && e.Test && !e.Test.includes('/')).length,pass_events:full.filter(e=>e.Package===p && e.Action==='pass' && e.Test).length})),
  new_protected_work_passes:newCases, exact_seed_roots:seeds.flat(),linux_binaries:validation.binaries,
  diagnostic_roots:diagnosticRoots,receiver_suites:receivers.length,receiver_passes:157,cleaned_owners:[...new Set([validation.owner,freeze.owner,...failedOwners])],strict_gates:gates,historical_cache_copies:{seed:cacheSeed.entries.length,handoff:cacheHandoff.entries.length,test_result_reuse:false,cleaned:true},
  previously_accepted_readback:{cases:12,remote_rerun_required:false,receipt:readback.actual_readback.receipt},
  previously_accepted_writer:{cases:9,remote_rerun_required:false,receipt:pin(writerPath)},
  A_static_work_extraction:{receipt:pin(aWorkPath),decision:aWork.decision,runtime_approval:false,production_approval:false},
  executed_runner_log_supplement:pin(logInitPath),future_runner_log_fix:{entry:logFix.future_entry,logging_only_regression:pin(logRegressionPath),full_Go_run_claimed:false},
  actual_mysql:false,remote_contacted:false,dependencies_installed:false,production_freeze_wired:false,joint_AD_approval:false,production_approved:false,
  required_local_followup:['private tx-bound one-use captured-facts finalizer algorithm/integration/synthetic verification after this freeze, per d-gc-finalizer-local-plan-20261023.json'],
  pending:['actual real FK/drill HTTP SQL acceptance (readback12 and writer9 already accepted)','A/D joint protocol/grants and production adapter review including post-ticket finalizer','B/C actual proof/domain/schema/provider/catalog inputs','physical capacity, real freeze/cancellation/takeover and complete GC/restore acceptance'],
  inputs:[...new Set(inputs.map(p=>pin(p).path))].sort().map(pin)
};
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),result);
console.log(`D_LOCAL_CLOSEOUT_OK files=${manifest.files.length} packages=6 stages=15 receivers=4 receiver_passes=157 remote=no production=no`);
