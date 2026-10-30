# A：共享 NFS 上当前 installation 的目录归属观察

2026-10-30 用户在本地仓库通过 SSH 标准输入执行 NFS 挂载、两库路径和实体目录三次只读盘点；远侧没有仓库。三次命令的 `SSH_EXIT=0`，没有创建远侧文件。Windows OpenSSH 在输出之后报告 `close - IO is still pending on closed socket`，但完整 JSON 与退出码已返回。本记录是操作者回传的观察摘要，不是备份授权或运行成功回执。

## 已观察的范围

- `clawmanager-zhanghui08-system` namespace UID `337cfe30-2c17-4b8e-b32a-760778b8098e`。当前 MySQL Pod `mysql-74bd777b8-j85z7`，UID `6d314752-86e1-41ce-9831-af03179dcf3b`。
- `clawmanager-ltt-system` namespace UID `6efd52c1-051e-41e8-bb0c-826d644c7787`。当前 MySQL Pod `mysql-64f5995659-n7jjw`，UID `15f547c4-9fc8-43e3-bfdc-24f3a519c91a`。
- 两边运行 Pod 均直接挂载 `10.107.165.245:/` 至 `/workspaces`，Kubernetes `subPath` 为空。当前 namespace 为 app、Hermes、OpenClaw 共 3 个运行 Pod；外部 `clawmanager-ltt-system` 有 11 个匹配运行 Pod。`clawmanager-ltt-github-system` 当前没有匹配运行 Pod，但有可重新创建的模板；它也不能被自动纳入备份范围。
- 当前库 `instances` 与 `instance_runtime_bindings` 一致登记 3 个运行目录：`/workspaces/openclaw/user-1/instance-7`、`.../instance-8`、`.../instance-11`。实例 12 停止，两个路径均为空；其数据范围尚须从原业务事实确认。
- 外部库已登记的非空路径与上述 3 个路径无相等或父子目录重叠。外部库也有多个运行实例路径为空，因此“无数据库登记路径冲突”不等于“共享 NFS 可安全采集”。
- 随后的只读 `stat/readlink`（`scripts/system-backup-a-nfs-path-observe.py`）固定 app Pod UID `aabba383-5db9-48a7-a3b7-2b92624c2f3a`，确认三个候选路径都实际存在且不是顶层符号链接；设备号同为 `86`，inode 分别为 `105775331`、`105775467`、`105775316`。目录模式均为 `750`；UID/GID 分别为 `200007:1000`、`200008:1000`、`200011:200011`。原始挂载根为 `86:98047217`。该命令退出 0，未扫描目录内部符号链接，也未证明无别名或外部 NFS 客户端。
- 后续只读 PV 元数据确认同一 installation 的子 namespace `clawmanager-zhanghui08-system-user-1` 还有团队共享卷 `clawreef-team-3-shared`，其 NFS backend 为 `10.107.165.245:/teams/user-1/team-3-shared`、10Gi，PV reclaim policy 为 Retain。它不在上述三个实例子树中，不能因为根 namespace 的 Pod 清单未出现该卷而忽略。再次执行 `scripts/system-backup-a-nfs-path-observe.py` 固定同一 App Pod UID，现场 `SSH_EXIT=0`：根 export 挂载对应的 `/workspaces/teams/user-1/team-3-shared` 存在，设备/inode `86:98468919`，目录模式 `2775`，UID/GID `200007:1000`，`readlink -f` 仍为该准确路径。未扫描内部符号链接或证明团队目录没有其他写入者。

只读工具为 [`scripts/system-backup-a-workspace-ownership-inventory.py`](../scripts/system-backup-a-workspace-ownership-inventory.py)。它用固定的 namespace/Pod UID 对两边 `instances` 与 `instance_runtime_bindings` 做 SQL 查询，前后复查 UID，仅输出实例 ID、用户 ID、类型、状态与路径；密码只在 MySQL 容器内环境变量中传给客户端，不输出、不落盘。没有更改数据库或 Kubernetes 对象。本地 `py -3 -B` 语法和目录重叠检查退出 0；未生成字节码或构建产物。

## 接入完整备份前仍须完成

1. 核对三个实例目录及团队共享目录内符号链接、实例 12 的已绑定 Longhorn PVC 内容范围，以及未登记或历史目录。不能采集整个共享 export，也不能从三个当前实例路径推断当前 installation 的所有数据只包含它们。采集/恢复须保留上述 UID/GID/mode，并禁止路径逃逸。
2. 将 installation、精确 NFS export 与这批目录的原业务归属固定在采集计划；核对所有可写入者和停止屏障。外部 installation 的 11 个运行 Pod 不可被当前 namespace 的普通备份操作停止；若其可写入上述目录，必须拒绝备份并先解决数据归属。
3. 完整备份还需当前库、Redis、MinIO、配置及 Runtime 原件的一致性捕获。当前现库迁移仅到旧 `080`，D 的版本化导入升级尚未完成；`PublicCapability` 仍声明 `acceptance_ready=false`，production `workspaceInvocation` 没有正式 `ProviderKey`。本记录不能作为 generate/unwrap、撤销或完整备份验收。

优先顺序是明确真实数据边界、完成现库导入升级及全域 writer、冻结 B/C context 与正式密钥/签名接线，然后做一次当前 namespace 的完整备份和隔离恢复验证。最终验收覆盖当前 namespace 的全部数据，不以单实例或空白库试验替代。
