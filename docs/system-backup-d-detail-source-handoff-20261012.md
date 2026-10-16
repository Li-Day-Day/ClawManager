# D：四类 Admin 详情权威来源交接

【2026-10-16 D 完整事件接口】[四类任务 events API 与独立事件页面](system-backup-d-event-api-20261016.md)已接线，详情 503 时仍能查看事件。依据第 6.2 节及 EventResource 机器合同，事件正文须入库前脱敏，旧“还需 A 读时脱敏”判断已更正。前端 221 项、浏览器四类/五语言/窄屏通过；后端最终本地回执见交接，真实 MySQL 新断言仍待执行。

【2026-10-16 后续 D 独立增量】[事件分页及详情 SQL 探针准备](system-backup-d-task-event-control-read-20261016.md)已完成安装/目标绑定、稳定截止与独立签名游标，详情四类真实 SQL 断言已接入既有隔离父测试。69/470 项 Linux 回归和 MySQL-tag 编译通过，实际 SQL 与 A/B/C 公共事实仍待验收。

【2026-10-16 D 独立增量】[四类详情控制字段读取](system-backup-d-detail-control-read-20261016.md)已补齐固定列、Task/执行/类型字段的同事务组装接点与内部不可序列化贡献，读取包 62/413 项通过（新增 7/101）。真实 MySQL、公共 ExecutionProjection、多 Owner 来源和完整详情 HTTP 仍待完成；下文早期仅有 Task/执行贡献的描述为历史状态。

日期：2026-10-12。v12 的 `TaskList` 已有固定字段读取；本页限定四类详情的后续组装，不把任务表的成功状态当成 artifact、演练或报告的证明。

| 详情资源 | D 可在同一授权事务读取的基础 | 仍须核对的权威来源 |
| --- | --- | --- |
| BackupDetailResource | `system_backups` 的目的、部署矩阵、目标风险、artifact 状态、校验和、注册、资格、人工保留与字节汇总 | `system_backup_attempts` 与 `system_backup_job_observations` 的执行进度；A 的 check/evidence 报告及脱敏判定；C 的 artifact/catalog committed、当前可用性和登记证明 |
| DrillDetailResource | `system_restore_drills` 的来源 ID/校验和、目标配置 hash、清理状态、预检/diff 证据引用和资格汇总 | B 的隔离恢复资源与清理结果；A 的验证报告；C 的准确源 artifact 当前状态 |
| PreflightDetailResource | `system_backup_preflights` 的来源 ID/校验和、只读模式、兼容性、报告/diff 证据引用和有效性原因 | A 的报告证据与有效期；B 的实际目标/差异执行结果；C 的源 artifact 可读性 |
| ArtifactVerificationDetailResource | `system_backup_artifact_verifications` 的校验范围、来源、观测校验和、前后可用性和决策原因 | A 的校验报告及计数；C 的准确版本、catalog 状态和不可用原因 |

共同的 `task` 字段由 [GetTaskBase](../backend/internal/systembackupread/task_detail_base.go) 固定列投影取得。`system_backup_attempts` 不带安装 ID，后续关联必须先在同一事务内取得受信安装的任务行，再按准确 `target_type`、`target_public_id` 与 attempt/phase 定界；不能把外部请求的任务 ID 直接用于跨安装 attempt 查询。Job observation、check result 虽含安装 ID，也仍须同时绑定任务类型、准确 ID 与受信安装。所有详情字段只读出合同允许的摘要和登记引用；不选择 `config_snapshot_json`、失败消息、check expected/actual JSON、provider locator 或恢复资源清单。

当前代码的 `readTaskInTransaction` 在同一事务中完成基础 Task 读取、内部详情构建回调和最终授权复查。回调失败、授权撤销、数据库错误或缺少权威事实均不返回部分详情；缺行经过最终复查才返回 `not_found`。回调尚未实现四类完整 DetailResource，也未注册生产 HTTP 路由。接入前需 A 提供正式 `system_backup.read` 会话/安装授权，并由相应 Owner 签收字段来源、脱敏和跨表一致性；使用隔离 MySQL 验证真实数据与撤权竞争后再启用。

2026-10-14 后续：[执行记录贡献与事务接点](system-backup-d-task-execution-read-20261014.md)已实现安装绑定 attempt JOIN、Job observation 的完整读取和关联/闭集校验。详情事务改为 RepeatableRead 并包装内部 SQL 接口，供完整详情 builder 同快照接入；A 正式读授权已有之前的独立验收，新增执行/快照竞争 MySQL 断言须以新回执验证。公共单一当前 phase/generation、A/B/C 其余来源和完整详情仍待完成，不能直接序列化内部贡献或把已有 TaskList PASS 当详情上线。
