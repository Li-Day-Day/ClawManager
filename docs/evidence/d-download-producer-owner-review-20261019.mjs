import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix=process.argv[2];assert.match(prefix??'',/^d-download-producer-owner-packages-20261019-r\d+$/);
const rel='docs/evidence/'+prefix;
const bytes=n=>fs.readFileSync(path.join(root,n));
const text=n=>bytes(n).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=n=>JSON.parse(text(n));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=json(rel+'-source.json'),native=text(rel+'-native.txt');
assert.equal(manifest.stable_copy_verified,true);assert.equal(manifest.dependencies_installed,false);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/internal\/systembackupproducer default_vet=yes/);
assert.match(native,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native,/CLEANED snapshot=True/);assert.match(native,/d_admission_native_exit=0/);
assert.equal(bytes(rel+'-stderr.txt').length,0);
const events=text(rel+'.jsonl').trim().split('\n').map(JSON.parse);
assert.equal(events.filter(e=>['fail','build-fail','skip'].includes(e.Action)).length,0);
const packages=['security','evidence','read','producer'].map(suffix=>{
  const pkg='clawreef/internal/systembackup'+suffix;
  const end=events.filter(e=>e.Package===pkg&&!e.Test&&['pass','fail'].includes(e.Action));
  assert.equal(end.length,1,pkg);assert.equal(end[0].Action,'pass');
  const tests=events.filter(e=>e.Package===pkg&&e.Test&&e.Action==='pass');
  assert.equal(tests.length,new Set(tests.map(e=>e.Test)).size);
  return {package:pkg,main_pass:tests.filter(e=>!e.Test.includes('/')).length,all_pass:tests.length};
});
const roots=['backend/internal/systembackupevidence/download_producer_owner_test.go','backend/internal/systembackupevidence/download_public_release_test.go'].flatMap(p=>[...text(p).matchAll(/^func (Test(?:ProducerDownload|PublicDownload)\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]));
assert.ok(roots.length>=10);
for(const name of roots)assert.equal(events.filter(e=>e.Test===name&&e.Action==='pass').length,1,name);
const selected=events.filter(e=>e.Action==='pass'&&e.Test&&roots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
assert.equal(sha(Buffer.from(manifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),manifest.source_sha256);
const exempt=new Set(['docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json','docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json','docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json','docs/evidence/system-backup-d-sensitive-download-contract-20261016.json']);
const include=p=>(!p.startsWith('docs/')||/^docs\/[^/]+\.sql$/i.test(p)||exempt.has(p))&&!/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i.test(p)&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(p);
const current=new Set(text(rel+'-current-files.txt').trim().split('\n').map(p=>p.replaceAll('\\','/')).filter(include));
const expected=new Set(manifest.files.map(f=>f.path)),drift=[];
for(const p of current)if(!expected.has(p))drift.push({path:p,reason:'new'});
for(const pin of manifest.files){
  const file=path.resolve(root,pin.path);assert.ok(file.startsWith(root+path.sep));
  if(!current.has(pin.path)||!fs.existsSync(file)){drift.push({path:pin.path,reason:'missing'});continue;}
  const b=fs.readFileSync(file);if(b.length!==pin.size||sha(b)!==pin.sha256)drift.push({path:pin.path,reason:'changed'});
}
const owner=json('docs/evidence/d-download-producer-owner-run-owner-20261019-r39.json');
const cleanup=json('docs/evidence/d-download-producer-owner-cleanup-20261019-r45.json');
assert.equal(cleanup.all_absent,true);assert.equal(cleanup.cache_path,owner.path);
for(const d of cleanup.directories){assert.equal(path.dirname(d.path).toLowerCase(),root.toLowerCase());assert.equal(d.exists,false);assert.equal(fs.existsSync(d.path),false);}
const attempts=cleanup.runs.map(name=>{
  assert.match(name,/^d-download-producer-owner-(?:focused|packages)-20261019-r\d+$/);
  const p='docs/evidence/'+name,log=text(p+'-native.txt');
  const code=Number(log.match(/d_admission_native_exit=(\d+)/)[1]);assert.match(log,/CLEANED snapshot=True/);
  const e=text(p+'.jsonl').trim().split('\n').map(JSON.parse);
  assert.equal(code===0,!e.some(x=>['fail','build-fail'].includes(x.Action)));
  const snapshot=log.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
  assert.ok(cleanup.directories.some(d=>d.path===snapshot));
  return {prefix:name,source_sha256:json(p+'-source.json').source_sha256,go_sha256:sha(bytes(p+'.jsonl')),native_exit:code,accepted_only_for_its_frozen_sources:code===0,preserved_failed_run:code!==0};
});
assert.ok(attempts.some(a=>a.prefix===prefix&&a.native_exit===0));
const aRoot='TestAProducerDownloadChangedOriginalAfterCommit';
assert.equal(events.filter(e=>e.Test===aRoot&&e.Action==='pass').length,1);
const aTests=events.filter(e=>e.Test&&(e.Test===aRoot||e.Test.startsWith(aRoot+'/'))&&e.Action==='pass');
const aNativeRoots=[...text('backend/internal/systembackupevidence/download_output_deadline_a_test.go').matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]);
for(const name of aNativeRoots)assert.equal(events.filter(e=>e.Test===name&&e.Action==='pass').length,1,name);
const aNativeTests=events.filter(e=>e.Action==='pass'&&e.Test&&aNativeRoots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
const pathTests=['powershell','pwsh'].map(shell=>{
  const p=`docs/evidence/d-download-producer-owner-path-${shell}-20261019-r39.txt`;
  assert.match(text(p),/PASS manifest-path cases=11 .*outputs-created=no build=no remote=no/);
  return {shell,cases:11,sha256:sha(bytes(p))};
});
const refreshLog=text('docs/evidence/d-download-producer-owner-source-refresh-20261019-r38.txt');
const refreshPath=refreshLog.match(/REFRESH_CLEANED path=([^\n]+) absent=True/)[1];
assert.equal(fs.existsSync(refreshPath),false);assert.ok(cleanup.directories.some(d=>d.path===refreshPath));
const prior=json('docs/evidence/d-download-producer-owner-packages-20261019-r35-source.json');
const priorMap=new Map(prior.files.map(f=>[f.path,f]));
const afterPrior=manifest.files.filter(f=>!priorMap.has(f.path)||priorMap.get(f.path).sha256!==f.sha256).map(f=>f.path);
const result={kind:'d_download_historical_producer_owner_frozen_review',source_files:manifest.files.length,source_sha256:manifest.source_sha256,capture_attempts:manifest.capture_attempts,
  packages,go_main_pass:packages.reduce((n,p)=>n+p.main_pass,0),go_all_pass:packages.reduce((n,p)=>n+p.all_pass,0),new_roots:roots,new_all_pass:selected.length,
  current_source_drift:drift,current_sources_match:drift.length===0,cleanup:cleanup.directories,attempts,
  independent_A_root:aRoot,independent_A_all_pass:aTests.length,manifest_path_script_tests:pathTests,
  independent_A_native_roots:aNativeRoots,independent_A_native_all_pass:aNativeTests.length,
  preceding_full_run:{prefix:'d-download-producer-owner-packages-20261019-r35',subsequent_inputs:afterPrior,scope:'Before streaming receipt/ref scans and original manifest validation in independent result locking.'},
  log_hashes:{go:sha(bytes(rel+'.jsonl')),native:sha(bytes(rel+'-native.txt')),source:sha(bytes(rel+'-source.json'))},
  installed_dependencies:false,actual_mysql:false,producer_codec_full_package_rerun:true,current_server_rerun:false,production_main_enabled:false,formal_schema_or_grants_installed:false,original_six_scopes_complete:false,
  limitations:'Actual SQL owners for four tasks plus historical producer capability evidence, strict C1 projections, session/RBAC/config, atomic admission, committed SQL S3/frame/unwrap checks and independent result on scripted SQL and synthetic rows/reports/materials. No actual InnoDB/grants/GC, physical capacity, deployed provider, other owner write-deadline sources, production main, historical deployment or full original-goal acceptance.'};
result.public_claim_release_independent_of_session_verified=true;
result.package_timeout_seconds=900;
result.original_request_proof_claim_provider_deadlines_extended=false;
assert.match(native,/NATIVE_TIME_BUDGET package_timeout_seconds=900 request_deadlines_unchanged=yes/);
fs.writeFileSync(path.join(root,rel+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main:result.go_main_pass,all:result.go_all_pass,new_roots:roots.length,new_all:selected.length,source_files:manifest.files.length,drift,cleaned:cleanup.directories.length}));
if(drift.length)process.exitCode=1;
