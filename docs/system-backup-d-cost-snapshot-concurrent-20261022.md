# D 成本计数与汇总的并发快照验证

状态：操作者实际 MySQL 结果已接收：五项成本子测试通过，新增并发子项 0.10 秒、完整恢复父测试 8.56 秒，最终退出码 0。详见[实际接收与来源边界](system-backup-d-cost-snapshot-concurrent-accepted-20261022.md)。

此前本地准备：三份测试文件已合入并通过本地及合入后复验。两轮完整业务包各通过 88 个根测试、396 项含子测试，均保留 default vet；tagged seed 1 主/3 项、脱离源码运行、Windows/Linux 探针及 Linux 迁移 CLI 构建通过。

冻结来源 1,524 份，摘要为 `5d43fb6dc511d21ff25287b25ef12d4f43bcc37ed534902d7a573e52e0316523`。208 份实际项目输入的原字节及 Go/嵌入资产文件集合在发布前、发布后均通过复核；96 份迁移 SQL 与一份 registry 嵌入 JSON 的文件集合也纳入门禁。仅改测试，不改变生产文件；不背书共享工作区的其他修改。详见[准备回执](evidence/d-cost-snapshot-concurrent-preparation-20261022.json)、[输入范围](evidence/d-cost-snapshot-concurrent-scope-20261022.json)及[复核脚本](evidence/d-cost-snapshot-concurrent-review-20261022.mjs)。

本轮准确自有目录中的 6782 份文件已清理，包括 source/cache/tmp/telemetry、Windows/Linux 探针和迁移二进制，并独立确认整个目录不存在。本地准备未安装依赖、未连接服务器；[清理回执](evidence/d-cost-snapshot-concurrent-cleanup-20261022.json)保留精确身份。

此场景补进既有 `TestABusinessRestoreRowsMySQL`，复用同一 run namespace UID、server UUID、随机业务库 owner nonce、正式迁移 catalog、SELECT-only 读账号和精确清理。只修改测试，不更改源端 collector 的 SQL、事务隔离级别、权限或生产接线。

探针先由原 `SQLCountCollector` 读取完整十五表计数及成本汇总，与既有夹具的认证输入比较。第二次采集中，第一个 COUNT 结果读完并关闭后，另一写连接提交原成本行八位金额最低位的变更；原采集事务继续执行全部原查询。它必须仍返回原有计数和摘要。随后新建的读取事务必须看到相同行数与新摘要，新摘要还必须匹配独立的完整成本行汇总计算。

同步点位于测试驱动的结果关闭路径，委托原始 BeginTx、QueryContext、结果读取及关闭，不使用 sleep 推测时序。关闭、取消或写事务失败时，采集必须失败并回滚，不得返回部分快照。写入只针对已有隔离库中一个明确 ID，失败回包也不假定没有写入；退出时再次核对 owner 身份并恢复原金额，外层继续执行既有精确数据库/账户清理。

MySQL 文档说明：Repeatable Read 中的一致性读取沿用首个一致性读取建立的快照，新事务可以取得更新快照。本轮已在隔离 MySQL 8.4.8 夹具中观察到该行为；其他部署版本仍须分别实测。[MySQL 8.4 一致性读取文档](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)。

此场景不提供真实 B dump 认证或恢复写入授权，不批准生产读写账号，不替代 DDL freeze、代表性数据量测试、34 项 GC freeze 前置实验或原 D 六项验收。

保留的复跑入口沿用 [A 完整业务恢复专项入口](system-backup-a-business-verify-handoff-20261013.md)，在仓库根目录 PowerShell 执行：

~~~powershell
$costRun = Join-Path (Get-Location) ('docs\evidence\d-cost-snapshot-concurrent-remote-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$costLog = $costRun + '.txt'
& pwsh -NoProfile -File .\scripts\system-backup-a-evidence-validation.ps1 -BusinessRestoreOnly -Remote -BuildParallelism 1 *>&1 | Tee-Object -FilePath $costLog
$costExit = $LASTEXITCODE
"cost_snapshot_restore_exit=$costExit" | Tee-Object -FilePath $costLog -Append
Write-Host "日志=$costLog"
~~~

完整专项会重新编译同轮探针。验收至少需要 cost_snapshot_concurrent_commit 子项和相应 first_count_closed/writer_commit/original_rr/fresh_rr 成功标记、整个恢复父测试通过、二进制与迁移输入摘要、准确 namespace/UID 清理和最终退出 0。保留完整日志及所有 CLEANUP_PENDING 身份。该 A 入口执行逐包测试与编译，并校验传输二进制和迁移 catalog；它未保存本轮源码清单或源码前后摘要，不能据当前文件匹配倒推同轮全部历史源码，也不能宣称实际运行验证了整棵当前工作树。
