import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {deriveOwnerPreparationInventory} from './a-owner-preparation-inventory-20261022.mjs';
import {frozenMigrationCatalog} from './a-download-owners-actual-review-20261020.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const pin=f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};};
const stem='docs/evidence/a-owner-current-full-local-20261023-093734',sourcePath=stem+'-source.json',source=json(sourcePath);
const prior='docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl';
assert.equal(sha(read(prior)),'990aae2b00cf723d7c520d28843d667909f414f6872f196104faafc6db2f9c67');
const inventory=deriveOwnerPreparationInventory({logBytes:read(stem+'.txt'),sourceBytes:read(sourcePath),priorNativeEventsBytes:read(prior)});
const oldPath='docs/evidence/a-owner-local-20261023-085715-inventory.json',old=json(oldPath);
const newLeaves=['stale_sql_after_provider_wait','fresh_sql_after_provider_wait','stale_capacity_after_provider_wait'].map(n=>'TestDownloadRuntimeAdmittedHTTPWithAtomicSQLSTSAndTransit/'+n);
for(const p of inventory.packages){
  const previous=old.packages.find(v=>v.package===p.package);assert.ok(previous);
  assert.ok(previous.tests.every(n=>p.tests.includes(n)));
  const added=p.tests.filter(n=>!previous.tests.includes(n)).sort();
  assert.deepEqual(added,p.package.endsWith('/systembackupevidence')?[...newLeaves].sort():[]);
}
const main=inventory.packages.reduce((n,p)=>n+p.roots,0),all=inventory.packages.reduce((n,p)=>n+p.pass_events,0);
assert.equal(main,632);assert.equal(all,5105);
const log=read(stem+'.txt').toString('utf8');assert.match(log,/a_owner_full_local_exit=0/);assert.match(log,/End time: 20261023095549/);
for(const f of ['backend/internal/systembackupevidence/download_output_deadline_a_test.go','backend/internal/systembackupevidence/download_runtime_test.go','backend/internal/systembackupevidence/download_result_test.go'])assert.deepEqual(pin(f),source.files.find(p=>p.path===f));
const library=read('docs/evidence/a-download-owners-actual-review-20261020.mjs').toString('utf8');
const marker='export function loadReviewedOwnerBaseline';assert.equal(library.split(marker).length,2);
// Inventory parsing uses only exports and helpers before the loader. Later
// additions to the loader's approved metadata do not rewrite parser history.
const parser=Buffer.from(library.slice(0,library.indexOf(marker)));
const inventoryPath='docs/evidence/a-owner-current-full-local-20261023-093734-inventory.json',ib=Buffer.from(JSON.stringify(inventory,null,2)+'\n');
const result={kind:'a_owner_current_full_local_preparation_acceptance.v1',status:'complete_frozen_owner_profile_accepted_ordinary_worktree_delta_requires_separate_review',date:'2026-10-23',source:sourcePath,source_manifest_sha256:sha(read(sourcePath)),source_sha256:source.source_sha256,source_files:source.files.length,events:inventoryPath,events_sha256:sha(ib),events_origin:inventory.origin,owner_baseline:{main,all},prior_native_checks_preserved:5019,prior_complete_checks_preserved:5102,new_runtime_cases:newLeaves,catalog:frozenMigrationCatalog(source),seed_checks_each_location:13,Linux_probe_and_migration_built:true,frozen_postcheck:true,outer_owner_independently_absent:true,actual_SQL:false,dependencies_installed:false,production_approved:false,current_whole_worktree_verified:false,parser_dependency_prefix:{path:'docs/evidence/a-download-owners-actual-review-20261020.mjs',sha256:sha(parser),bytes_base64:parser.toString('base64')},reviewer_inputs:[stem+'.txt',sourcePath,oldPath,prior,'docs/evidence/a-owner-current-full-review-20261023.mjs','docs/evidence/a-owner-preparation-inventory-20261022.mjs'].map(pin)};
const output='docs/evidence/a-owner-current-full-accepted-20261023.json';
if(process.argv.includes('--write')){assert.equal(fs.existsSync(path.join(root,output)),false);assert.equal(fs.existsSync(path.join(root,inventoryPath)),false);fs.writeFileSync(path.join(root,inventoryPath),ib,{flag:'wx'});fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(inventoryPath),inventory);assert.deepEqual(json(output),result);}
console.log('A_CURRENT_FULL_ACCEPTED roots=632 checks=5105 prior=5102 actual_SQL=no');
