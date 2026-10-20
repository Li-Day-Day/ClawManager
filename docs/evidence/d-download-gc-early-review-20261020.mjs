import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const raw=p=>fs.readFileSync(path.join(root,p));
const text=p=>{const b=raw(p);return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replaceAll('\r','');};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const prefix=n=>`docs/evidence/d-download-gc-early-20261020-r${n}`;
const events=(p,partial=false)=>text(p).trim().split('\n').filter(Boolean).flatMap(s=>{try{return[JSON.parse(s)];}catch(error){if(partial)return[];throw new Error('Invalid JSON event in '+p,{cause:error});}});
if(process.argv.includes('--status')){
 const p=prefix(Number(process.argv.at(-1))),e=events(p+'.jsonl',true),pass=e.filter(e=>e.Action==='pass'&&e.Test);
 console.log(JSON.stringify({main:pass.filter(e=>!e.Test.includes('/')).length,all:pass.length,failed:e.filter(e=>e.Action==='fail').map(e=>e.Test||e.Package),packages:e.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package),last_time:e.at(-1)?.Time,native:text(p+'-native.txt').split('\n').filter(l=>/^NATIVE_|^FROZEN_|^CLEANED|^d_admission/.test(l)).slice(-8)}));
 process.exit(0);
}
function review(n){
 const p=prefix(n),source=JSON.parse(text(p+'-source.json')),native=text(p+'-native.txt'),e=events(p+'.jsonl');
 assert.equal(source.stable_copy_verified,true);assert.equal(source.dependencies_installed,false);assert.equal(source.production_approved,false);
 assert.equal(new Set(source.files.map(f=>f.path)).size,source.files.length);
 assert.equal(sha(Buffer.from(source.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),source.source_sha256);
 for(const marker of [`FROZEN files=${source.files.length} sha256=${source.source_sha256}`,'default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes','FROZEN_POSTCHECK pass=yes','CLEANED snapshot=True','d_admission_native_exit=0'])assert.ok(native.includes(marker),`${n}: ${marker}`);
 assert.equal(text(p+'-stderr.txt'),'');assert.ok(e.length>0);assert.ok(!e.some(e=>e.Action==='fail'||e.Action==='skip'));
 const ran=e.filter(e=>e.Action==='run'&&e.Test).map(e=>e.Package+'/'+e.Test),pass=e.filter(e=>e.Action==='pass'&&e.Test);
 assert.equal(new Set(ran).size,ran.length);assert.deepEqual(ran.slice().sort(),pass.map(e=>e.Package+'/'+e.Test).sort());
 const gc=pass.filter(e=>e.Test.startsWith('TestDownloadRetentionGC'));assert.equal(gc.filter(e=>!e.Test.includes('/')).length,12);assert.equal(gc.length,125);
 const owner=native.match(/ owner=(.+)$/m)[1].trim();assert.equal(path.dirname(owner).toLowerCase(),root.toLowerCase());assert.match(path.basename(owner),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(fs.existsSync(owner),false);
 return {p,source,native,e,summary:{source_files:source.files.length,source_sha256:source.source_sha256,source_manifest_sha256:sha(raw(p+'-source.json')),jsonl_sha256:sha(raw(p+'.jsonl')),native_sha256:sha(raw(p+'-native.txt')),main:pass.filter(e=>!e.Test.includes('/')).length,all:pass.length,packages:e.filter(e=>e.Action==='pass'&&!e.Test).map(e=>e.Package),gc_main:12,gc_all:125,owner,owner_absent:true,exit:0}};
}
const focused=review(72),full=review(73);
assert.equal(focused.summary.main,12);assert.equal(focused.summary.all,125);assert.ok(focused.native.includes('NATIVE_EXIT focused_packages=0'));
assert.equal(focused.source.files.length,1436);assert.equal(full.source.files.length,1437);
assert.deepEqual(full.summary.packages.slice().sort(),['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer'].sort());
assert.ok(full.native.includes('NATIVE_EXIT full_packages=0'));
for(const name of ['TestDownloadRetentionGCEarlyReferencesAreL1AndRechecked','TestDownloadRetentionGCEarlyReferenceAndGrantDenials','TestDownloadRetentionGCEarlyLateChangesRollBack','TestDownloadRetentionGCEarlyGuardCannotReviveOrRebind','TestDownloadRetentionGCEarlyConfigurationIsExplicit'])assert.ok(full.e.some(e=>e.Action==='pass'&&e.Test===name));
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration'])assert.ok(full.native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
const seeds=events(full.p+'-tagged-seed.txt');assert.ok(!seeds.some(e=>e.Action==='fail'||e.Action==='skip'));
const seeded=seeds.filter(e=>e.Action==='pass'&&e.Test);assert.equal(seeded.length,22);assert.deepEqual(seeded.filter(e=>!e.Test.includes('/')).map(e=>e.Test).sort(),['TestADownloadAdmissionMySQLSeed','TestASensitiveDownloadMFAMySQLSeed','TestDProducerDownloadOwnersMySQLSeed'].sort());
const detached=text(full.p+'-detached-seed.txt');assert.equal((detached.match(/^=== RUN /gm)||[]).length,22);assert.equal((detached.match(/^\s*--- PASS: /gm)||[]).length,22);assert.ok(!/--- (?:FAIL|SKIP):/.test(detached));
const binaries=[...full.native.matchAll(/^NATIVE_PROBE_BINARY name=(\S+) sha256=([a-f0-9]{64})$/gm)].map(m=>({name:m[1],sha256:m[2]}));assert.equal(binaries.length,3);
// Generate this list immediately before review using the same pinned source
// enumerator through PowerShell; Node child-process spawning is unavailable.
const currentList='docs/evidence/d-download-gc-early-20261020-r73-current-files.txt',current=text(currentList).trim().split('\n').filter(Boolean),pins=new Map(full.source.files.map(f=>[f.path,f]));
assert.equal(new Set(current).size,current.length);
const drift=[];for(const f of full.source.files){const p=path.resolve(root,f.path);assert.ok(p.startsWith(root+path.sep));if(!fs.existsSync(p)){drift.push({path:f.path,reason:'missing'});continue;}const b=raw(f.path);if(b.length!==f.size||sha(b)!==f.sha256)drift.push({path:f.path,reason:'changed',frozen_sha256:f.sha256,current_sha256:sha(b)});}
const currentSet=new Set(current),added=current.filter(p=>!pins.has(p)),missing=full.source.files.filter(f=>!currentSet.has(f.path)).map(f=>f.path);
for(const p of ['download_retention_gc.go','download_retention_gc_early.go','download_retention_gc_test.go','download_retention_gc_early_test.go']){const relative='backend/internal/systembackupevidence/'+p;assert.equal(sha(raw(relative)),pins.get(relative).sha256,relative);}
const prior=new Map(focused.source.files.map(f=>[f.path,f.sha256]));
const sourceChanges=full.source.files.filter(f=>prior.get(f.path)!==f.sha256).map(f=>({path:f.path,kind:prior.has(f.path)?'changed':'added'}));
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);assert.equal(catalog.hash,'2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
assert.equal(pins.get('backend/internal/systembackupevidence/testdata/download_producer_probe_inputs.json').sha256,'a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0');
const cleanup=JSON.parse(text('docs/evidence/d-download-gc-early-cleanup-20261020.json'));assert.equal(cleanup.paths.length,3);assert.ok(cleanup.paths.every(p=>p.absent&&!fs.existsSync(p.path)));assert.equal(cleanup.remote_run,false);assert.equal(cleanup.dependencies_installed,false);
const drafts=JSON.parse(text('docs/evidence/d-download-gc-early-draft-cleanup-20261020.json'));assert.equal(drafts.length,7);assert.ok(drafts.every(p=>p.absent&&!fs.existsSync(p.path)));
const result={kind:'d_download_gc_early_reference_local_review',recorded_at:new Date().toISOString(),frozen_validation_passed:true,current_sources_match:drift.length===0&&added.length===0&&missing.length===0,current_pinned_drift:drift,current_added_inputs:added,current_missing_inputs:missing,current_file_list:{path:currentList,sha256:sha(raw(currentList)),files:current.length},focused:focused.summary,full:full.summary,focused_to_full_source_changes:sourceChanges,new_early_main:5,new_early_all:52,total_gc_main:12,total_gc_all:125,producer_seed_main:3,producer_seed_all:22,detached_seed_all:22,binaries,catalog,cleanup,drafts,default_vet:true,dependencies_installed:false,actual_mysql:false,actual_limited_role:false,production_approved:false,original_six_scopes_complete:false,limitations:'Only concrete early direct-grant/structural-fingerprint/L1-audit-reference guard and collector orchestration are exercised over synthetic grants/catalog/SQL transport. It is not complete owner/artifact/ref/hold eligibility, actual restricted MySQL role proof, privileged trigger/program review, DDL freeze, physical capacity, production GC or completion of original six scopes. Global REFERENCES and database LOCK TABLES remain candidate assumptions requiring review and actual visibility/positive-negative tests. The L1 receipt phase is a proposed compatible extension of config-to-receipt ordering, not a claim of approved global deadlock freedom.'};
result.reviewer_sha256=sha(raw('docs/evidence/d-download-gc-early-review-20261020.mjs'));
fs.writeFileSync(path.join(root,'docs/evidence/d-download-gc-early-20261020-r73-review.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({frozen_validation_passed:true,current_sources_match:result.current_sources_match,full_main:full.summary.main,full_all:full.summary.all,gc_all:125,producer_seeds:22,drift:drift.map(d=>d.path),added,missing,cleaned_paths:cleanup.paths.length,removed_drafts:drafts.length}));
if(!result.current_sources_match)process.exitCode=1;
