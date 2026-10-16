# D 总览控制表读取与同事务组装接点

日期：2026-10-14。范围是 D 已有 065/066/067 控制表的内部读取，不是完整 v12 `OverviewResource` 或页面上线。

## 当前实现

[OverviewControlSnapshot](../backend/internal/systembackupread/overview_control.go)通过 `Reader.ReadOverviewControl` 返回安装/config 和四类任务、Operation 的分状态计数。它不包含完整总览所需的健康、baseline、清理积压、failure-domain 或 C catalog/import/prune 事实，禁止直接 JSON 序列化。未知任务类别的计数 getter 返回 nil，不把缺少类别适配解释为已测得零。

安装/config 来源通过同一受信安装的 JOIN 固定准确 active version，并持有共享行锁；校验 schema、安装、版本/row version 范围、matrix、监测状态和数据库 UTC 时钟。`LastEffectiveEnabled` 明确是 controller 已持久化的上次有效状态；组件不读取进程环境，也不自行将它改名为实时 `effective_enabled`。将来完整总览须由受审部署适配确认开关和当前 controller 投影一致。

任务计数用一个四分支 UNION ALL 查询读取全部行的 schema/type/status 分组，Operation 在同一 RepeatableRead 事务读取。没有分页 limit，不从首屏或游标数量推算。各已支持状态初始化为显式零；未知 schema/type/status、重复分组、零/负/越界计数或溢出的类别总数均失败关闭，任一查询/流读取失败不返回部分计数。该组件不聚合 `active_task_count`，避免四类任务被误当作总览全部任务类别；最终计数单位和状态集合仍按主计划与 Owner 签收。

## 完整总览的事务接点

内部 `readOverviewInTransaction` 已提供以下顺序：

1. A 的 `ScopeProvider.AuthorizeRead` 在当前 SQL 事务核对受信安装和读权限。
2. D 固定安装/config，读取全部已支持控制表贡献。
3. 完整资源 builder 在同一事务查询后续 Owner 来源。仅暴露 Query/QueryRow 方法，动态包装不暴露 `*sql.Tx` 或 Commit/Rollback；builder 属于受审内部实现，查询本身仍须只读，不能把方法包装当作数据库 SELECT-only 凭据证明。
4. builder 完成闭集和关系校验后，再复查 A 权限，确认 COMMIT，最后返回资源。build/SQL/取消/撤权/提交不明均返回零结果；安装/config 缺行仍先做最终权限复查。

完整 builder 必须使用这个事务接点，不能先提交 `ReadOverviewControl` 再拼接另一个时点的 Owner 结果。后续 Owner 适配须核对自身权限、准确版本/epoch、有效期和必要行锁，不因 D 的最终 A 权限复查而省略 Owner 证明。已有独立 control snapshot 只用于限定读取、诊断和接线验证。

## 验证与下一步

本地 fake-driver 用例覆盖大于页面长度的完整计数、空表显式零、getter 副本、禁止序列化、状态/类型/schema 漂移、重复组、溢出、跨安装/版本/监测状态异常、SQL/流错误、授权与最终撤权、commit 失败、缺行复查及 builder 失败/取消零结果。读取包回归和最终总览定向测试保留 vet 通过；Linux 和带 MySQL 标签的探针编译结果另登记到本轮机器回执，不将编译算作数据库执行。

[本地机器回执](evidence/system-backup-d-overview-control-local-20261014.json)已登记：读取包完整回归退出 0；最终总览 6 个顶层/含子测试 42 个命名用例及 vet 退出 0；Linux 读取包测试二进制与 A/D tagged MySQL 探针编译退出 0，摘要分别为 `eb4266d933befe219398fecd98c3f60a6a134962a339485be879b68993c0eece` 和 `c59a371d22d0437cd5d078ac18810d8aeb6d06162034ffb1892140ebef083658`。两轮自有临时目录均报告清理，另查确已不存在。未安装依赖，未保留构建产物，没有真实 MySQL 执行结果。

现有 [TestDAdminReadFullSchemaMySQL](../backend/internal/systembackupsecurity/read_scope_full_mysql_test.go)新增 `overview_control_complete_counts_and_installation_isolation`：使用真实 A request scope 和正式全 schema，核对本安装四条 backup、一条 drill/preflight/verify、三条 Operation；对照安装只见自身一条 backup 和零 Operation，会话撤销后 control 读取同样拒绝。这只验证四类控制贡献，不证明 catalog/prune、完整总览、查询负载或页面可用。

**后续真实 MySQL 已通过：** [索引档位完整远程回执](evidence/d-admin-read-index-mysql-remote-20261014.txt) run `sbk-mig-261014021937-5c65` 在 MySQL 8.4.8 上明确包含上述新增子测试 PASS、父测试/A 授权/HTTP PASS、清理和最终退出 0。A/D 探针 SHA-256 为 `c59a371d22d0437cd5d078ac18810d8aeb6d06162034ffb1892140ebef083658`，与本地编译回执相同，故本轮新断言已验收，无需再执行下面相同输入的独立命令。[接收记录](system-backup-d-admin-read-index-remote-20261014.md)保留输入、清理与限定范围；上方本地回执的 `real_mysql_run=false` 仍描述当时仅本地执行的事实。

以下是独立档位命令，仅供后续输入变更后需要重新验证时由操作者使用，输出另取新文件名以保留已有证据：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-overview-control-mysql-remote-20261014.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D overview control MySQL validation failed' }
  Write-Output 'D_OVERVIEW_CONTROL_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

验收要求同轮新增子测试与 `TestDAdminReadFullSchemaMySQL` PASS、A 授权/HTTP 探针和迁移门禁 PASS、准确二进制/DDL/catalog 指纹、run-owned 数据库/namespace UID/两端 scratch/cache 清理、最终 `D_OVERVIEW_CONTROL_REMOTE_EXIT=0`，且没有 `CLEANUP_PENDING`。旧回执不覆盖新增断言。

总览 HTTP 当前仍为 503。下一步接线以[逐字段来源交接](system-backup-d-read-source-formalization-20261014.md#总览逐字段权威来源交接)为准：补 A/B/C 权威事实及当前部署适配、正式计数口径和闭集 DTO 组装；对 COUNT/GROUP BY 查询补真实分布和计划/负载评审。已有分页候选索引不能代替聚合查询的性能回执。完成完整 HTTP/MySQL 与浏览器验收后才开放页面读路。

同日增量：[当前 promotion 记录及来源绑定](system-backup-d-promotion-control-read-20261014.md)使用本事务接点补充 D 数据库贡献，保持当前可用性与历史创建事实分离；其新增断言尚待真实 MySQL，不能把先前控制计数回执扩大为基线或完整总览通过。
