# B：接入 A relay 认证与具体 writer 构造

后续 schema 清单 CI 修复见 [补登与严格门禁记录](system-backup-schema-intake-20261028.md)：已排除测试 SQL 误计，按源码补 22 项责任路由草案并同步 draft 生成物/策略提交请求，普通本地检查与前端构建通过。下文最后一节为修复前 CI 的历史证据；54 项策略、跨域审批与现场证据仍未放行，新 head CI 结果另行核对。

## 来源与范围

本轮工作分支以 `08d15abf443511376bf1a0c9c9593caea8feef5c` 为父版本，整合实际最新 `backup@8ef5fa7fd4df45f6306e910705db01f589266ba7`。新增的 A `relay_peer.go/relay_dispatch.go` 及其测试原样保留；共享 `systembackupdispatch` ABI 没有复制或修改。准确源码 pin、命令、日志与退出码在 `docs/evidence/b-relay-writers-20261028/`。不沿用旧 `backup@d3c5715a` 宣布本轮集成成功。

本轮补齐两处 B 可调用生产构造：`NewAuthenticatedRelayHandler` 与 `NewRuntimeWriterBuilder`。没有新建任务、控制表、事务 owner、public controller、grant provider 或 API 路由。没有把 B 的候选 relay/checkpoint/target 合同改成已评审状态。**没有真实公共整链或实际迁移验收。**

## Relay：原 A 证明贯穿同一 D 事务

实际入口：`publicadapter/relay_auth.go:NewAuthenticatedRelayHandler(RelayAuthentication, AuthenticatedRelayAcceptor)`。

1. 私有 transport decoder 校验固定 JSON 字段、原 bytes/hash、序列、唯一 SPIFFE、媒体类型与大小。
2. `ResolvePeer(ctx,message)` 仅按不可信消息线索查原已准入映射；返回 owner 管理的原 `*systembackupevidence.RelayPeerAuthenticator`，不从消息签发身份，也不由 B 关闭共享 authenticator。
3. 原 `AuthenticateRequest(request)` 验证完整握手、TLS 1.3、真实 DER 证书、CA/certificate pin 与唯一 SPIFFE。A 从 DER 重新解析身份；可变解析字段、CN 和转发 header 不能替代原证书。
4. 从原 `proof.Context()` 派生有界事务 context，交 D 的 `AcceptAuthenticatedRelay(ctx,*AuthenticatedRelay)`。不得换成 Background、另开一个无证明 context，或把 detached facts 作为授权。
5. D 在其原事务中取得 locked scope/current Authority/Job/cursor 和原 DB UTC(6) clock，调用 `session.Bind(tx,scope,current,job,now,cursor)`。B 比对完整消息与原公共身份，再调用 A 原 `BindDispatch`；`RelaySequence/RelayProgress` 在这个同一边界计算。绑定一次即消耗该请求，失败不能换 tx 重试。
6. D 持久化原 observation cursor、已认证 result/check/evidence 后，调用 `session.Recheck`。B 复用原 `DispatchRelayCheck.RecheckDispatch`，核对同 tx、同 context、原 claim/fence/request/namespace/name/UID/generation/relay version 与原期限；时钟不能回退或延长。
7. **D 仍须在所有 callback 后执行最终 SQL 权限/撤销/时钟检查并确认 COMMIT。** B 的 Recheck 不是提交凭证。提交结果不明返回错误，D 按原 sequence/body/hash 与公共持久化规则只读收敛，不能独立补历史。B 不 Begin/Exec/Commit 公共 SQL。
8. D 返回后，B 只有在 Bind 和 Recheck 完整、决定一致、请求及期限仍有效时响应 advance/replay。漏 Bind/Recheck、失败后补成功、错决定或提交错误均不响应成功。

`AuthenticatedRelay.Message/Body` 返回隔离副本；opaque session 不能序列化/反序列化成权限。只有 `NewAuthenticatedRelayHandler` 是导出的 HTTP 构造入口，旧的裸 `NewRelayHandler/RelayAcceptor` 已收为私有 transport seam，没有不经过 A 原证明的生产构造旁路。原调用方检索未发现包外使用，D 尚无生产 relay caller。

最小构造（这些变量必须由原 owner 实际提供，没有 always-allow defaults）：

```go
handler, err := publicadapter.NewAuthenticatedRelayHandler(
    publicadapter.RelayAuthentication{
        ResolvePeer: admittedRelayPeerLookup,
        TransactionBudget: originalRelayTransactionBudget,
    },
    publicRelayTransactionOwner,
)
```

这里交付了实际 A 调用与 B handler，`publicRelayTransactionOwner` 的原 SQL 实现仍由 D 交付。`ResolvePeer` 自身也必须响应 context 取消并遵守部署方的请求预算。A 的 `Close` 是该映射实例的本地失效，不替代公共 registry 的禁用/轮换/撤销检查。

## Writer：可直接供 LinuxProfile 使用的构造器

实际入口：`publicadapter/writers.go:NewRuntimeWriterBuilder(specs,dependencies)`，返回 `LinuxProfileConfig.BuildWriters` 所需的准确函数类型。

```go
buildWriters, err := publicadapter.NewRuntimeWriterBuilder(
    admittedRuntimeWriterSpecs,
    publicadapter.RuntimeWriterDependencies{
        Ports: publicExecutionPorts,
        Client: originalKubernetesClient,
        Agent: originalRuntimeAgentClient,
        Participants: originalGateParticipantSpecs,
        Callbacks: publicWriterCallbacks,
    },
)
// 处理 err 后，将函数接入已准入的原 sourceProfileConfig。
sourceProfileConfig.BuildWriters = buildWriters
dispatcher, err := publicadapter.NewLinuxDispatcher(
    admittedProfileKey, sourceProfileConfig, executionDependencies,
    publicExecutionPorts,
)
```

`RuntimeWriterSpec.Source` 必须逐项等于冻结 SQL source projection，包括用户、实例、runtime type/mode/backend/variant/OS/status/generation、Pod namespace/name 和 workspace。每个源实例恰好一项，不可漏、重或追加外来实例；Users 必须覆盖实例归属。Bind 只使用原冻结源与 specs，不查询当前 runtime、不重新分配 UID/generation、不读当前电源状态改写原计划。冻结 writer ID 集合也必须精确匹配。

| kind | 复用的实际执行器 | 必需身份及回调 |
| --- | --- | --- |
| gateway | `services.BackupGatewayWriter` + 原 RuntimeAgent client | 原 Pod UID、endpoint、workspace、instance/user、runtime generation；D 已持久预留的 ResumeGeneration/RestartRef；UID/GID/port；Guard、LoadGateway、ClaimRestart、CompleteRestart。不猜 `generation+1`。 |
| pod | `quiesce.PodWriter` + 原 typed Kubernetes client | 原 namespace/name/UID、runtime generation、encrypted RestartRef；Guard、LoadPod、Claim/CompleteRestart、真实 ConfirmStopped/ConfirmResumed。 |
| deployment | `quiesce.DeploymentWriter` + 原 typed client | 原 Deployment namespace/name/UID；完整 reconciler/autoscaler fencing 与 CRI/节点/NFS 停止证明；Guard、ConfirmStopped/ConfirmResumed。Deployment generation 是观察到的 kube generation，不用 SQL runtime generation 替代。 |
| stopped | gate/SQL proof participant writer | 原 SQL status=stopped、原 registered UID/generation/checkpoint 和 Guard 证明；只核对仍停止，不发启动请求。 |
| 平台/后台/外部 participant | gate-only proof writer | D/A registry 原 ID/UID/generation/checkpoint；Observe 记录身份，Pause/CheckPaused 证明实际 drain，Resume 检查恢复权限；B 不自行释放安装 gate。 |

构造与 Bind 无网络/SQL/资源副作用；Prepare 中原 writer.Observe 才做只读 runtime 检查。缺实际依赖、required callback、平台 participants、重复身份、Windows/未知 runtime、缺原 reservation 或源清单漂移时拒绝。注册了上述 kind 不等于该 Agent 已获支持矩阵放行；原 LinuxProfile.Supported、Admission/ValidateInventory 和所有原门禁仍必需。没有扩大原 Pro/Windows 实镜像放行范围。

全部调用传入原完整 `Authority`。正常 Observe/Paused 路径使用 `Ports.Check`；恢复/ClaimRestart/CompleteRestart 使用 `Ports.CheckRecovery`，同时调用 owner 的精确 Guard。未知 point 拒绝。既有执行器的 ConfirmStopped 同时用于采集与恢复，本轮在 Resume 调用链显式标记恢复语义，取消/超时后不能错误要求过期 capture 权限。所有子步骤仍受当前恢复 fence 检查，不因补偿而绕过门禁。

Pod/Deployment 的稳定 `task_public_id/attempt/N` annotation 仅为原 attempt 的恢复标记，不是 claim、maintenance fence 或授权。Gateway 的 resume generation 必须来自 D 原预留；Secret-bearing restart Pod/env 仅通过 D 的加密原 ref loader 在内存中取出，不写入 B public Plan/checkpoint。

## 必需 owner 输入及准确缺口

| owner | 接口/字段 | 仍需提供 |
| --- | --- | --- |
| D | `AuthenticatedRelayAcceptor.AcceptAuthenticatedRelay` | 原 RR transaction 内的安装隔离、task/attempt/claim/maintenance/Job/cursor 锁与检查、创建/报告证据、cursor CAS、原 DB clock、最终 guard 和 commit/unknown-result 收敛。B 未另造这些公共表或历史。 |
| A/D | `RelayAuthentication.ResolvePeer` → 原 `RelayPeerConfig` | 原 Scope.ServerUUID/Database/Installation、独立已准入 IssuerIdentityHash/Subject、CA PEM+hash、证书 digest、ExpiresAt；原 Job config/attempt/phase/unit/UID/generation/ref/version/bound/expires 对应映射；loader 生命周期与实时公共撤销/轮换策略。**A 的认证与 BindDispatch 代码已到齐，不再列为缺源码。** |
| D | `RuntimeWriterSpec`、`RuntimeWriterDependencies.Ports` | 当前已准入 source-to-runtime/Pod/Deployment 映射和全量 public participants；Ports 每次用原 SQL clock/当前 claim/fence/registry 鉴权。不能只用 B 枚举的非空列表证明完整 source_writers。 |
| D | `WriterCallbacks` | 真实 Guard、原 encrypted LoadGateway/LoadPod、已持久 restart reservation/ref、ClaimRestart 的一次派发 CAS 与未知结果读回、CompleteRestart 的实际新 UID/gateway/port/源绑定事务；Deployment ConfirmResumed 也须核对/收敛实际新源绑定。 |
| A/D + 运行环境 | 实际 Agent / Kubernetes / CRI / NFS proofs | 当前端点/Pod/node/挂载身份、能力、TLS/最小身份与隔离配置；ConfirmStopped 证明原容器不再写，API 404/Pod 消失不能替代；外部 NFS writer fence、autoscaler/reconciler fence 与后台 worker drain 完整差集。 |
| A | worker grant / KEK / evidence 原入口 | relay peer 证明不签发 worker grant、不提供 DEK/DB 凭据、不认证 capture 结果内容；完整授权 purpose、原最小身份与原结果认证仍需装配，不能删 functional_test 限制冒充 acceptance。 |
| C/A/D | `Results.Read`、`BuildPartResult` pipeline、公共 artifact/finalizer/catalog | 原报告认证、真实 immutable seal ref/digest、checkpoint 与公共 manifest/framing 接纳、正式候选 schema 联审及最终产物未知结果收敛。本轮没有扩展或替代 C 的基础设施。 |
| D/操作者 | 生产 loop/main 与隔离安装 | 从原公共 claim/attempt 调 Dispatcher、加密 Plan 持久化、真实 K8s Job/ConfigMap/grant Ports 和完整 RecoverySnapshot；可写隔离 MySQL/Agent/K8s/CSI/NFS/HostPath 现场。当前未提供。 |

Runtime Agent 当前复用的 Gateway 请求只携带原 instance/generation 与 restart 参数，没有由本轮新增公共 task/attempt/fence HTTP 字段。现场必须提供经评审的延迟请求隔离、原 dispatch 未知结果与终止证明，确保失 claim 后的晚到 DELETE/CREATE 不越过恢复/下一任务屏障；仅靠本地 Guard 检查不能宣称执行端原子 fencing。该服务端授权/协议缺口交 A/D/Agent owner 对齐，本轮不猜字段或改服务端合同。

## 验证与清理边界

本轮针对 publicadapter/quiesce/shared dispatcher、A relay/peer、现有 services Gateway 执行适配回归；没有无变化重跑全部后端。Native TLS 用合成 CA/证书，但实际执行 A 原证书验证、BindDispatch/RecheckDispatch。SQL tx 指针为原 A 约定的隔离 identity anchor，**不证明真实事务提交**。

组合用例实际运行 `NewLinuxDispatcher → SELECT-only SQL driver → NewRuntimeWriterBuilder → RuntimeAgent HTTP loopback → flow.Capture → mock Job/认证报告 → stop → 原 reservation 恢复`。证明本地组合与副作用顺序，不是 MySQL server、真实 RuntimeAgent/K8s 或公共成品验收。Pod/Deployment 新构造器验证无 API 副作用及恢复 proof 权限选择，物理生命周期负例复用原 quiesce 隔离模型测试。

没有安装依赖；全部使用 local Go/offline module 模式。未连接参考服务器、未执行真实迁移、未合并 PR。原生退出码与 source pin 见 evidence README。专用 `.codex-temp/b-public-integration-20261028` 缓存此前清理被自动审批拒绝 `blocked by policy`，本轮不绕过；缓存清理不计完成，日志保留，没有清理其他 owner 产物或输出仓库独立 binary。

## 推送后 CI：公共 schema 清单门禁尚未通过

`a89b7ead` 推送触发 GitHub Build（临时测试合并 commit `6eb67c6e79617259fe62c169b6e68c732571d76c`）。Frontend Build 在 `system-backup-schema-inventory.mjs --check` 失败，尚未进入前端依赖安装/编译。正式清单仍记录 100 对象；同一脚本扫描当前基线得到 122 对象，22 项无 owner。相关 migration/repository/deployment/plan 输入以及原生成清单与 `backup@8ef5fa7f` 无差异，不是本轮新增 Go adapter 改了 schema。

只为诊断生成了候选快照，公共 contract checker 随后准确拒绝：`inventory object table:gateway_image_artifacts uses a value outside registry enums`。未猜填 owner/策略、未改枚举/正式 registry/门禁状态；已撤回对正式生成清单的探索性刷新。候选只保存于 evidence，不进入正式合同路径。

需各业务域 owner（包括 B）确认候选内 22 个对象的归属、备份/恢复策略及依赖，由 D 汇总接入公共 registry 并完成相应复核。候选中 `repository_runtime_alter=5` 是扫描命中数，包含 `_test.go` fixture SQL，不能据此宣布现场有 5 个运行时 ALTER；扫描边界也需 D 联核。没有通过重写生成文件或修改预期摘要绕过此问题。

原 CI job 日志、候选清单/摘要和合同拒绝原文见 evidence。本文的本地定向测试成功不代表 GitHub CI 全绿，更不代表 schema/六域准入通过。Frontend 该门禁仍是当前 PR 的已知阻断。
