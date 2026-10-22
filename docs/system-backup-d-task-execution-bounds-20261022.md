# D 四类详情执行记录的有界读取（2026-10-22）

【2026-10-22 后续读取包来源变化】[校验详情一致性](system-backup-d-verification-consistency-20261022.md)随后写回 task_detail_control.go 与新测试；当前 read 包另以 97 主/943 条通过事件两轮验证并清理。本文 95 主/873 项、267 输入及其复核器对应限流修复时点的版本，当前文件/集合检查会因后续变化拒绝；旧回执保留历史含义，不改摘要来冒充整棵当前源码。

状态：一份运行代码与一份新测试已写回工作区，隔离及写回后完整包验证通过，本轮临时源码、缓存和构建产物已精确清理。此次只处理四类任务详情共同使用的 attempt 和 Job observation 读取，不改变公共 DTO、数据库 schema 或生产权限。完整 Owner 来源、公共执行投影和完整详情仍待接通；不能据此启用示例详情或绕过 unavailable。

原 readTaskExecution 的两条 SELECT 没有 LIMIT，两个循环会把所有有效历史行写入切片和映射。与已有检查记录的 10,000 行保护相比，这个共同前置读取仍可随历史重试和 Job 单元增长而扩大内存、传输和事务持有时间。

实现对两种记录分别设置 10,000 行上限。SQL 保留原可信安装/任务 JOIN、固定字段和排序，增加 LIMIT 10001；应用在第 10,001 行扫描和加入集合前关闭游标，丢弃整个局部快照并返回 ErrUnavailable。它不选一个“最新” attempt，不截断为看似完整的数据，也不删除数据库历史。上限针对返回行数，不限制合法 attempt_no 本身。

attempt 溢出时不会发起 Job 查询；任一种溢出都不得调用后续 Owner/detail builder，不得执行最终授权重查或 Commit，原事务回滚。10,000 行以内仍完整保留，继续沿用一个 RepeatableRead 事务、可信安装授权、最后重查与提交边界。已有缺行、授权撤销和私有字段保护继续由原包验证。

新增测试覆盖 backup、drill、preflight、artifact_verify，以及 attempts/jobs 两种来源和 0、1、9999、10000、10001、10002 六种行数。惰性驱动故意忽略 SQL LIMIT，并检查实际交付行数、游标关闭次数、后续查询/构造器/授权重查/提交是否发生；这样 SQL 与应用保护可以分别被验证。单独的 SQL 断言要求恰好一个 LIMIT 10001。

旧代码对照恢复冻结时的原 runtime 字节，仅保留新测试。该对照实际准确失败 16 个超量行为场景和 8 个 SQL 上限断言，并通过 32 个范围内控制场景；这不是编译失败。完整 systembackupread 包已在隔离和写回后各执行一次，保留 default vet；项目实际 Go/嵌入输入及保守运行资产范围已前后核对。

这项上限限制应用接收和保存的行数，不证明 MySQL 扫描量、排序代价、Rows.Close 内核耗时或生产索引计划。实际数据库工作量和代表性规模仍需独立实测；此次不请求新增服务器运行，也不覆盖原 42 项 GC 实机验证。原 GC 所有者实验及其人工运行入口保持独立。

验证证据前缀为 docs/evidence/d-task-execution-bounds-20261022-81d0abd8，测试缓存、tmp、telemetry 与冻结源码统一放进带 owner marker 的本轮临时目录。仅使用既有依赖，验证进程结束后按准确归属清理。最终以准备与 native 回执为准。

静态索引核对：067 的 uk_sb_attempt_unit(target_type,target_public_id,attempt_no,phase) 与 attempt JOIN 的等值前缀和排序一致；076 的 uk_sb_job_unit(origin_installation_id,target_type,target_public_id,attempt_no,phase,job_unit_key) 与 Job 查询一致。本次只追加 LIMIT，未改迁移或宣称优化器实际采用这些索引。两份迁移字节包含在隔离来源和保守资产指纹中。

最终本地结果：隔离与写回后的 systembackupread 完整包各通过 95 个主测试、873 条通过事件，保留 default vet；旧代码对照准确失败 24 个指定叶子，32 个范围内控制场景通过。冻结来源共 1555 份，摘要 e95f6c871f83c197f24a2981adc36589adf45ac984a14345999522d05e4f3a05；267 项实际项目输入及保守运行资产和文件集合前后核对一致。这里只声明这次读取包及其选定输入，其他 Owner 的并发变化不据此获得整包或实际环境背书。

[准备回执](evidence/d-task-execution-bounds-20261022-81d0abd8-preparation.json)、[native/清理结果](evidence/d-task-execution-bounds-20261022-81d0abd8-native.json)及[独立复核脚本](evidence/d-task-execution-bounds-20261022-81d0abd8-review.mjs)保留两轮结果、旧代码对照、原始/测试后字节和清理记录。准确本轮 owner 及 2914 份文件已删除，另以文件系统 stat 确认目录不存在。没有安装依赖或执行远端命令，没有修改正式合同、迁移、生产批准或完整详情的就绪状态。
