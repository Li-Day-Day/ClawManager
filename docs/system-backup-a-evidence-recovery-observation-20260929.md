# A：只读恢复的观测与重试登记（2026-09-29）

后续 [扫描与批次恢复增量](system-backup-a-evidence-recovery-batch-20260929.md) 已增加候选查询及事务内 next_reconcile_at 检查；下文“尚无强制调度检查”描述对应本轮历史版本，生产 worker 宿主仍待接线。

本增量修复 `SQLWriteRecovery` 已更新 storage state、但未写入 `observed_health`、`last_checked_at` 和 `next_reconcile_at` 的缺口。三个字段与 evidence 状态、immutable version、claim 清除、row version CAS 及 result 审计共用一个事务，不会先暴露健康成功、再发现结果登记失败。

| 已完成的 Stat 结果 | storage state / observed health | 下次恢复 |
| --- | --- | --- |
| 精确 checksum、size 和非空 immutable version 匹配 | ready / healthy | 清除 next_reconcile_at |
| 普通 404、权限或可用性错误等无法确认的结果 | write_unknown / unknown | 数据库检查时间加当前配置的 retry_max_backoff_seconds |
| checksum、size、version 或明确完整性冲突 | write_failed / degraded | 清除 next_reconcile_at，保留 refs/chunks，交由后续处置 |

`last_checked_at` 使用结果事务取得锁后的数据库 UTC 时间。重试间隔从该事务锁定且核验 version/hash 的当前配置读取，要求 5..600 秒。这里选择固定上限间隔，未增加失败计数，也不声称实现指数退避。非法或缺失配置在取得 claim、写审计和访问 provider 前拒绝。

`SQLRegistry.Save` 继续用于 claim 和一般元数据修改，不推断健康结果。只有内部 `saveRecoveryResult` 显式登记本次恢复观测；它要求旧记录为 pending/write_unknown、仍持有 live claim，且结果释放 claim。仅取得 claim、刷新授权或下载结束不会把旧 degraded/unknown 改成 healthy，也不会刷新 last_checked_at。

这是对象存储确认结果，不替代解密验证、dependency health 聚合、owner 结果、promotion 准入或生产 provider 能力证明。原 Publish、下载 Failure 和 GC 的完整健康接线不在本增量范围内。

## 接线边界

D 的有界扫描器仍需处理 `next_reconcile_at IS NULL OR next_reconcile_at <= 数据库当前时间`，并排除 live claim；初始 pending 和崩溃后遗留记录可能没有调度时间。调用 `Reconcile` 仍重新检查 owner deadline、身份、配置、claim 和 manifest；本方法没有把 next_reconcile_at 变成强制访问期限，调度端应遵循它，避免紧密轮询。扫描、worker、指标及持久化 Failure 尚未启用。

SQLPolicy、独立恢复身份/STS/read ACL、历史 store 映射、权威不存在证明与真实 MySQL/provider 并发验收仍待交付。没有安装依赖、连接远程或修改生产开关。

## 本地验证

验证命令：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。使用真实 SQLRegistry 查询与 CAS 路径、事务性测试 transport 和合成 policy/provider，覆盖成功、未知、冲突、claim/授权保持旧观测、审计/CAS/提交失败回滚以及数据库重试值边界。该模拟不能证明 MySQL 实际并发行为。

验证结果见 [机器记录](evidence/system-backup-a-evidence-recovery-observation-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-recovery-observation-local-20260929.txt)。Linux MySQL 探针仅编译，不自动执行；本轮不运行完整 services/server 构建。

本次入口退出 0：61 个主测试、445 个子用例通过（37.492 秒），其中本增量新增 3 个主测试、13 个子用例。Linux 探针与迁移工具构建通过，93 项源码摘要保持一致；本轮 scratch/cache/二进制已清理，并独立确认目录不存在。
