# Skill materialize 停写与取消清理最小集成（2026-10-28）

本轮仅接入 PR `14768599f30846e9cfe22c121059ecf698e1b048` 的五个选定文件，并修复启动回填在 gate 关闭期间被永久丢弃的问题。没有引入 PR 的独立 SQLStore、control ledger、controller、main 装配或全局 middleware；也没有改变当前 A/B/C/D 公共 API、read 或 controller。

导入文件是 `services/skill_package_materialize_worker.go` 的 gate 小增量、`services/backup_mutation_gate.go`、五根原 gate 测试，以及独立 `systembackup/mutation/gate.go`/两根 registry 测试。原 worker 的 `StartContext`、`StopAndWait`、等待真实退出后重启、部分 claim 释放、取消后加入所有 job 和未开始 claim 清理、错误汇总均保留。五文件的 PR Git blob、原工作区 hash、导入 hash 在 `evidence/c-skill-gate-source-import-20261028.json`；PR→本地新增修复的 hash 和两个差异 patch 见 `evidence/c-skill-gate-local-delta-20261028.json` 及 `c-skill-gate-local-*.20261028.patch`。

`BackupGate` 必须在 worker 启动前固定。permit 覆盖整个 backfill 或一次完整 claim/batch，包括所有子 goroutine、取消后的 `ReleaseToPending` 和等待；释放错误与原 claim/清理错误一起保留到 drain 结果。`StopAndWait` 超时不释放仍在工作的 permit，也不当作已经停写。

PR 原 backfill 只在启动调用一次，gate 关闭时直接返回，重开以后不会再回填。这次新增私有 `backfillAttempt(ctx) (admitted bool, err error)`：公开 `backfill(ctx)` 仍保持拒绝时立即返回且不写；loop 仅在尚未成功进入 permit 时按原 tick 重试，实际进入后只尝试一次，并且释放返回后才允许 claim。取消后不重试，也不借新阻塞 Wait 改变直接调用语义。新增两根测试验证关闭→重开后恰一次回填、先释放回填 permit 再 claim，以及等待期间 `StopAndWait` 取消不写。

nil registry/worker gate 维持原 disabled 安装行为，不能据 `Enter` 返回 nil/no-op 推导 capture 资格。这个 registry 只有进程内配置指针，没有 SQL 权威、participant ACK、epoch/fence 或跨进程停写证明；生产 capture 仍须明确装配原共享可信 gate 并证明完整 writer inventory。不能在运行中替换全局 gate 或 worker.BackupGate。没有默认配置任何真实 gate。

## PR 全局 middleware 的准确审查

PR `backend/internal/middleware/system_backup_gate.go` 仅豁免 `/health`、`/healthz`、`/readyz`，以及精确 `/api/v1/admin/system-backup` 或其后跟 `/` 的 singular 子树。它会对当前 plural 的 `/api/v1/admin/system-backups`、`/system-backup-preflights`、`/system-backup-operations` 及其它原控制面路径调用 business gate。closed 时会先回 503，导致状态、manifest、撤权后的拒绝结果以及合同要求继续可用的安全操作无法进入原 handler。其现有测试只覆盖旧 singular cancel；没有证明当前公共路径。

这不是把 prefix 改成 `/api/v1/admin/system-backup*` 就能解决的问题：该通配会混淆新任务、只读、清理、权限变化和未知路径。建议在实际注册时按 **method + 已注册 route pattern** 绑定分类（例如 Gin `FullPath()` 对应的固定模板），保留每个 handler 原 A 授权和阶段守卫：

| 路由/操作 | 当前注册状态 | 原合同分类与后续处理 |
| --- | --- | --- |
| GET `/api/v1/admin/system-backups`、`/:id`、`/:id/events`、`/:id/manifest`；preflights、drills、artifact-verifications 对应 GET；config、operations 等 GET | 当前 live read 注册；部分读源仍精确 unavailable | 只读控制面，应能进入原 read scope/snapshot/recheck；不要被 business capture gate 的全局拒绝遮蔽。保持安装、session、RBAC 和 provider 边界，GET 不能自动视为免认证。 |
| POST `/api/v1/admin/system-backups`、`/system-backup-preflights` | 当前已注册 mutation handler；真实依赖不齐返回 not_ready | new-work，原 operation policy 要求 `effective_enabled`、`system_backup.operate`、幂等和原事务准入；不能因控制面 prefix 免 business gate 而跳过这些检查。maintenance gate 与 kill switch 是不同规则，不能互相代替。 |
| POST `/admin/system-backups/{id}/cancel`、preflight/drill/artifact-verification cancel；`/cleanup-staging`、drill `/cleanup`；finalization/ownership resolution | 当前所核 live task 注册函数未注册这些 mutation；OpenAPI/operation-policy 已定义，不把合同当作已接线 | 原 policy `allowed_when_disabled`；必须在注册时单独归为安全收尾，允许进入原状态/ownership/permission/MFA/幂等协议。不能用 middleware 普通 business permit 阻断取消和安全清理，也不能由“safe”标签扩大删除权限。 |
| config、hold、proof registration、promotion revoke、lease recovery、后台 health/catalog/evidence reconcile | 各自原 handler/协议处理，非本次新增装配 | 主计划 §14 的 kill-switch 例外仍适用；是否属于同一 capture snapshot 的安全控制动作，由原阶段/锁/权限协议决定，不新增全局授权旁路。 |
| 普通业务请求，包括具有流/last-seen/异步副作用的 GET | 原业务路由 | 不能按 GET 一概旁路；必须用 B 完整 writer inventory 核对。HTTP permit 只覆盖 `c.Next()` 的生命周期，已脱离的异步工作还要独立 permit。 |

原 §14 及 `admin-operation-policy.json` 要求 GET、cancel、cleanup、resolution 等 kill-switch 例外继续可用；这一规则不等于授权在 capture 中随意写业务数据。route 分类必须保留两种门禁的分别判断。原 middleware 也未处理 `release()` 返回错误，不能据 handler 已返回成功证明 permit 已安全释放；须由共享 gate 保留失败事实并按原审计/告警协议处置。本轮不把它装到 main。

PR middleware 的 `backup_maintenance` 错误 envelope 也不是现 v12 闭集 `{code,message,details,request_id}`，不能直接挂到公共 backup 路由覆盖原错误协议。后续应以各已注册 operation 的原错误映射为准，并补 method/route 分类、原权限拒绝、关闭期间 GET/cancel/cleanup 和普通副作用 GET 的实际回归。

## 验证与清理

本轮验证使用当前工作区，不引用 PR 原测试通过作为当前结果。选择当前所有 worker/生命周期/取消相关根（共20根：原默认和实例限流、原11根生命周期/取消、PR五根 gate、新增两根 backpressure）及 registry 两根；实际命令在 `evidence/c-skill-gate-validation-20261028.ps1`。仅使用既有依赖，固定 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off`；actual go-list 的源码/嵌入文件在前后留档。

父 D 明确允许从其准确 owner 的两位 hex CAS 目录只读复制缓存。`evidence/c-skill-gate-cache-copy-20261028.json` 记录256目录、0复制错误；目标是本轮自有 `.tmp-c-skill-gate-20261028-56d0f9/cache`，不共享写入，也不复用测试结果（`-count=1`）。完成状态以原生日志、源集合/字节后检和准确 owner 清理回执为准；没有真实 capture、SQL gate 或现场停写成功结论。
