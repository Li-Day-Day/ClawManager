import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseGoList} from './a2-reference-capability-go-scope-20261026.mjs';
import {checkPins,sourceDigest} from './a-owner-pre-thin-target-20261026.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=name=>fs.readFileSync(path.join(root,name));
const json=name=>JSON.parse(read(name).toString('utf8').replace(/^\uFEFF/,''));
const pin=name=>{const b=read(name);return{path:name,size:b.length,sha256:sha(b)}};
const sort=a=>[...a].sort();
const nativeName='docs/evidence/d-api-native-f0e09233447a4d9a86ce614b31fd8431.json';
const scopePrefix='docs/evidence/a2-reference-capability-native-9c2f727f86c548a38792cebd423489e7';
const moduleRoots=['clawreef/internal/systembackupapi','clawreef/cmd/server'];
const apiRoots=['TestSQLTaskSubmissionOwnsCommitRollbackAndCapabilityLifetime',
  'TestTaskSQLCapabilityRejectsTransactionControlAndLatchesFailure','TestTaskHTTPCreateReplayWorkerAndDetailModel',
  'TestTaskHTTPRejectsBeforeDispatchAndNeverLeaksErrors','TestTaskHTTPMappingsMatchFrozenPolicy'];
export function reviewVerboseGo(text,pkg,requiredRoots) {
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  assert.ok(!lines.some(s=>/--- (?:FAIL|SKIP):|^FAIL(?:\s|$)|panic:|fatal error:|\[build failed\]|\[no test files\]/.test(s)),'Failed/skipped native stage');
  const runs=lines.flatMap(s=>s.match(/^=== RUN\s+(\S+)$/)?.[1]??[]);
  const passes=lines.flatMap(s=>s.match(/^\s*--- PASS: (\S+) \([0-9.]+s\)$/)?.[1]??[]);
  assert.ok(runs.length>0);assert.equal(new Set(runs).size,runs.length);assert.equal(new Set(passes).size,passes.length);
  assert.deepEqual(sort(runs),sort(passes),'Native run/pass inventory differs');
  for(const name of runs) assert.ok(lines.findIndex(s=>s.match(/^=== RUN\s+(\S+)$/)?.[1]===name)<
    lines.findIndex(s=>s.match(/^\s*--- PASS: (\S+) \([0-9.]+s\)$/)?.[1]===name),'Pass before run');
  assert.equal(lines.filter(s=>s==='PASS').length,1);
  assert.match(lines.at(-1),new RegExp('^ok\\s+'+pkg.replaceAll('/','\\/')+'\\s+[0-9.]+s$'),'Wrong native package completion');
  const roots=passes.filter(s=>!s.includes('/'));
  if(requiredRoots)assert.deepEqual(sort(roots),sort(requiredRoots),'Wrong root test scope');
  return{package:pkg,roots:sort(roots),passed_events:passes.length};
}
export function selectedProjectFiles(rows) {
  const byName=new Map(rows.map(row=>[row.ImportPath,row]));
  assert.equal(byName.size,rows.length,'Duplicate Go-list package');
  const todo=rows.filter(r=>moduleRoots.includes(r.ImportPath) || moduleRoots.includes(r.ForTest)).map(r=>r.ImportPath);
  for(const name of moduleRoots)assert.ok(byName.has(name));
  const visited=new Set(),files=new Set();
  while(todo.length){
    const name=todo.pop();if(visited.has(name))continue;visited.add(name);
    const row=byName.get(name);assert.ok(row,'Missing Go-list dependency '+name);
    assert.equal(row.Error,undefined);assert.ok(!row.Incomplete && !row.DepsErrors?.length);
    for(const child of row.Imports??[])if(!visited.has(child))todo.push(child);
    if(!name.startsWith('clawreef/') || name.endsWith('.test'))continue;
    assert.ok(row.Module?.Dir && row.Dir);assert.equal(row.Module.Path,'clawreef');assert.equal(row.Module.Main,true);
    const relative=path.win32.relative(row.Module.Dir,row.Dir).replaceAll('\\','/');
    assert.ok(!relative.startsWith('..')&&!path.win32.isAbsolute(relative));
    const fields=['GoFiles','CgoFiles','CFiles','HFiles','SFiles','SysoFiles','EmbedFiles'];
    if(moduleRoots.includes(row.ImportPath))fields.push('TestGoFiles','XTestGoFiles','TestEmbedFiles','XTestEmbedFiles');
    for(const field of fields)for(const file of row[field]??[]){
      assert.ok(!path.win32.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'));
      files.add(['backend',relative,file].filter(Boolean).join('/').replaceAll('\\','/'));
    }
  }
  return sort(files);
}
function checkPackageFileSets(files, frozen, graphFrozen) {
  const directories=new Set(files.filter(name=>name.endsWith('.go')).map(name=>path.posix.dirname(name)));
  for(const directory of directories){
    const inDirectory=name=>path.posix.dirname(name)===directory && name.endsWith('.go');
    const current=fs.readdirSync(path.join(root,directory),{withFileTypes:true})
      .filter(item=>item.isFile()&&item.name.endsWith('.go')).map(item=>directory+'/'+item.name).sort();
    assert.deepEqual(current,sort([...frozen.keys()].filter(inDirectory)),'D native package file set differs '+directory);
    assert.deepEqual(current,sort([...graphFrozen.keys()].filter(inDirectory)),'Go-list package file set differs '+directory);
  }
}
function derive(){
  const native=json(nativeName),closeoutName='docs/evidence/d-api-readiness-closeout-20261026.json',closeout=json(closeoutName);
  assert.equal(native.kind,'d_api_local_validation.v1');assert.equal(native.status,'local_transport_and_composition_passed_real_chain_pending');
  assert.equal(native.scope,'all');assert.equal(native.dependencies_installed,false);assert.equal(native.remote_contacted,false);
  assert.equal(native.real_chain_run,false);assert.equal(native.frozen_source_unchanged,true);assert.equal(native.cleanup_verified,true);
  assert.equal(fs.existsSync(path.join(root,'.tmp-d-api-f0e09233447a4d9a86ce614b31fd8431')),false);
  assert.equal(closeout.kind,'d_api_readiness_closeout.v1');assert.equal(closeout.native.default_vet,true);
  const nativeDriver='scripts/system-backup-d-api-validation.ps1';
  assert.equal(pin(nativeDriver).sha256,closeout.source_files.find(p=>p.path===nativeDriver)?.sha256);
  const evidence=new Map(closeout.evidence_files.map(p=>[p.path,p]));
  for(const item of closeout.evidence_files)assert.equal(pin(item.path).sha256,item.sha256);
  const frozen=new Map(native.files.map(p=>[p.path,p]));assert.equal(frozen.size,native.files.length);
  const steps=[];
  for(const [stage,pkg,roots,count] of [['task-http',moduleRoots[0],apiRoots,5],
    ['server-composition',moduleRoots[1],null,4],['bootstrap-requirements','clawreef/cmd/system-backup-bootstrap',null,3]]){
    const step=native.steps.filter(s=>s.stage===stage);assert.equal(step.length,1);assert.equal(step[0].exit_code,0);
    const log='docs/evidence/'+step[0].log;assert.ok(evidence.has(log));
    const result=reviewVerboseGo(read(log).toString('utf8'),pkg,roots);assert.equal(result.roots.length,count);
    steps.push({stage,log:pin(log),...result});
  }
  const parity=json(scopePrefix+'.json');assert.equal(parity.kind,'a2_reference_capability_candidate_native.v1');
  assert.equal(parity.snapshot_unchanged,true);assert.equal(parity.cleanup,true);
  const graphFrozen=new Map(parity.files.map(p=>[p.path,p]));assert.equal(graphFrozen.size,parity.files.length);
  const graphReview=json(scopePrefix+'.scope.json');
  const selected=new Set(['backend/go.mod','backend/go.sum']),variants=[];
  for(const goos of ['windows','linux'])for(const tag of ['ordinary','systembackup_mysql']){
    const phase=goos+'.'+tag,step=parity.phases.filter(p=>p.phase===phase);assert.equal(step.length,1);
    assert.equal(step[0].goos,goos);assert.equal(step[0].exit,0);
    assert.deepEqual(step[0].arguments,['list','-deps','-test','-json',...(tag==='ordinary'?[]:['-tags','systembackup_mysql']),'./...']);
    const log=scopePrefix+'.'+phase+'.jsonl',rows=parseGoList(read(log).toString('utf8'));
    const captured=graphReview.captures.filter(c=>c.goos_label===goos&&c.tags_label===tag);assert.equal(captured.length,1);
    assert.equal(pin(log).sha256,captured[0].input.sha256);assert.equal(pin(log).size,captured[0].input.size);
    for(const name of selectedProjectFiles(rows))selected.add(name);
    assert.equal(read(scopePrefix+'.'+phase+'.stderr.txt').length,0);
    variants.push({goos,tags:tag==='ordinary'?'':'systembackup_mysql',command:['go',...step[0].arguments],root_packages:['./...'],exit_code:0,log:pin(log)});
  }
  // Closed contract bytes are runtime/test inputs beyond Go import metadata.
  for(const item of native.files.filter(p=>p.path.startsWith('contracts/system-backup/')))selected.add(item.path);
  checkPackageFileSets([...selected],frozen,graphFrozen);
  const sourceFiles=sort(selected).map(name=>{
    const current=pin(name);assert.equal(current.sha256,frozen.get(name)?.sha256,'Native D dependency differs from current '+name);
    assert.equal(current.sha256,graphFrozen.get(name)?.sha256,'Go-list dependency differs from current '+name);return current;
  });checkPins(sourceFiles);
  const closure={kind:'a_owner_pre_thin_dependency_closure_review.v1',status:'complete_exact_native_dependency_scope',
    profile:'api_d_task_server_cli',source_role:'target',source_files:sourceFiles,source_sha256:sourceDigest(sourceFiles),
    selected_test_roots:moduleRoots,variants,native_go_list_receipt:pin(scopePrefix+'.json'),native_go_list_scope:pin(scopePrefix+'.scope.json'),
    note:'Graph reuse is restricted to the API/server dependency file union whose every byte matches the successful D native snapshot; it does not accept failed parity as a whole or changed CLI/GC dependencies'};
  const leaf={kind:'a_owner_pre_thin_native_scope_proof.v1',status:'accepted_exact_scope_for_local_supplement',
    profile:'api_d_task_server_cli',source_role:'target',native_source_stability_verified:true,cleanup_verified:true,
    actual_sql:false,production_authorized:false,native_receipts:[pin(nativeName)],native_logs:steps.map(s=>s.log),
    native_driver:pin(nativeDriver),graph_parser:pin('docs/evidence/a2-reference-capability-go-scope-20261026.mjs'),
    review_validator:pin('docs/evidence/a-d-api-native-scope-review-20261027.mjs'),stages:steps,
    dependency_closure_review_path:'docs/evidence/a-d-api-dependency-closure-reviewed-20261027-r1.json',
    accepted_scope:['API complete five roots','server transport/composition four selected roots'],
    excluded_scope:['full server regression','CLI current changed dependency closure','Linux binary build','production TaskWriter/TaskDetails','real SQL/provider/executor','whole current baseline'],
    closeout:pin(closeoutName),current_baseline_ready:false,pre_thin_ready:false};
  return{closure,leaf};
}
function main(){
  const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
  const {closure,leaf}=derive();
  for(const [name,value] of [['a-d-api-dependency-closure-reviewed-20261027-r1.json',closure],['a-d-api-native-scope-reviewed-20261027-r1.json',leaf]]){
    const output='docs/evidence/'+name;
    if(mode==='--write')fs.writeFileSync(path.join(root,output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    else assert.deepEqual(json(output),value);
  }
  console.log(JSON.stringify({mode,dependency_files:closure.source_files.length,API_roots:leaf.stages[0].roots.length,server_selected_roots:4,pre_thin_ready:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
