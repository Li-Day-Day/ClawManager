# A：GC 观测和持久化重试（2026-09-29）

GC runtime 现在把 `observed_health`、`last_checked_at`、`next_reconcile_at` 与删除结果、claim 释放、chunk 清理、引用清除、row-version CAS 和审计放入同一个事务。此前 GC 运行装配已检查系统操作租约，但没有更新这些观测和调度字段。

| 已获准提交的结果 | storage state / observed health | 重试 |
| --- | --- | --- |
| 精确版本的权威不存在证明通过 | deleted / unknown | 清除 next_reconcile_at |
| provider/证明不可用等不能确认的结果 | delete_failed / unknown | 数据库检查时间加 retry_max_backoff_seconds |
| 明确权限拒绝或 checksum 冲突 | delete_failed / degraded | 同一有界间隔，仍保留原 refs/chunks |

删除成功表示对象已不存在，不表示证据可读、可解密或可用于准入，因此不会把 health 标成 healthy。数据仍受 `deleted` 生命周期约束；该观测不产生 dependency health 或 GC 整轮 last-success 指标。摘要冲突不会删除远端对象，后续重试仍重新 Stat、核对原版本和摘要。

重试间隔从同一事务锁定的当前配置读取，要求 5..600 秒，并校验原 config version/hash 与 store/delete ref。沿用恢复组件的固定上限间隔，不声称实现指数退避，也不增加持久化失败计数。无效配置在 claim、审计或 provider 请求之前拒绝。

新的内部 `saveGCResult` 只接受持有 live claim 的 deleting 记录及释放 claim 的结果。领取 claim、provider 授权、审计前置步骤和重复读取 tombstone 都不刷新观测。`last_checked_at` 使用结果事务取得锁后的数据库 UTC 时间。审计、CAS、提交、chunk 清理、操作撤权或提交前到期失败，都会保留上一次已提交的观测；如果结果提交状态未知，调用方仍按数据库实际记录重新读取并授权。

`gcRegistry` 在 evidence 行锁内重新读取 `next_reconcile_at`。未来到期的候选返回 conflict，不领取 claim、不写审计、不调用 provider。结果事务不执行新 claim 的调度检查，避免旧调度值阻止已经授权的结果提交。已删除记录继续通过系统操作/owner 授权做幂等返回，不刷新时间。D 的扫描器仍应预先筛选到期行并排除 live claim，以减少无效候选；扫描提示本身不构成授权。

验证使用真实 GC runtime、STS/S3 客户端和 SQL scan/CAS 代码，数据库 transport、policy、provider 与不存在证明均为本机替身。新增覆盖成功/未知/冲突观测、直接重试被拒、到期前后微秒边界、5..600 秒及溢出配置边界、审计/CAS/提交/清理失败和撤权回滚。不能据此认定真实 MySQL 并发、生产调度和 provider ACL 已验收。

本轮验证完成：88 个主测试、630 个子测试通过（24.706 秒），vet 开启；Linux MySQL 探针和迁移工具编译通过，wrapper 退出 0。111 项源码摘要前后不变，隔离 cache/tmp/二进制已清理并独立确认目录不存在。见 [机器记录](evidence/system-backup-a-evidence-gc-observation-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-gc-observation-local-20260929.txt)。命令：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。

用户随后要求本轮结束后暂停并提供远程命令。为让命令覆盖此次 SQL 保存路径，另更新仅在 `systembackup_mysql` tag 编译的探针；该后续变更与前述普通组件测试分开记账。远程运行范围、完整命令和回传要求见 [暂停与远程测试交接](system-backup-a-remote-checkpoint-20260929.md)。真实 MySQL 结果仍待操作者回传，不把探针编译通过算成远程通过。

未新增迁移、公共 DTO 或生产开关。正式 tombstone 迁移、SQLPolicy/审计/Failure 持久化、GC 扫描/worker/操作续租、真实 C proof 和 provider 验证、历史 store 路由、整轮 GC 新鲜度指标与完整备份恢复验收仍待完成。
