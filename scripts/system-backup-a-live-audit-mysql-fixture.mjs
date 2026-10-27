// Synthetic public fixture for offline reviewer tests only.
import {readFileSync} from 'node:fs';
import {digest,liveAuditSQL} from './system-backup-a-live-chain.mjs';
import {prepareAuditRequest} from './system-backup-a-live-audit.mjs';

export function transcript() {
  const a=JSON.parse(readFileSync(new URL('../backend/cmd/system-backup-audit-collect/testdata/audit.json',import.meta.url)));
  const o=a.operation;
  const receipt={status:'HTTP_PASSED_AUDIT_PENDING',server_uuid:a.server_uuid,database:a.database,operation_public_id:o.public_id,evidence_id:o.evidence_id,installation_id:o.installation_id,user_id:42,idempotency_key:o.idempotency_key,request_hash:o.request_hash,subject_sha256:a.admission.body.subject_sha256,session_sha256:a.admission.body.session_sha256,expected_bytes:17,received_bytes:17};
  const request=prepareAuditRequest(Buffer.from(JSON.stringify(receipt)),{current_user:'aaudit_observer@localhost',current_role:'NONE',transport:{mode:'unix',server_name:'',ca_sha256:''}});
  const id={server_uuid:a.server_uuid,database:a.database,current_user:request.current_user,current_role:'NONE',connection_id:12,sql_time:'2026-10-22T08:00:00.000000Z'};
  const lines=['A_AUDIT_RUN namespace=aaudit-20261022000000-12345678 uid=11111111-2222-3333-4444-555555555555 image=mysql@sha256:'+'a'.repeat(64)+' binary_sha256='+'b'.repeat(64)];
  const cases=['success','wrong_server','wrong_database','wrong_user','wrong_role','wrong_operation','permission_denied','observer_cannot_write','server_enforces_readonly','missing_join','malformed_body','unknown_body','duplicate_rows','broken_link','broken_nonce','broken_digest','final_success'];
  const sampleNames=new Set(['success','broken_link','broken_nonce','broken_digest','final_success']);
  for(const name of cases) {
    lines.push(`    --- PASS: TestAuditCollectorMySQL/${name} (0.01s)`);
    if(!sampleNames.has(name))continue;
    const audit=structuredClone(a);
    if(name==='broken_link')audit.result_link.intent_audit_id=99;
    if(name==='broken_nonce')audit.nonce_count=0;
    if(name==='broken_digest')audit.result_link.sha256='0'.repeat(64);
    const raw=Buffer.from(JSON.stringify(audit));
    const collection={schema_version:'a_live_download_audit_collection.v1',request_sha256:digest(Buffer.from(JSON.stringify(request))),http_receipt_sha256:digest(Buffer.from(JSON.stringify(receipt))),query_sha256:digest(liveAuditSQL),operation_public_id:o.public_id,identity_before:{...id},identity_after:{...id},readonly:true,rolled_back:true,audit_export_sha256:digest(raw),audit_export_base64:raw.toString('base64')};
    lines.push('    mysql_test.go:100: A_AUDIT_SAMPLE '+JSON.stringify({case:'TestAuditCollectorMySQL/'+name,receipt,request,collection,expect_review:name==='success'||name==='final_success'}));
  }
  lines.push('--- PASS: TestAuditCollectorMySQL (0.10s)','PASS','A_AUDIT_SQL_PASS transport=unix fixture=synthetic_selected_columns http=synthetic migrations=not_run production_approval=no','A_AUDIT_CLEANUP namespace=aaudit-20261022000000-12345678 uid=11111111-2222-3333-4444-555555555555 absent=yes','A_AUDIT_UPLOAD_CLEANUP absent=yes','A_AUDIT_REMOTE_EXIT=0');
  return lines.join('\n');
}
