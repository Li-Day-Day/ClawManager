# A：到期外置写入的只读恢复（2026-09-29）

后续增量已补 [恢复观测与重试登记](system-backup-a-evidence-recovery-observation-20260929.md)。本文测试数据保留对应历史版本；当前恢复结果会同时更新 health、last checked 和 next reconcile，实际调度/worker 仍待接线。

新增 `SQLWriteRecovery`，处理 owner deadline 已过、但 evidence 仍为 pending/write_unknown 的精确对象确认。恢复使用独立受审工作身份和证据行的短期 claim，不借用已停止续租的任务 controller/Job 身份，不扩展 evidence_gc 操作语义。该组件只改变 evidence 登记，不更新 owner 任务状态；已失败、取消或结束的任务不会因发现迟到对象而被改回成功。

## 身份与租约

部署构造 `WriteRecoveryConfig`，固定 DB UUID/name/installation、必需的 D SQLPolicy、当前 config 版本/hash、store/read 引用、确定性 root、mTLS CA/精确证书、OIDC issuer/audience/subject/投射文件、准入截止时间及持久化 Failure 回调。恢复身份应使用独立证书、STS 角色和只读 ACL；没有面向请求的配置装载、凭据创建或生产启用。

`AuthenticateRequest` 验证完整 mTLS 状态并用自身 CA 和精确证书复验，返回本 authority 专用 context。任务、下载、GC 或其他实例的 context 不能替代。当前配置/read 引用变化、证书或准入到期、证据 claim 到期或接管都会拒绝后续访问。准入是受审部署事实；本轮没有增加运行身份注册或撤销控制面。

证据 claim 本身就是本次恢复的数据库工作租约。`Reconcile` 首先在同一 Repeatable Read 事务中检查数据库/UTC、按顺序锁 installation/config、D 的 owner/reference scope 和完整 evidence/chunks；必须由 `SQLPolicy.OwnerDeadline` 给出真实 owner deadline，且数据库时间已到期。状态须为 pending/write_unknown、immutable version 未定、store/root/key/manifest 合法且无其他 live claim。配置 enabled 不作为只读收敛条件，关停备份仍应允许确认旧写入。

随后登记随机 claim、最多 30 秒租约及审计 intent，row-version CAS 与审计同事务提交后才调用 provider。整个恢复调用限制 20 秒；工作授权同时受证书链、准入和当前 claim 的最早截止时间限制。没有另建操作表或为终态任务续租。

## 单一外部操作与结果

外部依赖采用只有 `Stat` 方法的 `RecoveryStat` 接口，没有 Put、Delete、Range、Absent、Source 或 KEK 方法。运行装配须把同一个 `SQLWriteRecovery` 接到 S3Store 的 STS resolver。新增内部 access kind `recovery`，只能授权原确定性 key 的无版本 Stat；其用途是发现未知写入产生的版本，不允许任意选择其他已知版本或读取正文。每次签发 grant 都重新查询完整 claim/config/owner/manifest，再在事务外读投射 token；现有 STS 交换仍会在交换完成后再次授权。

S3 HEAD 与 GetObject 共用 IAM 权限；方法限制在客户端接口上，不能宣称 provider 可单独区分 HEAD/GET。生产角色仍必须限制精确 key 和短期授权窗口，并与写入、删除、解密身份分离。

结果提交另开同样受审的事务，重新验证身份、配置、claim/row version、完整 manifest 和 Ref。精确 Stat 的 version 非空且非 null、checksum/size 匹配时，将 evidence 置 ready 并登记返回的 immutable version。错误 checksum/size/version 或明确完整性错误置 write_failed/checksum_mismatch，仍保留原 refs/chunks。普通 404、权限或可用性错误均保留 write_unknown/provider_unavailable；不将它们当作权威不存在，也不重发 PUT。

result 审计与状态 CAS 同事务，成功后清除本次 claim。审计失败、CAS 失败、配置轮换、claim 接管、取消或提交结果不明均不返回成功；原登记保留待收敛，调用必需的 Failure 回调持久化固定 `evidence_incomplete` 或 `checksum_mismatch` 信号，不透出原始 SQL/provider 错误。系统审计的 ActorID 是受审 principal 摘要，D 应以系统事件记录，不将其解释为普通用户数字 ID。

## 边界和后续接线

当前配置须仍映射到记录所属 store。切换到历史 store 后的读取需要受审历史映射，不能使用任意 endpoint/latest fallback。无法确认存在的对象继续保留未知记录；不存在证明与这类记录之后的安全清理仍须按引用/保留规则单独收敛，不能直接删行。

D 仍需交付正式 SQLPolicy 的 owner/deadline/锁序/系统审计实现、有界候选扫描、调度/重试/健康与容量指标、Failure 持久化，以及恢复 worker 的实际入口。A/C 需交付独立 OIDC/STS/read ACL、真实 provider checksum/version profile 和现场并发验收。本轮没有新建运行身份或操作、挂载路由、连接远程环境、执行真实恢复，亦不改变任何 owner 成功/失败状态机。

## 本地验证

执行 `pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1 -IncludeSecurity`，保留 vet、禁止依赖下载与产物隔离清理。新测试使用真实 SQLRegistry 扫描/CAS 和事务性模拟 transport，覆盖 pending/write_unknown 恢复、只读授权、普通 404/失败保留、对象冲突、错误身份/配置/时间/候选拒绝、审计/CAS 回滚、claim 接管、manifest 漂移、取消及提交不明；测试 transport 拒绝任何 owner 表写入。provider Stat 与 D policy 为合成夹具，不代表真实 MySQL/STS/S3 验收。

入口退出 0：security 为 78 个主测试、370 个子用例（15.523 秒），evidence 为 58 个主测试、432 个子用例（13.655 秒），合计 136/802；本轮新增 6 个主测试、40 个子用例。Linux evidence MySQL 探针与 migration runner 构建成功，未运行真实 MySQL 或远程操作。

93 项相关源码摘要保持一致，自有 scratch/cache/临时测试文件及构建二进制均已清理，并独立核对目录不存在。源码/构建/输出摘要、测试计数和清理结果见 [机器记录](evidence/system-backup-a-evidence-write-recovery-local-20260929.json)，[完整输出](evidence/system-backup-a-evidence-write-recovery-local-20260929.txt)保留。完整服务构建仍受此前缺失依赖限制；本轮没有安装依赖，组件通过不代表生产恢复流程已启用或验收。
