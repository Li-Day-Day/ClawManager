import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeMigrationCatalog} from '../../scripts/system-backup-contract-check.mjs';

const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const read=p=>readFileSync(p,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const prefix=n=>resolve(dir,'d-download-gc-task-20261020-r'+n);
const checks=[];
function check(name,value){assert.ok(value,name);checks.push(name);}
function manifest(p){
  const m=JSON.parse(read(p+'-source.json'));
  check('stable/offline/unapproved '+basename(p),m.stable_copy_verified===true&&m.dependencies_installed===false&&m.production_approved===false);
  check('recomputed logical source SHA '+basename(p),hash(m.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n')===m.source_sha256);
  return m;
}
function events(p){return read(p+'.jsonl').trim().split('\n').map(JSON.parse);}
function passes(label,es,packages){
  check(label+' no failure skip build failure',!es.some(e=>['fail','skip','build-fail'].includes(e.Action)));
  const ran=es.filter(e=>e.Test&&e.Action==='run'),passed=es.filter(e=>e.Test&&e.Action==='pass');
  check(label+' unique complete RUN/PASS',ran.length===passed.length&&new Set(ran.map(e=>e.Package+'\0'+e.Test)).size===ran.length&&ran.every(r=>passed.filter(p=>p.Package===r.Package&&p.Test===r.Test).length===1));
  const actual=es.filter(e=>!e.Test&&e.Action==='pass').map(e=>e.Package).sort();
  check(label+' exact package completions',JSON.stringify(actual)===JSON.stringify(packages.toSorted()));
  return passed;
}
const m76=manifest(prefix(76)),m77=manifest(prefix(77)),m78=manifest(prefix(78));
check('focused full and recovery exact same ordered source pins',JSON.stringify(m76.files)===JSON.stringify(m77.files)&&JSON.stringify(m77.files)===JSON.stringify(m78.files));
check('1442 inputs',m78.files.length===1442);
const current=read(resolve(dir,'a-download-gc-task-independent-current-files-20261020.txt')).trim().split('\n').toSorted();
const frozenNames=new Set(m78.files.map(p=>p.path)),currentNames=new Set(current);
const additions=current.filter(p=>!frozenNames.has(p));
check('no reviewed source removed',m78.files.every(p=>currentNames.has(p.path)));
check('one declared concurrent reference component excluded',JSON.stringify(additions)===JSON.stringify(['backend/internal/systembackupevidence/download_retention_gc_references.go']));
const drift=[];
for(const pin of m78.files){
  const target=resolve(root,pin.path);
  check('safe existing frozen path '+pin.path,target.startsWith(root+sep)&&existsSync(target));
  const bytes=readFileSync(target);
  if(bytes.length!==pin.size||hash(bytes)!==pin.sha256)drift.push(pin.path);
}
const excludedChanges=['backend/internal/systembackupevidence/download_retention_gc.go','backend/internal/systembackupevidence/download_retention_gc_test.go','backend/internal/systembackupevidence/download_retention_gc_early_test.go'].sort();
check('only declared concurrent collector/reference integration changes',JSON.stringify(drift.toSorted())===JSON.stringify(excludedChanges));
for(const file of ['download_retention_gc_task.go','download_retention_gc_task_test.go'])check('reviewed task bytes still match '+file,!drift.includes('backend/internal/systembackupevidence/'+file));
const a=manifest(resolve(dir,'a-download-gc-role-20261020-r2'));
const sortedPins=m=>m.files.toSorted((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
check('A role preparation has identical file set sizes and bytes despite listing order',JSON.stringify(sortedPins(a))===JSON.stringify(sortedPins(m78)));
check('different aggregate digest is accompanied by different listing order',a.source_sha256!==m78.source_sha256&&JSON.stringify(a.files.map(p=>p.path))!==JSON.stringify(m78.files.map(p=>p.path)));
const packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupread','clawreef/internal/systembackupproducer','clawreef/internal/systembackupevidence'];
const full=passes('r77 ordinary',events(prefix(77)),packages),focused=passes('r76 focused',events(prefix(76)),[packages[3]]);
check('full 722 roots 5855 checks',full.length===5855&&full.filter(e=>!e.Test.includes('/')).length===722);
check('focused 18 roots 242 checks',focused.length===242&&focused.filter(e=>!e.Test.includes('/')).length===18);
const taskRoots=[
  ['TestDownloadRetentionGCTaskFourOwnersAndOriginalDeadlines',9],
  ['TestDownloadRetentionGCTaskProtectedFactsDeny',47],
  ['TestDownloadRetentionGCTaskInventoryAndExpiredLeaseRanges',25],
  ['TestDownloadRetentionGCTaskLateChangesPoisonAllCopies',15],
  ['TestDownloadRetentionGCTaskSQLFailuresAndConfiguration',15],
  ['TestDownloadRetentionGCTaskCollectorRollbackAndFinalRecheck',6],
];
for(const [name,count]of taskRoots)for(const [label,set]of [['full',full],['focused',focused]]){
  check(label+' '+name,set.filter(e=>e.Test===name).length===1&&set.filter(e=>e.Test===name||e.Test.startsWith(name+'/')).length===count);
}
const gcRoots=full.filter(e=>!e.Test.includes('/')&&e.Test.startsWith('TestDownloadRetentionGC'));
check('all GC 18 roots 242 checks',gcRoots.length===18&&full.filter(e=>e.Test.startsWith('TestDownloadRetentionGC')).length===242);
const native77=read(prefix(77)+'-native.txt'),native78=read(prefix(78)+'-native.txt');
for(const [run,m]of [[76,m76],[77,m77],[78,m78]]){
  const native=read(prefix(run)+'-native.txt');
  check('r'+run+' source/log binding and unit postcheck',native.includes(`FROZEN files=${m.files.length} sha256=${m.source_sha256}`)&&native.includes('default_vet=yes')&&native.includes('FROZEN_UNIT_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'));
  check('r'+run+' snapshot cleanup and terminal transcript',native.includes('CLEANED snapshot=True')&&native.includes('PowerShell transcript end'));
}
check('r77 four package success before later probe failure',native77.includes('NATIVE_EXIT full_packages=0')&&native77.includes('NATIVE_PROBE stage=linux-probe exit=1 actual_mysql=no')&&native77.includes('d_admission_native_exit=1')&&!native77.includes('FROZEN_POSTCHECK pass=yes'));
check('r77 retained Windows vet tool failure',/vet\.exe: exit status 0xc0000043/.test(read(prefix(77)+'-linux-probe-stderr.txt')));
check('r77 ordinary stderr empty',read(prefix(77)+'-stderr.txt').trim()==='');
check('r78 tagged-only scope and final postcheck',native78.includes('-TaggedOwnerSeedsOnly')&&native78.includes('NATIVE_EXIT focused_packages=0')&&native78.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no')&&native78.includes('d_admission_native_exit=0'));
for(const stage of ['tagged-seed','windows-probe','detached-seed','linux-probe','linux-migration']){
  check('r78 '+stage+' completed',native78.includes(`NATIVE_PROBE stage=${stage} exit=0 actual_mysql=no`));
  check('r78 '+stage+' stderr empty',read(prefix(78)+'-'+stage+'-stderr.txt').trim()==='');
}
check('r78 focused stderr empty',read(prefix(78)+'-stderr.txt').trim()==='');
const seed=passes('r78 seed',events(prefix(78)),[packages[3]]);
const tagged=passes('r78 tagged seed',read(prefix(78)+'-tagged-seed.txt').trim().split('\n').map(JSON.parse),[packages[3]]);
const roots=['TestDProducerDownloadOwnersMySQLSeed','TestADownloadAdmissionMySQLSeed','TestASensitiveDownloadMFAMySQLSeed'].sort();
for(const [label,set]of [['seed',seed],['tagged',tagged]])check(label+' exact three roots 22 checks',set.length===22&&JSON.stringify(set.filter(e=>!e.Test.includes('/')).map(e=>e.Test).sort())===JSON.stringify(roots));
const detached=read(prefix(78)+'-detached-seed.txt');
const ran=[...detached.matchAll(/^=== RUN[ \t]+(\S+)/gm)].map(m=>m[1]).sort(),passed=[...detached.matchAll(/^\s*--- PASS: (\S+) /gm)].map(m=>m[1]).sort();
check('detached seed exact 22 names no failures',ran.length===22&&new Set(ran).size===22&&JSON.stringify(ran)===JSON.stringify(passed)&&!/^\s*--- (FAIL|SKIP):/m.test(detached));
const binaries=[...native78.matchAll(/NATIVE_PROBE_BINARY name=([^ ]+) sha256=([a-f0-9]{64})/g)].map(([,name,sha256])=>({name,sha256}));
check('three Windows Linux runner hashes',JSON.stringify(binaries.map(b=>b.name).sort())===JSON.stringify(['download-admission.test.exe','download-admission.test','system-backup-migrate'].sort()));
const cleanup=JSON.parse(read(resolve(dir,'d-download-gc-task-cleanup-20261020.json')));
check('cleanup six owned paths offline',cleanup.paths.length===6&&cleanup.remote_run===false&&cleanup.dependencies_installed===false);
for(const entry of cleanup.paths)check('owned path absent '+basename(entry.path),entry.absent===true&&dirname(resolve(entry.path)).toLowerCase()===root.toLowerCase()&&/^\.tmp-(?:d-index-cache-[a-f0-9]{32}|d-admission-gc-task-20261020-r74)$/.test(basename(entry.path))&&!existsSync(entry.path));
for(const run of [76,77,78]){
  const owner=read(prefix(run)+'-native.txt').match(/FROZEN files=[0-9]+ sha256=[a-f0-9]{64} owner=(.+)/)?.[1].trim();
  check('r'+run+' actual owner appears in cleanup',cleanup.paths.some(p=>p.path===owner&&p.run===run));
}
const catalog=computeMigrationCatalog();
check('formal 95 file catalog unchanged',catalog.file_count===95&&catalog.hash==='2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237');
const report={kind:'a_independent_download_gc_task_eligibility_review',recorded_at:new Date().toISOString(),status:'accepted_frozen_r78_task_component_only_current_collector_excluded',checks_passed:checks.length,checks,
  source_files:m78.files.length,source_sha256:m78.source_sha256,source_manifest_sha256:hash(readFileSync(prefix(78)+'-source.json')),a_role_preparation_source_sha256:a.source_sha256,
  a_and_d_source_sets_sizes_and_bytes_identical:true,aggregate_sha_difference:'Input listing order differs between PowerShell versions (first difference: backup_sessions_test.go vs backup_sessions.go). Each manifest digest independently recomputes; exact path/size/byte pin sets match.',
  current_task_component_and_test_bytes_match:true,current_whole_worktree_verified:false,current_source_set_matches_frozen:false,concurrent_inputs_not_accepted:additions,concurrent_modified_inputs_not_accepted:drift,
  current_file_set_observation_sha256:hash(readFileSync(resolve(dir,'a-download-gc-task-independent-current-files-20261020.txt'))),
  current_source_scope:'The task component and its tests retain the frozen r78 bytes. Three concurrently modified collector/model files and the newly added reference component are excluded. The 5855-check and collector-composition results belong only to the original r77/r78 frozen source, not the whole current worktree or the evolving collector.',
  packages:packages.map(pkg=>({package:pkg,roots:full.filter(e=>e.Package===pkg&&!e.Test.includes('/')).length,checks:full.filter(e=>e.Package===pkg).length})),
  full_roots:722,full_checks:5855,gc_roots:18,gc_checks:242,new_task_roots:taskRoots.length,new_task_checks:taskRoots.reduce((n,[,count])=>n+count,0),task_test_roots:taskRoots,
  full_jsonl_sha256:hash(readFileSync(prefix(77)+'.jsonl')),full_native_sha256:hash(readFileSync(prefix(77)+'-native.txt')),recovery_native_sha256:hash(readFileSync(prefix(78)+'-native.txt')),
  full_overall_exit:1,full_ordinary_package_postcheck:true,full_final_postcheck:false,retained_failure:'r77 Windows vet tool exit 0xc0000043 during Linux probe compile; not an ordinary-package test failure. r78 exact-source tagged-only recovery exit 0 and final postcheck. r74/r75 failed history unchanged.',
  tagged_seed_checks:22,detached_seed_checks:22,binaries,default_vet:true,cleanup_paths:cleanup.paths.map(p=>p.path),all_six_owned_paths_absent:true,cleanup_performed_by_this_review:false,
  formal_catalog:catalog,dependencies_installed:false,tests_or_builds_repeated:false,actual_mysql:false,actual_restricted_role:false,actual_global_lock_order:false,complete_gc_policy:false,production_gc_enabled:false,formal_schema_or_grants_approved:false,
  remaining:['other Operation/audit/nonce/evidence/logical/FK references','other dependent tasks and catalog imports on the source artifact','system producer original write binding','current worker authorization and privileged triggers/programs/DDL freeze','actual InnoDB range locks and global lock-order/scale validation','physical capacity and runtime materials','batch sweep and second expiry of tombstones'],
};
writeFileSync(resolve(dir,'a-download-gc-task-independent-accepted-20261020-r78.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks:checks.length,source_files:report.source_files,full_roots:722,full_checks:5855,gc_checks:242,new_task_checks:117,all_owned_products_absent:true,actual_mysql:false}));
