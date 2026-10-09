# D：Longhorn 只读核验与历史账本隔离测试

**后续现场回执已收到**：[Longhorn 异常明细与 fresh schema 基线](system-backup-d-longhorn-fresh-baseline-20260929.md)。fresh 的 93 迁移/99 表基线采集通过，保持未审批候选。隔离 RWX 已返回 PASS_ISOLATED_RWX：8 项跨节点读写、权限、新鲜度及身份检查通过，临时 namespace/PV/Longhorn Volume 和两端目录均报告清理，无需重跑。Longhorn 两项条件仍为 False；master 当前 20 个 Longhorn 块设备无 multipath holder，dm_crypt 模块文件存在但未加载。正式报告 PVC、专用 collector 输入和真实 HTTP/bootstrap 容量准入仍未验收。以下较早记录不覆盖本段最新结论。

这两项沿用实际目标 root@10.130.14.23 / clawmanager-zhanghui08-system。SSH 密码由操作者在终端输入；脚本不安装依赖，也不替 A/B/C 审查旧 SQL 语义。真实 080 升级、报告卷创建和 HTTP/MFA/配置激活仍未执行。

## 最新现场回执与本地构建问题

**历史隔离 MySQL 验证现已通过，无需重跑。** 操作者回传 run `sbk-mig-260929062117-1e03` / UID `2387ad0f-429a-4181-a910-8f889a0fde89`：MySQL 8.4.8 fresh replay 93 文件通过，`TestDReviewedHistoryMySQL` 六个子场景全部 PASS；95→96 保留历史行、运行表 DDL 与 fresh 一致、旧 SQL 不执行、重试保留账本及运行数据。探针摘要与本地修复验证一致；namespace、远端 scratch、本地缓存均报告 CLEANED。依据为用户控制台回执，未独立查远端，未提供单独退出码。见 [隔离 MySQL 回执](evidence/system-backup-d-reviewed-history-mysql-20260929.json)。

下一步 D 可继续核实 Longhorn 两项异常条件，并准备可信 fresh schema 基线采集及差异校验；实际旧 SQL 原文/来源审查、专用报告卷挂载验收和真实准入输入仍是独立缺项。六场景通过不放行实际 080 升级、HTTP/MFA 或配置激活。以下构建失败、修复与命令保留作历史记录和复现说明。

Longhorn 只读回执已收到：[原始附件提取的观察](evidence/system-backup-d-longhorn-live-20260929.json)。原探针 25 项动态检查通过、两端 CLEANED；观察到 manager 镜像 v1.12.0、longhorn-rwx 为 Immediate/Delete/ext4、双副本，CSI 与工作负载 Ready。**这不等于整体存储健康通过**：Longhorn Node 同时报告 `Multipathd=False / MultipathdIsRunning` 和 `KernelModulesLoaded=False / KernelModulesNotLoaded`。这些依赖条件需要结合实际数据引擎和详细诊断确认；未停止宿主机服务、加载模块或安装组件。NFSClientInstalled=True 只是控制器报告，专用卷挂载/权限/新鲜度仍未验证。

附件还包含 JSON 深度 8 的截断警告。脚本此前把整份旧观察嵌入 expected.json；现改为只带所需 node/mysql/database 目标字段，序列化深度 32，并在 CheckOnly/SSH 前将任何序列化警告作为错误。已回传的目标标量身份均由探针检查通过，新的传输修复不要求重跑同一 Longhorn 观察；未使用的深层旧元数据不作为本次有效输入证据。

历史隔离验证尚未开始：本地 `internal/runtime/gc` 编译器退出 `0xc0000043`，随后的四个 package 标记 build failed，脚本已清理本地缓存且尚未进入 SSH。[失败记录](evidence/system-backup-d-history-build-failure-20260929.json)。该 NTSTATUS 是文件共享访问冲突；仅凭日志无法判断占用者，也不能归因于 Go 代码或内存不足。[Microsoft NTSTATUS 定义](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55)。

远端 wrapper 之前遗漏了本地成功验证脚本的串行设置。现在默认 `BuildParallelism=1`，同时固定 `GOFLAGS=-mod=readonly -p=1` 和 `GOMAXPROCS=1`；telemetry/cache/tmp 归本轮 scratch 所有并在 finally 清理、恢复原环境。它降低并发构建暴露的冲突，不保证任意外部文件锁都消失；没有关闭防护软件、终止其它进程、下载依赖或无限重试。

修复后已实际运行同一 wrapper 的本地模式 `-HistoryReview`：db、migrationcoord、systembackupcontroller、migrationcatalog 四包测试全部通过，Linux 集成探针编译通过，输出 `LOCAL_PASS` 和 `CLEANED local-probe-build-cache=True`，并复核本轮 scratch 不存在。Longhorn 8 项、升级探针 4 项测试通过，三个 CheckOnly 模式在警告视为错误时通过。[本次验证与源码指纹](evidence/system-backup-d-build-lock-fix-local-20260929.json)。未下载依赖；远端六项 MySQL 场景仍待执行。

重试时只需第二条命令，显式参数与默认值等价：

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryReview -Remote -BuildParallelism 1
```

## 1. 现有 Longhorn 只读核验

在仓库根目录 PowerShell 执行：

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -LonghornReview
```

新增模式只调用 `kubectl get`，没有 exec、建卷、挂载、组件重启、宿主机检查或安装。沿用 namespace UID、MySQL Pod UID 与最近回执的 k8s-master node UID。确认身份后读取：

- longhorn-rwx 的 UID/resourceVersion、驱动、绑定/回收策略和选定非敏感参数；拒绝 migratable 或预置备份/镜像来源作为本次新报告卷候选。
- driver.longhorn.io 的 CSIDriver 和目标节点 CSINode 注册。
- 从 longhorn-manager Pods 发现唯一安装 namespace；筛选镜像/节点/Ready 元数据，不输出环境变量、Secret 或状态消息。
- Longhorn/CSI Deployment、DaemonSet 的期望/Ready 数和 observedGeneration；目标 Longhorn Node 条件、磁盘公开容量计数及三个容量调度设置。
- RequiredPackages、NFSClientInstalled、KernelModulesLoaded、MountPropagation、Multipathd 中已报告的非 True 条件单独列为需审查项，不以 Ready 覆盖它们。
- 收尾重新核对 namespace、节点、MySQL Pod、StorageClass 和 Longhorn namespace 身份。

结果始终保留 `dedicated_rwx_mount_permissions_and_freshness_not_tested`，退出 2 是已输出评审观察，不代表 RWX 验收通过。无法读取资源、安装 namespace 不唯一、缺 CSI、组件不 Ready 或资源漂移分别记录阻断，原始错误不回传。StorageClass 的名字不等于实际能力。

Longhorn RWX 通过 share-manager 提供 NFSv4 服务，需要客户端节点支持 NFSv4；这份只读探针不验证宿主机客户端，更不会安装它。拿到实际镜像版本及状态后再确定专用 PVC 的绑定、挂载、权限和新鲜度验证。[Longhorn RWX 官方说明](https://longhorn.io/docs/archives/1.9.1/nodes-and-volumes/volumes/rwx-volumes/)（机制参考，不能据此推定现场为 1.9.1）。

## 2. 历史账本兼容入口隔离 MySQL 验证

```powershell
.\scripts\system-backup-d-invariants.ps1 -HistoryReview -Remote -ExpectedAppDigest d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e
```

脚本用已有 Go 构建当前源码的 Linux 测试二进制，固定并校验 SHA-256，再复用已验证的 fresh-migration-smoke 创建 run-owned 临时 namespace/MySQL。fix16 仅用于该临时库的 93 文件初始重放；新的历史兼容逻辑来自本轮编译的探针，不声称 fix16 内含本轮代码。源安装只提供已安装 MySQL 镜像等公开环境信息，业务数据库不写入。

隔离阶段核对 namespace UID 和 migration-app 归属，停止该临时 app，写入临时库 run/UID/server UUID marker。测试仅连接该 Pod 的 127.0.0.1，marker 不匹配、账本不是完整 93 条、相关运行表/控制表有数据即拒绝构造 fixture。然后只在这套一次性环境删除空 runtime 表/080 fixture 账本、插入三条模拟历史记录，得到 95 条账本。

六项真实 MySQL 子场景：

1. 无审查材料时拒绝 95 条历史账本，运行表和账本不变。
2. 审查与目标 UUID 不匹配时拒绝。
3. 新增未审查额外记录时拒绝，不执行 DDL。
4. capture gate acquiring 时拒绝；解除后恢复到可迁移条件。
5. 审查匹配时执行 080，得到 96 条；既有 ledger 的 filename/id/applied_at 不变，四张表 SHOW CREATE TABLE 与之前 fresh replay 一致，旧原文中的检测 SQL 不被执行。
6. 成功后的再次执行保留整个账本和已写入的测试 reservation 数据。

所有历史 SQL、审查引用、身份记录都是隔离测试 fixture，不是实际旧 SQL 来源证据。此测试调用新 parser 和 ApplyPinnedMigrations，不替代 CLI 部署、实际库 schema 基线或部分 DDL 故障恢复验收。

期望输出包含 `TestDReviewedHistoryMySQL` 的六项 PASS、`PASS d-reviewed-history ... source=synthetic-isolated-mysql production-upgrade=false`，最后 namespace、远端传输目录、本地缓存均 CLEANED。失败时保留控制台日志和任何 CLEANUP_PENDING 身份；没有 PASS 就不登记远程通过。脚本只清理本轮创建且 UID 匹配的 namespace 和随机 scratch。

本地验证使用 `scripts/system-backup-d-history-validation.ps1`：默认单测、Linux migration runner 构建和带 integration tag 的 Linux 探针编译；编译成功不表示这六项已在 MySQL 执行。

本轮本地结果：Longhorn 7 项、升级探针回归 4 项、Bash 隔离/分派 3 项通过；db 包测试、Linux runner 与集成探针编译、两个只读模式 CheckOnly、PowerShell/Bash 语法检查通过。Bash 首次被沙箱阻止创建信号管道，最终在获准的本地测试环境运行通过；未连接集群。远端阶段在执行前还会核对必需测试名称存在，防止旧二进制零匹配返回成功。测试/构建产物已清理，未安装依赖。[验证记录及源码指纹](evidence/system-backup-d-longhorn-history-local-20260929.json)。
