// Private overlays only; this does not publish a migration or execute Go/SQL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const pin=p=>{const b=read(p);return {path:p,size:b.length,sha256:sha(b)};};
const [mode]=process.argv.slice(2);assert.ok(['--prepare','--check'].includes(mode));
const prefix='docs/evidence/a-cleanup-ledger-gc-';
const refs='backend/internal/systembackupevidence/download_retention_gc_references.go';
const early='backend/internal/systembackupevidence/download_retention_gc_early.go';
const add='\t\t{5, "system_backup_cleanup_attempts", "cleanup_operation_id", "id", "numeric", false},';
const source=read(refs).toString('utf8'),eol=source.includes('\r\n')?'\r\n':'\n';
const anchor='\t\t{5, "system_backup_staging_resources", "cleanup_operation_id", "id", "numeric", false},';
assert.equal(source.split(anchor).length,2);assert.ok(!source.includes('system_backup_cleanup_attempts'));
const earlyText=read(early).toString('utf8');
const anchor2='tables := []string{"audit_logs",';assert.equal(earlyText.split(anchor2).length,2);
assert.ok(!earlyText.includes('system_backup_cleanup_attempts'));
const overlays=[
 {target:refs,candidate:prefix+'references-candidate-20261027.go.txt',bytes:Buffer.from(source.replace(anchor,add+eol+anchor))},
 {target:early,candidate:prefix+'early-candidate-20261027.go.txt',bytes:Buffer.from(earlyText.replace(anchor2,'tables := []string{"system_backup_cleanup_attempts", "audit_logs",'))}
];
for(const x of overlays){if(mode==='--prepare')fs.writeFileSync(path.join(root,x.candidate),x.bytes,{flag:'wx'});else assert.deepEqual(read(x.candidate),x.bytes);}
const tests=prefix+'reference-test-candidate-20261027.go.txt';
const record={kind:'a_cleanup_ledger_gc_private_overlays.v1',status:'source_ready_native_pending',
 changes:[...overlays.map(x=>({target:x.target,before:pin(x.target),candidate:pin(x.candidate)})),
 {target:'backend/internal/systembackupevidence/a_cleanup_ledger_reference_test.go',before:null,candidate:pin(tests)}],
 test_cases:['empty','present','late_reference','missing_column','wrong_type','unknown_column','foreign_schema_fk','cascade_fk'],
 semantics:{stage:5,column:'cleanup_operation_id',type:'bigint',own_group_exemption:false,installation_filter:false,
 query:'SELECT id FROM system_backup_cleanup_attempts WHERE cleanup_operation_id=? LIMIT 1 FOR UPDATE',
 new_table_grant:'SELECT only',gc_delete_tables_unchanged:true,task_evidence_reference_change:false},
 required_same_private_source:['exact cleanup ledger migration with RESTRICT operation FK','published metadata/catalog inventory and new migration version','required read grants and role review','full systembackupevidence package plus targeted counterexamples'],
 live_source_changed:false,Go_executed:false,SQL_executed:false,dependencies_installed:false,production_approved:false};
const output=prefix+'source-ready-20261027.json',text=JSON.stringify(record,null,2)+'\n';
if(mode==='--prepare')fs.writeFileSync(path.join(root,output),text,{flag:'wx'});else assert.equal(read(output).toString('utf8'),text);
console.log(JSON.stringify({status:record.status,changes:record.changes.length,cases:record.test_cases.length,live_changed:false}));
