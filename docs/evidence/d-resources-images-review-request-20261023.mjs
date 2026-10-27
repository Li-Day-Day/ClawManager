import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const previous='docs/evidence/d-resources-egress-review-request-20261023.json';
const prior=json(previous);for(const f of prior.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const auditPath='docs/evidence/a-resources-audit-validated-20261023.json';
const audit=json(auditPath);assert.equal(audit.status,'two_audit_table_candidate_static_and_frozen_synthetic_tests_accepted');assert.equal(audit.production_approved,false);
assert.equal(sha(read(audit.request.path)),audit.request.sha256);
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
const additions=[...walk('backend/internal/systembackupresources'),previous,auditPath,'docs/evidence/a-resources-audit-validation-review-20261023.mjs',
  'backend/internal/services/system_image_setting_service.go','backend/internal/repository/system_image_setting_repository.go',
  'docs/system-backup-d-resources-images-candidate-20261023.md','docs/evidence/d-resources-images-review-request-20261023.mjs'];
const paths=[...new Set([...prior.source_files.map(f=>f.path),...additions])].sort();
const source_files=paths.map(f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};});
const result={kind:'d_resources_images_candidate_review_request.v1',date:'2026-10-23',policy_version:prior.policy_version,previous_request:previous,
  status:'four_offline_table_candidates_images_pending_B_incremental_review_and_production_inputs',source_files,source_digest:sha(Buffer.from(JSON.stringify(source_files))),
  tables:prior.tables.map(t=>({...t,normalized_candidate:t.table==='system_image_settings'?'complete_columns_offline_candidate_pending_B_review_and_target_identity_image_proof':t.normalized_candidate})),
  historical_reviews_received:[...prior.historical_reviews_received,{path:auditPath,scope:'old_two_audit_tables_static_and_frozen_synthetic_tests_only',production_approved:false}],
  new_review_questions:['B_exact_per_source_target_image_and_non_sensitive_projection','B_equivalence_identity_version_hash_domain_actual_collation_runtime_aliases_and_transaction_binding','B_target_ID_and_logical_occupancy_startup_default_environment_cache_gates'],
  review_receipts:[],new_candidate_runtime_approved:false,source_target_proof_accepted:false,full_normalization_implemented:false,
  actual_mysql_executed:false,production_wired:false,registry_approval_written:false,messages_sent:false};
const output='docs/evidence/d-resources-images-review-request-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result,'input bytes or file set changed; issue a new request');}
console.log(`D_RESOURCES_IMAGES_REQUEST tables=9 offline_candidates=4 inputs=${source_files.length} B_image_review=pending production=no`);
if(process.argv.includes('--strict')){console.error('NOT_READY: image/egress review, B/C proofs, five remaining candidates and production acceptance missing');process.exitCode=1;}
