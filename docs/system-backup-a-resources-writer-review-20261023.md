# A：事务 writer 增量安全复审

【后续本地修复】A-WRITER-FK-01 已通过[代码修复及 Go 回归](system-backup-a-writer-fk-repair-20261023.md)：旧四个失败反例保留，修复后完整普通包 71 根/843 条通过，原 826 条逐名保留，默认 vet/来源后检/退出 0 与准确清理完成。真实 MySQL 外键观察、其他 FK/UNIQUE 和 B/C 领域资格仍未接收。下方排程与行号描述绑定修复前字节 `acf046d364e68703b67f87b09ee6fc0803e8a69c4155edd8ef8ee3537b72f7f6`，原字节已封存，不表示当前实现仍按原顺序删除父行。

2026-10-23。结论：原离线测试回执可接收；FK 转换策略/排程仍需明确，当前不授予真实恢复资格。对应[可重放复核及反例](evidence/a-resources-writer-reviewed-20261023.json)，执行 `node docs/evidence/a-resources-writer-review-20261023.mjs --check`。

## 已核对的边界

D 本轮冻结 39 份输入的原字节、摘要及当前对应文件均一致；完整包 68 根/826 条通过事件，无失败或跳过，默认 vet。新增 writer 76 条包含 27 个变更位置各自 SQL/影响行数失败的 54 个叶子，以及 19 个前置/迟到事实分支。此前 readback 的 678 条逐名保留。原两项控制表负例失败仍保留；准确 owner 不存在。A 本轮未重复 Go 构建或测试。

私有 helper 使用调用方的同一事务，不自行 Begin/Commit/Rollback；计划与回调入参深复制，九表当前锁定读与写前比较先于 DML，控制表写前/写后均检查；更新北向行带旧 version，变更要求影响行数恰为一；最终 proof 与取消仍可使调用失败。真实 Target/Candidate/Final 适配、最小写权限、共同最终提交、写凭据销毁、独立 SELECT-only 验收和启动门禁均不由本轮合成回调认证。

## A-WRITER-FK-01：保留子记录改挂父记录的转换

当前 `restore_write.go` 第 96 行开始先删除所有不保留的旧行，再从第 107 行开始插入/更新新行。`063_add_security_scan_tables.sql` 对 job_items/reports 的 job_id 均声明 `ON DELETE CASCADE`。

| 表 | 写前 | 预期写后 |
| --- | --- | --- |
| jobs | id=1 | id=2 |
| job_items | id=7, job_id=1 | id=7, job_id=2 |
| reports | id=9, job_id=1 | id=9, job_id=2 |

两个端点都满足这两条 FK。当前排程先删除 job 1，级联删除仍需保留的 item 7/report 9；插入 job 2 后，UPDATE item 7 影响零行，达不到原恰一行门禁，事务必须失败并整体回滚。

已用 Node 自带 SQLite 的纯内存模型复核 FK/级联关系和该排程：级联删除两子行、后续 UPDATE 为零，回滚恢复写前状态；对照排程先插入新父行、迁移子行再删除旧父行，可达到合法目标。模型未执行 Go writer，不是实际 MySQL 回执；它不涵盖所有 FK/UNIQUE、触发器或 C 领域规则。未安装依赖，未创建数据库文件、缓存或构建产物。

这一转换是否允许，仍需 B/C 的同版本规则。如果业务禁止，Candidate 适配必须显式拒绝并覆盖反例；如果允许，则需要能处理 FK/UNIQUE 依赖的排程及带真实 FK 的 Go/MySQL 回归。不能仅调整为“全部写入后删除”就宣称通用修复。当前合成 driver 没有 FK 级联；CREATE TABLE LIKE 专项明确不复制 FK，因此现有 826 条通过及独立九项 SQL 入口均未关闭这个边界。

本轮不修改 D 的 writer、不更改正式 registry、不代签 B/C 领域规则；生产批准、完整九表规范化和完整恢复链继续未完成。
