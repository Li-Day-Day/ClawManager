// Recover the already-reviewed bytes from our still-owned immutable build
// snapshot when concurrent work has changed a current file. Never re-pin drift.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const requestBytes=read('docs/evidence/d-resources-review-request-20261022.json');
assert.equal(hash(requestBytes),'de28bc5bd7369d3df9f6382f42701f510b5c0b22c50fc030b7769887b137daf3');
const request=JSON.parse(requestBytes);
const reviewed=JSON.parse(read('docs/evidence/a-resources-normalization-review-20261022.json'));
const source='.tmp-d-index-cache-6e63ce26ceaa4e97adb87e590a9e6927/source/';
const pins=[...reviewed.source_files,...reviewed.supplemental_files,reviewed.proposal,reviewed.decision];
const recovered=[];
const files=pins.map(pin=>{
 let bytes=read(pin.path);
 if(hash(bytes)!==pin.sha256 || bytes.length!==pin.size){
  bytes=read(source+pin.path);recovered.push(pin.path);
 }
 assert.equal(hash(bytes),pin.sha256,pin.path);assert.equal(bytes.length,pin.size);
 return {...pin,bytes_base64:bytes.toString('base64')};
});
assert.equal(files.length,31);
const capsule={kind:'a_resources_normalization_review_source_capsule.v1',request_sha256:hash(requestBytes),proposal_source_digest:request.source_digest,files,recovered_from_own_frozen_snapshot:recovered,production_approved:false};
const output='docs/evidence/a-resources-normalization-source-capsule-20261022.json';
fs.writeFileSync(path.join(root,output),JSON.stringify(capsule,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({path:output,sha256:hash(read(output)),files:files.length,recovered}));
