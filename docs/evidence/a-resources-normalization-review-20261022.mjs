import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readCurrent = name => fs.readFileSync(path.join(root, name));
const capsuleBytes = readCurrent('docs/evidence/a-resources-normalization-source-capsule-20261022.json');
assert.equal(hash(capsuleBytes), '236d6d506287ad8acc87fe683da5df4367b8d2615de0e6ad1f00cfe40d43cdec', 'reviewed source capsule changed');
const capsule = JSON.parse(capsuleBytes);
assert.equal(capsule.files.length,31);
const frozen = new Map();
for(const file of capsule.files){
 const bytes=Buffer.from(file.bytes_base64,'base64');
 assert.equal(bytes.length,file.size);assert.equal(hash(bytes),file.sha256);
 assert.ok(!frozen.has(file.path));frozen.set(file.path,bytes);
}
const read = name => frozen.get(name) ?? readCurrent(name);
const pin = name => { const bytes = read(name); return {path:name,size:bytes.length,sha256:hash(bytes)}; };
const requestPath = 'docs/evidence/d-resources-review-request-20261022.json';
const documentPath = 'docs/system-backup-a-resources-normalization-review-20261022.md';
const output = path.join(root, 'docs/evidence/a-resources-normalization-review-20261022.json');
const requestBytes = read(requestPath);
assert.equal(hash(requestBytes), 'de28bc5bd7369d3df9f6382f42701f510b5c0b22c50fc030b7769887b137daf3', 'review request changed; review the new request');
const request = JSON.parse(requestBytes);
assert.equal(request.source_digest, '8f6e932251521fe0774b100f34495b79a695515bb27006448a771a9be784f335');
assert.equal(request.source_files.length, 25);
assert.equal(hash(read(request.document.path)), request.document.sha256, 'D proposal changed');
for (const source of request.source_files) assert.deepEqual(pin(source.path), source, 'D reviewed input changed: '+source.path);
assert.equal(hash(read(documentPath)), '7d4d2f5c362a4ae77f0f34556b238186b79ce376889b6372182eff64488f2bc7', 'A decision changed; review and rebind it');
const tables = ['audit_logs','egress_private_exceptions','northbound_admin_settings','northbound_settings_audit','security_scan_configs','security_scan_jobs'];
const supplemental = [
 'backend/internal/repository/northbound_repository.go',
 'backend/internal/services/northbound_admin_service.go',
 'backend/internal/northbound/auth_service.go',
 'backend/internal/systembackupresources/sql_counts.go',
];
const receipt = {
 kind:'a_resources_normalization_cross_review.v1', reviewed_date:'2026-10-22', reviewer_role:'A',
 status:'six_table_review_completed_changes_required', policy_version:'a.resources.restore-security.v1',
 request:pin(requestPath), proposal:pin(request.document.path), proposal_source_digest:request.source_digest,
 source_files:request.source_files, supplemental_files:supplemental.map(pin), decision:pin(documentPath),
 tables:tables.map(name=>{
  const object=request.objects.find(item=>item.name===name);
  assert.ok(object && object.required_cross_reviewers.includes('A'));
  assert.equal(object.normalizer_id, 'resources.'+name+'.normalize.v1');
  assert.equal(object.verifier_id, 'resources.'+name+'.verify.v1');
  return {name,normalizer_id:object.normalizer_id,verifier_id:object.verifier_id,conclusion:'changes_required',runtime_approved:false};
 }),
 registry_approval_written:false, source_or_target_proof_accepted:false,
 actual_mysql_executed:false, production_activation_approved:false,
 dependencies_installed:false, temporary_build_artifacts_created:false,
};
const args=process.argv.slice(2);
assert.ok(args.length===1 && ['--write','--check','--check-current'].includes(args[0]), 'choose --write, --check, or --check-current');
if(args[0]==='--write') fs.writeFileSync(output, JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),receipt);
if(args[0]==='--check-current')for(const source of [...request.source_files,...receipt.supplemental_files]){
 const bytes=readCurrent(source.path);
 assert.equal(hash(bytes),source.sha256,'current input differs from historical review: '+source.path);
 assert.equal(bytes.length,source.size);
}
console.log('A_RESOURCES_REVIEW six_tables=6 conclusion=changes_required pinned_sources=29 historical_capsule=verified registry_approval=no');
