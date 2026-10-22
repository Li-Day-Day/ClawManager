// Offline operator receipt review. Hash bindings do not constitute a signature.
import assert from 'node:assert/strict';
import {lstatSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeDownloadInput} from './system-backup-a-download-deployment.mjs';
import {digest,readLiveFile} from './system-backup-a-live-chain.mjs';
import {capacityTimeNS} from './system-backup-a-capacity-material-review.mjs';
import {reviewMySQLTranscript} from './system-backup-a-live-audit-mysql-review.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const hash=/^[a-f0-9]{64}$/;
const fields=(o,keys)=>{assert.ok(o&&typeof o==='object'&&!Array.isArray(o));assert.deepEqual(Object.keys(o).sort(),[...keys].sort());};
function sourceBytes(sourceRoot,path) {
  assert.match(path,/^(?:backend\/(?:go\.(?:mod|sum)|cmd\/system-backup-audit-collect\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:go|sql|json)|internal\/systembackupsecurity\/(?:registration_runtime|bootstrap_deployment)\.go|cmd\/system-backup-registration\/download_(?:deployment|grants|readiness)\.go)|scripts\/system-backup-[a-z0-9-]+\.(?:mjs|ps1|sh))$/);
  let current=resolve(sourceRoot);
  assert.ok(!lstatSync(current).isSymbolicLink());
  for(const part of path.split('/')) {current=join(current,part);assert.ok(!lstatSync(current).isSymbolicLink());}
  assert.ok(lstatSync(current).isFile());
  return readLiveFile(current,1048576);
}
export function mysqlBundleSourcePins(sourceRoot=root) {
  const files=new Set(['backend/go.mod','backend/go.sum','scripts/system-backup-a-live-audit-mysql.ps1','scripts/system-backup-a-live-audit-mysql.sh','scripts/system-backup-a-evidence-go-step.ps1','scripts/system-backup-d-index-source-snapshot.ps1',
    'backend/internal/systembackupsecurity/registration_runtime.go','backend/internal/systembackupsecurity/bootstrap_deployment.go',
    'backend/cmd/system-backup-registration/download_deployment.go','backend/cmd/system-backup-registration/download_grants.go','backend/cmd/system-backup-registration/download_readiness.go']);
  function walk(path) {
    let current=resolve(sourceRoot);assert.ok(!lstatSync(current).isSymbolicLink());
    for(const part of path.split('/')) {current=join(current,part);assert.ok(!lstatSync(current).isSymbolicLink());}
    assert.ok(lstatSync(current).isDirectory());
    assert.ok(files.size<=128&&path.split('/').length<=8);
    for(const item of readdirSync(current,{withFileTypes:true})) {
      const child=path+'/'+item.name;assert.ok(!item.isSymbolicLink());
      if(item.isDirectory())walk(child);else {assert.ok(item.isFile());files.add(child);}
    }
  }
  walk('backend/cmd/system-backup-audit-collect');
  const queue=['scripts/system-backup-a-live-audit-mysql-review.mjs','scripts/system-backup-a-live-audit-mysql-bundle.mjs'];
  while(queue.length) {
    const path=queue.shift();if(files.has(path))continue;files.add(path);
    const text=new TextDecoder('utf-8',{fatal:true}).decode(sourceBytes(sourceRoot,path));
    for(const match of text.matchAll(/from\s+['"]\.\/([A-Za-z0-9._-]+\.mjs)/g))queue.push('scripts/'+match[1]);
  }
  return [...files].sort().map(path=>{const raw=sourceBytes(sourceRoot,path);return {path,size:raw.length,sha256:digest(raw)};});
}
// Preserve the PowerShell manifest order when reproducing its NUL-separated hash.
export const mysqlSourceDigest=pins=>digest(Buffer.from(pins.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n'));

export function reviewMySQLBundle(receiptRaw,transcriptRaw,{sourceRoot=root}={}) {
  assert.ok(receiptRaw.length>0&&receiptRaw.length<=1048576&&transcriptRaw.length>0&&transcriptRaw.length<=2000000);
  const r=decodeDownloadInput(receiptRaw);
  fields(r,['kind','status','started_at','completed_at','source_sha256','files','linux_test_sha256','test_vet_passed','source_stable','remote_requested','remote_started','remote_cleanup_verified','local_cleanup_verified','dependencies_installed','real_http_verified','application_migrations_verified','tls_verified','evidence_binding_version','run_id','transcript_sha256','ssh_exit','remote_script_sha256','remote_review','stage','failure_stage']);
  assert.equal(r.kind,'a_live_audit_collector_mysql_validation.v1');
  assert.equal(r.evidence_binding_version,1);assert.equal(r.status,'isolated_mysql_collector_passed');assert.equal(r.ssh_exit,0);
  assert.equal(r.stage,'completed');assert.equal(r.failure_stage,'');
  for(const key of ['test_vet_passed','source_stable','remote_requested','remote_started','remote_cleanup_verified','local_cleanup_verified'])assert.equal(r[key],true);
  for(const key of ['dependencies_installed','real_http_verified','application_migrations_verified','tls_verified'])assert.equal(r[key],false);
  assert.match(r.run_id,/^aaudit-[0-9]{14}-[a-f0-9]{8}$/);
  assert.ok(capacityTimeNS(r.started_at)<=capacityTimeNS(r.completed_at));
  for(const key of ['source_sha256','linux_test_sha256','transcript_sha256','remote_script_sha256'])assert.match(r[key],hash);
  assert.equal(digest(transcriptRaw),r.transcript_sha256);
  assert.ok(Array.isArray(r.files)&&r.files.length>0&&r.files.length<=128);
  const seen=new Set();
  for(const pin of r.files) {
    fields(pin,['path','size','sha256']);assert.equal(typeof pin.path,'string');assert.ok(!seen.has(pin.path));seen.add(pin.path);
    assert.ok(Number.isSafeInteger(pin.size)&&pin.size>0&&pin.size<=1048576);assert.match(pin.sha256,hash);
  }
  assert.equal(mysqlSourceDigest(r.files),r.source_sha256);
  const actual=mysqlBundleSourcePins(sourceRoot);
  assert.deepEqual([...seen].sort(),actual.map(p=>p.path));
  for(const pin of actual)assert.deepEqual(r.files.find(p=>p.path===pin.path),pin);
  const script=sourceBytes(sourceRoot,'scripts/system-backup-a-live-audit-mysql.sh');
  assert.equal(digest(Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(script).replaceAll('\r\n','\n'))),r.remote_script_sha256);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(transcriptRaw);
  const headers=[...text.matchAll(/^source_sha256=([a-f0-9]{64})$/gm)];assert.equal(headers.length,1);assert.equal(headers[0][1],r.source_sha256);
  const review=reviewMySQLTranscript(text);
  assert.deepEqual(review,r.remote_review);
  assert.equal(review.namespace,r.run_id);assert.equal(review.binary_sha256,r.linux_test_sha256);
  return {...review,kind:'a_live_audit_collector_mysql_bundle_review.v1',status:'isolated_mysql_receipt_verified',receipt_sha256:digest(receiptRaw),transcript_sha256:r.transcript_sha256,source_sha256:r.source_sha256,current_source_verified:true,operator_provenance_required:true};
}

export function mysqlBundleCLI(args=process.argv.slice(2)) {
  assert.equal(args.length,4);
  const options={};for(let at=0;at<args.length;at+=2){assert.ok(!Object.hasOwn(options,args[at]));options[args[at]]=args[at+1];}
  fields(options,['--receipt','--transcript']);
  for(const [key,limit] of [['--receipt',1048576],['--transcript',2000000]]) {
    const info=lstatSync(resolve(options[key]));assert.ok(info.isFile()&&info.size>0&&info.size<=limit);
  }
  return reviewMySQLBundle(readLiveFile(resolve(options['--receipt']),1048576),readLiveFile(resolve(options['--transcript']),2000000));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(mysqlBundleCLI()));}
  catch {console.error('MySQL receipt bundle rejected; matching current source and a complete bound remote receipt are required');process.exitCode=1;}
}
