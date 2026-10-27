import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const review='docs/evidence/a-resources-v2-reviewed-20261023.json';
const output='docs/evidence/d-a-resources-v2-intake-20261023.json';
const capsule='docs/evidence/d-a-resources-v2-capsule-20261023.json';
const a=json(review);
assert.equal(a.kind,'a_resources_v2_security_review.v1');
assert.equal(a.tables.length,6);
assert.ok(a.tables.every(t=>t.security_policy==='accepted_as_implementation_constraints' && t.runtime_approved===false));
assert.equal(a.production_approved,false);
const pins=[...a.source_files,a.request,a.document,a.checker];
let files;
if(process.argv.includes('--write')) {
  files=pins.map(p=>{const b=read(p.path);assert.equal(b.length,p.size);assert.equal(sha(b),p.sha256);return {...p,bytes_base64:b.toString('base64')};});
  const dir='backend/internal/systembackupresources';
  const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]).sort();
  assert.deepEqual(walk(dir),a.source_files.filter(p=>p.path.startsWith(dir+'/')).map(p=>p.path).sort());
  fs.writeFileSync(path.join(root,capsule),JSON.stringify({kind:'d_a_resources_v2_historical_capsule.v1',files},null,2)+'\n',{flag:'wx'});
} else {
  assert.ok(process.argv.includes('--check'));
  files=json(capsule).files;
}
assert.deepEqual(files.map(({bytes_base64,...p})=>p),pins);
for(const f of files) {const b=Buffer.from(f.bytes_base64,'base64');assert.equal(b.length,f.size);assert.equal(sha(b),f.sha256);}
const result={kind:'d_a_resources_v2_intake.v1',date:'2026-10-23',review,review_sha256:sha(read(review)),capsule,capsule_sha256:sha(read(capsule)),files:files.length,conclusion:'six_table_security_constraints_and_report_body_received',runtime_approved:false,production_approved:false,B_C_accepted:false,registry_written:false,new_SQL_reader_reviewed:false,scope:'historical_exact_sources_at_intake_new_files_do_not_inherit_review'};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(json(output),result);
console.log('D_A_RESOURCES_V2_INTAKE six_tables=6 report_body=1 historical_capsule=yes runtime=no');
