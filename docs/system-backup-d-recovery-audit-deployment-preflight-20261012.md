# D：恢复管理独立审计存储部署预检

日期：2026-10-12。A 的 `RecoveryAuditJournal` 已实现预置普通文件、逐条 `fsync`、逻辑容量与路径换绑失败关闭；本文固定 D 的部署输入和验收证据。当前没有生产恢复管理进程使用它，不能将隔离测试临时文件记作生产审计容量。

## 部署输入

| 输入 | D 的部署约束 | 可接受证据 |
| --- | --- | --- |
| 独立持久卷 | 审计 journal 使用专用 PVC/PV，不与数据库、备份报告、决策文件或应用临时目录共用卷；在存储后端预留容量，不能只凭 PVC 请求量推断物理余量。 | PVC/PV UID、StorageClass、后端卷 ID、容量预留与故障域记录。 |
| 单写者 | 恢复管理进程单副本，升级使用 `Recreate` 或等效的先停后启；卷使用经现场验证的单写者访问模式，跨节点故障接管时旧写者必须先被围栏。 | Deployment/Pod/PVC 快照、旧 Pod 停止确认和新 Pod 接管记录；并发启动负测。 |
| 预置文件 | 启用前由受审初始化流程在卷内创建 journal 普通文件，固定绝对路径，拒绝符号链接与路径换绑；运行时只取得追加写权限，其他业务容器不能写。 | 文件 inode、owner/group/mode、挂载信息、ServiceAccount/容器权限和非法写入拒绝结果。 |
| 容量 | `maxBytes` 小于卷可用的独立预留空间，另留文件系统元数据与告警余量；容量满、卷只读、`fsync` 错误必须使管理变更失败关闭，紧急撤权仍有单独预留通道。 | 配置值、存储后端剩余容量、容量耗尽及 I/O 故障注入回执。 |
| 保留与核对 | 保留原始 journal 字节、轮换后的卷身份和数据库 `audit_logs` 对应请求摘要；`result_prepared` 只表示提交前准备，未知 COMMIT 必须经独立授权读取核对。 | 原始记录 hash、数据库 intent/result、请求 hash、卷更换和未知提交演练记录。 |

## 验收顺序

1. 固定 StorageClass、卷 ID、容量和节点故障域；审核其与数据库及常规报告卷的实际隔离。先生成部署差异并审查，不直接修改现有生产清单。
2. 创建专用卷和预置文件，检查准确挂载路径、普通文件、权限、容量和单写者约束；用第二个无权容器验证拒写。应用未接线前仅记录存储事实，不声称 journal 已持久化业务审计。
3. 接入 A 的 journal 后，在隔离环境验证 `intent`、`result_prepared`、`fsync`、容量耗尽、路径换绑、重启及跨节点接管。每轮保留原始退出码、Pod/PVC/PV UID、后端卷 ID 和清理或保留状态。
4. 将 journal 回执与同轮 MySQL L1a/L1b/L2、数据库审计、mTLS 撤权结果核对。外部审计写入失败必须阻止变更；提交回包丢失不得返回授权结果。

## 只读 PVC/PV 预检入口

专用卷创建后，操作者可从仓库根目录运行下列命令，替换实际 context、namespace、claim 名、受审 StorageClass/CSI driver 和最低容量。脚本只调用 `kubectl get`，核对 PVC/PV 的准确 UID 绑定、`Bound`、CSI 卷标识、`ReadWriteOncePod`、文件系统卷模式，以及申请/绑定/实际容量，并拒绝同 namespace 另一 PVC 复用该 PV 或另一 PV 指向相同 CSI 卷。它不创建或修改集群对象，也不执行远程 MySQL 测试。

```powershell
& .\scripts\system-backup-d-recovery-audit-storage-preflight.ps1 `
  -KubeContext '<reviewed-context>' `
  -Namespace '<reviewed-namespace>' `
  -ClaimName '<dedicated-audit-pvc>' `
  -ExpectedStorageClass '<reviewed-storage-class>' `
  -ExpectedCSIDriver '<reviewed-csi-driver>' `
  -MinCapacityBytes 1073741824
```

输出 `STORAGE_PREFLIGHT_PASS_NOT_PRODUCTION_ACCEPTANCE` 只证明本次 Kubernetes API 快照的卷绑定与申请容量。CSI 后端实际预留、文件权限、独立故障域、单写者接管和 `fsync` 故障注入仍须按上表现场核对。

当前缺少已签收的 StorageClass/后端容量、生产管理进程及其单写者部署、文件初始化与权限配置、跨节点围栏和故障注入回执。因此本清单处于**待部署验收**，不解除恢复管理和生产入口的默认关闭状态。

2026-10-12 本地增量：预检补拒 `Block` 卷，并核对 PVC 申请量不低于最低容量且绑定容量不低于申请量。PowerShell 语法与模拟 `kubectl` 的正常绑定、块卷拒绝和申请量大于绑定量拒绝均通过；未连接实际集群。
