# 给 B 的完整实现指令：接入公共 v12 系统备份链

日期：2026-10-28。本文可独立转发。目标是复用你已经交付的真实执行组件，接入 D 的公共控制面；不是重写 users/instances collector，不要求你接管 A 的授权/密钥或 C 的 provider/catalog。

## 0. 固定来源、控制面和交付判定

- D 当前本地 HEAD 为 `8ef5fa7fd4df45f6306e910705db01f589266ba7`，包含共享 dispatch ABI、Skill gate 和 A relay peer adapter，另有本轮 A/D 未提交增量；保留所有本地增量。下述验证必须包含这些原始字节。
- PR #1 当前远端 head 为 **`08d15abf443511376bf1a0c9c9593caea8feef5c`**，backup 为上述 `8ef5fa7f`。首次沙箱查询因 Windows schannel 无凭据失败，随后原生只读 `git ls-remote origin refs/pull/1/head refs/heads/backup` 成功核对。它已交付 publicadapter、Linux profile、真实 Job builder、结果转换、恢复和 relay handler，不能再要求 B 从零重写。D 已导入九个执行包的 110 文件，以及三份候选合同，记录见 `docs/evidence/d-b-public-adapter-import-20261028.json` 和 `d-b-public-candidates-import-20261028.json`。旧 `52117dee`、`1e678b09` 的测试不代替当前组合验证。
- **唯一权威是公共 v12**：`system_backups`、`system_backup_preflights`、公共 attempt/claim/fence/gate、Job observation、资源/evidence 账本与 A 安全入口。现有 API、幂等、任务状态和权限不替换成 PR 的独立控制面。
- 不在本安装运行 `control.Controller` / 独立 `cm_backup_control_*`，不执行 PR 的 `control/schema.sql`，不注册独立实验任务 API/页面。保留它们供显式独立实验，但不得被公共 production composition 启动。尤其不能混装同名异构 events/catalog/prune 表。
- `systemBackupTaskOwnerLink` 与 `systemBackupExecutionOwnerLink` 目前仍未绑定。D 的 `composeTaskExecution` 现已实际构造 `NewLinuxProfile→NewPublicRunner→BindTaskRunner→TaskExecutionLoop→Dispatcher`；完整 WorkStore/Ports/A/C 仍缺，缺失时禁止领取执行。构造调用存在与受控生产装配完成分别验收。

## 1. D 已交付的代码 ABI，B 按此实现

共享编译定义在 `backend/internal/systembackupdispatch/contract.go`，以该文件为准，不自行复制另一套类型。

`08d15abf` 已合入共享 ABI 提交 `d3c5715a` 和 Skill backfill 修复。D 的 `Input.Backup`、`backup_spec.go`、`task_binding.go` 为后续本地增量。可直接应用 **`docs/evidence/d-b-task-binding-handoff-20261028.patch`**：基线为上述 PR head，含7个准确源文件，已在自有隔离目录实际 `git apply --check`、apply，并逐字节核对与当前D源码一致；目录已清理，记录同名 `.json`。先在B分支核对head并 `git apply --check`，有额外增量时保留并解决冲突，不能强制覆盖。

D 已在导入后的 `runner.go:cloneInput`、`LinuxProfile.Discover/BindWriters` 中补齐 BackupSpec 深拷贝及各 builder 的 SourceInventory 切片隔离，在 `admit` 中拒绝 typed-nil context；B 合并这些最小适配，不另写请求 decoder 或另一套 hash。补丁不包含完整D WorkStore/原授权，不应解释为整个controller交付。`SQLBackupStartStore` 已从原 task 加载 spec/snapshot，但 `BackupStart` 仍不含 ProfileID/Revision，完整映射归 D。

```go
type Runner interface {
    Prepare(context.Context, Input, Ports) (Plan, error)
    Capture(context.Context, Input, Plan, Ports) ([]ModuleResult, error)
    Recover(context.Context, Input, Plan, Ports) (RecoveryResult, error)
}
```

D 的具体调用是 `cmd/system-backup-controller/main.go` → `composeTaskExecution`（`task_execution_live.go`）→ `TaskExecutionLoop.RunOnce`（`controller/task_execution_loop.go`）→ `systembackupdispatch.Dispatcher.Prepare/Capture/Recover` → D `taskBoundRunner` → **已交付的** `publicadapter.runner`。保留其导出入口：

```go
func NewPublicRunner(deps Dependencies) (systembackupdispatch.Runner, error)
```

`publicadapter.Dependencies` 的准确字段是 `Profiles map[ProfileKey]Profile`、`Results Results`、`Recovery RecoveryInventory`、`Admission func(context.Context,Input)error`、`ValidateInventory func(context.Context,Input,Discovery)error`、`RecoveryTimeout time.Duration`。最后一项须大于零且不超过五分钟。`Results.Read(ctx,Authority,JobBinding,EvidenceRef)` 返回原认证报告 bytes；`Recovery.Pending(ctx,Authority)` 返回 `RecoverySnapshot{Pauses,Jobs,Undispatched}`。缺任一真实 owner 即拒绝，无独立 SQLStore/Vault fallback。

D main 的 `taskExecutionOwners` 当前接收 `Profiles []taskExecutionLinuxProfile`、`B publicadapter.Dependencies`、`Ports dispatch.Ports`、`Store ExecutionWorkStore`，以及并行D后续新增的 `Records *controller.SQLExecutionRecords`、`Jobs controller.ExecutionJobOwner`。每个 profile 明确 `Key{ID,Revision}` 和 `Source LinuxProfileConfig`，由 D 构造并填入 B.Profiles；禁止同时填另一个 Profiles map。Linux 配置准确字段为 `Source *sql.DB`（独立 SELECT-only 源连接）、`Database/ServerUUID`、`Supported map[AgentKind]bool`、`HoldLimit`、`BuildWriters(ctx,Input,SourceInventory,[]FrozenWriter)`、`BuildParts(Input,SourceInventory,holdUntil)`。真实 Agent/CRI/NFS/Kubernetes handles 在这些已准入 builder 内提供，构造本身不执行 IO。

当前D装配还会构造 `DurableExecutionStore{Scheduler:owners.Store,Records:*owners.Records}` 和 `NewExecutionJobPorts(owners.Ports,owners.Jobs)`。后者实际执行 `UnwrapTaskPlan→DescribePlan→kube.WorkerConfigMap→runner.Ensure(ConfigMap)→runner.Ensure(Job)`；B继续调用同一Ports，不另写控制SQL。D的Jobs owner准确方法为 Admit、Bind、Read、Evidence、Revoke、Stopped：Admit必须提供原完整barrier/SQL资源journal/current authority；Bind在真实UID后登记原grant；Stopped提供真实worker/Pod停止证明。这些生产owner仍归D/A，不转嫁B。该后续增量正在单独验收，旧132/366和旧两平台构建不覆盖其新增main/records代码。

### D 输入的准确来源

`Input.Authority` 的字段已在 Go 文件定义：

| 字段 | D 提供的真实来源和约束 |
| --- | --- |
| InstallationID / TaskPublicID / TaskType / RequestID | 原公共 task；安装来自受审部署/A scope，不能来自客户端任选安装。 |
| ConfigVersion / ConfigSHA256 / Input.ConfigSnapshot | 创建时保存的完整 canonical config snapshot；D 验证 hash/size，不重新读取当前配置替换历史版本。 |
| AttemptNo / Phase | 当前公共 `system_backup_attempts`；phase 使用原 capture/secret_capture/publish/preflight 等闭集。不是 B 自建的 attempt 字符串。 |
| ClaimOwner / ClaimRowVersion | 公共 `SQLTaskClaimStore.AcquireWithReceipt` 已成功提交的 token/current row；失去 claim 即失去新工作权。RowVersion 不等于执行 generation。 |
| MaintenanceOwner / MaintenanceFencingToken | 公共已持有 maintenance lock/gate 的 owner/fence，供 capture 使用；只读 preflight 不得伪造一个 gate token。 |
| DeadlineAt | 原 task 绝对期限，包含排队；不得以当前时间重新生成。 |
| ProfileID / ProfileRevision | D 从已准入的原 profile 映射提供；目前实际映射 loader/现场输入未齐，属于 D/A/B 明确输入交付，不让 B 从 matrix/profile 文本猜 revision。 |
| Input.Jobs | 已登记公共 Job 的 exact JobUnitKey/namespace/name/UID/generation、relay ref/version/bound/expires。未创建 Job 时为空，不能伪填 UID。 |
| Input.Backup | 本轮补齐的 `*BackupSpec`：SourceOrchestrator/SourceProfile/MatrixKey/DatasourceTopology/Runner/TaskPurpose/RequestedParts，逐项来自原 `system_backups` 的同名 snake_case 列。parts/purpose 不能从当前 config、profile 字符串或 functional_test 默认推算；D 的实际 SQL input loader 尚欠，未齐不调 B。共享 d3c5715a 之后此字段仍为 D 本地增量，B须以随本文交接的最新 contract.go 字节为准，不能只拿旧共享提交。 |

`Plan` 包含 `SchemaVersion / CanonicalJSON / SHA256`。B 私有版本保持 `system-backup-b-plan.v1`。D `BindTaskRunner` 包装为 `system-backup-task-plan.v1`，额外绑定原 BackupSpec（含 parts/purpose）、task/config/attempt/profile/deadline；内层 bytes 以 base64 原样保存，单独记录版本/hash，不能压缩改写后套旧摘要。这个 Spec 结构 hash 不是 Requests JCS/hash，也不是授权/签名。D 加密 WorkStore 仍欠，只有持久化成功，后续 Next 才可返回 capture。D materializer 必须先 `dispatch.UnwrapTaskPlan(input,storedPlan,publicadapter.PlanVersion)`，再 `publicadapter.DescribePlan(input,innerPlan)`；不得把外层直接传给 B DescribePlan。Capture/Recover 自动解包并传入本次当前 claim/fence，不能把旧计划当新授权。

ClaimRowVersion 是每段调用的准确原观察，不是不可变 lease generation。D 现有 SQL 检查拒绝版本变化，包括 renew。长 capture 的续租/当前 token 与已派发 Job 原 identity 的映射仍由 D 完成；B 不把旧 version 自动改为新 version，不自己续租，更不能拿本地 flow generation 替代它。

`ModuleResult` 精确字段依据 `runner-data-interfaces.schema.json#/$defs/PartResult`：schema_version、part、category、status、checkpoint、statistics、warnings、evidence_ids、failure_category。状态闭集是 `completed|failed|canceled`，不是 task 的 succeeded。空数组/map 必须真实返回空集合；checkpoint 可为 null，但 completed capture 所需 checkpoint 不能缺失。不得把 `flow.Part.Checkpoint` 当 C manifest checksum。

## A. B 必须修改的完整任务单

### A1. 保留已交付真实 runner，合入 D 的 Spec 适配

**修改位置**：`publicadapter/runner.go:cloneInput/admit/Prepare`、`linux_profile.go:Discover/BindWriters`、`composition.go:NewLinuxDispatcher`。上述 runner/profile 已完成拆分，公共包不导入 control/host/profile/artifact/recovery，旧 profile.Driver 保留作 lab adapter，不要求重写 collector。

**保留复用**：`Metadata/Probe` 的真实 capability 检查、read-only discovery、冻结计划、collector/writer/Job template、实际 client-go/Agent/proof 逻辑。保留旧 `Discover(ctx,control.Task)` / `Bind(ctx,control.Task,plan)` 作为明确 lab adapter；公共 adapter 不调用旧 SQLStore 路径。

**必须修改**：合入 D 上述深拷贝/typed-nil 修复，并补至 B 分支测试；保留无 control SQL 的当前依赖闭包。若 B 使用 `NewLinuxDispatcher` helper，它返回的是未包 D envelope 的通用 dispatcher，不能替换当前 D main 的 `BindTaskRunner` 路径。旧 lab 里的 DB 调用不要求删光，但绝不能被公共 builder/caller 引入。

**输入输出/调用**：D `Dispatcher.Prepare` 调 B `Runner.Prepare`，输入上节 `Input` 与每次调用的 D `Ports`。返回只读发现后的冻结 `Plan`；此阶段不得创建 Job/PVC/worker grant，不得写 task/attempt/控制 SQL。D 持久化计划后才调用 `Dispatcher.Capture` → B `Runner.Capture`。

**事务/异常**：SQL 锁内不做网络。B 不 Begin/Commit 公共控制事务，不创建第二任务。缺 profile/能力/映射返回 not_ready；旧 profile revision 不可用时拒绝，不能重新 discovery 新 revision 冒充接管。

**验收**：公共 adapter 的测试运行时不提供独立 control DB；静态及运行检查证明无 `SQLStore.Create/claim/Begin` 调用；Prepare 零资源副作用；同一冻结 plan 的 Bind/Capture 不重新分配身份。缺 Ports、错 task/config/attempt、过期输入均拒绝。

### A2. 公共 task → capture/checkpoint，保留已有真实 barrier

**修改位置**：保留已交付的 `publicadapter/capture.go:journal/Capture/Recover`、`jobs.go:jobCollector`、`job_factory.go:BuildCapturePart`、`results.go:BuildPartResult`，以及 `flow/capture.go` 的原 barrier。`LocalFlowGeneration=1` 已明确为私有 discriminator，完整 Authority 每次传 Ports，此项不要求 B 再改。剩余修改是受审 BuildWriters/BuildParts builder 与实际 Agent/Pod/CRI/NFS 组件适配；D 提供下一节具体输入后，B补其 data plane 的调用实测，领域 collector 仍由各原 owner 提供，不默认要求B接管其实现；不能绕回旧 profile.Driver/SQLStore。

**输入输出**：D 调 `Dispatcher.Capture(ctx,input,persistedPlan)`。B 用完整 Input 闭包绑定 `flow.Journal` 到 D Ports：`CheckFence→Ports.Check`、`CheckRecoveryFence→CheckRecovery`、PauseIntent/Paused/Resumed 分别逐项转发。WriterState/ACK 的 UID、generation、running/checkpoint/stopped 必须原值传递。

旧 `flow.Identity.Generation` 不得默认为公共 ClaimRowVersion。公共路径的所有权判断以完整 `Authority` 为准，不能继续只比较旧单字段 generation。需要保留旧 flow identity 形式时，将其视作本地调度标识，authority callback 必须绑定完整公共 claim/attempt/gate；具体 legacy generation 适配必须在 B 的新 plan schema 中显式标注并与 D 测试，不能用它代替 maintenance fence 或 Job generation。

返回 `[]ModuleResult`：每个 requested part 的真实 checkpoint、统计、警告和已登记 evidence ID。B `BuildPartResult` 已完成显式转换，`capture.go:Checkpoint` 和 `b-candidates/checkpoint.schema.json` 已交付，保留复用，不要求重写。剩余是 A/C 联核原认证报告、immutable seal 与其引用：checkpoint/invocation hash 不能直接当 capture certificate 或 manifest checksum。候选合同未晋升为公共 approved 合同。

**异常/恢复**：保留 ALL collectors prepare → 持久 pause intent → ALL writer ACK → 当前 CheckPaused → capture/seal → revoke/stop collectors → 按原状态 resume 的顺序。取消不能取消必要补偿；collector 未证明停止前不得 resume source。cluster early release 若没有公共 checkpoint/fence 证明，不启用该优化；不得延长原 hold/deadline。

**验收**：停写失败、部分 ACK、UID 替换、collector prepare 不明、seal 失败、取消、失 fence、Stop 失败、Resume 失败均有反例；所有失败不返回 completed parts；源状态恢复有逐 writer 原始事实和最终证据。仅 users/instances 通过不能称六域成功。

### A3. Job / WorkerGrant / relay 身份适配，公共领取回执由 D 负责

**修改位置**：保留 `publicadapter/jobs.go`、`job_factory.go`、`relay.go` 和 `worker/control.go`、`kube/runner.go` 的真实组件。B负责把 `worker/control.go:Authorizer` 的实际传输接到 A 交付的 worker 授权入口；`control/worker.go` 的旧 WorkerGrant/WorkerAuthorizer 仅作原行为参考，不把旧独立 worker/resource 表装入公共路径。

**保留复用**：mTLS、唯一 SPIFFE、真实 JobComplete 与已认证 result 联合校验、UID/spec 校验、幂等 Ensure/Cleanup 和 RevokeWorkers 的真实执行逻辑。

**D 调用与输入**：公共 claim 已由 D `SQLTaskClaimStore.AcquireWithReceipt` 完成，token 只有 commit 确认后才可使用。B 不再次 claim。B 通过 `Ports.EnsureJob(ctx,Authority,JobIntent)` 请求 D 协调真实创建：JobIntent 是精确 JobUnitKey/namespace/name/generation/spec JSON/spec SHA；D 的该 port 先由真实owner提交公共 intent，再调用 B 的真实 kube Ensure，登记真实 UID 后返回 `JobBinding`。B消费原plan中的credential-free invocation，不得提前造UID。`ObserveJob/StopJob` 均带同一exact binding。D新Job port已有实际调用代码，但其SQL ResourceJournal/worker-grant owner还未生产绑定，不能把interface callback当已持久化。

当前公共 Job observation 已有 installation/target/attempt/phase/job_unit_key/job_uid/job_generation、relay ref/version/期限、last accepted sequence/body hash/progress 等列。**创建前的公共 Job intent、worker grant 持久化实现及 runtime ports 尚欠 D，不要求 B 用独立表补洞。** 未提供这些 ports 时整次 not_ready，不直接发 Kubernetes 请求。

领取事件固定 `diagnostic.d.task_claim_acquired`：D 原 CAS 与 INSERT、原 identity/lease/clock 最后复查在同一个 RR transaction，未知 commit 不返 token、不自动重试。已有 pending deadline caller；新增 `SQLBackupStartStore.StartNext→Start` 代码 caller，把相同 claim/receipt、初次状态推进、attempt 1 的 capture/secret_capture 两单元和核心事件在同一事务提交。它尚未装入完整 production ExecutionWorkStore，不代表 B 已运行。B adapter 只消费 D 提供的提交后身份；不能用 PR 独立 `controller_claimed` event、当前 lease 或 attempt 数代替公共领取历史。

**relay**：B 已交付 `RelayMessage`、`NewRelayHandler`、`RelaySequence`、`RelayProgress` 和 `b-candidates/status-relay.schema.json`。保留 mTLS/唯一 SPIFFE、闭集/重复字段/大小、首序 ready、terminal 仅原序原 body 重放等实现。准确追加入口是 `RelayAcceptor.AcceptRelay(ctx,*http.Request,RelayMessage,rawBody,bodySHA256)(RelayDecision,error)`，由 D 实现事务并注册 handler，B 不另注册公共 URL。A 使用原 request 的证书/trust/SPIFFE 和撤销/期限证明；D 同事务检查公共 task/claim/fence/Job binding、应用 B 两个规则、CAS cursor、持久原认证结果引用并最终复查。B候选消息尚无 bytes/items/checkpoint 业务进展字段；不能把每次 ready/running 心跳记作 last_business_progress_at，是否扩展正式消息由 B提出、D/A共同决定。

原 `WorkerAuthorizer` 还硬编码 functional_test，不能删除该检查后就声称支持 acceptance。acceptance 所需 A grant/全部域/受审 profile 输入必须到齐，否则明确 not_ready。

**验收**：错安装/task/attempt/phase/unit/UID/generation/ref/version、双 SPIFFE、过期/撤销、重复/乱序/异 body relay、Job complete 但 result 不认证、认证 result 但 Job 未 complete、未知 claim commit均拒绝或按已定重放规则收敛；重试不重复 Job/receipt/结果。

### A4. 全部实际 writer 的公共 gate、恢复和清理

**最新 PR 已交付，保留复用**：`mutation.ContextGate/EnterContext`、`services.enterBackupMutationContext`、Skill 的 context 传递，以及 middleware 精确 method+FullPath 分类（包含公共读取/取消/清理）。不用 B 再重写这些接口。它们尚不等于实际公共 gate adapter、完整 writer 覆盖或 main 注册；PR 的 Skill backfill 还须保留 D 当前启动关门后重试修复。新增的取消上下文只能通知协作停止，不能把 ctx.Done 当作子任务退出/许可释放证据。

**修改位置**：`profile/writers.go`、`flow/capture.go`、`quiesce/*`、`control/app_process.go`、`legacy_mutation.go`、`services/backup_mutation_gate.go`、`systembackup/mutation/gate.go` 及所有实际 writer 的许可接点。

**输入输出**：D/A 提供完整受审 writer registry、公共 gate/maintenance fence、原 writer UID/generation/state、watchdog/原 hold deadline；B 返回逐 writer 当前观察/ACK、停止和恢复事实，通过 D Ports 记账。来源不完整不能以“已有列表全部成功”代替全部实际 writer 成功。外部 NFS writer proof 保持必需，Pod 枚举不能代替 fencing。

**调用/事务**：D 的公共 capture coordinator 取得 gate 后调用 B，B 必须经 Ports.Check/CheckRecovery；D 每次 pause intent/ACK/resume 持久化遵守原锁序与最终复查。远程暂停/恢复在 SQL transaction 外执行；原 intent 已提交且当前恢复 fence 允许后才执行补偿。

**middleware**：`0a4bdc19` 已修复旧版 singular 前缀排除，改为明确 method+`c.FullPath()`，包含公共 plural 查询/cancel/cleanup；旧评语不再适用。D/A 仍须把新增列表逐项对照现有 operation policy，并完成真实 gate adapter/main 注册和认证联核。不能按 GET 全放行，Auth/SetUserInfo/Admin/A scope仍完整执行，不能把维护例外变成认证例外。PR 已移除默认全局注册，保留该处理。

**Skill worker 已有本轮共同增量**：D checkout 已接 PR 最小 permit 增量，保留 StartContext/StopAndWait、所有子任务和 ReleaseToPending 完成后才释放许可；另外修复 gate 启动关闭导致 backfill 永久丢弃的问题：重开后重试一次 backfill，释放后才 claim。B 合入时保留这些新字节，不用 PR 旧 worker 覆盖。准确记录见 `system-backup-c-skill-gate-integration-20261028.md`。

**验收**：HTTP/异步/Skill/实际 Agent writer覆盖矩阵；关门不新增写；已在途工作 drain；StopAndWait 超时不等于退出；取消清理阻塞时 permit仍有效；清理/释放失败被保留；gate重开恰一次 backfill，等待期间取消不写。nil/disabled registry 的 no-op 不构成 capture 资格。

### A5. 执行结果、错误、状态与接管

**修改位置**：`publicadapter/results.go:BuildPartResult`、`capture.go:Recover`、`jobs.go:restoreExisting/Stop` 以及 `flow/recovery.go`。当前没有 publicadapter/recovery.go，不要求另建。已有完整恢复 inventory/partial dispatch/停 Job 后恢复源逻辑保留；不要引入独立 Controller 的 SQL 状态 CAS。

**分工**：B 只返回 module result/恢复事实；D 单独拥有公共 task/attempt/check/event 状态推进。B 不写 task.status、不直接宣告 acceptance_ready、不把正在恢复的旧任务复活成 pending。公共正常 backup 状态顺序仍为 pending→preparing→ready_for_capture→acquiring_gate→capturing→validating→publishing→succeeded。

| 异常 | B 必须停止/返回 | D 处理 |
| --- | --- | --- |
| cancel / deadline | 停止新的 source read/Job/外部写；用新恢复 scope 完成有权补偿，返回真实结果 | 按 can_cancel/commit_started CAS；canceling→canceled 或 failed；原绝对期限不延长。 |
| claim/fence 丢失 | 停新工作；不以旧身份 resume/发布；返回 fencing_token_lost 或无法证明时 coordination_invalid | 不把 leader 丢失本身直接判失败；新 owner 从原 plan/checkpoint/ledger接管。 |
| 部分外部动作不明 | 不盲重发；返回绑定原 action/key/hash/version 的观察事实 | C/D 按唯一 unresolved action 只读 Stat/判等；可能已发出的 final PUT/catalog append 超时进 finalization_unknown。 |
| capture 前瞬时失败 | 返回明确失败，不自行递增公共 attempt | D按原前置条件决定新attempt；seal后接管/Job重建仍是同一attempt，禁止重读source。 |
| 终态用户重试 | 不复活原任务 | 新key新task，retry_of_public_id；旧key仍原资源或tombstone410。 |

B 为具体错误返回 `systembackupapi.Error` 不是必需，也不允许导出 driver/provider原文；module failure_category 用原闭集。语义明确时分别采用 permission_denied、quiesce_timeout、quiesce_resume_failed、runner_failed、checksum_mismatch、fencing_token_lost、coordination_invalid；不能把所有错误折成成功/跳过或自动可重试。未知分类交 D 决定并补测试。

**验收**：失claim前后、pause后崩溃、seal后接管、cancel与commit CAS竞态、deadline与外部未知结果、原plan不可用/漂移、终态重试，每项核对公共行和副作用；只有返回 error 不算完成安全收尾。

### A6. 公共产物/evidence，避免重写 owner 基础设施

**修改位置**：公共路径为 `publicadapter/results.go:SealedPart/BuildPartResult` 与 `runner.go:Results.Read`；两者已经存在，B只接明确 A/C 输入并补格式转换测试。旧 `profile/execution.go` Publish、`control/publication.go`、`recovery/*` 和 `artifact/*` 保留作 lab，不把它们的 signer/provider 注册到公共生产。

公共 artifact/finalizer/catalog 领域 owner 为 C；A 管签名/key purpose/KEK/trust；D 管公共 SQL/状态/HTTP。B 将真实 sealed part/checkpoint 和 module evidence交给这些接点，不默认要求 Skill Hub重写公共基础设施。

PR recovery 虽也叫 system-backup.v1，manifest字段、signed envelope、signature framing、marker/acceptance/finalizer请求与公共v12不兼容。B不在公共路径直接调用其本地 signer/key map/native factory作为默认产物实现；把组装/提交委托给 C adapter。禁止改字段后沿用旧 checksum/signature。

D `TaskDetails` 消费 `systembackupread.CurrentTaskFacts`，manifest消费同包 `ManifestReader`。B只提交自己可认证的 Job/执行/停止/校验事实，由D持久化；C提供provider/catalog/不可变对象当前事实。B不能从自己报告中的valid或saved usable推导当前 artifact资格。

**验收**：公共schema原bytes/checksum/signature vectors；metadata/manifest/task一致；B/C不匹配准确拒绝；最终PUT/catalog未知结果不重发；私有格式不会进入publicmanifest API。C adapter未到齐时准确not_ready。

### A7. 移除生产双控制面与实验管理入口

**最新 PR 已完成的部分**：`cmd/server/main.go` 已拒绝 `CLAWMANAGER_BACKUP_CONTROL_CONFIG`，移除独立 SQLStore/旧 singular API/全局 gate 注册；`cmd/backup-controller/main.go` 已要求 `--experimental-isolated-lab` 且拒绝设置公共安装/启用环境变量。保留该隔离增量，不要求重写。仍需验证默认构建/部署及前端路由没有另一生产入口；不能仅凭新 flag 判定安装/凭据在现场隔离。

**修改位置**：PR `cmd/backup-controller/main.go`、`host/run.go`、`cmd/server/main.go` 的独立路由、`handlers/system_backup_handler.go`、`middleware/system_backup_gate.go`、`frontend/src/pages/admin/SystemBackupPage.tsx` 与独立 service/router注册、示例deployment。

保留领域 worker镜像/入口、受审实际资源adapter；公共production不启动host.Run里的独立SQLStore/Controller，不migrate cm_backup_control_*，不同时展示两套任务列表或暴露另一套取消/幂等API。实验入口仅显式lab配置，默认关闭，不能作为公共链的fallback。

**验收**：默认生产binary/部署图只有公共调度控制器；路由枚举没有旁路；数据库连接/DDL记录无独立控制库；公共查询/取消/安全收尾经过原Auth及A scope。

### A8. B 的交付包与本地/现场验收

交付PR准确head、相对当前backup的diff、受影响文件/接口、每个productioncaller、依赖pin、原生日志/退出码、场景矩阵及清理记录。不要只报 go test ./...通过；跳过的SQL/K8s用例和旧52117基线单列。

本地至少验证A1—A7正反例；D/B/A/C共同组合后，在同版本zhanghui08安装验证真实成功、同key重试/冲突、权限不足/跨安装拒绝、取消/超时/失fence/约定失败。独立observer必须看到同事务enqueue和公共claim receipt、真实attempt/Job/relay、终态及原manifest checksum。controller pending deadline receipt本身不是B执行证明。

不自行安装依赖；使用现有依赖、GOPROXY=off/GOSUMDB=off/GOTOOLCHAIN=local、必要原生验证；每轮删除准确自有cache/tmp/binary，保留源码pin、日志和退出码。

## B. D 同期负责的修改和输入，不能转嫁给 B

| D责任 | 代码/入口 | 当前状态与必须完成的交付 |
| --- | --- | --- |
| 创建事务 | systembackupapi/sql_writer.go、submission.go、task_requests.go | 具体writer/同事务task/config/schedule/audit/最后复查已实现；D已交具体Requests decoder/JCS子集、closed schema/OpenAPI，并实际在server构造，21根/86pass及server构建0。真实Admission仍缺；非null新任务retry/catalog_import明确not_ready，不要求B采用另一套Hash。 |
| 公共领取历史/初次启动 | controller/sql_task_claim_store.go、sql_backup_start_store.go；SQLDeadlineStore.Acquire | stage共享CAS/receipt不commit，Start在同RR事务加入pending→preparing、两个phase unit及两核心event；最后逐ID复查3event、原spec/config/claim与两个unit；唯一commit未知不返身份。StartNext读取真实next_reconcile_at并先关cursor再开tx。仍非B现场执行/完整WorkStore，observer同名receipt协议不变。 |
| 编译ABI/调用边界 | systembackupdispatch/contract.go | Input/Authority/JobBinding/Plan/Ports/ModuleResult/Runner/Dispatcher已交付；这是Go adapter ABI，不能把Dispatcher单元测试称production接线完成。 |
| **实际生产caller** | controller/task_execution_loop.go、sql_backup_start_store.go、cmd/system-backup-controller/task_execution_live.go、main.go | 已注册独立loop，实际构造/调用B runner；Prepare须先Record后才后续Capture，LeaderLoopGroup禁止清理未join的新代。A的systembackupplancustody.Save/Load文件组件已交，D仍缺其原SQL intent/record/CAS调用、完整ExecutionWorkStore、ProfileID/revision映射、claim续租映射和结果/恢复推进。缺完整ports不运行，缺口归D，不再把B ctor列为缺交付。 |
| 初次启动业务/容量准入 | sql_backup_start_store.go 的BackupStartAdmission/BackupStartGuard | D负责原可信readiness/物理capacity报告和原策略的真实实现。该guard检查整个初次write-set：2 attempt unit+3 event，含原claim receipt；与A purpose/resource guard分开且在同tx最终复查。当前缺生产owner即不开tx，不让B填static allow。 |
| 初次启动数据库权限 | controller/database_grants.go原矩阵、sql_backup_start_store.go/execution_ports.go | 原矩阵未扩大。初次start精确新增需求为events SELECT、attempts INSERT、Job observations SELECT、staging resources SELECT；由D/A审查执行profile，并做真实正/反grant测试后再注册。安装/gate/task排他锁保留；config/attempt/event核验改FOR SHARE，不能为核验给历史/追加账本增加UPDATE/DELETE。现场MySQL版本须核对（8.0.22起共享读锁只需SELECT）。此缺口不要求B提供控制库或权限旁路。 |
| **Ports生产实现** | controller/execution_ports.go及受审canonical migration/ledger adapter | 已有SQLExecutionAuthority.Check/Bind/Recheck，按公共gate先锁，核对task/config snapshot/current attempt/claim/held fence/期限并最终SQLclock。它仅为Check，绝非完整Ports；A后台ExecutionAuthorization仍缺。Job创建前intent、worker grant/plan持久化、pause/ACK/resume账本及Ensure/Observe/Stop组合仍归D，未到齐不执行。 |
| B构造/注册 | task_execution_live.go 的taskExecutionDependencies/taskExecutionOwners/systemBackupExecutionOwnerLink/composeTaskExecution | D已实际调用NewLinuxProfile→NewPublicRunner→BindTaskRunner，使用准确Profiles列表/B Dependencies/Ports/Store；B ctor已经交付，不再列作缺项。当前link明确未绑定，不能以nil/no-op替代A/C/Store真实输入。 |
| 后台授权及续租 | execution_ports.go 的ExecutionAuthorization/ExecutionAuthorizationGuard；A交接system-backup-a-execution-authorization-20261028.md | A确认create HTTP scope、evidence runtime scope及C1 content call都不能直接充作后台forward grant。D/A须补真实controller身份/version与全部resource/purpose/provider/ref/撤销期限来源及锁内读法。续租后的token/Job原identity映射由D负责，不要求B猜也不放宽原版本检查。 |
| HTTP详情/manifest | server/system_backup_tasks_live.go、system_backup_read_live.go；api/sql_details.go；read/backup_preflight_detail.go | 完整原scope/snapshot/recheck组合已实现；Requests现由server具体构造，owner struct只剩Admission/CurrentFacts/Manifest。后两真实owner尚缺，systemBackupTaskOwnerLink仍未绑定；D负责装配，不让B猜main注入方法。 |
| relay消息/安全 | D待实现公共HTTP与cursor事务；A的evidence/relay_peer.go、relay_dispatch.go、relay_message.go | B候选wire/handler/顺序/重放已交付；A提供原request proof及BindDispatchMessage/RecheckDispatchMessage（完整typed消息冻结及13身份投影，非新grant）。D须从原Job intent/ledger恢复namespace/name/result，验证公共claim/fence、同事务cursorCAS/原结果引用及最后guard/SQLclock。原observation表没有这些全部来源，不能用消息自报填。 |
| gate与Skill | controller原公共gate/mutationlease；middleware/main分类由D；当前Skillworker最小集成 | D负责公共gate实现与注册、实际writer完整性、middleware例外且保留Auth；B接真实writer停写/恢复。nil/no-op不授capture资格。 |
| 当前catalog门禁 | controller/bootstrap.go、migrationcatalog | 本轮发现当前136份migration与旧96固定pin不一致；D/A机械复核准确字节并评估旧已应用迁移漂移，不直接改绿。该旧失败不是B新claim测试失败，也不能过滤后宣称整包通过。 |
| 缺公共合同/表 | contracts/v12及D migration | D牵头Requests，现已独立分工实现concrete decoder；B restore_target/status_relay/checkpoint候选已交付，尚待正式联审；C仍首责recovery_catalog_records/catalog_scan_record和三catalog表领域规则；D落migration。Policy/cross-review/schema-hash门禁不绕过。 |
| 真实输入/环境 | docs/evidence/d-first-chain-field-20261028.log、d-first-chain-sql-pins-20261028.log | 现DB clawmanager/serverUUID f1f5f76a-95f5-11f1-b08e-366835b4a029；基础六表有，installation_state无行；应用仍fix18。D/A补真实bootstrap/材料/安装/config，D准备独立只读observer账号/pins与新部署。root元数据预检不冒充独立observer。 |

执行顺序：B现在合入 A1 的 D Spec 适配、保留已完成 runner/relay/result/recovery 实现，交付 A2/A4 实际 writer/builder 覆盖及 A7 路由隔离证据；D并行补完整WorkStore、Ports、原 profile mapping 和受控注册。A3 身份传输、A5 状态收敛、A6 发布和现场整链按对应 A/D/C 真实输入联调。缺公共定义先由 D 或原 owner 作出决定，B 不猜字段、不替其他 owner 承担实现。

当前最终组合验证：`d-first-chain-native-3ef397196d1543c396f1e3fd96b349d7.json`，B四包 86根/251 pass、D controller 36/94、dispatch 6/17、main 4/4，共 **132根/366 pass，零 fail/skip**；Windows controller 构建 exit=0，源码前后及当时当前pins一致，自有目录已清理。此前ed8的131/365是清单隔离修正前历史记录。

相同D/B源码另经 `d-first-chain-native-f4f7900f8962443aa2cdb23f0103eac8.json` Linux/amd64交叉构建（未运行），准确产品和缓存已清理。并行窗口对API/schema/observer的修改及plan-custody新增导致该轮全目录source_current_match=false，不能据此宣称整个当前checkout都被Linux验收；D/B精确源码比较另见 `d-b-public-runtime-wiring-20261028.json`，两份native snapshot与当前D/B所有受审源码一致。main 用例实际经过上述生产构造函数并到达真实B Admission；纯测试依赖不作为生产输入。真实MySQL/K8s/Agent/C产物及完整公共整链仍未验收。

**后续并行增量限定**：上述匹配结论是在execution-records窗口改main之前采样。该窗口随后新增SQLExecutionRecords/DurableExecutionStore/ExecutionJobPorts与082候选迁移并修改main；机器回执已追加后续变化标志。其新构造、immutable记录锁权限及最终测试/清理必须单独签收，不能引用旧回执宣告当前完整包通过。主D收尾要求见 `system-backup-d-execution-records-primary-review-20261028.md`。

C/Teams另一个持续分支现固定 `288d74a92c37c6432ebb3dcdd6fd7c2afd837675`，其Team-data/gate可作领域输入，但采用system_backup_v2_*兼容表和独立显式engine selector；D不会把它默认混入当前unversioned链。具体接收边界见 `system-backup-d-c-teams-integration-20261028.md`。B不负责替该分支重写公共artifact/catalog基础设施。

完成这份指令仅表示任务已具体化。当前不能把文档、ABI、模型、PR分支测试、DBA只读预检或部分详情当作首条公共真实链通过。
