import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const old=read('backend/internal/db/migrations/070_add_system_backup_prune_authority.sql');
const repair=read('backend/internal/db/migrations/081_fix_system_backup_prune_item_identity.sql');
const identity=s=>s.match(/(?:CONSTRAINT chk_sb_prune_item_identity CHECK \()([\s\S]*?)\n\s*\)/)?.[1];
const oldBody=identity(old),newBody=identity(repair);
const pattern=(s,column)=>new RegExp(s.match(new RegExp(column+" REGEXP '([^']+)'"))[1]);
const valid='sbk_11111111-2222-4333-8444-555555555555';
test('070 counterexample: a canonical backup UUID was rejected by prune identity',()=>{
 assert.equal(pattern(oldBody,'artifact_public_id').test(valid),false);
 assert.equal(pattern(oldBody,'artifact_public_id').test('sbk_11111111-2222-4333-555555555555'),true);
});
test('081 changes only the omitted artifact UUID group in one atomic CHECK replacement',()=>{
 assert.ok(oldBody&&newBody);
 const normalized=s=>s.trim().replace(/\s+/g,' ');
 assert.equal(normalized(newBody.replace(pattern(newBody,'artifact_public_id').source,pattern(oldBody,'artifact_public_id').source)),normalized(oldBody));
 const sql=repair.split('\n').filter(s=>!s.trim().startsWith('--')).join('\n').trim();
 assert.equal(sql.split(';').filter(s=>s.trim()).length,1);
 assert.match(sql,/^ALTER TABLE system_backup_prune_items\s+DROP CHECK chk_sb_prune_item_identity,\s+ADD CONSTRAINT chk_sb_prune_item_identity CHECK/);
 assert.doesNotMatch(sql,/FOREIGN_KEY_CHECKS|CHECK_CONSTRAINT_CHECKS|DROP TABLE|DELETE FROM|TRUNCATE|UPDATE /i);
});
test('corrected backup identity and CHAR(40) accept canonical UUIDs and reject malformed IDs',async t=>{
 const re=pattern(newBody,'artifact_public_id');
 for(const value of [valid,'sbk_00000000-0000-0000-0000-000000000000','sbk_abcdef01-2345-6789-abcd-ef0123456789'])await t.test('valid:'+value,()=>assert.equal(re.test(value),true));
 for(const value of ['sbk_11111111-2222-4333-555555555555',valid+'0',valid.slice(0,-1),'sdr_'+valid.slice(4),valid.toUpperCase(),valid+'\n',' '+valid,valid.replace('-8444','-844')])await t.test('invalid:'+JSON.stringify(value),()=>assert.equal(value.length===40&&re.test(value),false));
});
test('other identity predicates retain their exact published patterns',()=>{
 for(const column of ['public_id','origin_installation_id'])assert.equal(pattern(newBody,column).source,pattern(oldBody,column).source);
 assert.ok(pattern(newBody,'public_id').test('spi_88888888-8888-4888-8888-888888888888'));
 assert.ok(pattern(newBody,'origin_installation_id').test('installation_gc_task'));
});
