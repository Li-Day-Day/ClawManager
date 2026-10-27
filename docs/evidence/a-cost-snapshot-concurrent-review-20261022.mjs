// A independent evidence review. Does not run Go, SQL, SSH, builds or installs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b).replace(/^\uFEFF/,'');
const json=p=>JSON.parse(decode(raw(p)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,sha256:sha(raw(p)),bytes:raw(p).length});
const setEqual=(a,b)=>{assert.equal(new Set(a).size,a.length);assert.equal(new Set(b).size,b.length);assert.deepEqual([...a].sort(),[...b].sort());};
const dir='backend/internal/systembackupbusinessa/';
const pkg='clawreef/internal/systembackupbusinessa';
const prefix='docs/evidence/d-cost-snapshot-concurrent-20261022-';
const preparation='docs/evidence/d-cost-snapshot-concurrent-preparation-20261022.json';
assert.equal(pin(preparation).sha256,'7a9b0c8d520cf863785988d37d88564edcdbca1960f81a3890c80152d0345842');
const d=json(preparation);
assert.equal(d.status,'locally_validated_published_cleaned_actual_mysql_pending');
for(const k of ['actual_mysql','dependencies_installed','remote_executed','production_approved','current_whole_tree_tested'])assert.equal(d[k],false);
assert.equal(d.production_files_changed,0);
for(const p of d.evidence){assert.equal(sha(raw(p.path)),p.sha256,p.path);assert.equal(raw(p.path).length,p.size);}
const manifest=p=>{
 const m=json(p);setEqual(m.files.map(v=>v.path),m.files.map(v=>v.path));
 for(const f of m.files){assert.ok(!path.isAbsolute(f.path)&&!f.path.includes('\\')&&!f.path.split('/').some(v=>['','.','..'].includes(v)));assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(f.size)&&f.size>=0);}
 assert.equal(sha(m.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),m.source_sha256);return m;
};
const base=manifest('docs/evidence/d-cost-snapshot-concurrent-base-20261022.json');
const source=manifest(prefix+'isolated-source.json'),published=manifest(prefix+'published-source.json');
assert.deepEqual(source.files,published.files);assert.equal(source.source_sha256,d.source_sha256);assert.equal(source.files.length,1524);assert.equal(base.files.length,1522);
const targets=[dir+'restore_rows_mysql_test.go',dir+'cost_snapshot_hook_test.go',dir+'cost_snapshot_concurrent_mysql_test.go'];
setEqual(d.changed_files.map(f=>f.path),targets);
for(const f of base.files)if(!targets.includes(f.path))assert.deepEqual(source.files.find(p=>p.path===f.path),f);
for(const f of d.changed_files){assert.ok(f.path.endsWith('_test.go'));assert.equal(sha(raw(f.path)),f.after_sha256);assert.deepEqual(raw(f.path),Buffer.from(f.tested_bytes_base64,'base64'));}
const existing=d.changed_files.find(f=>f.path===targets[0]);
assert.equal(existing.before_exists,true);const before=Buffer.from(existing.before_bytes_base64,'base64');assert.equal(sha(before),existing.before_sha256);
assert.equal(base.files.find(f=>f.path===targets[0]).sha256,existing.before_sha256);
for(const f of d.changed_files.filter(f=>f.path!==targets[0])){assert.equal(f.before_exists,false);assert.equal(f.before_sha256,null);assert.equal(base.files.some(p=>p.path===f.path),false);}
const insertion='\tif !t.Run("cost_snapshot_concurrent_commit", func(t *testing.T) {\n\t\tbusinessCostSnapshotConcurrentCommit(t, ctx, readerCfg, reader, database, scope, binding.Dump.Snapshot, originalCost, uuid, nonce)\n\t}) {\n\t\tt.Fatal("concurrent cost snapshot probe failed")\n\t}\n';
const restore=decode(raw(targets[0]));assert.equal(restore.split(insertion).length,2);assert.deepEqual(Buffer.from(restore.replace(insertion,'')),before);
const scopePath='docs/evidence/d-cost-snapshot-concurrent-scope-20261022.json',scope=json(scopePath);
assert.equal(scope.source_sha256,source.source_sha256);assert.equal(scope.files.length,208);
assert.equal(scope.current_whole_tree_tested,false);assert.equal(scope.foreign_dependency_test_files_claimed,false);
for(const f of scope.files){assert.deepEqual(source.files.find(p=>p.path===f.path),f);assert.equal(sha(raw(f.path)),f.sha256,f.path);assert.equal(raw(f.path).length,f.size);}
for(const group of scope.package_directories){setEqual(fs.readdirSync(path.join(root,group.path)).filter(p=>p.endsWith('.go')),group.go_files);}
for(const group of scope.asset_directories){setEqual(fs.readdirSync(path.join(root,group.path)).filter(p=>path.extname(p)===group.extension),group.files);}
assert.equal(scope.asset_directories.filter(g=>g.extension==='.sql').reduce((n,g)=>n+g.files.length,0),96);
assert.equal(scope.asset_directories.filter(g=>g.extension==='.json').reduce((n,g)=>n+g.files.length,0),1);
for(const p of targets)assert.ok(scope.files.some(f=>f.path===p));
const events=p=>{const t=decode(raw(p));assert.ok(t.endsWith('\n'));return t.trim().split(/\r?\n/).map(JSON.parse);};
const complete=(p,mixed=false)=>{
 const all=events(p);assert.equal(all.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
 const e=all.filter(e=>e.Package===pkg);if(!mixed)assert.equal(e.length,all.length);
 const runs=e.filter(e=>e.Action==='run'&&e.Test).map(e=>e.Test),passes=e.filter(e=>e.Action==='pass'&&e.Test).map(e=>e.Test);
 setEqual(runs,passes);setEqual(e.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package),[pkg]);
 return {path:p,tests:passes,roots:passes.filter(p=>!p.includes('/'))};
};
const isolated=complete(prefix+'isolated-full-business.stdout'),pub=complete(prefix+'published-full-business.stdout');
setEqual(isolated.tests,pub.tests);assert.equal(pub.tests.length,396);assert.equal(pub.roots.length,88);
const prior=complete('docs/evidence/d-a-cost-aggregate-v2-20261021-r2-full.jsonl',true);
assert.equal(prior.tests.length,387);assert.equal(prior.roots.length,86);assert.ok(prior.tests.every(t=>pub.tests.includes(t)));
const hookRoot='TestCostSnapshotHookDelegatesOriginalTransaction',closeRoot='TestCostSnapshotHookRunsOnceAfterSuccessfulClose';
const additions=pub.tests.filter(t=>!prior.tests.includes(t));
setEqual(additions,[hookRoot,...['matched','non_matching','hook_error','query_error'].map(t=>hookRoot+'/'+t),closeRoot,...['closed','close_error','canceled'].map(t=>closeRoot+'/'+t)]);
const seed=complete(prefix+'isolated-tagged-seed.stdout');assert.equal(seed.tests.length,3);setEqual(seed.roots,['TestABusinessRestoreMySQLSeed']);
const detached=decode(raw(prefix+'isolated-detached-seed.stdout'));
const detachedPasses=[...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]);setEqual(detachedPasses,seed.tests);assert.match(detached,/^PASS\r?$/m);assert.doesNotMatch(detached,/--- (FAIL|SKIP):|panic:/);
for(const mode of ['isolated','published']){
 const n=json(prefix+mode+'-native.json');assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.default_vet,true);assert.equal(n.source_sha256,source.source_sha256);
 for(const k of ['actual_mysql','dependencies_installed','remote_executed'])assert.equal(n[k],false);
 setEqual(n.stages.map(s=>s.stage),mode==='isolated'?['full-business','tagged-seed','windows-probe','detached-seed','linux-probe']:['full-business']);
 for(const s of n.stages){assert.equal(s.exit,0);assert.equal(raw(prefix+mode+'-'+s.stage+'.stderr').length,0);}
 assert.ok(n.stages[0].arguments.includes('-mod=readonly'));assert.ok(!n.stages[0].arguments.includes('-vet=off'));assert.ok(!n.stages[0].arguments.includes('-run'));
}
const depsPrefix='docs/evidence/d-cost-snapshot-concurrent-dependencies-20261022';const deps=json(depsPrefix+'-native.json');
assert.equal(deps.exit,0);assert.equal(deps.source_postcheck,true);assert.equal(deps.source_sha256,source.source_sha256);assert.equal(deps.dependencies_installed,false);assert.equal(deps.actual_mysql,false);
setEqual(deps.stages.map(s=>s.platform),['windows','linux','linux-migration-dependencies','linux-migration-build']);for(const s of deps.stages)assert.equal(s.exit,0);
for(const s of ['windows','linux','migration','migration-build'])assert.equal(raw(depsPrefix+'-'+s+'.stderr').length,0);
const cleanupPath='docs/evidence/d-cost-snapshot-concurrent-cleanup-20261022.json',clean=json(cleanupPath);
const owner=path.resolve(root,'.tmp-d-index-cache-8155571ac24945128752f25b204346f0');
assert.equal(path.resolve(base.owner),owner);assert.equal(path.resolve(clean.owner),owner);assert.equal(clean.removed,true);assert.equal(clean.files_removed,6782);assert.equal(fs.existsSync(owner),false);
for(const k of ['source_removed','cache_removed','tmp_removed','telemetry_removed','windows_linux_probe_and_migration_binaries_removed'])assert.equal(clean[k],true);
assert.equal(clean.dependencies_installed,false);assert.equal(clean.actual_mysql,false);assert.equal(clean.remote_executed,false);
const result={kind:'a_cost_snapshot_concurrent_independent_review',status:'accepted_local_test_preparation_only_actual_mysql_pending',preparation:pin(preparation),source_sha256:source.source_sha256,frozen_source_files:source.files.length,actual_project_inputs:scope.files.length,production_files_changed:0,test_files_changed:targets,isolated:{roots:88,checks:396},published:{roots:88,checks:396},prior:{roots:86,checks:387,retained:387,path:prior.path,pin:pin(prior.path)},added_checks:additions.sort(),tagged_seed_checks:3,detached_seed_checks:3,default_vet:true,source_postcheck:true,platform_probe_builds:['windows/amd64','linux/amd64'],linux_migration_cli_build:true,exact_cleanup:pin(cleanupPath),owner_independently_absent:true,binaries_reported_then_deleted:d.binaries,evidence:[...d.evidence.map(p=>pin(p.path)),pin(preparation)],actual_mysql:false,remote_executed_by_A:false,dependencies_installed_by_A:false,test_or_build_artifacts_created_by_A:false,current_whole_tree_approved:false,new_owner_source_baseline_registered:false,production_dump_proof:false,production_account_approval:false,production_approved:false,full_gc:false,freeze_adapter_approved:false,operator_handoff:'docs/system-backup-d-cost-snapshot-concurrent-20261022.md',required_actual_child:'TestABusinessRestoreRowsMySQL/cost_snapshot_concurrent_commit'};
const out=path.join(root,'docs/evidence/a-cost-snapshot-concurrent-accepted-20261022.json');
if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(decode(fs.readFileSync(out))),result);
else fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('PASS A cost snapshot local preparation: 88 roots/396 checks twice; old 387 retained; 208 inputs; 3 seeds twice; exact owner absent; actual MySQL pending');
