import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(path.join(root,f));
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const checker='docs/evidence/d-verification-http-actual-review-20261022.mjs';
const prefix='docs/evidence/d-verification-detail-remote-20261022-162855-be1f39f2';
const receipt='docs/evidence/d-verification-http-actual-accepted-20261022.json';
const manifest=json(prefix+'-source.json');
const scratch=fs.mkdtempSync(path.join(root,'.tmp-a-history-review-'));
const recovered=[];
const copy=(f,b=read(f))=>{const to=path.resolve(scratch,f);assert.ok(to.startsWith(scratch+path.sep));fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,b);};
let historyOutput;
try {
  for(const pin of manifest.files){
    let bytes=read(pin.path);
    if(sha(bytes)!==pin.sha256){
      bytes=execFileSync('git',['show','HEAD:'+pin.path],{cwd:root,maxBuffer:20*1024*1024});
      assert.equal(sha(bytes),pin.sha256,'no exact historical bytes: '+pin.path);
      recovered.push({path:pin.path,sha256:pin.sha256,source:'git HEAD blob; historical only'});
    }
    assert.equal(bytes.length,pin.size);copy(pin.path,bytes);
  }
  for(const f of [checker,receipt,prefix+'.txt',prefix+'-source.json',prefix+'-source.json.result.json'])copy(f);
  // Redirect only source reads to the historical capsule. Preserve the real
  // workspace root for the receipt's absolute cleanup-owner assertions.
  let code=read(checker).toString('utf8');
  const rootLine="const root = path.resolve(import.meta.dirname, '../..');";
  const rawLine='const raw = file => fs.readFileSync(path.join(root, file));';
  assert.equal(code.split(rootLine).length,2);assert.equal(code.split(rawLine).length,2);
  code=code.replace(rootLine,`const root = ${JSON.stringify(root)};`).replace(rawLine,`const raw = file => fs.readFileSync(path.join(${JSON.stringify(scratch)}, file));`);
  copy(checker,Buffer.from(code));
  historyOutput=execFileSync(process.execPath,[path.join(scratch,checker),'--check'],{cwd:scratch,encoding:'utf8'}).trim();
} finally {
  assert.equal(path.dirname(scratch),root);assert.ok(path.basename(scratch).startsWith('.tmp-a-history-review-'));
  fs.rmSync(scratch,{recursive:true,force:true});
}
const gcChecker='docs/evidence/d-gc-owner-lifecycle-actual-review-20261022.mjs';
const gcOutput=execFileSync(process.execPath,[gcChecker,'--check'],{cwd:root,encoding:'utf8'}).trim();
const pins=[checker,receipt,prefix+'.txt',prefix+'-source.json',prefix+'-source.json.result.json',gcChecker,'docs/evidence/d-gc-owner-lifecycle-actual-accepted-20261022.json'].map(f=>({path:f,sha256:sha(read(f))}));
const result={kind:'a_d_actual_receipts_review.v1',date:'2026-10-23',history:historyOutput,gc:gcOutput,recovered,pins,history_source_entries:manifest.files.length,cleanup:!fs.existsSync(scratch),remote_run:false,dependencies_installed:false,current_whole_tree_accepted:false,production_approved:false};
const output='docs/evidence/a-d-actual-receipts-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log(historyOutput+'\n'+gcOutput+'\nA_HISTORY_CAPSULE_CLEANED historical_files='+recovered.length);
