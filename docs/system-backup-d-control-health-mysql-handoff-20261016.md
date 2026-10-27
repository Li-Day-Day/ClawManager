# D 控制健康：控制循环接点与独立 MySQL 专项

本专项不依赖 B/C 业务实现。它验证 [健康 SQL 候选](system-backup-d-control-health-proposal-20261016.sql)、D 控制循环的完成观察和内部授权读取，不开放完整总览，不启用生产健康表，也不重复已接收的配置 writer、索引或维护回填专项。

## 13:35 远测通过，D 已接收

[最新原始日志](evidence/d-control-health-remote-20261016-133106.txt)与[冻结清单](evidence/d-control-health-remote-20261016-133106-source.json)已由 [r46 独立复核](evidence/system-backup-d-control-health-remote-review-20261016-r46.json)接收；[复核脚本](evidence/system-backup-d-control-health-remote-review-20261016-r46.mjs)只读日志/来源，不重跑 SQL 或构建。下方 r41/r42 的“七项实际 SQL 待测”及 12:00 失败记录均为历史状态，以本段为准。

- 1,302 项冻结来源逻辑 SHA 为 `0312d6e5664f3a0e69616cd1628e4ab0c9b39bbe160311d6782a98552a1eb9bf`；复算一致，全部当前来源无漂移，214 项重点来源匹配。
- 探针为修复后的 r45 二进制 `c9f376dcc1543203a56081bf14099fe0b96bfaefe78e8bb5db0b195c033db177`；runner 与实际 capsule 哈希逐项匹配。本轮 MySQL 8.4.8，当前 95 文件 catalog 的 fresh replay 与准确 ledger 文件名检查通过。
- 七项叶子与 `TestDControlHealthMySQL` 根均 PASS，包括过期/非 UTC/合法 config 2 切换。控制/read 本地门禁为 198 主/503 含子项，seed 1 主/8 含子项及脱离源码 seed 通过，重复覆盖不相加。
- 七个独立 installation/config/health 夹具、候选表、namespace `sbk-mig-261016053446-47a2` 原 UID `71f8d2a7-aef8-488a-9d74-a644d5bab4e0`、远端 scratch 和本地源码缓存均记录清理；准确本地 owner 目录独立确认不存在，准确本地准备容器查询为空。最终 `d_control_health_remote_exit=0`，无 CLEANUP_PENDING。四条 socket close 诊断原样保留，没有覆盖成功终态。

**关闭本专项实际 MySQL 待测，无需重复远测。** 读 scope 与 root grants 仍是夹具；此次不证明生产 A 授权、最小 grants、正式 schema/TTL 评审、真实 leader election、现场物理容量或历史升级，main controller 未启用。六项整体范围继续按其独立材料推进，不能将此候选专项接收写成生产启用。

## 12:00 远端失败与修复

[原始失败日志](evidence/d-control-health-remote-20261016-120015.txt)及[冻结来源](evidence/d-control-health-remote-20261016-120015-source.json)保留不覆盖。七项中六项通过；`expiry_timezone_and_current_config` 在第 485 行首次读取时返回 `system_backup_read_unavailable`，后面的时区及 current-config 检查尚未执行。原因是测试将 observed/expires 写为相隔 30 秒，而实际 config 的 reconcile interval 为 5 秒，合法 TTL 为 15 秒。读取器按 TTL 校验拒绝错误夹具，不能把这轮记为健康专项通过。

修复只调整测试：过期 SQL 从关联 config 计算三倍 interval，使用同一 SQL 语句的 UTC 时间构造已过期一秒的记录；核对准确更新一行、数据库中的微秒 TTL 与配置相等，再验证两个健康字段均为 stale。读侧回归覆盖 1/5/10/60 秒 interval 的到期边界，并明确保留“5 秒 interval 配 30 秒过期窗口必须 unavailable”的反例。生产读取校验、候选 DDL 和控制写入逻辑未改动。

补查同一用例尚未执行的后半段时发现，原 `active_config_version=999` 会违反 066 的真实 active-config 外键。现改为从准确 frozen fixture 派生合法 version 2 配置，先插入再切换指针，验证旧 config 观察仍被拒绝；不删除外键或关闭约束。tagged seed 同时校验只派生 config INSERT、不重复创建 installation，并拒绝来源版本漂移。

原失败 run 已记录 namespace `sbk-mig-261016040341-0220`、UID `632829d7-5698-4ec6-ad38-a7a8e69718de` 清理、远端 scratch 清理、本地 source cache 清理；exit 为 1。socket close 诊断出现在测试失败之后，具体失败断言是上述 TTL 夹具错误。修复后的实际 MySQL 七项仍需新 run 完整通过；沿用文末命令生成新的时间戳日志和来源清单。

修复后最终[本地日志 r45](evidence/system-backup-d-control-health-local-20261016-r45.txt)与[冻结来源](evidence/system-backup-d-control-health-source-20261016-r45.json)均已保存，来源 SHA `e07f0cf7c8b2670fa499e20993b008964b93eda91e303b2c8a9ce5912db6a0d2`。controller/read 完整回归 198 个主测试、含子项 503 项通过；tagged seed 为 1 个主测试、含子项 8 项通过，同一 Linux 二进制脱离源码重跑 seed 也通过，重复覆盖不相加。Linux 探针 SHA `c9f376dcc1543203a56081bf14099fe0b96bfaefe78e8bb5db0b195c033db177`；runner/capsule 保持 r41 值，95 文件 catalog。冻结后复查、13 项派发绑定、exit 0 和准确 owner 临时目录清理均通过，未安装依赖、未执行远端 SQL。r43 因 Docker 权限在启动测试前退出并清理；r44 是补查外键修复前的中间验证，最终以后续 r45 为准。

## 本地准备已通过

[冻结清单](evidence/system-backup-d-control-health-source-20261016-r41.json)包含 1,292 项来源，有序逻辑 SHA 为 `98938d9c7c807b6d5cbf24810dad776be3c30112e9086420d73a9c9d6fc64a74`。[原始本地日志](evidence/system-backup-d-control-health-local-20261016-r41.txt)终态 `d_control_health_local_exit=0`：

- controller/read 完整回归 198 个主测试，含子测试 483 项；默认 vet，两个包均 PASS。
- tagged seed 1 个主测试/7 含子项，通过实际 PowerShell/Node 生成的 capsule；同一 Linux 二进制又在脱离源码的 `/tmp` 工作目录运行相同 seed。该目录包含本轮 cache/telemetry，并非空目录；重复覆盖不相加。
- Linux MySQL 探针 `488eb63c7f6e9580fc15704caf997420e777011ee322724cfc06718e64dd140f`；当前 95 文件迁移 runner `cff6270bf1537de361d938a533f155f7f1193de2c4f116327e53ec8b1ee97482`；实际 capsule `3539aaddd35c8f739155fd64c742b10b467693b3f484d15820278802bd71b597`。
- 专属远端命令的 13 个完整绑定、仅选择新 root 的检查通过；Bash phase 另行只读语法检查通过。
- 使用已存在的 Go 1.26.1 Linux 镜像、只读现有模块缓存、断网和 `--pull=never`，未安装依赖；源码副本、二进制、容器 cache/tmpfs 和准确 owner 目录已清理。

[独立本地接收](evidence/system-backup-d-control-health-review-20261016-r41.json)复算原始日志、冻结清单、全部 Go 段落、三项 payload hash、实际 capsule 和准确 owner 缺席。复核器首版错误地假设 Node bundle JSON 已进入 transcript；实际普通 stdout 只在工具输出中出现，原日志中完整保留的是后续三项 `LOCAL_PASS` hash。本接收改用这些原始 marker，不补造缺失 JSON。当前 wrapper 仅增 owner 路径和两处 Node 原生输出转发，逆向还原这三处日志改动后能重算原冻结 wrapper SHA；其余 15 个重点来源无漂移。[当前日志转发/语法/13 项派发复核](evidence/system-backup-d-control-health-logging-20261016-r41.txt)单列，没有据此声称重跑 Go 或实际 SQL。

**本地编译和 seed 不是实际 MySQL。** 本机无 MySQL 镜像/容器，当前 Kubernetes 没有 context，本轮没有 SSH 或实际 SQL root 执行；七项实际 MySQL 继续待完整回执。

## 控制循环的具体增量

`ControlLoop.Observer` 在三个控制 pass 完成后、现有结果 callback 前接收实际结果。guard 失败、取消或未完成的 pass 不产生观察；观察失败向上返回并终止本轮 loop，不将存储失败替换成原控制 pass 的结果。

`ControlHealthObserver` 在同一 leader 实例内串行保存提交后的 token；写失败/提交回复不明后永久丢弃该实例的 token，后续调用不再执行 SQL。token 绑定原始 sql.DB pool，不能搬到另一个 pool 继续写。新 leader 仍须经受审启动入口取得新的 epoch，而不是重试旧 sequence。

main controller 当前没有构造这个新 observer，原 grant 矩阵和默认行为不变。此处接点已由实际 `ControlLoop` 单测及专用 SQL root 代码接入验证；它不代表真实 leader election、管理认证或新增 schema 已验收。正式启用前仍需当前数据库身份、leader-start 接线、schema/grants/TTL 评审和现场证据。

## 独立 SQL root 的七项场景

| 叶子名称 | 被测行为 |
| --- | --- |
| `initial_observe_takeover_read` | 初建 unknown、控制与数据库结果独立、同事务读取、换 epoch 后旧 token 拒绝、最终读权限撤销返回零结果 |
| `concurrent_epoch_cas` | 两个并发调用同一 previous epoch 的实际条件 UPDATE，只能一个取得新 epoch |
| `concurrent_observation_cas` | 两个并发调用同一 sequence，只能一个写入，数据库最终 sequence 精确为 1 |
| `expiry_timezone_and_current_config` | 已到期的持久观察变为 stale，过期写入及非 UTC takeover 拒绝，当前 config 漂移后写入/读取拒绝 |
| `actual_constraints_and_fk` | MySQL CHECK 拒绝无效 epoch/owner/初态与时间，真实 FK 拒绝删除 config/installation 锚点 |
| `committed_reply_loss_poisoned_observer` | driver 在真实 autocommitted UPDATE 返回后丢弃一次回复；observer 不返回/重试 token，独立连接只找到一次提交 |
| `completed_control_loop_and_fenced_stop` | 实际 ControlLoop 调用观察器，换 epoch 后旧循环首轮即停止，不继续消费下一 tick |

并发两项启动的是实际并发请求并检查 CAS 胜负/数据库终态，不声称日志已观测到服务端行锁等待。读 scope、控制 pass 和 root grants 为明确夹具；新 root 不证明生产 A 授权、最小权限配置或 B/C 就绪。每项用独立随机 installation，并核对 writer 没有额外改变完整 installation_state；config 漂移场景先记下夹具主动变更后的状态，再核对被拒绝调用没有其他写入。

候选表只在新的完整 fresh-catalog namespace 中安装。开始前拒绝已有健康表，严格比较全部 ledger 文件名；run namespace、UID 和 MySQL server UUID 必须匹配 marker。每项清理准确 installation/config/health，最后清理候选表；外层保留已有 namespace 精确 UID 和两端 scratch 清理。真实旧库升级、代表性生产负载和正式 schema 签收不在该 root 范围。

## 操作者完整命令

从本仓库根目录执行。该入口默认只做本地准备；**只有显式 `-Remote` 才连接已配置的隔离环境**。必须已有本机 Go 镜像及模块缓存；脚本拒绝缺失输入，使用断网容器和 Never policy，不拉取镜像或安装依赖。

```powershell
$healthStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$healthManifest = Join-Path $PWD "docs/evidence/d-control-health-remote-$healthStamp-source.json"
$healthLog = Join-Path $PWD "docs/evidence/d-control-health-remote-$healthStamp.txt"
$healthExit = 1
Start-Transcript -LiteralPath $healthLog -NoClobber
try {
    & .\scripts\system-backup-d-control-health-validation.ps1 `
        -Remote -SourceManifestPath $healthManifest
    $healthExit = 0
} finally {
    Write-Host "d_control_health_remote_exit=$healthExit"
    Stop-Transcript
}
```

接收需同时具备：新 run 的冻结来源/capsule/binary/runner pin、95 文件当前 catalog 重放、唯一 `TestDControlHealthMySQL` 七叶子及 root PASS、七个准确 installation 清理、候选表清理、namespace 原 UID 和两端 scratch 清理、最终 exit 0。专属 marker 为 `PASS d-control-health-mysql ... synthetic_read_scope=yes fixture_root_grants=yes production_approval=no`。不能用 r41 本地 seed、旧维护七项服务或旧 catalog 的通过回执代替；任意 CLEANUP_PENDING 均保持未接收并保留准确身份。
