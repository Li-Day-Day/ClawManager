# D：四类 Admin 详情权威来源交接

【2026-10-22 历史详情 HTTP/MySQL 十六项本地准备完成】[探针、限定回执及操作者命令](system-backup-d-verification-http-history-20261022.md)已发布两份 tagged 探针与专用源码冻结入口。第二轮隔离/写回后普通 server 各七主/22 条通过事件、default vet、Windows/Linux 构建、832 项输入及文件集合复核通过；1,564 份冻结来源与测试字节留档，准确 owner 的 14,177 份文件已清理并独立确认不存在。首轮独立清单参数失败保留，未发布且 14,038 份文件已清理。发布后包装器 FreezeOnly 再确认同一探针及限定输入，另清理 1,565 份文件；六份并发 A 审计脚本差异单列，不扩大为当前整树测试。实际新增十六项 SQL、包装器 A 子调用及远端仍未执行，B/C 已由用户确认为未交付，当前 freshness、真实 proof、完整 GC 与原六项继续待验收。

【2026-10-22 B/C 交付状态确认】用户明确回复 B/C 生产适配器“未交付”。真实 capture/target proof、artifact/capability 当前事实仍无可接入实现；preflight 的当前源可用性、引用版本、目标 schema、capability expiry 与 evidence availability 有界 freshness 检查继续未就绪，不能用保存的历史 valid 字段替代。D 继续准备可独立验收的历史详情 HTTP/MySQL 探针；本条仅记录交付状态，不是 B/C 接收、生产接线或原六项完成证明。

【2026-10-22 校验历史详情的矛盾字段保护已接收】[实现与验证](system-backup-d-verification-consistency-20261022.md)在共同控制读取层拒绝非 committed backup 被标为可用，并要求 restored_usable 对应 full 的 false→true；health 升级拒绝也纳入共同边界。合法 catalog-import null 状态和原始可用性观察保持。旧代码对照准确击中 44 叶子，24 项合法/既有拒绝控制通过；隔离及写回后 read 完整包各 97 主/943 条通过事件、default vet、268 项输入及集合复核通过。准确 owner 及 2,915 份文件已清理，无依赖安装或远端。当前 artifact-verification 历史详情已有真实只读代码入口，本轮补字段一致性；不据此证明 C 同版本实际验证、当前 provider/下载、其余三类详情或原六项整体完成。

【2026-10-22 四类详情执行记录有界读取已接收】[缺陷、边界和本地证据](system-backup-d-task-execution-bounds-20261022.md)为 attempt 与 Job observation 两个共同前置读取分别增加 LIMIT 10001 和 10,000 行应用保护；范围内完整保留，超量关闭游标、丢弃局部快照并回滚，不调用后续详情构造器。旧代码对照准确击中 24 叶子且 32 范围内控制通过；隔离及写回后 read 完整包各 95 主/873 条通过事件、default vet、267 项输入及文件集合复核通过。1,555 份冻结来源与测试字节留档，准确自有目录及 2,914 份文件已清理，未安装依赖或执行远端。既有索引仅作静态对应，实际计划/工作量、Owner 来源、公共执行投影、完整详情与原六项仍未完成。

【2026-10-21 校验历史详情接线】[artifact-verification 历史详情](system-backup-d-verification-detail-20261021.md)按机器合同的 before/after 语义完成字段来源组装：同一授权事务内读取 Task 时间、最高 verify attempt、当前 owner check 汇总、检查证据绑定及两个报告的登记元数据。保存的 source/observed checksum/前后状态是本次校验的历史投影，不据此声明当前 C provider 或报告可用性；早期表中的“当前 C 状态”缺口不能扩大为这个历史 DTO 必须在线探测 provider。完整读取包和新详情用例本轮已通过，主 API／DB 检查及跨平台编译仍在执行，真实 SQL／现场下载未验收；其他三类当前事实仍按原 owner 边界补齐。

【2026-10-21 检查结果元数据来源已补】[ReadTaskCheckControl](../backend/internal/systembackupread/task_check_control.go)在 Task、执行和详情控制贡献的原 RepeatableRead/最终授权事务内读取 `system_backup_check_results` 的固定元数据，绑定安装、准确任务类型/ID 和已存在 attempt。完整保留历史检查，核对模式/类别、状态伴随字段、时间、重复 ID/检查身份和证据引用配对；不选择 expected/actual 正文及其摘要。查询按既有 target/checked_at/id 索引的次序排序，最多 10,000 条加一条溢出探针，超限拒绝而不截断。getter 复制记录，嵌套贡献均禁止 JSON 序列化；完整 builder 使用 `readTaskCheckControlInTransaction`，不能在独立快照提交后拼 Owner 事实。

[本地回执](evidence/d-task-check-control-preparation-20261021.json)接收最终 8 根/73 项及读取/安全两完整包 339/2,764、默认 vet、源码复核；首版 7/69 只作局部记录，第二版增加与既有索引匹配的排序及稳定性对照。发布 1,470 输入与最终冻结完全匹配，准确 source/cache/tmp/telemetry 已清理，无依赖安装或远端执行。这不选择当前报告/attempt，也不聚合为公共 VerifierSummary；保存的引用尚未证明证据 owner/hash 或当前可用性。部署读取账号仍需受审的 check-results SELECT 权限，真实 SQL/EXPLAIN、A/B/C 来源、当前阶段规则和完整详情 HTTP 仍待完成。

【2026-10-21 同事务读取的提交后取消边界】[本地回执](evidence/d-read-late-commit-preparation-20261021.json)补齐七份读取文件的八个提交出口：驱动 Commit 即使返回成功，请求已取消也只返回零结果/`ErrUnavailable`，不返回详情贡献、事件正文、配置、游标或授权 404；正常缺行、空列表及已有最终授权复查保持。40 场景/161 项覆盖四类任务的列表、基础、执行、控制及事件和配置/operation/总览，旧代码准确复现 39 个迟到结果，已有回填来源防护作对照。读取与安全两完整包 331/2,691、默认 vet、源码复核通过，发布 1,468 输入与冻结完全匹配；首轮缺行夹具异常及准确自有进程终止单列保留，修复只涉及新测试，所有自有构建产物已清理。没有安装依赖或运行实际 SQL。A/B/C 当前事实、公共多 unit 执行规则和完整详情 HTTP 仍待完成。

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
