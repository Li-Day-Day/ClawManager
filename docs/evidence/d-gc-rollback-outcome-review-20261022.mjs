import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const basePath='docs/evidence/d-gc-rollback-outcome-base-20261022.json',base=json(basePath);
const owner=path.resolve(base.owner),source=path.join(owner,'source');
const candidatePath='docs/evidence/d-gc-rollback-outcome-candidate-20261022-source.json',candidate=json(candidatePath);
const targetsPath='docs/evidence/d-gc-rollback-outcome-targets-20261022.json',targets=json(targetsPath).changes;
const targetNames=targets.map(x=>x.path),pins=new Map(candidate.files.map(x=>[x.path,x]));
const prefix='docs/evidence/d-gc-rollback-outcome-20261022-';
const depPrefix='docs/evidence/d-gc-rollback-outcome-dependencies-20261022';
const scopePath='docs/evidence/d-gc-rollback-outcome-scope-20261022.json';
const receiptPath='docs/evidence/d-gc-rollback-outcome-preparation-20261022.json';
const digest=files=>sha(files.map(x=>x.path+'\0'+x.sha256+'\0'+x.size).join('\n')+'\n');
assert.equal(digest(base.files),base.source_sha256);assert.equal(digest(candidate.files),candidate.source_sha256);
assert.equal(candidate.files.length,base.files.length+1);assert.equal(targets.length,5);
assert.equal(new Set(candidate.files.map(x=>x.path)).size,candidate.files.length);
for(const p of base.files)if(!targetNames.includes(p.path))assert.deepEqual(pins.get(p.path),p);
const deps=json(depPrefix+'-native.json');assert.equal(deps.exit,0);assert.equal(deps.source_postcheck,true);assert.equal(deps.source_sha256,candidate.source_sha256);
const inputNames=new Set(['backend/go.mod','backend/go.sum']);
const packageDirs=new Set(),packageNames=new Set(),testFiles=new Set();
for(const line of raw(depPrefix+'.txt').toString('utf8').trim().split(/\r?\n/)){
 const [name,dir,go,cgo,embed]=line.split('\t');if(!dir)continue;
 const relative=path.relative(source,dir).split(path.sep).join('/');if(!relative.startsWith('backend/'))continue;
 packageNames.add(name);packageDirs.add(relative);
 for(const list of [go,cgo,embed])for(const filename of (list||'').split('|').filter(Boolean)){
  const abs=path.isAbsolute(filename)?filename:path.join(dir,filename);
  const p=path.relative(source,abs).split(path.sep).join('/');if(p.startsWith('../'))continue;
  assert.ok(pins.has(p),'Unpinned input '+p);inputNames.add(p);
  if(name.startsWith('clawreef/internal/systembackupevidence [')&&p.endsWith('_test.go'))testFiles.add(p);
 }
}
// Runtime test inputs include migration enumeration, contracts and the captured
// SQL/JSON fixtures in docs. Pin this conservative asset superset explicitly.
for(const p of candidate.files)if(!p.path.endsWith('.go')&&!p.path.startsWith('scripts/'))inputNames.add(p.path);
const directories=[...packageDirs].sort().map(dir=>({path:dir,go_files:candidate.files.filter(p=>path.posix.dirname(p.path)===dir&&p.path.endsWith('.go')).map(p=>path.posix.basename(p.path)).sort()}));
const assetKinds=new Map();
for(const p of inputNames)if(!p.endsWith('.go')&&(!p.startsWith('docs/')||p.endsWith('.sql'))){const dir=path.posix.dirname(p),ext=path.posix.extname(p);assetKinds.set(dir+'\0'+ext,{path:dir,extension:ext});}
const assets=[...assetKinds.values()].sort((a,b)=>(a.path+a.extension).localeCompare(b.path+b.extension)).map(x=>({...x,files:candidate.files.filter(p=>path.posix.dirname(p.path)===x.path&&path.posix.extname(p.path)===x.extension).map(p=>path.posix.basename(p.path)).sort()}));
const scope={kind:'d_gc_rollback_outcome_project_inputs',source_sha256:candidate.source_sha256,packages:[...packageNames].sort(),package_directories:directories,asset_directories:assets,files:[...inputNames].sort().map(p=>pins.get(p)),test_files:[...testFiles].sort(),foreign_dependency_test_files_claimed:false,current_whole_tree_tested:false,go_sql_source:{path:'C:/Program Files/Go/src/database/sql/sql.go',sha256:'683b3e35d41b37f4c80500467fb5a56fab7cc5de922b2c3818aae6bfea971fba'}};
function current(published){
 assert.equal(sha(fs.readFileSync(scope.go_sql_source.path)),scope.go_sql_source.sha256,'Go SQL source changed');
 for(const d of scope.package_directories){const actual=fs.readdirSync(path.join(root,d.path)).filter(p=>p.endsWith('.go')).sort();const expected=published?d.go_files:d.go_files.filter(n=>!targets.some(t=>!t.before_exists&&t.path===d.path+'/'+n));assert.deepEqual(actual,expected,'Source set drift '+d.path);}
 for(const d of scope.asset_directories){const actual=fs.readdirSync(path.join(root,d.path)).filter(p=>path.posix.extname(p)===d.extension).sort();assert.deepEqual(actual,d.files,'Asset set drift '+d.path);}
 for(const p of scope.files){if(!published&&targetNames.includes(p.path))continue;assert.equal(sha(raw(p.path)),p.sha256,'Current input drift '+p.path);}
 for(const t of targets)if(!published){if(t.before_exists)assert.equal(sha(raw(t.path)),t.before_sha256,t.path);else assert.equal(fs.existsSync(path.join(root,t.path)),false,t.path);}
}
if(process.argv.includes('--scope')){current(false);fs.writeFileSync(path.join(root,scopePath),JSON.stringify(scope,null,2)+'\n',{flag:'wx'});console.log('GC_ROLLBACK_SCOPE inputs='+scope.files.length+' test_files='+scope.test_files.length);process.exit(0);}
assert.deepEqual(json(scopePath),scope);
if(process.argv.includes('--current')){current(true);console.log('PASS GC rollback current source/assets/runtime inputs');process.exit(0);}
function result(stage){
 const native=json(prefix+stage+'-native.json');assert.equal(native.completed,true);assert.equal(native.source_postcheck,true);assert.equal(native.restored_candidate,true);assert.equal(native.source_sha256,candidate.source_sha256);assert.equal(native.default_vet,true);
 for(const k of ['dependencies_installed','remote_executed','actual_mysql'])assert.equal(native[k],false);
 const text=raw(prefix+stage+'.stdout').toString('utf8');assert.ok(text.endsWith('\n'));
 const events=text.trim().split(/\r?\n/).map(x=>JSON.parse(x));
 const passed=events.filter(x=>x.Action==='pass'&&x.Test).map(x=>x.Test).sort();
 const failed=events.filter(x=>x.Action==='fail'&&x.Test).map(x=>x.Test).sort();
 const skipped=events.filter(x=>x.Action==='skip');assert.equal(skipped.length,0);
 return {native,events,passed,failed,roots:passed.filter(x=>!x.includes('/')),count:passed.length};
}
const newRoots=['TestDownloadRetentionGCRollbackOutcome','TestDownloadRetentionGCBatchRollbackOutcome','TestDownloadGCConnectionRollbackOutcome','TestDownloadGCBatchRollbackUnknownBeforeCancellation'];
const focused=result('focused');assert.equal(focused.native.exit,0);assert.equal(focused.failed.length,0);for(const name of newRoots)assert.ok(focused.roots.includes(name));
const propagation=result('counterfactual-propagation');assert.equal(propagation.native.exit,1);
const propagationLeaves=['TestDownloadRetentionGCRollbackOutcome/unknown_early','TestDownloadRetentionGCRollbackOutcome/unknown_late','TestDownloadRetentionGCBatchRollbackOutcome/unknown_early','TestDownloadRetentionGCBatchRollbackOutcome/unknown_late'].sort();
assert.deepEqual(propagation.failed.filter(x=>x.includes('/')),propagationLeaves);assert.equal(propagation.failed.length,6);
for(const rootName of ['TestDownloadRetentionGCRollbackOutcome','TestDownloadRetentionGCBatchRollbackOutcome'])for(const c of ['known_early','known_late'])assert.ok(propagation.passed.includes(rootName+'/'+c));
for(const c of ['commit','commit_unknown'])assert.ok(propagation.passed.includes('TestDownloadRetentionGCRollbackOutcome/'+c));
const classification=result('counterfactual-batch');assert.equal(classification.native.exit,1);
assert.deepEqual(classification.failed.filter(x=>x.includes('/')),['plain','wrapped','canceled','wrapped_canceled'].map(c=>'TestDownloadGCBatchRollbackUnknownBeforeCancellation/'+c).sort());assert.equal(classification.failed.length,5);
const full=result('full');assert.equal(full.native.exit,0);assert.equal(full.failed.length,0);
function rawSource(p){return fs.readFileSync(path.join(source,p),'utf8');}
// After cleanup, reconstruct selected owned test files from the receipt; all
// other selected sources remain pinned in the published tree.
function declaredRoots(){return scope.test_files.flatMap(p=>[...raw(p).toString('utf8').matchAll(/^func (Test\w+)\(/gm)].map(x=>x[1]).filter(x=>x!=='TestMain')).sort();}
function validateReceipt(receipt){assert.equal(receipt.source_sha256,candidate.source_sha256);assert.deepEqual(receipt.changed_files.map(x=>x.path),targetNames);for(const p of receipt.changed_files){const expected=targets.find(t=>t.path===p.path);assert.equal(p.before_exists,expected.before_exists);assert.equal(p.before_sha256,expected.before_sha256);assert.equal(p.after_sha256,pins.get(p.path).sha256);assert.equal(sha(Buffer.from(p.tested_bytes_base64,'base64')),p.after_sha256);if(p.before_exists)assert.equal(sha(Buffer.from(p.before_bytes_base64,'base64')),p.before_sha256);}for(const p of receipt.evidence)assert.equal(sha(raw(p.path)),p.sha256,p.path);}
if(process.argv.includes('--before-publish')){current(false);validateReceipt(json(receiptPath));assert.equal(json(receiptPath).status,'locally_validated_unpublished');console.log('PASS GC rollback publication preimages and current input scope');process.exit(0);}
const verifying=process.argv.includes('--check')||process.argv.includes('--precleanup');
if(verifying){
 current(true);assert.deepEqual(full.roots,declaredRoots());
 const pub=result('published');assert.equal(pub.native.exit,0);assert.equal(pub.failed.length,0);assert.deepEqual(pub.passed,full.passed);
 const receipt=json(receiptPath);validateReceipt(receipt);for(const p of receipt.changed_files){assert.equal(sha(raw(p.path)),p.after_sha256);assert.equal(sha(Buffer.from(p.tested_bytes_base64,'base64')),p.after_sha256);}
 for(const p of receipt.evidence)assert.equal(sha(raw(p.path)),p.sha256,p.path);
 if(process.argv.includes('--check')){assert.equal(receipt.status,'locally_validated_published_cleaned');const clean=json('docs/evidence/d-gc-rollback-outcome-cleanup-20261022.json');assert.equal(clean.removed,true);assert.equal(path.resolve(clean.owner),owner);assert.equal(fs.existsSync(owner),false);}else assert.equal(receipt.status,'locally_validated_published_postcheck_pending');
 console.log('PASS GC rollback: '+full.roots.length+' roots/'+full.count+' tests; two meaningful counterfactuals; exact input scope; actual MySQL not run');
}else{
 current(false);const expectedRoots=scope.test_files.flatMap(p=>[...rawSource(p).matchAll(/^func (Test\w+)\(/gm)].map(x=>x[1]).filter(x=>x!=='TestMain')).sort();assert.deepEqual(full.roots,expectedRoots);assert.equal(full.events.filter(x=>x.Action==='pass'&&!x.Test).length,1);
 const changed_files=targets.map(t=>{const bytes=fs.readFileSync(path.join(source,t.path));assert.equal(sha(bytes),pins.get(t.path).sha256);const before=t.before_exists?raw(t.path):null;return {...t,before_bytes_base64:before?.toString('base64'),after_sha256:sha(bytes),tested_bytes_base64:bytes.toString('base64')};});
 const paths=[basePath,candidatePath,targetsPath,scopePath,depPrefix+'.txt',depPrefix+'.stderr',depPrefix+'-native.json','docs/evidence/d-gc-rollback-outcome-validation-20261022.ps1','docs/evidence/d-gc-rollback-outcome-dependencies-20261022.ps1',...['focused','counterfactual-propagation','counterfactual-batch','full'].flatMap(stage=>[prefix+stage+'.stdout',prefix+stage+'.stderr',prefix+stage+'-native.json'])];
 const receipt={kind:'d_gc_rollback_outcome_preparation',status:'locally_validated_unpublished',source_sha256:candidate.source_sha256,source_files:candidate.files.length,full:{roots:full.roots,tests:full.count},focused:{roots:focused.roots,tests:focused.count},counterfactuals:{suppressed_propagation_failed_leaves:propagationLeaves,removed_classification_failed_leaves:classification.failed.filter(x=>x.includes('/'))},changed_files,evidence:paths.map(pin),production_files_changed:3,actual_mysql:false,freeze_adapter_wired:false,remote_cleanup_proven:false,dependencies_installed:false,remote_executed:false,production_approved:false,current_whole_tree_tested:false};
 fs.writeFileSync(path.join(root,receiptPath),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('GC_ROLLBACK_PREPARED publication/postcheck/cleanup pending');
}
