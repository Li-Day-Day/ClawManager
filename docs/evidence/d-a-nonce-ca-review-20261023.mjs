import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const requestPath='docs/evidence/a-nonce-ca-peer-review-request-20261023.json';
const request=JSON.parse(read(requestPath));
assert.equal(request.source_sha256,'c8cd927fb10133cabab70dd00f58dce092534d1d6e05a33a59314488a99d1e34');
assert.equal(request.source_files,383);
for(const pin of request.evidence){const b=read(pin.path);assert.equal(b.length,pin.size);assert.equal(hash(b),pin.sha256);}
const source=read('backend/internal/systembackupcatrust/ca.go').toString();
assert.match(source,/type Binding struct/);
assert.doesNotMatch(source,/func\s*\(\s*(?:[A-Za-z_]\w*\s+)?\*?Binding\s*\)\s*(?:String|GoString|MarshalJSON)\s*\(/,'CA Binding changed: this finding needs a new review');
const reviewedFiles=[requestPath,...request.evidence.map(p=>p.path),'backend/internal/systembackupsecurity/bootstrap_admission.go','backend/internal/db/migrations/066_add_system_backup_config_and_operations.sql','backend/internal/db/migrations/075_add_system_backup_strong_auth_nonces.sql','docs/system-backup-d-a-nonce-ca-review-20261023.md','docs/evidence/d-a-nonce-ca-review-20261023.mjs'];
const result={kind:'d_a_nonce_ca_non_implementer_review.v1',reviewer:'D',status:'changes_requested',source_sha256:request.source_sha256,source_files:383,
  findings:[{id:'D-A-CA-01',priority:2,file:'backend/internal/systembackupcatrust/ca.go',line:34,title:'Public CA Binding lacks redacted formatting and JSON rejection',counterexample:'fmt.Sprintf("%+v %#v", b, &b) and json.Marshal(b) output exported deployment paths/endpoint/pins; current test checks only Validator',evidence:'source_review_not_executed_Go_counterexample',required:'Protect Binding value/pointer String/GoString/MarshalJSON and add sentinel regression; preserve old receipt and submit new source'}],
  checklist:{nonce_original_binding:'accepted_local_candidate_boundary',nonce_material_copy_and_wipe:'accepted_local_candidate_boundary',nonce_complete_history_identity_retention:'accepted_local_candidate_boundary_actual_SQL_pending',same_transaction_original_deadline:'accepted_local_candidate_boundary',CA_fixed_IP_hostname_TLS:'accepted_local_candidate_boundary',CA_transaction_recheck_no_provider_network:'accepted_local_candidate_boundary_with_local_mount_authority_required',output_protection:'CA_Binding_changes_required',composition:'external_material_permissions_and_cross_resources_pending'},
  go_tests_repeated:false,network_or_SQL_run:false,dependencies_installed:false,build_artifacts_created:false,original_A_receipts_modified:false,production_approved:false,original_mapping_authority_approved:false,actual_permissions_approved:false,
  inputs:[...new Set(reviewedFiles)].sort().map(p=>({path:p,size:read(p).length,sha256:hash(read(p))}))};
const output=path.join(root,'docs/evidence/d-a-nonce-ca-reviewed-20261023.json');
const mode=process.argv[2];assert.ok(['--write','--check'].includes(mode));
if(mode==='--write')fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),result);
console.log('D_A_NONCE_CA_REVIEW_OK decision=changes_requested finding=D-A-CA-01 source=c8cd927f actual_SQL=no production=no');
