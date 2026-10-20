# D 已确认：敏感下载公共 operation 与 nonce 事务合同

【2026-10-19 公共草案增量】本决议的公共 enum/Operation schema、GET 条件 proof/key 与二进制 200/206、错误 profile、Go/TypeScript 公共读取已由[新交接](system-backup-d-download-public-read-20261019.md)实现并按 r18 验证。下文“尚未包含新类型”是本决议初次形成时的状态；正式共享评审/迁移和 HTTP/provider 生产接线仍未完成，不据本轮启用下载或登记他人批准。

【r47 勘误与实现推进】[勘误](evidence/system-backup-d-sensitive-download-erratum-20261016-r47.json)纠正下文旧的空内容说明：当前 Manifest 拒绝 size=0，`parseRange("",0)` 实际为 `0/-1`；当前下载准入应拒绝空内容。A 的 `0/0` 仅为未来编码向量，不代表现有 parser 支持。原机器决议保留原字节供 A 已冻结回执复算，本勘误对该字段优先。key 继续限制 `[A-Za-z0-9._:-]{16,128}`。D 已实现独立的实际审计 INSERT-ID/封闭 anchor/同事务原行复查候选，见 [实现边界](system-backup-d-download-admission-audit-20261016.md)；尚不等于完整前置锁或 nonce 消费。

D 接受 [A 的 10 月 16 日方案](system-backup-a-download-and-migrations-review-20261016.md)中的单阶段 GET、事务内 claim 间接绑定、一次准入和 operation 锚点。准确字段、锁序、错误码及待修改来源以[机器决议](evidence/system-backup-d-sensitive-download-contract-20261016.json)为准。A 可以据此实现和验证候选适配器，不再等待 D 在这几个方案之间选择。

本决定确定 D 的接口语义。现有公共 OpenAPI/DTO/枚举及 SQL 尚未包含新类型，正式变更仍按现有 registry 收集 A/B/C 评审；不将 D 的决定记成其他所有者批准，也不据此开启生产下载。

## 公共操作

继续使用 `GET /admin/system-backup-evidence/{id}`，operation ID 为 `getSystemBackupEvidence`，无请求正文。`confidential` 和 `sensitive` 必须提供当前强鉴权 proof 与单一 `Idempotency-Key`；public/internal 保持原读取权限规则。额外权限分别为 `system_backup.operate` 与 `system_backup.security_configure`。禁用备份调度不撤销保留 evidence 的合法下载权限。

policy 的准确增量为 `recent_strong_auth=conditional`、`strong_auth_condition=evidence_classification_confidential_or_sensitive`，并新增同值的 `idempotency_condition`；原 `idempotency_required=false` 只表示不对所有分类无条件要求 key，不能覆盖条件命中时的必需性。新增条件及属性先进入受审 schema，旧解析器不得悄悄忽略条件而放行。

新增持久操作 `evidence_download_admission`，目标类型 `evidence`，目标必须为同 installation 的准确 `sev_` ID。成功行固定 `succeeded`、`retryable=false`、`failure_category=none`、两个 result 字段为 null、`http_status=200`。该 200 是准入结果；下载 GET 仍返回 evidence 二进制，完整读取为 200，Range 为 206。成功响应带 `X-System-Backup-Operation-Id` 与 `Cache-Control: no-store`。现有 operation detail/list 在当前授权下返回完整脱敏 Operation，不能返回私有 claim 收据。

operation 的 `created_at/started_at/finished_at/updated_at` 使用最终 SQL UTC；`deadline_at` 是各项原始期限最小值，必须严格晚于准入时刻。保存完整公共 Operation 的准确 JCS 字节及摘要，和私有 admission receipt 分开；公共 Operation 快照不是下载 GET 的响应正文，更不是已发送明文的证明。

## 签名与 claim

request hash 为闭集 `{domain, endpoint, origin_installation_id, evidence_id, subject, session, manifest_sha256, range_present, range_start, range_end}` 的 UTF-8 RFC 8785 JCS SHA-256。domain 固定 `clawmanager.system-backup.evidence-download-request.v1`。主体/会话来自真实认证，manifest 来自授权的不可变完整 Manifest，不能只签内容摘要。签发和消费两端必须使用同一规范输入；key 另由现有 ProofPayload 的 `idempotency_key` 绑定。

Range 使用现有 parser 按实际 ContentSize 转换为包含首尾的整数偏移。等价的 closed/open/suffix 形式可归一到同一偏移；无 Range 与显式 full Range 通过 `range_present` 区分。重复 header、多区间、非法或越界数字在事务效果发生前拒绝。空内容仅允许无 Range，沿用 parser 的 0/0 表示。

**claim 不放入预先签名的 hash。** 它由服务端生成，在同一事务的不可变 receipt 中记录 claim digest、claim 期限、准确 evidence row version、manifest、请求 hash、主体/会话摘要、规范 Range、operation ID 和实际 intent audit ID，再由 nonce 的 operation 外键绑定。原 claim、proof、nonce、bearer、provider locator 和明文均不得写入该收据。收据上限 8192 字节，原始 JCS、大小、摘要须独立校验。

## 单一事务及锁序

D SQL registry 拥有一个 RepeatableRead `*sql.Tx` 和唯一提交点；A 借用准确事务验证 proof，不自行 Begin、Commit 或重试。原子效果为 intent audit、claim CAS、operation、私有不可变 receipt、公共 Operation 快照、nonce 消费和容量计账。任一失败全部回滚，本协议不创建“失败 nonce”来替代下载准入。

锁序遵循现有 L0–L10：所有 installation 行/空区间 → 当前 config/历史 key 集 → 当前身份/撤销 → operation/receipt key 与空区间 → owner/task → 引用/hold/所有历史 nonce 候选 → 物理 reservation → intent audit → evidence/chunks 与预选存储槽 → 最终检查与提交。所有 nonce 消费者和 key 历史变更必须共享 L0 串行化；仅 `(nonce_hmac,key_version)` 唯一键不能阻止跨版本并发重放。

当前 `AuthorizeSensitiveDownload` 在 evidence 锁后执行，不能在回调中再向前获取 nonce/operation 锁。D 的 registry 准备阶段须先取得完整前缀，向 A 回调交付不可伪造、绑定该事务与准确请求的 prelocked context。现有回调只能保留失败关闭，不能接一个独立 nonce 事务冒充原子性。

审计 API 确定为 `AuditIntent(ctx, *sql.Tx, Audit) (int64, error)`：必须从本次唯一 INSERT 的 `sql.Result.LastInsertId()` 取得真实 ID，核对一行、INT 主键范围及同事务中准确 actor/action/evidence/claim-digest/Range/time，再作为 nonce 的 `audit_log_id`。不允许 SELECT MAX、查最新行、猜 ID 或为取得 ID 重写第二条 intent。接口的具体封装由 D 实现，A 不从现有只返回 error 的 `Audit` 推测成功 ID。

nonce 成功行固定 `operation_id=本次 operation 主键`、`response_sha256=NULL`。历史 HMAC 版本必须由持久 config 历史与保留期内全部 ledger 版本的并集得到，包含 active；A 计算全部候选，D 在持锁状态查重及写入。缺失、重复、未解析或事务内漂移的版本集合均拒绝。

最后一次 callback 和写入之后重新读取 SQL UTC，复查当前 session/credential/revocation、RBAC/owner、原 proof 期限、原始 key/config snapshot、manifest/classification、claim CAS/期限及真实物理容量；不得通过 recheck 延长任何原始期限。commit 不明时不访问 provider、不返回成功 header/明文、不自动再次消费 nonce。

## 重试与结果

key 作用域与现有 operation 唯一键一致：installation、actor type/ID、endpoint、key。当前认证和权限检查后，同 key 同 hash 也返回 `409 idempotency_conflict`，不重新发送；同 key 不同 hash 同样冲突。新 key 使用已消费 nonce 返回 `401 strong_auth_replayed`。保留的过期 key marker 返回 `410 idempotency_expired`，不能回收成新请求。后续新下载需要新 key、新 proof/nonce，并重新通过当前 claim/会话/权限检查。

错误优先级明确为：先完成当前认证/目标权限、分类/传输以及不消费 nonce 的 proof 签名、issuer、绑定与期限验证，再判断准确 key 是否已有准入，最后对新 key 检查 nonce 重放。缺少或过期 proof 不会变成成功重放；现有 key 不因 nonce 同时已消费而随机变成另一个错误。

确认提交后，在 provider 访问前和首次明文输出前继续复查当前权限与 claim。读取失败、中断、撤权及本地写完成用独立 result audit 关联 operation/claim digest/intent ID；不修改 nonce 或成功 admission，不将本地写完成描述为客户端收到。已发送 header/正文后失败只能结束流并记录结果，不能补写 JSON 错误。结果审计失败进入现有持久故障报告路径，不允许因此重放准入。

具体错误码和优先边界见机器决议 `error_mapping`：缺少 proof 用 `strong_auth_required`，签名或绑定错误用 `strong_auth_invalid`，当前 claim 占用/manifest 漂移用 `state_conflict`，CAS 失败用 `version_conflict`；缺少 schema/历史材料/适配器或 commit 不明用 `503 not_ready`。生产校验不得回落为允许下载。

## A、D 后续实现边界

A 可完成签发/消费同源 canonical、proof 和全部历史 HMAC 候选、真实会话/撤销/RBAC 检查，以及跨 installation/evidence/session/Range/key 的替换与并发重放测试。D 负责前置事务锁能力、真实审计 ID、operation/receipt/响应存储、物理容量与保留，以及公共 DTO/OpenAPI 和追加迁移的受审变更。

新迁移须同时覆盖新枚举、sev_ target CHECK、同步成功终态、同 installation 关联、不可变 receipt/公共快照、FK/GC/保留/grants。不得改写已发布 066/075、借用 config_update 或重编号既有 081/082 候选。正式接收必须另有真实 MySQL 原子回滚/跨版本并发/未知提交/保留与容量证据；本次合同确认不声称这些实现或运行验证已经完成。

operation/公共快照、receipt、nonce、相关 audit 与幂等冲突标记作为保留组；冻结期限至少覆盖准入时刻加当前 control metadata retention、目标已有 protected_until 及各项幂等/nonce/audit 最低期限，后续配置不能缩短。跨表关联使用 RESTRICT，GC 在保留和 hold/ref 检查后处理组，不能让目标无限存活或留下悬空锚点。运行 receipt 账号只具准确 INSERT/SELECT，更新删除交给受审 GC；历史 HMAC 材料保留到最后引用 ledger 期限结束。容量预留包括真实物理页和索引/审计开销，不能拿 JCS 长度代替。
