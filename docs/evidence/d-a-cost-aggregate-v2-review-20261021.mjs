import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../..');
const evidence=path.join(root,'docs/evidence');
const owner=path.join(root,'.tmp-d-index-cache-16ddf637115c4eaaa2771a7ea355e096');
const source=path.join(owner,'source');
const name='d-a-cost-aggregate-v2-preparation-20261021.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p);
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const e=p=>path.join(evidence,p);
const artifact=p=>({path:'docs/evidence/'+p,sha256:sha(read(e(p))),bytes:fs.statSync(e(p)).size});
const check=process.argv.includes('--check');
const attempt=check?json(e(name)).validation.stages.find(x=>x.stage==='full').attempt:Number(process.argv.find(x=>x.startsWith('--attempt='))?.split('=')[1]??1);
assert.ok(Number.isInteger(attempt)&&attempt>0);
const originalBase=json(e('d-a-cost-aggregate-v2-base-20261021.json'));
const base=attempt===1?originalBase:json(e('d-a-cost-aggregate-v3-base-20261021.json'));
const draftPath='d-a-cost-aggregate-unverified-draft-20261021.json';
assert.equal(sha(read(e(draftPath))),'fbc4768c4b1118d07af1ae70c0c23e308e4fb2299ea426ba706c79d85653f413');
const draft=json(e(draftPath));
const owned=[...draft.changes.map(x=>x.path),'backend/internal/systembackupbusinessa/cost_aggregate_test.go','scripts/system-backup-contract-artifacts.test.mjs'].sort();
assert.equal(new Set(owned).size,14);
const main=json(e('d-a-cost-aggregate-v2-20261021-r'+attempt+'-full-source.json'));
const before=new Map(base.files.map(x=>[x.path,x]));
const after=new Map(main.files.map(x=>[x.path,x]));
assert.equal(main.files.length,base.files.length+2);
for(const p of base.files)if(!owned.includes(p.path))assert.equal(after.get(p.path)?.sha256,p.sha256,'unowned change: '+p.path);
for(const p of main.files)assert.ok(before.has(p.path)||owned.includes(p.path),'unexpected source addition');
const changes=owned.map(p=>({path:p,before_sha256:before.get(p)?.sha256??null,after_sha256:after.get(p).sha256,bytes:after.get(p).size}));
const beforeName='d-a-cost-aggregate-v2-before-20261021.json';
const beforeBytes=json(e(beforeName));assert.equal(beforeBytes.base_source_sha256,originalBase.source_sha256);
assert.deepEqual(beforeBytes.changes.map(x=>x.path),owned);
for(const p of beforeBytes.changes){assert.equal(p.before_sha256,before.get(p.path)?.sha256??null);if(p.before_sha256)assert.equal(sha(Buffer.from(p.content_base64,'base64')),p.before_sha256);else assert.equal(p.content_base64,null)}
const stages=check?json(e(name)).validation.stages.map(x=>({stage:x.stage,attempt:x.attempt})):['full','node','tagged'].map(stage=>({stage,attempt}));
const runs=[];
const controlName='d-a-cost-aggregate-v2-controls-20261021'+(attempt===1?'':'-r'+attempt);
const controls=json(e(controlName+'.json'));
assert.equal(controls.success,true);assert.equal(controls.source_postcheck,true);assert.equal(controls.source_sha256,main.source_sha256);assert.equal(controls.strict_still_blocked,true);
assert.deepEqual(controls.steps.map(x=>[x.name,x.exit,x.expected]),[['inventory',0,0],['contract',0,0],['strict',1,1]]);
const controlArtifacts=[artifact(controlName+'.json')];
for(const s of controls.steps)for(const stream of ['stdout','stderr']){const a=artifact(controlName+'-'+s.name+'.'+stream);assert.equal(a.sha256,s[stream+'_sha256']);controlArtifacts.push(a)}
for(const {stage,attempt} of stages){
 const prefix='d-a-cost-aggregate-v2-20261021-r'+attempt+'-'+stage;
 const native=json(e(prefix+'-native.json'));
 assert.equal(native.exit,0,prefix+' failed');assert.equal(native.source_postcheck,true);
 assert.equal(native.source_sha256,main.source_sha256);assert.equal(native.dependencies_installed,false);assert.equal(native.remote,false);
 assert.equal(json(e(prefix+'-source.json')).source_sha256,main.source_sha256);
 if(stage!=='node')assert.equal(native.default_vet,true);
 const run={stage,attempt,native:artifact(prefix+'-native.json'),source:artifact(prefix+'-source.json'),stderr:artifact(prefix+'-stderr.txt')};
 assert.equal(run.stderr.bytes,0,prefix+' stderr must be assessed');
 if(stage==='full'||stage==='tagged'){
  const data=read(e(prefix+'.jsonl')).toString('utf8');assert.ok(data.endsWith('\n'));
  const rows=data.trim().split(/\r?\n/).map(x=>JSON.parse(x));
  const tests=rows.filter(x=>x.Action==='run'&&x.Test),passed=rows.filter(x=>x.Action==='pass'&&x.Test);
  assert.equal(rows.filter(x=>x.Action==='fail'||x.Action==='skip').length,0);
  assert.equal(tests.length,passed.length);assert.ok(tests.length>0);
  const packages=rows.filter(x=>x.Action==='pass'&&!x.Test).map(x=>x.Package);
  assert.equal(packages.length,stage==='full'?2:1);
  if(stage==='tagged')assert.deepEqual(tests.filter(x=>!x.Test.includes('/')).map(x=>x.Test),['TestABusinessRestoreMySQLSeed']);
  run.main_tests=tests.filter(x=>!x.Test.includes('/')).length;run.all_tests=tests.length;run.packages=packages;run.log=artifact(prefix+'.jsonl');
  if(stage==='tagged'){
   run.dependencies=artifact(prefix+'-deps.txt');run.dependencies_stderr=artifact(prefix+'-deps-stderr.txt');assert.equal(run.dependencies_stderr.bytes,0);
   const prefixPath=(source+path.sep).replaceAll('\\','/').toLowerCase();
   run.local_dependency_directories=[...new Set(read(e(prefix+'-deps.txt')).toString('utf8').split(/\r?\n/).map(x=>x.slice(x.indexOf('|')+1).replaceAll('\\','/')).filter(x=>x.toLowerCase().startsWith(prefixPath)).map(x=>x.slice(prefixPath.length)))].sort();
   for(const dir of ['backend/internal/systembackupbusinessa','backend/internal/systembackupsecurity','backend/internal/db'])assert.ok(run.local_dependency_directories.includes(dir),'missing local dependency '+dir);
  }
 }else if(stage==='node'){
  const data=read(e(prefix+'.tap')).toString('utf8');const stat=k=>Number(data.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]);
  assert.equal(stat('tests'),79);assert.equal(stat('pass'),79);assert.equal(stat('fail'),0);assert.equal(stat('skipped'),0);run.tests=79;run.log=artifact(prefix+'.tap');
 }else run.stdout=artifact(prefix+'.stdout');
 runs.push(run);
}
if(check){
 const receipt=json(e(name));assert.equal(receipt.source_sha256,main.source_sha256);assert.deepEqual(receipt.changes,changes);assert.deepEqual(receipt.validation.stages,runs);assert.deepEqual(receipt.validation.controls,controlArtifacts);assert.deepEqual(receipt.before_bytes,artifact(beforeName));
 assert.equal(receipt.status,'locally_validated_published_cleaned_actual_mysql_pending');
 const publication=receipt.publication;
 assert.equal(publication.owned_files,14);assert.equal(publication.module_and_compiled_dependency_scope_checked,true);
 const contextPath=path.join(root,publication.context);assert.equal(sha(read(contextPath)),publication.context_sha256);
 const context=json(contextPath);assert.equal(context.frozen_source_sha256,main.source_sha256);assert.equal(context.source_sha256,publication.published_source_sha256);
 assert.equal(context.context_is_observation_not_test_snapshot,true);
 for(const p of changes)assert.equal(context.files.find(x=>x.path===p.path)?.sha256,p.after_sha256);
 const assessmentPath=path.join(root,publication.concurrent_review_path);assert.equal(sha(read(assessmentPath)),publication.concurrent_review_sha256);
 const assessment=json(assessmentPath);assert.equal(assessment.frozen_source_sha256,main.source_sha256);assert.equal(assessment.live_tools_accepted,false);
 assert.deepEqual(assessment.frontend_read_scope,['frontend/src/types/systemBackupContract.ts']);
 for(const p of changes)assert.equal(sha(read(path.join(root,p.path))),p.after_sha256,'published source drift '+p.path);
 assert.equal(fs.existsSync(owner),false,'owned build artifacts remain');
 const cleanup=json(e('d-a-cost-aggregate-v2-cleanup-20261021.json'));assert.equal(cleanup.removed,true);
 assert.equal(cleanup.owner,owner);assert.equal(cleanup.dependencies_installed,false);
 console.log(JSON.stringify({status:receipt.status,owned_files:changes.length,source_sha256:main.source_sha256,stages:runs.map(x=>({stage:x.stage,main:x.main_tests,all:x.all_tests,tests:x.tests}))}));
}else{
 assert.equal(fs.existsSync(e(name)),false,'receipt exists');
 assert.equal(read(path.join(owner,'owner.txt')).toString(),path.basename(owner));
 for(const p of changes)assert.equal(sha(read(path.join(source,p.path))),p.after_sha256);
 const schema=json(path.join(source,'contracts/system-backup/v12/verifier-contract.schema.json'));
 const priorSchema=JSON.parse(Buffer.from(beforeBytes.changes.find(x=>x.path==='contracts/system-backup/v12/verifier-contract.schema.json').content_base64,'base64'));
 const normalizedSchema=structuredClone(schema);
 for(const [def,id,count,key] of [['AAIGatewayBackupCheck','ai_gateway.cost_aggregates',12,'ai_gateway_backup_validate'],['AAIGatewayRestoreCheck','ai_gateway.restore_cost_aggregates',14,'ai_gateway_restore_validate']]){
  const choices=schema.$defs[def].allOf[1].oneOf;const last=choices.at(-1).properties;
  assert.deepEqual(last.id.enum,[id]);assert.equal(last.expected.$ref,'#/$defs/ABusinessDigestValue');assert.equal(last.actual.$ref,'#/$defs/ABusinessDigestValue');
  assert.equal(choices.flatMap(x=>x.properties.id.enum).length,count);assert.equal(schema['x-owner-check-registries'].A[key].required_check_count,count);
  assert.match(schema['x-owner-check-registries'].A[key].required_proof,/cost aggregates/);
  normalizedSchema.$defs[def].allOf[1].oneOf.pop();
  normalizedSchema['x-owner-check-registries'].A[key].required_check_count=priorSchema['x-owner-check-registries'].A[key].required_check_count;
  normalizedSchema['x-owner-check-registries'].A[key].required_proof=priorSchema['x-owner-check-registries'].A[key].required_proof;
 }
 assert.deepEqual(normalizedSchema,priorSchema,'unrelated verifier contract edits');
 assert.equal(schema.$defs.ABusinessDigestValue.additionalProperties,false);assert.deepEqual(schema.$defs.ABusinessDigestValue.required,['hash']);
 assert.equal(schema['x-owner-check-registries'].A.status,'draft');
 const receipt={kind:'d_a_cost_aggregate_preparation',version:1,status:'locally_validated_pending_guarded_publication',base_source_sha256:base.source_sha256,original_base_source_sha256:originalBase.source_sha256,source_sha256:main.source_sha256,source_files:main.files.length,changes,
  validation:{stages:runs,controls:controlArtifacts,tagged_probe_compiled_and_offline_seed_executed:true,linux_probe_build:false},
  original_unverified_draft:artifact(draftPath),before_bytes:artifact(beforeName),node_extra_inputs:artifact('d-a-cost-aggregate-v'+(attempt===1?'2':'3')+'-extra-inputs-20261021.json'),
  concurrent_refresh:attempt===1?null:artifact('d-a-cost-aggregate-v2-concurrent-refresh-20261021.json'),
  actual_mysql:'not_executed',dependencies_installed:false,remote:false,production_approval:false,
  pending:['B authenticates new complete source/dump snapshot and target proof','actual MySQL cost-drift and NULL probes','representative workload query plan and duration','registry cross-review and global freeze','original six D scopes']};
 fs.writeFileSync(e(name),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,source:main.source_sha256,changes:changes.length,stages:runs.map(x=>({stage:x.stage,main:x.main_tests,all:x.all_tests,tests:x.tests}))}));
}
