# D 下载准入内容的同事务绑定

本轮在[收据与公共 Operation 编码](system-backup-d-download-admission-content-20261016.md)之上，增加 [DownloadAdmissionContentBinding](../backend/internal/systembackupevidence/download_admission_binding.go)。输入包含 A 已验证的 proof、准确 current actor/evidence 行、原 intent 和原 `DownloadIntentAuditAnchor`，结果绑定准确 `*sql.Tx`。它不实现 prelocked 授权能力、SQL receipt 存储或 nonce 消费，也未接入生产下载。

组件重新用实际完整 Manifest、主体/会话、规范 Range 和 key 构造 A 的请求，逐字比较已验证的 canonical/request hash；再核对原 audit body、实际 audit ID、operation/evidence/installation、claim 与准确 admitted row version。subject/session/claim 摘要由组件自行计算，不能把原始 claim、整个 proof 或 provider locator 放入 receipt。输入及绑定禁止整体 JSON 序列化，绑定的默认格式化仅输出类型名称；单独导出的私有 receipt 和公共 Operation 字节均为副本。

构造及 `Recheck` 都在原事务中读取原 audit 行并使用回读后的新鲜 SQL UTC；拒绝跨事务、事务结束、时钟回退、actor/session/Manifest/claim/row version 漂移及 audit 篡改。失败的绑定实例不能通过恢复 callback 事实再次使用。组件不 Begin、Commit、Rollback、写第二条 intent、插入 nonce 或调用 provider；任何错误仍要求外层事务回滚全部效果。

期限冻结为原 authority、session、claim、proof 和适用日志到期的最小值。新增 [A proof 时间边界读取方法](../backend/internal/systembackupsecurity/sensitive_download_deadline.go)同时包含签名到期与原 auth-time/max-age/skew 窗口，避免仅凭签名到期漏掉最大认证年龄。`RecheckProofAt` 继续执行原 A 规则；不改签名/proof 格式、不延长原期限。为与 SQL `DATETIME(6)` 一致，亚微秒 proof 限制只可向下截断；原高精度 proof 限制仍由原 verification 保留并复查。

定向测试使用真实 Ed25519 签名和两个历史 HMAC 候选，以及已有 scripted SQL transport，检查独立投影、候选不能序列化、字节副本、各项替换、跨事务、提交后使用、原审计行变化、SQL 回读后到期/回退、失败后不能恢复，以及 auth-age/亚微秒期限边界。该 transport 只接受既有 audit INSERT/准确 ID 回查和 SQL clock，不能当成实际 MySQL 的锁/FK 或真实 MFA 证据。

r58 有两个 Manifest 反例误设为原校验值 `e` 重复 64 次，没有实际替换，整轮 exit 1，不能接收。r59 补充 auth-age 边界后仍冻结旧反例，在确认准确 container label/owner 后主动终止，native exit 137，原报告和清理保留；不是超时重启或通过。详见[两轮记录](evidence/system-backup-d-download-binding-attempts-20261016-r58-r59.json)。修正反例为不同的 `f` 重复 64 次后，r60 下载审计/内容/绑定及三个发布相关 root 共 19 主/190 含子项通过，其中新绑定为 4 主/46 含子项，默认 vet 与六秒慢设置回归也通过。

[r60/r61 联合检查记录](evidence/system-backup-d-download-binding-paired-review-20261016-r60-r61.json)保留验证边界：r60 原包装脚本在源码枚举复查处失败，Go exit 0 而 wrapper exit 1；完整原包装门禁未接收为通过。随后仅做 source-only 独立复查，重新冻结的全部 1,330 来源与 r60 逐项/整体摘要一致，经过同一 native helper 后的完整源码 postcheck、清理和 exit 0 通过；没有重跑 Go、修改源码 helper 或把原退出码改成 0。首次枚举失败没有复现，原因尚未证明。该证据只接收明确覆盖的候选测试和独立来源复查，不代表当前所有包、实际 SQL、nonce 消费或生产接线。

外层事务仍须提供完整 L0–L10 前置锁、当前认证/撤销/RBAC/owner、准确历史 HMAC 并集、真实物理容量、claim CAS、operation/receipt/公共快照/nonce 原子写入与最后 guard。现有公共枚举/SQL 不支持新 admission 类型，受审追加迁移、同 installation 归属关系、保留和 grants 尚未完成。用户已要求本轮完成后暂停目标，收尾不扩展到新的 schema 或生产接线工作。
