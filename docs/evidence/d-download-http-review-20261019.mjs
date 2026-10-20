import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prefix=process.argv[2];assert.match(prefix??'',/^d-download-http-packages-20261019-r\d+$/);
const p='docs/evidence/'+prefix;
const bytes=n=>fs.readFileSync(path.join(root,n));
const text=n=>bytes(n).toString('utf8').replace(/^\uFEFF/,'').replaceAll('\r','');
const json=n=>JSON.parse(text(n));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=json(p+'-source.json'),native=text(p+'-native.txt');
assert.equal(manifest.stable_copy_verified,true);assert.equal(manifest.dependencies_installed,false);
assert.match(native,/NATIVE_EXIT full_packages=0 packages=\.\/internal\/systembackupsecurity,\.\/internal\/systembackupevidence,\.\/internal\/systembackupread,\.\/cmd\/server default_vet=yes/);
assert.match(native,/FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no/);
assert.match(native,/CLEANED snapshot=True/);assert.match(native,/d_admission_native_exit=0/);
assert.equal(bytes(p+'-stderr.txt').length,0);
const events=text(p+'.jsonl').split('\n').filter(Boolean).map(JSON.parse);
assert.equal(events.filter(e=>['fail','build-fail','skip'].includes(e.Action)).length,0);
const packages=['clawreef/internal/systembackupsecurity','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/cmd/server'].map(pkg=>{
  const terminal=events.filter(e=>e.Package===pkg&&!e.Test&&['pass','fail'].includes(e.Action));
  assert.equal(terminal.length,1,pkg);assert.equal(terminal[0].Action,'pass');
  const pass=events.filter(e=>e.Package===pkg&&e.Test&&e.Action==='pass');
  assert.equal(pass.length,new Set(pass.map(e=>e.Test)).size);
  return {package:pkg,main_pass:pass.filter(e=>!e.Test.includes('/')).length,all_pass:pass.length};
});
const roots=['backend/internal/systembackupevidence/download_result_test.go','backend/internal/systembackupevidence/download_admitted_http_test.go']
  .flatMap(file=>[...text(file).matchAll(/^func (Test\w+)\(t \*testing\.T\)/gm)].map(m=>m[1]));
roots.push('TestDownloadRuntimeAdmittedHTTPWithAtomicSQLSTSAndTransit','TestDownloadRuntimeWithoutAdmissionNeverInvokesPrivateCallback','TestDownloadAdmissionPinnedPublicClassificationDoesNotLoadMFA');
assert.equal(roots.length,13);
for(const name of roots)assert.equal(events.filter(e=>e.Test===name&&e.Action==='pass').length,1,name);
const selected=events.filter(e=>e.Action==='pass'&&e.Test&&roots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
const aRoots=['TestADownloadNativeBufferedOutputKeepsOriginalDeadline','TestADownloadPlaintextWipedAfterWriteAndAbort'];
for(const name of aRoots)assert.equal(events.filter(e=>e.Test===name&&e.Action==='pass').length,1,name);
const aSelected=events.filter(e=>e.Action==='pass'&&e.Test&&aRoots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
assert.equal(hash(Buffer.from(manifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')),manifest.source_sha256);
const listed=text(p+'-current-files.txt').trim().split('\n').map(x=>x.replaceAll('\\','/'));
const excluded=/(?:^|\/)(?:\.git|node_modules|vendor|uploads|cache|dist|build|__pycache__)(?:\/|$)/i;
const include=file=>/^(?:backend|contracts|scripts|docs)\//.test(file)&&(!file.startsWith('docs/')||/^docs\/[^/]+\.sql$/i.test(file)||[
  'docs/system-backup-restore-schema-inventory.json','docs/evidence/a-config-canonical-request-vectors-20261014.json',
  'docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json',
  'docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json',
  'docs/evidence/system-backup-d-sensitive-download-contract-20261016.json',
].includes(file))&&!excluded.test(file)&&/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/i.test(file);
const current=new Set(listed.filter(include)),expected=new Set(manifest.files.map(f=>f.path)),drift=[];
for(const file of current)if(!expected.has(file))drift.push({path:file,reason:'new'});
for(const pin of manifest.files){
  const resolved=path.resolve(root,pin.path);assert.ok(resolved.startsWith(root+path.sep));
  if(!current.has(pin.path)||!fs.existsSync(resolved)){drift.push({path:pin.path,reason:'missing'});continue;}
  const b=fs.readFileSync(resolved);if(b.length!==pin.size||hash(b)!==pin.sha256)drift.push({path:pin.path,reason:'changed'});
}
assert.ok(expected.has('docs/evidence/system-backup-d-sensitive-download-contract-20261016.json'));
const failures=['d-download-http-focused-20261019-r23','d-download-http-focused-20261019-r24'].map(name=>{
  const rel='docs/evidence/'+name,log=text(rel+'-native.txt'),e=text(rel+'.jsonl').split('\n').filter(Boolean).map(JSON.parse);
  assert.match(log,/NATIVE_EXIT focused_packages=1/);assert.match(log,/d_admission_native_exit=1/);
  assert.ok(e.some(x=>['fail','build-fail'].includes(x.Action)));
  return {prefix:name,go_sha256:hash(bytes(rel+'.jsonl')),stderr_sha256:hash(bytes(rel+'-stderr.txt')),accepted_as_whole_run_pass:false};
});
const old='docs/evidence/d-download-http-packages-20261019-r25',oldNative=text(old+'-native.txt');
assert.match(oldNative,/d_admission_native_exit=0/);
const before=json(old+'-source.json'),prior=new Map(before.files.map(f=>[f.path,f]));
const subsequent_inputs=manifest.files.filter(f=>!prior.has(f.path)||prior.get(f.path).sha256!==f.sha256).map(f=>({path:f.path,reason:prior.has(f.path)?'changed':'newly_included'}));
const owned=path.join(root,'.tmp-d-admission-http-20261019-r23');
const focused='docs/evidence/d-download-http-focused-20261019-r26';
assert.match(text(focused+'-native.txt'),/NATIVE_EXIT focused_packages=0/);
const cleanup=[owned,...['docs/evidence/d-download-http-focused-20261019-r23','docs/evidence/d-download-http-focused-20261019-r24',old,focused,p].map(rel=>{
  const log=text(rel+'-native.txt');assert.match(log,/CLEANED snapshot=True/);
  return log.match(/owner=([^\n]+\.tmp-d-index-cache-[a-f0-9]{32})/)[1];
})].map(directory=>{
  assert.equal(path.dirname(directory).toLowerCase(),root.toLowerCase());assert.equal(fs.existsSync(directory),false,directory);
  return {path:directory,exists:false};
});
const result={kind:'d_download_admitted_http_result_frozen_review',source_files:manifest.files.length,source_sha256:manifest.source_sha256,capture_attempts:manifest.capture_attempts,packages,
  go_main_pass:packages.reduce((n,p)=>n+p.main_pass,0),go_all_pass:packages.reduce((n,p)=>n+p.all_pass,0),new_roots:roots,new_all_pass:selected.length,
  independent_A_native_roots:aRoots,independent_A_native_all_pass:aSelected.length,
  current_source_drift:drift,current_sources_match:drift.length===0,cleanup,preserved_failed_runs:failures,
  preceding_full_run:{prefix:'d-download-http-packages-20261019-r25',accepted_only_for_its_frozen_sources:true,subsequent_inputs},
  focused_followup:{prefix:'d-download-http-focused-20261019-r26',native_exit:0,source_sha256:json(focused+'-source.json').source_sha256},
  log_hashes:{go:hash(bytes(p+'.jsonl')),native:hash(bytes(p+'-native.txt')),source:hash(bytes(p+'-source.json'))},
  installed_dependencies:false,actual_mysql:false,local_tls_sts_s3_transit_chain_verified:true,http_runtime_factory_wired:true,result_audit_wired:true,current_server_rerun:true,
  production_main_enabled:false,formal_schema_or_grants_installed:false,original_six_scopes_complete:false,
  limitations:'Scripted SQL and synthetic owners/reports/keys. Actual atomic admission, session/RBAC/config/capacity, HTTP binary response, result SQL and local TLS STS/S3/Transit run; no deployed owner/physical capacity, InnoDB/grants/GC acceptance, real historical upgrade, current production main activation, browser E2E or full original-goal completion.'};
fs.writeFileSync(path.join(root,p+'-review.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({main:result.go_main_pass,all:result.go_all_pass,new_roots:roots.length,new_all:selected.length,source_files:manifest.files.length,drift,cleaned:cleanup.length}));
