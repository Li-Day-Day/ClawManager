# PR #1 与当前 v12 首链的兼容核对

2026-10-28；只读 `git show` / `git grep` / `git ls-tree` 核对 `origin/pr-1` = `14768599f30846e9cfe22c121059ecf698e1b048`。当前本地基线 HEAD 为 `63a13b2771091e4ba47b691ce066a670cbc88d54`，另有本轮 A/D 未提交实现。未 checkout/merge、未运行 PR 代码或迁移、未安装依赖、未触碰父 agent 冻结测试目录。本文件不代表测试通过或合并批准。

**结论：PR 确实提供了真实 B 执行与 artifact/catalog 编排，不能再称 B 没有实现；但其控制库、请求、身份和 manifest 是另一套协议，没有可直接填入当前 `SQLApplication` 的 Requests/Admission/CurrentFacts adapter。不能直接替换 nil，也不能执行其 schema 到当前 v12 数据库。**

## 逐项接线判定

| 项目 | PR 的准确实现 | 与当前 v12 的判定 |
| --- | --- | --- |
| 创建请求 | `control.Request`（`control/task.go:31`）：kind/profile/artifact/record_sha256/purpose/acceptance_policy；`Validate` 对 backup/preflight/source/profile/purpose 做实际校验，`{}` 被拒绝。handler `Create`（`:148`）使用 DisallowUnknownFields、4KiB 限额及 EOF 检查。 | 不等于当前 `TaskRequestContract.Decode`。Go decoder 不拒绝重复 key；可选 string 的 null 与缺失均落零值；没有已提交 v12 closed schema/default/null 决定。`Hash`（`task.go:73`）是 struct `json.Marshal` SHA-256，不是当前要求的规范化 JCS adapter，不能直接复用为已批准 request hash。 |
| 幂等/过期 | `SQLStore.Create`（`control/sql.go:77`）先锁同 actor/key，hash 一致即历史返回；profile TTL 仅限制新建；冲突返回通用 `ErrConflict`；无当前 v12 tombstone/过期分支。 | PR unique `(actor_id,idempotency_key)`，当前是 `(installation,actor_type,actor_id,endpoint,key)`。跨 endpoint、安装作用域、明确 idempotency_conflict/expired 和历史规则未对齐。 |
| TaskWriter/Admission | `SQLStore`（`sql.go:21`）内部打开 SERIALIZABLE、自行 commit；保存 request/profile revision，事务内 profile readiness/capability 检查。 | 不能装入当前仅有 SQL capability 的 `TaskAdmission.Admit`/`PreparedTaskWrite.Stage`：无 installation/config snapshot/next_reconcile_at/当前 A scope/recheck/capacity reservation/audit 协议；另开 tx 会破坏当前单事务要求。 |
| 任务身份/读详情 | `control.Task`（`task.go:86`）、`NewID` 生成 `sb-<32hex>`，TaskReport/CatalogView 读 PR journal。 | 当前要求 `sbk_`/`spf_` UUID、schema task.v1、原 read scope/snapshot/recheck。PR 没有相应 `TaskDetails` 或 `CurrentFacts` 实现，不能把 PR `Get`/Report 的独立读取拼到已提交的 v12 snapshot 后。 |
| HTTP/权限 | PR `main.go:537` 注册 `/api/v1/admin/system-backup/tasks` 等；Auth+SetUserInfo+NewAdminAuth，响应 `{success,data}`，cancel 用 If-Match。 | 当前是 `/system-backups`、`/system-backup-preflights`，A 的 installation/action/read 授权、同事务最终复查和 v12 typed DTO/error。PR 路由不是原权限门禁的等价物，不应替换当前 handler。 |
| 调度/领取 | `Controller.RunOnce`、`SQLStore.claim`（`sql.go:202`）真实选取任务、DB clock、SKIP LOCKED、generation/lease CAS，并同事务写 `controller_claimed` event。 | 真正能力存在，但领取的是 `system_backup_tasks`，没有 v12 next_reconcile_at/claim schema。不能把其 event 作为当前 observer 的 `diagnostic.b.task_claim_acquired`，除非实现受审同事务映射。 |
| 运行/Job/relay | `control.Pipeline` + `ProfileDriver.Discover/Bind`（`pipeline.go:16`）、`profile.Driver`、`host.RunWithAdapters`、Linux `cmd/backup-controller`/`backup-worker`。worker mTLS Ready/Acquire/Check/Complete；`SQLStore.AwaitWorker` 联合持久 result 与真实 JobComplete、UID/namespace/name 核对。 | 可复用实际执行组件和编排逻辑，但 SQLStore/Vault/worker grants/资源 journal 均绑定 PR control Task/表。未实现 v12 attempt/job-observation/status_relay schema 投影和原 installation/fence/authorization 接点。 |
| cancel/timeout/未知结果 | Controller 有续约、每阶段 deadline、取消阶段 context、Recover 后终态；不可取消发布后转 finalization_unknown，Service 有只读 publication resolver。 | 不是空壳，但必须将具体状态、failure code、can_cancel、未知结果、清理证明迁移到 v12。PR `finalization_unknown` failure code 与当前 backup unknown 必须 `failure_category=none` 不可直接复制。 |
| artifact/finalizer/catalog | `control.SixDomainPublisher`（`catalog_admission.go:195`）、`CatalogAdmission`（`:61`）、`CatalogActions`、`recovery.Publisher/Finalizer/Reader/AppendProvider`、Gateway、扫描/导入/脱敏报告。真实 owner/provider 缺失时拒绝；functional_test 与 acceptance 分开。 | 实现可供 B/C 审核和移植，但不是现有外部动作/产物提交/当前事实适配。`host.RunWithAdapters` 的 OwnerFactories、SharedWorkspaceFactories、CatalogCodecs 是明确工厂接点，需要真实材料和对应领域 owner。 |

## 必须先解决的 SQL/签名合同冲突

PR `control/schema.sql` 明确是**独立控制数据库**，`OpenControlDatabase` 强制 `cm_backup_control_` 前缀，不自动执行迁移。主表 `system_backup_tasks` 使用 ms 整数时间、profile revision；当前 v12 主表是 `system_backups` / `system_backup_preflights`，包含 installation、config 完整 snapshot、原授权/调度字段。

同名对象不能混装：

- PR `system_backup_events`（schema.sql:22）列为 `task_id,row_version,code,created_at_ms`；当前 migration 068 使用 installation/target/event_type/task_status/request_id/typed detail/UTC timestamp。
- PR `system_backup_catalog_records`（:161）为 `scan_id,key_hash,object_key,record_json`；不能仅因同名就宣布三张计划 catalog 表已经交付或 strict 门禁通过。PR 不提供当前计划的 imports/scan_states 两张表。
- PR `system_backup_prune_runs/items`（:212/:219）也与当前 migration 070 同名异构。

**签名 manifest 存在同版本异构：** PR `recovery.Version` 也是 `system-backup.v1`，但 `recovery.Manifest` 使用嵌套 `identity`、`git_version`、`created_at_ms`、`purpose`、`config_snapshot`、`business_domains`、`control_plane`。当前 `contracts/system-backup/v12/manifest-system-backup-v1.schema.json` 是 closed schema，要求平铺 installation/backup/attempt、git_commit/generated_at、runner_type/task_purpose、capture_certificate_hash、config_recovery、business_summaries、control_evidence 等。不能把 PR bytes 重新编码或重命名字段后保留原 checksum/signature；也不能因 schema_version 一致直接返回其 manifest。B/C 必须决定并实现唯一获准 wire schema、签名 envelope/purpose、canonical bytes/hash 与兼容策略。

PR 本身的 v12 `contract-manifest.json` 仍将 `recovery_catalog_records`、`restore_target`、`status_relay`、`catalog_scan_record` 标为 missing；新增 recovery contracts 没有自动关闭这四项正式交付。

## 可安全复用的准确接点与责任

1. **B**：以 `control.ProfileDriver` / `control.Execution` / `profile.Driver` / worker+kube 的实际实现为来源，提供当前 v12 task/config/claim/attempt/fence 的适配；保留单一权威任务账本及受审原 lock order。当前 `Pipeline.Store`/`Service.Store` 使用 concrete SQLStore，Service 还验证 store identity，不能只做 Task DTO 强转就接通。
2. **A/B/D**：把 profile readiness、受控 source/target/凭据映射、capacity 与原 action 最终复查装为当前 `TaskAdmission`，只使用 caller capability；不能在 `Stage` 中调用 PR `SQLStore.Create` 或跨两个数据库各自 commit。请求 decoder 应据已决 schema 实现重复 key/null/default/JCS，不直接采纳 PR Hash。
3. **C/B**：提供符合当前 read snapshot capability 的真实 artifact/source/preflight facts 和 immutable manifest reader；可复用 `recovery.Reader.Open(Object)` 的精确不可变版本思想及 provider observation，但要实际满足原 SQL snapshot、绑定、hash/签名和最终复查。
4. **D**：继续保留当前 v12 API/权限/SQLApplication/read boundary；在上述适配精确交付并回归之前，不把独立 PR control API 当作“首条 v12 真链”。若产品要切换为独立 control API/数据库，须先明确变更合同与验收范围，不能静默替换当前目标。

本轮只有静态源码核对和本文件，无测试/构建/迁移产物需要清理。PR 真实 Linux/MySQL/K8s、原权限/跨安装拒绝、同键重试、约定失败轮及 checksum 联调仍须在精确同版本输入与测试安装上执行。
