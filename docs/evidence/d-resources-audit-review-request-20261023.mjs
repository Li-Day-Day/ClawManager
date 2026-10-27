import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const previous='docs/evidence/d-resources-sql-review-request-20261023.json';
const prior=json(previous);
for(const f of prior.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
const additions=[...walk('backend/internal/systembackupresources'),previous,'docs/system-backup-d-resources-audit-candidate-20261023.md','docs/evidence/d-resources-audit-review-request-20261023.mjs'];
const paths=[...new Set([...prior.source_files.map(f=>f.path),...additions])].sort();
const source_files=paths.map(f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};});
const result={kind:'d_resources_audit_candidate_review_request.v1',date:'2026-10-23',policy_version:prior.policy_version,previous_request:previous,
  status:'two_audit_table_offline_candidates_pending_incremental_review_and_B_proof',
  source_files,source_digest:sha(Buffer.from(JSON.stringify(source_files))),
  tables:prior.tables.map(t=>({...t,normalized_candidate:['audit_logs','northbound_settings_audit'].includes(t.table)?'complete_columns_offline_candidate_pending_review_and_B_transaction_proof':t.normalized_candidate})),
  user_confirmed_B_C_deliveries:'not_delivered_2026_10_23',review_receipts:[],new_candidate_runtime_approved:false,
  source_target_proof_accepted:false,full_normalization_implemented:false,actual_mysql_executed:false,production_wired:false,registry_approval_written:false,messages_sent:false};
const output='docs/evidence/d-resources-audit-review-request-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result,'current inputs changed; preserve this request and issue a new revision');}
console.log(`D_RESOURCES_AUDIT_REQUEST tables=9 audit_candidates=2 inputs=${source_files.length} runtime_review=pending production=no`);
if(process.argv.includes('--strict')){console.error('NOT_READY: incremental review, B/C proofs, seven remaining candidates and production acceptance missing');process.exitCode=1;}
