import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const previous='docs/evidence/d-resources-audit-review-request-20261023.json';
const prior=json(previous);for(const f of prior.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const sqlReview='docs/evidence/a-resources-sql-reviewed-20261023.json',auditReview='docs/evidence/a-resources-audit-static-reviewed-20261023.json';
const sql=json(sqlReview),audit=json(auditReview);
assert.equal(sql.status,'private_candidate_and_frozen_synthetic_tests_accepted');assert.equal(sql.production_approved,false);
assert.equal(audit.status,'two_table_static_security_constraints_satisfied_validation_pending');assert.equal(audit.validation_accepted,false);assert.equal(audit.production_approved,false);
for(const r of [sql,audit])assert.equal(sha(read(r.request.path)),r.request.sha256);
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
const additions=[...walk('backend/internal/systembackupresources'),previous,sqlReview,auditReview,
  'docs/evidence/a-resources-sql-review-20261023.mjs','docs/evidence/a-resources-audit-static-review-20261023.mjs',
  'docs/system-backup-a-resources-sql-review-20261023.md','docs/system-backup-a-resources-audit-review-20261023.md',
  'docs/system-backup-d-resources-egress-candidate-20261023.md','docs/evidence/d-resources-egress-review-request-20261023.mjs'];
const paths=[...new Set([...prior.source_files.map(f=>f.path),...additions])].sort();
const source_files=paths.map(f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};});
const result={kind:'d_resources_egress_candidate_review_request.v1',date:'2026-10-23',policy_version:prior.policy_version,previous_request:previous,
  status:'three_offline_table_candidates_egress_pending_A_B_incremental_review_and_production_inputs',source_files,source_digest:sha(Buffer.from(JSON.stringify(source_files))),
  tables:prior.tables.map(t=>({...t,normalized_candidate:t.table==='egress_private_exceptions'?'complete_columns_offline_candidate_pending_A_B_review_and_target_proof':t.normalized_candidate})),
  historical_reviews_received:[{path:sqlReview,scope:'old_reader_and_frozen_synthetic_tests',production_approved:false},{path:auditReview,scope:'old_two_audit_tables_static_only',validation_accepted:false,production_approved:false}],
  review_receipts:[],user_confirmed_B_C_deliveries:'not_delivered_2026_10_23',new_candidate_runtime_approved:false,source_target_proof_accepted:false,
  full_normalization_implemented:false,actual_mysql_executed:false,production_wired:false,registry_approval_written:false,messages_sent:false};
const output='docs/evidence/d-resources-egress-review-request-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result,'input bytes or file set changed; issue a new request');}
console.log(`D_RESOURCES_EGRESS_REQUEST tables=9 offline_candidates=3 inputs=${source_files.length} A_B_egress_review=pending production=no`);
if(process.argv.includes('--strict')){console.error('NOT_READY: egress review, B/C proofs, six remaining candidates and production acceptance missing');process.exitCode=1;}
