// Compose existing complete, frozen package evidence. No Go/SSH/SQL execution.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {workspace,raw,json,decode,sha256,manifest,changed,exact,inventory} from './a-frozen-validation-utils-20261021.mjs';
import {localStages,canonicalLocalName} from './a-download-owners-actual-review-20261020.mjs';
const sourcePath='docs/evidence/a-download-gc-role-mysql-remote-source-20261021-164523-7cba478a.json',source=manifest(sourcePath);
const previousPath='docs/evidence/a-owner-dependency-baseline-accepted-20261021.json',previous=json(previousPath),old=manifest(previous.source);
assert.equal(previous.status,'accepted_unchanged_owner_dependency_inputs_only');assert.equal(sha256(raw(previous.events)),previous.events_sha256);
const dPath='docs/evidence/d-a-cost-aggregate-v2-preparation-20261021.json',d=json(dPath);assert.equal(d.status,'locally_validated_published_cleaned_actual_mysql_pending');assert.equal(d.dependencies_installed,false);assert.equal(d.remote,false);assert.equal(d.production_approval,false);
function dManifest(p){const s=json(p);assert.equal(s.kind,'d_a_cost_aggregate_candidate');assert.equal(s.dependencies_installed,false);assert.equal(s.production_approved,false);assert.equal(new Set(s.files.map(f=>f.path)).size,s.files.length);for(const f of s.files){assert.match(f.path,/^(backend|contracts|scripts|docs)\//);assert.ok(!f.path.includes('\\')&&!f.path.split('/').some(p=>['','.','..'].includes(p)));assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(f.size)&&f.size>=0);}assert.equal(sha256(s.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n'),s.source_sha256);return s;}
const full=d.validation.stages.find(s=>s.stage==='full'),dSource=dManifest(full.source.path);
assert.equal(dSource.source_sha256,d.source_sha256);
const backend=s=>s.files.filter(f=>/^(backend|contracts)\//.test(f.path)).map(f=>`${f.path}\0${f.size}\0${f.sha256}`);
exact(backend(source),backend(dSource));
const differences=changed(source,old).filter(p=>/^(backend|contracts)\//.test(p));
exact(differences,d.changes.filter(f=>/^(backend|contracts)\//.test(f.path)).map(f=>f.path));assert.equal(differences.length,13);
assert.ok(old.files.filter(f=>/^(backend|contracts)\//.test(f.path)).every(f=>source.files.some(v=>v.path===f.path)));
for(const p of differences){const f=source.files.find(f=>f.path===p),v=d.changes.find(f=>f.path===p);assert.equal(f.sha256,v.after_sha256);assert.equal(f.size,v.bytes);}
const stages=[];
for(const stage of d.validation.stages){
  for(const key of ['native','source','stderr','log',...(stage.dependencies?['dependencies','dependencies_stderr']:[])]){
    const f=stage[key];assert.equal(sha256(raw(f.path)),f.sha256);assert.equal(raw(f.path).length,f.bytes);
  }
  const n=json(stage.native.path);assert.equal(n.exit,0);assert.equal(n.source_postcheck,true);assert.equal(n.source_sha256,dSource.source_sha256);assert.equal(n.dependencies_installed,false);assert.equal(n.remote,false);
  assert.equal(raw(stage.stderr.path).length,0);
  exact(backend(dManifest(stage.source.path)),backend(source));
  if(stage.stage==='node'){
    const tap=decode(raw(stage.log.path));assert.match(tap,/# tests 79\n/);assert.match(tap,/# pass 79\n/);assert.match(tap,/# fail 0\n/);assert.match(tap,/# skipped 0\n/);assert.doesNotMatch(tap,/^not ok /m);
    stages.push({stage:'node',tests:79});
  }else{
    const passed=inventory(stage.log.path,stage.packages);assert.equal(passed.length,stage.all_tests);assert.equal(passed.filter(e=>!e.Test.includes('/')).length,stage.main_tests);
    if(stage.stage==='full'){
      assert.equal(n.default_vet,true);assert.equal(passed.length,2398);assert.equal(stage.main_tests,341);
      const prior=inventory('docs/evidence/d-a-business-review-20261021-r1-full.jsonl',stage.packages),newNames=new Set(passed.map(e=>e.Package+'\0'+e.Test));
      assert.equal(prior.length,2346);assert.ok(prior.every(e=>newNames.has(e.Package+'\0'+e.Test)));
    }
    stages.push({stage:stage.stage,main:stage.main_tests,all:passed.length});
  }
}
for(const f of d.validation.controls){assert.equal(sha256(raw(f.path)),f.sha256);assert.equal(raw(f.path).length,f.bytes);}
const controls=json(d.validation.controls[0].path);assert.equal(controls.success,true);assert.equal(controls.source_postcheck,true);assert.equal(controls.strict_still_blocked,true);exact(controls.steps.map(s=>s.name+':'+s.exit),['inventory:0','contract:0','strict:1']);
assert.equal(sha256(raw(d.cleanup.path)),d.cleanup.sha256);const cleaned=json(d.cleanup.path);assert.equal(cleaned.removed,true);assert.equal(path.dirname(path.resolve(cleaned.owner)).toLowerCase(),workspace.toLowerCase());assert.match(path.basename(cleaned.owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(cleaned.owner),false);
const ownerEvents=decode(raw(previous.events)).trim().split('\n').map(JSON.parse),local=localStages(decode(raw('docs/evidence/a-download-gc-role-mysql-remote-20261021-164523-7cba478a.txt')).split('RUN namespace=')[0]);
for(const stage of local.slice(0,2))exact(stage.names.map(canonicalLocalName),ownerEvents.filter(e=>e.Package===stage.package&&e.Test&&e.Action==='pass').map(e=>e.Test));
assert.equal(local[0].names.length+local[1].names.length,5019);
const record={kind:'a_owner_cost_context_composed_baseline',status:'accepted_frozen_cost_context_owner_inventory_only',source:sourcePath,source_manifest_sha256:sha256(raw(sourcePath)),source_sha256:source.source_sha256,source_files:source.files.length,events:previous.events,events_sha256:previous.events_sha256,owner_baseline:{main:620,all:5019},previous:previousPath,previous_sha256:sha256(raw(previousPath)),d_preparation:dPath,d_preparation_sha256:sha256(raw(dPath)),changed_inputs:differences,d_stages:stages,prior_business_security_checks_retained:2346,new_business_security_checks:52,strict_exit_one_retained:true,resource_full_package_failures_remain_unapproved:true,d_owned_directory_independently_absent:cleaned.owner,catalog:previous.catalog,actual_role_acceptance:'separate_validation_required',actual_cost_mysql_verified:false,formal_contract_approved:false,current_whole_worktree_verified:false,tests_repeated:false,actual_sql:false,dependencies_installed:false,production_approved:false,reviewer_sha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url)))};
const output='docs/evidence/a-owner-cost-context-baseline-accepted-20261021.json';
if(process.argv[2]==='--check')assert.deepEqual(json(output),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(path.join(workspace,output),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,owner_checks:5019,business_security_checks:2398,node_checks:79,actual_cost_mysql_verified:false}));
