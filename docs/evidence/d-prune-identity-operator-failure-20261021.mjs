import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>(b[0]===0xff&&b[1]===0xfe?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'');
const read=p=>JSON.parse(decode(raw(p)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prefix='docs/evidence/d-download-gc-task-remote-20261021-134319-dfd8756c';
const text=decode(raw(prefix+'.txt')),source=read(prefix+'-source.json');
assert.equal(source.source_sha256,'c768f300d4b41f0bf7502841223e07f1423877a8c044273f69a0053eb7a86d63');
assert.equal(source.files.length,1471);assert.equal(source.stable_copy_verified,true);
assert.equal(sha(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
assert.ok(text.includes(`LOCAL_SOURCE config-writer-frozen=yes source_sha256=${source.source_sha256} files=1471`));
// PowerShell transcripts may retain CRLF; anchor the actual root independently.
const match=/^=== RUN\s+TestDDownloadGCTaskMySQL\r?$/m.exec(text);assert.ok(match);
const remote=text.slice(match.index);
const failed=[...remote.matchAll(/^\s+--- FAIL: TestDDownloadGCTaskMySQL\/(\S+) /gm)].map(m=>m[1]);
assert.deepEqual(failed,['prune_reference','empty_prune_range','late_prune_reference']);
const passed=[...remote.matchAll(/^\s+--- PASS: TestDDownloadGCTaskMySQL\/(\S+) /gm)].map(m=>m[1]);
const ran=[...remote.matchAll(/^=== RUN\s+TestDDownloadGCTaskMySQL\/(\S+)\r?$/gm)].map(m=>m[1]);
assert.equal(ran.length,18);assert.equal(passed.length,15);assert.equal(new Set(ran).size,18);
assert.deepEqual([...passed,...failed].sort(),ran.slice().sort());
assert.match(remote,/--- FAIL: TestDDownloadGCTaskMySQL \(78\.28s\)/);
assert.match(remote,/MySQL error number=3819/);assert.match(remote,/Check constraint 'chk_sb_prune_item_identity' is violated/);
assert.match(text,/^PASS fresh-migration-replay=001\.\.080 applied=95 exact_filenames=yes/m);
assert.match(text,/mysql_version=8\.4\.8/);assert.match(remote,/^command terminated with exit code 1\r?$/m);
assert.match(text.trimEnd(),/download_gc_task_exit=1$/);assert.doesNotMatch(text,/^CLEANUP_PENDING/m);
const namespace='sbk-mig-261021062218-07b5',uid='d797be70-aa63-40a9-ad7e-8d0975972de7';
assert.ok(text.includes(`CLEANED namespace=${namespace} uid=${uid}`));
assert.ok(text.includes('CLEANED remote-registration-scratch=yes'));assert.ok(text.includes('CLEANED local-registration-build-cache=True'));
const owner=path.join(root,'.tmp-d-index-cache-29e287604aad485991527f3fe8da7c4b');
assert.ok(text.includes(`LOCAL_CLEANUP config-writer-source-owned=${owner} removed=True`));assert.equal(fs.existsSync(owner),false);
const migration='backend/internal/db/migrations/070_add_system_backup_prune_authority.sql';
const probe='backend/internal/systembackupevidence/download_gc_task_mysql_test.go';
assert.equal(sha(raw(migration)),source.files.find(f=>f.path===migration).sha256,'Original migration changed');
const oldProbeSHA=source.files.find(f=>f.path===probe).sha256;
const probeBytes=raw(probe);
if(sha(probeBytes)!==oldProbeSHA){
 const reversed=decode(probeBytes).replace(/\tif t\.Failed\(\) \{\n\t\treturn\n\t}\n(?=\tt\.Log\("PASS actual SQL GC task component cases=18)/,'');
 assert.equal(sha(reversed),oldProbeSHA,'Probe changed beyond suppressing a misleading success log');
}
const sql=decode(raw(migration));
const constraint=sql.match(/CONSTRAINT chk_sb_prune_item_identity CHECK \(([\s\S]*?)\n\s*\)/)[1];
const oldPattern=constraint.match(/artifact_public_id REGEXP '([^']+)'/)[1];
assert.equal(oldPattern,'^sbk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
const canonical='sbk_11111111-2222-4333-8444-555555555555';assert.equal(new RegExp(oldPattern).test(canonical),false);
const output='docs/evidence/d-prune-identity-operator-failure-20261021.json';
const report={kind:'d_gc_task_mysql_prune_identity_failure',status:'actual_sql_failed_formal_migration_constraint_defect_identified',log:prefix+'.txt',log_sha256:sha(raw(prefix+'.txt')),source_manifest:prefix+'-source.json',source_manifest_sha256:sha(raw(prefix+'-source.json')),source_sha256:source.source_sha256,source_files:1471,remote_started:true,mysql:'8.4.8',migration_count:95,actual:{root:'TestDDownloadGCTaskMySQL',elapsed_seconds:78.28,cases:18,passed:15,failed,outer_exit:1,accepted:false},cause:{migration,migration_sha256:sha(raw(migration)),constraint:'chk_sb_prune_item_identity',column:'artifact_public_id',old_pattern:oldPattern,valid_fixture_id_rejected:true,missing_uuid_group:'fourth 4-hex segment',probe_sha256:oldProbeSHA,production_query_defect_proven:false},misleading_inner_pass:{present:/PASS actual SQL GC task component cases=18/.test(remote),does_not_override_parent_or_exit:true,candidate_suppresses_after_failed_child:true},cleanup:{namespace,uid,namespace_cleanup_reported:true,remote_scratch_cleanup_reported:true,local_build_cache_cleanup_reported:true,exact_local_owner:owner,local_owner_independently_absent:true},boundaries:{old_migration_preserved:true,repair_strategy:'append 081; retain all other predicates and FKs; refresh exact 96-file catalog and capsules',repair_actual_mysql_not_yet_run:true,whole_gc_not_accepted:true,dependencies_installed:false,reviewer_remote_run:false,production_approval:false}};
if(process.argv.includes('--check')){assert.deepEqual(read(output),report);console.log('PASS exact operator 15/18, prune identity 3819, four-group UUID counterexample, cleanup and original failure retained');}
else{fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(output);}
