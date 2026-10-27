# D：发布结果原子登记

日期：2026-10-08。承接 [claim 提交后签发](system-backup-d-producer-claim-20261008.md)。本轮实现 FinishPublication 的 D 事务编排和 evidence CAS；C 对象证明验证器、A 完整原证据加载器及生产环境适配仍未实现，远端 provider 不在本轮验证范围。

## 行为

[finish.go](../backend/internal/systembackupproducer/finish.go) 提供 `NewFinalizer` 和 `FinishPublication`。构造要求同一 Execution 实例和必需的 FinishEnvironment；输入必须包含该 Execution 签发的私有 PublicationClaim。普通请求字段、scope、manifest hash 或零值对象不能替代 claim。

调用前已完成远端操作和独立证明采集。PrepareFinish 在 BEGIN 前冻结每次调用独立的 session、证明输入及容量报告；Authenticate 在事务内复查当前身份及证明来源，绑定完整 scope/run/claim/store/ref/key/manifest/object/version/state/time。计算请求摘要或复制 caller 字段并不构成证明。

| 请求结果 | 原子登记 |
| --- | --- |
| ready | 必须有独立验证的精确对象 hash、字节数和不可变版本；与原历史绑定比较后登记 ready/none/原版本。版本保持原字节，不修剪或改写；拒绝空、`null`、非 ASCII、控制字符和超过 256 字节。 |
| write_unknown | 只登记不确定结果，failure 为 provider_unavailable，immutable version 必须为空。不能把 PUT 返回成功或查询失败解释为 ready。 |

两条路径均只接受 pending/write_unknown 的当前 evidence，原版本/claim owner/claim deadline/system owner/type/manifest/原历史精确匹配。CAS 更新状态、failure、immutable version、row_version 和 updated_at，并同时清空 claim owner/expiry。必须恰好影响一行，不改正文/分块、保留期、原观察/写截止、run 状态、目标结果版本或 health。ready 仅表示该证据的发布状态，能力检查成功结论仍须后续 CommitResult 独立校验。

事务依次锁定安装/config/domain、当前身份、grant/run/history、host、target/hold、其余 refs、容量、intent audit、A evidence/chunks，再 CAS、result audit、最终复查。撤销、续租、接管、配置/domain、输入、原历史、hold、refs 或 claim 变化均不能凭旧发布对象获得例外。provider 操作不得在事务锁内执行。

固定期限包含 domain admission、lease、grant authorization、身份、证明有效期、依赖、请求预算、原 claim、owner 写截止、原观察期和历史保留期。证明时间不能晚于数据库 UTC 或早于原历史创建时间；完整证明的可信新鲜度及来源由环境独立验证。锁等待、CAS/audit 和最终复查后仍重新采样数据库 UTC。

写入收费为 64 KiB 固定事务成本加环境证明的现有审计等成本一次，无新 D 表行分配。报告在 BEGIN 前固定，不能刷新以绕过原五秒窗口。测试夹具的额外审计成本为 64 KiB，总计 131072 字节，不代表生产通用报价。

FinishResult 是确认提交后的历史元数据，不是新执行权限；返回的 version 指针是副本。提交不明返回空结果和 ErrCommitUnknown；已知提交但返回跨期可返回历史结果及 ErrCommittedExpired。claim 被消费后不能再次发布或重复完成，不提供隐式重试/重新 claim。未知提交后的独立读取/恢复仍待后续实现，不能通过重新发 PUT 推断数据库结果。

## 适配与合同边界

FinishSession 的 LockEvidence 必须锁定实际 A registry/有序 chunks，使用 A 原 codec 独立比较完整原 manifest、对象、ref、retention、保护期与 D HistoricalBinding，并排除 GC/删除冲突。Recheck 必须验证实际当前权限和最终 A/D 行，不能仅返回 nil。此处接口没有通用成功实现。

本入口由 D 拥有外层事务；未实现 C1 所述任意 caller-owned LockedPrefix 组合 API。该更广组合、C 证明适配和实际完整跨表锁序仍待审查。新增内部 typed-frame 摘要域 `system-backup-producer-finish-publication.c1`，不改变 A 的原 manifest 格式。

CAS 复用现有 evidence 列，没有新增正式 migration。当前 implementation 只覆盖 ready/write_unknown 两种 C1 结果，未新增 write_failed 或其他公开状态。独立恢复调度、health 观察和能力结果提交没有被本操作隐式完成。

## 验证与后续

最终脚本退出 0：Windows 44 个顶层测试、含子测试共 617 项通过，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行该二进制。独立测试缓存和构建产物已清理，未安装依赖。migration catalog 仍为 94 文件，hash 为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

[finish_test.go](../backend/internal/systembackupproducer/finish_test.go) 从 lifecycle→observation→pending→claim 的本地实现开始，用带提交/回滚快照的标准库 driver 验证最终状态和失败边界。它不证明真实 A/C 适配、MySQL FK/gap locks、跨进程竞争或远端对象真实性。

沿用 [禁止下载依赖并清理产物的验证脚本](../scripts/system-backup-d-producer-validation.ps1)。本轮源码指纹和结果见 [机器记录](evidence/system-backup-d-producer-finish-20261008.json)；历史报告保留原范围。

继续实现 CommitResult、独立历史读取/恢复、域管理和实际 A/C 适配，以及生产 Command/Execution/Pending/Claim/Finish 环境。候选八表正式迁移、真实 MySQL V01–V10、A/C 和适用的 B Job 签收、生产部署验收仍未完成。
