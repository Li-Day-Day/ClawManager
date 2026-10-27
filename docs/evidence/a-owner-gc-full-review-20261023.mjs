// Accept only the original complete owner profile, after terminal success and
// exact cleanup. This does not accept actual SQL, human MFA or production use.
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
const stem='docs/evidence/a-owner-gc-full-local-20261023-111154';
const output='docs/evidence/a-owner-gc-full-accepted-20261023.json';
const inventoryPath=stem+'-inventory.json';
const prior='docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl';
const previous='docs/evidence/a-owner-current-full-local-20261023-093734-inventory.json';
assert.equal(sha(read(prior)),'990aae2b00cf723d7c520d28843d667909f414f6872f196104faafc6db2f9c67');
assert.equal(sha(read(previous)),'91915db1aa359370e67bfd5a7aa1cb3da9906f1ed2fed2cc6e7b5005700eadc4');
const source=json(stem+'-source.json'),log=read(stem+'.txt').toString('utf8');
assert.ok(/^a_owner_full_local_exit=0\s*$/m.test(log),'terminal success required');
assert.ok(/^End time: \d{14}\s*$/m.test(log),'closed transcript required');
const inventory=deriveOwnerPreparationInventory({logBytes:read(stem+'.txt'),sourceBytes:read(stem+'-source.json'),priorNativeEventsBytes:read(prior)});
const old=json(previous);
const additions=[];
for(const p of inventory.packages){
  const before=old.packages.find(v=>v.package===p.package);assert.ok(before);
  for(const name of before.tests)assert.ok(p.tests.includes(name),'previous test omitted: '+name);
  for(const name of p.tests.filter(n=>!before.tests.includes(n))){
    assert.equal(p.package,'clawreef/internal/systembackupevidence');
    assert.ok(['TestDownloadGCFreezeCandidateOrderAndFreshDisposal','TestDownloadGCFreezeCandidateFailures','TestDownloadGCFreezeCandidateClosedPreflight','TestAFreezeTypedNilConnectorBoundary'].includes(name.split('/')[0]),'unexpected added root: '+name);
    additions.push(name);
  }
}
assert.ok(additions.some(n=>n==='TestAFreezeTypedNilConnectorBoundary'));
assert.ok(additions.some(n=>n.startsWith('TestDownloadGCFreeze')));
// Check the three newly participating GC inputs against the reviewed snapshot.
for(const name of ['download_retention_gc_freeze.go','download_retention_gc_freeze_test.go','download_retention_gc_freeze_a_test.go']){
  const f='backend/internal/systembackupevidence/'+name;
  assert.deepEqual(pin(f),source.files.find(p=>p.path===f),'GC bytes drifted: '+f);
}
const ib=Buffer.from(JSON.stringify(inventory,null,2)+'\n');
const main=inventory.packages.reduce((n,p)=>n+p.roots,0),all=inventory.packages.reduce((n,p)=>n+p.pass_events,0);
assert.equal(all,5105+additions.length);
const library=read('docs/evidence/a-download-owners-actual-review-20261020.mjs').toString('utf8');
const marker='export function loadReviewedOwnerBaseline';assert.equal(library.split(marker).length,2);
const parser=Buffer.from(library.slice(0,library.indexOf(marker)));
const result={kind:'a_owner_current_full_local_preparation_acceptance.v1',status:'complete_frozen_owner_profile_accepted_ordinary_worktree_delta_requires_separate_review',date:'2026-10-23',source:stem+'-source.json',source_manifest_sha256:sha(read(stem+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,events:inventoryPath,events_sha256:sha(ib),events_origin:inventory.origin,owner_baseline:{main,all},prior_complete_checks_preserved:5105,new_GC_cases:additions.sort(),catalog:frozenMigrationCatalog(source),seed_checks_each_location:13,Linux_probe_and_migration_built:true,frozen_postcheck:true,outer_owner_independently_absent:true,actual_SQL:false,human_mfa:false,provider_read:false,dependencies_installed:false,production_approved:false,current_whole_worktree_verified:false,parser_dependency_prefix:{path:'docs/evidence/a-download-owners-actual-review-20261020.mjs',sha256:sha(parser),bytes_base64:parser.toString('base64')},reviewer_inputs:[stem+'.txt',stem+'-source.json',previous,prior,'docs/evidence/a-owner-gc-full-review-20261023.mjs','docs/evidence/a-owner-preparation-inventory-20261022.mjs'].map(pin)};
if(process.argv.includes('--write')){
  assert.equal(fs.existsSync(path.join(root,output)),false);
  assert.equal(fs.existsSync(path.join(root,inventoryPath)),false);
  fs.writeFileSync(path.join(root,inventoryPath),ib,{flag:'wx'});
  fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}else{
  assert.ok(process.argv.includes('--check'));
  assert.deepEqual(json(inventoryPath),inventory);assert.deepEqual(json(output),result);
}
console.log('A_GC_FULL_ACCEPTED roots='+main+' checks='+all+' prior=5105 actual_SQL=no');
