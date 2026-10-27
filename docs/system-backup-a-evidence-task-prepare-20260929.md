# A：任务正文准备与短期 Transit 写入凭据（2026-09-29）

`NewTaskPreparer` 将现有 SQLTaskAuthority、正文校验、专用 JWT 交换和 Transit encrypt 接成可调用的准备入口。它生成符合现有 framing 的加密暂存和 `Prepared`，补上任务写入侧原来只有抽象 Wrap resolver 的缺口。当前支持 SQLTaskAuthority 已实现的任务 `job_log_chunk`；其他正文不能通过该入口。

## 入口与授权边界

宿主传入真实 `*SQLTaskAuthority` 和经过准入的 `TransitJWTConfig`，用同一个 authority 的 `AuthenticateRequest` 验证实际 mTLS 请求，再调用 `TaskPreparer.Prepare(ctx, identity, source, encryptedStaging)`。identity 必须属于该任务、installation 和已准入 classification。不能用转发身份头、后台空 context 或其他 authority 的 context 替代认证。

准备阶段先锁定并核对 installation、active config、任务 snapshot、controller lease、当前 attempt、Job UID/generation 和 relay 身份。在同一配置事务中，额外锁定读取 `system_backup_configs.evidence_kek_identity_hash/evidence_kek_ref_version`，要求与固定 Transit KeyRef 完全一致；已有字段无需新增迁移。后续每次密钥授权都重新核对该引用，不回退到 latest/current，也不接受调用者选择其他 key。

正文在包装 DEK 前由 ContentDispatcher 做两次实时任务授权及结构/脱敏校验。入口持有私有的 identity、初始 lease hash 和期限绑定；JWT 交换前后、Transit encrypt 返回后，以及全部密文写入后再次核对任务授权。任务取消、接管、Job/attempt 替换、配置/KEK 漂移或到期均拒绝返回可用 Prepared。准备的 context 授权窗口至多 20 秒，并保留 5 秒数据库时钟余量；同步 source/dst I/O 的中断与超时仍由宿主负责，context 不能强行终止任意阻塞的 Reader/Writer。

准备发生在 evidence 登记之前，因此此处使用活跃任务/Job 租约，不伪造 evidence claim。调用成功后仍须由宿主调用真实 Service.Register，再按已提交 claim 执行 Service.Publish；这个入口不创建 SQLPolicy、owner 审计、远程对象或 evidence 数据库记录。若后续登记/发布失败，按既有生命周期处置密文暂存。

source 必须能重新打开同一份正文；现有 Prepare 在两遍读取中核对大小和摘要。dst 由宿主管理，应是任务专用、持久化的加密暂存。任何错误都必须丢弃 dst，即使失败前已经写完密文也不能把它当成功结果。Close 前先排空在途请求；关闭后入口拒绝新准备操作。

## 写入角色与短期凭据

`TransitJWTConfig` 作为写入/下载共用配置形状，`DownloadTransitConfig` 保留为兼容类型别名。共用的 JWT 交换代码保持严格响应解析、固定 HTTPS origin/CA、禁止代理与重定向、正文上限，以及 token/JWT 可控副本擦除。

写入映射必须使用独立的受审 encrypt-only role/policy，允许已有专用 evidence key 的 `transit/encrypt/<key>` update，并固定 EvidenceTransitContext 和显式 key version。不得授予 decrypt、key create/export/management 或 default/identity 附加权限。constructor 核对 workload issuer/subject，并要求 Transit audience/投射文件与任务 S3 STS 的不同。部署准入仍须核对写入与下载角色、身份和 ACL 的真正分离；配置字段本身不能证明远端权限。

每次 Wrap 都重新读取投射 JWT 并交换 token，不缓存或续期。只接受单一受审 policy、正确 role、明确不可续期、1..20 秒 batch TTL；响应接收时间加 TTL 必须小于等于 SQL/JWT 截止时间减去 5 秒。超长 TTL 被拒绝，不靠客户端缩短有效期伪装 provider 限制。返回的 token 只授予 Wrap；raw Keys、token 和 DEK 不通过公开入口暴露。

同下载 profile，batch token 在 provider 端可能继续有效至 TTL，不能单独即时撤销。数据库撤权后的客户端拒绝不能证明已签发 token 在远端即时失效；需要即时撤销时仍须交付可撤销 token 生命周期及现场证据。协议与该限制的官方来源见 [下载交付说明](system-backup-a-evidence-download-runtime-20260929.md)。

## 验证范围与后续

新测试通过实际本机 mTLS 请求调用准备入口，再通过本机 TLS JWT/Transit fixture 包装 DEK；验证投射 JWT 轮换、密文暂存与全正文 GCM 解密核对。负测覆盖任务/config/attempt/Job/KEK 漂移、交换后和加密后撤权、暂存期间撤权、数据库时钟领先、过长 TTL、错误 policy/JWT、非法正文、无绑定 Wrap、禁止 Unwrap、关闭及配置拒绝。

SQL transport、JWT 签发与 provider ACL 均为明确的合成测试夹具，不能证明真实 MySQL 并发、OIDC 验签、provider ACL 或生产任务宿主已接入。下载侧既有测试随共用 JWT 实现一起回归。本轮只在本机编译 Linux MySQL 探针和迁移工具，不执行远程操作、不安装依赖。

后续仍需任务宿主实际调用、受审 role/key/version/身份装载、正式 Registry policy/审计及 staging 生命周期；system capability producer、其他正文类型和真实备份/恢复验收仍未完成。

本轮验证完成：76 个主测试、548 个子测试通过（17.573 秒），vet 开启；Linux MySQL 探针及迁移工具编译通过。102 项输入源码摘要前后不变，wrapper 退出 0，隔离 cache/tmp/二进制已清理，独立检查目录不存在。结果见 [机器记录](evidence/system-backup-a-evidence-task-prepare-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-task-prepare-local-20260929.txt)。验证入口为 `pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。
