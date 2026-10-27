import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';

const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const hash=b=>createHash('sha256').update(b).digest('hex');
const full=resolve(dir,'d-download-gc-early-20261020-r73'),focused=resolve(dir,'d-download-gc-early-20261020-r72');
function manifest(prefix){
  const m=JSON.parse(read(prefix+'-source.json'));
  assert.equal(m.stable_copy_verified,true);assert.equal(m.dependencies_installed,false);assert.equal(m.production_approved,false);
  assert.equal(hash(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'),m.source_sha256);
  return m;
}
function events(prefix){return read(prefix+'.jsonl').trim().split(/\r?\n/).map(JSON.parse);}
function passes(es,packages){
  assert.equal(es.filter(e=>['fail','skip','build-fail'].includes(e.Action)).length,0);
  for(const pkg of packages)assert.equal(es.filter(e=>e.Package===pkg&&!e.Test&&e.Action==='pass').length,1,pkg);
  const ran=es.filter(e=>e.Test&&e.Action==='run'),passed=es.filter(e=>e.Test&&e.Action==='pass');assert.equal(ran.length,passed.length);
  for(const r of ran)assert.equal(passed.filter(p=>p.Package===r.Package&&p.Test===r.Test).length,1,r.Test);
  return passed;
}
function owner(prefix){const native=read(prefix+'-native.txt'),path=native.match(/FROZEN files=[0-9]+ sha256=[a-f0-9]{64} owner=(.+)/)?.[1].trim();assert.ok(path);assert.equal(dirname(path).toLowerCase(),root.toLowerCase());assert.match(basename(path),/^\.tmp-d-index-cache-[a-f0-9]{32}$/);assert.equal(existsSync(path),false);assert.ok(native.includes('CLEANED snapshot=True'));assert.ok(native.includes('d_admission_native_exit=0'));assert.ok(native.includes('PowerShell transcript end'));return path;}
const m=manifest(full),fm=manifest(focused);
const currentList=read(resolve(dir,'a-download-gc-independent-current-files-20261020.txt')).trim().split(/\r?\n/);
assert.deepEqual(currentList,m.files.map(p=>p.path));
for(const pin of m.files){const path=resolve(root,pin.path);assert.ok(path.startsWith(root+sep));const bytes=readFileSync(path);assert.equal(bytes.length,pin.size,pin.path);assert.equal(hash(bytes),pin.sha256,pin.path);}
const packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer','clawreef/internal/systembackupevidence'];
const es=events(full),passed=passes(es,packages),focusedPassed=passes(events(focused),[packages[3]]);
assert.equal(passed.filter(e=>!e.Test.includes('/')).length,716);assert.equal(passed.length,5738);
const gc=[['TestDownloadRetentionGCEarlyReferencesAreL1AndRechecked',3],['TestDownloadRetentionGCEarlyReferenceAndGrantDenials',32],['TestDownloadRetentionGCEarlyLateChangesRollBack',6],['TestDownloadRetentionGCEarlyGuardCannotReviveOrRebind',4],['TestDownloadRetentionGCEarlyConfigurationIsExplicit',7],['TestDownloadRetentionGCOneTransactionAndPrivateFacts',1],['TestDownloadRetentionGCWriteFailuresRollBackWholeGroup',13],['TestDownloadRetentionGCWorkerAndPeerBoundaries',21],['TestDownloadRetentionGCMarkerReadbackIsComplete',24],['TestDownloadRetentionGCFinalGuardsAndLateWrites',12],['TestDownloadRetentionGCUnknownCommitIsNotRetried',1],['TestDownloadRetentionGCExpiryEquality',1]];
for(const [name,count]of gc)for(const set of [passed,focusedPassed]){assert.equal(set.filter(e=>e.Test===name).length,1,name);assert.equal(set.filter(e=>e.Test===name||e.Test.startsWith(name+'/')).length,count,name);}
const native=read(full+'-native.txt');
for(const marker of [`FROZEN files=${m.files.length} sha256=${m.source_sha256}`,'NATIVE_EXIT full_packages=0','default_vet=yes','FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no','FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'])assert.ok(native.includes(marker),marker);
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration'])assert.ok(native.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
for(const suffix of ['-stderr.txt','-tagged-seed-stderr.txt','-windows-probe-stderr.txt','-detached-seed-stderr.txt','-linux-probe-stderr.txt','-linux-migration-stderr.txt'])assert.equal(read(full+suffix).trim(),'');
const seed=read(full+'-tagged-seed.txt').trim().split(/\r?\n/).map(JSON.parse),seedPassed=passes(seed,[packages[3]]);
assert.equal(seedPassed.length,22);assert.equal(seedPassed.filter(e=>!e.Test.includes('/')).length,3);
const detached=read(full+'-detached-seed.txt');assert.equal([...detached.matchAll(/^=== RUN /gm)].length,22);assert.equal([...detached.matchAll(/^\s*--- PASS:/gm)].length,22);assert.ok(!/--- FAIL:|--- SKIP:/.test(detached));
const cleanup=JSON.parse(read(resolve(dir,'d-download-gc-early-cleanup-20261020.json')));
assert.equal(cleanup.dependencies_installed,false);assert.equal(cleanup.remote_run,false);
const owners=[owner(focused),owner(full)];
for(const entry of cleanup.paths){assert.equal(entry.absent,true);assert.equal(dirname(entry.path).toLowerCase(),root.toLowerCase());assert.equal(existsSync(entry.path),false);}
assert.ok(cleanup.paths.some(p=>p.path.endsWith('.tmp-d-admission-gc-early-20261020-r72')));
const cacheOwner=JSON.parse(read(resolve(dir,'d-download-gc-early-cache-owner-20261020-r72.json')));assert.equal(dirname(cacheOwner.owner).toLowerCase(),root.toLowerCase());assert.equal(existsSync(cacheOwner.owner),false);
const catalog=computeMigrationCatalog();assert.equal(catalog.file_count,95);assert.equal(catalog.hash,'2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
const aNode=manifest(resolve(dir,'a-download-k8s-20261020-r1'));assert.deepEqual(aNode.files,m.files);
const scoped=['download_retention_gc.go','download_retention_gc_test.go','download_retention_gc_early.go','download_retention_gc_early_test.go','download_retention_group.go','download_result_retention.go'];
for(const name of scoped)assert.ok(m.files.some(p=>p.path==='backend/internal/systembackupevidence/'+name),name);
const report={kind:'a_independent_download_gc_early_local_review',recorded_at:new Date().toISOString(),status:'accepted_local_component_and_model_regression_only',
  source_sha256:m.source_sha256,source_count:m.files.length,source_manifest_sha256:hash(readFileSync(full+'-source.json')),full_jsonl_sha256:hash(readFileSync(full+'.jsonl')),full_native_sha256:hash(readFileSync(full+'-native.txt')),
  packages:packages.map(pkg=>({package:pkg,roots:passed.filter(e=>e.Package===pkg&&!e.Test.includes('/')).length,checks:passed.filter(e=>e.Package===pkg).length})),
  gc_roots:gc.length,gc_checks:gc.reduce((n,[,count])=>n+count,0),new_early_roots:5,new_early_checks:52,focused_source_sha256:fm.source_sha256,
  tagged_seed_checks:22,detached_seed_checks:22,binaries:[...native.matchAll(/NATIVE_PROBE_BINARY name=([^ ]+) sha256=([a-f0-9]{64})/g)].map(([,name,sha256])=>({name,sha256})),
  formal_catalog:catalog.hash,formal_catalog_files:95,a_node_composition_snapshot_identical:true,current_input_set_and_all_bytes_match:true,source_postchecks:true,default_vet:true,
  owned_snapshots_absent:owners,external_owned_cache_absent:true,dependencies_installed:false,tests_or_builds_repeated:false,
  new_source_revision_requests:[],actual_mysql:'not_run',actual_restricted_role:'not_verified',complete_gc_policy:false,global_references_and_lock_tables:'candidate_requires_independent_role_and_actual_visibility_proof',
  schema_trigger_ddl_freeze:'external_policy_required',owner_artifact_refs_holds_leases:'external_policy_required',actual_physical_capacity:'not_verified',production_gc_enabled:false,formal_schema_or_grants_approved:false,production_approval:false};
writeFileSync(resolve(dir,'a-download-gc-independent-accepted-20261020-r73.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
