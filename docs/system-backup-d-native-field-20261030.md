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

## 隔离 slot/pool 探针

2026-10-30 同日又用精确 `d57b751e…` 镜像创建了独立临时 pool/slot Pod，未接入现有 Deployment 或实例。第一次 Pod 未就绪并已清理；第二次 Pod `d-native-probe-5a22ca78` UID `8584198e-c356-4c66-80ae-5d8269b0e0a8` 的 pool 正常运行，TLS 请求实际到达 Agent，但能力 GET 返回 503。slot 退出码 1，原日志为 `clock_reference_unavailable`：探针将控制面时钟 HEAD 地址设为不可达的 `127.0.0.1:9`。第二次的 Pod 与两个 Secret 删除退出码均为 0，未发送停止/恢复请求。[隔离探针](../scripts/system-backup-d-native-slot-probe.py)现改用 namespace 内 `clawmanager-gateway` 的时钟地址。默认只请求能力 GET；显式 `--synthetic-lifecycle` 才会在独立空工作区创建一次性测试进程并测试停止/恢复，结束时删除临时 Pod/Secret。此证据证明 TLS 路由可达，不证明 slot 能力或备份通过。

第三次一次性 Pod `d-native-probe-fd956c84` UID `620f34e5-298a-4988-b019-798e1cea70e1` 的 pool/slot 均就绪，实际 imageID 均为 `d57b751e…`。能力 GET 为 HTTP 200；原 JSON 绑定 namespace、Pod UID、`agent_epoch=d259a6f8dd23030b4f704ebbd6f8d1cf`、`slot-0`、端口 `20000`、`isolated-backup.v1`、`instance_pid_namespaces_and_mounts`、`supported=true`、`durable_reservation=true`、`agent_restart_reconciliation=false`。随后隔离测试 Gateway 的创建请求已发送，但进程进入 `error`；slot 原日志为 `bwrap: Failed to make / slave: Permission denied` 和 `gateway_process_exited`，因此**没有停止或恢复回执**。Pod 与两个 Secret 删除退出码均为 0。旧探针错误地保留 `capability_passed` 状态，使 `D_NATIVE_SYNTHETIC_LIFECYCLE_EXIT=0`；该退出码不代表生命周期通过，已由 `ec601991` 修为任何 `error` 返回 2。

第四次一次性 Pod `d-native-probe-acaa5cca` UID `a093f033-352e-480c-b274-987b73f8bde2` 仅提升 slot 容器的 sandbox 权限，禁用 ServiceAccount 自动挂载，pool/slot 均就绪且实际 imageID 均为 `d57b751e…`。能力 GET 仍为 HTTP 200，`agent_epoch=d9a6681f85a4fc5519c8da6895f3783a` 与该 Pod UID 一致；隔离测试 Gateway 创建后仍进入 `error`，slot 原日志改为 `bwrap: setting up uid map: Permission denied` 和 `gateway_process_exited`。没有停止或恢复回执；JSON 正确给出 `status=incomplete`、PowerShell 捕获退出码 2，Pod 与两个 Secret 清理退出码均为 0。现场只读 sysctl：`kernel.unprivileged_userns_clone=1`、`user.max_user_namespaces=8255801`、`kernel.apparmor_restrict_unprivileged_userns=1`；bwrap 为普通可执行文件。`aa-status | grep -i bwrap` 退出 1，近 30 分钟内核审计明确为 `apparmor="DENIED"`、`profile="unprivileged_userns"`、`name="proc/79/uid_map"`、`comm="bwrap"`。不得为推进测试直接放宽全宿主机限制或跳过 bubblewrap。

第五次将同一一次性探针固定到 `node1`：Pod `d-native-probe-fb3619c0` UID `f9511cd4-7406-44ee-8d2f-daf48d25214c`，两容器就绪、同一 `d57b751e…` imageID，能力 GET HTTP 200 且 `agent_epoch=7b2cf1c0c78952246147e1ae0665707f` 绑定该 Pod。隔离 Gateway 创建后，slot 仍报告 `bwrap: setting up uid map: Permission denied`，探针正确给出 `status=incomplete`、退出码 2；Pod 与两个 Secret 清理退出码均为 0。另一节点未绕开该限制，至此现场仍无一次正向停止或恢复回执。

节点为 Ubuntu 24.04.3，AppArmor parser 4.0.1；现场 `/etc/apparmor.d/bwrap-userns-restrict`、`/usr/share/apparmor/extra-profiles/bwrap-userns-restrict` 和 `/etc/apparmor.d/bwrap` 均不存在。根据 [AppArmor 上游 4.0 profile](https://gitlab.com/apparmor/apparmor/-/raw/apparmor-4.0/profiles/apparmor/profiles/extras/bwrap-userns-restrict) 准备了[临时测试 policy](../scripts/system-backup-d-bwrap-apparmor-4.profile)，本地 SHA-256 `e7b571fce332e968b75e14cad8b1b26d7ead3e34cb32f53f138a5d262aa67f2a` 与远端 `/tmp` 一致；远端 `apparmor_parser -Q -K` 退出 0，**未装载**。只在独立 Pod 测试期间装载、确认 Pod 删除后卸载和删除 `/tmp` 输入的[受控脚本](../scripts/system-backup-d-native-profile-probe.sh)仍待现场语法检查和执行。该 profile 暂时作用于节点上的所有 `/usr/bin/bwrap` 调用，不作为生产持久配置。

客户端修复 `16815597` 固定 pool CA/TLS 1.3 并拒绝明文 locator；`7c1951de` 进一步使备份专用 HTTP 调用在发送控制 token 前拒绝非 HTTPS，定向测试退出 0。原生 Dockerfile 完整镜像本地构建因 Docker Hub 匿名令牌连接超时而失败，未产生目标镜像；已使用本地私有仓库中精确旧基础镜像叠加的测试镜像进行隔离探针，不将其当作已验收的完整原生 Lite 镜像。

## 下一现场门槛

1. 先提供与当前实例、工作区和 NFS 归属兼容的 **完整** Lite slot/pool Deployment 方案，包含 pool/slot 进程、socket/账本持久化、Pod UID、端口块、控制凭据、原实例迁移和回退。只加 `RUNTIME_AGENT_ROLE=pool` 而没有 slot supervisor 不可用。
2. 在受控测试实例上核对新能力的 `protocol`、namespace、Pod UID、Agent epoch、port、`supported`、`durable_reservation` 和 `agent_restart_reconciliation=false`；只读脚本为 [`scripts/system-backup-d-native-capabilities.py`](../scripts/system-backup-d-native-capabilities.py)。
3. 现场库最后观测到 migration 080。先按独立的 [080 升级/导入方案](system-backup-d-legacy-source-upgrade-handoff-20260929.md) 在副本上验证；不直接升级现场库到 126/127。只有原配置密文、完整 participants/writers、B 原 callback、migration 126/权限和目标库全齐，才能在单测试实例上执行停止/恢复，并逐字节核对 Agent 原回执与 SQL `system_backup_v2_gateway_proofs`、恢复 PID/generation CAS。
4. KEK Store/原 bootstrap/config 事务接点见 [独立交接](system-backup-d-kek-persistence-locks-20261029.md)。缺 C 的历史覆盖 scanner/来源及 Job `PreparedReferenceChange` 时继续拒绝完整扫描和生产准入。

本地测试二进制、缓存、覆盖构建上下文和本地测试 overlay 镜像已清理。用户已清理两份 D: 归档和远端 `/tmp` 的两份归档/只读脚本，退出码 0；其他 owner 的共享工作区文件未清理。
