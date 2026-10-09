# A：任务日志正文与 STS 共用授权（2026-09-29）

新增 `SQLTaskAuthority`，同时实现 `ContentAuthority` 和 `S3WebIdentityAuthority`，从现有数据库查询任务状态并用 mTLS 认证 producer。本轮覆盖 task-owned `job_log_chunk` 的正文校验和 pending/write_unknown 对象的 Stat/Put。完整统一授权仍未完成：system capability producer、管理员下载、GC、运行入口装配及现场验收继续待交付。

## 身份与准入

`TaskAuthorityConfig` 是受信部署/准入输入，不是 HTTP DTO。每个实例精确绑定安装、数据库 UUID/name、配置版本及摘要、store/write 引用、客户端 CA/证书指纹、task/controller owner、attempt/phase、Job unit/UID/generation、relay 引用/版本、OIDC issuer/audience/subject、投射 token 文件、期限、日志分类及已审脱敏策略。不能把调用者字段或测试 fixture 当作已批准输入。策略 map/slice 在构造及返回时复制。

`AuthenticateRequest` 要求服务端已完成并验证 mTLS 握手，再以固定 CA 和精确叶证书指纹复验客户端用途和期限。返回当前 authority 专用的私有 context，每次授权再次验证证书。其他 authority、裸 context、未认证客户端的 TLS 或请求头身份均不能使用。TLS 终止代理没有 header 兼容分支。

SQL 撤销检查包括禁用/替换配置、controller 接管、Job/attempt 变更、relay 替换或到期、任务终结。未实现 CRL/OCSP，不声称外部证书吊销已自动同步；平台须通过受审控制面撤销 relay/任务绑定。STS 交换期间撤销由交换后重查捕获；已签发凭据仍受原有短策略窗口限制。

## 事务与 claim

每次使用 Repeatable Read 锁定读取，依次锁 D 现有的全安装排序范围、当前安装/config、task、phase 的最新 attempt、Job、需要时的 evidence。任务表来自四项闭集，其余 SQL 值均绑定。不能在持有 SQLRegistry 事务时调用此授权器；两者的事务边界分开，事务中没有 provider/文件 I/O。

检查数据库 UUID/name/UTC，active version 和 effective/config enabled，config 摘要/长度及 store/write 引用，task 快照实际字节摘要/长度，任务阶段、controller 租约和 deadline，当前 attempt 及 Job/relay 精确绑定。锁等待后重采数据库时间，本机偏差超过五秒拒绝。授权期限取准入、证书链、controller、owner deadline、relay 的最早值，发布时再纳入 evidence claim/expiry。

ContentDispatcher 读完整个正文后仍重新授权，比较 producer/lease 摘要和策略。这里授予任务范围权限，不冒充逐 chunk 日志索引登记；B/D 的 sequence、累计预算、诊断、JobObserver 与索引事务仍需接入。

SQL 中存在有效 claim 不能证明调用者持有它。Publish、下载 Handler 和 GC 现在都在 claim 事务提交后，把私有 access kind、evidence ID、随机 claim、row version 传入 provider 调用。任务 authority 要求 task claim 与锁定 evidence 精确一致，拒绝 download/gc claim、过期及接管。它恢复完整 evidence identity，核对 task/type/media/classification、内容摘要/长度、存储引用、确定性 key/摘要、framing、对象摘要/长度及 pending/write_unknown 状态。Put 还要求 checksum/size 和 owner deadline 相等；不授予 Range/Delete 或已有 immutable version 访问。

三条路径均已传递 claim；只有任务日志发布的实时授权在本轮实现。管理员会话/RBAC、GC 引用/保留检查及 D 的 `SQLPolicy.Admit/Authorize/Deletable` 仍是必需接点，未提供宽松替代。

本 profile 在 owner deadline 后连 Stat 也拒绝，不能直接用作 `write_unknown` 的到期恢复 worker。原 Publish 的“截止后只检查结果、不重发 PUT”语义仍保留；D 的恢复调度器须另行认证并获得精确对象只读授权，不能延长 producer 的写权限。终结/取消任务的后续诊断同样不能借用此活动任务 profile。

## OIDC 与运行装配

SQL 提交后每次重新打开已投射 token 文件，要求普通文件且有 20 KB 读取上限。部署方须保护文件及目录；路径不能来自请求，不使用静态 S3 key。JWT payload 仅预查 UTF-8、重复顶层字段、issuer/subject、唯一 audience、整数 exp/nbf/iat 及期限；这不认证签名，也不赋予 SQL 权限。固定 STS endpoint 必须验证签名/信任，现有客户端核验响应 issuer/audience/subject/role/session 后再次执行 SQL 授权。

失败只返回闭集错误，不回传 token、SQL 错误或 provider 原文。owned 字节缓冲在失败或消费后清零，Go 内部字符串副本不保证擦除。

运行入口应以同一个 authority 构造 ContentDispatcher 和 S3STSCredentials，并把 `AuthenticateRequest` 返回的 context 连续用于 Prepare/Register/Publish；S3Store 和 STS 使用同一受审 S3Config，登记/容量/保留/审计经真实 SQLPolicy。部署准入、证书/Job 绑定、token 投射、生产入口、D 锁序复审、真实 MySQL 并发、重启恢复和真实 provider 策略执行仍待验收，不能据此宣称 evidence 已部署。

## 本地验证

入口：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`，不带 `-Remote`，不开依赖下载，保留 vet。新测试生成客户端证书并完成本机真实 mTLS 握手；脚本化 SQL driver 检查实际查询参数/扫描/授权路径，本机 HTTPS STS 验证交换后 SQL 撤销。它不替代真实 MySQL 的语法、锁及并发验收。

覆盖配置/租约/attempt/Job/relay 变更、正文读取期间撤销、跨 authority/context/task/object、claim 接管/过期、Put 内容绑定、OIDC 拒绝，以及发布/下载/GC 向 provider 传递已提交 claim。

本轮完整包通过 40 个主测试、268 个子用例，耗时 4.743 秒；新增 6 个主测试、73 个子用例。Linux/MySQL 探针及 migration runner 构建通过，入口退出 0，未执行远程测试。run-owned scratch/cache/二进制/遥测目录已清理，并独立检查目录不存在。31 项 Go/runner/相关 DDL 源码摘要和输出摘要登记在 [机器记录](evidence/system-backup-a-evidence-task-authority-local-20260929.json)，原始输出见 [测试与构建日志](evidence/system-backup-a-evidence-task-authority-local-20260929.txt)。历史验收记录未回写。
