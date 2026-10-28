# B 公共 runner：实现、构造与联调缺口

## 准确来源与当前结论

实现基于功能分支 `1e678b097ff8d7fd3c975183515d9e09af92f138`，其中已整合 `backup@d3c5715a05a80c1134edd3ad0132a6c292ee1672`。本轮再次只读核对远端仍是该 backup commit，使用其原 `systembackupdispatch` 类型，没有复制另一份 ABI。

已实现可调用的 B `Prepare/Capture/Recover`、具体只读 Linux profile、公共 Ports journal、实际 workspace/database Job 构造与调用、结果转换、relay 解析/重放规则/HTTP handler、隔离恢复目标描述校验。生产构造入口是 `backend/internal/systembackup/publicadapter/composition.go:NewLinuxDispatcher` 和 `runner.go:NewPublicRunner`。

**这不是首条公共真实链通过。** D 的生产 loop/Ports/plan 与 grant 持久化、A 原授权材料及 C 成品接纳尚未装配；用户确认暂无真实测试环境。本轮没有真实 MySQL/K8s/Agent/存储操作，没有安装依赖，没有改公共控制表、任务状态、claim 或既有安全入口。

## 实际调用路径

```text
D 选择 task → 公共 claim 回执事务 → 公共 attempt
  → NewLinuxDispatcher / NewPublicRunner
  → 原 Dispatcher.Prepare → B 只读发现 → 返回 Plan
  → D 加密持久化同一 Plan 原 bytes/SHA（提交不明先读回，不能重建覆盖）
  → D DescribePlan 读取原 invocation/ConfigMap/Job 描述，装配公共 Ports
  → Dispatcher.Capture → B flow.Capture
      所有 collector 只读 Prepare → 原 writer Observe/持久 intent/Pause/ACK
      → 全部 CheckPaused/当前 registry/source/fence → EnsureJob → Job + 认证结果联合核对
      → 所有 StopJob 撤权并证明停止 → 原状态 Resume/公共 Resumed
  → B 返回公共 ModuleResult → D 最终事务 → C finalizer/catalog
```

D 应在待新增的 `cmd/system-backup-controller/task_execution_live.go` 以真实依赖调用如下生产 helper；helper 已编译并经过调用测试，不是缺省 mock：

```go
dispatcher, err := publicadapter.NewLinuxDispatcher(
    admittedProfileKey,
    sourceProfileConfig, // 已有 SELECT-only SQL handle、支持矩阵、真实 writer/Job builders
    publicadapter.Dependencies{
        Results: verifiedResultReader,
        Recovery: originalRecoveryInventory,
        Admission: admitCurrentScope,
        ValidateInventory: verifyExactWriterAndPartRegistries,
        RecoveryTimeout: recoveryBudget,
    },
    publicExecutionPorts,
)
```

任一必需 owner 输入为 nil/typed nil、未匹配的 profile revision 或非法预算均返回 `not_ready`。构造不打开 DSN、不读取 Secret、不建 Job、不签发密钥、不启动控制器。多 profile 通过明确 `ProfileKey → Profile` map 调用 `NewPublicRunner`，不存在按当前版本自动替换 revision 的 fallback。

`LinuxProfileConfig.BuildParts` 可调用 B 的 `BuildCapturePart(input,hold,CapturePartRequest)`，复用实际 `kube.Job/DatabaseJob` 和现有 credential-free invocation 格式；返回冻结的原 `JobPart`。输入为已准入的 source/staging 挂载、immutable image digest、ServiceAccount、A worker control URL/identity Secret 引用、D unit/generation 和原 invocation。拒绝任意 command、restore、跨 task owner、错 attempt/part、未钉 digest 或超出原期限的 worker。数据库 Job 不挂源 workspace。此函数不创建任何资源，D 仍负责原 intent/journal/grant。

审查中修正了一个时序风险：`EnsureJob` 可能立即执行，shared ABI 没有 suspended/release 操作，因此 collector.Prepare 只读检查，全部 writer ACK 和当前 CheckPaused 之后，才在 collector.Capture 中调用 EnsureJob。不能在停写前创建活跃源读取 Job。D 的 EnsureJob 同样须复查当前完整公共屏障与权限，不能仅检查 B 已调用 Pause。

`LinuxProfileConfig.BuildWriters(ctx,input,source,frozenWriters)` 在 Prepare 接收 nil frozenWriters，仅可构造并只读观察真实组件；Bind 接收原 checkpoint/UID/generation/running 值，不重新发现或分配身份。D 可复用 `services.BackupGatewayWriter`、`quiesce.PodWriter/DeploymentWriter` 和原 Agent/CRI/NFS Proof client，必须提供公共事务的 Guard/LoadRestart/ClaimRestart/CompleteRestart 等回调，不能猜 `runtime_generation+1`。

`BuildParts(input,source,holdUntil)` 接收原冻结绝对 hold 上界，只能组装 specs。Plan 包含完整 credential-free `worker.Invocation` 原 JSON、hash、immutable ConfigMap 名及 JobIntent。D 调 `DescribePlan(input,persistedPlan)` 取得脱离原内存的副本，用于原公共 intent/worker grant 装配；不能重新计算 invocation 或从当前配置替换旧 bytes。

## B 已关闭的适配差异

| 范围 | 实际实现与安全边界 |
| --- | --- |
| 独立 SQLStore | 公共包不导入 control/host/profile/artifact/recovery。公共路径没有私有 Task、Vault 或控制 SQL；SQL 仅在 Linux source profile 中以 readonly RR 读取实际源身份与用户/实例清单。 |
| 复用源发现 | 从旧 profile 抽出 `domain.ReadSourceInstances`，旧 `Discover/Bind` lab wrapper 保留；不重写数据库/文件/SQLite/Wine collector。 |
| 冻结计划 | 绑定 installation/task/request/config version+hash/attempt/phase/profile revision/原绝对 deadline。SHA 校验、严格字段/重复键/UTF-8/尺寸/完整 round-trip 检查。claim row version 与 maintenance fence 可以由合法新 owner 更新，语义绑定不漂移。 |
| generation | `LocalFlowGeneration=1` 仅为版本化本地 flow discriminator；每次权限判断都向 Ports 传完整 Authority，不把它当 claim、Job generation 或 maintenance fence。 |
| 停写 journal | Check、CheckRecovery、PauseIntent、Paused、Resumed 原值转发，保留 UID/generation/running/checkpoint/stopped；所有 source writer/part 的 exact coverage 必须由 `ValidateInventory` 联核真实 registry/外部 fencing，非空列表或 nil gate 都不构成资格。 |
| 实际 barrier | 复用原 `flow.Capture`，保留 prepare-all、intent-before-pause、ACK/CheckPaused、seal-all、stop/revoke-all-before-resume 的顺序。取消不能取消必要补偿；Stop 不明时不 Resume。 |
| Job | 只通过 D Ensure/Observe/Stop 调用。模板、invocation、part index、ConfigMap、task/attempt、UID/generation、relay ref/version/期限逐项绑定。创建不明没有真实 UID 时返回失败并等待 D intent 恢复，不把 404 或未返回 binding 当停止证明。 |
| 结果 | Kubernetes Complete 与 A 认证结果必须同时成立。`BuildPartResult` 显式将原 worker.Result/receipt 与 C immutable seal 转成公共 PartResult/checkpoint；SHA 不符、错作用域和 restore 结果冒充 capture 均拒绝。 |
| 原 bytes | Results reader 返回外层登记证据的原 bytes，B 核对精确 SHA 并保持其字段；不追加自引用 evidence ID、不沿用修改后 DTO 的旧签名。外层 report ref 保存在 D Job observation。 |
| 取消/失 fence | 停止新工作，错误不返回 completed parts；补偿每次由当前 recovery scope 检查。actor cancel 与 leader loss 的最终分类归 D，B 保留 context cancellation，不自创用户取消事实。 |
| sealed 接管 | 有已有 Job 集合时只接受完整、已认证的 sealed 集合，复用证据并从原 ledger 恢复源，不再次 Ensure、SQL source discovery 或 Pause。过期旧 relay 身份不能用来执行新工作；历史 sealed 读取/停止使用新 D recovery/read authority。未完成集合等待 D reconcile，不盲重发。 |
| preflight | 实际只读 `source_inventory` 分项重新核对同一 inventory，无 gate token、Job、暂停、目标写操作。不是完整目标恢复规划或六域预检成功。 |
| restore_target | 提交 observed isolated-drill descriptor 与 CheckRestoreTarget；要求当前 A/D proof，原 admin 替换策略和恢复后停止/任务禁用。仅结构检查不授予恢复权；公共 restore/normalize/verify 分发尚未启用。 |
| relay | 关闭消息字段/状态，正整数 decimal 字符串，精确原 body hash；最新同序同 body 幂等，其余旧序/乱序/同序异 body 拒绝。首次必须 ready；running 不退回 ready；terminal 仅可原序原 body replay，不接受新序覆盖。真实 mTLS 基础检查、唯一 SPIFFE、JSON media/重复键/大小检查后交唯一 D Acceptor。无注册 URL、无 B SQL cursor 写入。 |
| 产物 | 不调用 private functional bundle、native signer/finalizer 或本地 key map。B checkpoint 不是 C manifest、A capture certificate，也不是 acceptance_ready。 |

## hash 与签名输入的准确含义

- `Plan.SHA256`：版本化 B 执行计划原 bytes，D 加密保存并按同一 bytes 接管。
- config hash：D 创建时存储的完整 canonical config snapshot 原 bytes，不查询当前版本替代。
- `InvocationSHA256`：冻结的现有 worker invocation 原 bytes，包含 task/attempt/part、绝对 deadline、AAD/envelope 引用与 runtime policy；它不是 sealed checkpoint。
- JobIntent SpecSHA256：冻结 Job spec 原 JSON。`kube.Runner` 的 canonical request annotation hash 是另一种 framing，D journal 必须分别保存/核对，不可相互冒充。
- checkpoint inventory hash：只读源清单身份/规格投影，不等于捕获内容 hash。
- checkpoint content hash：C 封存的原加密 part bytes 与 worker receipt SHA 必须相等；C 若重封装/重加密必须交付新证明和转换，不能套旧 digest。
- relay hash：原 HTTP body 精确 UTF-8 bytes；重试必须保留同 bytes/sequence，不能重新打时间或序列。
- Results evidence SHA：外层登记报告原 bytes。D/A/C 的授权、namespace/name/unit、身份/版本/撤销和签名仍须绑定完整 Authority + JobBinding + 原报告引用，不能仅凭这些 hash 授权。

## 必需 owner 输入及仍未关闭的调用

| owner | 准确接口/字段 | 还需要交付的内容 |
| --- | --- | --- |
| D | `task_execution_loop.go` / `task_execution_live.go`；原 AcquireWithReceipt | candidate→claim/续约/释放→attempt→B Dispatcher→最终事务的实际 main caller；公共 claim 回执与 CAS 同事务，未知 commit 先读原历史。B 不另建表或推导领取次数。 |
| D | `dispatch.Ports` 全部方法 | 当前 SQL clock/claim/gate/registry 检查、创建前 Job/ConfigMap intent、真实 kube.Ensure/JobComplete/Cleanup、UID 观察及 CAS；B 已交付接口消费和原实际 kube runner，不猜公共 ledger 物理字段。 |
| D | `RecoveryInventory.Pending` | 原完整 pause intent（包括无 ACK）、完整 B Job 集合（包括已停止的 binding）及未知创建的明确错误。不能从当前 power state 重建、不能漏掉未完成 action。RecoverySnapshot 必须逐 part 覆盖：原 Job binding 或 Undispatched（从原创建 intent 证明从未派发，不能由 Job 不存在推导）；未知 create 必须先由 D 收敛。这样支持暂停后尚未派发、或只派发部分 Job 的崩溃恢复。跨域仍由 D 检查整个共享 barrier。 |
| D/A | `Admission`、`ValidateInventory` | 原 profile ID/revision 映射、parts registry、source_writers 完整身份/策略/差集；冻结 HoldUntil 不超过公共原 hold/deadline，当前源/挂载/外部 NFS writer proof。两个 callback 不能是默认 always-allow。 |
| D/A | 实际 BuildWriters 回调 | 原 restart reservation/ResumeGeneration/RestartRef、Guard/ClaimRestart/CompleteRestart 的公共事务及当前 Agent/Pod/endpoint/Proof 身份；准备阶段不得新分配 UID 或 restart generation。 |
| D/A | worker invocation ConfigMap 与 grant | 基于 DescribePlan 的原数据创建 immutable ConfigMap；真实 UID 后签发最小工作身份。A 原 SVID/trust/证书/撤销/期限和 KEK purpose 的 public worker authorization transport 尚未提供。不能把只传 SPIFFE 字符串的旧授权器或 functional_test 检查删掉后当 acceptance。 |
| D/A | `RelayAcceptor.AcceptRelay` | 在同一原 RR 事务内调用 A 原 peer 证明、DB clock、task/claim/fence/Job binding 检查、RelaySequence + RelayProgress、cursor CAS、result/check/evidence 持久化及最后权限复查；未知 commit 按原序/原 body 读回。B HTTP handler不替代这些事务。 |
| A/C/D | `BuildPartResult` 的 authenticated pipeline、`Results.Read` | A 先认证原 worker.Result，C 提供真实 immutable sealed ref/digest；D/A 注册 BuildPartResult 原报告 bytes。Reader 核对原签名/scope/完整 binding、当前读取权及引用的 evidence，不能用未认证 self-report 填写 public result。 |
| A/C/D | `b-candidates` 三份 schema | checkpoint、status_relay、observed restore_target 的共同审查、原安全绑定/签名向量及正式 contract/registry 整合；没有修改 frozen/draft 状态或绕过现有门禁。 |
| C | 现有公共 provider/finalizer/catalog | 接纳 B 现有加密 part stream/SQL payload 的准确格式与公开 manifest framing；最终 PUT/catalog append 的 authoritative unknown-result 只读收敛；B 不复制该基础设施。 |
| Teams / Skill | SQL/Redis checkpoint/TTL/完整 writer；对象/版本/workspace proof | B profile 当前只覆盖经明确准入的 users/instances 流；不能由这些分项完成推导完整六域或 acceptance 成功。动态 checkpoint、其他 worker 格式及非空 warning 策略尚需 owner 评审；当前严格拒绝。 |
| D/A + 操作者 | target original proof 与新隔离安装 | `RestoreTargetProof.VerifyRestoreTarget`：admin-only blank DB、source/target 不混淆、namespace/claim/PV UID、schema、当前权限/容量/外部 writer fence；正式目标规划 request/部署 mapping。暂无现场环境，不执行真实迁移。 |

现有 private `profile` 中剩余 SQLStore/plan/Vault/publication 逻辑继续留在显式 lab 路径。公共包没有通过这些路径绕行；不声称把旧 controller 全部换成公共库，也不以新 ABI 或 DTO 代替真实控制面接线。

## 验证范围与记录

新包测试运行时不提供独立 control DB。SQL driver fixture执行的是实际 readonly discovery 代码；Ports/Agent/物理 Job/immutable seal 为明确隔离模型。实际 loopback mTLS 使用 Go 原生 TLS 和内存合成 CA，不能作为 A 的真实 trust/revocation 或 SQL 事务证明。

覆盖 Prepare 无资源副作用、plan/config/attempt/profile/UID 漂移、当前 fence、部分暂停及 ACK/CheckPaused、JobComplete/认证结果双条件、hash/作用域错误、未知 create、Stop/Resume 失败、取消/timeout、原状态恢复、接管不重新读取源、缺失 owner inputs、readonly RR/孤儿用户/Windows 拒绝、source-only preflight、relay 重放/冲突/重复键及缺证书拒绝、恢复目标 proof 缺失/撤权/隔离拒绝。旧 domain/profile/flow 仅因共用发现组件和新适配组合而回归；不以旧 52117 测试替代本轮。

原生日志、退出码、源码 pin、依赖清单和清理状态在 `docs/evidence/b-public-runner-20261028/`。没有运行真实 HTTP→SQL observer→worker→公共成品/终态的整链。没有实际 MySQL、Runtime Agent、K8s Job/VolumeSnapshot、CSI/NFS/HostPath 验收。

最终隔离回归为 publicadapter/domain/profile/flow/systembackupdispatch/kube 六包，0 fail / 0 skip；同范围 go vet 和 Linux/amd64 库编译退出 0。Go 测试有 280 个 pass event（包含子测试）。`accepted-tests.jsonl` 与 `source-pin.json` 为本轮准确范围，测试后重核 0 source drift。合同普通 checker exit 0 的原报告仍为 draft，含 32 项 policy pending 和 68 项 cross-review pending 及正式 status_relay/restore_target 等缺口；B 候选 schema 不改变这些门禁。详见该目录 README，不能用较早开发日志或普通检查成功冒充 strict/现场成功。

专用 GOCACHE/GOTMPDIR 仍位于此前本聊天拥有的 `.codex-temp/b-public-integration-20261028`，此前清理遭自动审批 `blocked by policy` 拒绝；本轮不绕过该拒绝。未在仓库其它位置输出 binary，日志保留，缓存清理未计作完成。

最后补齐 relay 进度闭集后，仅针对改变的 publicadapter 再做隔离回归（88 pass event、0 fail / 0 skip）、vet 与 Linux 库编译，全部 exit 0。最终源码为 `source-pin.json` + `relay-progress-source-overlay.json`，再核 0 drift；其余五包复用未变化的有效六包记录。正式接纳仍需 A/D/C 对候选合同评审。
