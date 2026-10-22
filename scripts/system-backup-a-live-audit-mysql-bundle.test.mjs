import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest} from './system-backup-a-live-chain.mjs';
import {transcript} from './system-backup-a-live-audit-mysql-fixture.mjs';
import {reviewMySQLTranscript} from './system-backup-a-live-audit-mysql-review.mjs';
import {mysqlBundleSourcePins,mysqlSourceDigest,reviewMySQLBundle,mysqlBundleCLI} from './system-backup-a-live-audit-mysql-bundle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const encode=v=>Buffer.from(JSON.stringify(v));

test('frozen source catalog can load and execute the real reviewer without the checkout',async()=>{
  const owned=mkdtempSync(join(root,'.tmp-a-live-audit-bundle-'));
  try {
    const pins=mysqlBundleSourcePins();
    for(const pin of pins){const target=join(owned,pin.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(join(root,pin.path)),{flag:'wx'});}
    const frozen=await import(pathToFileURL(join(owned,'scripts/system-backup-a-live-audit-mysql-review.mjs')).href);
    assert.equal(frozen.reviewMySQLTranscript(transcript()).cases,17);
    const bundle=await import(pathToFileURL(join(owned,'scripts/system-backup-a-live-audit-mysql-bundle.mjs')).href);
    assert.deepEqual(bundle.mysqlBundleSourcePins(owned),pins);
  } finally {
    assert.equal(dirname(resolve(owned)),resolve(root));assert.ok(owned.startsWith(join(root,'.tmp-a-live-audit-bundle-')));rmSync(owned,{recursive:true,force:true});
  }
});

function fixture() {
  const pins=mysqlBundleSourcePins();
  const sourceSHA=mysqlSourceDigest(pins);
  const raw=Buffer.from('source_sha256='+sourceSHA+'\r\n'+transcript().replaceAll('\n','\r\n')+'\r\n');
  const review=reviewMySQLTranscript(raw.toString('utf8'));
  const script=readFileSync(join(root,'scripts/system-backup-a-live-audit-mysql.sh'),'utf8').replaceAll('\r\n','\n');
  const receipt={kind:'a_live_audit_collector_mysql_validation.v1',status:'isolated_mysql_collector_passed',started_at:'2026-10-22T00:00:00.0000000Z',completed_at:'2026-10-22T09:00:00.0000000Z',source_sha256:sourceSHA,files:pins,linux_test_sha256:review.binary_sha256,test_vet_passed:true,source_stable:true,remote_requested:true,remote_started:true,remote_cleanup_verified:true,local_cleanup_verified:true,dependencies_installed:false,real_http_verified:false,application_migrations_verified:false,tls_verified:false,evidence_binding_version:1,run_id:review.namespace,transcript_sha256:digest(raw),ssh_exit:0,remote_script_sha256:digest(Buffer.from(script)),remote_review:review};
  receipt.stage='completed';receipt.failure_stage='';
  return {receipt,raw};
}
test('bundle verifies exact Windows transcript bytes, source catalog and original SQL samples',()=>{
  const {receipt,raw}=fixture();const review=reviewMySQLBundle(encode(receipt),raw);
  assert.equal(review.status,'isolated_mysql_receipt_verified');assert.equal(review.cases,17);
  assert.equal(review.current_source_verified,true);assert.equal(review.real_http_verified,false);
  assert.equal(review.operator_provenance_required,true);
  assert.throws(()=>reviewMySQLBundle(encode(receipt),Buffer.from(raw.toString().replaceAll('\r\n','\n'))));
});
test('bundle rejects failed, local-only, incomplete and contradictory claims',()=>{
  const {receipt,raw}=fixture();
  for(const mutate of [r=>r.status='failed',r=>r.remote_started=false,r=>r.remote_requested=false,r=>r.local_cleanup_verified=false,r=>r.source_stable=false,r=>r.test_vet_passed=false,r=>r.ssh_exit=23,r=>r.real_http_verified=true,r=>r.tls_verified=true,r=>r.dependencies_installed=true,r=>r.evidence_binding_version=0,r=>r.completed_at='2026-10-21T00:00:00Z',r=>r.password='MUST_NOT_ACCEPT',r=>delete r.transcript_sha256]) {
    const r=structuredClone(receipt);mutate(r);assert.throws(()=>reviewMySQLBundle(encode(r),raw));
  }
  const json=JSON.stringify(receipt);assert.throws(()=>reviewMySQLBundle(Buffer.from('{"status":"failed",'+json.slice(1)),raw));
});
test('bundle rejects swapped runs, binaries and saved reviews even with matching log hashes',()=>{
  const {receipt,raw}=fixture();
  for(const mutate of [r=>r.run_id='aaudit-20261022000000-ffffffff',r=>r.linux_test_sha256='0'.repeat(64),r=>r.remote_review.cases=16,r=>r.remote_review.namespace_uid='99999999-2222-3333-4444-555555555555',r=>r.remote_script_sha256='0'.repeat(64)]) {
    const r=structuredClone(receipt);mutate(r);assert.throws(()=>reviewMySQLBundle(encode(r),raw));
  }
  const r=structuredClone(receipt),changed=Buffer.from(raw.toString().replace('source_sha256='+receipt.source_sha256,'source_sha256='+'0'.repeat(64)));r.transcript_sha256=digest(changed);
  assert.throws(()=>reviewMySQLBundle(encode(r),changed));
});
test('bundle refuses changed, duplicated, missing or unsafe source entries',()=>{
  const {receipt,raw}=fixture();
  for(const mutate of [r=>r.files[0].sha256='0'.repeat(64),r=>r.files[0].size++,r=>r.files.pop(),r=>r.files.push({...r.files[0]}),r=>r.files.push({path:'../private.dsn',size:10,sha256:'a'.repeat(64)})]) {
    const r=structuredClone(receipt);mutate(r);r.source_sha256=mysqlSourceDigest(r.files);
    const changed=Buffer.from(raw.toString().replace('source_sha256='+receipt.source_sha256,'source_sha256='+r.source_sha256));r.transcript_sha256=digest(changed);
    assert.throws(()=>reviewMySQLBundle(encode(r),changed));
  }
});
test('repairing the log hash cannot hide missing tests or altered audit data',()=>{
  const {receipt,raw}=fixture();
  for(const mutate of [s=>s.replace(/.*wrong_role.*\r\n/,''),s=>s.replace('"readonly":true','"readonly":false'),s=>s.replace('absent=yes','absent=unverified')]) {
    const changed=Buffer.from(mutate(raw.toString()));const r={...receipt,transcript_sha256:digest(changed)};
    assert.throws(()=>reviewMySQLBundle(encode(r),changed));
  }
});
test('read-only CLI accepts paths in either order and never modifies or creates evidence',()=>{
  const owned=mkdtempSync(join(root,'.tmp-a-live-audit-bundle-'));
  try {
    const {receipt,raw}=fixture();const json=encode(receipt),rp=join(owned,'receipt.json'),tp=join(owned,'transcript.txt');
    writeFileSync(rp,json);writeFileSync(tp,raw);
    assert.equal(mysqlBundleCLI(['--transcript',tp,'--receipt',rp]).status,'isolated_mysql_receipt_verified');
    for(const args of [['--receipt',rp],['--receipt',rp,'--receipt',tp],['--receipt',rp,'--output',tp],['--receipt',rp,'--transcript',rp]])assert.throws(()=>mysqlBundleCLI(args));
    assert.deepEqual(readFileSync(rp),json);assert.deepEqual(readFileSync(tp),raw);assert.equal(existsSync(join(owned,'review.json')),false);
  } finally {
    assert.equal(dirname(resolve(owned)),resolve(root));assert.ok(owned.startsWith(join(root,'.tmp-a-live-audit-bundle-')));rmSync(owned,{recursive:true,force:true});
  }
});
