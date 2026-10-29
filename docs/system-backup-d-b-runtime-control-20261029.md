# D → B 实际 Runtime 控制与认证 relay

前置 C 接口更新 `f2f78aef` 已推送 `origin/codex/unified-backup-baseline`。本文件描述后续工作树中的实际代码，不把公共 C provider、六域或正式 backup KEK 成品列为完成。

## B 构造与 caller

```go
// deployment-owned inputs; never request JSON
runtime, err := systembackupcontroller.NewSQLRuntimeControl(runtimeConfig)
if err != nil { return err }
captureConfig.RuntimeControl = runtime
capture, err := systembackupexecution.NewPublicCapture(captureConfig)
```

`NewPublicCapture` 检查与原 JobOwner 相同的 DB/installation/application scope/recovery identity，然后设置 `LinuxProfileConfig.BuildWriters=runtime.BuildWriters`。原 BuildParts、source connection、profile、Admission、Inventory、Guard 仍是已有 deployment 的真实输入。B 不实现 SQL，不创建另一套任务、gate、密钥或身份服务。

需要分步消费时，D `Prepare(ctx,authority)` 返回 `[]publicadapter.RuntimeWriterSpec`；`Dependencies(ctx,authority,specs)` 返回 `RuntimeWriterDependencies`；`Callbacks()` 返回七个真实 `WriterCallbacks`。正常装配用 `BuildWriters`，避免重复准备：它读取既有 custody，首次发现阶段才 Prepare；frozen plan 绑定/恢复缺 custody 会失败，不重新发现来源。

| RuntimeControlConfig 参数 | 准确来源 / caller |
| --- | --- |
| Gate | 原 deployment `SQLCaptureGate`，包括原 SQLExecutionAuthority、SQLRecoveryAuthority 和记录链 |
| Keys | A 原 `ExecutionRecordKeys`，必须允许原版本 record key；不是 backup final KEK 或 worker capture key |
| Client | 原 deployment Kubernetes client，实际读取 Pod、ReplicaSet、Deployment UID；B writer 用它执行物理操作 |
| Agent | 实现 `services.BackupGatewayAgent` 的原 Runtime Agent client；必须有已批准的 generation-addressed state/delete/create 能力 |
| StopProof | 原 CRI/node/NFS 等 `Confirm(ctx,[]quiesce.PodIdentity)` proof client。Pod 消失、HTTP 404、超时不能替代它 |
| GatewayOriginal | deployment 的原配置持有者提供**原 generation 的完整已批准 create request**。不能从不完整的当前 SQL 字段或普通重启 helper 重建并冒充原配置；普通 scheduler prepare 会写 workspace/预留端口，不能调用它作为只读 loader。没有原请求时明确不可用 |
| ParticipantChecks | 原完整业务 gate registry 中每个非 runtime participant 的实际 drain/health probe；必须覆盖 DB、后台任务、外部写者等登记项。没有默认成功 probe |
| DeploymentChecks | `namespace/deployment` 对应的实际 reconciler/HPA fencing probe；缺失拒绝。当前 source→Deployment 适配要求一个实例对应一个副本，不能把共享多副本 Deployment 当成独立实例 |
| PollInterval | deployment 显式配置，`0 < interval <= 1s` |

`GatewayOriginal`、实际 proof/probe 和 A 身份材料需要部署 owner 提供；仓库中没有这些现场材料时不得用 synthetic 输入启用生产。已交付的是 D 的真实 SQL/加密/控制实现与装配接点，尚未宣称现场安装已启用。

## 状态与来源

source 从真实 `instances` 全量投影读取。Lite 与 `instance_runtime_bindings/runtime_pods` 交叉核验 generation、workspace、端口、gateway ID、endpoint、Pod UID；Pro 检查 Pod UID，controller-owned Pod 沿 ReplicaSet UID → Deployment UID，不能猜 deployment 名称。stopped source 保留停止状态。所有 spec 与 B 的冻结 source inventory 精确比较。

`124_backup_v2_runtime_control.sql` 添加版本化 runtime custody 和 relay receipt；不恢复旧未版本化 control SQL。原应用 gate 的 participant 表仍是既有执行链唯一业务门禁，读取它不代表复活旧私有任务系统。

原配置用 A 原 record key + staging authenticated envelope 加密。AAD 绑定 installation/task/attempt/phase/config hash/writer ID/原字节 digest。读取校验原 key version、scope、hash；失败不返回明文；临时 byte/key 清理。gateway 只在 D 预留记录中分配下一 generation，B 消费 `ResumeGeneration`；原 source generation、端口、slot 保持到恢复完成，完成时两张业务表与 custody CAS 同事务更新。

`ClaimRestart` 在原 recovery authorization、pause journal 和 collectors-stopped barrier 下唯一标记 dispatch；重复返回 false，提交未知不返回 claimed=true。Pod 要求已保存完整旧进程集 stop proof；gateway 重新确认旧 generation 已停止。`CompleteRestart` 比较原 source 和 reservation，核验实际 Pod/Agent observation，精确重放可重复确认，不允许换 UID/端口/generation。

停止证明必须与原 checkpoint 的完整 Pod/container 集一致，D 调实际 StopProof 后保存 digest；`ConfirmResumed` 要求原 UID 或本 attempt 的 dispatch，Deployment 还校验原 controller UID、真实就绪 Pod、marker 和 fencing probe，再 CAS 更新 instance 的新 Pod 绑定。proof/ready 只代表物理事实，不代表 artifact acceptance。

## 认证 relay

```go
owner := systembackupcontroller.SQLAuthenticatedRelayAcceptor{
    Authority: originalExecutionAuthority,
    Current: currentWork.Input.Authority,
    Scope: originalAdmittedProducerScope,
}
handler, err := publicadapter.NewAuthenticatedRelayHandler(originalRelayAuthentication, owner)
```

caller 为 D 当前 execution owner / deployment 路由装配。`Current` 来自原 `ExecutionWork.Input.Authority`，不得从 message 创建；claim row-version 变化后由 D 更新该实例。`Scope` 是 A 原 server UUID/database/installation，`RelayAuthentication.ResolvePeer` 仍用 A 已登记证书映射；message 仅为 lookup hint。B 只消费 handler/acceptor，不查询控制表。

实现次序：原 authority Bind 锁 scope/claim/fence → 真实 runtime Job binding + revoked 锁 → public observation cursor 锁 → A session Bind → 原 evidence owner/hash 校验 → 原始消息 receipt 与 cursor CAS → A Recheck → 最终 SQL authority/clock RecheckAfter → commit。仅确认提交后返回成功；提交响应丢失返回 unknown，下次经完整认证的 exact latest replay 读取已提交原字节再确认。越序、倒序、冲突字节、终态重开均由 B 原规则拒绝。receipt 保存的是已认证观察，不把 completed 当成任务 succeeded/正式 evidence 创建。

当前实际 runtime resource 表仅支持 backup/capture，因此该 SQL acceptor 明确拒绝 preflight；未假装 preflight Job owner 已交付。Job relay timestamp 生成已统一至 SQL/A 所需微秒精度。

权限用新增 `RuntimeControlGrantSQL` / `SQLRuntimeControlGrantProbe` 单独显式签发；原 `PublicCaptureGrantSQL` 不放宽业务写权限。新增角色只在原 workload grant 明确绑定后启用。migration、角色 grants、原配置来源与真实 probes 都必须先就绪。

## 后续与验证边界

`4fe83bcd` 现库导入 profile 是 D 独立后续，不以替换 source SHA 完成。空测试库：先完整 migration → 明确 fixture installation/engine/gate/registry → 独立 A grants/keys → 停止/恢复及 relay 错误注入。现库：先只读盘点实际 migrations/source schema/映射和活跃任务 → 备份与回滚计划 → 增量 migration → 最小角色升级 → 验证原 profile/数据一致 → 显式注册导入 profile → 幂等/恢复演练。未对用户现场执行迁移、创建 policy/key/token 或宣称该 profile 已导入。

A 协调：保留其 typed task capture key 调用。D 只在 `public_jobs.go` 的 binding timestamp 区增加微秒归一化。DEK revoke/交付线性化仍是原工作授权 lease 的协议决策；本项未将 relay receipt 伪装成已解决 DEK 并发撤销。

本轮验证：原生 Go 定向测试通过，controller 最终 7.007s、execution 最终 9.143s；B publicadapter writer/relay 5.464s。命令为 go test -p 2 ./internal/systembackupcontroller ./internal/systembackupexecution ./internal/systembackup/publicadapter -run 'TestRuntimeControl|TestPublicCapture|TestAuthenticatedRelay|TestRelay|TestRuntimeWriter' -count=1，最终变更后复测 controller/execution 的 TestRuntimeControl|TestPublicCapture。包含原事务最终授权/版本/时钟/错误回滚、source state 身份边界、角色不扩大原 capture 权限、实际 SQL relay 接收器的 receipt 失败/撤权/提交响应丢失/精确重放/越序/旧 attempt evidence/终态重开。属于 SQL-driver + synthetic mTLS 模型验证；未运行现场 MySQL/Runtime Agent/Kubernetes 集成验收，未应用 migration 或 role grants。
