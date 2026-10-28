// Accept only a terminal original full owner profile, never actual SQL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {deriveOwnerPreparationInventory} from './a-owner-preparation-inventory-20261022.mjs';
import {frozenMigrationCatalog} from './a-download-owners-actual-review-20261020.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const pin=p=>({path:p,size:read(p).length,sha256:sha(read(p))});
const stem='docs/evidence/a-owner-final-full-local-20261023-144309';
const historical=process.argv.includes('--historical');
const source=json(stem+'-source.json'),log=read(stem+'.txt').toString('utf8');
assert.match(log,/^a_owner_full_local_exit=0\s*$/m,'terminal success required');
assert.match(log,/^End time: \d{14}\s*$/m,'closed transcript required');
const prior='docs/evidence/a-prune-identity-owner-baseline-20261021.jsonl';
const inventory=deriveOwnerPreparationInventory({logBytes:read(stem+'.txt'),sourceBytes:read(stem+'-source.json'),priorNativeEventsBytes:read(prior)});
const previous='docs/evidence/a-owner-gc-full-local-20261023-111154-inventory.json',old=json(previous);
for(const p of inventory.packages){const before=old.packages.find(v=>v.package===p.package);assert.ok(before);assert.deepEqual(p.tests,before.tests,'ordinary owner test set unexpectedly changed');}
const roots=inventory.packages.reduce((n,p)=>n+p.roots,0),all=inventory.packages.reduce((n,p)=>n+p.pass_events,0);
assert.equal(roots,636);assert.equal(all,5138);
// A fresh complete gate is required because systembackupread is in this closure.
// No metadata-only composition is used for that source change.
const ordinary=p=>/^(backend|contracts)\//.test(p)&&!p.endsWith('_mysql_test.go');
const expected=source.files.filter(p=>ordinary(p.path)),known=new Set(expected.map(p=>p.path)),drift=[];
for(const p of expected){const current=fs.existsSync(path.join(root,p.path))?pin(p.path):null;if(JSON.stringify(current)!==JSON.stringify(p))drift.push({path:p.path,tested:p,current});}
function currentFiles(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
 const name=dir+'/'+e.name;if(e.isDirectory())return ['.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(e.name)?[]:currentFiles(name);
 return e.isFile()&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/.test(name)&&ordinary(name)?[name]:[];
});}
for(const p of [...currentFiles('backend'),...currentFiles('contracts')])if(!known.has(p))drift.push({path:p,tested:null,current:pin(p)});
if(!historical)assert.deepEqual(drift,[],'current ordinary source changed; use historical mode only for an explicit non-current archive');
const ib=Buffer.from(JSON.stringify(inventory,null,2)+'\n'),events=stem+(historical?'-historical-inventory.json':'-inventory.json');
const library=read('docs/evidence/a-download-owners-actual-review-20261020.mjs').toString('utf8'),marker='export function loadReviewedOwnerBaseline';
assert.equal(library.split(marker).length,2);const parser=Buffer.from(library.slice(0,library.indexOf(marker)));
const report={kind:'a_owner_current_full_local_preparation_acceptance.v1',status:'complete_frozen_owner_profile_accepted_ordinary_worktree_delta_requires_separate_review',date:'2026-10-23',source:stem+'-source.json',source_manifest_sha256:sha(read(stem+'-source.json')),source_sha256:source.source_sha256,source_files:source.files.length,events,events_sha256:sha(ib),events_origin:inventory.origin,owner_baseline:{main:roots,all},prior_complete_checks_preserved:5138,catalog:frozenMigrationCatalog(source),seed_checks_each_location:13,Linux_probe_and_migration_built:true,frozen_postcheck:true,outer_owner_independently_absent:true,current_selected_ordinary_pins_match:true,actual_SQL:false,human_mfa:false,provider_read:false,dependencies_installed:false,production_approved:false,current_whole_worktree_verified:false,parser_dependency_prefix:{path:'docs/evidence/a-download-owners-actual-review-20261020.mjs',sha256:sha(parser),bytes_base64:parser.toString('base64')},reviewer_inputs:[stem+'.txt',stem+'-source.json',previous,prior,'docs/evidence/a-owner-final-full-review-20261023.mjs','docs/evidence/a-owner-preparation-inventory-20261022.mjs'].map(pin)};
const output='docs/evidence/a-owner-final-full-accepted-20261023.json';
report.status=historical?'complete_original_frozen_owner_profile_historical_only':report.status;
report.current_selected_ordinary_pins_match=drift.length===0;report.current_ordinary_source_drift=drift;
report.current_baseline_registration_permitted=!historical&&drift.length===0;
const destination=historical?'docs/evidence/a-owner-final-full-historical-accepted-20261023.json':output;
if(process.argv.includes('--write')){assert.equal(fs.existsSync(path.join(root,destination)),false);assert.equal(fs.existsSync(path.join(root,events)),false);fs.writeFileSync(path.join(root,events),ib,{flag:'wx'});fs.writeFileSync(path.join(root,destination),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
else{assert.ok(process.argv.includes('--check'));assert.deepEqual(json(events),inventory);assert.deepEqual(json(destination),report);}
console.log('A_OWNER_FINAL_FULL_ACCEPTED roots='+roots+' checks='+all+' historical_only='+historical+' current_registration='+report.current_baseline_registration_permitted+' actual_SQL=no');
