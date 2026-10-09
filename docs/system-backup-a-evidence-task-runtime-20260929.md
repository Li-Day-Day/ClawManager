# A：任务 evidence 写入运行装配（2026-09-29）

`NewTaskRuntime` 将任务 mTLS/SQL 授权、TaskPreparer、Registry、S3 STS、受授权保护的不存在证明和条件发布接到同一个运行对象。调用链为 AuthenticateRequest → Prepare → Register → Publish；没有新增生产 HTTP 路由、runner 或部署开关。

## 构造与宿主调用

TaskRuntimeConfig 固定一个任务/attempt/Job admission、一个 SQLRegistry、S3 映射和 encrypt-only Transit 映射。构造器要求 authority 与 Registry 使用同一 DB handle、installation、server UUID 和 database，S3 store identity/version/root 与 STS issuer/audience 完全匹配。缺少真实 SQLPolicy、Failure 或 S3AbsenceVerifier 时拒绝构造，没有静态凭据或返回 true 的证明替代实现。

AuthenticateRequest 验证实际 mTLS 请求，所得 context 绑定内部 authority。Prepare 使用现有逐行日志校验、专用 JWT/Transit 包装与加密暂存；当前仅支持已实现的任务 job_log_chunk。Register 再次验证当前任务与配置 KEK，按受审 store/root 派生对象键，并调用真实 SQLRegistry.PersistPending。TaskRegistrationTimes 须由宿主从 owner/config 生命周期取得，SQLPolicy.Admit/OwnerDeadline 在插入事务内复查期限、保留、容量与归属；不能直接信任请求中的时间字段。

宿主须将同一份、任务专属的持久化密文暂存交给 Register/Publish。Prepare 失败时丢弃暂存；Register 失败或结果不确定时先核对登记，不能盲目重新加密同一 ID。已经登记的 pending/write_unknown 只使用原始密文调用 Publish，不能再次 Prepare 或覆盖既有 manifest/chunks。暂存命名、所有权、Sync/持久化、崩溃发现与清理仍由任务宿主管理。

Publish 在申请证据 claim 前先验证活跃任务及当前 KEK，再通过 Registry 锁定核对 evidence owner/type/classification/key，拒绝给另一个任务的记录抢占 claim 或改写失败状态。实际 provider 调用还由 SQLTaskAuthority 每次绑定已提交 claim、row version、精确对象、大小/摘要和 owner deadline。内部写入 Store 明确禁止 Range/Delete；没有公开原始 Store、Keys 或 token。

Register/Publish 为内部检查与网络传递 20 秒 context。宿主提供的 I/O、策略、证明及 Failure 实现必须正确处理取消，context 无法强行中断任意阻塞回调。Close 前先排空请求和 worker；关闭后拒绝新调用，不关闭调用者持有的 DB。

## 不存在证明与发布审计

TaskAbsenceVerifier 在独立 C verifier 调用前后重新验证任务、Job 和 evidence claim，比较租约绑定及 challenge/ref，并保留 5 秒数据库时钟余量。S3Store 继续核对观察时间、过期时间和随机挑战。不可信、过期或普通 404 不能成为发布许可；任务/claim 失效后不能接受先前取得的证明。

此包装器只解决调用授权，不实现 C 的 provider 证明语义。真实 verifier 仍须证明 issuer、endpoint/bucket/root/CA、权限、一致性窗口及精确 key/version。对于尚无 immutable version 的 pending 记录，必须证明整个精确对象键不存在，不能把 delete marker 后当前 HEAD 不可见当作不存在。

运行入口为 Service.Publish 的 Registry 加上事务内审计：取得 claim 时调用 `evidence.publish.intent`，写结果时调用 `evidence.publish.result`，随后才执行同一事务的 Save/CAS。两条记录使用同一 claim ID，ActorID 是该受审任务工作身份的摘要，result outcome 为 ready/write_unknown/write_failed。D 的 SQLPolicy.Audit 必须将这些内部事件映射到正式持久化审计；这里不是新的公共 API 或冻结合同批准。

intent 审计失败时不调用 provider；result 审计失败时回滚状态更新，保留原 claim/记录以便接管，不能在远端对象已写入后伪造 ready。非冲突/终态类发布失败调用必需的 Failure 接点，传递受限错误分类和独立 5 秒 context。实际回调是否持久化成功仍由宿主保证，该回调接口没有成功返回值。登记审计与 job-log sequence/attempt 归属仍由正式 admission 和任务宿主管理。

PUT 结果丢失时保留 write_unknown。后续在原任务授权仍有效时用精确 Stat 核对版本、摘要和大小，可转为 ready，不重新申请 Transit token、不读取暂存、不重发 PUT。任务到期后的处置继续交给独立只读恢复入口，不通过延长原任务身份重试。

## 验证边界

新增装配测试调用 Prepare/Register/Publish，经本机真实 TLS JWT、Transit、STS、S3 HTTP；S3 端独立验证 SigV4、条件头及完整密文摘要。覆盖正常写入、响应丢失恢复、不可信/撤权后的证明、intent/result 审计失败、跨 owner 拒绝、构造约束和关闭边界。单独的证明授权测试覆盖交换前后撤销、claim 接管和 challenge 不匹配。

这些测试明确使用合成 SQL transport、memory Registry、owner policy、Failure 回调、OIDC/provider 和不存在证明。它们验证实际客户端、授权、framing 和发布代码如何协作，不证明正式 SQLPolicy、真实 MySQL 事务并发、provider ACL/证明或生产任务宿主已经接入。上一轮 TaskPreparer 的实际 mTLS 请求测试也包含在回归中。Linux MySQL 探针本轮只编译，不自动远程执行。

仍待交付：B/D 的任务宿主、持久化暂存与日志序列登记，D 的正式 SQLPolicy/审计/Failure，C 的权威不存在证明和 provider 准入，以及真实备份/恢复联调。system capability producer、其他正文类型、历史 store 映射和完整 worker 生命周期也未完成。

本轮验证完成：79 个主测试、573 个子测试通过（23.365 秒），vet 开启；Linux MySQL 探针和迁移工具编译通过。104 项输入源码摘要前后不变，wrapper 退出 0，隔离 cache/tmp/二进制已清理，独立检查目录不存在。见 [机器记录](evidence/system-backup-a-evidence-task-runtime-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-task-runtime-local-20260929.txt)。入口：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。
