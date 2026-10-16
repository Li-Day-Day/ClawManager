import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { computeMigrationCatalog } from '../../scripts/system-backup-contract-check.mjs';
const root=new URL('../../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root));
const hash=(raw)=>createHash('sha256').update(raw).digest('hex');
const path='docs/evidence/a-download-and-migrations-review-20261016.json';
const review=JSON.parse(read(path));
assert.equal(review.pins.length,11);
for(const pin of review.pins){const current=read(pin.path);assert.equal(current.length,pin.size,pin.path);assert.equal(hash(current),pin.sha256,pin.path);}
const catalog=computeMigrationCatalog();
assert.equal(catalog.hash,review.migration_catalog.hash);assert.equal(catalog.file_count,95);
const decisions=JSON.parse(read('contracts/system-backup/v12/schema-registry-decisions.json')).decisions;
const config=decisions.find((item)=>item.name==='system_backup_configs');
assert.equal(config.owner,'D');assert.equal(config.backup_strategy,'metadata_only');assert.equal(config.restore_strategy,'reference_only');
assert.deepEqual(config.required_cross_reviewers,['A','B','C']);
const result={kind:'d_a_081_082_review_reception',recorded_at:new Date().toISOString(),status:'candidate_boundaries_received_formal_promotion_pending',
  a_receipt:path,a_receipt_sha256:hash(read(path)),pins_verified:review.pins,migration_catalog:catalog,
  existing_config_policy:config,
  proposed_maintenance_receipt_policy:{status:'d_owner_proposal_not_registered',owner:'D',data_classification:'confidential',backup_strategy:'metadata_only',restore_strategy:'reference_only',
    normalizer_id:null,verifier_id:'system_backup.config_maintenance_receipts.reference.verify.v1',depends_on:['table:system_backup_configs','table:audit_logs'],
    proposed_cross_reviewers:['A'],approved_cross_reviewers:[],installation_lifetime_replay_and_original_response:true,automatic_delete_gc:false,business_restore:false},
  proposed_control_health_policy:{status:'d_owner_proposal_not_registered',owner:'D',data_classification:'internal',backup_strategy:'metadata_only',restore_strategy:'reference_only',
    normalizer_id:null,verifier_id:'system_backup.control_health.reference.verify.v1',depends_on:['table:system_backup_configs','table:system_backup_installation_state'],
    proposed_cross_reviewers:['A'],approved_cross_reviewers:[],business_restore:false,reuse_source_observation_or_writer_token:false},
  bc_dependency_correction:'The existing formal system_backup_configs policy requires A/B/C cross review. A/D can prepare and validate the additive changes independently, but cannot complete formal shared-schema approval without the recorded reviewers.',
  pending:['Actual installed ledger/old SQL and reviewed upgrade identity','Current formal schema/catalog cross reviews and live schema evidence',
    'Receipt/audit immutability, runtime least-privilege and external GC/lifetime retention','Physical row/index/audit allocation and concurrent reservation adapter',
    'Exact formal-file fresh/upgrade acceptance; original canonical and runtime authorization for any actual backfill'],
  formal_registry_updated:false,formal_migrations_added:false,sensitive_download_proposal_adopted:false,production_approval:false};
writeFileSync(new URL('./system-backup-d-a-migration-review-20261016-r41.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,pins:review.pins.length,catalog:catalog.file_count,config_required_reviewers:config.required_cross_reviewers}));
