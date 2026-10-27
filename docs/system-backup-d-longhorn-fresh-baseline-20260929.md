# D：Longhorn 异常明细与 fresh schema 基线入口

**最新回执已接收：隔离 RWX 挂载验收通过；fresh 基线采集通过，保持未审批候选。两项 Longhorn 异常已定位但未解除，正式报告卷及真实容量准入尚未验收。** 操作者已完成交互 SSH。没有安装依赖、修改宿主机服务、加载内核模块、升级业务库或激活配置。

## 最新挂载回执：PASS_ISOLATED_RWX，清理完成

[本轮现场回执](evidence/system-backup-d-rwx-mount-live-20260929.json)返回 `PASS_ISOLATED_RWX`、`D_LIVE_PREFLIGHT_EXIT=0`，8 项检查全部通过：writer Ready、健康附着与 Ready share-manager、两节点同 run 的新鲜报告持续推进、UID999/GID65532/0640、两个只读挂载拒写、停止 writer 后报告过期、附着身份稳定和目标身份稳定。

本轮 namespace `sbk-rwx-bcf65ad7e2f94ec1aef1` / UID `dbb3e1d9-b165-4c85-bbc7-af7a602aa874`；PV/Longhorn Volume 为 `pvc-d475f9ae-2388-44b7-8bff-a5fa48cb6b83`。writer 在 k8s-master，实际健康附着与 share-manager 在 node1。完整 PVC/PV/Volume/node/share-manager UID 已归档。回执报告同一 namespace UID 清理、PV/Volume 已不存在，以及远端和本地 scratch 均 CLEANED。

前检再次观察到 master 上 20 个 Longhorn 块设备拓扑读取完整、无 multipath holder，活动 mpath map 数为 0；dm_crypt 模块文件存在，但条件仍报告未加载。此次仅按已审查的非加密 V1 范围完成实测，`source_conditions_cleared=false`，不代表解除告警或可停用 multipathd；master 的宿主机诊断不作为 node1 的独立诊断。

证据来源为操作者粘贴的完整回执；D 核对了附件 SHA-256、JSON、8 项检查、退出码和匹配 namespace UID 的清理标记，没有独立重查远端。**无需重跑隔离 RWX 或 fresh。** 下方失败及修复说明均为历史记录。

### 正式报告链路仍需补齐的输入

当前 `system-backup-capacity.zh-fix16.candidate.json` 的 `report_pvc`、`collector_db_user`、`credentials_secret` 为空，`collector_uid=0` 是未填写值，不能直接部署。临时 RWX 卷已经删除，不能将其身份填作正式报告卷。下一步需绑定正式独立报告 PVC、核实能读取 MySQL auto.cnf 的实际非 root UID、专用最小权限账号及 Secret 引用，再按容量部署文档验收真实 collector 与 HTTP/bootstrap。密码或 DSN 不进入公开候选文件。

fresh 摘要已保留，但原始 schema records 已由采集入口清理；该摘要不能冒充部署预检所需的完整 `fresh-reference.json`，也不证明生产 schema 等价。需要逐项比较时应准备可信记录或受控现场比较，不能用生产库与自身比较。旧 SQL 来源/语义审查和真实 080 升级仍保持独立门槛。本次明确保留 `production_report_volume_accepted=false`、`actual_capacity_admission_tested=false`，未审批或注册 fresh 基线。

## 上轮挂载回执：健康卷附着在 node1，探针错误要求 master

[现场回执](evidence/system-backup-d-rwx-attachment-live-20260929.json)：namespace `sbk-rwx-50a771ae8e5149258e2a` / UID `e1560b36-d6ed-41cf-8f4d-7c0024e79a49` 已创建；PVC/PV/Longhorn Volume UID 均记录。StorageClass 的额外参数确认为空 fromBackup，本轮前检通过。故障快照显示 writer 在 k8s-master / Running，卷在 node1 / attached / healthy，shareState=running；最终 namespace、PV、Longhorn Volume、两端 scratch 均报告清理。

探针 `healthy()` 错误地要求 volume.currentNodeID 和 share-manager nodeName 都等于 writer 节点 master，这会拒绝本轮这种健康的跨节点 RWX 布局。RWX 使用独立 share-manager 提供 NFSv4 服务，不能要求它与客户端同节点：[Longhorn v1.12 RWX 文档](https://longhorn.io/docs/1.12.0/nodes-and-volumes/volumes/rwx-volumes/)。旧 failed_phase=mount-writer 同时覆盖 writer Ready 与 share-manager 等待，本回执没保存 Ready 条件，不能把 Running 直接提升为全部挂载/写入验证通过。

已修复：附着节点允许本次两台已验证 Ready/客户端依赖/UID 的节点之一，记录实际 node UID/share-manager UID。要求同一 Volume UID、attached/healthy、share-manager 与实际附着节点一致且 Ready，并在结束时核对附着身份保持稳定；降级、未 Ready、第三节点、UID 漂移仍拒绝。master 宿主机设备诊断不会被标记为 node1 的独立诊断，输出明确记录诊断范围。本模式只证明本次临时卷的读写链路，不认证另一节点全部存储配置。

阶段细分为 `wait-writer-ready` 与 `wait-share-manager`，逐阶段记录检查项，避免再次只有笼统 timeout。本地14项挂载测试及 CheckOnly 通过，新增 writer/master + attachment/peer 的完整流程和异常附着拒绝测试；[验证记录](evidence/system-backup-d-rwx-attachment-fix-local-20260929.json)。现场读写、权限、新鲜度及过期检查仍未完成，继续使用同一 `-ReportMountProbe` 命令，不调整集群调度配置，不重跑 fresh 基线。

## 首次挂载入口回执：StorageClass 前检拒绝，未创建资源

[本次现场回执](evidence/system-backup-d-rwx-preflight-live-20260929.json)显示 `failed_phase=preflight`、`failure=unreviewed_storageclass_parameters`、`cluster_mutated=false`、checks 为空。没有 RWX_RUN、没有建 namespace/PVC/Pod，也没有实际挂载动作；两端传输目录 CLEANED。不能把它解释为 Longhorn 挂载失败或验收通过。

设备主次号解析修复已在现场生效：20 个 Longhorn 块设备读取完整、均无 multipath holder，当前 mpath map 数为 0，有效配置 hash 未变。这只代表本次所观察到的设备状态，不是停服务许可。

检查发现 D 自己的参数白名单漏掉了仓库默认 `longhorn-rwx` 中的 `fromBackup: ""`；空值不请求恢复，却会被原白名单拒绝。现场旧回执未记录被拒绝的键，**因此它是已复现的兼容缺口和本次阻断候选原因，尚不能断言现场唯一多余参数就是 fromBackup**。

已只允许 fromBackup 缺省或精确空字符串，继续拒绝非空恢复源、未知参数和非 ext4 profile；新建 Volume 也检查 fromBackup/backingImage/dataSource 为空。新增输出 `storageclass_parameter_review`，包含参数名、未审查参数名和 fromBackup 的空值状态，不输出备份 URL 或未知参数值。无须调整现场 StorageClass 或放宽成任意参数可通过。

挂载入口12项本地测试通过（含仓库实际 YAML 中的参数集、带空 fromBackup 的完整模拟挂载流程、非空源拒绝和未知键脱敏输出），CheckOnly 通过；[验证及源码指纹](evidence/system-backup-d-rwx-sc-fix-local-20260929.json)。没有安装依赖或遗留测试产物。下一步仍用下方同一 `-ReportMountProbe` 命令，无须再单跑只读诊断或 fresh 基线。

## 07:18 UTC 明细与下一步挂载实测

[最新宿主机存储明细](evidence/system-backup-d-longhorn-storage-live-20260929.json)确认 `dm_crypt_module_file_available=true`，因此不能据此要求安装依赖。multipath 有效 blacklist 包含 `^sd[a-z0-9]+`，devnode exceptions 为空，其余 exception 计数为 1。同类例外才覆盖相应 blacklist，WWID/property 例外不能替代 devnode 例外：[Red Hat Multipath 说明](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html-single/configuring_device_mapper_multipath/index)。这支持按 sd 设备排除规则继续限定的隔离测试，并不表示应停用 multipathd。

该回执 `active_multipath_map_count=0`，但 `block_topology_read_complete=false`，不能判定全部设备无冲突。探针存在路径解析缺口：`/dev/longhorn/<volume>` 可以是直接 mknod 的块设备，不能用它的 basename 在 `/sys/class/block` 找真实内核设备。现已改为 `st_rdev` 主次设备号 → `/sys/dev/block/<major>:<minor>`，并加回归测试；现有回执不足以证明这就是现场读取不完整的唯一原因。修复后的检查已直接合入挂载入口，不要求另跑只读入口。

在仓库根目录执行：

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -ReportMountProbe
```

这个模式会创建随机 `sbk-rwx-*` 临时 namespace、16Mi RWX PVC 和三个测试 Pod，复用已观察的固定 MySQL 镜像中的 shell 工具，不启动 MySQL、不安装依赖。它不是只读模式，但不访问业务 PVC、不修改宿主机服务或配置、不加载模块。

仅允许 V1、非加密、双副本的现有 `longhorn-rwx` profile；未知 SC 参数、未核验失败条件、拓扑不完整、现有 multipath holder 冲突、devnode 例外都会在建卷前阻断。新卷绑定后再次核对实际 Longhorn Volume 的 dataEngine/encrypted/副本数。`dm_crypt` 的例外只限本次非加密 V1 测试，不清除 Node 告警，不泛化为加密卷可用。StorageClass 的默认参数与加密说明参见 [Longhorn v1.12 文档](https://longhorn.io/docs/1.12.0/references/storage-class-parameters/)。

writer 在已核验的 k8s-master；实际 volume/currentNode 与 Ready share-manager 需在本次两台已核验节点之一，二者节点一致且卷健康，不要求与 writer 同节点。只记录真实附着身份，不将 master 的宿主机结论套给 node1。两个只读消费者分布在 master 和另一可调度、NFS/包/挂载传播条件合格的 Longhorn 节点，并核对实际 nodeName。UID999/GID65532 写入本轮专属目录，文件0640；消费者 UID65532/GID65532。root 初始化仅操作这个临时卷的 `/report/probe`，无 MySQL fsGroup/chown。

测试验证两端读到同一 run、序号推进、报告年龄≤5秒、权限以及写入返回只读文件系统错误；停止 writer 后验证报告过期。这里的 reader 是模拟 HTTP/bootstrap 身份的 shell 探针，过期判断由探针执行，**不冒充真实 HTTP/bootstrap 或容量准入已验收**。

无论成功失败，核对本轮 namespace UID/run 标签后清理 namespace，并等待 PV/Longhorn Volume 消失；不删 finalizer、不手动删除其它集群资源。返回 `PASS_ISOLATED_RWX` 且 `cleanup_verified=true` 才计入隔离存储测试通过。正式报告 PVC 和真实 collector→HTTP/bootstrap 准入仍需后续验收，`production_report_volume_accepted` 与 `actual_capacity_admission_tested` 保持 false。若输出 `CLEANUP_PENDING`，回传其精确身份，不能继续视为已清理。

本地诊断17项、挂载流程9项与 CheckOnly 通过，包含设备主次号映射、拒绝加密卷、只读写入失败、失败后清理和 UID 漂移拒绝清理。见[验证记录](evidence/system-backup-d-rwx-mount-local-20260929.json)。这些是 mock/本地验证，现场挂载尚未运行。

## 07:09–07:10 UTC 现场回执

- [Longhorn 宿主机回执](evidence/system-backup-d-longhorn-host-live-20260929.json)：34 项检查中 32 项通过；失败的两项就是 Multipathd、KernelModulesLoaded。k8s-master 身份匹配，multipathd.service/socket active，status 命令成功；缺失模块明细仅 `dm_crypt`，sysfs 也未发现它。V1=true、V2=false，`iscsi_tcp`、`nfs` 存在、iscsid active。异常条件的 lastTransitionTime 是状态转换时间，不能据此认定上次检查发生于六月。目标/SC 身份稳定，两端 CLEANED。
- [fresh schema 回执](evidence/system-backup-d-fresh-schema-live-20260929.json)：MySQL 8.4.8，零表起点，93 个 migration 完整重放，99 张表且无其它对象，停止临时写入者后两次采集一致。canonical hash 为 `252611190c9d2cc4e02959ec5443709e78e55687773bb7afc3647eb45c0cea44`，canonical bytes=614616。namespace `sbk-mig-260929071009-6c8a` / UID `7b90fd5b-c2c0-4bf3-86c3-33129a472c26`、远端 scratch、本地 scratch 均报告清理。
- D 接收时再次核对当前迁移文件名/catalog、建库 SQL、采集 SQL 指纹与 99 对象数量。原始元数据已由操作者入口清理，D 本次仅收到回执，不能声称再次独立重算 schema hash 或现场验证清理。原附件 SHA-256 记录于归档 envelope；不把附件 hash 与回执内部的私有 transcript hash 混为一谈。Windows SSH 的 pending socket 提示没有使本轮入口报失败；以上结论以完整回执及清理标记为依据。

fresh 不需要重跑；它仍不证明生产库等价或旧 SQL 语义，未审批、未注册。当时的下一步（现已回传，后续以本页顶部挂载入口为准）是补 multipath 当前设备映射/有效排除规则，以及 `dm_crypt` 是否已有模块文件。已加只读 `-HostStorageDetails`，输出 sysfs 的 mpath map 数量、现有 Longhorn block device 的 multipath holder、脱敏的有效 blacklist/exception devnode 规则与其它规则数量，以及 modinfo 可用性。它不执行 modprobe、不停服务、不改配置；没有现有映射也不自动判定可以停服务或未来新卷一定被排除。

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -LonghornReview -HostDiagnostics -HostStorageDetails
```

新增检查是为了将报告卷前的宿主机处理收敛成具体方案，不能用 `Multipathd=False` 直接推导“停服务”，也不能用 `dm_crypt` 缺失直接推导“需安装依赖”。StorageClass 参数补采 `encrypted`；非加密卷是否适用仍需结合实际新卷字段验证。

## 原始采集入口（已执行，保留作复现）

在仓库根目录 PowerShell 依次运行；密码只在 SSH 提示处输入，不回传：

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -LonghornReview -HostDiagnostics
.\scripts\system-backup-d-fresh-baseline-remote.ps1
```

第一条只读，保留 `BLOCKED` / exit=2 是预期行为：输出异常证据并明确尚未验收挂载。请回传完整脱敏 JSON 和两端 `CLEANED`。第二条与 Longhorn 无依赖，使用临时 namespace 内的 emptyDir MySQL；不会挂载业务卷。输出 fresh replay PASS、namespace 清理、两端 scratch 清理及最终基线 JSON。任何失败或 `CLEANUP_PENDING` 都不能当成功，需保留清理目标身份。

## 两项异常的含义与补采范围

按现场 manager 标签对应的 [Longhorn v1.12.0 环境检查源码](https://github.com/longhorn/longhorn-manager/blob/v1.12.0/controller/monitor/environment_check_monitor.go)：

- `MultipathdIsRunning` 来自 `multipathd show status` 的非空响应。这是风险提示，不证明报告卷已被 multipath 占用。实际设备映射/排除规则仍需结合卷设备核对，不能直接停用可能承载其它存储的服务。
- `KernelModulesLoaded` 检查 `dm_crypt`；启用 V2 时还检查 `vfio_pci`、`uio_pci_generic`、`nvme_tcp`。源码也检查内建内核配置。不能从此条件推断缺少 `iscsi_tcp`，也不能仅凭 `/proc/modules` 没出现某模块认定不可用。

新版探针保留条件时间、从固定格式 message 中提取白名单模块名、读取 V1/V2 设置及 StorageClass 显式 dataEngine。未知 message 不输出原文也不判定通过；StorageClass 未声明引擎时仍待新建卷的 `spec.dataEngine` 验证。缺少依赖条件同样记为未知阻断。

`-HostDiagnostics` 只有在 SSH hostname 与已绑定 Kubernetes node 的 hostname 标签相同时读取 `/sys/module` 和服务状态。sysfs 仅证明模块存在（已加载或内建），不替代完整内核配置检查。仅当 multipathd.service 已 active 才运行只读 status；否则不触碰 socket。所有输出不包含原始服务错误或设备列表。Longhorn 条件仍不自动清除：控制器观察可能滞后，需结合宿主机信息判断。

## 报告卷挂载验收的下一道门

隔离 RWX 已按本页最新回执通过，两项 False 仍保留。下面的完整链路要求用于正式报告卷；若需修改宿主机，应先给出具体影响与修改方案，不自动安装组件或停服务。

挂载验收需验证同一个专用报告 PVC 的完整链路，不能用已有业务卷或临时单 Pod 的 Ready 代替：

1. 绑定 PVC/PV/Longhorn Volume UID，确认独立 `longhorn-rwx`、RWX、Filesystem、实际 dataEngine、双副本健康、share-manager Ready；确认选定消费者节点的客户端与依赖条件。
2. 确认 collector 实际 UID 与组 65532；只在专用报告根目录设置权限，禁止对 MySQL 卷设置 fsGroup/递归 chown。
3. 单写者原子更新 run/sequence/time 标记，HTTP/bootstrap 两个只读消费者验证权限和持续更新；至少跨两个已核验的节点验证 RWX，且逐个核对实际 Pod nodeName。测试标记不能成为正式 capacity 报告。
4. 消费者应读到不超过 5 秒的新报告；停止写入后验证过期拒绝，以及只读挂载无法写入。最终仍需用真实 collector 产生的报告验证业务准入。
5. 精确删除本轮探针和测试标记，检查 PVC/PV/Longhorn 资源归属及清理状态；正式报告卷如被创建应明确保留身份，不能套用 namespace 大范围清理。

这是正式报告链路的验收顺序，**不是可直接 apply 的清单**。隔离 RWX 已覆盖临时卷上的存储行为，但不能替代正式 PVC 和真实 collector/消费者的准入验收。

## fresh 基线的可信边界

新入口固定已提供的 fix16 digest，先核对 source namespace UID，仅从源安装读取 MySQL 镜像及版本。临时库使用仓库 `deployments/mysql/000_database.sql`，严格只允许建库语句，验证迁移前零表；不复制现场 ConfigMap 中的建表/种子 SQL。重放后校验完整文件名账本，并读取同一固定镜像内独立 migration runner 的 `--catalog-only`，绑定当前 93 文件 catalog。

捕获前核对临时 namespace UID/run 标签、MySQL Pod UID、emptyDir 及镜像，拒绝任何 PVC/hostPath；只停止该临时 namespace 的 migration-app。随后两次采集只读 schema 元数据，核对记录集合一致、server UUID、账本、Pod/namespace 身份稳定。

远端无新依赖要求（使用已有 Python3），原始元数据只通过 SSH 传到本轮私有 scratch。本机现有 Node 重算 canonical hash，核对传输 SQL/建库 SQL/迁移目录指纹和当前 registry 完整对象清单。namespace 清理标记匹配且 SSH 成功、两端 scratch 清理成功后才显示脱敏回执。测试输出/原始元数据会删除，保留用户回传的摘要可作为后续接收材料。

输出固定 `candidate_not_approved`、`registered_evidence=null`、`approved_reviewers=[]`。这是可追溯、可本地重算的操作者采集链，不是签名证明或运行时 evidence 注册；canonical hash 覆盖合同定义的结构字段，不冒充所有 SHOW CREATE TABLE 属性。它不证明实际旧 SQL 语义、不完成 production schema 差异校验、不放行 080/HTTP/MFA/配置激活。现场 fresh 值只能由实际运行产生，仓库没有写入虚构 hash。

本地回归与文件指纹见 [本轮验证记录](evidence/system-backup-d-longhorn-fresh-local-20260929.json)。
