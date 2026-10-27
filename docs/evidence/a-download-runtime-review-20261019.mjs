import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const mode=process.argv[2]??'--inspect';
const prefix='docs/evidence/d-download-http-packages-20261019-r27';
const read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(read(p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const events=read(prefix+'.jsonl').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const manifest=json(prefix+'-source.json'), native=read(prefix+'-native.txt'), declared=json(prefix+'-review.json');
const packages=[...new Set(events.filter(e=>!e.Test&&e.Action==='pass').map(e=>e.Package))].sort().map(p=>{
  const tests=events.filter(e=>e.Package===p&&e.Test&&e.Action==='pass');
  return {package:p,main:tests.filter(e=>!e.Test.includes('/')).length,total:tests.length};
});
if(mode==='--inspect'){console.log(JSON.stringify({packages,source:manifest.source_sha256,files:manifest.files.length}));process.exit(0)}
assert.ok(['--record','--verify'].includes(mode));
const checks=[],check=(name,condition)=>{assert.ok(condition,name);checks.push(name)};
check('all four complete packages passed once',JSON.stringify(packages.map(p=>p.package))===JSON.stringify(['clawreef/cmd/server','clawreef/internal/systembackupevidence','clawreef/internal/systembackupread','clawreef/internal/systembackupsecurity']));
check('no fail/build-fail/skip events',!events.some(e=>['fail','build-fail','skip'].includes(e.Action)));
for(const p of packages){const terminal=events.filter(e=>e.Package===p.package&&!e.Test&&['pass','fail','build-fail'].includes(e.Action));check('one actual successful terminal: '+p.package,terminal.length===1&&terminal[0].Action==='pass')}
const tests=events.filter(e=>e.Test&&e.Action==='pass');
check('unique package/test passing terminals',new Set(tests.map(e=>e.Package+'\0'+e.Test)).size===tests.length);
check('default vet and original native/outer exit zero',/^NATIVE_EXIT full_packages=0 .*default_vet=yes\s*$/m.test(native)&&/^d_admission_native_exit=0\s*$/m.test(native));
check('frozen postcheck and no installs/MySQL',native.includes('FROZEN_POSTCHECK pass=yes installed_dependencies=no actual_mysql=no'));
check('empty original stderr',fs.statSync(prefix+'-stderr.txt').size===0);
check('stable source capture, no installs',manifest.stable_copy_verified===true&&manifest.dependencies_installed===false);
check('unique source paths',new Set(manifest.files.map(f=>f.path)).size===manifest.files.length);
check('source digest independently recomputed',hash(manifest.files.map(f=>`${f.path}\0${f.sha256}\0${f.size}`).join('\n')+'\n')===manifest.source_sha256);
const a=json('docs/evidence/a-download-output-deadline-review-20261019.json');
check('same frozen source as independently accepted A native HTTP fixes',a.source.sha256===manifest.source_sha256&&a.source.files===manifest.files.length);
const roots=declared.new_roots;
check('thirteen D runtime/result roots present',roots.length===13&&new Set(roots).size===13&&roots.includes('TestDownloadRuntimeAdmittedHTTPWithAtomicSQLSTSAndTransit')&&roots.includes('TestDownloadResultUnknownCommitIsTerminal'));
check('all thirteen D roots passed',roots.every(r=>tests.some(e=>e.Test===r)));
const selected=tests.filter(e=>roots.some(r=>e.Test===r||e.Test.startsWith(r+'/')));
check('declared new D checks independently match raw log',selected.length===91&&declared.new_all_pass===selected.length);
const aRoots=['TestADownloadNativeBufferedOutputKeepsOriginalDeadline','TestADownloadPlaintextWipedAfterWriteAndAbort','TestADownloadEmptyBodyCheckedBeforeAdmissionWithBoundedRead'];
check('all twenty-three A HTTP checks also passed in same-source four-package run',tests.filter(e=>aRoots.some(r=>e.Test===r||e.Test.startsWith(r+'/'))).length===23&&aRoots.every(r=>tests.some(e=>e.Test===r)));
check('declared totals match original logs',declared.go_all_pass===tests.length&&declared.go_main_pass===tests.filter(e=>!e.Test.includes('/')).length);
const mutable=new Set(['scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-config-writer-validation.ps1','scripts/system-backup-a-download-mfa-dispatch.test.ps1']);
const excluded=[];
for(const pin of manifest.files){
  check('original source remains present: '+pin.path,fs.existsSync(pin.path));
  const b=fs.readFileSync(pin.path),current=hash(b);
  if(current!==pin.sha256||b.length!==pin.size){
    check('post-freeze change is an explicitly excluded new SQL dispatch input: '+pin.path,mutable.has(pin.path));
    excluded.push({path:pin.path,frozen_sha256:pin.sha256,current_sha256:current,reason:'new thirteen-case actual SQL profile, independently validated separately'});
  }
}
const cleanup=declared.cleanup.map(c=>{
  check('accurate D owner path stays in workspace: '+path.basename(c.path),path.dirname(path.resolve(c.path)).toLowerCase()===process.cwd().toLowerCase()&&/^\.tmp-d-(?:index-cache-[a-f0-9]{32}|admission-http-20261019-r23)$/.test(path.basename(c.path)));
  check('accurate D owner independently absent: '+path.basename(c.path),!fs.existsSync(c.path));
  return {path:c.path,independently_absent:true};
});
const artifacts=[prefix+'.jsonl',prefix+'-source.json',prefix+'-native.txt',prefix+'-stderr.txt',prefix+'-review.json','docs/evidence/a-download-output-deadline-review-20261019.json'].map(p=>({path:p,sha256:hash(fs.readFileSync(p))}));
const receipt={kind:'a_download_runtime_independent_review',version:1,date:'2026-10-19',status:'accepted_with_explicit_scope',source:{files:manifest.files.length,sha256:manifest.source_sha256},packages,total_tests:tests.length,main_tests:tests.filter(e=>!e.Test.includes('/')).length,new_D_roots:roots,new_D_checks:selected.length,new_A_checks:23,
  check_count:checks.length,checks,post_freeze_original_inputs_excluded:excluded,new_unfrozen_SQL_profile_files_excluded:['backend/internal/systembackupevidence/download_admission_a_mysql_test.go','scripts/system-backup-a-download-admission-dispatch.test.ps1','scripts/system-backup-a-download-admission-phase.sh'],cleanup,artifacts,
  scope:{actual_jwt_ed25519_and_runtime_factory:true,scripted_SQL:true,synthetic_owner_report_keys:true,local_TLS_STS_S3_Transit:true,actual_InnoDB:false,deployed_provider:false,formal_schema_grants:false,production_main_enabled:false,full_original_goal_complete:false}};
// Source-presence checks are intentionally individually named in the receipt;
// they do not turn changed dispatch/new tagged probes into accepted code.
const output='docs/evidence/a-download-runtime-review-20261019.json';
if(mode==='--verify')assert.deepEqual(json(output),receipt);else fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,checks:checks.length,tests:tests.length,excluded:excluded.length,cleaned:cleanup.length}));
