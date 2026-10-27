// Offline review of the two template catalog repairs and actual prerequisites.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {emptyTemplate,renderDeployment} from '../../scripts/system-backup-d-deployment.mjs';
import {emptyDownloadTemplate,renderDownloadDeployment} from '../../scripts/system-backup-a-download-deployment.mjs';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(import.meta.dirname,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(raw(p));
const pin=p=>({path:p,bytes:raw(p).length,sha256:sha(raw(p))});
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,96);assert.equal(catalog.hash,'0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe');
const oldCatalog='2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237';
const beforePath='docs/evidence/a-field-deployment-template-before-20261022.jsonl';
const before=raw(beforePath).toString('utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l));assert.equal(before.length,2);
const records=[
  ['deployments/k8s/system-backup-registration.template.json',emptyTemplate(),'migration_catalog_sha256',renderDeployment],
  ['deployments/k8s/system-backup-download-k8s.template.json',emptyDownloadTemplate(),'registration.migration_catalog_sha256',renderDownloadDeployment]
].map(([p,generated,field,render],i)=>{
  const bytes=raw(p),text=bytes.toString('utf8'),v=json(p);
  assert.deepEqual(v,generated);assert.throws(()=>render(v));assert.equal((v.registration??v).image,'');
  assert.equal(before[i].path,p);assert.deepEqual(before[i].differences,[{field,template:oldCatalog,generated:catalog.hash}]);
  assert.equal(text.split(catalog.hash).length,2);
  const reconstructed=text.replace(catalog.hash,oldCatalog);
  assert.equal(sha(Buffer.from(reconstructed)),before[i].sha256,'repair must only change the catalog bytes');
  return {...pin(p),changed_field:field,before_sha256:before[i].sha256,only_catalog_bytes_changed:true,empty_input_still_rejected:true};
});
const logPath='docs/evidence/a-field-deployment-template-tests-20261022-terminal.txt',log=raw(logPath).toString('utf8');
assert.match(log,/tests 15\r?\n/);assert.match(log,/pass 15\r?\n/);assert.match(log,/fail 0\r?\n/);assert.match(log,/skipped 0\r?\n/);
assert.equal(log.split(/\r?\n/).filter(l=>l.startsWith('✔ ')).length,15);
assert.match(log,/CLI writes UTF-8 templates and manifests exclusively/);
assert.deepEqual(fs.readdirSync(root).filter(p=>/^\.tmp-a-download-render-/.test(p)),[]);
const handoffPath='docs/evidence/a-bootstrap-resource-handoff-review-20261022.json',handoff=json(handoffPath);
const sourcePaths=['backend/cmd/system-backup-bootstrap/main.go','backend/internal/systembackupsecurity/config_bootstrap_rules.go','backend/internal/systembackupsecurity/bootstrap_deployment.go','backend/internal/systembackupsecurity/bootstrap_admission.go','docs/system-backup-a-bootstrap-resource-handoff-20261022.md'];
for(const p of sourcePaths)assert.equal(pin(p).sha256,handoff.sources.find(s=>s.path===p).sha256);
const main=raw(sourcePaths[0]).toString('utf8'),rules=raw(sourcePaths[1]).toString('utf8');
const stringList=name=>{const body=rules.match(new RegExp('var '+name+' = \\[\\]string\\{([^}]*)\\}'))?.[1];assert.ok(body);return JSON.parse('['+body+']');};
const registryKinds=stringList('bootstrapRegistryKinds'),referencePurposes=stringList('bootstrapReferencePurposes');
assert.equal(registryKinds.length,9);assert.equal(referencePurposes.length,20);
const linkedBody=main.slice(main.indexOf('func linkedOwnerAdapters()'),main.indexOf('\nfunc main()'));
assert.ok(!/\b(?:References|CrossResources)\s*:/.test(linkedBody));
const linked=[...linkedBody.matchAll(/"([a-z_]+)"\s*:/g)].map(m=>'registry:'+m[1]).sort();
assert.deepEqual(linked,[...handoff.linked_adapters].sort());assert.equal(linked.length,3);
const missing=[...registryKinds.map(v=>'registry:'+v).filter(v=>!linked.includes(v)),...referencePurposes.map(v=>'reference:'+v),'cross_resources'];
assert.deepEqual([...missing].sort(),[...handoff.missing_adapters].sort());assert.equal(missing.length,27);
assert.deepEqual(handoff.approved_reviewers,[]);
const capacityCandidate='deployments/k8s/system-backup-capacity.zh-fix16.candidate.json',candidate=json(capacityCandidate);
assert.notEqual(candidate.migration_catalog_sha256,catalog.hash);assert.equal(candidate.collector_db_user,'');assert.equal(candidate.credentials_secret,'');
const record={kind:'a_field_deployment_template_preparation',status:'TEMPLATE_CATALOG_REPAIRED_RESOURCE_ADMISSION_AND_FIELD_EVIDENCE_PENDING',
  catalog,templates:records,comparison_before:pin(beforePath),tests:{command:'node --test scripts/system-backup-d-deployment.test.mjs scripts/system-backup-a-download-deployment.test.mjs',exit:0,checks:15,pass:15,fail:0,skip:0,terminal:pin(logPath),synthetic_transport_only:true,owned_cli_directories_independently_absent:true},
  retained_earlier_failures:[{tool_result_chunk:'7ed360',stage:'readonly comparison command before mutation',exit:1,reason:'used a non-existent export name; rerun with the actual emptyDownloadTemplate export; no templates mutated by the failed command'},
    {tool_result_chunk:'dd6b84',stage:'sandboxed node test runner',exit:1,reason:'spawn EPERM before either test-file body; same command then passed outside sandbox',actual_test_bodies_executed:false}],
  handoff_receipt:pin(handoffPath),relevant_handoff_source_subset_matches_current:sourcePaths.map(pin),linked_adapters:linked,missing_adapters:missing,
  missing_owner_adapter_count:27,missing_owner_adapters_closed_by_template_fix:0,
  historical_capacity_candidate:{...pin(capacityCandidate),modified:false,catalog_matches_current:false,collector_user_supplied:false,credential_reference_supplied:false,usable_as_actual_input:false},
  field_inventory_review:pin('docs/evidence/a-field-public-inventory-reviewed-20261022.json'),
  scope:'Only two empty-template catalog fields repaired. Original image, runtime/material/authority inputs and concrete owner admission implementations remain required.',
  local_generator_tests_passed:true,full_owner_source_baseline_registered:false,dependencies_installed:false,go_tests_or_builds_run:false,
  test_build_artifacts_created:false,test_cli_files_retained:false,kubernetes_or_sql_contacted:false,production_resources_created:false,production_approved:false,complete_field_acceptance:false,
  reviewer_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
const out=path.join(root,'docs/evidence/a-field-deployment-template-reviewed-20261022.json');
if(process.argv[2]==='--check')assert.deepEqual(JSON.parse(fs.readFileSync(out)),record);else{assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:record.status,repaired_template_fields:2,generator_tests:15,missing_bootstrap_adapters:27,production_approved:false}));
