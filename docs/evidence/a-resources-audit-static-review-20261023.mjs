import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const pin=f=>{const b=read(f);return {path:f,size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};};
const request='docs/evidence/d-resources-audit-review-request-20261023.json',r=json(request);
assert.equal(r.policy_version,'d.resources.restore.v2');assert.equal(r.source_files.length,158);
for(const p of r.source_files)assert.deepEqual(pin(p.path),p);
const result={kind:'a_resources_audit_static_review.v1',date:'2026-10-23',status:'two_table_static_security_constraints_satisfied_validation_pending',request:pin(request),source_digest:r.source_digest,source_files:r.source_files,document:pin('docs/system-backup-a-resources-audit-review-20261023.md'),checker:pin('docs/evidence/a-resources-audit-static-review-20261023.mjs'),tables:['audit_logs','northbound_settings_audit'],validation_accepted:false,Go_tests_run_by_reviewer:false,B_proof_accepted:false,actual_SQL:false,complete_nine_table_normalization:false,current_whole_package_accepted:false,production_approved:false,registry_written:false};
const output='docs/evidence/a-resources-audit-static-reviewed-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result);}
console.log('A_AUDIT_STATIC_REVIEW tables=2 inputs=158 validation=pending production=no');
