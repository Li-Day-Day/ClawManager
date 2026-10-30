# D native Runtime 现场核验（2026-10-30）

状态：**Agent 镜像字节已核对；现场停止、恢复和 SQL 正向证明未通过，`backup_ready=false`。** 本记录不把 KEK Store 的独立交付混入 Runtime 验收。

## 固定输入与本地回归

- `AgentsRuntime` 本地源码为 `52f47fcaaaa52023b148043e0810d27d6f7f7ca0`，两份补丁已应用；Linux/amd64 `go test ./gateway ./slots -run Backup -count=1` 退出 0。Agent 自身重启后的自动接管仍未实现，备份预留保持隔离。
- 本地 Go 1.26.1 构建的 OpenClaw Agent SHA-256 为 `a0f72cdd0d87f7f5039f14074694075934a3c6e19ffdd952afae25c761049443`；Hermes Agent 为 `9170b9e7879a870ae0f7021e2eeade22d5e9dfd181202a2b37da1196eb95bfdf`。两者内嵌源码 revision，`CGO_ENABLED=0`、`linux/amd64`。
- 当前 OpenClaw Pod 原始镜像 manifest 为 `37c43ba05ff7fd4f0949f274fc67c3e9825f6d3d0f9124b5fc45dc8366c39cee`；Hermes Pod 为 `6688834a944161d8dada995cdffd90781533b24ab1e75bb2182c46eaee3fb52c`。Hermes 的 `2026.7.1` 标签已指向另一 manifest `c7e5c3f682f80efc306bdf7243c5624f890663868c87477084437c224045e7bb`，不能用标签替代运行中 Pod digest。
- 从远端导出的双镜像归档两端 SHA-256 均为 `7ef60574af883978cbe3b31cf77285ec2b8d527d447ecebdc935ea89cc633641`；精确 Hermes 归档两端均为 `25244aa4d99de52ae7f664b716b02552fc66e8b4b2fba0e87683ca6d3e1d8fc7`。

## OpenClaw 受控滚动及反证

本地以原 `37c43ba…` manifest 构建了只替换 `/usr/local/bin/clawmanager-agent` 的 OpenClaw 镜像，推送到私有仓库的唯一测试标签 `d-native-52f47fc-20261030`，仓库返回 manifest `d57b751e4790ed8e9af5efca4f230de32762982d7e04fd65819c6b603377d34f`。镜像内 Agent 文件 SHA-256 与本地二进制逐字节相同。

用户在测试 namespace `clawmanager-zhanghui08-system` 更新 `openclaw-runtime`，滚动退出 0。新 Pod `openclaw-runtime-68fb6b794-srrjd` UID `291fa50c-da18-4fb3-83af-9765f1bc9146` 就绪，实际 imageID 为上述 `d57b751e…`。Pod 内 `/usr/local/bin/clawmanager-agent` SHA-256 仍为 `a0f72cdd…`，实际有 `clawmanager-agent` 进程。只读、携原 app control token 的 `/v1/backup/capabilities` GET 返回 **404**；没有发送任何停止、恢复或其他 mutation。

原因已由运行配置和源码共同定位：现场 `RUNTIME_AGENT_ROLE` 不存在（`printenv` 退出 1），实际走旧共享 Agent 模式。新备份路由在 `slots.Worker`/`slots.Pool`，需要隔离 slot 生命周期、稳定账本和 slot supervisor；旧 Webtop 基础镜像的 `/init` 及现有 Deployment 没有这些角色/slot 进程。仅叠加二进制不能使旧部署获得隔离停止证明。不得把 404、旧进程退出、Deployment 滚动或 DELETE 当成正向停止证明。

用户随后将 OpenClaw Deployment 更新回原 `37c43ba…` 精确 digest，滚动退出 0；新 Pod `openclaw-runtime-bcc5bdc77-f9kbz` 就绪，实际 imageID 已复核为原 digest，退出码 0。Hermes 没有部署测试覆盖镜像；发现启动模式不相容后，本地未完成的旧基础镜像导入已结束，不会把漂移标签包装成现场版本。

## 下一现场门槛

1. 先提供与当前实例、工作区和 NFS 归属兼容的 **完整** Lite slot/pool Deployment 方案，包含 pool/slot 进程、socket/账本持久化、Pod UID、端口块、控制凭据、原实例迁移和回退。只加 `RUNTIME_AGENT_ROLE=pool` 而没有 slot supervisor 不可用。
2. 在受控测试实例上核对新能力的 `protocol`、namespace、Pod UID、Agent epoch、port、`supported`、`durable_reservation` 和 `agent_restart_reconciliation=false`；只读脚本为 [`scripts/system-backup-d-native-capabilities.py`](../scripts/system-backup-d-native-capabilities.py)。
3. 现场库最后观测到 migration 080。先按独立的 [080 升级/导入方案](system-backup-d-legacy-source-upgrade-handoff-20260929.md) 在副本上验证；不直接升级现场库到 126/127。只有原配置密文、完整 participants/writers、B 原 callback、migration 126/权限和目标库全齐，才能在单测试实例上执行停止/恢复，并逐字节核对 Agent 原回执与 SQL `system_backup_v2_gateway_proofs`、恢复 PID/generation CAS。
4. KEK Store/原 bootstrap/config 事务接点见 [独立交接](system-backup-d-kek-persistence-locks-20261029.md)。缺 C 的历史覆盖 scanner/来源及 Job `PreparedReferenceChange` 时继续拒绝完整扫描和生产准入。

本地测试二进制、缓存、覆盖构建上下文和本地测试 overlay 镜像已清理。用户已清理两份 D: 归档和远端 `/tmp` 的两份归档/只读脚本，退出码 0；其他 owner 的共享工作区文件未清理。
