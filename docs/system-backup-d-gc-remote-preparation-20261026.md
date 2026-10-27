# D：GC 远测入口与仍未完成的本地准备

2026-10-26。A 要求区分历史前置探针和新 Full profile。本轮增加独立入口，**没有执行 SSH、kubectl 或真实 MySQL，也没有安装依赖**。A 对 `093f...` 的本地 owner 接收保持原来源，不自动覆盖本轮 tagged 探针和脚本增量。

## 当前版本提示

以下 a35a / 31 项材料属于历史准备验收。33 项 Full profile 与公开冷组 7 项夹具的本地 seed、Linux 编译和普通包已在 `aeb5bd66...` / 1,679 来源完成，由 A 的 [限定回执](evidence/a-gc-prepared-full-reviewed-20261026.json) 接收；实际 SQL 执行仍为零。旧回执保持原字节，不能覆盖其后的新源码。

当前新增独立 15 项公开 owner 生命周期源码，覆盖 kill／退出／取消／接管、双 holder、fresh session、池状态及临时表、DDL 等待、有界批次与超大 program 拒绝。同时修正仅 synthetic cold fixture 的 SHOW CREATE pin：只排除精确解析的外层自增分配计数，保留列、约束、索引与 COMMENT，未知格式拒绝；A 已 [限定复核两份 tagged 组件](evidence/a-gc-tagged-component-reviewed-20261026-r1.json)，新的窄 seed／Linux 补编仍待执行，不能据该组件复核批准全树来源。独立 phase、接收器和源码适配器放在 `docs/evidence/d-gc-full-lifecycle-*`，不修改入口冻结副本或中央 scripts。入口占用 Go 时不启动新 Go／SSH。

冷组 authority 和物理报告均为明确合成，候选 evidence CHECK 只应用于 UID-owned 克隆库；生产 Policy、完整十二组、物理容量与实际现场接收仍未完成。

## 历史三种范围

| 入口 | 实际范围 | 是否完整公开 Collect |
| --- | --- | --- |
| 历史 `-DownloadGCFreezeOnly` | 34 项 backup-lock 前置 + 8 项旧连接 owner 生命周期；使用旧合成账号、canary 与传输边界 | 否；原 42 项已接收，本次不重跑 |
| 历史 a35a 的 Full profile | Full grants、独立 observer、固定 freeze owner、25 项 DDL 与 6 项控制；现已扩为 33 项 | 否；旧 31 项记录不代表当前版本实际 SQL 通过 |
| 公开 `Collect` 冷组专项 | 七项合成已知 task 域夹具已本地编译并获限定接收；新增 pin 修正单独复审 | 是候选公开路径；真实域 authority 与实际 SQL 尚未接收 |
| 新 lifecycle 专项 | 独立 15 项 owner 生命周期、会话隔离及有界规模源码与 phase／接收器 | 是候选公开路径；等待新 source review 和窄补编，实际 SQL 为零 |

旧 role 十项、GC task 十八项和原 GC 四十二项的成功回执继续保留，不能组合成 Full Collect 已验收，也不要求用户重复运行。

## 新 Full-profile 探针做什么

`download_gc_full_profile_mysql_test.go` 复用既有 namespace UID/server UUID/完整迁移账本/二进制内嵌 capsule 校验，创建独占的正式表克隆和独立 DDL 测试子库。worker 采用新 Full 三条附加授权；observer 单独使用已有 privileged profile，账户、版本、完整 grants 与 program/结构摘要均准确绑定。

每项 DDL 在准确 worker 持有 backup lock、独立 observer 完成、唯一 RR 已开始后启动，使用原会话映射的 `metadata_locks` 证明 holder GRANTED 与 waiter PENDING。owner 完成 commit/同连接 unlock 后，核对原 holder 与 waiter 释放及 DDL 的实际效果。覆盖原空集合新建 procedure/function/trigger/event/view，以及相应 alter/drop、跨库 incoming FK 和账号管理。

六个控制是 canary commit、canary rollback、缺 BACKUP_ADMIN、额外 SYSTEM_USER、observer SHOW_ROUTINE 撤权和错误 program pin。canary 只删除实际 `audit_logs` 测试行，权限形状不会为 canary 扩大。

协议 authority 是 UID 隔离的**合成测试事实**，其 domain Early/Lock 均永久拒绝业务组。因此该探针不能授权实际 group，也不能背书真实权限来源、冷组语义、物理容量或生产启用。输出固定 `public_collect=no full_group=no production_approval=no`。

远端 phase 在原 UID/hash 校验后先检查二进制确实列出准确测试 root，再要求 native root PASS、31 个子用例 PASS、无 SKIP；零测试、截断或只有自定义 PASS 行不能通过。临时 binary、capsule 和 native 日志由 trap 清理，子库/账号由准确 server/UID 绑定的测试 cleanup 清理。

## 本地准备与参数

只做冻结、离线 seed、Linux 编译和清理，准确命令为：

```powershell
& .\scripts\system-backup-d-gc-full-profile-prepare.ps1
```

该入口不连接远端。编译缓存只从现有本地 cache 只读复制；cache 不存在时从现有模块离线编译，`GOPROXY=off`、`GOTOOLCHAIN=local`，不下载安装。记录 Linux binary SHA 后删除 binary、源码副本、cache 和 test tmp。seed 与编译通过只代表本地准备，不是 31 项实际通过。

本轮[准确准备回执](evidence/d-gc-full-profile-prep-a35a7d5728ca439885a18bc5e330b7c2.json)已终端：来源 `3bdf32b2014892f68fc932bdbcc40e4ba0ebd7fd74c01eca4765c8127b1355dc` / 1,659 输入；native seed 一个 root/一个通过事件、无失败或跳过，Linux tagged 编译退出 0，binary SHA 为 `70c0bddc2bb3b8e001b73e2ff585feb57a48d77d945389ca2979bdb3d5c1af29`，冻结副本后检和准确 owner 清理成功。现有 host 编译缓存不存在，本轮从现有模块离线编译，没有下载。**实际 31 项执行数仍为零。**

编译冻结后仅新 phase/dispatch 增加了准确 root/31 子项/无跳过门禁，当前两个入口的 dispatch 检查和 Git Bash `-n` 均已通过；该 probe 的 Go 字节不变。并行 bootstrap integration test 后续变化另列，不继承当前整树 ready。[新的 A 复审请求](evidence/d-gc-full-profile-preparation-request-20261026.json)及其同名 `mjs --check` 分别绑定原 Go 准备与当前脚本检查，保留原 `093f...` GC owner 字节及回执。

**待本轮准备回执和 A 对新探针范围复核完成后**，用户在仓库根目录使用以下新专项命令；它将重新冻结当时来源、运行原完整 default-vet 门禁、准确 seed/编译，然后才请求 SSH：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$token = [guid]::NewGuid().ToString('N').Substring(0,8)
$manifest = Join-Path $PWD "docs/evidence/d-gc-full-profile-remote-$stamp-$token-source.json"
$log = Join-Path $PWD "docs/evidence/d-gc-full-profile-remote-$stamp-$token.txt"
Start-Transcript -LiteralPath $log
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -DownloadGCFullProfileOnly -Remote `
        -SourceManifestPath $manifest -SshTarget 'root@10.130.14.23'
    if ($LASTEXITCODE -ne 0) { throw "Full-profile probe failed: $LASTEXITCODE" }
} finally {
    Stop-Transcript
}
```

用户只需可交互的现有 SSH 凭据。namespace UID、隔离 MySQL 凭据、binary/capsule hash 由既有 runner 生成并核对，不要求手填；原 `kubernetes-admin@kubernetes` context、`clawmanager-zhanghui08-system` 来源 namespace、`node1` 和内网镜像约束保持现有配置，若现场拓扑有变必须先改准确 runner 约束，不能放宽校验。不要同时加 `-DownloadGCFreezeOnly`、role/task 或 owner 专项。

## 原十二组要求的准确对应

| requirement | 新 31 项准备覆盖 | 仍缺 |
| --- | --- | --- |
| privileges | 新 Full grants、额外/缺失/observer 撤权 | 生产账号批准来源、全部撤权等待图 |
| transaction_boundary | 实际 RR 与 audit canary commit/rollback | 原 group + nonce/audits/tombstone/容量整体 |
| table_and_foreign_fk | 五类表/跨库 FK 的准确锁等待 | 部署参与方完整锁序与规模 |
| routine_ddl | procedure/function create/alter/drop，含空集合新增 | 准确部署版本的实际运行回执 |
| trigger_event_view_ddl | trigger/event/view 各类 DDL 与实际效果 | 准确部署版本的实际运行回执 |
| account_and_dml_controls | 五类账号 DDL；允许的 audit DML | 无关业务 DML 与全部授权管理参与方 |
| holder_lifecycle | 仅固定 owner 正常结束 | 新 Full owner 的取消、kill、丢回复、接管专项 |
| pool_reuse | fresh connector、明确 unlock/discard | 新 Full profile 的后续借用与故障断连证据 |
| multiple_holders | 没有专项 | 新 Full profile 多 holder 的准确归属/释放 |
| temporary_and_session_state | 固定 fresh session/UTC/profile 检查 | 新 Full profile 临时表例外与异常会话专项 |
| scale_and_wait | 有界锁等待与有界观察器 | 现场全局影响、完整规模及执行计划 |
| full_collector | **没有实际冷组正例** | 下述 D 本地实现与之后现场运行 |

## D 仍须完成的本地工作，不能列成现场材料

1. 基于现有 actual admission/result SQL helper 构造完整过期冷组；原 receipt、审计正文、nonce、retention、FK 和 evidence envelope 要保持一致，不能为测试放宽生产期限、FK 或 CHECK。
2. 将完整域 Policy/协议 authority 接入该实际夹具：保留当前 worker、task/system producer、全部 direct/L1/owner/catalog/import 语义，缺域输入必须拒绝。当前 31 项的 synthetic authority 不能代替。
3. 在新公开 Full Collect 夹具中加入 ticket 后晚失败、取消/kill、COMMIT/ROLLBACK 丢回复、独立 holder 释放观察及接管；记录原组/预留/tombstone 的整体提交或回滚和准确未知结果。
4. 增加完整公链的独立 binary/seed/dispatch/receiver；只有这些本地门禁通过并经 A 复核后，才能给用户“完整 GC”实际专项命令。

完整域所需 B/C catalog/import 原合同、准确部署授权批准、真实物理卷容量与权限/接管事实才属于外部材料。**当前没有可诚实提供的“完整公开 Collect 已就绪”远测命令。**

## 新版冷组与接收器（已获本地限定接收，实际 SQL 未执行）

`-DownloadGCFullCollectOnly` 新入口严格选择 `TestDDownloadGCFullCollectMySQL`，七项为 commit、late_policy_denied、last_delete_reply_lost、commit_reply_lost、rollback_reply_lost、unlock_reply_lost、cancel_after_work。通过公开 `SQLDownloadRetentionGC.Collect` 进入新物理会话、Full grants、独立 privileged observer、唯一 RR、真实 L0 至 L10 SQL、单次 finalizer、唯一 commit／rollback 及原 holder 释放观察。测试用原 canonical receipt/audit 重建历史冷组，保留全部 FK；候选 evidence CHECK 只在准确 UID-owned 克隆库应用。真实域策略仍仅是显式的已发布 task 域合成夹具，不覆盖缺失的 catalog/import 原始权威来源；物理报告也为合成。七项实际 SQL 结果尚未执行。

`system-backup-d-gc-full-collect-receiver.mjs` 是独立只读接收器。除准确 source、binary、capsule pin 与相同 namespace UID 外，强制 native root／七个准确 leaf RUN 与 PASS、无 FAIL／SKIP、明确候选边界、迁移成功、原 namespace UID 清理、原本地 owner 缺席、冻结后检及外层退出码。拒绝零测试、自定义 PASS 替代、重复根／叶、来源重填、错二进制、遗漏清理或提升生产范围；输出保留合成 authority／capacity、十二组未完成、生产未批准。默认不写文件，`--write 新文件` 排他创建，不覆盖历史回执。

接收器 17 项纯内存正例／反例已通过：`node --test --test-isolation=none scripts/system-backup-d-gc-full-collect-receiver.test.mjs`。默认隔离模式曾被本机进程 spawn 权限拒绝，原失败日志保留；修正运行方式不涉及依赖安装。证据为 `docs/evidence/d-gc-full-collect-receiver-tests-20261026-r3.txt`。这些解析器测试绝不是七项 MySQL 成功材料。

新版现场命令必须在新来源门禁通过并经 A 确认准备范围后使用；沿用独立 `SourceManifestPath` 与 transcript，选择 `-DownloadGCFullCollectOnly` 并写 `gc_full_collect_exit=0` 原始终态标记。不要复用旧的 role10、GC42、a35a31 或 093f owner 回执。当前没有触发 SSH、kubectl 或现场数据库。

## 本轮未通过／中断来源

- `d-gc-capacity-full-local-ccb725d41d2449a9861ecce66e18657a`：43a0189e / 1680 输入；prepared 全部、旧 Full 分支及报告删除／替换／缺失控制通过；新增时钟测试注入条件没有命中目标阶段，adapter 退出 1。已修测试为准确 ledger 更新后的 capacity Recheck；生产逻辑不因此变化。完整包／tag seeds／Linux 均未启动，准确 owner 已清理。
- `d-gc-capacity-full-local-d5318ee6c62248d2a4f771275b8921be`：81fefa16 / 1682 输入；因与另一个门禁的串行协调消息交叉，仅取消本聊天刚启动的 session29307。无 native 测试事件，完整包／tag seeds／Linux 均未运行；原 manifest 保留，准确 owner 已清理，独立中断回执明确不计通过。

## 最新本地接收与现场前提

补证 2775 已完成 evidence 399/3228、metadata 13/281、三个本地 seed 和五项 Linux 构建，原生失败/跳过为零；来源后检通过，run 与 staging 双 owner 和全部 binary/cache/tmp 已清理。A 的独立限定回执为 [a-gc-prepared-full-reviewed-20261026.json](evidence/a-gc-prepared-full-reviewed-20261026.json)，D 的不可变交接为 [d-gc-capacity-full-review-request-20261026.json](evidence/d-gc-capacity-full-review-request-20261026.json)。

该接收只固定 a2e7 普通源码加 19b 单 tagged 测试及准确 GC 脚本；并行 live entry 已变化，不能直接把 aeb5 证明套在当前树上启动新现场轮。取得当前来源联合门禁与 A 对准确来源的复核后，再固定新的 manifest／binary／transcript 执行对应候选专项并用独立 receiver 接收。当前 33/7 实际 SQL 执行数仍为零，不重跑旧 role10／GC42 充作新证据。
