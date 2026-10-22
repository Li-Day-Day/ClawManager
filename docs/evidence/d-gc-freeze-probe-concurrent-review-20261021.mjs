import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const owner=path.join(root,'.tmp-d-index-cache-d8d857ee52dc4f56868c0b79a75f1d0e');
const sourceRoot=path.join(owner,'source');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const revision=process.argv.includes('--revision=9')?9:process.argv.includes('--revision=8')?8:process.argv.includes('--revision=7')?7:process.argv.includes('--revision=6')?6:process.argv.includes('--revision=5')?5:process.argv.includes('--revision=4')?4:process.argv.includes('--revision=3')?3:2;
const listing='docs/evidence/d-gc-freeze-probe-dependencies-20261021'+(revision>=4?'-r'+revision:'');
assert.equal(json(listing+'-native.json').exit,0);
const manifest=json(`docs/evidence/d-gc-freeze-probe-20261021-r${revision}-source.json`);
const paths=new Set(),packages=new Set();
for(const line of read(listing+'.txt').toString('utf8').trim().split(/\r?\n/)){
 const [pkg,dir,...groups]=line.split('|');
 if(!pkg.startsWith('clawreef/'))continue;
 packages.add(pkg);
 // go list -test already places selected test files in variant GoFiles.
 // A dependency's TestGoFiles metadata alone does not mean it was compiled.
 const used=revision>=9?[groups[0],groups[3],...(groups[0].includes('_test.go')?[groups[4],groups[5]]:[]),...(pkg==='clawreef/internal/systembackupread'?[groups[1],groups[2],groups[4],groups[5]]:[])]:groups;
 for(const file of used.flatMap(x=>x.split(',')).filter(Boolean)){
  const absolute=path.resolve(dir,file),relative=path.relative(sourceRoot,absolute).replaceAll('\\','/');
  if(relative.startsWith('../')||path.isAbsolute(relative))continue; // generated Go test main in owned cache
  assert.ok(manifest.files.some(x=>x.path===relative),'unfrozen Go/embedded dependency '+relative);
  paths.add(relative);
 }
}
assert.ok(paths.size>100);assert.equal([...packages].some(x=>x.includes('systembackupbootstrapsecurity')),false);
assert.equal([...packages].some(x=>x.includes('/cmd/system-backup-bootstrap')),false);
const ownedGo=new Set(['backend/internal/systembackupevidence/download_gc_freeze_mysql_test.go',...(revision>=5?['backend/internal/systembackupevidence/download_output_deadline_a_test.go']:[])]);
const pins=[...paths].toSorted().map(p=>{
 const expected=manifest.files.find(x=>x.path===p);
 if(!ownedGo.has(p))assert.equal(sha(read(p)),expected.sha256,'concurrent compiled dependency '+p);
 return expected;
});
const originalObservation=json('docs/evidence/d-gc-freeze-probe-concurrent-20261021.json');
const refreshedBase=revision>=4?json('docs/evidence/d-gc-freeze-probe-base-v4-20261021.json'):null;
const observation=revision>=4?{changes:refreshedBase.refreshed_unowned_paths.map(p=>({path:p,state:'refreshed_into_validated_context',sha256:refreshedBase.files.find(x=>x.path===p).sha256}))}:json(revision===3?'docs/evidence/d-gc-freeze-probe-concurrent-final-20261021.json':'docs/evidence/d-gc-freeze-probe-concurrent-20261021.json');
if(revision<4){for(const change of observation.changes)assert.ok(originalObservation.changes.some(x=>x.path===change.path),'unreviewed new concurrent input '+change.path);for(const change of observation.changes)assert.equal(paths.has(change.path),false,'observed change entered probe closure');}
const report={kind:'d_gc_freeze_concurrent_build_scope_review',source_sha256:manifest.source_sha256,dependency_listing:{path:listing+'.txt',sha256:sha(read(listing+'.txt'))},project_packages:[...packages].toSorted(),project_go_and_embed_files:pins.length,files:pins,observed_changes:observation.changes,observed_changes_in_compiled_or_embedded_closure:observation.changes.filter(x=>paths.has(x.path)).length,unowned_compiled_or_embedded_files_match_current_root:true,manual_runtime_read_review:revision>=4?'Refreshed current live inputs into the latest frozen context. Selected ordinary packages are security/evidence; the migration runner is compiled separately. Independent server/bootstrap commands and deployment scripts are not claimed fully tested.':'Observed bootstrap command/RBAC package is not referenced from other backend source or the selected wrappers; the added Node proxy test is not selected by these gates. This is a scope review, not validation of those independent changes.',current_whole_tree_tested:false,concurrent_changes_preserved:true,actual_mysql:false,production_approved:false};
const out=`docs/evidence/d-gc-freeze-probe-concurrent-scope-20261021${revision>=3?'-r'+revision:''}.json`;
if(process.argv.includes('--check')){
 const prior=json(out);assert.deepEqual(prior,report);
 console.log('PASS freeze dependency closure unchanged; independent bootstrap/RBAC/proxy work remains outside acceptance');
}else{fs.writeFileSync(path.join(root,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({packages:packages.size,project_go_and_embed_files:pins.length,outside_changes:observation.changes.length}));}
