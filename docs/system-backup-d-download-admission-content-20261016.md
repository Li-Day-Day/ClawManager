# D 下载准入收据与公共 Operation 内容

本项承接 [D 已确定的 operation/nonce 合同](system-backup-d-sensitive-download-admission-contract-20261016.md)及[已接收的四项审计实际 SQL](evidence/system-backup-d-download-audit-remote-review-20261016-r55.json)，补齐同事务存储前需要的两种准确内容表示。[实现](../backend/internal/systembackupevidence/download_admission_content.go)是纯编码和比对组件；它不创建 SQL 行、不消费 nonce、不访问 provider，也不授予下载权限。

私有 receipt 只允许原合同规定的 16 个字段，包括准确 installation/operation/evidence/row version、主体/会话摘要、request/claim/完整 manifest 摘要、规范 Range、claim 到期、准入时刻和真实 intent audit ID。公开 Operation 单独编码完整 24 个字段，固定 `evidence_download_admission/evidence`、准确 `sev_` target、`succeeded`、非 retryable、两个 result 为 null、admission HTTP status 200，四个生命周期时刻等于最终 SQL UTC。GET 的二进制 200/206 与该 Operation 内容分开。

所有可变字符串限于本 profile 的 ASCII ID/key/摘要/UTC 时间，整数限制在 JSON 安全范围或对应 SQL INT 范围，时间限制 UTC 微秒精度。编码复用现有受限 JCS，两个内容各自上限 8192 字节。receipt 解码后重编码并比较全部原始字节，拒绝未知/缺失/重复字段、null 替换、非规范数值/时间、附加 JSON 和空白。私有 receipt 的字段不会出现在公共 Operation。

`VerifyDownloadAdmissionContent` 同时核对两份原字节各自的长度与摘要，再对独立预锁事实重建两份准确内容，并交叉核对 installation、operation、evidence、request、准入时刻和 actor 的 subject 摘要，拒绝 Operation deadline 晚于原 claim 到期。不能把从 receipt 自身解出的事实当作“独立预期”，否则即使摘要自洽也不能证明当前授权或原始行身份。

[回归用例](../backend/internal/systembackupevidence/download_admission_content_test.go)检查闭集公共/私有字段、同步时刻、每个 receipt 字段缺失、敏感字段注入、重复 key、null、指数数字、日期替代表示、越界 ID/Range/时刻，以及重算摘要和长度后的 receipt/Operation 替换。r56 新组件 4 主/80 含子项通过，但两个完整包门禁有一项既有发布集成失败，整轮 exit 1，未接收为通过；[失败检查记录](evidence/system-backup-d-download-content-failure-20261016-r56.json)与原日志保留，准确 owner/container 均已确认清理。

失败为 `TestSystemPublisherActualDClaimToReceipt` 在新 claim 返回 `producer_committed_but_execution_expired`，发生于耗时 5.97 秒的夹具设置/准入。内存 SQL 时钟停在构造时刻，D 提交后检查使用真实时钟；慢 TLS/STS 设置会使该容量采样越过既有五秒窗口。修复只在该测试夹具开始新 claim 前采样当前 UTC，保留原 claim/budget/owner 截止时间，新增六秒慢设置回归；未修改生产期限、跳过检查或给真实事务添加重试。[r57 冻结轮已接收](evidence/system-backup-d-download-content-review-20261016-r57.json)：1,326 来源，两个完整包 439 主/3,327 含子项、seed/脱离源码重复、Linux 探针与 runner 构建、默认 vet、源码 postcheck、清理和 exit 0 齐全；其中新 codec 为 4 主/80 含子项，慢设置回归也通过。后续新增事务绑定和 auth-age 方法不继承 r57 的完整包结论。

接下来的事务所有者须把这些输入绑定到准确 `*sql.Tx`、原 audit anchor、当前证据和 A 已验证的 request/proof；建立完整锁前缀及真实容量预留，再写 operation/私有 receipt/独立公共快照/nonce，并在确认提交前复查全部事实。正式 SQL 枚举、receipt schema、同 installation FK、保留与最小 grants 仍需追加受审迁移；本组件没有改写已发布 066/075、原机器决议或 registry 批准状态，也不代表完整原子准入已经实现。

当前 schema 的具体前置缺口也须保留：`system_backup_evidence` 没有独立 installation 列，`SQLRegistry.load` 将 registry installation 赋给 Manifest，并依赖 policy 的 owner 授权与锁核对归属。现有 nonce 到 operation 的 FK 只有全局 `operation_id`，不是 installation 复合关联。未来 receipt schema 必须建立受审的 evidence 归属关联、operation/nonce/receipt 的同 installation 约束及保留关系；不能仅存入同值字符串就宣称已满足合同，也不能未经真实归属核验直接回填 installation。上述关联及 schema 变更尚未实现或实际 SQL 验证。
