# B：WorkBuddy 身份输入装配与配置诊断交接

准确基线 `af7c3ad599195eb1a577c3e0389c55a9643d375b`。本轮在既有未提交 B1/B3 改动之上增加纯装配与诊断，没有提交、推送、安装依赖、现场写入或真实迁移。

## 实际构造与数据边界

新增 `publicadapter.WithWorkBuddyIdentities(cfg, snapshot) (UsersInstancesModuleConfig, error)`：

1. 深拷贝配置，保留原任务、材料引用、期限、policy、intent generation 及 Job 模板，不签发身份或分配 UID。
2. 调用 `domain.WorkBuddyUIDForInstances`，一次执行原快照、身份表 schema、历史关系和 allocator 高水位校验，按要求顺序返回活动实例身份。原单实例 API 复用该实现，接口不变。历史预留保留在原快照，不能绑定到活动 workspace。
3. 核对完整用户/实例集合，以及每个实例的 owner、generation、type/mode/backend/variant/OS、status、Pod/namespace/workspace 与原 SourceInventory。缺字段、漂移或不完整输入拒绝。
4. 为各 WorkBuddy 挂载绑定原 Schema/instance/user/UID/GID；已有身份必须完全相同，否则失败，不静默覆盖。每个输出身份独立分配；非 WorkBuddy 挂载保持不变。
5. 再通过原模块构造校验。失败返回零配置及公开 not_ready，不返回部分可执行模板，不暴露原始行或底层错误。返回配置不保留快照引用；调用者不能在调用期间并发修改快照。

**这是纯转换，不是认证。** `domain.Snapshot` 不带安装、数据库、task、attempt 或 capture context 的授权元数据。D 必须先验证它来自本任务原认证 SQL 捕获上下文，并在同一 fence/捕获点下提供 SourceInventory；匹配行、UID 或摘要不能代替来源证明。函数不创建新捕获点，也不自行查库。没有 WorkBuddy 时不消费身份快照，但仍复制配置并执行模块校验。

当前启用的身份 schema 仍是原 WorkBuddy Linux Lite UID v1；不扩展 Pro/Windows，也不修改历史 SQL/UID 分配器。

## 脱敏诊断 API

`publicadapter.DiagnoseUsersInstancesConfig(cfg) ModuleConfigDiagnostics` 只检查本地构造输入，返回：

```json
{"issues":[{"code":"workbuddy_identity_required","field":"workspaces.request.invocation.workbuddy_identity","receiver":"B","instance_id":7,"mount_index":0}],"truncated":false}
```

- code、field、receiver 均来自实现中的固定值；只另带合法范围内的实例 ID 和挂载数组下标。`mount_index=-1` 表示非挂载项。
- 不返回数据库名/地址、路径、CA、Secret/key 引用、凭据、快照/行摘要、原始配置、原始错误或 policy 内容。不要在调用者日志中附加这些输入。
- 可一次列出 revision/source、DB/TLS/限额、worker image/serviceAccount、staging/control 引用、Pod 绑定、任务 binding/deadline、mount/policy/WorkBuddy 身份缺项和输出碰撞。
- 最多 128 条，超出设 `truncated=true`；集合超出原容量上限直接给 capacity_exceeded。顺序按输入数组保持稳定。
- 原严格构造仍拒绝但没有专门提示的情况返回固定 `module_config_invalid`，不因诊断覆盖范围较窄而放行。
- 兼容现有 PVC、直接 NFS 和固定节点 hostPath 输入形式；实际挂载/节点/存储身份仍由原 owner 和 inventory validator 验证。

**issues 为空仅表示这些本地配置检查通过**，不是 admission/readiness、实际存储/完整 writer 证明或六域 acceptance。诊断不读取外部 A keys/grants，也不探测 C provider。任务实际匹配、期限、完整 Job/spec 校验仍在原 BuildParts/BuildCapturePart 和授权链执行。

## D 的最小接收步骤

```go
// originalAuthenticatedSnapshot 的认证、来源、捕获点及权限由原 D/A 调用链验证。
// 不从 HTTP request、workspace marker 或另一个临时 SELECT 构造此输入。
boundB, err := publicadapter.WithWorkBuddyIdentities(admittedBConfig, originalAuthenticatedSnapshot)
if err != nil {
    // 返回公开错误；不要记录 snapshot/config 或 source digest。
    return err
}
report := publicadapter.DiagnoseUsersInstancesConfig(boundB)
if report.Truncated || len(report.Issues) != 0 {
    // report 可用于内部交接；保留原认证/授权，不自行新增开放管理 API。
    return systembackupdispatch.ErrNotReady
}
bModule, err := publicadapter.NewUsersInstancesModule(boundB)
if err != nil { return err }
registrations := append([]publicadapter.CaptureModuleRegistration{}, cRegistrations...)
registrations = append(registrations, bModule)
catalog, err := publicadapter.NewCaptureModules(registrations, originalCaptureContextResolver)
if err != nil { return err }
captureConfig.Modules = catalog
// RuntimeControl、PlatformWriters、源 inventory、独立恢复准入及原 gate 不变。
capture, err := systembackupexecution.NewPublicCapture(captureConfig)
```

若装配失败，可在已有原始 cfg 上调用诊断获取本地缺项；诊断不能解释或证明所有快照认证失败。D 应保留原受控调用的公开失败分类，不能以诊断为空代替来源认证。原捕获上下文的真实生产快照持有者/读取位置尚需 D 指定，本轮不另造读取端或控制 SQL。

## D/A/C 接收清单

| 接收人 | 本轮接收什么 | 必须提供/落实什么 |
| --- | --- | --- |
| **D** | 上述两个 publicadapter API、批量身份提取、原 NewUsersInstancesModule 注册和调用例。 | 指定原认证 SQL 快照持有者和实际 caller；快照的 installation/database/task/attempt/capture context 绑定；与 SourceInventory 同一捕获点、完整挂载/writer 及实际模板来源。没有该原输入时维持 not_ready。 |
| **A** | 脱敏报告结构，以及身份完成后进入原最终 invocation/spec 授权的接点。 | 原 source/worker/recovery 身份、key/grant/材料用途版本撤销规则；原快照来源授权及最终全局 PartIndex/spec hash 授权。诊断里有 ref 不代表 A 已签发材料。 |
| **C—Teams/Skills** | 与 B 联合注册时的具体模块入口，原全局排序、共享 capture context、staging 输出碰撞规则。 | 自己的真实 Build、SQL/Redis/TTL/对象/workspace 与 writer 差集，不能使用 B 身份或 B exporter 冒充本域采集。 |
| **公共 C/D** | B 输出的原 JobPart 与共享结果合同不变。 | 原正式 seal/finalizer/catalog/manifest/current-facts/provider/隔离还原接线。本轮诊断和 UID 装配不替代正式成品验收。 |

此外，B2 Agent 服务端源码/版本、停止回执与 task/fence/operation 的联合绑定仍按 [上一轮盘点](system-backup-b2-capability-and-module-registration-20261029.md) 等待 Runtime owner、D/A/B 接续。本轮未假装接通 gateway-stop 或 detached 进程树证明。

## 验证与限制

见 [本轮隔离记录](evidence/b-identity-diagnostics-20261029/README.md)。新增测试覆盖有效装配到实际 Job 工厂、多用户/多实例、历史预留、allocator 回退/重复 UID、缺 schema/字段、源用户/owner/generation/workspace 漂移、冲突身份、无部分输出、复制隔离、幂等输入、诊断脱敏/截断/稳定性及支持的存储形式。

没有真实 SQL/K8s/Agent/存储访问或迁移。现有 workspace-only、functional_test、零实例准入不改；生产 systembackupexecution 包缺精确依赖缓存而未编译的限制继续有效。没有为此重复必然失败的构建或安装依赖，不能将 B 两个包通过外推为公共整链通过。用户要求保留的两个空目录未处理。
