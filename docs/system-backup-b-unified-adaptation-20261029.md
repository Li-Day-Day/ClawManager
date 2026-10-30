# B 在统一基线 af7c3ad5 的接线补齐

本轮按用户指定，将本地分支从 `4fe83bcd` **快进**到 `origin/codex/unified-backup-baseline@af7c3ad599195eb1a577c3e0389c55a9643d375b`，保留先前未提交 B1/B3 源码及日志，没有创建提交或推送。下述是该准确基线上的本地增量，不沿用旧版本的测试通过结论。

## 1. 已到齐的输入，不再列作缺源码

- D 已统一 C 执行链：唯一生产入口是 `cmd/system-backup-v2-controller` / public-v1，控制表 `system_backup_v2_*`，业务门禁 `system_backup_gate`。旧 `system-backup-controller` 明确退出。
- D `SQLRuntimeControl` 已提供真实 Prepare/Dependencies/Callbacks/BuildWriters、加密 custody、重启预留/CAS、源映射、停止/恢复证明接点。B 不重新实现这些 SQL，不再要求另交一套 RuntimeMappingResolver 作为生产前提。
- D `SQLAuthenticatedRelayAcceptor` 已交付原事务中的 scope/claim/fence/Job/cursor/evidence/receipt、最后权限时钟复查及 commit/unknown/replay 处理。B 保留原 NewAuthenticatedRelayHandler，不另造接收器。
- 独立 RecoveryAdmission、RecoveryOnly、ResumeBarrier、Pod-bound 身份、按 task 的 staging 子目录及 C 平台物理停止证明均已在共享源码。本轮保留这些字节和保护。

## 2. 本轮实际补齐

### 生产模块接点及原 D writer

`publicadapter.WithCaptureModules(Source, Modules)` 只替换显式选择的 part factory，保留 D/C 的原 BuildWriters。`systembackupexecution.NewPublicCapture` 现在实际调用 `configuredPublicSource`，消费可选 `PublicCaptureConfig.Modules`；nil 时原 workspace BuildParts 不变。

当使用 D `RuntimeControl` 时，仍调用其真实 BuildWriters，不重复 Prepare，不把 D 预留/密文写入移到 B。先前低层 `NewRuntimeLinuxProfileConfig` 保留用于已持有准入映射的构造，**不再作为 D 正常 SQL 路径的额外前置**。

### 保留 C 的物理平台 writer

原 NewPublicCapture 在配置 RuntimeControl 时直接覆盖 Source.BuildWriters，会丢失 C 平台 Deployment writer 的 StopWitness/PrepareStop/ConfirmStopped/ConfirmResumed。现改为显式 `PlatformWriters` 分组并调用 B `ComposeRuntimeWriters`，缺组拒绝，禁止悄悄覆盖。

`DeploymentService.PlatformWriterGroup(originalJobOwner)` 从原 Config.Writers/现有 platformProfile 构造真实组，避免维护者重新手填平台身份或复制停止逻辑。它保留原零实例保护、autoscaler/UID/退出/恢复证明，不隐藏 inventory.Instances、不自动开放非空实例。

Discover 时两组使用完整原 inventory；Bind/恢复时按声明的原 platform ID 把 frozen 分成 platform/runtime 两组，再核对合并后的精确全集。即使 runtime 集合为空也保留非 nil 的 frozen slice，D 不会误判成第一次发现。重复、缺失、替换 ID 或 typed-nil writer 均拒绝。实际 Observe/Pause/Resume 仍交原 flow/当前 Ports 与统一 BeforeResume barrier。

### 独立恢复和实际 worker 合同

RecoveryOnly 可在没有源 DB/forward module context 的情况下构造并 Bind 原冻结计划，不能 Discover、构造新 part 或借此拿到 forward 权限。新 module 工厂要求原 WorkerControl.BoundPodIdentity；workspace capture 不允许 restore-normalization PolicyVersion/Files；按 task 的 staging 隔离由原 Job 工厂保留。

本轮模型回归补了混合运行/停止实例、公共 ResumeBarrier、原平台分组保留、独立恢复无源凭据、未绑定 Pod/restore policy 拒绝。支持矩阵、supportedPublicCapture、DeploymentService readiness/admission/inventory 和 platformProfile 零实例限制均不放宽。当前正式装配仍是 workspace functional_test；目录支持某种 Job materialization 不代表正式 provider/全部模块已接收。

### 124 迁移元数据遗漏

核对 D 的追加迁移 `124_backup_v2_runtime_control.sql` 后，发现 catalog 四个生成物仍旧，且两个新执行账本没进入控制表分类。按原 `backup-team-catalog.py` 同步实际目录 hash/count，并将 `system_backup_v2_runtime_controls`、`system_backup_v2_relay_receipts` 加入目标本地控制元数据清单，禁止作为业务数据/可执行恢复状态导出。

没有执行 DDL、修改历史 SQL、扩大角色 grants、修改 registry.objects 或审批。原对象策略/交叉审批逐对象完全一致；formal registry 中这些执行对象的完整 owner 策略签收仍由 D/A/C 完成，目录更新不是批准或现场升级。

## 3. D 的实际接收例子

```go
runtime, err := systembackupcontroller.NewSQLRuntimeControl(runtimeConfig)
if err != nil { return err }
platform, err := service.PlatformWriterGroup(originalJobOwner)
if err != nil { return err }
captureConfig.RuntimeControl = runtime
captureConfig.PlatformWriters = platform
captureConfig.Modules = moduleCatalog // 可选；nil 保留原 workspace 工厂
capture, err := systembackupexecution.NewPublicCapture(captureConfig)
```

`runtimeConfig` 继续使用原 Gate/Keys/Kubernetes/Agent/StopProof/GatewayOriginal/ParticipantChecks/DeploymentChecks；public constructor 继续核对同 DB、installation、application scope、recovery identity。模块仍按 [B3 字段合同](system-backup-b-runtime-profile-module-contract-20261029.md) 给出真实 Build/上下文；不是任意 worker command。当前平台组对非空输入仍明确拒绝，待 Runtime 端协议、准入及全部 writer 覆盖签收后，由 D/B 另作有证据的版本扩展。

## 4. 仍缺什么，以及谁接收

| Owner | 准确剩余输入 | 不再重复索取的已有实现 |
| --- | --- | --- |
| D / 部署 | 原 GatewayOriginal 完整创建材料来源、实际 RuntimeControl 配置、最小 runtime SQL 角色/grants、受控升级/导入 profile；已审核的全部平台/participant/writer 身份与 probe。 | custody/预留/CAS/Callbacks、relay 事务源码已存在。 |
| A | 实际 forward/recovery/key/worker/issuer/KEK/signer 的引用、用途/版本/历史与撤销材料；DEK 交付/撤销 lease 线性化协议仍需明确。 | 现有 typed 安全调用和授权链保留，不用测试 key 或空回调替代。 |
| Runtime owner + A/D/B | 经证明的 backup-safe 停止、detached 工具树退出、原处恢复、迟到请求/原 operation/实例/Pod/代数隔离。 | generation-addressed 客户端/B writer 已有；不改两个布尔值冒充能力，不移除零实例保护。 |
| Teams / Skills | 真实模块描述/Build、领域 SQL/Redis/TTL/对象/workspace、完整 writer 差集及同一 capture point 的事实/引用。 | C 的零实例 workspace 链存在；B 用户/实例 DB exporter 不是 C 的通用 SQL exporter。 |
| 公共 C / D | 当前 CurrentTaskFacts v1 / ManifestReader 实现、seal/正式 finalizer/catalog/immutable manifest 和生产接收。 | D 已有版本化当前事实接口；本轮模块目录不代替 provider 或正式成品出口。 |
| 依赖/测试环境提供者 | 现成 Go 模块缓存中的 `github.com/cyberphone/json-canonicalization@v0.0.0-20261011152517-32a48195b9b2`，以及获准写入的隔离安装。 | 本轮没有安装/下载依赖，没有用旧版本或 stub 绕过。 |

## 5. 准确验证状态

B publicadapter/dispatch 的完整本地回归与 vet 通过；Python catalog 检查/测试和独立 Go catalog 算法通过，详见 [本轮原始记录](evidence/b-unified-20261029/README.md)。

**systembackupexecution 装配包在依赖解析阶段被上述缺失版本阻断，新增生产接线尚未完成类型检查/编译与执行验证。** 已做最终 Go 语法解析和原保护字节复核，但它们不能替代编译；不据旧 D/C 的测试或当前 B 包通过宣称整合已通过。补齐现成缓存或在既有获准环境中需重跑 execution/controller/新增装配测试。

没有运行真实数据库、K8s、Agent、密钥签发/撤销、迁移或正式成品恢复。所有新改动仍未提交、未推送。原测试缓存清理拒绝记录保留，不换方式绕过。
