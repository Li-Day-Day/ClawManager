# 公共 schema 清单补登：责任路由草案与未关闭策略

来源：PR 功能基线 `bfdb2917`，公共 `backup@8ef5fa7f`。CI 原失败停在 ownership inventory freshness check：旧清单 100 对象，当前嵌入 migration 有 121 对象，加 `schema_migrations` 共 122。没有新增/修改 SQL、执行 DDL 或连接现场数据库。

本次在原分工计划 5.1.1 登记漏项的**评审责任路由草案**，按现有六域定义及实际源码分配 A 8、B 13、C 1，未增加 D 域控制对象。这里的 owner 是待复核接收方，不代表已审批；所有 22 项的 registry `decision_status=pending_owner_review`，classification/backup/restore/normalizer/verifier 继续为空，approved reviewers 为空。没有扩大 collector allowlist、修改 frozen/acceptance 状态或移除 strict blocker。

## 逐表依据及复核接收方

| 表 | 路由 owner/category | migration | 实际读写依据 | 待复核方与重点 |
| --- | --- | --- | --- | --- |
| northbound_owner_records | A/users | 067_add_northbound_owner_records.sql | `backend/internal/ownerrecords/store.go`、dashboard/growth/worker；scope+owner 聚合，instance 可选，migration 明确账号历史不能随实例删除 | A 确认归属；B/C/D 核对跨域事实、隐私、聚合/历史及 worker 重放，尚不能判定全部可再生 |
| gateway_keys | A/ai_gateway | 050_add_gateway_keys.sql | `gateway_key_repository.go`：token_hash、managed instance key、撤销与模型权限 | A，B/D 联核凭据/归属；不能自动恢复有效 token |
| gateway_key_budget_reservations | A/ai_gateway | 052_add_gateway_key_budget_and_attribution.sql | `gateway_key_repository.go`：预算预留及 pending/image_pending 结算 | A，B/D 联核未结算与幂等，不能原样重放 |
| gateway_key_budget_ledger | A/ai_gateway | 同上 | `gateway_key_repository.go`：reservation 唯一结算与费用计入 | A，D 核对历史及重复扣费防护 |
| llm_model_user_grants | A/ai_gateway | 062_add_model_user_access.sql | `llm_model_repository.go`、`llm_model_access.go`：模型可见性与用户授权 | A，B/D 核对身份映射和最终权限 |
| routing_classifier_settings | A/ai_gateway | 060_add_routing_classifier_settings.sql | `routing_classifier_setting_repository.go`：模型路由分类器配置 | A，D 联核参数/Secret ref/模型依赖 |
| gateway_image_artifacts | A/ai_gateway | 072_add_gateway_image_artifacts.sql | `services/gateway_image_artifact_service.go`：图像结果加密、过期与按用户读取 | A，C/D 联核外部对象、encryption_key 及 TTL；它不是系统镜像 |
| gateway_image_jobs | A/ai_gateway | 073_add_gateway_image_jobs.sql | `services/gateway_image_job_service.go`：图像生成 request/idempotency、预留、费用、终态 | A，B/D 联核取消/结算/幂等墓碑，不能重新派发旧 Job |
| gateway_runtime_tasks | B/instances | 063_add_gateway_runtime_tasks.sql | `gateway_task_repository.go`：instance/generation/session/task 及撤销/完成事实 | B，A/D 联核运行身份与历史语义 |
| gateway_runtime_task_models | B/instances | 同上 | `gateway_task_repository.go`：task→model 关联及模型授权联查 | B，A/D 联核模型身份、依赖和权限 |
| gateway_runtime_protocols | B/instances | 064_add_runtime_protocol.sql | `runtime_protocol_repository.go`：实例协议能力与 generation | B，D 联核目标重探测，源能力报告不授权目标 |
| gateway_runtime_maintenance | B/instances | 065_add_runtime_maintenance.sql | `runtime_maintenance_repository.go`：实例维护、gate、活跃 writer/queued inputs 报告 | B，A/D 联核 gate/report 归一化，不能复制源维护权限 |
| gateway_runtime_upgrades | B/instances | 066_add_runtime_upgrade_fence.sql | `runtime_upgrade_repository.go`：原 operation/generation 升级状态 | B，A/D 联核不复活未完成升级 |
| gateway_runtime_upgrade_stops | B/instances | 067_add_runtime_upgrade_stop.sql | `runtime_upgrade_stop_repository.go`：停止目标与 confirmation_scope | B，A/D 联核证明作用域，不能当目标执行端证据 |
| instance_lifecycle_scheduler | B/instances | 064_add_instance_lifecycle_batches.sql | `instance_lifecycle_batch.go`：批次调度单例/epoch | B，D 联核目标初始化/排队/drain，源调度权不迁移 |
| instance_lifecycle_manual_guards | B/instances | 同上 | `instance_lifecycle_batch.go`、`northbound_repository.go`：实例手动操作占位 | B，D 联核原 mutation/批次归属及清理 |
| instance_lifecycle_batches | B/instances | 同上 | `instance_lifecycle_batch.go`：批次策略、暂停、取消与汇总状态 | B，A/D 联核身份/策略与恢复不续跑 |
| instance_lifecycle_batch_items | B/instances | 同上 | `instance_lifecycle_batch.go`：批次 item、runtime pod 与 operation 对应 | B，A/D 联核外键/源操作归一化 |
| instance_lifecycle_batch_attempts | B/instances | 065_add_lifecycle_batch_retry_policy.sql | `instance_lifecycle_batch.go`：失败尝试与 retry_round | B，D 联核历史保留与不重新调度 |
| runtime_rollout_checkpoints | B/instances | 068_add_runtime_rollout_checkpoints.sql | `runtime_rollout_checkpoint.go`：rollout 原 state_json | B，A/D 联核源操作 checkpoint 不成为目标重放指令 |
| instance_workspace_write_intents | B/instances | 068_add_workspace_write_intents.sql | `workspace_write_repository.go`、`runtime_upgrade_writers.go`：operation/instance/owner/generation writer intent | B，A/D 联核原 pending intent、源停止与目标无活动 writer |
| team_workspace_file_audits | C/teams | 072_add_team_workspace_file_audits.sql | `team_workspace_file_audit_repository.go`：团队 workspace 文件审计 | C，A/B/D 核对用户/实例/团队身份与路径隐私；不归 Skill Hub 对象域 |

上表 migration 均在 `backend/internal/db/migrations/`；未写目录前缀的 repository 文件均在 `backend/internal/repository/`。明确“待复核”而非代替其他 owner 做策略决定；特别是账号 owner records 与 AI 图像对象的跨域边界需原 owner 最终确认。策略批准后应另提交 schema-registry-decisions 与实际 adapter/verifier，不能只改状态。

## 扫描器与生成物

- Repository CREATE/ALTER 仅扫描生产 `.go`，排除 Go 约定的 `*_test.go`；保留平台特定生产文件及全部 `.sql` migration。新增临时目录测试同时证明生产 DDL 仍被发现，测试 DDL 不再污染运行时来源。未更改严格门禁条件。
- 当前 5 个 repository ALTER 命中全部来自测试 fixture，修复后 `repository_runtime_create=0/repository_runtime_alter=0`。没有据此修改任何 repository 业务代码。
- 更新生成 ownership inventory 与原 draft registry，同步 A 的 canonical fixture；生成 inventory 固定 LF，避免 Windows checkout 在 byte-exact freshness 检查中产生额外差异。
- 跨 owner 的 `schema_policy_submissions` 同步为 A 23/B 37/C 17 项提交请求；仅扩展待提交策略清单，不改 D/C 既有交叉复核列表、public contract reviewers 或任何 approval evidence。
- Windows 本地回归发现 metrics registry 与 Prometheus 生成 YAML 被 checkout 转为 CRLF；将这两个按 bytes/hash 校验的既有文件固定 LF，保留 canonical 内容与原 `59755b65…` source hash，不修改 PromQL/阈值或预期摘要。
- 原 A collector 仍只支持 15 表，没有添加这 8 个 A 路由漏项。正例 fixture 明确模拟已支持的历史 A 范围；新增反例验证完整扩展 registry 即使伪造 freeze flags 仍不能进入旧 collector。没有降低生产捕获门禁。
- 所有直接 registry 使用方均已核对：A 单测、证据交付单测、隔离 verification lab 成功用例显式使用原基线的 `schema-registry-historical-15.json` 历史测试快照，并各自在内存造 synthetic approvals；canonical fixture 仍精确同步新 122 对象 draft。A 与 lab 均增加完整扩展 canonical 拒绝用例。没有在生产 A reader 或 lab main 增加忽略新表/自动回退旧 registry 的逻辑；lab 默认读取新 canonical 时拒绝未支持范围，旧演示需显式指定历史 fixture。
- CI 同款模板一致性测试另发现两份空白 deployment/capacity 模板仍钉旧 migration digest `0a2fc9ee…`。通过原 `emptyTemplate/capacityTemplate` 与当前实际 136 份 migration catalog 核对，仅同步 `migration_catalog_sha256=dba576ad…`；用结构判等证明其它字段未变。没有改 migration SQL、生成算法、Go 执行门禁、空白身份或启用/派发配置，也没有把现场 schema hash 当已观察。

## 可通过与仍拒绝的检查

普通 `schema-inventory --check` 和 `contract-check --check` 校验生成物与 draft 结构；不把草案提升为可执行策略。更新后共 122 对象、68 policy recorded、54 policy pending，22 个本轮补登均包含在 pending 内，既有 68 项 cross-review pending 和现场 schema hash 缺口仍保留。

`schema-inventory --strict` 仍因原缺失的 3 个公共 catalog 控制表拒绝；`contract-check --strict` 仍因 pending policies/cross reviews、draft/missing artifacts 与现场 schema evidence 缺失拒绝。CI 的开发构建可继续检查其它项目，P0/acceptance 仍不准入。

验证日志、源码 pin 与原生退出码见 `docs/evidence/b-schema-intake-20261028/`。没有安装依赖、执行真实迁移或合并 PR；没有通过删除 workflow、allow-failure、改枚举或伪造 reviewer 来消除红灯。此前已记录的专用 cache 清理策略拒绝仍未绕过。
