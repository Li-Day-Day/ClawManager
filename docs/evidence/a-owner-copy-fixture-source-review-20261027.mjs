// Narrow tagged-fixture source composition; no actual MySQL acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {enumerate,sourceDigest,changesBetween} from './a-owner-pre-thin-target-20261026.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>{const b=read(p);return {path:p,size:b.length,sha256:sha(b)};};
const own='backend/internal/systembackupevidence/download_task_owner_a_mysql_test.go';
const before='docs/evidence/a-owner-copy-fixture-before-20261027.go.txt';
const baseName='docs/evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json',base=json(baseName);
assert.deepEqual({...pin(before),path:own},base.files.find(p=>p.path===own));
const files=enumerate(root),changes=changesBetween(base.files,files);
assert.deepEqual(changes.map(x=>x.path),[own]);assert.equal(files.length,1720);
const old=read(before).toString('utf8').replaceAll('\r\n','\n');
const code=read(own).toString('utf8').replaceAll('\r\n','\n');
assert.ok(code.startsWith('//go:build systembackup_mysql\n'));
const start=code.indexOf('\t\t\tcase "missing_reference_column":');
const end=code.indexOf('\n\t\t\t}\n\t\t\tmustSQL(t, err)',start);assert.ok(start>0&&end>start);
const oldStart=old.indexOf('\t\t\tcase "missing_reference_column":'),oldEnd=old.indexOf('\n\t\t\t}\n\t\t\tmustSQL(t, err)',oldStart);
assert.equal(code.slice(0,start).replace('\n\t"regexp"',''),old.slice(0,oldStart));assert.equal(code.slice(end),old.slice(oldEnd));
const branch=code.slice(start,end);
for(const s of ['^amfa_[a-f0-9]{32}$','DROP CHECK chk_sb_dependency_evidence',
 'DROP FOREIGN KEY fk_sb_dependency_evidence','RENAME COLUMN evidence_id TO hidden_reference, ALGORITHM=COPY',
 'ADD CONSTRAINT fk_sb_dependency_evidence FOREIGN KEY (hidden_reference) REFERENCES system_backup_evidence(id) ON DELETE RESTRICT, ALGORITHM=COPY',
 "k.REFERENCED_TABLE_SCHEMA=DATABASE()","r.DELETE_RULE='RESTRICT'",'@@session.foreign_key_checks, @@global.foreign_key_checks',
 'original != 0 || hidden != 1 || foreignKey != 1 || sessionChecks != 1 || globalChecks != 1'])assert.ok(branch.includes(s),s);
assert.equal((branch.match(/ExecContext\(/g)||[]).length,4);assert.equal((branch.match(/mustSQL\(t, err\)/g)||[]).length,4);
assert.doesNotMatch(code,/SET\s+(?:(?:SESSION|GLOBAL)\s+)?foreign_key_checks\s*=/i);
const ordinary=xs=>xs.filter(x=>/^(backend|contracts)\//.test(x.path)&&!x.path.endsWith('_mysql_test.go'));
assert.deepEqual(ordinary(files),ordinary(base.files));
const failLog='docs/evidence/a-download-owners-mysql-remote-20261027-145649-489723bd.txt';
const failSource='docs/evidence/a-download-owners-mysql-remote-source-20261027-145649-489723bd.json';
const log=read(failLog).toString('utf8').replace(/^\uFEFF/,'');
assert.match(log,/1845/);assert.match(log,/FAIL: TestASQLTaskDownloadOwnersMySQL\/missing_reference_column/);
const result={kind:'a_owner_copy_fixture_source_review.v1',status:'tagged_source_reviewed_native_and_actual_retry_pending',
 source_files:files.length,source_sha256:sourceDigest(files),files,changes,base:pin(baseName),before:pin(before),
 failed_actual_run:{log:pin(failLog),source:pin(failSource),passed_cases:10,failed_cases:['missing_reference_column'],mysql_error:1845,accepted:false},
 ordinary_backend_contract_inputs_unchanged:true,ordinary_owner_baseline:'7c428878d41c3f648baae9e1e65bd2c5e3dc0b12603ffe0c6f2231028e6ff101',
 owner_roots:703,owner_pass_events:5530,ordinary_native_not_repeated:true,
 exact_owned_fixture_only:true,production_DDL_unchanged:true,foreign_key_checks_never_disabled:true,
 official_sources:['https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html','https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html'],
 historical_INPLACE_reviewer_preserved:true,actual_retry_passed:false,dependencies_installed:false,test_build_artifacts_created:false,production_approved:false};
assert.deepEqual(enumerate(root),files);
const [mode]=process.argv.slice(2);assert.ok(['--write','--check'].includes(mode));
const output='docs/evidence/a-owner-copy-fixture-source-reviewed-20261027.json',text=JSON.stringify(result,null,2)+'\n';
if(mode==='--write')fs.writeFileSync(path.join(root,output),text,{flag:'wx'});else assert.equal(read(output).toString('utf8'),text);
console.log(JSON.stringify({status:result.status,files:files.length,source_sha256:result.source_sha256,ordinary_unchanged:true,actual_retry_passed:false}));
