import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const cost=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-a-cost-aggregate-v2-preparation-20261021.json')));
const gc=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/d-download-gc-task-actual-accepted-20261021.json')));
assert.equal(cost.status,'locally_validated_published_cleaned_actual_mysql_pending');
assert.equal(gc.status,'actual_mysql_18_of_18_accepted_component_only');
const gcNote='【2026-10-21 GC task 实际十八项已接收】[本轮实际接收](system-backup-d-download-gc-task-mysql-accepted-20261021.md)核对 MySQL 8.4.8、001..081/96 份迁移、18/18、父测试 77.18 秒及退出 0；原三个 prune 用例均通过，旧 15/18 失败与根因保留。namespace/远端 scratch/缓存清理已报告，准确本地 owner 已独立确认缺席。这只接收 SQLDownloadGCTaskEligibility 合成任务夹具的真实 SQL 组件，full_gc、role approval、人类 MFA、provider read、生产批准及原六项仍未完成。下方“新十八项实际待跑”等为旧轮状态。';
const costNote='【2026-10-21 成本汇总局部核验已发布】[金额/token 核验和来源边界](system-backup-d-a-cost-aggregate-review-20261021.md)补 source/dump、完整 normalizer 批次与只读恢复目标的精确币种分组摘要，保持 actual_cost 的 NULL/零差异。冻结 1,486 输入下，业务/安全完整包 341 主/2,398 项、Node 79、tagged seed 1 主/3 项、默认 vet 与来源复核通过；发布 14 文件，准确 source/cache/tmp/telemetry 已清理，未安装依赖或执行远端。发布时的 live-chain 与 UI 并发变化单列保留，不扩大本轮背书；真实 B 证明/接线、实际 MySQL 汇总注入与原六项继续待验收。';
for(const relative of ['docs/system-backup-d-six-scope-readiness-20261015.md','docs/system-backup-restore-d-role-steps.md','docs/system-backup-d-download-gc-task-eligibility-20261020.md']){
 const filename=path.join(root,relative),old=fs.readFileSync(filename,'utf8');
 assert.equal(old.includes('【2026-10-21 GC task 实际十八项已接收】'),false,'status note already present');
 const end=old.indexOf('\n');assert.ok(end>0&&old.startsWith('#'));
 const note=relative.includes('eligibility')?gcNote:gcNote+'\n\n'+costNote;
 const updated=old.slice(0,end)+'\n\n'+note+'\n'+old.slice(end);
 assert.equal(fs.readFileSync(filename,'utf8'),old,'tracking document changed concurrently');
 fs.writeFileSync(filename,updated);
}
console.log('Updated D readiness, role steps and GC task status; retained historical receipts');
