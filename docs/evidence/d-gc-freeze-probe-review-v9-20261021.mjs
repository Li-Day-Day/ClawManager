import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
const raw=p=>fs.readFileSync(path.join(root,p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const parentPath='docs/evidence/d-gc-freeze-probe-preparation-r8-unpublished-20261021.json',parent=json(parentPath);
assert.equal(parent.status,'locally_validated_unpublished_actual_mysql_pending');
for(const p of parent.evidence)assert.equal(sha(raw(p.path)),p.sha256,p.path);
const old=json('docs/evidence/d-gc-freeze-probe-20261021-r8-source.json');
assert.equal(old.source_sha256,parent.source_sha256);
const prefix='docs/evidence/d-gc-freeze-probe-20261021-r9',source=json(prefix+'-source.json'),native=json(prefix+'-native.json');
assert.equal(native.exit,0);assert.equal(native.source_postcheck,true);assert.equal(native.source_sha256,source.source_sha256);assert.equal(source.parent_source_sha256,old.source_sha256);
const added=['backend/internal/systembackupread/verification_detail.go','backend/internal/systembackupread/verification_detail_test.go'];
assert.deepEqual(source.added_from_parent,added);assert.equal(source.files.length,old.files.length+2);
for(const pin of old.files)assert.deepEqual(source.files.find(x=>x.path===pin.path),pin);
for(const m of [old,source])assert.equal(sha(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),m.source_sha256);
for(const k of ['dependencies_installed','actual_mysql','remote','production_approved'])assert.equal(native[k],false,k);
const stages=['full-read','tagged-seed','windows-build','detached-seed','linux-build','linux-migration'];
for(const name of stages)assert.equal(native.stages.find(x=>x.stage===name)?.exit,0,name);
function result(stage,pkg){const text=raw(prefix+'-'+stage+'.stdout').toString('utf8');assert.ok(text.endsWith('\n'));const rows=text.trim().split(/\r?\n/).map(x=>JSON.parse(x));assert.equal(rows.filter(x=>x.Action==='fail').length,0);assert.deepEqual(rows.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package),[pkg]);const passed=rows.filter(x=>x.Action==='pass'&&x.Test);return {package:pkg,roots:passed.filter(x=>!x.Test.includes('/')).map(x=>x.Test),tests:passed.length,skips:rows.filter(x=>x.Action==='skip').length};}
const read=result('full-read','clawreef/internal/systembackupread'),tagged=result('tagged-seed','clawreef/internal/systembackupevidence');
assert.deepEqual(tagged.roots.toSorted(),['TestASensitiveDownloadMFAMySQLSeed','TestDDownloadGCFreezeMySQLSeed']);assert.equal(tagged.skips,0);
const detached=raw(prefix+'-detached-seed.stdout').toString('utf8');assert.match(detached,/^--- PASS: TestDDownloadGCFreezeMySQLSeed /m);assert.match(detached,/^--- PASS: TestASensitiveDownloadMFAMySQLSeed /m);assert.doesNotMatch(detached,/--- (FAIL|SKIP):/);assert.match(detached,/^PASS\r?$/m);
const scope=json('docs/evidence/d-gc-freeze-probe-read-extension-scope-20261021.json');assert.equal(scope.top_level_var_declaration,false);assert.equal(scope.init_function,false);assert.deepEqual(scope.direct_name_references_in_parent_tested_go_files,[]);assert.equal(scope.sha256,source.files.find(x=>x.path===added[0]).sha256);
const evidence=[...parent.evidence,{path:parentPath,size:raw(parentPath).length,sha256:sha(raw(parentPath))},...[prefix+'-source.json',prefix+'-native.json','docs/evidence/d-gc-freeze-probe-read-extension-scope-20261021.json','docs/evidence/d-gc-freeze-probe-prepublish-current-20261021.json','docs/evidence/d-gc-freeze-probe-concurrent-scope-20261021-r9.json','docs/evidence/d-gc-freeze-probe-dependencies-20261021-r9.txt','docs/evidence/d-gc-freeze-probe-dependencies-20261021-r9-native.json',...stages.flatMap(x=>[prefix+'-'+x+'.stdout',prefix+'-'+x+'.stderr'])].map(p=>({path:p,size:raw(p).length,sha256:sha(raw(p))}))];
evidence.push({path:'docs/evidence/d-gc-freeze-probe-prepublish-current-v2-20261021.json',size:raw('docs/evidence/d-gc-freeze-probe-prepublish-current-v2-20261021.json').length,sha256:sha(raw('docs/evidence/d-gc-freeze-probe-prepublish-current-v2-20261021.json'))});
const out='docs/evidence/d-gc-freeze-probe-preparation-20261021.json';
if(process.argv.includes('--check')){
 const r=json(out);assert.equal(r.status,'locally_validated_published_actual_mysql_pending');assert.equal(r.source_sha256,source.source_sha256);assert.deepEqual(r.evidence,evidence);assert.deepEqual(r.additional_read_validation,read);assert.deepEqual(r.tagged_seed,tagged);assert.equal(r.actual_mysql,false);assert.equal(r.production_approved,false);
 for(const pin of r.changed_files){assert.equal(sha(raw(pin.path)),pin.after_sha256,pin.path);assert.equal(sha(Buffer.from(pin.tested_bytes_base64,'base64')),pin.after_sha256);}
 console.log('PASS freeze prerequisite preparation: parent gates, added read tests, rebuilt probes, six published files; actual MySQL pending');
}else{
 assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
 for(const pin of parent.changed_files){assert.equal(sha(fs.readFileSync(path.join(owner,'source',pin.path))),pin.after_sha256);if(pin.before_exists)assert.equal(sha(raw(pin.path)),pin.before_sha256);else assert.equal(fs.existsSync(path.join(root,pin.path)),false);}
 const binaries=['d-download-gc-freeze.exe','d-download-gc-freeze.test','system-backup-migrate'].map(name=>{const b=fs.readFileSync(path.join(owner,name));assert.ok(b.length>10000);assert.equal(b.subarray(0,name.endsWith('.exe')?2:4).toString('hex'),name.endsWith('.exe')?'4d5a':'7f454c46');return {name,size:b.length,sha256:sha(b)}});
 const r={...parent,kind:'d_gc_freeze_prerequisite_preparation_with_read_extension',source_sha256:source.source_sha256,source_files:source.files.length,parent_preparation:{path:parentPath,sha256:sha(raw(parentPath)),status:parent.status},parent_tested_source_sha256:old.source_sha256,additional_read_validation:read,tagged_seed:tagged,binaries,evidence,dependency_extension:{added_files:added,all_parent_tested_bytes_unchanged:true,no_initialization_or_direct_incoming_names_found:true,read_package_fully_tested:true,probes_rebuilt:true},current_whole_tree_tested:false};
 fs.writeFileSync(path.join(root,out),JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log('FREEZE_PREPARATION extension verified; six-file publication and exact cleanup pending');
}
