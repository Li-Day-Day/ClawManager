# A：PR #1 新 head 的安全装配增量

实际本地 Git：公共 HEAD `d3c5715a05a80c1134edd3ad0132a6c292ee1672`，PR head `0a4bdc19a1ab8b979523d4c2161c9b08074a4f26`。本轮不 checkout/merge，不修改 B/D 文件，不构建/运行测试或连接现场。可重复只读审查脚本为 `scripts/system-backup-a-pr1-delta-review.ps1`，结果为 `evidence/a-b-pr1-security-delta-20261028.json`。

原十项输入中九项 Git blob 未变，包括 worker/mTLS、control credentials/Vault、signature、host/config 和 README；唯一变化为历史整合文档。旧审计的这些源码结论继续复用，不重复验证，也不把旧全链测试升为当前集成签收。当前四份 A relay Go 文件与已验证 8 根/70 条回执中的字节一致；此次只重新核对字节，没有重跑。

新 B head 明确移除生产 server 的私有 SQLStore/旧 API/全局 gate 注册；旧 CLI 仅显式隔离实验模式可执行，ContextGate 是协作取消接点。这些改善不能填入公共 WorkerGrant、status_relay 或 bootstrap 槽：新 head 中 `systembackup/publicadapter` 仍不存在。D 公共 ABI 已进入当前公共分支，B 文档中的“尚未收到 contract.go”已是过时前提，D 可将准确公共提交交 B 继续实现。

## 新门禁分类需要的联合决定

新候选 `backupControlRoute` 按 method + 已注册 FullPath 精确匹配，共 51 个条目。原 policy 中没有 `requires_effective_enabled` 操作进入候选豁免；新增/未知路径不自动豁免。这是静态源码结果，不等于实际 middleware 已注册，也不证明 JWT/session/RBAC/MFA 保留正确。

以下八项 `allowed_when_disabled` 没有候选 business-gate 豁免。**kill switch 与 capture business gate 各有阶段语义，不能据这个差集自动生成 allow。** B/D 应按原协议逐项确定在 capture 期间的行为，A 复核原认证、配置风险分类和强认证。配置启用不得因笼统 middleware 拒绝而被当成业务失败，也不能绕过 installation/config 原事务。

| 原 operation | 联核点与责任 |
| --- | --- |
| updateSystemBackupConfig / rollbackSystemBackupConfig | A 原配置风险/MFA与旧引用保留；D 原锁序/当前 gate 状态与启用后 pins 更新 |
| registerSystemBackupProviderProof | A 原 proof 注册授权/强认证；D 原协议和锁序 |
| createSystemBackupCatalogScan / createSystemBackupCatalogImport | C 发现/导入和 provider 权限；D 单独调度及当前阶段；A 凭据/信任 |
| updateSystemBackupManualHold | D 原保护与并发协议；A 原权限/风险复核 |
| issueSystemBackupPruneConfirmation | D 原确认协议；A 原 destructive/MFA，不因“安全收尾”放宽 |
| revokeSystemBackupPromotion | D 原撤销/当前租约与最终复查；A 原权限/强认证 |

候选 middleware 的 `release()` 错误仍被忽略，错误 envelope 仍是私有 `{success,error}`。若未来注册到公共路径，B/D 必须按原 v12 错误和共享 gate 失败事实处置；当前没有把它导入 main。已交给 D 的源码问题还包括其 execution guard 副本失败锁存和原 context/typed-nil 边界，处理与补测归 D；A 未自行改动其文件，也不据静态审查代签测试结果。

## 仍然未齐的真实条件

独立 Original、controller 工作授权/用途与资源映射、准确 selections、受控 nonce/两 CA、所有其余 owners/材料和正式 B relay wire/handler 仍未收到。现场 A 的最新交接为 `system-backup-a-d-field-handoff-20261028.md`：原 installation ID 及来源仍待部署 owner，安装状态空表不证明从未初始化。继续复用已接收 SQL/Pod 结果，仅在目标/原身份发生变化时由 D 重固定，不重复 SSH 或更换身份。

默认缺 27 槽、真实三材料装配后的结构缺 24 槽，现场关闭仍为 0。没有初始化、配置启用、真实运行或生产授权结论。
