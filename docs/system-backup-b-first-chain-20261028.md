# B 执行接点与独立 SQL observer（D 本轮核对）

2026-10-28，起点 HEAD `63a13b27`，共享工作区可能同时包含 A/D 增量。本文件是源码事实及交付请求，不代签 B 领域合同，不宣称真实整链通过。

## 当前可用与缺口

| 接点 | 当前源码事实 | 下一责任交付 |
| --- | --- | --- |
| 任务领取 | `systembackupcontroller.ClaimCoordinator` / `AcquireClaimInInstallation` 实现 installation、row_version、数据库时钟、lease 和 next_reconcile_at CAS。 | B 提供真实可执行任务选择/领取/续约/释放的同版本 runtime 调用。现有明确生产 caller 是 `SQLDeadlineStore`，仅处理未开始任务的 deadline，不能称 B 已执行。 |
| 调度与状态推进 | `ControlLoop` 顺序执行 gate recovery、kill-switch、pending deadline 三个 D fail-safe pass，无 runner pass。 | B 提供 backup/preflight 主状态机、attempt 持久化、Job 派发/观测、relay 验证及终态事务。 |
| Job/relay | `system_backup_job_observations` 迁移及 D reader 已存在；A `systembackupevidence.TaskRuntime` 绑定 Job 身份，处理 Job 日志证据准备/发布。 | B 交付 `status_relay`、实际 relay endpoint 与认证绑定、消息闭集、序列/代际/进度/重放、Job identity 和取消/超时传播。A 的日志能力不代替 B runner。 |
| 取消/运行超时 | D pending deadline 有“无 attempt/外部副作用”保护，明确不能终结已执行任务；kill-switch 投影保留原范围。 | B 交付正在执行任务的取消/超时、fence、Job 清理和未知外部结果处置。不得直接把 pending deadline 套到运行中任务。 |
| preflight 输入 | migration 要求 source artifact、目标 profile/ref/hash、mode、compatibility；不是仅提交空对象。 | B/C/A 确认 closed request schema、默认/null、规范化/hash、source/version/freshness、同键冲突/过期与失败轮，D 才能生产连接。 |
| 缺失合同 | manifest 当前 `restore_target` / `status_relay` 为 missing。 | B 负责真实同版本交付；D 负责消费和路由，不代填领域决定。 |
| catalog | 三张 `system_backup_catalog_imports` / `records` / `scan_states` 计划表；`recovery_catalog_records` / `catalog_scan_record` 合同仍为缺失项。 | C 交付 catalog 领域 schema/reader/finalizer 契约；D 按原 catalog 归属与迁移门禁落实 SQL，不凭空创建表或改为 approved。 |

## 独立 SQL observer

实现位置：

- `backend/internal/systembackupobserver/observer.go`：真实 SQL 查询、SELECT-only 直接授权核对、固定安装/服务器/数据库/用户、独立连接、只读 repeatable-read、结束 rollback。
- `backend/cmd/system-backup-observer/main.go`：仅接收 kind/task/config version；受控 DSN 文件及操作员独立 pins 从专用环境变量读取，错误统一脱敏。
- `scripts/system-backup-d-sql-observer.mjs`：已有 `runSmoke` 的 `observe` hook；只允许 real 模式，子进程只继承 observer 专用输入和 Windows 系统目录，**不继承** `SBK_SMOKE_*` bearer/password、MYSQL_PWD、PATH 或 NODE_OPTIONS。

数据库身份必须独立于应用 writer/controller。当前工具要求六张表各自精确 `SELECT` 直接权限：`system_backups`、`system_backup_preflights`、`system_backup_events`、`system_backup_attempts`、`system_backup_job_observations`、`system_backup_evidence`；允许纯 `USAGE ON *.*`，拒绝 role、活跃 role、数据库/全局 wildcard、其他表、写权限与 grant/admin option。`SBK_OBSERVER_HOST` 必须固定为 `CURRENT_USER()` 中实际匹配的精确账户 host，与用户名一起逐字比较；禁止 `%` 等通配。它不是 DSN 服务器地址，也不应从旧 Pod IP 猜测。工具不创建用户、不执行 grants、不部署。远程 DSN 必须 `tcp` + `tls=true`，校验证书与主机名；仅数值 loopback 可无 TLS。拒绝多语句、任意文件、cleartext-password、interpolateParams 和自定义 SQL 参数。

输出检查 task/config、安装与幂等作用域 taskCount、config snapshot SHA-256/size、enqueue receipt、历史 claim receipt、distinct attempt_no、Job/relay 数、终态/category、manifest checksum，及 preflight evidence owner/hash 绑定。`currentClaimObserved`、`scheduled` 是当前事实；**绝不据此或 row_version/attempt 推导历史次数**。

`installationKeyCount` 额外在同安装、同 endpoint、同键下统计所有 actor；冒烟在重放后及负权限请求后均要求恰好一条。操作者须为每轮提供跨 actor 唯一的新 key。该统计可发现当前数据库/安装中其他 actor 的同键任务，但不能证明另一个安装或另一数据库没有写入。

observer 还独立核对数据库中 actor type/id、endpoint 与冒烟请求的管理员 ID 和幂等键 SHA-256；`tupleBound=true` 仅在全项匹配后输出。子进程只接收管理员 ID 和键摘要，不接收键原文或 API 凭据。用户手动调用二进制时也必须提供 `-actor-id` 和 `-key-sha256`，普通冒烟 wrapper 会自动传入。

成功 backup 除全任务 Job/relay 数外，还需同一只读 snapshot 中最新 capture attempt 为 `sealed`，且该 attempt 至少有一条 Job、现有 Job 的已持久 relay 状态全部为 `completed`。输出 `latestCaptureJobCount` 和 `latestCaptureCompletedRelayCount`；旧 attempt 的 relay 不满足这项检查。该查询不证明 Job 清单完整、Kubernetes Job 终态或 Worker 证据的完整认证，仍需 owner 的实际执行/结果核验。失败轮允许按约定在 Job 启动前失败。

生产 D writer 新创建同事务写 `diagnostic.d.task_enqueued`，同键重放不再写，observer 按真实事件计 `enqueueCount`。公共 claim 入口已在 CAS 同事务写 `diagnostic.d.task_claim_acquired`，详见 [领取协议](system-backup-d-task-claim-receipt-20261028.md)；只有观测到该历史 receipt 时才输出整数 `claimCount`。B runtime 尚未接入该入口；无 receipt 时输出 `claimCount: null, claimHistory: "unavailable"`，真实 smoke 终态校验会失败，不能把 attempt 存在当作领取次数。

B runtime 应接入公共 `SQLTaskClaimStore.AcquireWithReceipt`，并继续执行其原业务授权和执行门禁。该接入尚未完成，不代表 B 已确认或真实执行已通过。

## 现场命令

首轮操作者已指定远测身份 `zhanghui08`；精确安装 ID、server UUID、database、独立 reader 用户及 B/C 同版本输入仍需由受控环境提供。下列变量中的占位值不是可用材料，不能原样宣称实测：

```powershell
$env:GOTOOLCHAIN='local'
$env:GOPROXY='off'
$env:GOSUMDB='off'
# 在已有 Go/依赖的目标构建环境执行，输出放本轮自有目录。
Set-Location backend
go build -o <本轮自有绝对路径>/system-backup-observer.exe ./cmd/system-backup-observer
Set-Location ..
$env:SBK_SQL_OBSERVER_BINARY='<同平台 observer 的绝对路径>'
$env:SBK_SMOKE_OBSERVER=(Resolve-Path scripts/system-backup-d-sql-observer.mjs).Path
$env:SBK_OBSERVER_DSN_FILE='<独立 SELECT-only 受控 DSN 文件绝对路径>'
$env:SBK_OBSERVER_CA_FILE='<可选：受控的 MySQL CA PEM 文件绝对路径>'
$env:SBK_OBSERVER_INSTALLATION_ID='<操作员固定的安装 ID>'
$env:SBK_SMOKE_FOREIGN_BASE_URL='<另一个安装的 HTTPS 根地址>'
$env:SBK_SMOKE_FOREIGN_INSTALLATION_ID='<独立固定的另一个安装 ID>'
$env:SBK_OBSERVER_SERVER_UUID='<操作员固定的 MySQL server UUID>'
$env:SBK_OBSERVER_DATABASE='<测试数据库>'
$env:SBK_OBSERVER_USER='<独立只读用户>'
$env:SBK_OBSERVER_HOST='<MySQL CURRENT_USER 中精确的账户 host>'
node scripts/system-backup-d-api-smoke.mjs
```

Linux 目标使用同源码/已有依赖执行 `go build -o <本轮绝对路径>/system-backup-observer ./cmd/system-backup-observer`，其余变量名相同。DSN 不放命令行或日志。配置已有 smoke 的其余受控输入、精确请求文件、成功/约定失败轮；本工具不提供 credentials、不使用模型任务或 HTTP API 回读代替 SQL 事实。完成现场轮次后删除该轮自有二进制/cache/tmp，保留日志和 hash 记录。

设置 `SBK_OBSERVER_CA_FILE` 时，DSN 仍必须指定 `tls=true`；observer 使用该 PEM 作为专用信任根，并以 DSN 中的主机名验证服务器证书。文件缺失或无有效证书时拒绝连接；不设置时使用系统信任根。CA 路径由 smoke wrapper 传入独立进程，不传入 API 凭据。

真实冒烟在创建任务前要求当前安装的权限不足账号能通过当前 `/auth/me`，另一个安装的账号能通过其自身 `/auth/me` 和 live 配置读取，且两端配置分别匹配独立固定的 installation ID。当前和另一安装的 root URL 必须不同；远程必须使用 HTTPS。随后才检查它们对当前任务的拒绝；过期 token、相同 token 或未核验的异安装身份不能充当跨安装验收。若没有第二个可用安装/会话，真实跨安装轮仍未验收，脚本在创建前拒绝。

为不阻碍首条执行链调试，操作者可显式设置 `SBK_SMOKE_SCOPE=execution`；此时仍检查当前安装 pin、可登录的无权限账号、幂等、独立 SQL 执行和结果，但跳过异安装检查。输出状态为 `real_execution_observed`，并明确 `crossInstallation: "not_tested"`，不能记为完整验收。默认 `acceptance` 保留双安装要求。

连续两轮入口：在同一已就绪部署和同一配置版本下，设置 `SBK_SMOKE_SUCCESS_REQUEST_FILE`、`SBK_SMOKE_FAILURE_REQUEST_FILE` 为经各 owner 约定的真实闭合请求文件，设置两个不同且本轮唯一的 `SBK_SMOKE_SUCCESS_KEY`、`SBK_SMOKE_FAILURE_KEY`，并设置约定的 `SBK_SMOKE_EXPECT_FAILURE` 类别；其余认证、observer、scope 和安装变量同上。运行 `node scripts/system-backup-d-two-round-smoke.mjs`。入口先检查两轮输入，再依次运行成功和失败轮；每轮各自校验同键重放、权限、独立 observer 与终态，两次必须为不同任务且版本一致。遇到失败立即停止，不自动重试提交；已接受任务的脱敏身份随失败记录输出。`real_two_rounds_passed` 仅在完整 acceptance 下可能出现；执行调试范围仅输出 `real_two_rounds_execution_observed`，不算跨安装验收。输出不含请求正文、token 或密码。真实失败轮的触发与类别须经 owner 约定，不能猜测或通过模型伪造。

## 本轮验证边界

Go 原生 `go test ./internal/systembackupobserver ./cmd/system-backup-observer -count=1 -json` 检查独立只读事务/rollback、真实 receipts、缺历史时 unknown、跨服务器拒绝、snapshot 漂移/SQL 错误回滚、输入拒绝及 grant 限制；对应 driver 是隔离模型，**未执行真实 MySQL**。Node 两项实际检查子进程 credential 隔离与错误输入不启动执行。`node --test` 因环境子进程 EPERM 失败的原始日志保留，直接 `node scripts/system-backup-d-sql-observer.test.mjs` 两项通过。准确构建、源码 hash、退出和清理记录见 `docs/evidence/b-observer-validation-20261028.json`。
