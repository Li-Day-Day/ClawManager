// The closeout snapshot has its own exact schema; do not coerce a resources
// snapshot or weaken that receiver to accept this different manifest format.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export function validateCloseoutSource(s){
 assert.ok(s&&typeof s==='object'&&!Array.isArray(s));
 assert.deepEqual(Object.keys(s).sort(),['kind','source_sha256','files','stable_copy_verified','dependencies_installed'].sort());
 assert.equal(s.kind,'d_local_closeout_snapshot.v1');assert.equal(s.stable_copy_verified,true);assert.equal(s.dependencies_installed,false);
 assert.match(s.source_sha256,/^[a-f0-9]{64}$/);assert.ok(Array.isArray(s.files)&&s.files.length>0);
 const paths=[];
 for(const p of s.files){
  assert.ok(p&&typeof p==='object'&&!Array.isArray(p));assert.deepEqual(Object.keys(p).sort(),['path','size','sha256'].sort());
  assert.equal(typeof p.path,'string');assert.match(p.path,/^(backend|contracts|scripts|docs)\//);assert.doesNotMatch(p.path,/[\\:\x00-\x1f\x7f]/);
  assert.ok(!p.path.split('/').some(v=>['','.', '..','.git','node_modules','vendor','uploads','cache','dist','build','__pycache__'].includes(v)));
  assert.match(p.path,/\.(?:go|mod|sum|sql|json|md|txt|sh|ps1|mjs|yaml|yml|tmpl|html|pem)$/);
  assert.ok(Number.isSafeInteger(p.size)&&p.size>=0);assert.match(p.sha256,/^[a-f0-9]{64}$/);paths.push(p.path);
 }
 assert.equal(new Set(paths).size,paths.length);assert.deepEqual(paths,[...paths].sort());
 const digest=crypto.createHash('sha256').update(s.files.map(p=>`${p.path}\0${p.sha256}\0${p.size}`).join('\n')+'\n').digest('hex');
 assert.equal(digest,s.source_sha256,'closeout source digest mismatch');
}
