import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(raw(p));
const pin=p=>{const b=raw(p);return {path:p,size:b.length,sha256:hash(b)};};
const prefix='docs/evidence/a-verification-detail-build-repair-20261022-153158-ef1ac83e';
const pins=[['.txt','324ccb0ce891e65b2aa4e8b35479ea7ccbb72fb0dba7e9a4353eea500b5e3d9e'],['-source.json','d2198107801cec75ecd403cdc133d0fb2d8deaf40343dc289afc3a2d81a48e6f'],['-source.json.result.json','1059f514b347e7eeb06ed181cab9996a22aa8859465e90db7e991d3d778625be']];
for(const [suffix,digest] of pins)assert.equal(hash(raw(prefix+suffix)),digest);
const source=json(prefix+'-source.json'),result=json(prefix+'-source.json.result.json'),log=raw(prefix+'.txt').toString('utf8').replaceAll('\r\n','\n');
assert.equal(source.files.length,1569);assert.equal(new Set(source.files.map(p=>p.path)).size,1569);
assert.equal(hash(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
assert.equal(source.source_sha256,result.source_sha256);assert.equal(source.stable_copy_verified,true);
for(const key of ['remote_requested','freeze_only','actual_mysql_results_accepted','dependencies_installed'])assert.equal(result[key],false,key);
assert.equal(result.child_exit,0);assert.equal(result.source_postcheck,true);assert.equal(result.error,null);
assert.doesNotMatch(log,/^FAIL(?:\s|$)|^\s*--- (?:FAIL|SKIP):|^panic:|^RUN namespace=/m);
const summaries=[...log.matchAll(/^ok\s+(\S+)\s+([0-9.]+)s$/gm)].map(m=>({package:m[1],seconds:Number(m[2])}));
assert.deepEqual(summaries.map(x=>x.package),['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupread','command-line-arguments','clawreef/internal/systembackupsecurity']);
const currentRelevant=['system_backup_read_live.go','system_backup_read_live_test.go','system_backup_read_cursor_key.go','system_backup_read_cursor_key_test.go','system_backup_read_live_mysql_test.go','system_backup_read_verification_history_mysql_test.go'].map(name=>'backend/cmd/server/'+name);
for(const file of [...currentRelevant,'backend/go.mod','backend/go.sum'])assert.deepEqual(pin(file),source.files.find(x=>x.path===file));
const helper=raw(currentRelevant.at(-1)).toString('utf8');
const cases=[...helper.match(/cases := \[\]string\{([^}]+)\}/s)[1].matchAll(/"([a-z0-9_]+)"/g)].map(m=>m[1]);
assert.equal(cases.length,16);assert.equal(new Set(cases).size,16);
assert.ok(raw('backend/cmd/server/system_backup_read_live_mysql_test.go').toString('utf8').includes('testDVerificationDetailHTTPHistoryMySQL(t, db, ctx,'));
// The later owner-only framework budget changed after this historical build.
// Reconstruct its exact original bytes instead of silently accepting that drift.
const harnessPath='scripts/system-backup-a-evidence-validation.ps1';
let harness=raw(harnessPath).toString('utf8');
const newComments=[
 '                    # Both freeze and owner profiles exceeded 900s on this host.',
 '                    # The owner 2026-10-22 run timed out while testing\'s TempDir',
 '                    # cleanup was running, without an assertion failure. Preserve',
 '                    # every test and vet check; only the package budget changes.',
 '                    # Other profiles and production deadlines stay unchanged.',
].join('\n');
assert.equal(harness.split(newComments).length,2);
harness=harness.replace(newComments,["                    # The freeze profile's full package exceeded 900s on this host.",'                    # Existing profiles and production deadlines stay unchanged.'].join('\n'));
const budget="$downloadEvidenceTestTimeout=if($ConfigDownloadGCFreezeOnly -or $ConfigDownloadOwnersOnly){'2700s'}else{'900s'}";
assert.equal(harness.split(budget).length,2);harness=harness.replace(budget,"$downloadEvidenceTestTimeout=if($ConfigDownloadGCFreezeOnly){'2700s'}else{'900s'}");
assert.equal(hash(Buffer.from(harness)),source.files.find(p=>p.path===harnessPath).sha256);
for(const file of currentRelevant)assert.ok(harness.includes('./'+file.replace(/^backend\//,'')));
const binary=log.match(/a-admin-read-unit-tests=yes linux-mysql-probe-compiled=yes real_mysql=not_run binary_sha256=([a-f0-9]{64}) ddl_sha256=([a-f0-9]{64})/);
const http=log.match(/d-admin-read-http-probe-compiled=yes http_binary_sha256=([a-f0-9]{64}) real_mysql=not_run/);
const migration=log.match(/pinned-migration-runner-compiled=yes migration_binary_sha256=([a-f0-9]{64})/);
assert.ok(binary&&http&&migration);
for(const marker of ['LOCAL_PASS admin-read-seed=yes real_mysql=not_run','CLEANED local-registration-build-cache=True','LOCAL_PASS verification-detail-frozen-postcheck=yes freeze-only=False dependencies-installed=no remote-requested=False'])assert.ok(log.includes(marker));
const owner=result.cleanup.owner;
assert.equal(path.dirname(owner),root);assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owner),false);
assert.ok(log.includes('LOCAL_CLEANUP verification-detail-source-owned='+owner+' removed=True'));
assert.equal(result.cleanup.removed,true);assert.equal(result.cleanup.test_build_artifacts_removed,true);
const innerOwner=path.join(owner,'source','.tmp-a-evidence-3bdd0eb3097e4117a219c247f0026cd3');assert.equal(fs.existsSync(innerOwner),false);
const oldLog='docs/evidence/d-verification-detail-remote-20261022-150230-2e5ffbcd.txt';
const oldBytes=raw(oldLog);
const oldText=oldBytes.toString(oldBytes[0]===255&&oldBytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'');
assert.ok(oldText.includes('undefined: loadBackupReadCursorKey'));
const report={kind:'a_verification_detail_build_repair_independent_review.v1',status:'original_frozen_admin_read_build_repaired_actual_sixteen_pending',failed_operator_log:pin(oldLog),log:pin(prefix+'.txt'),source:pin(prefix+'-source.json'),result:pin(prefix+'-source.json.result.json'),source_sha256:source.source_sha256,source_files:1569,local_summaries:summaries,current_relevant_files:currentRelevant.map(pin),history_probe_cases:cases,linux_binaries:{admin:binary[1],http:http[1],migration:migration[1],ddl:binary[2]},later_plumbing_change:{kind:'owner_only_framework_budget_and_comments',original_harness_exactly_reconstructed:true,admin_read_budget_or_gate_weakened:false},cleanup:{outer_owner:owner,outer_independently_absent:true,source_files_removed:result.cleanup.files_removed,inner_owner_observed_during_run:innerOwner,inner_independently_absent:true,inner_owner_string_in_raw_receipt:false,inner_cleanup_reported:true},scope:{actual_MySQL:false,actual_sixteen_accepted:false,remote_contacted:false,current_whole_tree_tested:false,dependencies_installed:false,production_approved:false}};
const output=path.join(root,'docs/evidence/a-verification-detail-build-repair-accepted-20261022.json');
if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),report);
else fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('A_HISTORY_BUILD_REPAIR test_seed_build=yes inputs=1569 frozen_postcheck=yes cleanup=verified actual_16=pending');
