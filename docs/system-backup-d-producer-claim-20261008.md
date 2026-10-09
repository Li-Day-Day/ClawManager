# D：publication claim 提交后签发

日期：2026-10-08。承接 [pending 原子事务](system-backup-d-producer-pending-20260930.md)。本轮实现 claim CAS、显式同请求读回与提交后私有 `PublicationClaim` 签发。生产认证/容量/审计、A 锁定加载器和远端发布仍未接通；不代表生产 STS/PUT 已启用。

## 签发与读回

[claim.go](../backend/internal/systembackupproducer/claim.go) 提供 `NewPublication`、`ClaimPublication` 和 `ReadPublicationClaim`。构造需要实际 Execution 实例及受信 ClaimEnvironment，没有通用成功实现。接口只接受本 Lifecycle 签发的当前私有执行句柄。

每次从数据库锁定当前 domain、grant、pending run、完整原历史绑定、host、target 与确定性 pending hold；比较原代次、主体、issuer、admission、input、evidence、观察期和 owner 写截止。随后锁引用/策略，固定容量，写 intent audit，锁定并独立验证 A 原证据/分块，CAS claim，再写 result audit 和最终 current-read 复查。锁等待、写入及最终复查后均重新检查时间，沿用统一事务执行器决定提交。

ClaimRequest 在首次尝试前生成并保持不变，包含 evidence、原 evidence row_version、nonce、固定 expires_at、policy hash、refs version hash 和预算。完整 scope/主体/grant/version/run/request 使用内部 typed-frame 域 `system-backup-producer-publication-claim.c1` 摘要；64 字符摘要作为 claim_owner，符合现有 VARCHAR(128) 限制。owner 是相关标识，不是 bearer credential。

新 claim 的固定期限不得晚于任何当前已批准上限：domain admission、lease、grant authorization、身份、独立 claim 上限、依赖、请求预算、原 owner 写截止、原观察期和历史保留期。它不会在 BeginCall 时借新的预算延长。

CAS 只更新 claim_owner、claim_expires_at、row_version 和 updated_at，条件包括精确 public_id、版本、system owner/type、原 pending/write_unknown 状态以及原 claim owner/expiry 的 null-safe 比较。必须恰好影响一行；不修改 manifest/chunks、保留期、观察期、provider 结果或 health。版本拒绝 uint64/int64 溢出。

- 新写只允许原 expected version。已有活动 claim 拒绝；已过期的其他 claim 可由带当前期望版本的新请求替换。相同 owner 不原地续期。
- 提交不明只返回 ErrCommitUnknown，不返回 claim、不自动重试。调用方保留原请求，明确调用 ReadPublicationClaim。
- 读回开启新事务，重新检查当前执行权限和独立 ReadbackAllowed，要求 owner、expiry 和 expected version + 1 完全相同。无匹配提交、版本变化、请求字段变化或到期均拒绝；不收费、不写审计、不改库、不续期。
- 已知提交但返回跨过固定期限或报告窗口时也不返回 claim。只有一次已确认且当前有效的提交/读回事务才能签发私有对象。

生成对象绑定原 Execution 实例、句柄、evidence 版本、manifest、owner/expiry、policy 和 refs 版本。继续复用 BeginCall/RecheckCall 的 STS/publish 限制；对象不能 JSON 编解码，普通 ClaimBinding 或数据库行不能在外部构造。续租/撤销/接管后仍须重新获取当前权限，旧句柄及快照不会因持有 claim 而获得例外。

## 生产适配和评审边界

ClaimSession 的 LockEvidence 必须在 L8 锁定实际 A registry 和有序 chunks，并使用 A 原 manifest codec 将完整原文、owner/type、ref、retention 与 D HistoricalBinding 比较，拒绝 GC、删除或冲突工作。当前返回的 ClaimEvidence 是受信适配数据，不是请求证明。最终 Recheck 需要验证真实 A/D 行及已锁部署权限；禁止远端 I/O 和较早锁层重入。

首次 claim 收费为 64 KiB 固定事务成本加已认证现有审计等成本。没有新 D 记录分配；测试额外成本 64 KiB，合计 131072 字节。报告在 BEGIN 前固定，Reserve 不能重新取样。明确读回不要求新报告。实际审计/容量 SQL 和 A 完整证据加载器尚待实现。

直接 claim CAS 复用现有 evidence 列，没有新增 migration、索引或正式表。它依赖已核验的 A 锁定行和 row_version 协议，仍需真实 MySQL/FK/gap lock/并发检查。新增摘要、同键读回、过期 claim 替换和最终生产完整锁序作为 A/C 评审输入，不代填审批。

## 验证

最终脚本退出 0：Windows 39 个顶层测试、含子测试共 549 项通过，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行该二进制。独立测试缓存与构建产物已清理，未安装依赖。migration catalog 仍为 94 文件，hash 为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

[claim_test.go](../backend/internal/systembackupproducer/claim_test.go) 从实际本地 lifecycle→observation→pending 编排代码开始，以标准库 SQL driver 模拟参与者和 rollback，验证 claim CAS 参数/版本、原记录不变、收费/锁序、STS/publish 快照消费、独立读回、过期替换、权限/历史/引用/证据变化、容量跨期、CAS/audit/final Guard 失败及提交不明两种持久结果。

这些检查不证明实际 A loader、真实 MySQL、跨进程并发、STS 或远端 PUT。源码指纹及最终结果见 [机器记录](evidence/system-backup-d-producer-claim-20261008.json)，验证脚本仍禁止下载依赖并清理本轮缓存和构建产物。旧记录保留原时点和范围。

下一步仍需发布完成/结果事务、A 实际 pending/claim/STS 适配、生产 Command/Execution/Pending/Claim 环境、域管理、独立历史恢复与 C 证据通道；真实 MySQL V01–V10、A/C 及适用的 B Job 签收、候选八表正式迁移和生产部署验收未完成。
