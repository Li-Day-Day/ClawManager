# D GC freeze 前置条件 MySQL 探针

【2026-10-22 当前本地入口扩为 42 项，新增八项实际待跑】[当前来源、证据和命令](system-backup-d-gc-owner-lifecycle-20261022.md)保留原 34 项并新增八项生产连接所有者生命周期实验，已完成本地复验及产物清理。本文的 34 项来源和日志继续作为历史记录；当前 phase/dispatch 两份字节已升级，旧复核脚本的当前文件一致性要求会拒绝这一差异，不把旧结果改写为当前 42 项实测。请以新说明的来源清单和最终 42 项标记运行并接收。

【2026-10-22 freeze 实际 34/34 已接收】[实际验收与下一步](system-backup-d-download-gc-freeze-mysql-accepted-20261022.md)核对 MySQL 8.4.8、001..081/96 份迁移、34 项通过、25 份精确 backup-lock 等待记录和退出 0。1,519 份来源清单及六份准备文件匹配；namespace/远端 scratch/缓存清理已报告，准确本地 owner 已独立确认不存在。只接收合成前置实验：freeze_adapter 仍未接线，完整 GC、角色批准、人类 MFA、provider read、生产批准和原六项仍未完成。下方“实际 freeze 待跑”为此前状态。

状态：6 个文件已发布，本地验证通过，临时源码、构建缓存及 Windows/Linux 测试与迁移二进制已清理。实际 MySQL 尚未执行。既有 GC task 的 18/18 验收保持独立；本探针不执行 `Collect`，也不批准生产角色。

本轮 security 与 evidence 两个完整包合计通过 620 个根测试、5,019 项含子测试，均保留 default vet；并发新增的 read 依赖另经整个包复验，93 个根测试、815 项含子测试通过。新探针的 tagged seed、脱离源码目录运行、无 owner 的拒绝对照以及 Windows/Linux 编译通过。最终冻结源码为 1,513 份文件，SHA-256 为 `fbbaad3223bff5149c885f8c4c82001cfdb47858fd8cee9d3136ec9448abe77b`。源码清单、父版本测试证据及 590 项实际编译/测试输入的范围复核共同绑定本次结果；并发修改的其他路径未纳入整棵工作树验收。

r4 曾出现 HTTP/2 时序断言失败与 900 秒框架总超时，该轮不接收。最终仅修正测试夹具：保留原有 4 秒下载期限与生产 5 秒独立结果预算，把故意等待移至最终审计和数据库身份复核之后的时钟查询前。三轮共 12 个协议子场景通过；禁用真实写截止时间的反例在 HTTP/1.1、HTTP/2 下均检测到超期明文。正确代码恢复后，r8 完整 evidence 复验通过，再由 r9 补测新增 read 依赖并重建探针。

探针仅针对操作者新建、UID 绑定的 `sbk-mig-*` namespace 内 MySQL。它先校验 namespace marker、server UUID、与二进制固定输入一致的 96 份正式迁移账本，再新建随机命名的两个数据库及临时账户。账户只有合成夹具所需权限，其中一个账户额外拥有 `BACKUP_ADMIN`，另一个作为缺失权限对照。现有生产权限校验器保持原样。

34 项实验包括：

- 25 类 DDL：表 create/alter/drop/rename、跨 schema 新增入向 FK，procedure/function 的 create/alter/drop，trigger 的 create/drop，event 的 create/alter/drop，view 的 create/alter/drop/algorithm，以及账户 create/alter/drop/grant/revoke。
- 9 项控制：缺失 `BACKUP_ADMIN` 原生拒绝、COMMIT 保持锁、ROLLBACK 保持锁、UNLOCK 不隐式提交、合法 DML、多持有者归属、杀死持有连接后回滚、明确解锁后池复用、临时表遮蔽及物理丢弃后的新会话。

每个 DDL 实验必须看到该 holder 对应的 `SHARED/EXPLICIT/GRANTED` 与该 waiter 对应的 `INTENTION_EXCLUSIVE/PENDING` backup-lock ticket，之后同一持有连接执行 `UNLOCK INSTANCE`，等待语句成功并验证实际元数据变化。连接存活时先经 `threads.PROCESSLIST_ID` 固定线程 ID，再直接按 `metadata_locks.OWNER_THREAD_ID` 查询；连接死亡后也不会因活跃线程表的一行消失而漏查残留 ticket。单纯等待或超时不算通过。每次等待都有上限；探针不自行启用 Performance Schema instrumentation。

`LOCK INSTANCE FOR BACKUP` 需要 `BACKUP_ADMIN`、允许多个持有者，其锁独立于事务结束；临时表 DDL 是文档列明的例外。本探针将这些行为作为部署版本上的实验要求。[MySQL 8.4 backup lock 文档](https://dev.mysql.com/doc/refman/8.4/en/lock-instance-for-backup.html)、[metadata_locks 字段说明](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-metadata-locks-table.html)。Event 始终 `DISABLE`，时间为服务器当前时间加一天，避开 2038 以后的调度限制。[Event 限制](https://dev.mysql.com/doc/refman/8.4/en/stored-program-restrictions.html)。

该探针未覆盖完整 metadata capture、批准的 expected digests、额外权限/生产角色漂移门禁、真实网络丢失 COMMIT 回包、取消/cleanup 不确定结果的生产状态机、全局 DDL 干扰规模与多参与方死锁，也未覆盖完整 collector 的 owner/capacity/nonce/audit 原子性。即使未来 34/34 通过，[完整协议验收清单](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)仍需逐组补齐证据，不能整体改成已完成。

成功标记必须包含 `new_cases=34 component=backup-lock-prerequisites freeze_adapter=not_wired scope=synthetic full_gc=not_run role_approval=no production_approval=no`。测试产生的数据库和账户按精确 owner marker 清理；外层保留既有 namespace UID、bundle/输入/二进制 SHA 校验与清理流程。失败时保留所有 `CLEANUP_PENDING` 身份；不使用批量服务器清理命令。

本地未安装依赖、未连接服务器。Git Bash 最初以 `0xC0000142` 启动失败；换用可工作的 PTY 后仍报 signal pipe 的 Win32 error 5，本地 Bash 语法检查未完成。新 phase 与此前实际运行的 phase 逐字归一后只允许常量替换；操作者运行入口的三脚本 Bash 预检仍会在远端执行迁移前检查语法。

新 freeze profile 的完整本地测试框架预算为 2,700 秒；其他既有 profile 保持 900 秒。仍运行所有原测试与 default vet，不改变生产中的操作截止时间。原失败、三次未复现诊断、被否决的两秒夹具及选点修订均留档，最终以准备、发布和清理回执为准。

操作者下一步执行新 profile。以下命令在仓库根目录的 PowerShell 运行，日志和来源清单使用新名称；仍由操作者确认服务器密码。入口先做本地门禁，再在既有 UID 绑定的临时 namespace 内执行迁移和 34 项合成实验。

```powershell
$freezeRun = Join-Path (Get-Location) ('docs\evidence\d-download-gc-freeze-remote-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$freezeLog = $freezeRun + '.txt'
$freezeSource = $freezeRun + '-source.json'
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadGCFreezeOnly -Remote -SourceManifestPath $freezeSource *>&1 | Tee-Object -FilePath $freezeLog
$freezeExit = $LASTEXITCODE
"download_gc_freeze_exit=$freezeExit" | Tee-Object -FilePath $freezeLog -Append
Write-Host "日志=$freezeLog"
Write-Host "来源清单=$freezeSource"
```

验收需同时核对 34 项实际结果、上述限定范围的 PASS 标记、二进制/输入摘要、namespace 名称与 UID 的清理记录、remote scratch/local owner 清理记录以及最终退出码 0。出现失败时先保留完整日志和来源清单；任何 `CLEANUP_PENDING` 身份按精确记录处理。此前 GC task 的 18 项通过不能代替这 34 项实测。

本地准备回执：[preparation](evidence/d-gc-freeze-probe-preparation-20261021.json)；清理回执：[cleanup](evidence/d-gc-freeze-probe-cleanup-20261021.json)。发布回执已生成而初次清理回执缺失，原 native handle 已不存在；单独校验目录归属、无重解析点与验证终态后完成恢复清理，精确删除本轮 owner 下 1,813 份文件。未清理其他任务的目录。
