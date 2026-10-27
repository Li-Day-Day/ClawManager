# A 历史恢复授权接线缺口（2026-10-09）

## 已有依据

- [v12 C1 事务合同](../contracts/system-backup/v12/producer-authority-transactions.json)把 `HistoricalAuthority` 定为 A 创建的独立当前授权，绑定部署、scope、准确 evidence/receipt、Stat 用途、截止及撤销代次；它不能转换为原 `ExecutionHandle`。`LoadHistoricalBinding`、`ClaimRecovery`、`FinishRecovery` 均要求它。
- A 已实现[原 A registry/chunks 的事务内只读重建](../backend/internal/systembackupevidence/system_historical_original.go)，并让旧配置绑定的[写恢复入口](../backend/internal/systembackupevidence/write_recovery.go)及[扫描器](../backend/internal/systembackupevidence/recovery_scan.go)避开 `system/capability_snapshot`；[远端 D 行锁回执](evidence/a-historical-record-mysql-remote-sbk-mig-261009005351-5dea.json)及[远端 A 扫描回执](evidence/a-evidence-recovery-scan-mysql-remote-sbk-mig-261009012930-5373.json)只验收这些冻结范围。
- A 已有[SystemPeerAuthenticator](../backend/internal/systembackupevidence/system_peer.go)对准确 CA/证书进行 mTLS 验证，产生请求绑定、不可 JSON 构造的 `SystemPeer`，并可在 D 的数据库时间下重新校验证书和部署 scope。它只证明工作负载传输身份，尚不证明历史恢复用途、准确 evidence ID 或数据库撤销状态。
- A 新增[后台工作负载历史恢复意图](../backend/internal/systembackupevidence/system_historical_workload.go)：把经 mTLS 验证且仍属于当前请求的身份固定到一个原始 evidence ID、部署 scope 与 `Stat` 用途；再次检查时使用 D 提供的数据库时间，并拒绝跨 evidence、跨 scope、过期请求及 JSON 构造。其绑定摘要仅供未来 `HistoricalAuthority` 比对，不是数据库授权，也不授予 provider Stat 凭证。
- D 已有[历史恢复事务](../backend/internal/systembackupproducer/recovery.go)的 `LoadHistoricalBinding`、`ClaimRecovery`、`FinishRecovery`，以及[恢复撤销栅栏写入](../backend/internal/systembackupproducer/recovery_fence.go)和[独立读取](../backend/internal/systembackupproducer/recovery_fence_read.go)原语。A 的 mTLS 请求绑定、D 事务和 A 原 registry/chunks 重建已经在[隔离 MySQL 专项](system-backup-a-historical-recovery-mtls-mysql-handoff-20261009.md)通过；测试的部署/容量/审计授权与 C Stat 证明仍为夹具，不能等同生产授权。

## 需要对齐的接口与身份

身份模式已确定：**由后台恢复工作负载发起**。管理员会话不是这条恢复路径的授权来源。

锁序、授权记录字段、D 接口与 C 证明的最小接线条件见 [A→D/C 接线草案](system-backup-a-historical-authority-handoff-20261009.md)。

| 责任 | 下一份可审查输入 |
| --- | --- |
| A | 已有工作负载、准确 evidence 与 Stat 用途的本地绑定；仍须接入独立于原 producer 句柄和当前活动配置的当前部署/撤销适配，只为 D 锁定的准确历史 evidence/receipt 签发有短截止的内部授权，并在 D 事务内复核同一身份与撤销代次。当前意图构造函数可接收待核对的 evidence ID，但该输入自身不构成许可。 |
| D | 上述事务和 L8 A 原行回调已有隔离 MySQL 证据；仍须冻结当前部署/撤销记录的生产管理身份、准入和存储接口，确保 A 的 `SystemHistoricalAuthority` 在 L2 与最终 Guard 复核同一当前记录。 |
| C | 对原 ref 的受限 Stat 通道和独立证明，绑定准确对象版本、checksum、size、当前恢复授权及短截止；明确 404、超时和不匹配的可核验结果。 |

当前 [080 迁移](../backend/internal/db/migrations/080_add_system_backup_registration_runtime.sql)有管理员会话数据；[D 撤销候选 DDL](../contracts/system-backup/v12/producer-recovery-revocation-candidate.sql)已有 `system_backup_producer_recovery_revocations`，但单独的撤销行不能证明当前部署准入、受限 Stat profile 或独立管理身份。后台路径仍须冻结独立证书/subject、OIDC 投射与 Stat 角色、当前部署记录及管理入口、撤销持久化和 L2 锁序；不能把管理员会话表、当前活动配置或旧 producer grant 当作恢复许可。A 的现有[旧版恢复身份](../backend/internal/systembackupevidence/write_recovery.go)只为任务 evidence 提供 mTLS/OIDC/Stat 检查，并受当前配置约束，可复用协议检查思路，不能直接用作系统历史权限。

在当前部署授权来源、生产管理/撤销适配及 C 限制通道确定前，A 不开放可提交的系统历史恢复入口。后续生产接线验收须覆盖旧配置停用/轮换、当前撤销、并发 claim、L8 行锁等待、审计/Guard 回滚和 404/超时未知；真实 provider 验收另证 Stat 与 Range/PUT/Delete/Wrap 权限隔离。下一步由 D 冻结当前部署授权记录和受信管理入口、由 C 提供准确原 ref 的受限 Stat 协议及证明；A 再实现非测试 `SystemHistoricalAuthority`，接 L2/Guard 和 C 证明。现有专项不需重跑。
