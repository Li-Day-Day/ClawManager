# D 历史证据恢复事务接口（2026-10-09）

本次接收的远端回执位于 `evidence/a-d-producer-history-remote-20261009-100227.txt`：`TestDProducerMySQL` 包含 `domain_provision_and_rotate`、`independent_command_receipt_closed_domain` 等 27 个子用例并报告 PASS；namespace 与本地/远端临时缓存均报告清理。该回执的二进制 SHA-256 为 `f16f311e2c1c96c2ed703cca1aa97c48bd90333fd546b18732f5d0c0af59689d`，产生于本文件所述新增恢复源码之前，不作为恢复接口的远端验收。

## D 已提供的入口

`systembackupproducer.NewHistoricalRecovery` 使用独立的 `HistoricalRecoveryEnvironment`，不接收旧 `ExecutionHandle`、原 producer grant 或旧配置的 active 状态。

- `LoadHistoricalBinding` 在当前恢复工作负载授权及专用撤销行锁下读取原不可变绑定，返回只含精确对象定位信息的 `RecoveryStatContext`；不返回 provider 凭证。
- `ClaimRecovery` 等到数据库 UTC 达到原 owner 写入截止，锁定原 A registry/chunks 和保留/GC 范围，然后以版本 CAS 取得私有 claim。确认提交后才返回 claim；不明提交不隐式重试。
- `FinishRecovery` 使用新身份与 C 的独立精确 Stat 证明，仅更新原 `system_backup_evidence` 的 storage state、failure、immutable version、claim 与 row version。匹配证据可 `ready`；404/超时只能 `write_unknown`。不修改 capability、health、observation 或 producer 结果。
- `PrepareFinishRecovery` 在事务前固定身份、证明和容量输入；`FinishRecoveryInTx` 在调用方的 `*sql.Tx` 内执行锁定、CAS、审计及 FinalGuard，**不提交事务**。调用方须使用 repeatable-read/UTC 连接，错误时回滚，成功后直接提交。不得在 Guard 后追加其他业务写入。

所有入口都先经过 L0-L1 安装前缀、L2 当前恢复身份及撤销行，再到 L4 原历史绑定、L5 引用、L6 容量、L7 审计、L8 A 原证据、L9 结果审计、L10 当前状态与数据库时间复核。D 的专用撤销行查询要求精确 scope/工作负载 hash、非撤销、匹配 epoch；缺行或表不存在即拒绝。

## 待 A/C 对接与评审

专用撤销表的 DDL 在 `contracts/system-backup/v12/producer-recovery-revocation-candidate.sql`，**仅为候选，不在 080 或正式 migration 中**。A 需要绑定后台 mTLS/OIDC 工作负载、当前部署准入、短截止、当前撤销代次，并在 `HistoricalRecoverySession.Authorize`/`Recheck` 中复核；D 的行锁是第二道精确持久化门禁，不能替 A 认证。撤销/轮转写路径和身份注册必须经 A/D 评审后才能开放生产。

A 还需在 `LockEvidence` 读取并锁定原 registry 与有序 chunks，用原 codec 比对完整 manifest、对象、ref、保留和 GC 状态，不能回填请求字段。C 须在事务外取得并冻结精确 Stat/404/超时证明，在 `VerifyStat` 中只核验该证明，禁止持有数据库锁时请求 provider。证明必须绑定精确对象版本、checksum、size、当前授权及短截止。

标准库模拟事务测试验证独立身份拒绝、撤销拒绝、域关闭后的 claim、审计失败回滚、evidence-only 完成和调用方事务不被 D 提前提交。`GOPROXY=off go test ./internal/systembackupproducer -count=1` 已通过；测试使用仓库内临时 Go 缓存并在结束后清理，未安装依赖。隔离 MySQL 的 D-only claim、并发、撤销、404/超时和提交确认丢失用例已通过；A/C 生产适配、真实身份与 provider 证明、跨配置恢复仍待联调；候选 DDL 需 A/C 签收后进入单独的正式 migration/inventory。

D-only 隔离 MySQL 用例与专用 `-ProducerRecoveryOnly` profile 的远端命令、PASS 和清理回执见[历史恢复 MySQL 交接](system-backup-d-historical-recovery-mysql-handoff-20261009.md)。本地恢复定向测试、MySQL-tag seed、Linux 探针及迁移 runner 编译亦通过，不改变上段生产验收边界。
