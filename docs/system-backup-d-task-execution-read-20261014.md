# D 任务详情执行来源与事务接点

【2026-10-22 四类详情执行记录有界读取已接收】[缺陷、边界和本地证据](system-backup-d-task-execution-bounds-20261022.md)为 attempt 与 Job observation 两个共同前置读取分别增加 LIMIT 10001 和 10,000 行应用保护；范围内完整保留，超量关闭游标、丢弃局部快照并回滚，不调用后续详情构造器。旧代码对照准确击中 24 叶子且 32 范围内控制通过；隔离及写回后 read 完整包各 95 主/873 条通过事件、default vet、267 项输入及文件集合复核通过。1,555 份冻结来源与测试字节留档，准确自有目录及 2,914 份文件已清理，未安装依赖或执行远端。既有索引仅作静态对应，实际计划/工作量、Owner 来源、公共执行投影、完整详情与原六项仍未完成。

【2026-10-14 最新真实 MySQL 验收已通过】[索引 v2-r2 联合回执](system-backup-d-admin-read-index-v2-r2-remote-20261014.md)中 execution 子测试、full-schema 父测试、A 授权、HTTP 与迁移全部 PASS，指纹匹配、清理完整、最终退出 0。四类执行记录和双连接快照竞争的限定数据库缺口已关闭，无需执行下方相同输入的独立命令；完整公共 phase/generation、其余 Owner 来源及详情 HTTP 仍待完成。下方本地和待远测描述保留其交付时范围。

日期：2026-10-14。范围是四类任务详情的 D 执行记录贡献：共同 Task、全部 attempt 和当前 Job observation。完整详情还需要 A 的报告/脱敏、B 的恢复/清理与 C 的准确 artifact/catalog 事实，HTTP 详情保持未开放。

## 同一快照与授权

[readTaskInTransaction](../backend/internal/systembackupread/task_detail_base.go)改用 RepeatableRead：共同 Task 和 D 执行记录的普通一致性 SELECT 共享一个数据库快照，后续 Owner builder 的普通 SELECT 也须沿用它。Owner 若需锁定当前读取，必须另核对准确版本/绑定与锁序，不能把当前读取自动当成此前快照的一部分；MySQL 对一致性读取和锁定读取的区分见[官方说明](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)。A 的授权与最终复查继续使用真实当前权限及必要行锁；成功 COMMIT 后才返回。缺行仍先复查权限再返回 not_found。SQL、构建、取消、撤权和提交不明都返回零结果；授权原因在内部保留给既有 HTTP 错误映射，不公开原始错误。

builder 获得只含 Query/QueryRow 方法的动态包装，不能断言为 `*sql.Tx` 或取得 Exec/Commit/Rollback。它仍属于受审内部实现，必须使用只读 SQL 和受信安装；这个方法包装不能代替数据库 SELECT-only 凭据或 Owner 证明。

生产 Admin 读取连接还须具备 `system_backup_attempts` 和 `system_backup_job_observations` 的受审 SELECT 权限及既有 A 授权查询所需权限；本轮没有变更 controller/Job grants。隔离探针的 root 数据库连接只验证真实 SQL 和 A 应用授权，不证明专用生产数据库账号已部署或完成权限正负测。

## 已实现的权威执行读取

[Reader.ReadTaskExecution](../backend/internal/systembackupread/task_execution.go)返回不能 JSON 序列化的 `TaskExecutionSnapshot`。Task、Attempts、JobObservations 的 getter 返回值或独立切片；嵌套记录也禁止序列化，不作为公共详情 DTO。

- attempt 表没有安装 ID；查询重新 JOIN 已授权类别的任务表，限定受信安装、准确任务 ID 和类型。读取全部 attempt_no/phase 单元，校验类型/ID、正整数范围、状态/phase/失败闭集、开始/结束关系、版本及重复键。
- Job observation 同时绑定安装、任务类型和 ID，并与本轮已读 attempt_no/phase 对应。核对准确 schema、UID/unit key、generation、sequence/digest、观测/进度时间、版本、relay 绑定窗口及重复 unit/UID。缺少对应 attempt 或任一行损坏则整个结果失败，不忽略异常行。
- 不选择失败文本、config snapshot、checkpoint/certificate 内容、relay identity ref、command slot、provider locator 或恢复资源 inventory。返回的是记录贡献，不是新任务写权限或完整运行证明。
- 没有执行行时返回已查询的空切片；心跳/观测序列推进不改 `BusinessProgressAt`。多个 capture unit/phase 可能并存，本组件不按字典排序或 MAX(generation) 猜测公共 `current_phase` 和 `job_generation`。

后续完整详情须调用内部 `readTaskExecutionInTransaction`，在它的 builder 中补充各 Owner 来源和合同闭集组装，随后经过统一最终权限检查及提交确认。不能先提交 ReadTaskExecution 再拼接另一个时点的报告或 artifact 状态。完整公共 ExecutionProjection 的单一当前阶段/多 unit 选择规则需与 controller/B 执行状态共同确定；本贡献不新增公共规则。

## 验证范围

本地用例覆盖四类 SQL 范围、历史 attempt 与多个 Job unit 的完整保留、空执行、心跳不推进业务进度、副本/序列化边界、损坏/孤立/重复行、SQL/流错误、初次/最终授权原因、缺行复查、同事务 builder、取消与 commit 失败零结果。读取包 44 个顶层/含子测试 181 项已全部 PASS（执行记录新增部分为 5 个顶层/74 项），默认 vet 保留。Linux 读取包与 tagged MySQL 探针编译均通过，最终退出 0；专用二进制/cache/temp/telemetry 已清理，另核对本轮准确目录不存在。没有安装依赖，也没有运行远程测试。

[本轮机器回执](evidence/system-backup-d-task-execution-local-20261014.json)绑定四个 D 变更源文件、完整本地 transcript 和清理检查；Linux 读取包二进制摘要为 `baa4890e79f3cc9debc56ab925ac199a0cf3534fbbf5c2a0833527d730366ed5`，包含新增断言的 A/D tagged MySQL 探针为 `2be0508d2eddfc71d6a081ae77ef5c6fafa62f5bac836c84ba9fd2aa82999b9e`。静态另查 11 个 attempt 与 21 个 observation 投影列均存在于 067/076。编译与静态检查不计作真实数据库验收，源文件清单也不声称冻结整个依赖图。

现有 `TestDAdminReadFullSchemaMySQL` 新增 `task_execution_scoped_attempts_and_progress`：四类任务的两条 attempt 与 Job observation 读取、跨安装拒绝、心跳不改进度。backup 另用真实 A 授权建立一致性快照，然后另一个数据库连接提交进度变化，断言详情仍读到此前快照，并独立确认竞争写入已提交；父测试会话撤销后也核对执行记录读取拒绝且为空。这项针对 ReadCommitted 混合时点问题；旧索引回执不包含新代码/断言。

后续由操作者运行独立 AdminReadOnly 档位，保存新文件，成功条件为新增子测试、父测试、A/HTTP/迁移全部 PASS，摘要一致、准确 UID 清理/两端缓存清理和最终退出 0：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-task-execution-mysql-remote-20261014.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D task execution MySQL validation failed' }
  Write-Output 'D_TASK_EXECUTION_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

不需要重新执行已通过的索引测量，索引候选及正式迁移性能决议沿用独立记录。尚未完成的四类完整详情、Owner 签收、生产接线和浏览器验收继续以[字段来源交接](system-backup-d-detail-source-handoff-20261012.md)为准。
