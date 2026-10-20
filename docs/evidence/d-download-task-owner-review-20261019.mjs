import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix=process.argv[2];
assert.match(prefix??'',/^d-download-task-owner-packages-20261019-r\d+$/);
const rel='docs/evidence/'+prefix;
const bytes=n=>fs.readFileSync(path.join(root,n));
const text=n=>bytes(n).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=n=>JSON.parse(text(n));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=json(rel+'-source.json'),native=text(rel+'-native.txt');
assert.equal(manifest.stable_copy_verified,true);
assert.equal(manifest.dependencies_installed,false);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread default_vet=yes/);
assert.match(native,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native,/CLEANED snapshot=True/);
assert.match(native,/d_admission_native_exit=0/);
assert.equal(bytes(rel+'-stderr.txt').length,0);
const events=text(rel+'.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(events.filter(e=>['fail','build-fail','skip'].includes(e.Action)).length,0);
const packages=['security','evidence','read'].map(suffix=>{
  const pkg='clawreef/internal/systembackup'+suffix;
  const end=events.filter(e=>e.Package===pkg&&!e.Test&&['pass','fail'].includes(e.Action));
  assert.equal(end.length,1,pkg);assert.equal(end[0].Action,'pass');
  const tests=events.filter(e=>e.Package===pkg&&e.Test&&e.Action==='pass');
  assert.equal(tests.length,new Set(tests.map(e=>e.Test)).size);
  return {package:pkg,main_pass:tests.filter(e=>!e.Test.includes('/')).length,all_pass:tests.length};
});
const roots=[...text('backend/internal/systembackupevidence/download_task_owner_test.go').matchAll(/^func (TestSQLTaskDownload\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]);
assert.ok(roots.length>=9);
for(const name of roots)assert.equal(events.filter(e=>e.Test===name&&e.Action==='pass').length,1,name);
const selected=events.filter(e=>e.Action==='pass'&&e.Test&&roots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
assert.equal(hash(Buffer.from(manifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),manifest.source_sha256);
const inventory=text(rel+'-current-files.txt');
const exempt=new Set([
  'docs/system-backup-restore-schema-inventory.json',
  'docs/evidence/a-config-canonical-request-vectors-20261014.json',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
  'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
  'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json',
]);
const include=p=>(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/i.test(p)||exempt.has(p))&&
  !/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i.test(p)&&
  /\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(p);
const current=new Set(inventory.trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).filter(include));
const expected=new Set(manifest.files.map(f=>f.path)),drift=[];
for(const p of current)if(!expected.has(p))drift.push({path:p,reason:'new'});
for(const pin of manifest.files){
  const file=path.resolve(root,pin.path);assert.ok(file.startsWith(root+path.sep));
  if(!current.has(pin.path)||!fs.existsSync(file)){drift.push({path:pin.path,reason:'missing'});continue;}
  const b=fs.readFileSync(file);
  if(b.length!==pin.size||hash(b)!==pin.sha256)drift.push({path:pin.path,reason:'changed'});
}
const owner=json('docs/evidence/d-download-task-owner-run-owner-20261019-r28.json');
const cleanup=json('docs/evidence/d-download-task-owner-cleanup-20261019.json');
assert.equal(cleanup.all_absent,true);
assert.equal(cleanup.cache_path,owner.path);
for(const entry of cleanup.directories){
  assert.equal(path.dirname(entry.path).toLowerCase(),root.toLowerCase());
  assert.equal(entry.exists,false);assert.equal(fs.existsSync(entry.path),false);
}
const attempts=cleanup.runs.map(name=>{
  assert.match(name,/^d-download-task-owner-(?:focused|packages)-20261019-r\d+$/);
  const p='docs/evidence/'+name,log=text(p+'-native.txt');
  const snapshot=log.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
  assert.ok(cleanup.directories.some(e=>e.path===snapshot));
  assert.match(log,/CLEANED snapshot=True/);
  const code=Number(log.match(/d_admission_native_exit=(\d+)/)[1]);
  const e=text(p+'.jsonl').trim().split('\n').map(JSON.parse);
  assert.equal(code===0,!e.some(x=>['fail','build-fail'].includes(x.Action)));
  return {prefix:name,native_exit:code,accepted_only_for_its_frozen_sources:code===0,go_sha256:hash(bytes(p+'.jsonl')),source_sha256:json(p+'-source.json').source_sha256};
});
assert.ok(attempts.some(a=>a.prefix===prefix&&a.native_exit===0));
const result={kind:'d_download_four_task_owner_frozen_review',source_files:manifest.files.length,source_sha256:manifest.source_sha256,capture_attempts:manifest.capture_attempts,
  packages,go_main_pass:packages.reduce((n,p)=>n+p.main_pass,0),go_all_pass:packages.reduce((n,p)=>n+p.all_pass,0),new_roots:roots,new_all_pass:selected.length,
  current_source_drift:drift,current_sources_match:drift.length===0,attempts,cleanup:cleanup.directories,
  log_hashes:{go:hash(bytes(rel+'.jsonl')),source:hash(bytes(rel+'-source.json')),native:hash(bytes(rel+'-native.txt'))},
  actual_task_tables:['system_backups','system_restore_drills','system_backup_preflights','system_backup_artifact_verifications'],
  reference_columns_from_published_and_candidate_ddl:23,installed_dependencies:false,actual_mysql:false,current_server_rerun:false,
  production_main_enabled:false,formal_schema_or_grants_installed:false,original_six_scopes_complete:false,
  limitations:'Actual task/reference SQL adapter, session/RBAC/manifest policy, admission/post-commit and independent result code on scripted SQL. Row data, capacity and materials remain synthetic. No actual InnoDB locking/grants/physical capacity/GC or deployment evidence. Other owner types still require their own authoritative adapters; metadata visibility must be established by formal schema/grants review.'};
fs.writeFileSync(path.join(root,rel+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main:result.go_main_pass,all:result.go_all_pass,new_roots:roots.length,new_all:selected.length,source_files:manifest.files.length,drift,cleaned:cleanup.directories.length}));
