# D 实际安装只读预检：首次现场输入采集

## 补充升级/存储只读结果（2026-09-29，操作者回传）

`-UpgradeReview` 已完成，exit=2 为预期 BLOCKED，不是脚本失败。12 项动态检查中 11 项通过，仅历史未知文件名检查失败；源目录、fresh schema 基线和存储/凭据三项是该探针保留的既有阻断，并非重新扫描后的新发现。完整结构化回执见 [升级与存储只读证据](evidence/system-backup-d-upgrade-review-live-20260929.json)。原始输出未带采集时间，未补造时间戳或独立远程验证。

- 当前目录仅 080 待应用；四张 runtime 表均不存在，没有观察到部分建表残留。
- users.id 为 InnoDB、signed int、NOT NULL、单列主键，满足本次 FK 前置检查。
- 活跃 capture gate 为 0，但本探针没有持有迁移锁；执行时仍须由 runner 在锁内检查。
- namespace、MySQL Pod/进程、数据库身份前后稳定；MySQL PVC/PV claim UID 匹配。
- 节点 k8s-master UID 为 `bc1fb478-0388-4f53-96b4-8d186301f6af`，hostname 标签同名，unschedulable=false、taints=[]。没有据此证明节点 Ready、资源充足或 NFS 客户端可用。
- MySQL PV hostPath 为 `/data/clawmanager-zhanghui08/system/mysql`；仍为独立业务卷，不作为报告卷。
- 全局已观察到 `longhorn`、`longhorn-rwx`、`longhorn-static` 三个 StorageClass，均为 driver.longhorn.io / Immediate。这更新了之前“全局 StorageClass 未查”的状态。

**存储方案调整：优先核验现有 longhorn-rwx，node-local 方案保留为备选。** 先只读检查实际 StorageClass 参数、驱动/Longhorn 运行状态与目标节点条件，再准备独立报告 PVC 的验证；最终须验收实际 RWX 绑定、消费者挂载/权限与报告新鲜度。StorageClass 名称和存在性不算能力通过，不能复用现有 workspace/MySQL 卷或直接启动 collector。

两端传输目录报告 CLEANED，本地自有 scratch 另查为 0。SSH close 警告没有中断此轮校验和清理回执；不需要重跑同一只读检查。本次没有应用 080、创建存储、运行新兼容入口、部署 HTTP 或完成本人 MFA/配置激活。

## 已收到的现场结果（2026-09-29 02:46 UTC）

操作者回传 exit=2，发现过程完成、准入 BLOCKED；namespace/数据库/Pod 前后身份一致，两端传输目录均报告清理，本地另查自有 scratch 剩余 0。已登记 [实际安装只读证据](evidence/system-backup-d-live-readonly-20260929.json)，未独立重新查询集群。

实际 MySQL 为 `mysql-66496b8965-d6tsl`（UID `dab1cbf6-ca49-4e16-bd2d-27e70da52004`），节点 **`k8s-master`**，不是隔离测试的 node1。数据库 `clawmanager`，UUID `f1f5f76a-95f5-11f1-b08e-366835b4a029`，MySQL 8.4.8，数据 PVC `mysql-data`，目录 `/var/lib/mysql/`。auto.cnf 属主 999:999、mode 640；这还不是 collector 容器读取权限验收。

| 现场事实 | 后续处理边界 |
| --- | --- |
| ledger 95 条，对照源码 93 条缺少 `080_add_system_backup_registration_runtime.sql` | D 准备固定 DB UUID/catalog 的 080 升级方案；本次未执行 DDL |
| 额外记录 `045_update_workbuddy_windows_runtime.sql`、`046_add_instance_pvc_name.sql`、`047_add_instance_runtime_variant.sql` | 既有 P0 inventory 已记录的历史差异；找回原文件/构建来源再核对，不删 ledger 凑 93 条、不代 A/B/C 批准业务 schema 等价 |
| D 表缺少 admin_revocations、admin_sessions、metadata_reservations、totp_credentials 四张 | 恰好对应 080 中四个 CREATE TABLE；补 080 仍不等于已有表的 columns/indexes/FK 无漂移 |
| 当前 namespace 四个 PVC 都是 hostPath，workspaces 虽声明 RWX 仍非共享报告卷候选 | 不能复用业务 workspace 卷。需确认现有 CSI/NFS 供给，或另行评审同节点专用卷方案；未查全局 StorageClass，不能断言集群没有共享存储 |
| 未发现 collector Pod，无当前 catalog 的可信 fresh schema reference | 完整 source/grant/报告新鲜度和 schema diff 继续阻断 |

仅补 080 后 ledger 预计为 **96 条（93 条当前记录 + 3 条历史记录）**，不能将数量当作完整兼容通过。现有只读门禁继续报告额外历史项，待来源与结构核对后再处理。

已把观察到的目标身份填入 `deployments/k8s/system-backup-capacity.zh-fix16.candidate.json`，collector 用户/UID、凭据 Secret、报告 PVC 仍保持未提供状态，生成器拒绝该候选。它不是可 apply 的清单，也不表明 fix16 已在实际安装部署；正式运行前还需重新确认 Pod/namespace/DB 身份没有变化。

下一步先完成历史迁移来源核对及 080 升级前置审查，再确定报告存储供给和 collector 专用运行身份。数据库升级、存储创建及 collector 部署各按可审阅的实际输入执行，不通过重复本次发现脚本消除这些阻断。HTTP、本人 MFA 与配置激活仍未完成。

## 入口与发现范围

fix16 的隔离恢复已通过。此次读取实际安装，不复跑隔离测试，不部署采集器，不运行 migration，不授权，不完成 MFA/配置激活。仓库目前只找到容量空模板和本地模拟输入，没有正式 `capacity.public.json` 或当前 catalog 的完整 fresh schema 基线。因此先发现并核对真实现场事实，缺项保持 BLOCKED。

由管理员在本机仓库根目录 PowerShell 运行：

```powershell
.\scripts\system-backup-d-live-preflight-remote.ps1 -CheckOnly
.\scripts\system-backup-d-live-preflight-remote.ps1
```

第二条由本人完成交互 SSH。默认目标 `root@10.130.14.23`、context `kubernetes-admin@kubernetes`、namespace `clawmanager-zhanghui08-system`。namespace UID 固定为已有身份回执中的 `337cfe30-2c17-4b8e-b32a-760778b8098e`；不匹配时停止，不自动接受新 UID。镜像引用固定为 fix16 digest `d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e`，不创建 Pod 来拉取该镜像。

本机使用已有 Node/OpenSSH/tar；远端只使用已有 python3/kubectl/tar/sha256sum 及 MySQL 容器里的 mysql/stat。缺工具就报错，不安装依赖。传输的脚本及公开期待值在独有 scratch 中运行，archive SHA 校验后执行；python 使用 `-B` 禁止生成字节码，finally 清理两端传输目录。Kubernetes 对象与数据库不写入。

回传内容包括：

- namespace、单个 Running MySQL Pod/UID/container/node 及前后稳定性。
- 实际数据库 UUID、库名、datadir、MySQL 版本；这是从已绑定 namespace 发现的身份，之后部署必须显式绑定，不等于已与正式配置比较。
- 数据目录 PVC/subPath、auto.cnf 属主 UID/GID/mode；不读取密码、auto.cnf 内容或替换文件权限，属主 UID 也不自动当作已验证可用的 collector UID。
- 93 个 migration 的完整文件名集合比较，45 个 D 表的存在性，D 列结构观察摘要。没有干净重放基线时，不声称 columns/indexes/foreign keys 无差异。
- namespace 内 PVC 的访问模式、Bound 状态、卷类型及 PV claimRef UID 匹配；符合 RWX/Filesystem/CSI 或 NFS 的只列候选，不能复用其它业务 PVC 或自动批准存储。
- 已有 collector Pod 的公开身份、运行阶段及镜像是否匹配 fix16；没有正式 source/存储/账号输入时不执行它的未知命令，也不替代已有完整预检的 grants/报告新鲜度验证。

脚本捕获完整资源 JSON 仅用于内存字段筛选，不输出 Pod 环境变量、Secret 数据、原始 SHOW GRANTS 或 SQL 错误。只读 SQL 的密码从既有 MySQL 容器环境传给 mysql，凭据不离开容器。

预期输出 `D_LIVE_PREFLIGHT_EXIT=2` 表示已拿到缺项报告，PowerShell 会继续清理，并明确输出 BLOCKED；不将清理阶段 SSH exit=0 当作准入通过。exit=1 或其它非零值表示脚本/传输失败。将 JSON、`D_LIVE_PREFLIGHT_EXIT` 和两条 `CLEANED` 一起回传，即可据真实事实组装后续容量公开输入。完整 source/grant/报告/schema diff 验证继续使用 `system-backup-d-runtime-preflight.mjs`，本发现阶段不替它出具 PASS。

本地验证：6 项内存模拟测试覆盖错误/不可读 namespace、错误库、ledger 失败仍采集独立存储信息、迁移差异、Pod 重启、RWX 候选不自动批准和输出去除敏感字段；没有连接远端或安装依赖。PowerShell 入口同时提供本地 CheckOnly。
