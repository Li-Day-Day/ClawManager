# D 备份锁连接所有者生命周期实验（2026-10-22）

【2026-10-22 用户 15:57 轮实际 42/42 已接收】[完整日志](evidence/d-download-gc-owner-lifecycle-remote-20261022-155741-ad6ff1fd.txt)、[同轮来源](evidence/d-download-gc-owner-lifecycle-remote-20261022-155741-ad6ff1fd-source.json)及[独立验收回执](evidence/d-gc-owner-lifecycle-actual-accepted-20261022.json)已核对；[复核脚本](evidence/d-gc-owner-lifecycle-actual-review-20261022.mjs)的 `--check` 通过。MySQL 8.4.8、96 份正式迁移 fresh replay，两个根测试及 34 项前置、8 项连接生命周期全部通过，无失败或跳过，退出 0。25 项 DDL/账户变更均有准确 holder/waiter witness；8 项均观察到原线程 ticket 消失、canary 结果及不同新连接，提交/回滚/解锁回包丢失三项均记录成功回包被截断。`canceled_holder` 的释放等待为 5.002020571 秒，低于独立 observer 的 40 秒预算，其余七项均低于 5 秒。

本轮二进制 SHA256 为 `c48a38797ce39ab65ed371e91b75be5110020c510d746cd89cfd185233c8f272`，输入 SHA256 为 `d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0`，来源清单摘要为 `31353f64be59645bcbee973d238b8754176faa4b5e198d7f159b7c3c1631bd7f`；九份关键输入与修复回执及当前限定字节一致。日志报告 namespace `sbk-mig-261022090541-3520` / UID `a34978ab-85b8-4351-be8b-a2a76c72d01d`、远端 scratch 和本地构建缓存已清理，准确本地 owner `.tmp-d-index-cache-8d328c9da08b4c2facd2e8d5c2a6d613` 已独立确认不存在；未作独立远端清理复查。关闭 socket 提示未改变本轮测试与包装器的成功结果。未安装依赖，本次接收只运行离线证据复核，无新增构建产物或远端操作。

接收范围为合成夹具中的备份锁前置条件和生产 connection owner 生命周期：`freeze_adapter=not_wired`、`full_gc=not_run`、`role_approval=no`、`human_mfa=no`、`provider_read=no`、`production_approval=no`。当前整棵工作树、完整 GC、原六项及十二组协议未因此完成。下方失败、修复和待跑文字均保留其原时点历史含义；本轮完整同来源结果取代“42 项尚待实测”的当前状态，不拼接旧轮结果。

【2026-10-22 用户 14:40 轮实际失败与取消观察修复】[原日志](evidence/d-download-gc-owner-lifecycle-remote-20261022-144052-85261cfe.txt)及[同轮来源](evidence/d-download-gc-owner-lifecycle-remote-20261022-144052-85261cfe-source.json)保留：MySQL 8.4.8、96 份迁移、原 34/34 与新增 7/8 通过，`canceled_holder` 在 5.01 秒时未观察到准确原线程 ticket 消失，完整 profile 退出 1。namespace 为 `sbk-mig-261022070931-3083`，UID `6ba6fa1c-b4ab-4311-adbf-c89ff147479b`；原待清理身份 `connection=68 thread=417` 继续留档。旧父测试虽然打印自定义 PASS，实际父测试仍 FAIL，phase 最终 PASS 未输出，不能接收为 42 项成功。日志随后报告准确 namespace/远端 scratch/本地缓存已清理，本地 owner `.tmp-d-index-cache-e15ebfece4d144b19b62bb1fad85caee` 已独立确认不存在；未作独立远端复查。

本地驱动 `go-sql-driver/mysql v1.9.0` 的 `cancel` 调用 `cleanup` 关闭客户端 socket，不发送服务端 KILL。[MySQL 8.4.8 准确版本源码](https://github.com/mysql/mysql-server/blob/mysql-8.4.8/sql/item_func.cc#L4899-L4926)中，`Interruptible_wait` 每隔 5 秒才检查一次客户端是否仍连接，`Item_func_sleep::val_int` 使用此等待器。原夹具取消的是 `SELECT SLEEP(30)`，释放 observer 也只等 5 秒，恰与服务端断连检测周期竞争；这与 5.01 秒失败相符。原日志没有记录取消后每个服务端状态，因此保留为源码与日志共同支持的根因判断，不能据此断言生产清理协议已正确。

本轮保留长查询与准确执行线程 witness，仅把该场景的独立 observer 预算改为查询的 30 秒加 10 秒余量，其余七项仍为 5 秒；在准确 ticket 消失前不得读取 canary 或报告通过。客户端查询另在 10 秒内必须明确返回 `context.Canceled`，改用 Scan 消费查询结果，避免只读取列头；40 秒不是客户端取消耗时承诺。成功记录增加实际 `release_wait` 与 `release_budget`，父测试只在全部子项成功后打印自定义 PASS。未使用新连接对原 holder 执行 KILL/UNLOCK，未改变生产 owner 或接入 freeze adapter。[MySQL SLEEP 文档](https://dev.mysql.com/doc/refman/8.4/en/miscellaneous-functions.html#function_sleep)说明该函数的查询时长及返回值，不能用客户端返回错误代替原线程 ticket 的独立释放观察。

修复已通过既有冻结包装器的完整离线门禁：[独立复核回执](evidence/d-gc-owner-cancel-repair-20261022.json)、[日志](evidence/d-gc-owner-cancel-repair-20261022-local.txt)、[同轮来源](evidence/d-gc-owner-cancel-repair-20261022-source.json)及[原探针准确字节差异](evidence/d-gc-owner-cancel-repair-20261022.diff)已保留。冻结 1,569 份输入；security/evidence 两个完整包共 629 主/5,091 条通过事件，tagged seed 两主/12 项、脱离源码 seed、Windows/Linux 探针、Linux 迁移程序、default vet 和冻结来源 postcheck 均通过，最终退出 0。复核脚本确认九份关键文件与被测来源相同，并独立确认旧 owner 及本轮 `.tmp-d-index-cache-1f4f82a9253c4c4ca611e20f3f827e1d` 均不存在。本轮源码、缓存、tmp、telemetry、二进制及比较用原探针副本均随准确 owner 清理；未安装依赖、执行 SSH/MySQL 或改变生产 Go 文件。当前整棵工作树未获本轮全部包背书，编译工件对应上述冻结清单。

修复完成时，实际 42 项仍待操作者使用下方原命令生成新来源清单并完整复跑；现已由页首 15:57 轮完整结果接收，未复用失败来源或拼接原 41 个通过项。以下“新增八项未执行”是准备阶段历史状态。

【2026-10-22 后续读取层来源变化】[四类详情读取上限](system-backup-d-task-execution-bounds-20261022.md)随后写回 task_execution.go 和新测试，并单独完成 read 全包两轮验证及清理。本页 743 项输入复核对应当时的 GC 准备版本；其当前文件检查会因后续读取层字节/文件集合变化拒绝，原回执和原探针摘要保留历史含义。实际 42 项仍应使用下方包装器生成新的同轮来源清单并执行完整门禁，不能把旧准备摘要替换为当前源码摘要。

状态：两份测试文件与两份派发文件已合入，隔离及合入后的完整复验通过，临时源码、构建缓存和测试产物已精确清理。新增八项真实 MySQL 实验尚未执行。已有 34/34 的实际结果保留为旧来源版本的历史验收；当前候选把同一 freeze profile 扩为 34 项前置实验加 8 项连接所有者实验，共 42 个实际叶子用例。

新增场景直接调用当前 Collect 使用的 beginDownloadGCConnection、commit 和 close。它们使用 UID/server/随机 schema 标记绑定的隔离 MySQL 夹具与临时合成账户，未调用完整 Collect，也未改变生产权限校验、角色或默认接线。

| 场景 | 独立观察要求 |
| --- | --- |
| known_commit_unlock | 提交成功后原连接仍持锁，同一连接显式 UNLOCK 后 ticket 消失，canary 已提交 |
| known_commit_discard | 提交成功后仍持锁；物理丢弃后准确原线程无 ticket，canary 已提交 |
| known_rollback_discard | owner 观察到回滚成功；丢弃后原线程无 ticket，canary 回滚 |
| commit_reply_lost | 驱动未收到真实 COMMIT 成功回包；owner 报提交未知，独立观察已提交与原 ticket 消失 |
| rollback_reply_lost | 驱动未收到真实 ROLLBACK 成功回包；owner 报回滚未知，独立观察已回滚与原 ticket 消失 |
| unlock_reply_lost | 提交已知成功、UNLOCK 回包未知；独立观察原 ticket 消失，保持两个结果的区分 |
| canceled_holder | 原线程被观察到执行阻塞查询后，取消原事务 context；独立观察回滚、原 ticket 消失 |
| killed_holder | 再核对准确 process/thread 映射后杀死该隔离连接；独立观察回滚、原 ticket 消失 |

每个场景先记录原连接/线程的 SHARED/EXPLICIT/GRANTED ticket，再核对提交或回滚结果、canary、原线程无残留 ticket，以及新借连接的不同 ID 和相同 server/schema/owner UID。重复 close 不得抹掉原不确定结果。取消和连接被杀时，驱动可能在发送回滚前或发送后失败；实验要求最多一次完整发送，不假定固定的内核时序。

成功回包丢失由测试专用 net.Conn 截断器制造。它只支持本夹具显式创建的无 TLS、无压缩连接，只跟踪四条固定控制命令；在指定命令完整发送后读取有界的协议帧，检查序号、terminal OK、零 affected_rows/last_insert_id 和事务结束标记，再关闭 socket，向驱动返回 EOF，不把该成功回包的任何字节交给驱动。这与在驱动 Commit 已返回成功后改写 error 的模型不同。ERR、EOF、不完整帧、错误序号、仍在事务中或仍有后续结果均拒绝，不能记作“成功回包被丢弃”。[MySQL 数据帧](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_basic_packets.html)、[OK packet](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_basic_ok_packet.html)。这些协议文档和本地单测不代替目标 MySQL 8.4.8 实测。

截断器已经过独立本地 2 主/17 项测试；移除成功回包有效性门禁的反例应准确击中 ERR、仍在事务、仍有后续结果三项。第二版隔离的完整 security/evidence 包通过 627 个主测试、5,065 条通过事件；tagged seed 两主/12 项、Windows/Linux 探针、Linux 迁移构建、脱离源码运行与派发门禁均通过并退出 0。合入后的完整复验同样通过 627 主/5,065 条通过事件；两个版本均保留 default vet，合入前后 743 项输入及文件集合复核一致。[准备回执](evidence/d-gc-owner-lifecycle-preparation-20261022-r2.json)与[清理回执](evidence/d-gc-owner-lifecycle-cleanup-20261022-r2.json)已生成。

原 34 项测试文件不变。phase 仅改变 Go 实际根测试选择及成功标记，新增根 TestDDownloadGCOwnerLifecycleMySQL 与原 TestDDownloadGCFreezeMySQL 一同运行。任一根失败都不得输出最终成功标记。新标记必须含 new_cases=42 prerequisite_cases=34 lifecycle_cases=8 component=backup-lock-prerequisites-and-owner-lifecycle freeze_adapter=not_wired scope=synthetic full_gc=not_run role_approval=no human_mfa=no provider_read=no production_approval=no。

本轮不据 Conn.Close 返回 nil 声称远端解锁，实际实验必须读取准确原线程的 metadata_locks，并在负向观察中复核 instrumentation 仍启用。观察器使用独立的合成夹具管理员连接，这不是生产 worker 的授权续期或生产清理协议。每个网络读取与观察均设置测试期限，但不把 Go/驱动调用描述为不可突破的系统调用耗时保证。未知结果与所有 CLEANUP_PENDING 身份必须保留。

完整 collector 的批准账户/权限漂移、全局锁顺序、完整 metadata/expected digests、owner/capacity/nonce/audit 原子性、规模与死锁、取消及不确定清理的生产状态机仍待实现或验收。[十二组协议要求](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)继续逐组核对，八项实验不使整组要求自动完成。


操作者运行入口继续使用 D 冻结来源包装器。本轮准备回执已达到 locally_validated_published_cleaned_actual_mysql_pending，在仓库根目录运行下列命令。它会生成新的同轮来源清单，先执行完整本地门禁，再在新建且 UID 绑定的临时 MySQL namespace 中执行 34+8 项；密码由操作者在终端输入。

~~~powershell
$lifecycleRun = Join-Path (Get-Location) ('docs\evidence\d-download-gc-owner-lifecycle-remote-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$lifecycleLog = $lifecycleRun + '.txt'
$lifecycleSource = $lifecycleRun + '-source.json'
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadGCFreezeOnly -Remote -SourceManifestPath $lifecycleSource *>&1 | Tee-Object -FilePath $lifecycleLog
$lifecycleExit = $LASTEXITCODE
"download_gc_owner_lifecycle_exit=$lifecycleExit" | Tee-Object -FilePath $lifecycleLog -Append
Write-Host "日志=$lifecycleLog"
Write-Host "来源清单=$lifecycleSource"
~~~

验收要核对两个实际根测试均通过、原 34 项与新增 8 项逐项结果，以及 8 组准确原线程持锁/释放、canary 和新连接身份记录。最终标记应同时包含 new_cases=42 prerequisite_cases=34 lifecycle_cases=8、二进制/输入摘要、synthetic 和未接线/未批准范围；还需最终退出 0、准确 namespace UID 及 remote scratch/local owner 清理记录。任何失败与 CLEANUP_PENDING 身份均保留，不能仅凭末尾 PASS 接收。原 34 项日志验证器绑定旧 phase/dispatch 字节，升级后其“当前文件”校验会与旧快照不同；旧日志和原来源清单继续作为历史结果，不把它改写成当前 42 项验收。

来源版本说明：首轮隔离版本通过 626 主/5,060 项，合入前共享 evidence 包新增业务报告测试，因此保存首轮结果并重新冻结；第二版为 1553 份输入，摘要 5e4044ad6ffc8a818d7ce8b96d29fe0de5fd802a8ba657786153ce798d76cf17。四份本轮候选字节在两版中相同。第二版隔离测试后，上游 report.go 又有并发变化；[合入输入差异](evidence/d-gc-owner-lifecycle-published-input-overlays-20261022-r2.json)归档两版原字节和摘要，合入复验对新版本单独运行完整包并检查 743 项项目输入及文件集合。隔离探针二进制仍对应冻结版本，不能把其摘要描述为整棵当前工作树。这个业务报告依赖只有本地合成集成覆盖，未据此接收新增报告的真实 MySQL 行为。

最终本地状态：独立[复核脚本](evidence/d-gc-owner-lifecycle-review-20261022-r2.mjs)在清理前和清理后均通过；准确自有目录 .tmp-d-index-cache-3d426c330a554ab298d97639612abb42 下 6977 份文件已删除，包含两版临时源码、缓存、tmp、telemetry、Windows/Linux 测试二进制和迁移二进制。另以文件系统 stat 独立确认目录不存在。未安装依赖或执行远端。本轮 8 项真实 MySQL 实验仍未运行，当前 42 项 profile 不继承旧 34 项的实际通过状态。
