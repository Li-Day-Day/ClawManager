# D → B：native Runtime 控制回调交接

状态：源码接入中；此文档只描述当前构造和生产 caller。未取得 zhanghui08 现场备份成功证明。

2026-10-29 本地复核：`Dependencies` 现在拒绝重复物理 writer ID，以及与 lease
participant 重名的物理 writer，防止 participant 在集合构造时被静默跳过。
`TestRuntimeControl` 和新增冲突回归用例通过；测试构建缓存已清理。当前
`kubectl` 无 current-context；提权只读核对 Docker 后仅有 buildkit，没有
MySQL/Agent 测试容器。因此这轮没有目标库 migration 126、Agent 镜像或真实
停止/恢复的现场验收结果。

本批源码复核：证明表读取改用 `FOR SHARE`，对应精确 `SELECT/INSERT`
grants；migration catalog 更新为 167 文件，证明表加入控制表分类与 v12
registry（仍为 `pending_owner_review`）。七个相关 Go 包完整测试退出码 0。
此处的 167 是 migration 126 入库时的记录；共享分支随后加入 migration 127，
当前 catalog 为 168 文件。migration 127 写入期间的控制器校验曾读到过渡态；
在 catalog 常量更新后，`TestRepositoryMigrationCatalogMatchesControllerAdmission`
单项重测通过。
旧的 `AgentsRuntime` checkout HEAD `293ceaca` 缺补丁所需 `slots/*`。
现在已在隔离 checkout `.worktrees/runtime-backup-proof` 上以 `8a0dddb`
为基线构建两次 Agent 提交；第一份协议补丁和第二份完成状态复查补丁按顺序保存在
`docs/patches/agentsruntime/`。第二份补丁在该基线上通过 Linux `TestBackup`
测试，且通过反向应用检查。上游推送返回 403，因此远侧镜像尚未包含这两份补丁；
必须核实镜像源码 SHA 并部署后再执行现场停止/恢复。Agent 自身进程重启后的
active backup 仍隔离，`agent_restart_reconciliation=false`。

## 生产构造

`cmd/system-backup-v2-controller/public_capture.go` 调用
`systembackupexecution.NewDeploymentService`。后者在
`deployment_runtime_sources.go:attachRuntimeSources` 构造
`systembackupcontroller.RuntimeControlConfig`，其中：

- `Namespace`、安装/数据库/Server UUID 与 RuntimeSources 来自同一签名部署配置；
  来源清单仍保留 SQL 的原始 nullable Pod/namespace 字段。
- `Gate` 是 `PublicJobOwner.Gate`，内部持有原 `SQLExecutionAuthority` 和
  `Recovery` 检查器；`Keys` 是该 owner 的 `deploymentRecordKeys`。
- `Client` 是该 owner 的 Kubernetes client；`Agent` 从受限
  `AgentTokenFile` 构造已认证 HTTP client，不能由 B 自行填 token。
- `GatewayOriginalForTask` 从原始 create 请求的加密 custody 读取；
  `StopProofForTask` 调用 owner 的实际 kubelet stop witness。
- `ParticipantChecks` 来自登记的 lease participant 集；
  `DeploymentChecks` 来自同一 namespace 的配置 Deployment。

`NewSQLRuntimeControl` 交付 `Prepare`、`BuildWriters` 和 `Callbacks`。
`Dependencies` 返回 B 的 `RuntimeWriterDependencies`：原 gate ports、
Kubernetes client、Agent、完整非 Runtime participant、轮询间隔和
`WriterCallbacks{Guard,LoadGateway,LoadPod,ClaimRestart,CompleteRestart,
ConfirmStopped,ConfirmResumed,GatewayControl}`。B 只调用这些回调，
不为原任务、participant、停止证明或恢复预留另写 SQL。

`RuntimeWriterSpec` 的 raw `Source` 与公共 inventory 逐字段比较；
`RuntimeLocator` v2 独立固定实际 namespace、Pod/UID、部署、binding ID、
Gateway PID、Agent epoch；`RuntimeGatewayBackup` 固定原任务 operation ID
和真正 native create 请求的摘要。旧 v1 locator 和 legacy process-group
能力不能准入这条 native gateway Writer。

## 停止与恢复边界

`BackupGatewayWriter` 通过 `GatewayControl` 请求正向停止证明及检查，
不再将 HTTP DELETE 或查询 404 解释为停止完成。回调在原 task/attempt
事务中检查源行、binding、Pod、Agent epoch 和最终授权，再持久化 Agent
原始响应字节及 SHA-256。`ClaimRestart` 要求库内停止回执与 Agent 当前
状态一致。恢复配置来自同一加密原请求，预留 generation 在派发前固定。
`CompleteRestart` 在 Agent 恢复回执、实际运行 PID 和 Pod 身份一致后，
CAS 更新 `instance_runtime_bindings` 的 generation/gateway/PID 和
`instances.runtime_generation`。随后调用 Agent `complete` 解除预留。

表 `system_backup_v2_gateway_proofs` 由 migration 126 建立，
`RuntimeControlGrantSQL` 增加该表的 SELECT/INSERT；原配置明文不进入证明表。
目前仍需目标库真实迁移和权限验证；现场库最后观测到的是 migration 080。

## 未交付和联调

B 的 worker 主动 relay sender 与正式流式 writer 属于 B；D 已有 `/relay`
认证接收/同事务持久化，但端到端发送尚未验证。A 提供 KEK/worker 授权材料，
C 提供 envelope/AAD/签名 resolver 等公共合同；D 负责真实 caller 把原认证
快照与配置交给 B，并修通统一分支的精确依赖。

Agent 上游仓库对当前账号返回 403；已将基线后的首补丁和完成状态复查增量
保存在 ClawManager 的 `docs/patches/agentsruntime/`。两份补丁还需要镜像构建、当前 namespace 部署
和真实 MySQL、Agent、Kubernetes、NFS 联调。`4fe83bcd` 现库导入 profile
及现场 080→目标 schema 升级仍由 D 单独交付，不能只改 source SHA。
