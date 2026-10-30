# D native Runtime 现场核验（2026-10-30）

状态：**隔离测试 Pod 的 Agent 正向停止与恢复已通过；生产控制器、SQL 证明表及完整备份仍未现场验证，`backup_ready=false`。** 本记录不把 KEK Store 的独立交付混入 Runtime 验收。

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

节点为 Ubuntu 24.04.3，AppArmor parser 4.0.1；现场 `/etc/apparmor.d/bwrap-userns-restrict`、`/usr/share/apparmor/extra-profiles/bwrap-userns-restrict` 和 `/etc/apparmor.d/bwrap` 均不存在。根据 [AppArmor 上游 4.0 profile](https://gitlab.com/apparmor/apparmor/-/raw/apparmor-4.0/profiles/apparmor/profiles/extras/bwrap-userns-restrict) 准备了[临时测试 policy](../scripts/system-backup-d-bwrap-apparmor-4.profile)，本地 SHA-256 `e7b571fce332e968b75e14cad8b1b26d7ead3e34cb32f53f138a5d262aa67f2a` 与远端 `/tmp` 一致；远端 `apparmor_parser -Q -K` 退出 0。只在独立 Pod 测试期间装载、确认 Pod 删除后卸载和删除 `/tmp` 输入的[受控脚本](../scripts/system-backup-d-native-profile-probe.sh)已通过现场 `bash -n`。该 profile 暂时作用于节点上的所有 `/usr/bin/bwrap` 调用，不作为生产持久配置。

第六次受控脚本的远端三份输入与本地哈希一致、`bash -n` 退出 0；它临时装载 `bwrap` 和 `unpriv_bwrap` 两个 profile 后创建 Pod `d-native-probe-4ed4d969` UID `340d863b-214b-4c94-a34c-771f13ad938f`。两容器就绪，实际 imageID 为 `d57b751e…`，能力 GET 为 HTTP 200，`agent_epoch=f79e4721002f1a22ee94eba444380303`。bwrap 已越过此前的 UID map 阻断；新错误是测试命令 `python3 -m http.server` 不接受 Agent 自动补上的 `--auth trusted-proxy`。没有停止/恢复回执。Pod 与两个 Secret 删除退出码均为 0；受控脚本退出 2，随后 `aa-status | grep -i bwrap` 退出 1，证实临时 profile 已卸载。探针现将一次性 HTTP server 改为 Python `-c` 参数模式，待复测。

第七次使用已提交的 Python `-c` 测试命令和同一精确镜像 digest。受控脚本加载临时 profile 后，独立 Pod `d-native-probe-eb455701` UID `bd23c220-cb3d-445b-9f36-ef3d486d5226` 的 pool/slot 均就绪，实际 imageID 均为 `d57b751e…`。TLS 1.3 能力 GET 返回 HTTP 200；Agent epoch 为 `8af4e2bd935bb37e018c5572b3e95da8`，namespace、Pod UID、端口和确认范围均与请求匹配。一次性测试 Gateway 原 PID 为 **78**，Agent 返回 `state=stopped`、`confirmation_scope=instance_pid_namespaces_and_mounts` 的正向停止回执；恢复后返回 `state=resumed`、新 PID **87**，complete 回执与恢复回执 SHA 一致。探针比较回执内完整 request 与发送值、原 generation 1、恢复 generation 2 的 restart SHA，并保留原回执字节的 base64 与 SHA-256：stop `0da22dadb8bfa9f4705befb24e32db73afe9af1313875c6ab39013d6a16bdafb`，resume 和 complete 均为 `42c12aa12c424f5a8dd942471e4ae020fbd33153c66c2097ecb3ee591671fcc7`；restart JSON SHA-256 `8344b2ac0964fc3f198aa5d6f8899ef783a7789f98a0923e08ca4b168f654f26`。现场 JSON 状态为 `synthetic_lifecycle_passed`，`D_NATIVE_PROFILE_PROBE_EXIT=0`、`D_NATIVE_PROFILE_RUN_EXIT=0`；Pod 与两个 Secret 删除退出码均为 0，独立 `aa-status | grep -i bwrap` 退出 1，临时 profile 已卸载。该测试没有控制器 task/attempt、SQL 写入、真实用户实例或跨节点存储，因此不能替代 SQL proof/CAS 与完整备份验收。

用户返回的停止和恢复原字节已保存在[原回执证据](evidence/system-backup-d-native-agent-lifecycle-20261030.json)；本地重新 base64 解码并计算两个 SHA-256，均与现场输出逐字节一致，解析后重新核对 namespace、Pod UID、epoch、原 PID、原/目标 generation、restart SHA、正向确认范围和恢复 PID，验证退出 0。该文件没有 `complete` 原字节，complete 的相同 SHA 仅采用现场探针输出。

客户端修复 `16815597` 固定 pool CA/TLS 1.3 并拒绝明文 locator；`7c1951de` 进一步使备份专用 HTTP 调用在发送控制 token 前拒绝非 HTTPS，定向测试退出 0。原生 Dockerfile 完整镜像本地构建因 Docker Hub 匿名令牌连接超时而失败，未产生目标镜像；已使用本地私有仓库中精确旧基础镜像叠加的测试镜像进行隔离探针，不将其当作已验收的完整原生 Lite 镜像。

## 下一现场门槛

1. 先提供与当前实例、工作区和 NFS 归属兼容的 **完整** Lite slot/pool Deployment 方案，包含 pool/slot 进程、socket/账本持久化、Pod UID、端口块、控制凭据、原实例迁移和回退。只加 `RUNTIME_AGENT_ROLE=pool` 而没有 slot supervisor 不可用。
2. 在受控测试实例上核对新能力的 `protocol`、namespace、Pod UID、Agent epoch、port、`supported`、`durable_reservation` 和 `agent_restart_reconciliation=false`；只读脚本为 [`scripts/system-backup-d-native-capabilities.py`](../scripts/system-backup-d-native-capabilities.py)。
3. 现场库最后观测到 migration 080。先按独立的 [080 升级/导入方案](system-backup-d-legacy-source-upgrade-handoff-20260929.md) 在副本上验证；不直接升级现场库到 126/127。只有原配置密文、完整 participants/writers、B 原 callback、migration 126/权限和目标库全齐，才能在单测试实例上执行停止/恢复，并逐字节核对 Agent 原回执与 SQL `system_backup_v2_gateway_proofs`、恢复 PID/generation CAS。
4. KEK Store/原 bootstrap/config 事务接点见 [独立交接](system-backup-d-kek-persistence-locks-20261029.md)。缺 C 的历史覆盖 scanner/来源及 Job `PreparedReferenceChange` 时继续拒绝完整扫描和生产准入。

本地测试二进制、缓存、覆盖构建上下文和本地测试 overlay 镜像已清理。用户已清理两份 D: 归档和远端 `/tmp` 的两份归档/只读脚本，退出码 0。隔离生命周期测试结束后，远端只读盘点未发现一次性 Pod、Secret、`/tmp` profile/探针文件或运行中 Pod 对测试 digest 的引用；[标签别名探针](../scripts/system-backup-d-native-image-aliases.py)逐一 HEAD 核对 67 个标签，只有 `d-native-52f47fc-20261030` 指向该 digest。首次删除命令因 Windows SSH 引号传递失败，没有执行 DELETE，标签仍为 HTTP 200。随后[固定 digest 清理脚本](../scripts/system-backup-d-native-image-cleanup.py)再次核对全部标签和 Pod 引用，远端仓库 DELETE 返回 HTTP 202、标签 HEAD 复查为 404、脚本退出 0，远端 `/tmp` 脚本也已删除。其他 owner 的共享工作区文件未清理。
