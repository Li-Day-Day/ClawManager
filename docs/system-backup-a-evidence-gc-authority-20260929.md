# A：GC 独立授权与元数据保留（2026-09-29）

新增 `SQLGCAuthority`，把 GC 的 S3 授权绑定到工作身份、现有 `evidence_gc` 操作租约以及生命周期已提交的证据 claim。它不复用任务或管理员下载 context，不签发 KEK 凭据，不改变 evidence 状态枚举或数据库表。当前交付为待运行装配的组件，未执行任何真实对象删除。

## 身份与实时查询

`GCAuthorityConfig` 只能由受审部署代码构造：固定 SQLRegistry 的数据库 UUID/name/installation、必需的 D SQLPolicy、当前配置版本/hash、store/delete 引用、root、GC 操作 ID/claim/row version、客户端 CA/hash/精确证书摘要、OIDC issuer/audience/subject/投射 token 文件和准入截止时间。没有请求 JSON 装载或通配身份。

`AuthenticateRequest` 要求已完成且验证过的 mTLS 握手，再用自身固定 CA 和精确叶证书重新验签。GC 与 task 共享底层证书校验函数，但 context 以各自 authority 实例为私有 key；即使测试中使用同一合成证书，task/download context 或另一 GC 实例也不能借用。生产必须配备独立 GC 身份、投射 token 和删除 ACL；构造函数不能代替部署身份分离的外部证明。

每次 `AuthorizeS3` 都独立开启 Repeatable Read 事务，核对数据库身份与 UTC，按顺序锁定 installation/config、D 的 owner/reference scope、指定 GC operation，随后读取完整 evidence/chunks。固定操作必须为 `operation_type=evidence_gc`、system target 为当前 installation、actor 为 `system:controller`、status 为 running，且 claim owner/row version 精确匹配准入。租约、操作 deadline、证据 claim、证书链或准入任一到期均拒绝；操作续租改变 row version 后必须重新准入，不能让旧 authority 自动跟随新 worker。

配置检查使用现有 `evidence_delete_identity_hash/ref_version`，不借用 read/write ref。关闭定时备份不会关闭合法保留数据的 GC。当前实现要求证据 store 与当前配置精确匹配；切换到另一个历史 store 后的清理仍需受审历史映射接线，不能回退到 latest 或随意指定旧 endpoint。

记录必须处于 deleting，具有精确 immutable version、合法完整 manifest/chunks、确定性 key、匹配的 claim 与 row version，并已经超过 expires_at/protected_until。每次外部访问前执行同事务 `SQLPolicy.Deletable`，由 D 证明 owner 终态、无活动引用/读租约/hold 和控制元数据保留条件。策略返回后重新采样时间，避免锁等待跨过工作租约；Commit 后还检查取消与到期。没有 SQLPolicy 或策略拒绝时不发 grant。

## 对象范围与不存在证明

GC grant 仅供精确版本 Stat/Delete。Put、Range、无版本删除、其他版本、错 checksum/size、错误 offset/deadline 及其他类型 claim 一律拒绝。OIDC 文件只在 SQL 提交之后读取，随后由现有 STS 组件交换并再次授权。Grant 不提供明文或 KEK 解包能力。S3 的 HEAD/GetObjectVersion 共用 IAM 权限，客户端操作限制不能被表述为 provider 可区分 HEAD 与 GET；生产 ACL 仍须限制精确对象版本和有效窗口。

新增 `GCAbsenceVerifier` 包装 C 的独立权威不存在证明 verifier：证明请求前后都重新核对 GC 授权、完整绑定摘要与 request。期间撤销、claim/operation 变化或 provider 返回错 request 时拒绝。它不会把普通 404 变为权威不存在，也不提供 C 的真实证明签发/验签实现。装配 S3Store 时必须用同一个 GC authority 同时连接 STS 与此 proof wrapper。

生命周期增加最终保留检查：拿到权威不存在证明后，在清除 Ref/chunks、写入 deleted 之前，重新检查 expires/protected 和同事务 Deletable。若期间新增引用或 hold，保留原 Ref/chunks 和待收敛状态，返回冲突；不能因为对象已经不存在就丢弃受保护的控制元数据。

同时修正 task content 授权提交边界：SQL Commit 后若调用取消或 grant 已到期，不返回正文授权。此前 S3 task 路径已经有提交后检查，本轮将正文路径也关闭该窗口。

## 仍需交付

D 需要提供正式 SQLPolicy，并复审 operation/owner/reference 的共同锁顺序、GC 操作创建/claim/续租、有界扫描、审计与故障持久化及 worker 调用装配；A/C 需要独立 provider delete/STS 身份和真实不存在证明。当前没有新增 worker 路由、创建运行操作、授予权限或部署 GC。

本轮结束时，到期 pending/write_unknown 的只读写入恢复授权尚未完成。后续 [SQLWriteRecovery 增量](system-backup-a-evidence-write-recovery-20260929.md) 已增加独立身份与证据 claim 的只读确认路径，验证记录单独归档。GC 仍拒绝这些状态；不能扩大 evidence_gc 的语义、借用删除身份重发 PUT，或将未知写入直接当作可清理对象。真实恢复 worker/凭据与状态收敛接线仍待交付。

## 验证

执行本地 `pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1 -IncludeSecurity`，保留 vet、依赖只读/禁止下载和隔离构建清理。新测试覆盖固定版本、身份/claim 隔离、配置和 operation 漂移、保留与引用、错误 provider 范围、到期/取消、证明前后撤销、元数据晚到 hold/reference，以及 task content 提交期间取消。SQL 使用脚本化 transport，owner/reference policy 与 provider proof 为明确的合成夹具；不是 MySQL 并发或生产 ACL/证明验收。

入口退出 0：security 为 78 个主测试、370 个子用例（9.855 秒），evidence 为 52 个主测试、392 个子用例（10.548 秒），合计 130/762；其中本轮新增 7 个主测试、59 个子用例。Linux evidence MySQL 探针与 migration runner 构建通过，未运行真实 MySQL 或远程操作。

91 项相关源码摘要保持一致，自有 scratch/cache/临时测试文件与构建二进制均已清理，并独立核对目录不存在。完整 services/server 构建仍受上一轮缺失依赖限制，本轮未安装依赖。各包计数、源码/构建/输出摘要及清理记录见 [机器记录](evidence/system-backup-a-evidence-gc-authority-local-20260929.json)，[完整验证输出](evidence/system-backup-a-evidence-gc-authority-local-20260929.txt)保留；以上结果不扩大为完整生产 GC 或到期写入恢复已交付。
