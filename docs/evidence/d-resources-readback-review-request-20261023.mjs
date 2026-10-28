import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=f=>fs.readFileSync(path.join(root,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=f=>JSON.parse(read(f).toString('utf8').replace(/^\uFEFF/,''));
const previous='docs/evidence/d-resources-northbound-review-request-20261023.json',prior=json(previous);
for(const f of prior.source_files)assert.equal(sha(read(f.path)),f.sha256,f.path);
const egressReview='docs/evidence/a-resources-egress-reviewed-20261023.json',a=json(egressReview);
assert.equal(a.status,'private_disabled_candidate_and_frozen_synthetic_tests_accepted');assert.equal(a.production_approved,false);assert.equal(a.B_network_policy_accepted,false);assert.equal(sha(read(a.request.path)),a.request.sha256);
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name];}).sort();
const paths=[...new Set([...prior.source_files.map(f=>f.path),...walk('backend/internal/systembackupresources'),previous,egressReview,
  'docs/evidence/a-resources-egress-review-20261023.mjs','docs/evidence/a-resources-frozen-run-review.mjs','docs/system-backup-a-resources-egress-review-20261023.md',
  'docs/system-backup-d-resources-readback-20261023.md','docs/evidence/d-resources-readback-review-request-20261023.mjs'])].sort();
const source_files=paths.map(f=>{const b=read(f);return {path:f,size:b.length,sha256:sha(b)};});
const result={kind:'d_resources_readback_composition_review_request.v1',date:'2026-10-23',policy_version:prior.policy_version,previous_request:previous,
  status:'single_transaction_readback_candidate_pending_A_B_review_and_production_proofs',source_files,source_digest:sha(Buffer.from(JSON.stringify(source_files))),
  tables:prior.tables.map(t=>({...t,normalized_candidate:t.table==='egress_private_exceptions'?'A_historical_candidate_and_frozen_tests_accepted_B_policy_review_and_proof_pending':t.normalized_candidate})),
  readback:{one_transaction:true,read_only:true,isolation:'repeatable_read',resource_tables:9,control_tables:35,control_probe:'SELECT_1_LIMIT_1',required_proofs:['target','all_expected_candidate_values','final_authority'],expected_input_isolated:true,commit_confirmation_and_post_context_required:true,production_proof_implemented:false},
  historical_reviews_received:[...prior.historical_reviews_received,{path:egressReview,scope:'old_private_egress_candidate_and_frozen_synthetic_tests_only',production_approved:false}],
  new_review_questions:['A_B_complete_candidate_authentication_on_exact_transaction_and_private_callback_adapter_contract','A_B_single_snapshot_control_exclusion_fields_final_authority_completion_outcomes','B_full_schema_DDL_freeze_SELECT_only_write_credential_destruction_and_actual_MySQL'],
  review_receipts:[],new_candidate_runtime_approved:false,source_target_proof_accepted:false,full_normalization_implemented:false,
  actual_mysql_executed:false,production_wired:false,registry_approval_written:false,messages_sent:false};
const output='docs/evidence/d-resources-readback-review-request-20261023.json';
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else {assert.ok(process.argv.includes('--check'));assert.deepEqual(json(output),result,'input bytes or file set changed; issue a new request');}
console.log(`D_RESOURCES_READBACK_REQUEST tables=9 controls=35 inputs=${source_files.length} A_B_review=pending production=no`);
if(process.argv.includes('--strict')){console.error('NOT_READY: readback review, B/C production proofs, four scan candidates and production acceptance missing');process.exitCode=1;}
