# A：当前 namespace 全量数据范围观察

2026-10-30 用户在本地仓库将 `scripts/system-backup-a-namespace-footprint.py` 经 SSH 标准输入发送至远侧，固定 namespace UID `337cfe30-2c17-4b8e-b32a-760778b8098e` 和 MySQL Pod UID `6d314752-86e1-41ce-9831-af03179dcf3b`，只读查询实例/持久卷关系与 Pod/PVC 元数据。远侧无仓库，不写文件、不读取业务数据值或密码。原始回传 `SSH_EXIT=0`；此处仅记录操作者回传摘要，不是数据一致性或备份成功证明。

| 当前实例 | 模式 / 状态 | 数据位置 |
| --- | --- | --- |
| 7、8 | Lite gateway / running / generation 1 | NFS `/workspaces/openclaw/user-1/instance-7`、`instance-8`；无实例 PVC |
| 11 | Lite gateway / running / generation 5 | NFS `/workspaces/openclaw/user-1/instance-11`；无实例 PVC |
| 12 | Pro desktop / stopped / generation 0 | `instances.pvc_name=clawreef-12-pvc`，workspace 路径为空；该 PVC 不在当前 namespace 清单，`persistent_volumes` 没有登记行。不能仅凭 generation 0 宣称数据不存在。 |

当前 namespace PVC：`mysql-data`、`minio-data`、`redis-data`、`clawmanager-workspaces`、`system-backup-capacity-report` 均为 Bound。当前运行 MySQL Pod 挂 `mysql-data`，MinIO Pod 挂 `minio-data`，`workspace-store` Pod 挂 `clawmanager-workspaces`。运行中的 `clawmanager-team-redis` 没有 PVC 挂载；`redis-data` 虽 Bound，初次观察没有任何当前 Pod 挂载。app、Hermes、OpenClaw Pod 也没有 PVC 挂载；其直接 NFS `/workspaces` 挂载见 [NFS 归属观察](system-backup-a-nfs-ownership-20261030.md)。

第二次只读观察补齐了卷类型与挂载路径：运行中的 `clawmanager-team-redis` 将 **`emptyDir` 挂在 `/data` 且可写**；已绑定的 `redis-data` PVC 没有运行 Pod 使用。MySQL `mysql-data` 挂 `/var/lib/mysql`，MinIO `minio-data` 挂 `/data`。当前 `workspace-store` 把 `clawmanager-workspaces` PVC 挂 `/exports/workspaces`，但 app、Hermes、OpenClaw 的实际 `/workspaces` 都直接挂 `10.107.165.245:/` 且可写；不能以本 namespace 的 workspace PVC 代替实际运行目录。MySQL 另有仅供测试 TLS 运行时的 `emptyDir`，不属于数据库持久卷。

这些是不同数据域：完整备份必须在一致性窗口覆盖现库、真实 Redis 状态、MinIO 对象及三个运行实例的 NFS 子树，并明确已停止实例 12 的旧 PVC/孤儿数据边界。Redis 的当前 `/data` 是 `emptyDir`：删除或替换 Pod 会丢失该卷，不能在捕获 Redis 前把它缩容/删除，也不能从未使用的 `redis-data` PVC 读取旧快照冒充现状。运行 Runtime 的 NFS 和本 namespace `workspace-store` 使用的 PVC 不是同一已证明的数据源。`system-backup-capacity-report` 的用途及保留边界也需按原业务事实判断。直接采整个共享 NFS export 或只采这三个目录都不能自动证明“当前 namespace 所有数据”。

工具本地四项离线测试 `py -3 -B scripts/system-backup-a-namespace-footprint.test.py` 退出 0，覆盖已停止实例与 PVC、重复/异常 SQL 行拒绝、Pod/PVC 输出不含环境值和非法身份拒绝。没有构建产物。该工具只观察，`ready_for_backup=false`；正式采集仍依赖 B/C 冻结 context、D 现库升级及全域 writer/停止证明、A KEK 准入与凭据接线。
