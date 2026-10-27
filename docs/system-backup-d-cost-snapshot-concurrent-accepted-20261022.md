# D 成本并发快照与汇总差异实际接收（2026-10-22）

已核对操作者完整日志：MySQL 8.4.8 上，成本并发与四项汇总差异子测试全部通过，父测试 TestABusinessRestoreRowsMySQL 用时 8.56 秒，最终退出码 0。新增并发子项用时 0.10 秒，明确报告首个 COUNT 关闭、独立写连接提交、原 RR 快照不变及新 RR 事务看到变化。

五个子项为 cost_snapshot_concurrent_commit、cost_aggregate_money、cost_aggregate_tokens、cost_aggregate_currency_case、cost_aggregate_actual_NULL。日志还报告十五表完整列往返和回滚、正式 FK/collation 拒绝、SELECT-only 权限、SQL NULL 与精确 decimal 往返，以及 users=1001、quotas=1001、其他表各一行的有界数据量场景通过；这不等于完整 large-smoke.v1。

[完整日志](evidence/d-cost-snapshot-concurrent-remote-20261022-101417-6826f52e.txt)、[验收回执](evidence/d-cost-snapshot-concurrent-actual-accepted-20261022.json)与[复核脚本](evidence/d-cost-snapshot-concurrent-actual-review-20261022.mjs)固定本次接收。日志原字节 SHA-256 为 45bffb02fa03d7a654700778e206020ecf47bc486dc45b03b2bd107040ae7daa。

- 实际探针二进制 SHA-256：64679b73985747255ed3c73c6717e0028acf1511073aa8ffe0ca0fbcd5f0e0ed；同轮本地编译和远端成功标记一致。
- 实际迁移 CLI SHA-256：d70dcc018ab3b1f644a08e63b663ec3d39dffaa8fc662fb78ee6d824a12a1251。
- 正式迁移 catalog SHA-256：0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe；001..081 共 96 份迁移，逐个实际名称与此前固定清单一致。
- namespace：sbk-mig-261022023330-7a22；UID：07aab8cd-5998-4b2f-90c8-1b894f4bf08e。

日志报告 SELECT-only 账户、run-owned 数据库、namespace、远端 scratch 和本地构建缓存清理完成，没有 CLEANUP_PENDING。本轮日志没有输出准确的本地 scratch ID，复核者没有独立确认该目录或登录集群复查。四条 socket close 消息保留；接收依据完整测试、限定范围的 PASS 和退出码 0。

此前[本地准备](system-backup-d-cost-snapshot-concurrent-20261022.md)的三份测试文件在接收时与当时源码逐一匹配。准备记录中的旧二进制摘要与本轮重新编译的实际二进制分别保留，不互相替代。A 入口执行逐包测试和编译，并校验传输二进制与迁移 catalog；它未保存本轮源码清单或源码前后摘要。此前“逐包输入校验”的准备说明已修正。接收时的源码匹配不能倒推本轮完整历史源码，更不能作为整棵当前工作树的实测背书。

本次接收范围为合成、正式迁移后的十五表业务恢复夹具，以及成本计数/汇总的 RR 一致性行为。production_dump_proof=no 仍然有效；真实 B dump 认证、实际生产恢复写入器与授权、完整 large-smoke、完整 GC、角色批准和 D 原六项仍待分别验收。复核者没有安装依赖或执行远端命令。此前本地准备回执中的 actual_mysql=false 保留历史原义，实际结果单独记入本轮回执。

后续并发来源说明：准备连接所有者生命周期实验第二版时，restore_rows_mysql_test.go 已新增报告相关测试，冻结摘要为 77ea3c03be4c077b40fbd8e1b458aa78572a58772821db89e163b3da83653ff2，与成本准备时的 2df687e1d5da6f87de3aa462df598baaf084bdc7db36ebdd2bbeb186e843a016 不同。上述源码匹配是历史接收时点的观察；旧复核脚本对“当前文件”的要求可能因此拒绝，不能据旧五项日志认证新增报告测试。原始日志与验收回执保持不变。
