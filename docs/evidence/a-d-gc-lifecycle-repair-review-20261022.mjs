import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const decode=b=>(b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const json=p=>JSON.parse(decode(raw(p)));
const pin=p=>{const b=raw(p);return {path:p,size:b.length,sha256:hash(b)};};
const preparedPath='docs/evidence/d-gc-owner-cancel-repair-20261022.json';
assert.equal(hash(raw(preparedPath)),'1220653a8d4ac0349451fa3d033dd3c22b30b3beb1992537d01f81c791c6df7a');
const prepared=json(preparedPath),o=prepared.original,l=prepared.local;
for(const p of [o.log,o.source,l.log,l.source,...l.current_critical_pins]) assert.deepEqual(pin(p.path),p);
const oldSource=json(o.source.path),newSource=json(l.source.path);
for(const source of [oldSource,newSource]){
 assert.equal(hash(source.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),source.source_sha256);
 assert.equal(new Set(source.files.map(p=>p.path)).size,source.files.length);
 assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
}
const old=decode(raw(o.log.path)),local=decode(raw(l.log.path));
const runs=[...old.matchAll(/^=== RUN\s+TestDDownloadGCOwnerLifecycleMySQL\/(\S+)$/gm)].map(m=>m[1]);
const passes=[...old.matchAll(/^\s*--- PASS: TestDDownloadGCOwnerLifecycleMySQL\/(\S+) /gm)].map(m=>m[1]);
const failures=[...old.matchAll(/^\s*--- FAIL: TestDDownloadGCOwnerLifecycleMySQL\/(\S+) /gm)].map(m=>m[1]);
assert.equal(runs.length,8);assert.equal(new Set(runs).size,8);assert.deepEqual(passes,o.lifecycle_passed);assert.deepEqual(failures,['canceled_holder']);
assert.equal([...old.matchAll(/^\s*--- PASS: TestDDownloadGCFreezeMySQL\//gm)].length,34);
assert.match(old,/^--- FAIL: TestDDownloadGCOwnerLifecycleMySQL /m);assert.match(old,/^download_gc_owner_lifecycle_exit=1$/m);
assert.ok(old.includes('PASS owner-lifecycle cases=8')); // This misleading custom line is deliberately NOT accepted as success.
assert.ok(old.includes('CLEANUP_PENDING owner lifecycle connection=68 thread=417'));
assert.ok(old.includes('CLEANED namespace='+o.namespace+' uid='+o.uid));
assert.doesNotMatch(old,/^PASS d-download-gc-freeze-mysql binary_sha256=/m);
assert.doesNotMatch(local,/^\s*--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|^panic:|^RUN namespace=/m);
assert.match(local,/^local_validation_exit=0$/m);
let start=0;
const sections=[...local.matchAll(/^ok\s+(clawreef\/\S+)\s+([0-9.]+)s\s*$/gm)].map(m=>{
 const text=local.slice(start,m.index);start=m.index+m[0].length;
 const ran=[...text.matchAll(/^=== RUN\s+(\S+)$/gm)].map(x=>x[1]);
 const passed=[...text.matchAll(/^\s*--- PASS: (\S+) /gm)].map(x=>x[1]);
 assert.deepEqual([...ran].sort(),[...passed].sort());assert.equal(new Set(ran).size,ran.length);
 return {package:m[1],seconds:m[2],roots:passed.filter(x=>!x.includes('/')).length,pass_events:passed.length};
});
assert.deepEqual(sections,l.package_sections);assert.equal(sections.length,3);
for(const marker of ['LOCAL_PASS config-standalone-seed=yes checkout-fixtures=absent','LOCAL_PASS pinned-migration-runner-compiled=yes','LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=False']) assert.ok(local.includes(marker));
for(const item of prepared.cleanup){
 assert.equal(path.dirname(item.owner),root);assert.match(path.basename(item.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(item.owner),false);
 assert.ok((old+'\n'+local).includes('LOCAL_CLEANUP config-writer-source-owned='+item.owner+' removed=True'));
}
const probePath='backend/internal/systembackupevidence/download_gc_owner_lifecycle_mysql_test.go';
const source=raw(probePath).toString('utf8');
for(const text of ['const dGCLifecycleCancelSleepSeconds = 30','releaseBudget = time.Duration(dGCLifecycleCancelSleepSeconds)*time.Second + 10*time.Second','tx.QueryRowContext(ctx, dGCLifecycleCancelSQL).Scan(&slept)','!errors.Is(err, context.Canceled)','if !t.Failed() {']) assert.ok(source.includes(text));
assert.equal(newSource.files.find(f=>f.path===probePath).sha256,hash(raw(probePath)));
const changed=newSource.files.filter(f=>oldSource.files.find(p=>p.path===f.path)?.sha256!==f.sha256).map(f=>f.path);
const result={kind:'a_d_gc_lifecycle_repair_independent_review.v1',status:'local_repair_preparation_reviewed_actual_42_still_pending',preparation:pin(preparedPath),original_log:o.log,original_source:o.source,original_actual:{passed:41,total:42,failed_case:'canceled_holder',profile_exit:1,custom_parent_PASS_rejected:true,cleanup_pending_identity_preserved:{connection:68,thread:417},remote_cleanup_reported:true,remote_cleanup_independently_checked:false},local:{log:l.log,source:l.source,source_sha256:newSource.source_sha256,sections,current_critical_pins:l.current_critical_pins,all_source_changes_since_failed_run:changed,current_whole_tree_tested:false},cleanup:prepared.cleanup,actual_mysql_42_accepted:false,freeze_adapter_wired:false,full_gc_accepted:false,dependencies_installed:false,reviewer_remote_run:false};
const output=path.join(root,'docs/evidence/a-d-gc-lifecycle-repair-reviewed-20261022.json');
const args=process.argv.slice(2);assert.ok(args.length===1 && ['--write','--check'].includes(args[0]));
if(args[0]==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),result);
console.log('A_GC_LIFECYCLE_REVIEW original=41/42_failed local_full=5091_pass_events actual_42=pending exact_local_owners=absent');
