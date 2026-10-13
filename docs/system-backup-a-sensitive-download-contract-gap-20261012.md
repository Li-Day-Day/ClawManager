# A 敏感 evidence 下载二次鉴权：v12 事务合同缺口

状态：A 接线候选，等待 D 确认公共操作、nonce 结果锚点及正式迁移；不得将敏感下载标为可用。

## 已实现的 A 边界

`Handler.ServeHTTP` 对 `confidential`、`sensitive` 的准确 evidence ID、actor、claim 和 Range，在 `Registry.WithLocked` 内写下载审计 intent、更新 claim，并调用 `SensitiveDownloadAuthenticator`。拒绝或缺少适配器时事务回滚，provider 不读取。`SQLDownloadAuthority` 只把同一 `*sql.Tx` 交给二次鉴权适配器；事务提交后、provider 读取前及返回明文前仍复查当前 session/RBAC/owner/claim。定向 `TestDownload|TestEvidenceHTTP` 本地通过；真实 proof 适配器未接线。

## 当前合同无法直接消费 nonce 的原因

1. `contracts/system-backup/v12/admin-operation-policy.json` 的 `getSystemBackupEvidence` 为 `recent_strong_auth: none`、`idempotency_required: false`；但 `strong-auth-proof-nonce.schema.json` 的签名 payload 必填 `endpoint`、`request_hash`、`idempotency_key`。当前没有用于敏感下载的条件式 strong-auth 操作政策和请求 hash 定义。
2. `contracts/system-backup/v12/strong-auth-nonce-ledger.schema.json` 及 migration 075 要求消费行二选一：`operation_id` 指向已持久化的操作，或 `response_sha256` 指向不可变失败响应；还须关联 `audit_log_id`。下载 claim 是 `system_backup_evidence` 行更新，不是 operation。当前下载在读取 provider 前不能预知发送结果，也没有不可变失败响应可作为成功准入的替身。
3. migration 066 的 `system_backup_operations.operation_type` 枚举没有下载准入类型。把现有其他 operation 类型借给下载会伪造操作语义。现有 `SQLPolicy.Audit` 只返回 error，不返回 intent 的 `audit_logs.id`，无法无歧义写 nonce 行的审计外键。

## 需由 D 确认的最小合同和 SQL 事项

- 为敏感下载定义准确的 OpenAPI operation/条件鉴权政策：公开/内部 evidence 是否共用 `getSystemBackupEvidence`，何种分类需要 proof，`Idempotency-Key` 的每次下载语义，以及当前请求 hash 的 canonical 输入。输入至少绑定 installation、evidence ID、actor subject/session、claim、规范化 byte Range；不能让客户端声明 owner/ref/URI。
- 给 nonce 消费一个真实、同事务的结果锚点。若选 D operation，须定义新的下载准入类型、状态与响应/失败语义，并修改正式 migration；若选其他不可变响应，须先修订 nonce ledger 的 `response_sha256` 合同，不能把成功准入伪装成失败响应。
- 在 D 的 `SQLPolicy` 审计适配返回本事务插入的 `audit_logs.id`，并确保 audit intent、claim CAS、nonce 唯一插入和结果锚点在同一事务提交。nonce 查重必须覆盖所有仍需保留的历史 HMAC key version，并验证并发、重放和 key rotation。
- 明确 provider 读取失败、客户端中断、claim 超时和会话撤销后的结果审计及重试语义；不可将“准入已提交”记为“明文字节已发送”。

## D 若选择 operation 锚点，还需一并评审的约束

migration 066 的 `system_backup_operations` 不只是 `operation_type` 枚举：`target_type` 与目标 ID 的 CHECK、同步操作终态 CHECK、成功结果 CHECK、`endpoint + idempotency_key` 唯一键和 redacted response 字段都约束新行。下载准入若以 evidence 为目标，需给 `sev_` ID 一个明确的目标类型和 CHECK；不能把安装 ID 或其他资源类型填进目标列来绕过约束。operation 成功只能表示 claim、audit intent 和 nonce 在同一事务**准入提交**，不能表示 provider 已读取或明文已送达。后续读取失败、客户端中断、撤权和实际发送结果应由独立结果审计表达，且不得回写改变已消费 nonce 的事实。

A 建议把重放语义也作为这次合同决定的一部分：相同 idempotency key 与 request hash 的再请求不得仅凭旧的成功准入 operation 绕过新 proof、当前会话/RBAC、claim 和 Range 检查；不同 request hash 必须冲突。若 D 选择允许同一准入重试发送，须明确旧 claim 的存活条件、是否需要新的 proof/nonce，以及响应正文已部分发送时可返回什么状态。在这些语义冻结前，A 只保留当前失败关闭的 `SensitiveDownloadProof` 接口，不写一个可能错误消费 nonce 的生产适配器。

在这些合同和迁移通过跨 owner 评审前，A 不提供可成功的生产 `SensitiveDownloadProof`。当前 nil 配置失败关闭。
