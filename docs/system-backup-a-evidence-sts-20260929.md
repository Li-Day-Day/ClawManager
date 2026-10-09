# A：evidence STS 临时凭据交换（2026-09-29）

新增 `backend/internal/systembackupevidence/s3_sts.go`，实现 `S3Credentials`，可以直接供现有 `S3Store` 使用。每次操作调用真实 HTTPS `AssumeRoleWithWebIdentity` 协议，不缓存凭据、不读取静态 access key，也没有自动安装、部署或创建 IAM 角色的路径。本轮验证使用本机 TLS 模拟 STS/S3；尚未接入真实 OIDC、任务授权来源或线上 provider，不能据此宣称生产 STS 已验收。

## 可信输入与授权

`NewS3STSCredentials(S3STSConfig, S3WebIdentityAuthority)` 固定 STS endpoint/CA、Role ARN、issuer/audience，以及与 `S3Store` 相同的 endpoint、CA、bucket/root、installation、provider identity/ref version。只接受 HTTPS、固定 CA、无内嵌凭据或 query 的端点。此 profile 支持 `aws|aws-cn|aws-us-gov` IAM role ARN；其他 provider 的角色/profile 需要独立适配和准入，不能自动沿用旧 lab。

`S3WebIdentityAuthority.AuthorizeS3` 必须认证真实 task、download session 或 GC worker，并从权威状态恢复 evidence、配置版本、attempt、claim/session、授权/撤销状态及期限，返回独占 OIDC token 副本。输入 scope 只是待授权请求，不能回显它来证明允许访问。包内没有生产 authority；现有登记服务的静态 S3 keys 不能作为它的实现。

Resolver 检查完整 scope 相等、Evidence Identity 与生成的精确对象 key 相符、installation/provider/ref 一致、配置版本、principal/lease 摘要、subject、token/授权有效期。task 必须有正 attempt 且不能删除；download 只读；GC 仅 Stat/Delete。Scope 对象摘要/长度、Range、版本和 PUT deadline 都受严格形状检查；版本内的 `${` 被拒绝，避免 IAM policy variable 替换。策略字段不从 caller 接收。

STS 成功后再次读取 authority，要求授权快照未变、未撤销/过期且 token 期限没有缩短到访问窗口之前；失败不返回任何凭据。二次检查不替代 D 的事务内准入，也不能撤回 provider 已签发的 token。真实 authority 必须检查撤销，字段摘要存在本身不证明实际 claim 有效。

## Session policy 与时间边界

按精确 object ARN 生成单一允许动作：未发布 intent 的 Stat 使用 `s3:GetObject`，带版本的 Stat/Range 使用 `s3:GetObjectVersion`，创建使用 `s3:PutObject`，删除使用 `s3:DeleteObjectVersion`。另以显式 Deny 禁止其他 IAM action、其他资源、非 TLS、到期访问、错误/缺失版本以及 PUT 缺失/不等于 `*` 的 If-None-Match；不为 multipart 初始化/分片创建条件豁免。策略超过 2048 字节直接拒绝，不截短或放宽 key。版本限制依据 [S3 条件键](https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html)，条件写入依据 [S3 conditional write enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html)。

根据 [STS API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)，本 profile 请求最短的 900 秒 session。对象访问权限另由 `aws:CurrentTime` 显式到期 Deny 限制到最多 60 秒，并取授权、OIDC token、PUT deadline、调用 context 期限的最早值，向下取整到秒。返回 `S3Credential.ExpiresAt` 表示本次策略允许的访问截止时间，不冒充 STS credential 的物理失效时间。全局时间条件语义见 [IAM 条件键](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html)。

这些是请求准入边界，不承诺已接收上传在截止后绝不提交；原 `write_unknown` 收敛规则继续适用。交换后的撤销不能瞬时使已签发凭据消失，后续 Resolve 拒绝和短策略窗口仍需真实 provider 能力证明。

IAM action 不等于精确 HTTP 操作：HEAD/GET 共用读取 action，Range、checksum/length 和 single PUT 请求形状仍由现有 S3 客户端绑定到 SigV4。临时凭据只供该内部客户端使用，不能向调用者分发或宣称 provider policy 单独限制了 Range。原生 SSE-KMS 额外权限未授予；不为配置不兼容自动增加 KMS、bucket-list 或其他权限。

## 协议与秘密处理

POST form 仅含 Action、Version、RoleArn、随机无业务信息的 RoleSessionName、DurationSeconds、生成的 Policy 和 WebIdentityToken。Token 不进入 URL；禁用环境代理、redirect、连接复用、压缩及写请求自动重放；设置 TLS/header/body 超时与大小上限，不自动重试 STS。

解析最多 64 KiB 的闭集 XML；拒绝重复/未知节点、错误 namespace、额外属性、DTD、注释、混合正文、尾随文档及畸形凭据。检查 issuer、audience、subject、返回 role/session，以及 provider expiration 在访问期限之后且不超出请求的 900 秒窗口。Session token 上限沿用现有 S3 adapter 的 16 KiB profile，超出即拒绝；这是客户端限制，不是声称 STS 服务承诺固定 token 长度。

所有失败对外统一 `permission_denied`，不回传 provider body、URL、OIDC token 或原始网络/authority 错误。源 token、form byte buffer、响应 byte buffer 和拒绝结果的 owned credential 副本清零；Go URL/JSON/XML/HTTP 内部字符串副本不保证全部擦除。成功 credential 字节由现有 S3 adapter 用后清零。

## 接线与后续验收

1. A/D 交付真实 `S3WebIdentityAuthority`，对接任务/attempt/claim、download session、GC 与实时配置/撤销，不采用测试 authority。
2. 平台交付已存在的 OIDC issuer/trust、受限 role、版本化 bucket、CA 和权限策略支持证明；receiver 的 issuer/audience/subject 必须准确匹配。
3. runtime 使用同一受审 `S3Config` 装配 resolver 与 `S3Store`，完成跨对象/版本/action 拒绝、期限、撤销、权限策略被服务端实际执行的现场验收。
4. 独立 evidence Transit KEK/实时凭据、C 的不存在证明、D 的 SQLPolicy/HTTP/GC、真实 ContentAuthority/JobObserver 接线仍未完成。现有配置激活、provider approval 和 v12 draft 不变。

## 本地验证

使用原有离线入口 `scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`，不带 `-Remote`；保持 vet、依赖只读和禁止下载。TLS 测试服务检查实际请求，独立解释线上传输的 session policy，验证额外资源授权不能绕过显式 Deny，并把 STS 结果接入原 S3 SigV4 客户端。覆盖绑定、撤销、策略长度、响应/namespace/凭据、TLS、到期、取消及 token 清零。最终结果单独登记，不改写旧回执。

最终当前源码的完整包测试通过：34 个主测试、195 个子用例，包耗时 5.890 秒；本轮新增 5 个主测试、42 个子用例，另在主测试内覆盖 scope/config/policy 矩阵。Linux/MySQL 探针与 migration runner 编译通过，原 runner 退出 0，自有 scratch/cache/二进制/遥测目录清理后确认不存在。此前日志交付的 26 项 backend/scripts 源码绑定未变，DDL 和 migration runner 摘要未变。

首轮入口通过 33 个主测试、195 个子用例（5.281 秒），但测试清单生成后新增的 `TestSTSUnversionedStatAndGrantDeadline` 没被枚举。因此没有将首轮作为最终完整测试结果；在同一离线缓存中补跑 `go test -count=1 -v ./internal/systembackupevidence`，得到上述 34 项结果，保留 vet，未重复 Linux 构建。补测完成早于原 runner 清理。参见 [原入口输出](evidence/system-backup-a-evidence-sts-runner-local-20260929.txt)、[最终完整包测试](evidence/system-backup-a-evidence-sts-tests-local-20260929.txt)和 [源码/清理绑定记录](evidence/system-backup-a-evidence-sts-local-20260929.json)。本机 TLS bad-certificate 输出均来自预期拒绝测试。
