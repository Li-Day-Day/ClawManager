# B1 profile 装配与 B3 模块接入合同

**当前接收版本已更新为统一基线 af7c3ad5。** 下文是上一轮 4fe83bcd 候选合同的来源/字段记录；其中旧 controller caller、D 基线未公布和 Runtime SQL/relay 未交付的描述已经过时。最新实际入口、D 已交付实现、剩余输入及受阻验证以 [统一基线适配记录](system-backup-b-unified-adaptation-20261029.md) 为准。B3 typed 数据字段仍沿用，Pod-bound 身份要求已补入，不是正式 owner 审批。

本轮只在本地开发、隔离回归，**未提交、未推送、未安装依赖、未执行真实迁移或现场部署**。本文件是 B 的候选接入交付，不是 D/A/C 的合同签收，也不是公共 acceptance 或非空 Runtime 现场验收。

## 1. 来源、接收人和当前边界

- `git fetch origin backup` 核对 D 目前公开集成基线仍为 `4fe83bcde5a8a693dddb2635e9a3e397d6e3472e`，本地 HEAD 相同。负责人要求的 D 第①项（统一 C 后的新基线）尚未公开，不能假定已完成。
- 另只读 fetch 了 C `codex/backup-team-integration@50b27d7763d545a7905862fa1a1e544a5e14235e`，确认 `5874d7d7` 是其祖先。未 merge、checkout、执行该分支脚本或迁移。
- C 新代码已有独立 forward/recovery、安全身份、实际平台 writer 和零实例 workspace 链，不再把这些能力列为“没有源码”。其 `systembackupexecution/deployment_platform.go:DeploymentService.platformProfile` 仍拒绝非空实例，并有当前 backup 尚无的 `LinuxProfileConfig.RecoveryOnly`、`WorkerControl.BoundPodIdentity`、平台 Deployment 停止证明等增量；表映射、唯一 controller/SQL/gate 仍由 D 统一。
- **接收人 D**：消费本轮 `NewRuntimeLinuxProfileConfig` 返回值，作为既有 `taskExecutionLinuxProfile.Source`；保留 `composeTaskExecution → NewLinuxProfile → NewPublicRunner → BindTaskRunner → TaskExecutionLoop`。本轮没有给 `systemBackupExecutionOwnerLink` 填假的实现。
- **接收人 C—Teams、C—Skills**：按 `CaptureModuleRegistration` 交付真实模块构造及完整输入，不替代 D 的控制面。公共 C 接原 `SealedPart/BuildPartResult` 后的正式成品出口。本轮不导入独立 controller、旧 SQLStore/publisher 或私有控制表。
- 自身交付 SHA：尚无，本轮按用户要求保留未提交源码。准确改动 hash、基线和实际验证见 [本轮记录](evidence/b-runtime-modules-20261029/README.md)。D 发布新统一 SHA 后必须再次逐项移植和回归，不能把本轮测试改标成新基线结果。

## 2. B1：实际运行的构造接点

新增 `backend/internal/systembackup/publicadapter/runtime_profile.go`：

```go
func NewRuntimeLinuxProfileConfig(
    source LinuxProfileConfig,
    resolve RuntimeMappingResolver,
    runtime RuntimeWriterDependencies,
    modules *CaptureModules,
) (LinuxProfileConfig, error)
```

该构造实际填充原 `BuildWriters` / `BuildParts`，调用现有 `NewRuntimeWriterBuilder` 和 `BuildCapturePart`，不是仅转换 DTO。构造与 Bind 不做 SQL、Agent、K8s 或资源副作用。原 `Source` SELECT-only 发现、supported map、hold limit、公共 Admission/ValidateInventory 和 Ports 权威仍全部保留，没有增加默认支持类型或跳过门禁。

### D 的任务映射输入

`RuntimeMappingResolver(ctx, Input, SourceInventory, []FrozenWriter) → RuntimeWriterMapping` 返回：

- `Specs []RuntimeWriterSpec`：必须精确覆盖发现的全部实例；source owner/runtime/generation/namespace/Pod/workspace 完全相等。running/stopped、原 UID、原加密 restart ref 和已预留的 resume generation 来自 D 的原账本，不能由 B 猜 generation+1。
- `Participants []ParticipantSpec`：平台/后台/外部 gate 的原 ID、UID、generation、checkpoint。它们是关门/排空证明，不等于物理停止平台 Deployment。
- `Platform []flow.Writer`：保留 D/C 原有的具体平台 writer 句柄及 StopWitness/PrepareStop/ConfirmStopped/ConfirmResumed 逻辑。接口沿用现有 flow.Writer，不造第二套平台停写流程。句柄构造不能 IO；真正的 Observe/Pause/CheckPaused/Resume 仍由原 flow 在持久 intent、当前权限和屏障下调用。

Discover 时 frozen 为 nil；Bind/恢复时必须按原冻结清单，只读加载原映射/预留/材料引用，禁止当前 SQL/Runtime 重新发现来替换历史状态。B 校验合并后的 runtime、gate participant、platform ID 唯一且与原冻结集合完全覆盖。即使 Platform 非空，任何实例也不能漏出 Specs；原本停止的实例走原 stopped proof，不启动 Agent。

`runtime.Participants` 必须为空，其任务级值由 resolver 提供；`runtime.Ports`、实际 Agent/Kubernetes、`WriterCallbacks` 与 polling 由 D/A 提供。本轮不实现 Guard、恢复 SQL、权限发放、原配置解密、重启 claim/CAS 或最终绑定事务。

### 最小实际接入

```go
// registrations/builders 是本节下方合同的真实 C/B 输入；resolveCapturePoint
// 读取 D 已准备并准入的不可变投影，不能在 BuildParts 内访问 SQL/网络。
modules, err := b.NewCaptureModules(registrations, resolveCapturePoint)
if err != nil { return err }
source, err := b.NewRuntimeLinuxProfileConfig(
    sourceOnlyConfig, resolveOriginalRuntimeMapping, runtimeDependencies, modules,
)
if err != nil { return err }
// 在 D 的既有 owner 装配中交付 taskExecutionLinuxProfile{Key: key, Source: source}。
// 既有 composeTaskExecution 构造并绑定公共 task-plan，后续使用原 Ports。
```

`sourceOnlyConfig` 应是 D 原 Source DB/数据库 UUID/supported/hold 字段，不预填 builder hooks。**不要把 C 现成 platformProfile 的 hooks 清空后丢弃其物理 writer**；D 统一时须先保留/分离其实际平台句柄和原恢复证明，再交 resolver.Platform，最终由同一个 flow 完成全部屏障。公共注册完成前不能删 C 的零实例保护，也不能扩大 readiness。

preflight 仍只返回原 `source_inventory` part，不调用 runtime mapping、capture context、模块 builder 或 Job 派发。本构造不会授予 forward/recovery 权限；C 新 RecoveryOnly/BoundPodIdentity 等 ABI 必须在 D 的新集成基线完整保留，不能为使用本构造补假 Source DB/身份。

## 3. B3：候选模块合同与真实 materializer

新增 `publicadapter/modules.go`，版本 `system-backup-b-module-intake.v1alpha1`。它是进程内 Go 合同，不注册新的公共 HTTP/任务协议，也不把正式 v12 missing/draft 改成 frozen。

| 输入 | 谁提供 | 准确含义 |
| --- | --- | --- |
| CaptureModuleDescriptor.ID/Owner/Revision | B 或对应 C，D 联审 | 唯一模块、A/B/C/D 责任接收方、实现 revision；这是声明，不是 owner 已签名批准。 |
| Parts[].Part / Category | 模块 owner | 原 JobPart/module result 的逻辑身份；全局唯一 part，不从实例/文件名偷偷推导完整覆盖。 |
| Parts[].RequestedPart | 模块 owner + D | 原 BackupSpec 的 storage selector：mysql/redis/object_storage/workspace/deployment_resources/secret_bundle；**不是六业务域分类**。 |
| Parts[].Operation | 模块 owner | 实际 worker 已支持的操作；未知操作明确 not_ready，不能换个名字假称已采集。 |
| Build(CaptureModuleInput) | 模块 owner | 返回精确的 []CapturePartRequest：Part、Category、D 原 JobUnitKey/Generation、kube.JobRequest、worker.Invocation；纯构造，无读取/写入/身份签发/Job 创建。 |
| CaptureModuleInput.Input/Source | B 从原调用投影 | 防御性复制的公共 Input（含原 BackupSpec）、SELECT-only 原 inventory；每个模块独立副本。 |
| CaptureModuleInput.Parts | B | 本轮被请求的精确 part 子集及稳定 PartIndex，不准遗漏、额外返回、重复或重编号。 |
| CaptureModuleInput.Context | D/A/C 原捕获点投影 | 见下节，所有模块与所有 invocation 必须一致；不提供默认值。 |

`NewCaptureModules(registrations, resolver)` 冻结并稳定排序目录，`Describe/CatalogSHA256` 返回 defensive snapshot/摘要。`BuildParts` 检查原 BackupSpec，选择被请求的 storage parts，真实调用各模块 Build，再调用原 `BuildCapturePart` 生成 invocation/ConfigMap/Job 原 bytes。任一请求 storage part 缺实现，整个构造失败，不返回部分成功；原 ValidateInventory 仍须证明完整业务/实例/writer 覆盖。

模块必须返回有效的原 worker.Invocation 和 JobRequest，不能任意 shell command、漂移 task/attempt/路径/part index、伪造 generation 或共享一个 Job/ConfigMap。数据库 payload 的 Name/ServerUUID 必须等于已发现的原数据库。输入镜像与 worker 身份仍按原 Job/A/D 规则，不复用安装冒烟的 MinIO 标签规则。

### 共享捕获上下文

D 提供纯函数 `CaptureContextResolver(Input, SourceInventory, holdUntil, catalogSHA) → ModuleCaptureContext`，字段包括 installation/task/config version+SHA/attempt/phase/profile id+revision、inventory SHA、模块目录 SHA、原 capture context SHA、精确 holdUntil。B 检查这些绑定，并要求每个 invocation 的原 staging.Binding.CaptureContextHash 相同，PartIndex 全局唯一。

**inventory SHA 不是物理一致性 checkpoint；目录 SHA 不是授权；一个合法的 hash 也不证明 SQL/Redis/文件快照已形成。** 原 capture context hash 由 D/A/C 的已准入一致性合同提供，B 不生成、签名、用 inventory hash 替代或伪造一个默认值。真实 SQL snapshot/Redis offset+TTL/对象版本/workspace 证据及复查仍由对应 owner 给出。

当前共享 BuildParts ABI 无 context.Context，所以 resolver/Build 必须纯构造、无阻塞 IO。需要 SQL/网络的材料由 D 在本调用前按原权限/时钟准备并固定；如新集成 ABI 需要 context，交 D 升级共享入口，B 不用隐式 goroutine 绕过取消/权限。

### 当前实际可 materialize 的操作

| 操作 | 当前限制 | 后续接收 |
| --- | --- | --- |
| capture-workspace | 原 sandboxed workspace worker，RequestedPart=workspace；文件/目录/RuntimePolicy/WorkBuddyIdentity/卷身份由真实 owner 输入和 A/D 原准入保护。 | C 的 workspace 子模块可交 adapter，仍需同版本字段/路径/证据和真实覆盖联审。 |
| capture-database | 原 B 用户/实例闭集 exporter，RequestedPart=mysql、模块 owner=B，源 DB/UUID 必须一致。 | 继续复用已有用户/实例实现；不能将它冒充 Teams/Skills 通用 SQL exporter。 |
| Teams/Skills SQL、Redis、对象及其它操作 | 当前公开基线没有相应共享 worker payload/operation；本目录准确拒绝。 | 原 owner 提供实际实现和版本化 payload，D 发布同版本 ABI 后接入，禁止仅放开操作字符串/改状态/复制控制器来通过。 |

worker result 继续经 A 认证、C immutable seal，再调用原 `BuildPartResult`，并交原 Results.Read/公共 relay/Job observation。模块目录不返回新的成功/成品证书，不直接发布或推进终态。

## 4. 缺少输入，精确到接点

| 提供者 | 需要提供什么 | 接收后下一步 |
| --- | --- | --- |
| D | 新统一集成 SHA、控制表/迁移/唯一 controller/共享 gate/API 映射，完整接收 C 的实际链。 | B 将本轮四份新增源码移植到该 SHA，复核 ABI，禁止称当前 4fe 测试覆盖新组合。 |
| D | RuntimeMappingResolver：原 task/profile→所有实例 runtime/Pod/UID/namespace/workspace/owner/generation；原 encrypted restart ref/resume reservation；所有 Participants 及 Platform writer/停止证据。 | 直接传入 NewRuntimeLinuxProfileConfig；每一 frozen ID/原状态必须能从同一原账本恢复。 |
| D/A | RuntimeWriterDependencies.Ports、Guard、LoadGateway/LoadPod、ClaimRestart/CompleteRestart、ConfirmStopped/ConfirmResumed；当前 DB clock/fence、未知发送读回、历史恢复授权。 | 保留现有 B writer 实际调用，不新增 B 控制 SQL；缺项当前即拒绝。 |
| D/A/C | CaptureContextResolver 的原上下文及其 task/config/profile/catalog/inventory/hold 投影，完整 source_writers/parts 验证。 | 同一捕获点进入所有原 invocation；不能仅提交一个 B 随机构造的 hash。 |
| A | task key/KEK purpose+version、历史读取/撤销、原最小 worker grant、forward/recovery 和 Pod-bound 身份的真实实现/受控引用。 | B 只接 refs/已有构造，不用测试 key、生产密码或改两个 capability 布尔值代替真实安全输入。 |
| C—Teams | 实际模块 descriptors/build、SQL/Redis/TTL/历史/关系/workspace 的 typed payload 与操作、writer 差集、schema 策略及一致性/停止证明。 | 与现有 workspace 子链对齐；额外数据操作进入同一 materializer 前须真实实现和版本联审。 |
| C—Skills | 八表、版本对象、未打包 workspace、异步 writer 的模块/路径/对象 ref/version/hash/未满足项。 | 同上；缺内容准确失败，不用 workspace 文件成功代表所有 Skill 内容成功。 |
| 公共 C / A / D | Results.Read、原认证报告、SealedPart、正式封存/finalizer/catalog 与权威终态。 | 复用 BuildPartResult；与模块目录区分，不能把它当正式产物出口。公共 C 负责人由 D 点名。 |
| Runtime owner + A/D | 晚到请求隔离、原处停止/恢复、detached 工具树退出、原实例/Pod/operation/generation 绑定的真实能力与接口。 | 属后续 B2；本轮没有实现服务端协议，不删除 backup_safe/backup_resume 或原停止证明门禁。 |

现场 context/namespace、独立源 SELECT-only 身份、恢复最小权限、Agent/Job/存储/密钥输入仍未提供；测试仅在本地隔离模型，不能宣布非空真实实例或公共整链已可运行。
