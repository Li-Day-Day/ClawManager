import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(raw(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,size:raw(p).length,sha256:sha(raw(p))});
const stem='docs/evidence/d-gc-owner-lifecycle-',day='20261022';
const basePath=stem+'base-'+day+'.json',candidatePath=stem+'candidate-'+day+'-source.json',targetsPath=stem+'targets-'+day+'.json';
const scopePath=stem+'scope-'+day+'.json',receiptPath=stem+'preparation-'+day+'.json';
const base=json(basePath),candidate=json(candidatePath),targetNames=json(targetsPath).targets;
const owner=path.resolve(base.owner),source=path.join(owner,'source'),pins=new Map(candidate.files.map(x=>[x.path,x]));
const digest=files=>sha(files.map(x=>x.path+'\0'+x.sha256+'\0'+x.size).join('\n')+'\n');
assert.equal(digest(base.files),base.source_sha256);assert.equal(digest(candidate.files),candidate.source_sha256);
assert.equal(candidate.files.length,base.files.length+2);assert.equal(targetNames.length,4);assert.equal(pins.size,candidate.files.length);
const oldPins=new Map(base.files.map(x=>[x.path,x]));
const changes=targetNames.map(p=>({path:p,before_exists:oldPins.has(p),before_sha256:oldPins.get(p)?.sha256}));
for(const p of base.files)if(!targetNames.includes(p.path))assert.deepEqual(pins.get(p.path),p);
const prefix=mode=>stem+day+'-'+mode;
const parseEvents=p=>{const s=raw(p).toString('utf8');assert.ok(s.endsWith('\n'));return s.trim().split(/\r?\n/).map(JSON.parse);};
function goResult(p,packages){const events=parseEvents(p);assert.equal(events.filter(x=>x.Action==='skip').length,0);const pass=events.filter(x=>x.Action==='pass'&&x.Test).map(x=>x.Package+'\0'+x.Test).sort();const fail=events.filter(x=>x.Action==='fail').map(x=>x.Test||x.Package).sort();if(packages)assert.deepEqual(events.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package).sort(),packages.sort());return {pass,fail,roots:pass.filter(x=>!x.split('\0')[1].includes('/'))};}
const inputNames=new Set(['backend/go.mod','backend/go.sum',...targetNames]),packageDirs=new Set(),testFiles=[];
for(const mode of ['default','windows','linux'])for(const line of raw(prefix('isolated')+'-dependencies-'+mode+'.stdout').toString('utf8').trim().split(/\r?\n/)){
 const [name,dir,go,cgo,embed]=line.split('\t');if(!dir)continue;const relative=path.relative(source,dir).split(path.sep).join('/');if(!relative.startsWith('backend/'))continue;
 packageDirs.add(relative);
 for(const list of [go,cgo,embed])for(const filename of (list||'').split('|').filter(Boolean)){
  const abs=path.isAbsolute(filename)?filename:path.join(dir,filename),p=path.relative(source,abs).split(path.sep).join('/');if(!p.startsWith('backend/'))continue;assert.ok(pins.has(p),'Unpinned project input '+p);inputNames.add(p);
  if(mode==='default'&&name.includes(' [')&&p.endsWith('_test.go')&&/^clawreef\/internal\/(systembackupsecurity|systembackupevidence) \[/.test(name))testFiles.push({path:p,package:name.split(' [')[0]});
 }
}
for(const p of candidate.files)if(!p.path.endsWith('.go')&&!p.path.startsWith('scripts/'))inputNames.add(p.path);
// The dispatch parses the A harness, calls only its exclusive-profile rejections,
// and calls the D wrapper's corresponding rejection guards. Go tests read no scripts.
const dispatchInputs=['scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-config-writer-validation.ps1'];
for(const p of dispatchInputs)inputNames.add(p);
const assetKinds=new Map();for(const p of inputNames)if(!p.endsWith('.go')&&(!p.startsWith('docs/')||p.endsWith('.sql'))&&!p.startsWith('scripts/')){const dir=path.posix.dirname(p),extension=path.posix.extname(p);assetKinds.set(dir+'\0'+extension,{path:dir,extension});}
const implementation_sources=[{"path":"C:/Program Files/Go/src/database/sql/sql.go","sha256":"683b3e35d41b37f4c80500467fb5a56fab7cc5de922b2c3818aae6bfea971fba"},{"path":"C:/Users/zhanghui08/go/pkg/mod/github.com/go-sql-driver/mysql@v1.9.0/dsn.go","sha256":"46368f3d45fee3986ef591a4ba0b61cf47ec273fd456d126ed0e7e5d885a2405"},{"path":"C:/Users/zhanghui08/go/pkg/mod/github.com/go-sql-driver/mysql@v1.9.0/transaction.go","sha256":"c599b683e8eaa260cb69376b31999fccfb7fcdb6f0918d79049623ec1dbf772f"},{"path":"C:/Users/zhanghui08/go/pkg/mod/github.com/go-sql-driver/mysql@v1.9.0/packets.go","sha256":"2784ca31e1fdc6f527be4023118859a9fda3ace6e1c16645fc531b04762b2a6e"}];
const scope={implementation_sources,kind:'d_gc_owner_lifecycle_input_scope',source_sha256:candidate.source_sha256,files:[...inputNames].sort().map(p=>pins.get(p)),package_directories:[...packageDirs].sort().map(dir=>({path:dir,go_files:candidate.files.filter(p=>path.posix.dirname(p.path)===dir&&p.path.endsWith('.go')).map(p=>path.posix.basename(p.path)).sort()})),asset_directories:[...assetKinds.values()].sort((a,b)=>(a.path+a.extension).localeCompare(b.path+b.extension)).map(d=>({...d,files:candidate.files.filter(p=>path.posix.dirname(p.path)===d.path&&path.posix.extname(p.path)===d.extension).map(p=>path.posix.basename(p.path)).sort()})),dispatch_inputs:dispatchInputs,test_files:testFiles.sort((a,b)=>a.path.localeCompare(b.path)),foreign_dependency_test_files_claimed:false,current_whole_tree_tested:false};
function current(published){
 for(const p of scope.implementation_sources)assert.equal(sha(fs.readFileSync(p.path)),p.sha256,'Inspected implementation source drift');
 for(const d of scope.package_directories){const want=published?d.go_files:d.go_files.filter(n=>!changes.some(t=>!t.before_exists&&t.path===d.path+'/'+n));assert.deepEqual(fs.readdirSync(path.join(root,d.path)).filter(n=>n.endsWith('.go')).sort(),want,'Go file-set drift '+d.path);}
 for(const d of scope.asset_directories)assert.deepEqual(fs.readdirSync(path.join(root,d.path)).filter(n=>path.posix.extname(n)===d.extension).sort(),d.files,'Asset file-set drift '+d.path);
 for(const p of scope.files){if(!published&&targetNames.includes(p.path))continue;assert.equal(sha(raw(p.path)),p.sha256,'Current input drift '+p.path);}
 if(!published)for(const t of changes){if(t.before_exists)assert.equal(sha(raw(t.path)),t.before_sha256,t.path);else assert.equal(fs.existsSync(path.join(root,t.path)),false,t.path);}
}
if(process.argv.includes('--scope')){assert.equal(fs.existsSync(path.join(root,receiptPath)),false);current(false);fs.writeFileSync(path.join(root,scopePath),JSON.stringify(scope,null,2)+'\n',{flag:'w'});console.log('LIFECYCLE_SCOPE inputs='+scope.files.length);process.exit(0);}
assert.deepEqual(json(scopePath),scope);
if(process.argv.includes('--current')){current(true);console.log('PASS lifecycle current inputs');process.exit(0);}
function native(mode){const n=json(prefix(mode)+'-native.json');assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.source_sha256,candidate.source_sha256);assert.equal(n.default_vet,true);for(const k of ['dependencies_installed','actual_mysql','remote_executed','freeze_adapter_wired','production_approved'])assert.equal(n[k],false);assert.ok(n.stages.every(s=>s.exit===0));return n;}
const isolated=native('isolated');assert.deepEqual(isolated.stages.map(s=>s.stage),['dispatch','dependencies-default','full','tagged-seed','dependencies-windows','windows-probe','detached-seed','dependencies-linux','linux-probe','migration-build']);
const full=goResult(prefix('isolated')+'-full.stdout',['clawreef/internal/systembackupevidence','clawreef/internal/systembackupsecurity']);assert.deepEqual(full.fail,[]);
const seed=goResult(prefix('isolated')+'-tagged-seed.stdout',['clawreef/internal/systembackupevidence']);assert.deepEqual(seed.fail,[]);assert.equal(seed.pass.length,12);assert.deepEqual(seed.roots.map(x=>x.split('\0')[1]),['TestASensitiveDownloadMFAMySQLSeed','TestDDownloadGCFreezeMySQLSeed']);
const detached=raw(prefix('isolated')+'-detached-seed.stdout').toString('utf8');for(const n of ['TestASensitiveDownloadMFAMySQLSeed','TestDDownloadGCFreezeMySQLSeed'])assert.ok(detached.includes('--- PASS: '+n+' '));assert.ok(/\bPASS\s*$/.test(detached));
const wn=json(stem+'wire-'+day+'-native.json'),cn=json(stem+'wire-counterfactual-'+day+'-native.json'),patch=json(stem+'wire-counterfactual-patch-'+day+'.json');
assert.equal(wn.exit,0);assert.equal(cn.exit,1);for(const n of [wn,cn]){assert.equal(n.default_vet,true);assert.equal(n.dependencies_installed,false);assert.equal(n.actual_mysql,false);assert.equal(n.remote_executed,false);assert.equal(n.before_sha256,n.after_sha256);}
const positive=Buffer.from(patch.positive_source_bytes_base64,'base64'),negative=Buffer.from(patch.counterfactual_source_bytes_base64,'base64');assert.equal(sha(positive),wn.after_sha256);assert.equal(sha(negative),cn.after_sha256);assert.equal(sha(positive),pins.get(targetNames[0]).sha256);assert.equal(sha(Buffer.from(positive.toString('utf8').replace(patch.removed_guard,'if false { // counterfactual: accept nonterminal/error responses'))),sha(negative),'Counterfactual must change only the recorded guard and explanatory comment');
const wire=goResult(stem+'wire-'+day+'.stdout');assert.deepEqual(wire.fail,[]);assert.equal(wire.pass.length,17);assert.equal(wire.roots.length,2);
const counter=goResult(stem+'wire-counterfactual-'+day+'.stdout');assert.deepEqual(counter.fail.filter(x=>x.includes('/')),['error_packet','still_in_transaction','more_results'].map(n=>'TestDDownloadGCLifecycleWireResponseLoss/'+n).sort());assert.equal(counter.fail.length,5);
function validateReceipt(r){assert.equal(r.source_sha256,candidate.source_sha256);assert.deepEqual(r.changed_files.map(x=>x.path),targetNames);for(const t of r.changed_files){const c=changes.find(x=>x.path===t.path);assert.equal(t.before_exists,c.before_exists);assert.equal(t.before_sha256,c.before_sha256);assert.equal(t.after_sha256,pins.get(t.path).sha256);assert.equal(sha(Buffer.from(t.tested_bytes_base64,'base64')),t.after_sha256);if(t.before_exists)assert.equal(sha(Buffer.from(t.before_bytes_base64,'base64')),t.before_sha256);}for(const p of r.evidence)assert.deepEqual(pin(p.path),p);}
function declaredRoots(read){return scope.test_files.flatMap(f=>[...read(f.path).matchAll(/^func (Test\w+)\(/gm)].filter(m=>m[1]!=='TestMain').map(m=>f.package+'\0'+m[1])).sort();}
if(process.argv.includes('--before-publish')){current(false);const r=json(receiptPath);validateReceipt(r);assert.equal(r.status,'locally_validated_unpublished');console.log('PASS lifecycle publication preimages');process.exit(0);}
if(process.argv.includes('--precleanup')||process.argv.includes('--check')){
 current(true);const r=json(receiptPath);validateReceipt(r);assert.deepEqual(full.roots,declaredRoots(p=>raw(p).toString('utf8')));native('published');const pub=goResult(prefix('published')+'-full.stdout',['clawreef/internal/systembackupevidence','clawreef/internal/systembackupsecurity']);assert.deepEqual(pub.fail,[]);assert.deepEqual(pub.pass,full.pass);
 for(const t of r.changed_files)assert.equal(sha(raw(t.path)),t.after_sha256);
 if(process.argv.includes('--check')){assert.equal(r.status,'locally_validated_published_cleaned_actual_mysql_pending');const c=json(stem+'cleanup-'+day+'.json');assert.equal(path.resolve(c.owner),owner);assert.equal(c.removed,true);assert.equal(fs.existsSync(owner),false);}else assert.equal(r.status,'locally_validated_published_postcheck_pending');
 console.log('PASS lifecycle: '+full.roots.length+' roots/'+full.pass.length+' pass events twice; 17 wire checks; 3 expected counterfactual leaves; actual MySQL pending');process.exit(0);
}
current(false);assert.deepEqual(full.roots,declaredRoots(p=>fs.readFileSync(path.join(source,p),'utf8')));
const changed_files=changes.map(t=>{const b=fs.readFileSync(path.join(source,t.path));assert.equal(sha(b),pins.get(t.path).sha256);return {...t,before_bytes_base64:t.before_exists?raw(t.path).toString('base64'):undefined,after_sha256:sha(b),tested_bytes_base64:b.toString('base64')};});
const phase=changed_files.find(t=>t.path.endsWith('-phase.sh'));let inverse=Buffer.from(phase.tested_bytes_base64,'base64').toString('utf8');const before=Buffer.from(phase.before_bytes_base64,'base64').toString('utf8');
const beforeLines=before.split('\n'),afterLines=inverse.split('\n');assert.equal(beforeLines.length,afterLines.length);const lineChanges=[];for(let i=0;i<beforeLines.length;i++)if(beforeLines[i]!==afterLines[i])lineChanges.push({line:i+1,before:beforeLines[i],after:afterLines[i]});assert.equal(lineChanges.length,3);assert.ok(lineChanges.some(x=>x.after.includes('TestDDownloadGCOwnerLifecycleMySQL')));assert.ok(lineChanges.some(x=>x.after.includes('new_cases=42 prerequisite_cases=34 lifecycle_cases=8')));assert.ok(lineChanges.some(x=>x.after.startsWith('#')));for(const d of lineChanges){assert.equal(afterLines[d.line-1],d.after);afterLines[d.line-1]=d.before;}assert.equal(sha(Buffer.from(afterLines.join('\n'))),phase.before_sha256);
const stages=isolated.stages.map(s=>s.stage),evidence=[basePath,candidatePath,targetsPath,scopePath,stem+'init-'+day+'.ps1',stem+'validation-'+day+'.ps1',stem+'review-'+day+'.mjs',stem+'publish-'+day+'.ps1',stem+'finalize-'+day+'.ps1',prefix('isolated')+'-native.json',...stages.flatMap(s=>[prefix('isolated')+'-'+s+'.stdout',prefix('isolated')+'-'+s+'.stderr']),...['wire','wire-counterfactual'].flatMap(s=>[stem+s+'-'+day+'.stdout',stem+s+'-'+day+'.stderr',stem+s+'-'+day+'-native.json',stem+s+'-validation-'+day+'.ps1']),stem+'wire-counterfactual-patch-'+day+'.json'];
const concurrent_out_of_scope=base.files.filter(p=>!inputNames.has(p.path)&&!targetNames.includes(p.path)).flatMap(p=>{const exists=fs.existsSync(path.join(root,p.path)),now=exists?sha(raw(p.path)):null;return now!==p.sha256?[{path:p.path,frozen_sha256:p.sha256,current_sha256:now,claimed_as_current_tested:false}]:[];});
const receipt={concurrent_out_of_scope,kind:'d_gc_owner_lifecycle_preparation',status:'locally_validated_unpublished',source_sha256:candidate.source_sha256,source_files:candidate.files.length,full:{roots:full.roots.length,pass_events:full.pass.length},wire:{roots:2,pass_events:17,counterfactual_failed_leaves:counter.fail.filter(x=>x.includes('/'))},phase_controlled_line_changes:lineChanges,phase_inverse_sha256:phase.before_sha256,local_bash_syntax_run:false,changed_files,evidence:evidence.map(pin),actual_mysql:false,remote_executed:false,dependencies_installed:false,freeze_adapter_wired:false,production_approved:false,production_go_files_changed:0,prerequisite_cases:34,lifecycle_cases:8,remote_case_count:42,current_whole_tree_tested:false};
fs.writeFileSync(path.join(root,receiptPath),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('LIFECYCLE_PREPARED publication/postcheck/cleanup pending');
