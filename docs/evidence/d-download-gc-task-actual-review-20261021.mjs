import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(decode(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prefix='docs/evidence/d-download-gc-task-remote-20261021-154631-7f8bf868';
const source=json(prefix+'-source.json'),text=decode(raw(prefix+'.txt'));
assert.equal(source.source_sha256,'5383dd6b3967edf9966896b7b298a0d05df04ab23b10db42df18f354c33a5f5b');
assert.equal(source.files.length,1475);assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
assert.equal(sha(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
const published=json('docs/evidence/d-prune-identity-published-context-20261021.json');
assert.equal(published.source_sha256,source.source_sha256);assert.deepEqual(published.files,source.files);
assert.ok(text.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=1475`));
const match=/^=== RUN\s+TestDDownloadGCTaskMySQL\r?$/m.exec(text);assert.ok(match);
const remote=text.slice(match.index);
const expected=['backup','drill','preflight','artifact_verify','active_drill','active_preflight','active_artifact_verify','prune_reference','owner_deadline_not_expired','backup_row_lock','dependent_row_lock','empty_drill_range','empty_preflight_range','empty_artifact_verify_range','empty_prune_range','late_owner_fact','late_dependent_fact','late_prune_reference'];
const ran=[...remote.matchAll(/^=== RUN\s+TestDDownloadGCTaskMySQL\/(\S+)\r?$/gm)].map(x=>x[1]);
const passed=[...remote.matchAll(/^\s+--- PASS: TestDDownloadGCTaskMySQL\/(\S+) /gm)].map(x=>x[1]);
assert.deepEqual(ran,expected);assert.deepEqual(passed,expected);assert.equal(new Set(ran).size,18);
assert.doesNotMatch(remote,/^\s*--- (?:FAIL|SKIP): TestDDownloadGCTaskMySQL/m);
assert.match(remote,/^--- PASS: TestDDownloadGCTaskMySQL \(77\.18s\)\r?$/m);
assert.match(remote,/^PASS\r?$/m);assert.doesNotMatch(remote,/^FAIL\r?$/m);
assert.match(text,/mysql_version=8\.4\.8/);assert.match(text,/^PASS fresh-migration-replay=001\.\.081 applied=96 exact_filenames=yes/m);
const binary='e279fc30232dbc73e6000d4be8caa4d2c61530082e8c57ee4f03dc99ad7e81f2';
const inputs='d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0';
const catalog='0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe';
assert.ok(text.includes(`LOCAL_PASS d-download-gc-task-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=${binary} ddl_sha256=${inputs}`));
assert.ok(text.includes(`PASS d-download-gc-task-mysql binary_sha256=${binary} inputs_sha256=${inputs} new_cases=18 component=SQLDownloadGCTaskEligibility scope=synthetic full_gc=not_run role_approval=no human_mfa=no provider_read=no production_approval=no`));
assert.ok(text.includes(`catalog_sha256=${catalog}`));
const migrations=['backend/internal/db/migrations/070_add_system_backup_prune_authority.sql','backend/internal/db/migrations/081_fix_system_backup_prune_item_identity.sql'];
const relevant=[...migrations,'backend/internal/systembackupevidence/download_gc_task_mysql_test.go','backend/internal/systembackupevidence/testdata/download_mfa_probe_inputs.json'];
for(const p of relevant)assert.equal(sha(raw(p)),source.files.find(x=>x.path===p)?.sha256,'relevant source changed '+p);
assert.equal(sha(raw(relevant.at(-1))),inputs);
const previous=json('docs/evidence/d-prune-identity-operator-failure-20261021.json');
assert.deepEqual(previous.actual.failed,['prune_reference','empty_prune_range','late_prune_reference']);assert.equal(previous.actual.outer_exit,1);
assert.match(text.trimEnd(),/download_gc_task_exit=0$/);assert.doesNotMatch(text,/^CLEANUP_PENDING/m);
const namespace='sbk-mig-261021083028-23bd',uid='ab140148-6c3b-4fc5-8d20-7b918aa97b5d';
assert.ok(text.includes(`CLEANED namespace=${namespace} uid=${uid}`));
for(const marker of ['CLEANED remote-registration-scratch=yes','CLEANED local-registration-build-cache=True','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True'])assert.ok(text.includes(marker));
const owner=path.join(root,'.tmp-d-index-cache-0b153d82adc04cddb5567bce61286f09');
assert.ok(text.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
const report={kind:'d_download_gc_task_actual_acceptance',status:'actual_mysql_18_of_18_accepted_component_only',
 log:prefix+'.txt',log_sha256:sha(raw(prefix+'.txt')),source_manifest:prefix+'-source.json',source_manifest_sha256:sha(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:1475,
 actual:{root:'TestDDownloadGCTaskMySQL',mysql:'8.4.8',migration_replay:'001..081',migrations:96,catalog_sha256:catalog,binary_sha256:binary,inputs_sha256:inputs,cases:18,passed:18,failed:0,skipped:0,elapsed_seconds:77.18,outer_exit:0,case_names:expected,previous_prune_failures_now_passed:previous.actual.failed},
 cleanup:{namespace,uid,namespace_cleanup_reported:true,remote_scratch_cleanup_reported:true,local_cache_cleanup_reported:true,exact_local_owner:owner,local_owner_independently_absent:true},
 previous_failure:{path:'docs/evidence/d-prune-identity-operator-failure-20261021.json',sha256:sha(raw('docs/evidence/d-prune-identity-operator-failure-20261021.json')),retained:true},
 boundaries:{real_sql:true,fixture_scope:'synthetic run-owned database',full_gc:false,role_approval:false,human_mfa:false,provider_read:false,production_approval:false,existing_installation_upgrade_not_proven:true,dependencies_installed:false,reviewer_remote_run:false,socket_close_messages_did_not_override_complete_pass_and_exit_zero:true}};
const out='docs/evidence/d-download-gc-task-actual-accepted-20261021.json';
if(process.argv.includes('--check')){assert.deepEqual(json(out),report);console.log('PASS actual MySQL GC eligibility 18/18; 081/96 replay; three prior prune failures now pass; cleanup; component boundaries');}
else{fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(out);}
