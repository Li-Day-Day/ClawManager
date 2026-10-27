import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {decodeCostLog,reviewActualCostLog} from './a-cost-snapshot-concurrent-actual-review-20261022.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url));
const original=decodeCostLog(read('./d-cost-snapshot-concurrent-remote-20261022-101417-6826f52e.txt'));
const names=JSON.parse(read('./d-cost-snapshot-concurrent-scope-20261022.json')).asset_directories.find(g=>g.path==='backend/internal/db/migrations').files;
test('original operator log supports only the five cost cases and explicit cleanup reports',()=>{
  const r=reviewActualCostLog(original,names);assert.equal(r.passed,5);assert.equal(r.exit,0);assert.equal(r.socket_close_messages,4);
});
for(const [name,mutate] of [
  ['missing concurrency observation',s=>s.replace('writer_commit=observed','writer_commit=unknown')],
  ['missing child run',s=>s.replace('=== RUN   TestABusinessRestoreRowsMySQL/cost_aggregate_tokens','OMITTED')],
  ['duplicate child PASS',s=>s+'\n    --- PASS: TestABusinessRestoreRowsMySQL/cost_aggregate_money (0.01s)'],
  ['failed root',s=>s.replace('--- PASS: TestABusinessRestoreRowsMySQL (8.56s)','--- FAIL: TestABusinessRestoreRowsMySQL (8.56s)')],
  ['different cleanup UID',s=>s.replace('CLEANED namespace=sbk-mig-261022023330-7a22 uid=07aab8cd','CLEANED namespace=sbk-mig-261022023330-7a22 uid=ffffffff')],
  ['wrong transmitted binary',s=>s.replace('PASS a-business-restore-mysql binary_sha256=64679b','PASS a-business-restore-mysql binary_sha256=ffffff')],
  ['false schema activation',s=>s.replace('"config_activated":false','"config_activated":true')],
  ['missing migration',s=>s.replace('Applied database migration 081_fix_system_backup_prune_item_identity.sql','MIGRATION OMITTED')],
  ['missing account cleanup',s=>s.replace('CLEANED A business SELECT-only account','CLEANUP_PENDING account')],
  ['nonzero exit',s=>s.replace('cost_snapshot_restore_exit=0','cost_snapshot_restore_exit=1')],
  ['injected later exit',s=>s+'\ncost_snapshot_restore_exit=1'],
])test('rejects '+name,()=>assert.throws(()=>reviewActualCostLog(mutate(original),names)));
