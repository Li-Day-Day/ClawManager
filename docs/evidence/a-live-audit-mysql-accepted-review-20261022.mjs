// Replay only this accepted run's hash-pinned original receiver and source.
// Later live-tree changes are never substituted into the historical scope.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const prefix='docs/evidence/a-live-audit-mysql-aaudit-20261022144319-a2932cb5';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pinned=(p,hash)=>{const bytes=fs.readFileSync(path.join(root,p));assert.equal(sha(bytes),hash,p);return bytes;};
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--check'));
const receipt=pinned(prefix+'.json','c853673d41eae495af9d4cab8f4ef0e5b4c62c9302a87df705802332a4e96a16');
const transcript=pinned(prefix+'.txt','bee69adb9a8c29f95c0c12abecdba034b5b0673c67225cbaa833e4132a3ec792');
const capsule=JSON.parse(pinned(prefix+'-source-capsule.json','3b59c0a653c2bfb27180a2986c9f0120964349de4c4500c3151d0c0a8d9195f0'));
const accepted=JSON.parse(pinned('docs/evidence/a-live-audit-mysql-accepted-20261022.json','531e968ee960f6c5214e8e5db3a0159394db928db4b2dd81c0642156d47f2f3e'));
const run=JSON.parse(receipt);
assert.equal(capsule.run_id,'aaudit-20261022144319-a2932cb5');assert.equal(capsule.receipt_sha256,sha(receipt));
assert.equal(capsule.source_sha256,run.source_sha256);assert.equal(capsule.files.length,31);
assert.deepEqual(capsule.files.map(({bytes_base64,...pin})=>pin),run.files);
const owner=fs.mkdtempSync(path.join(root,'.tmp-a-audit-accepted-'));
try {
  const seen=new Set();
  for(const file of capsule.files) {
    assert.ok(!path.isAbsolute(file.path)&&!file.path.includes('\\')&&!file.path.split('/').some(p=>['','.','..'].includes(p)));
    assert.ok(!seen.has(file.path));seen.add(file.path);
    const bytes=Buffer.from(file.bytes_base64,'base64');assert.equal(sha(bytes),file.sha256);assert.equal(bytes.length,file.size);
    const target=path.join(owner,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
  }
  // Import is allowed only after every source byte, the entire capsule and the
  // original receipt are bound to independent constants from this acceptance.
  const original=await import(pathToFileURL(path.join(owner,'scripts/system-backup-a-live-audit-mysql-bundle.mjs')).href);
  const reviewed=original.reviewMySQLBundle(receipt,transcript,{sourceRoot:owner});
  assert.deepEqual(reviewed,accepted.review);assert.equal(reviewed.cases,17);
  assert.equal(reviewed.status,'isolated_mysql_receipt_verified');
  console.log('PASS accepted original MySQL audit: 17 cases, five SQL samples, source capsule/receipt/transcript/binary and cleanup; current live tree is outside this historical review');
} finally {
  assert.equal(path.dirname(path.resolve(owner)),root);assert.match(path.basename(owner),/^\.tmp-a-audit-accepted-[A-Za-z0-9]{6}$/);
  assert.equal(fs.lstatSync(owner).isSymbolicLink(),false);fs.rmSync(owner,{recursive:true,force:true});assert.equal(fs.existsSync(owner),false);
}
