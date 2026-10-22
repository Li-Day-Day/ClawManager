# D：下载 GC 的实际任务资格组件

【2026-10-21 GC task 实际十八项已接收】[本轮实际接收](system-backup-d-download-gc-task-mysql-accepted-20261021.md)核对 MySQL 8.4.8、001..081/96 份迁移、18/18、父测试 77.18 秒及退出 0；原三个 prune 用例均通过，旧 15/18 失败与根因保留。namespace/远端 scratch/缓存清理已报告，准确本地 owner 已独立确认缺席。这只接收 SQLDownloadGCTaskEligibility 合成任务夹具的真实 SQL 组件，full_gc、role approval、人类 MFA、provider read、生产批准及原六项仍未完成。下方“新十八项实际待跑”等为旧轮状态。


【2026-10-21 13:43 轮真实 MySQL 失败已准备修复，可用新来源重跑】[准确失败回执](evidence/d-prune-identity-operator-failure-20261021.json)确认十八项中十五通过，三个 prune 叶子因 3819/`chk_sb_prune_item_identity` 失败，原 exit 1 和清理保留。070 artifact ID 正则漏一段 UUID；[追加 081/96 份 catalog 的修复与新命令](system-backup-d-prune-identity-repair-20261021.md)已按[最终回执](evidence/d-prune-identity-preparation-20261021.json)发布并清理。六包覆盖 919/6,332（controller 两旧断言修正后完整复验 143/191）、Node 94、seed/脱离各 29、默认 vet、跨平台 probe/runner 与来源复核通过；并发 A 两 tagged 用例差异单列。新的完整十八项实际回执仍待用户执行，下方仅有本地失败等为历史状态，内部 PASS 日志不能覆盖失败父根。

【2026-10-21 用户 10:03 轮本地失败已修正，可重跑本页命令】[独立失败复核](evidence/d-download-gc-task-local-failure-20261021-100302.json)确认旧 1,457 输入 SHA `0df9ca928b7990db0046c6fc4d42ebfe5123af59f45f60b9aee8dccc180c5c8b` 的唯一两个失败叶子为 `TestDownloadRetentionGCProducerReceiptFacts/null_version`、`no_version`：D 负例夹具把 C1 typed binary frame 当作 JSON 解码，尚未进入被测组件即失败；它不是实际 GC task SQL 失败，也不是服务器 Pod 调度错误。旧本地 security 2,011 项通过，evidence 2,924 项有上述两叶子及其父根失败，384.192 秒；远端未开始、实际十八项为 0、原 exit 1 保留，原准确 source 目录另核验缺席，本地 build cache 报告清理。

修正与新增联动验证只改变该轮来源中的一个测试文件，其他生产/门禁输入逐项相同。[新同源完整回执](evidence/d-download-gc-producer-preparation-20261021.json)接收四完整包 754 主/6,242 含子项、默认 vet、无失败/跳过、新组件八根/75、producer seed/脱离各 22、跨平台 probe/runner、普通/最终 postcheck/退出 0；当前 1,457 来源 SHA `727348b948844c09a40390957f760d7f310a3f8d970b3d84e85740adae71042d` 接收时零漂移，六个自有目录与构建产物清理，无依赖安装或远端执行。可用新时间戳重跑本页原 `-DownloadGCTaskOnly` 命令；实际 GC task 十八项仍待新回执，已接收 producer 十八项和四任务十二项不重跑。

【2026-10-21 当前执行顺序】producer 十八项实际 MySQL 已由[独立回执](evidence/d-download-producer-actual-accepted-20261021.json)接收：18/18 叶子、准确行锁/空范围、原 UID 与清理、最终 exit 0 齐全。下一步执行本页独立 `-DownloadGCTaskOnly` 十八项；producer 和已接收四任务十二项均不重跑。以下 10 月 20 日调度阻塞为历史记录，不能覆盖新成功轮，也不能据新轮推断当前节点容量。system producer GC 原绑定组件已有独立本地准备回执，其实际 collector SQL、完整 policy 和生产装配尚未验收。

【2026-10-20 调度前置】producer 的[16:25 轮失败复核](evidence/d-download-producer-scheduling-failure-20261020-162523.json)已确认本地完整门禁通过、远端开始，但 MySQL 因 Too many pods/另节点 affinity 不匹配未就绪，目标迁移/实际案例为 0；其 exit 1 保留。先按[只读容量诊断及 producer 重试说明](system-backup-d-download-producer-mysql-20261020.md)处理实际调度条件，再接收 producer 十八项，然后执行本页独立 GC 档位。本页十八项仍无实际 SQL 回执，原四任务十二项不重跑；不自动停用其他工作负载、改变 affinity 或提高 kubelet 上限。

本增量新增 `SQLDownloadGCTaskEligibility`，作为完整 `DownloadRetentionGCPolicy.Lock` 必须完成的具体任务来源检查之一。它读取正式 067/068/069/073/077 的实际列，覆盖 backup、drill、preflight、artifact_verify；不实现 `Early`，不能单独当作完整 GC policy。没有默认安装、角色、路由或调度，也没有触发 provider 删除。

## 资格与原始来源

- 锁定原 owner 和准确本地 backup。每一行独立验证安装、类型、schema、版本、创建时间、终态、完成时间及自己的原始 `deadline_at`；两者的原期限都必须到达。没有从 parent 或当前 TTL 推导 child 的期限。未结束任务、未完成/将来完成、待 reconcile、未过期或不完整的 controller claim 均拒绝。过期但完整的旧 claim 可接受，并保留在后续复核中。
- artifact 只允许已经 `deleted` 且不可用，或 `staging/not_committed` 且从未开始/完成 commit。committed（包括不可用）、deleting、delete_failed、corrupt、提交结果未知均不满足此条件。即使 artifact 已 deleted，manual/promotion hold 仍然阻断。
- 非 backup 的源必须是准确本地 backup。先读取提示选择 backup key，先锁 backup 再锁 child，随后独立比较锁定 child 的源。catalog_import 和 system/producer、staging、resource、promotion、prune 等其他 owner 继续拒绝，等待其原始绑定与实际适配器；不伪造期限。
- drill 的 cleanup 必须是 `succeeded` 或尚未开始且无资源记录；retained、pending、running、failed、partial_failed 或非 none 的清理错误均阻断。backup staging 与 drill restore inventory 只能剩下 absent/deleted 的收敛记录；staging 的 cleanup_result 必须 succeeded。错误、残留、活动/半对 claim、其他安装、重复/乱序/超量记录均拒绝。
- backup 及原 child 的 incoming retry 范围、backup/drill 的 promotion 范围必须为空。这里保留所有仍存在的 promotion/retry 记录的保护，不用已变为 false 的 hold flag 或 promotion 状态代替其引用生命周期。相关记录须由自己的受审回收流程先处理。
- 对同一 backup 的 artifact_verify、preflight、drill 三个完整来源范围读取 25 列任务事实；只按 source_public_id 选择，不用安装、来源类型、状态或期限过滤隐藏矛盾行。其他任务须独立满足原期限到期、已结束、无 reconcile/活动 claim、同安装与准确 backup 来源。允许保留清理完成的过期终态任务，避免两个下载 metadata 组互相等待对方任务先消失。它们及源 backup 的任务行均不在下载 metadata 删除范围。
- 每个其他任务额外锁 incoming retry；drill 还锁 promotion 与 restore inventory，并核对 cleanup。额外锁每个 holder 的 lease 范围，与 backup source lease 的准确行逐项匹配；活动、外源、缺失 source 对照、残留资源均拒绝。保留的 system_backup_prune_items 引用一律阻断，由它自己的受审生命周期先解除；不把终态或已删标志当作引用消失。
- 锁住 backup 的 lease-state/source-lease 范围，并对 child 额外锁 holder 范围，避免漏掉指向其他来源的矛盾租约。过期 lease 可保留；必须核对安装、source、generation/mode、holder/purpose、TTL、heartbeat/expiry、配置版本与 owner。过期等值可接受；未过期、错误来源、缺 state、跨安装、类型错误均拒绝。

## 复核与回收事务

guard 绑定同一事务、完整原 `DownloadRetentionGCScope` 和准确 backup key。复查使用已经取得的相同键/范围进行 current locking read，不重新读取提示或换 parent，不使用 RR 的旧一致性快照。所有已接受事实必须与原快照相同：即使新资源已经 deleted、行版本仍符合条件或期限仍已过期，也不能在中途换成另一份事实。复查时间不能倒退；失败状态由值副本共享，复制 guard 不能恢复授权。

范围没有按安装、活动状态或是否到期缩小，避免把矛盾来源当作没有引用。十个必需表（新增 prune_items）必须完整可见且为 InnoDB 基表；缺表、视图、其他引擎和重复元数据行均拒绝。该类型检查不能代替外层完整结构/权限指纹和 DDL freeze。每类 inventory/lease 最多 10,000 行；其他任务总数、其他 drill inventory 总数分别不超过 10,000。查询失败、权限不足和超量均失败，不当作空范围。所有 SQL 标识符来自关闭的四任务表集合，外部内容只作参数。组件只读/锁定，不开启嵌套事务、不提交、不变更 owner、claim、期限或资源。

其他任务成员集合及完整事实也纳入原快照。复核先比对集合，发现新增/替换或仍符合条件的版本变化时，在选择新 child 资源/lease 范围之前拒绝；原 owner 必须出现在自己的来源范围，按任务类型与准确主键识别，其他表的相同数字主键不能被排除。collector 在墓碑 INSERT、结果 DELETE、Operation DELETE 后出现其他任务或 prune 引用时，整组回滚，逐项恢复原 Operation/receipt/nonce/result、两份审计原文、容量与墓碑状态。模型不代替实际 InnoDB 锁验证。

collector 模型组合这个真实组件，并检查在写墓碑、删结果之后出现 hold、已收敛资源、promotion 或 lease state 时，原组、墓碑和容量记账整组回滚。它没有代替实际 MySQL 的锁等待、空范围覆盖或全局跨参与者死锁证明。parent→child→引用/inventory/lease 是此组件的候选顺序，仍需与所有生产写入者一起审查及实际并发验证。

## 仍需交付

完整 policy 仍缺其余 evidence/logical/FK 引用、catalog/import 依赖、完整当前工作授权/撤权、privileged trigger/program 观察与 DDL freeze。system producer 原始绑定已有[独立本地组件准备](evidence/d-download-gc-producer-preparation-20261021.json)，其实际 collector SQL 与完整装配仍未验收。[本次来源审查](evidence/d-download-gc-source-freeze-requirements-20261021.json)确认三张 catalog 来源表仍缺正式 schema，不补造 owner 期限；11 条 evidence FK 指向保留 envelope，不能直接推导原下载组的删除资格。已发布 Operation/audit/nonce 直接引用另由必需 References 组件负责，本增量不替代它。前置 grants/结构指纹必须与本组件新增 prune_items 等所需表/权限一起受审，不能仅靠查询成功推断完整元数据可见性。当前组件不解除这些门禁，也不启用生产回收。

原四任务链十二项和 producer 十八项实际 SQL 已接收范围保持不变。本页 GC task 十八项仍待操作者新回执；本组件的本地模型和编译不能替代实际 SQL、现场容量或[原六项](system-backup-d-six-scope-readiness-20261015.md)交付。

## 独立 MySQL 任务资格专项

[本地准备独立回执](evidence/d-download-gc-task-mysql-preparation-accepted-20261020.json)已接收最终 r2 的 **1,449 输入** SHA `9652b0911539277a3a113ec5cf18eee3bb710f654fb53f5eb79a485b65fb22bf`：两根 seed/13、tagged seed/13、脱离源码/13、默认 vet、Windows/Linux probe、Linux migration runner、普通/最终源码 postcheck 与整体 exit 0 均通过。两种 PowerShell 各八组派发、离线 Bash 两条迁移分支及四类错误 pin/空文件拒绝均通过。r1 原型的通过和来源单独保留；最终版本增加 prune 组件/独立谓词等值锁集合检查，不用 r1 扩大背书。三个自有目录及全部构建产物已[清理](evidence/d-download-gc-task-mysql-cleanup-20261020.json)，未安装依赖或执行远端。

相对上一轮普通四包 737/6,114 的冻结，只有一份受 `systembackup_mysql` build tag 保护的新测试、两个新派发/phase 脚本及三份档位接线脚本变化；所有既有 Go、依赖和嵌入输入逐项保持原字节。本轮复用该准确未变普通输入的原回执，未重复普通四包，也不称为新的当前整轮四包执行。实际 MySQL 十八项仍为 **0**，执行计划和锁证据须另收操作者回执。

新增 `-DownloadGCTaskOnly` 档位，仅执行 `TestDDownloadGCTaskMySQL` 的十八个叶子。它使用原 95 文件完整 fresh catalog、原 MFA 输入胶囊和自己的随机 `amfa_` 子库；执行前核对 namespace UID/server UUID/完整 ledger。FK 只在复制空 schema 时按已有初始化器暂时关闭，随后恢复并验证；所有任务/引用数据及实际测试操作保留 CHECK/FK。结束时逐个 guarded DROP 并确认子库不存在。没有正式 migration、生产角色或路由变更。

| 场景 | 数量 | 待实际 SQL 证明的事实 |
| --- | ---: | --- |
| backup / drill / preflight / artifact_verify | 4 | 正式任务表、各自原期限及终态、原 child 来源；清理完成的过期 sibling 可保留；Lock/Recheck 同源 |
| 三类 active sibling | 3 | 各表合法活动状态均拒绝，不用状态/安装过滤隐藏它们 |
| prune 引用、owner 原期限未到 | 2 | 保留引用阻断；独立检查原 owner deadline |
| backup 行、已有 dependent 行 | 2 | 准确持锁/写入 connection-ID、目标表/索引 RECORD 等待及释放后的成功回滚 |
| 三类空 dependent 范围、空 prune 范围 | 4 | 原完整谓词的实际 EXPLAIN 与 InnoDB 锁；不能把时间耗尽、权限失败或父表 FK 等待记成范围锁证明 |
| late owner / dependent / prune | 3 | 同事务变更后拒绝，恢复事实后失败 guard 的值副本仍拒绝，回滚后完整原行不变 |

prune 插入还会检查 backup 外键。该场景先观察完整组件持有的 prune RECORD 锁；释放组件事务，再用独立 RR 事务执行准确同一 prune 查询，逐项比较 index/mode/data 锁集合，然后要求竞争 INSERT 确实等待这个事务的 prune RECORD 锁。这样分别核对组件持锁与原谓词阻塞能力，排除 backup 外键造成的假阳性。它不声称已证明全局生产锁序。

原四类任务的完整行、prune run/item 和下载相关 Operation/audit/nonce/receipt/tombstone 空表在每个用例前后按实际 SQL 投影核对，竞争写入和迟到变更全部回滚。scope 的 worker/下载组标识是 synthetic；没有运行 Collect，没有真实下载、人员 MFA、provider、物理容量或受限账号验证。EXPLAIN 记录实际 access/key 及计划摘要，不预设精确索引或扫描上限。执行计划、实际等待和十八项 PASS 仍须各自的操作者日志，准备代码不能算实际 SQL 通过。

本地准备已接收。从仓库根目录使用新时间戳运行：

```powershell
$gcTaskRun = ".\docs\evidence\d-download-gc-task-remote-$(Get-Date -Format yyyyMMdd-HHmmss)"
$gcTaskLog = "$gcTaskRun.txt"
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadGCTaskOnly -BuildParallelism 1 -SourceManifestPath "$gcTaskRun-source.json" -Remote *>&1 | Tee-Object -FilePath $gcTaskLog
$gcTaskExit = $LASTEXITCODE
"download_gc_task_exit=$gcTaskExit" | Tee-Object -FilePath $gcTaskLog -Append
```

本档位与 producer 十八项、四任务十二项、GC 角色十项及旧 MFA/准入专项互斥。producer 十八项已于 2026-10-21 接收；不为本专项重跑 producer 或已接收四任务十二项。回传日志与同轮 manifest 时，需核对十八个准确 leaf/root、四类原谓词及其空范围计划（共八条 PLAN）、六项准确等待和一项 prune 等值锁集合、十八个不同子库及其清理、namespace UID、全部二进制/胶囊/95 文件 pin、两端清理和最终 native exit。完整 collector、专用账号、DDL freeze、跨参与者死锁/规模及原六项仍待交付。

## 验证

2026-10-20 恢复推进补齐其他任务与 prune 依赖：新增八个测试根，其下含根共 182 项；原 SQLFailuresAndConfiguration 测试根另补四项，较原六根/117 项净增 186 项。任务组件合计 **14/303**，全部 GC **32/494**。定向 r2 含 A 独立对照共 **33/498** 通过；此前 r1 的十二个 rollback 子项及根因检查错读写 recorder 而失败，原 exit 1 保留。初始要求所有 sibling 消失的保守原型已改为独立验证过期、终态、清理完成的 sibling，避免 metadata 组相互阻塞；迟到引用注入及原事实精确回滚断言保持。

r3 四完整包 **737/6,112**、离线探针及最终 postcheck/退出 0 通过，但来源早于随后修正的 producer 成功时钟夹具，不作为当前源码整包证明。最终 r4 使用 **GOMAXPROCS=1/-p=1** 对新来源运行单次完整 security/evidence/read/producer 四包 **737/6,114**，无失败/跳过、默认 vet；producer seed/脱离各 22、Windows/Linux probe、Linux runner、普通/最终来源 postcheck 和整体 exit 0 齐全。[独立复核](evidence/d-download-gc-dependencies-accepted-20261020.json)按各轮原来源分别登记，并保留用户 15:21 原 exit 1。最终 1,446 输入 SHA `04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df` 接收时集合/字节一致，六个自有目录及全部构建产物已[清理](evidence/d-download-gc-dependencies-cleanup-20261020.json)，无依赖安装、正式迁移变更或远端执行。以下 r74–r78 保留历史范围。

r74 首次冻结 1,439 输入后，Windows asm/compile 以 `0xc0000043` 退出，未执行测试。r75 重新冻结时 A 并发新增角色探针与脚本，完整来源改为 1,441；D 三份改动未变，但默认 vet 抓到新增测试辅助函数的 variadic 转发错误，仍未执行测试。原失败及来源全部保留，不把这两轮改为成功。

修正测试 key 为 canonical 数组，并加入九个必需 InnoDB 基表的实际检查及负例后，r76 定向 **18 个 GC 主测试/242 项含子项检查**全通过，其中本组件 **6/117**。默认 vet、两次冻结源码 postcheck、整体退出 0 和准确快照清理通过；1,442 输入 SHA `0ce20792189a9d2b75b8c70b20f51f78b2fda136b7288b3367c3e5d078826078`。本轮没有安装依赖或连接远端。

r77 完全同源运行 security/evidence/read/producer 四完整包，**722 主/5,855 含子项**全通过，无失败或跳过，默认 vet 和普通包 postcheck 通过。其中 evidence 为 317/2,541，GC 为 18/242，新任务组件 6/117。随后 Linux 交叉编译的 Windows `vet.exe` 以 `0xc0000043` 退出；该轮整体 exit 1、缺最终 postcheck 继续保留，不称单次整轮成功。

r78 使用准确相同的 1,442 来源与自有缓存补做 tagged-only 本地准备：三个 seed/22、tagged seed/22、脱离源码/22、Windows/Linux probe、Linux migration runner、两次 postcheck 及整体退出 0。四完整包没有重跑，默认 vet 没有关闭。准确构建摘要及普通包/补证各自来源见[独立复核](evidence/d-download-gc-task-20261020-r78-review.json)。

[清理回执](evidence/d-download-gc-task-cleanup-20261020.json)确认五个准确快照及一个自有缓存共六目录均已不存在；没有临时草稿或构建二进制遗留，没有安装依赖或执行远端。接收时当前 1,442 输入集合及字节零漂移，正式 95 文件 catalog 和 producer v2 胶囊不变。

实际查询计划、索引选择、空范围锁覆盖、跨写入者死锁与规模验证尚未完成。067 的三个 source 索引以 source_artifact_type 开头，而新增完整来源检查只按 source_public_id 选择；不能假定它只锁一个精确索引范围。10,001 行返回上限也不能证明实际扫描工作量或锁量有界，需要现场 EXPLAIN/并发证据后才能决定索引方案。本轮不修改正式 migration。此处只接收具体 SQL 检查代码及模型事务组合，不能当作实际 MySQL task/lease/hold 并发或完整生产 GC 的验收。
