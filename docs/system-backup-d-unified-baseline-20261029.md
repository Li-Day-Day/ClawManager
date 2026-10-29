# D 统一集成基线与接手接口（2026-10-29）

本提交接收 C `5874d7d7fba480fcefbd8ae6e9a3ef22d61442d3` 的执行链，以本地 `4fe83bcde5a8a693dddb2635e9a3e397d6e3472e` 为父提交。所有后续 owner 从本文件所在集成提交开发，不再各自续写两套 controller。C 的历史验证见 `backup-team-integration/validation.json`；它不是本次集成字节的验证结果。本轮验证记录见 `system-backup-d-baseline-validation-20261029.md`。

配套 E2E、CI、部署与本地 TLS/RBAC 保留审查见 [后续补齐记录](system-backup-d-team-companion-review-20261029.md)。该记录同时纠正了首次接收 Team 部署清单造成的旧初始化/TLS 配置回退。

## 最终选择

| 项目 | 唯一选择与边界 |
| --- | --- |
| 公共控制表 | `system_backup_v2_*`；API、授权/session/revocation、controller、read、observer 同步映射。禁止影子 legacy task。 |
| 业务共享 gate | `system_backup_gate`，由 `systembackup.Gate.BeginVersionedCaptureJournal/HoldVersionedCapture/ResolveVersionedCapture` 连接公共执行；`backupgate` SQL driver、HTTP/work-unit、后台服务边界共同执行。`system_backup_v2_maintenance_locks` 仅保留既有控制元数据职责，不能另作公共采集暂停权威。 |
| 唯一生产 controller | `cmd/system-backup-v2-controller`，只接收 `SYSTEM_BACKUP_EXECUTION_PROTOCOL=public-v1`。旧 `cmd/system-backup-controller` 明确退出；server 不再启动 TeamDataService 的另一条采集循环。不同 lease 名不能作为双控制器互斥证明。 |
| 公共 API | `/api/v1/admin/system-backups`、`/system-backup-preflights` 的 POST、GET及 `/:id/cancel`；原 request-bound 授权和同事务审计不变。历史 `/admin/system-backup` 仅允许读取；`/team-data/*` 本提交不注册，领域源码保留供公共链接入，不宣称其历史页面可用。未配置 public-v1 不选择替代 writer。默认 `/admin/backups` 进入公共 `/admin/backups/records`，不进入已停用的 Team 独立任务页面。 |
| 当前可执行范围 | `platform-workspace`、单 `workspace`、`functional_test`，Runtime 实例必须为空。正式六域、acceptance、发布与独立还原仍未完成。不能把 validating 当正式成品。 |
| B 已有实现 | writers/composition/relay/relay_auth/relaywire 与本地基线字节相同；吸收 C 的 ResumeBarrier、RecoveryAdmission、RecoveryOnly、按 task 分隔 staging 增量。 |
| 本地补充保留 | API 原生 TLS listener；registration-only 模式 logout 撤销 fallback；独立 observer 同步到版本化控制表。旧实验命令和 fixture 不作为生产装配入口。 |

## 迁移映射与现库边界

正式映射：`backup-team-integration/sql-map.json`；迁移目录采用 C 完整 164 文件，catalog 由 `scripts/backup-team-catalog.py --check` 校验。不得把本地旧目录与 C 目录叠加，也不得改名后跳过 ledger/hash 校验。来源 SQL 可从父提交恢复，C 的 `reference/` 仅供审阅。

- 本地公共 065–077 → C 096–108；080 registration →109；081 prune identity→110。
- 本地 082 execution records → C 122；C 119 admission、120 plans、121 send intents、123 runtime journal 为执行链追加迁移。
- `backup_import_map.json.source_git_sha` 仍为 `d3c5715a`，其完整 schema/ledger 不含本地新增 082。**本提交未宣称支持直接导入 4fe83bcd 现库**；后续 D 必须新增并验收完整来源 profile，不能只改 source SHA。
- `checkBackupControlSchema` 在 DDL 前拒绝同名异构旧表；`ApplyPinnedMigrations` 固定 server UUID/数据库/catalog/历史；`ImportBackupCopy` 只接受 `cm_import_<32hex>` 隔离副本。此源码提交未执行现场迁移、切换 engine 或部署。
- 全新/已验证 Team-v2 测试库可按 C 入口准备；旧 backup 现库在新 profile 验收前保持拒绝。所有旧 observer grants、pins、现场脚本必须按新表名重新审核；不得直接复用旧验收输出。

## 文件归属与可调用接口

| Owner / 文件范围 | 对外接口与接收者 | 事务/证明边界与下一步 |
| --- | --- | --- |
| D：`cmd/server/system_backup_tasks_live.go`、`systembackupapi/{public_sql_writer,sql_writer,deployment_admission,cancel*,sql_details}.go` | `NewAdmittedTaskWriter` → `NewSQLApplication`；API 给前端/操作者 | 请求规范化、SQL authorization/audit、capacity/readiness、幂等同事务；controller 不得绕过 admission。 |
| D：`cmd/system-backup-v2-controller/{main,public_capture}.go` | `runConfiguredPublic` → `systembackupexecution.NewDeploymentService` → `Run` | 专用 metadata SQL pool 与精确 grants；leader election/Pod UID、独立 forward/recovery pins。 |
| D：`systembackupcontroller/execution_*`、`sql_execution*`、`released_capture.go` | `TaskExecutionLoop`、`SQLCaptureGate`、`ExecutionJobPorts.BeforeResume` 给 B | 原 claim/attempt/generation、加密计划、原 Job UID、single-send intent、collector 停止证明；SQL gate 的状态不能由 worker 自报推进。 |
| 共享 D/B：`systembackupdispatch` | `Authority/Input/BackupSpec/Plan/Ports`；新增 `ResumeBarrier.BeforeResume(context.Context, Authority) error` | 原 Ports ABI 不变；生产 `ExecutionJobPorts` 强制内层实现 barrier，缺失拒绝。Plan 必须原字节/原 hash，禁止恢复时重新 Discover。 |
| B：`systembackup/publicadapter`、`systembackup/relaywire` | `NewPublicRunner`、`NewRuntimeWriterBuilder`、`RuntimeWriterSpec/RuntimeWriterDependencies/WriterCallbacks`；D 注入，C 接领域模块 | `RecoveryAdmission` 独立于 forward，缺省沿用 Admission；`RecoveryOnly` 禁新发现；writer/relay 不持有控制表写权限。非空 Runtime 构造尚未进入当前 platform profile，由后续 D/B 共同接通。 |
| A：`systembackupsecurity`、`systembackupbootstrapsecurity`、`systembackupcatrust`、`systembackupnoncebootstrap` | request-bound action/read authorizer、signer/provider/grant 适配给 D/B/C | 表名同步但原授权语义不放宽；真正 task key、KEK 包装/解包、正式用途与历史撤销读取仍需 A 接收后补齐。 |
| A/D：`systembackupexecution/{deployment_*,public_identity,public_job_security,public_stop_proofs,public_recovery}.go` | `NewDeploymentService`、`NewPublicCapture` | forward 只 prepare/capture/issue_worker，独立 recover 授权绑定原任务/UID/generation。forward 失效仍可按恢复权收敛，但不能自动获取新执行权。 |
| C Teams：`systembackup/team_data*`、领域 registry | 向 B 提供真实 collector/writer 差集、冻结内容与引用证据 | 不恢复旧 Team 独立 controller；非空 Teams 数据、历史、关联和不重放策略在后续领域接入完成。 |
| C Skills：Skill 服务、领域 registry/内容采集 | 向 B 提供八表、版本对象、workspace 和异步 writer | 与同一 checkpoint/gate 对齐，未打包内容不能遗漏后声称成功。 |
| 公共 C：artifact/finalizer/catalog、`systembackupread` 适配 | `CurrentTaskFacts.Backup/Preflight`、`ManifestReader.Read(ctx, CurrentFactsSQL, snapshot)` 给 D | 当前完整正式成品出口仍待实现；manifest 原字节/不可变版本/hash，详情沿原 SQL 快照，不用 legacy 包改写冒充当前 wire。 |
| D：`internal/db`、`migrationcatalog`、Dockerfile、部署入口 | catalog、导入 profile、镜像工具给所有 owner | 新 SQL 追加、完整 hash 更新；单 controller；不要把检查通过当现场授权。 |

## 配置接手点

controller 必需 `SYSTEM_BACKUP_V2_CONTROL_PLANE_ENABLED=true`、`SYSTEM_BACKUP_CONTROLLER_ENABLED=true`、`SYSTEM_BACKUP_EXECUTION_PROTOCOL=public-v1`；固定 `SYSTEM_BACKUP_PUBLIC_CONFIG_FILE/SHA256`、`SYSTEM_BACKUP_FORWARD_GRANT_SHA256`、`SYSTEM_BACKUP_RECOVERY_GRANT_SHA256`。`SYSTEM_BACKUP_ENABLED=false` 只关闭新 forward，不得取消恢复所需的 controller。

API 使用同协议、`SYSTEM_BACKUP_READ_LIVE_ENABLED=true`、`SYSTEM_BACKUP_READ_SESSIONS_ENABLED=true`、`SYSTEM_BACKUP_EXECUTION_PROFILE_FILE`、`SYSTEM_BACKUP_CAPACITY_REPORT_FILE`、`SYSTEM_BACKUP_V2_EXECUTION_ENABLED`、原 read pins/cursor key。TLS 使用 `SYSTEM_BACKUP_API_TLS_CERT_FILE/KEY_FILE`，不能以 Forwarded header 冒充真实 HTTPS。前端生产构建需 `VITE_SYSTEM_BACKUP_LIVE_READ=1`；Dockerfile 默认已设置，缺后端装配仍显示不可用而非示例成功。真实凭据、grant、配置与挂载不随 Git 分发。

## 联审与接手顺序

本轮 A/B/C 三个角色独立源码联审，结论已落实：A 要求同步授权 SQL、独立 recovery、专用 pool；B 确认 writer/relay 字节不变并补恢复 barrier 顺序回归；C 确认共享 gate 必须整体接收、164 迁移不能叠加、旧导入 profile 不覆盖 4fe83bcd。这是代码角色审查，不冒称现场 owner 的人类签署或现场验收。

下一步：A 接真实安全适配；D 提供 Runtime 控制回调与已认证 relay SQL 接收；B 接非空实例和模块入口；Teams/Skills 接领域数据；公共 C 接正式成品出口；D 最后组合 publishing/终态和隔离还原。任何接口变化先更新本清单和对应回归，所有 owner 引用同一集成 SHA。