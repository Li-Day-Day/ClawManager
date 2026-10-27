import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const basePath='docs/evidence/d-cost-snapshot-concurrent-base-20261022.json';
const base=json(basePath),owner=path.resolve(base.owner),source=path.join(owner,'source');
const prefix='docs/evidence/d-cost-snapshot-concurrent-20261022-';
const manifest=json(prefix+'isolated-source.json');
const byPath=new Map(manifest.files.map(p=>[p.path,p]));
const targets=['backend/internal/systembackupbusinessa/restore_rows_mysql_test.go','backend/internal/systembackupbusinessa/cost_snapshot_hook_test.go','backend/internal/systembackupbusinessa/cost_snapshot_concurrent_mysql_test.go'];
const digest=pins=>sha(pins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n');
assert.equal(digest(manifest.files),manifest.source_sha256);
assert.equal(manifest.files.length,base.files.length+2);
for(const p of base.files)if(!targets.includes(p.path))assert.deepEqual(byPath.get(p.path),p);
const native=json(prefix+'isolated-native.json');
assert.equal(native.exit,0);assert.equal(native.source_postcheck,true);assert.equal(native.source_sha256,manifest.source_sha256);assert.equal(native.default_vet,true);
for(const k of ['dependencies_installed','remote_executed','actual_mysql'])assert.equal(native[k],false);
assert.deepEqual(native.stages.map(s=>s.stage),['full-business','tagged-seed','windows-probe','detached-seed','linux-probe']);
for(const s of native.stages)assert.equal(s.exit,0,s.stage);
const results=(mode,stage)=>{
 const text=read(prefix+mode+'-'+stage+'.stdout').toString('utf8');assert.ok(text.endsWith('\n'));
 const rows=text.trim().split(/\r?\n/).map(x=>JSON.parse(x));
 assert.equal(rows.filter(x=>x.Action==='fail'||x.Action==='skip').length,0);
 assert.deepEqual(rows.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package),['clawreef/internal/systembackupbusinessa']);
 const passes=rows.filter(x=>x.Action==='pass'&&x.Test);
 return {roots:passes.filter(x=>!x.Test.includes('/')).map(x=>x.Test).sort(),tests:passes.length};
};
const full=results('isolated','full-business'),seed=results('isolated','tagged-seed');
assert.equal(full.roots.length,88);
assert.ok(full.roots.includes('TestCostSnapshotHookDelegatesOriginalTransaction'));
assert.ok(full.roots.includes('TestCostSnapshotHookRunsOnceAfterSuccessfulClose'));
assert.deepEqual(seed.roots,['TestABusinessRestoreMySQLSeed']);
const detached=read(prefix+'isolated-detached-seed.stdout').toString('utf8');
assert.match(detached,/^--- PASS: TestABusinessRestoreMySQLSeed /m);assert.match(detached,/^PASS\r?$/m);assert.doesNotMatch(detached,/--- (FAIL|SKIP):/);
const depsPrefix='docs/evidence/d-cost-snapshot-concurrent-dependencies-20261022';
const deps=json(depsPrefix+'-native.json');
assert.equal(deps.exit,0);assert.equal(deps.source_postcheck,true);assert.equal(deps.source_sha256,manifest.source_sha256);
assert.equal(deps.dependencies_installed,false);assert.equal(deps.actual_mysql,false);
assert.equal(deps.stages.length,4);for(const s of deps.stages)assert.equal(s.exit,0);
// GoFiles includes the selected test variants. TestGoFiles on foreign
// dependency packages is intentionally excluded: those tests were not run.
const scoped=new Set(['backend/go.mod','backend/go.sum','contracts/system-backup/v12/schema-registry.json','contracts/system-backup/v12/verifier-contract.schema.json','backend/internal/northbound/types.go','backend/internal/services/northbound_admin_service.go']);
const packages=new Set(),directories=new Set(),assetKinds=new Map();
for(const platform of ['windows','linux','migration']){
 for(const line of read(depsPrefix+'-'+platform+'.txt').toString('utf8').trim().split(/\r?\n/)){
  const [name,dir,go,cgo,embed]=line.split('\t');
  if(!dir)continue;
  const relative=path.relative(source,dir).split(path.sep).join('/');
  if(!relative.startsWith('backend/'))continue;
  packages.add(name);
  directories.add(relative);
  for(const list of [go,cgo,embed])for(const file of (list||'').split('|').filter(Boolean)){
   const fullPath=path.isAbsolute(file)?file:path.join(dir,file);
   const p=path.relative(source,fullPath).split(path.sep).join('/');
   if(p.startsWith('../'))continue; // generated test main under owned GOTMPDIR
   assert.ok(byPath.has(p),'Unpinned project input '+p);scoped.add(p);
   if(list===embed){const dir=path.posix.dirname(p),ext=path.posix.extname(p);assetKinds.set(dir+'\0'+ext,{path:dir,extension:ext});}
  }
 }
}
const package_directories=[...directories].sort().map(dir=>({path:dir,go_files:manifest.files.filter(p=>p.path.endsWith('.go')&&path.posix.dirname(p.path)===dir).map(p=>path.posix.basename(p.path)).sort()}));
const asset_directories=[...assetKinds.values()].sort((a,b)=>(a.path+a.extension).localeCompare(b.path+b.extension)).map(x=>({...x,files:manifest.files.filter(p=>path.posix.dirname(p.path)===x.path&&path.posix.extname(p.path)===x.extension).map(p=>path.posix.basename(p.path)).sort()}));
const scope={kind:'d_cost_snapshot_actual_project_inputs',source_sha256:manifest.source_sha256,packages:[...packages].sort(),package_directories,asset_directories,files:[...scoped].sort().map(p=>{assert.ok(byPath.has(p),p);return byPath.get(p)}),foreign_dependency_test_files_claimed:false,current_whole_tree_tested:false};
const scopePath='docs/evidence/d-cost-snapshot-concurrent-scope-20261022.json';
const receiptPath='docs/evidence/d-cost-snapshot-concurrent-preparation-20261022.json';
function guardCurrent(published){
 for(const dir of scope.asset_directories){const actual=fs.readdirSync(path.join(root,dir.path)).filter(p=>path.posix.extname(p)===dir.extension).sort();assert.deepEqual(actual,dir.files,'Current embedded asset set changed '+dir.path);}
 for(const dir of scope.package_directories){
  const actual=fs.readdirSync(path.join(root,dir.path)).filter(p=>p.endsWith('.go')).sort();
  const expected=published?dir.go_files:dir.go_files.filter(p=>!targets.slice(1).includes(dir.path+'/'+p));
  assert.deepEqual(actual,expected,'Current project source set changed '+dir.path);
 }
 for(const p of scope.files){
  if(!published&&targets.includes(p.path))continue;
  assert.equal(sha(read(p.path)),p.sha256,'Current input changed '+p.path);
 }
 if(!published){
  assert.equal(sha(read(targets[0])),base.files.find(p=>p.path===targets[0]).sha256);
  for(const p of targets.slice(1))assert.equal(fs.existsSync(path.join(root,p)),false,p);
 }
}
if(process.argv.includes('--before-publish')){
 assert.deepEqual(json(scopePath),scope);guardCurrent(false);
 assert.equal(json(receiptPath).status,'locally_validated_unpublished_actual_mysql_pending');
 console.log('PASS cost snapshot current dependency scope and publication preimages');
 process.exit(0);
}
if(process.argv.includes('--check')||process.argv.includes('--precleanup')){
 assert.deepEqual(json(scopePath),scope);guardCurrent(true);
 const pub=json(prefix+'published-native.json');
 assert.equal(pub.exit,0);assert.equal(pub.source_postcheck,true);assert.equal(pub.source_sha256,manifest.source_sha256);
 assert.deepEqual(results('published','full-business'),full);
 const r=json(receiptPath);
 if(process.argv.includes('--precleanup'))assert.equal(r.status,'locally_validated_published_postcheck_pending_actual_mysql');
 for(const p of r.changed_files){assert.equal(sha(read(p.path)),p.after_sha256);assert.equal(sha(Buffer.from(p.tested_bytes_base64,'base64')),p.after_sha256)}
 for(const p of r.evidence)assert.equal(sha(read(p.path)),p.sha256,p.path);
 if(process.argv.includes('--check')){
  assert.equal(r.status,'locally_validated_published_cleaned_actual_mysql_pending');
  const clean=json('docs/evidence/d-cost-snapshot-concurrent-cleanup-20261022.json');
  assert.equal(clean.removed,true);assert.equal(path.resolve(clean.owner),owner);assert.equal(fs.existsSync(owner),false);
 }
 console.log(`PASS cost snapshot preparation: ${full.roots.length} roots/${full.tests} tests, seeds/platforms, ${scope.files.length} actual project inputs; actual MySQL pending`);
}else{
 assert.equal(fs.readFileSync(path.join(owner,'owner.txt'),'utf8'),path.basename(owner));
 guardCurrent(false);
 const newText=fs.readFileSync(path.join(source,targets[0]),'utf8');
 const insertion='\tif !t.Run("cost_snapshot_concurrent_commit", func(t *testing.T) {\n\t\tbusinessCostSnapshotConcurrentCommit(t, ctx, readerCfg, reader, database, scope, binding.Dump.Snapshot, originalCost, uuid, nonce)\n\t}) {\n\t\tt.Fatal("concurrent cost snapshot probe failed")\n\t}\n';
 assert.equal(newText.split(insertion).length,2);assert.equal(sha(newText.replace(insertion,'')),base.files.find(p=>p.path===targets[0]).sha256);
 const changed_files=targets.map(p=>{const bytes=fs.readFileSync(path.join(source,p));assert.equal(sha(bytes),byPath.get(p).sha256);const before=p===targets[0]?read(p):null;return {path:p,before_exists:before!==null,before_sha256:before?sha(before):null,before_bytes_base64:before?.toString('base64'),after_sha256:sha(bytes),tested_bytes_base64:bytes.toString('base64')}});
 const binaries=['a-cost-snapshot.exe','a-cost-snapshot.test','system-backup-migrate'].map(name=>{const b=fs.readFileSync(path.join(owner,name));assert.ok(b.length>10000);assert.equal(b.subarray(0,name.endsWith('.exe')?2:4).toString('hex'),name.endsWith('.exe')?'4d5a':'7f454c46');return {name,sha256:sha(b),size:b.length}});
 fs.writeFileSync(path.join(root,scopePath),JSON.stringify(scope,null,2)+'\n',{flag:'wx'});
 const ep=[basePath,scopePath,prefix+'isolated-source.json',prefix+'isolated-native.json','docs/evidence/d-cost-snapshot-concurrent-validation-20261022.ps1','docs/evidence/d-cost-snapshot-concurrent-dependencies-20261022.ps1',...native.stages.flatMap(x=>[prefix+'isolated-'+x.stage+'.stdout',prefix+'isolated-'+x.stage+'.stderr']),depsPrefix+'-native.json',...['windows','linux','migration'].flatMap(x=>[depsPrefix+'-'+x+'.txt',depsPrefix+'-'+x+'.stderr']),depsPrefix+'-migration-build.stdout',depsPrefix+'-migration-build.stderr'];
 const evidence=ep.map(p=>({path:p,size:read(p).length,sha256:sha(read(p))}));
 const r={kind:'d_cost_snapshot_concurrent_mysql_preparation',status:'locally_validated_unpublished_actual_mysql_pending',source_sha256:manifest.source_sha256,source_files:manifest.files.length,full_package:full,tagged_seed:seed,changed_files,binaries,evidence,production_files_changed:0,actual_mysql:false,dependencies_installed:false,remote_executed:false,production_approved:false,current_whole_tree_tested:false};
 fs.writeFileSync(path.join(root,receiptPath),JSON.stringify(r,null,2)+'\n',{flag:'wx'});
 console.log('COST_SNAPSHOT_PREPARED exact three-test-file change; publication/postcheck/cleanup pending');
}
