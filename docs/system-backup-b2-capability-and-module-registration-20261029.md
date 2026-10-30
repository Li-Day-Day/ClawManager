# B2 能力盘点与用户、实例模块注册交接

基线：`af7c3ad599195eb1a577c3e0389c55a9643d375b`，本轮是该版本之上的未提交增量。没有获取新远端基线、安装依赖、提交、推送、访问生产服务器或执行真实迁移。

## 1. B2 服务端能力盘点的实际范围

已盘点当前仓库的调用端、协议类型、控制回调、测试与部署引用。仓库没有 Runtime Agent 服务端源码；`deployments/opencode-lite-v2/build.ps1` 默认引用外部 `D:\AgentsRuntime\clawmanager-agent`，本机该目录不存在。这是源码定位线索，不是部署版本证明。`handlers/runtime_agent_handler.go` 是平台接收 Agent 注册/心跳的入口，不是 Agent 的 gateway 服务端。

| 能力/实际调用 | 现有代码及已知保障 | 尚不能证明什么 |
| --- | --- | --- |
| `GET /v1/gateways/{gw-instance-generation}` | `services/runtime_agent_client.go` / `BackupGatewayWriter.state` 核对 gateway ID、instance、generation 及状态枚举。 | GET 无 backup task/attempt/operation 身份；404 与 stopped 不能证明 detached 工具树退出。 |
| `DELETE /v1/gateways/{id}` | `BackupGatewayWriter` 只删除原 generation，恢复到 D 预留的新 generation；每个边界经过原 Guard。 | 服务端对迟到 DELETE 的完整语义、取消后的副作用、旧 Pod/Agent epoch 的拒绝行为未验证。没有为此新增假接口。 |
| `POST /v1/gateways` | 原创建请求有 instance/user/generation/UID/GID/端口/workspace/environment；原密文材料通过 D custody 加载。D ClaimRestart 唯一标记派发；发送结果不明只 GET 原预留代数，不盲目重发。 | 请求无 backup task/attempt/fence/operation 字段；没有通用 backup operation 查询接口。旧请求迟到、重启/撤权后的服务端拒绝与落盘幂等不能由客户端 Guard 证明。 |
| `GET /v1/stop-capabilities` | `services/runtime_agent_stop.go` 已有 Protocol=1、GracefulStop、PodUID、AgentEpoch、ConfirmationScope=process_group 校验；另有 ExpectedPIDGuard/AutomaticUpgrade 字段。 | 能力声明不是物理证明；没有完整 detached 子任务/进程树证明，也没有 source resume 能力签收。不能将 AutomaticUpgrade 当成 backup-safe。 |
| `POST /v1/gateway-stop` | 已有 instance/user/generation/gateway/operation/PodUID/AgentEpoch/ExpectedPID 请求；回执校验 instance/generation/gateway/operation/PodUID/epoch/PID/confirmed/time/process_group。404/501 等不能退回 DELETE。 | 回执没有 user/task/attempt/fence 字段；该接口现用于升级停止协调，**备份 gateway writer 尚未调用它**。升级自己的 stop 账本不能冒充公共备份任务历史。 |
| 公共 D 回调 | `SQLRuntimeControl` 已交 source 映射、加密 custody、Guard、重启预留、CAS 和恢复屏障。Pod/Deployment 分支接 `ConfirmStopped` / StopProof；gateway 分支走现有 GatewayState/代数检查。 | gateway 分支尚未接入上述 process_group 确认，更不能据此声称具备 detached 树停止证明。 |

旧 B 文档中 `backup_safe/backup_resume` 是待证能力语义，不能当成当前客户端已有的同名字段。真实代码中的字段和接点以上表为准。

本轮只完成 B2 盘点，没有修改外部 Agent、升级客户端协议或创建第二套控制表。当前零实例、workspace-only、functional_test 及完整 writer inventory 门禁保留。

## 2. 实际新增 B 模块构造

实现位置：`backend/internal/systembackup/publicadapter/users_instances_module.go`。

- `NewUsersInstancesModule(UsersInstancesModuleConfig)` 返回可直接交原 `NewCaptureModules` 的具体注册，不是仅有接口声明。
- `users_instances_database` / `mysql` / `capture-database`：复用 `worker.RunDatabase → domain.CaptureSource`，按原规则一次捕获用户、实例及其依赖。用户和实例不能拆成两次独立 SQL 捕获后假称同一事务快照。
- `instance_<id>_<mountID>` / `workspace` / `capture-workspace`：每实例必须包含 `MountID=workspace` 主挂载，另可显式列出文档/其他持久化挂载。运行、停止实例都捕获，构造不启动实例。
- 原输入被完整深拷贝，包含 nested policy、CA、Kubernetes 卷和控制引用。输入的用户全集、instance/owner/generation/status/workspace 与冻结 Source 精确一致；空实例仍可捕获用户。Windows、过渡状态、缺主挂载、重复/外来映射拒绝。
- 每个挂载必须有合法 release RuntimePolicy，与原实例 type/mode 一致。WorkBuddy 要求从认证 SQL 上下文获得的身份且 instance/user 匹配，不从 instance ID 推导 UID，也不从待备份 marker 反推预期身份。
- 模板已绑定原 task/attempt/path/capture context/deadline/EnvelopeID；只在整个模块目录排序确定后赋全局 PartIndex。D/A 必须针对最终 invocation/spec hash 授权，不提前授权占位 index 的模板。
- 输出经过原 `CaptureModules.BuildParts → BuildCapturePart`，复用数据库/workspace Job、Pod-bound worker 身份和按 task 的 staging。没有直接启动 Job 或签发凭据。

### D 的最小接收示例

```go
bModule, err := publicadapter.NewUsersInstancesModule(admittedBConfig)
if err != nil { return err }
registrations := append([]publicadapter.CaptureModuleRegistration{}, cRegistrations...)
registrations = append(registrations, bModule)
modules, err := publicadapter.NewCaptureModules(registrations, originalCaptureContextResolver)
if err != nil { return err }
captureConfig.Modules = modules
// 原 RuntimeControl、PlatformWriters、admission/inventory/gate 不变。
capture, err := systembackupexecution.NewPublicCapture(captureConfig)
```

`admittedBConfig` 是部署内的任务级构造输入，不能直接接用户 JSON。该例不解除现有 public profile 的零实例限制，也不证明公共 mysql capture 或非空实例已获生产准入。

| 字段 | 提供者与准确约束 |
| --- | --- |
| `Revision` | B/D 签收的模块版本，不使用镜像品牌代替版本审核。 |
| `Source` | 原 source discovery 的完整 Database/ServerUUID/Users/Instances；保持原排序/身份，不过滤失败或停止实例。 |
| `Database` | 原 D/A 任务绑定的 `CapturePartRequest`，固定 Part/Category 为 `users_instances_database` / `users_instances`；DatabaseSpec 是公开连接/TLS/限额配置，凭据只从原 worker grant 获得。 |
| `Workspaces[].InstanceID/MountID` | D 原全部已准入持久化挂载映射；MountID=workspace 必须存在；其余挂载不得遗漏。实际 PVC/subPath/node/UID/布局的证明仍由原 inventory validator 接收。 |
| `Workspaces[].Request` | Part=`instance_<id>_<mountID>`，Category=instances，实际只读 Source mount、StagingClaim、worker image/serviceAccount、控制引用、intent Generation 和受限 invocation。RuntimePolicy 使用真实审核版本。 |
| `WorkBuddyIdentity` | B 的认证 SQL/UID 快照持有者给出 Schema/instance/user/UID/GID；D 将其绑定到同一 capture context。当前简化 SourceInventory 不含 UID，调用者没有该原材料时明确不可注册，不猜测。 |
| context resolver | D 原不可变捕获点投影；当前 ABI 要求纯函数，不额外 SQL/网络 IO。capture context hash 不是物理 SQL/Redis/文件一致性的证明。 |

请求 mysql 选择联合数据库 part；请求 workspace 选择所有本模块已登记挂载。storage selector 覆盖不等于六域/所有 writer 覆盖，仍需原 D/A inventory 签收。新增注册只产出执行计划，**正式产物封存/发布、catalog 和目标恢复仍走公共 C/D**。

## 3. 本轮修复与失败路径

1. writer 组合在进入第二组和返回组合结果前复查 cancellation，取消时返回原分类，不继续调用可能进入 D 预留的 runtime builder。任一组失败/失去 fence 都不返回部分 writer，内部错误转换为公开分类。
2. 注册构造冻结嵌套输入，避免调用者修改用户列表、DatabaseSpec、RuntimePolicy 后改变原计划；回归初次发现该问题，修正后保留初次失败日志。
3. **新增 staging 输出重名保护**：同 namespace/PVC/task 子目录中，两个模块使用同 ArtifactName 会互相争用同一输出路径。绑定不同 PartIndex 不能使该路径安全；目录装配现在在派发前拒绝。测试分别覆盖同 B 模块及 B/C 跨模块碰撞；fixture 使用各 part 唯一文件名。
4. 覆盖旧 task/attempt、错误 capture point/deadline、owner/generation/workspace 漂移、未绑定 Pod、缺 mount/policy、WorkBuddy 外来身份、零实例及额外持久化挂载。失败统一不返回可派发的部分计划。

## 4. 剩余输入与接收动作

| Owner | 需要交付的具体输入/动作 |
| --- | --- |
| Runtime owner | Agent 服务端源码位置、对应 commit/镜像 digest；上述 endpoint 的实际 handler/持久化/进程停止实现；迟到 create/delete/stop、原 operation 查询、PodUID/epoch 更换、detached 工具退出和原处恢复的明确语义。没有源码不宣布服务端盘点通过。 |
| D + B + A | 签收现有 `gateway-stop` 与公共 task/attempt/writer/fence/原 operation 的绑定和事务持有位置、回执保存及重放规则；如何映射独立 recovery 身份及新旧 generation；不可复用升级账本伪造备份历史。随后 B 接 writer，D 接原账本/准入，A 审身份协议。 |
| D | `UsersInstancesModuleConfig` 的实际构造 caller、完整 mount/writer 清单、原 staging/Job 控制引用/intent generation；`GatewayOriginal`、StopProof/ParticipantChecks/DeploymentChecks、RuntimeControl grants；在证据齐备后签收非空 profile 扩展，当前门禁不改。 |
| A | 原 forward/recovery/worker/issuer/key/KEK/signer 的引用、版本/用途/历史读取/撤销；DEK 交付/撤销 lease 决策；对最终全局 index+invocation/spec hash 的授权；relay ResolvePeer 映射。 |
| C—Teams / Skills | 具体模块注册/Build、SQL/Redis/TTL、版本对象/未打包 workspace、writer 差集及同一捕获点事实；B 数据库 worker 不是这两域通用 SQL exporter。 |
| 公共 C / D | CurrentTaskFacts v1、ManifestReader 实现及正式 seal/finalizer/catalog 的接收构造；正式成品隔离还原接线。 |
| 构建/现场提供者 | 现成 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2` 缓存或已有获准构建环境；获准写入的隔离 MySQL/K8s/Agent/存储安装。 |

## 5. 验证与限制

本轮证据见 [隔离验证记录](evidence/b-concrete-modules-20261029/README.md)。测试只使用 SQL/HTTP/Job 等隔离模型。新增 B 构造进入真实 Job materializer 的本地回归；Agent 客户端测试只是模拟服务端，不能替代实际进程树/服务器验证。

上轮 `systembackupexecution` 因缺依赖而未编译的限制继续有效，本轮未重复尝试必然缺缓存的构建；本轮 B 包的编译通过不能外推为整个生产装配通过。没有执行真实 MySQL/K8s/Agent/快照、迁移、密钥发放或正式成品恢复。两个空临时目录按用户要求不处理。
