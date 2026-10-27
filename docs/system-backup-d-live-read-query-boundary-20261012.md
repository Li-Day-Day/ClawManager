# D：Admin 真实只读查询边界

始于 2026-10-12，按时间追加实现与验收记录。最初 `/api/v1/admin/system-backup-*` 读端点仅有显式 fixture；前端非示例视图会拒绝 fixture 来源。2026-10-13 已为四类任务列表及 Operation 列表/详情接入受开关控制的生产读路，并通过下述限定范围真实 HTTP/MySQL 专项；总览、配置和四类详情仍未就绪。下文较早段落中的“尚无接线/回执”描述当时状态，以后续记录为准。

## 四类任务

`067_add_system_backup_task_execution_core.sql` 已分别建立 `system_backups`、`system_restore_drills`、`system_backup_preflights`、`system_backup_artifact_verifications`。四表共有 `public_id`、`origin_installation_id`、`task_type`、`status`、`config_version`、`row_version`、`created_at`、`updated_at`、`started_at`、`finished_at`，但各自状态集合和详情字段不同。真实列表/详情读取须采用每类固定 SQL 投影，始终把受信安装 ID 写入 `WHERE origin_installation_id=?`，按该表的准确公共 ID 前缀和任务类型核对结果；不得把请求中的安装 ID 当授权来源。

第一页应固定排序键与上界，后续页游标绑定资源类型、安装、过滤条件、limit、上界和位置。状态过滤按合同标记为 `eventual`；无过滤分页只有在同一固定上界下才可标记 `stable_cutoff`。空列表必须来自成功执行的真实查询；表缺失、权限失败、超时或数据库不可用返回 `not_ready`/相应错误，不能映射为空列表或 fixture。

任务详情只投影合同允许的 redacted 字段。`config_snapshot_json`、`failure_message` 和其他可能含私密内容的原列不能直接 `SELECT *` 后序列化。events/logs 分别受目标 ID、安装 ID、保留窗口、redaction 与分页约束；缺少受信记录时仍返回明确未就绪状态，不制造空活动记录作为成功事实。

## 总览与配置

`system_backup_installation_state` 提供准确安装的当前配置版本、有效启用、monitoring 和 matrix 行。`system_backup_configs` 是规范化列，不含可直接对外返回的完整 `config` JSON；Admin 配置 DTO 需逐字段投影、版本/hash 核对和 secret ref 脱敏，不能直接复用任务的原始 `config_snapshot_json`。总览的 controller、artifact、evidence、catalog、source writer 与恢复就绪必须各取权威观察；来源缺失时报告未知或未就绪，不能由备份任务 `succeeded` 推断恢复可用。

## 接入门禁

1. A 提供当前会话与准确安装绑定的 `system_backup.read` 生产授权，D 在数据库读取前调用，并在分页、详情和活动读取中保持同一授权边界。现有 `SystemBackupReadFixtureAuth` 仅检查 access token 和管理员身份，不满足此条件。
2. D 的查询/DTO 经合同及脱敏评审，使用隔离 MySQL 验证跨安装拒绝、分页漂移、缺表失败关闭、敏感字段不外泄和数据库错误传播。
3. 只有读服务、权限与来源标记同时就绪，才替换默认 `503 not_ready`。现有 `SYSTEM_BACKUP_READ_FIXTURE=1` 继续只用于固定数据联调，不能作为生产配置。

当前四表结构与前端分页边界已核对。[D 的任务页读取器](../backend/internal/systembackupread/task_pages.go)已在独立包中实现固定表投影、安装范围、内部 `id` keyset、状态过滤、后续页安装绑定、同事务授权与最终复查；原始页和行禁止直接 JSON 序列化。[专用游标 codec](../backend/internal/systembackupread/cursor.go)以独立密钥和域分隔的 HMAC 绑定安装、任务类型、状态、limit、cutoff 与位置，拒绝篡改、跨资源和非规范编码；[内部服务](../backend/internal/systembackupread/service.go)已串联读取器与游标，但仍禁止直接序列化。HTTP 层仍须从受信配置取得专用密钥。本地包测试覆盖四表选择、两页连续读取、跨安装游标拒绝、授权拒绝/撤销、数据库失败关闭、游标签名绑定和服务连续页；隔离 telemetry、默认 vet 均通过，临时缓存已清理。它没有默认授权实现，也没有注册 HTTP 路由。[候选索引 DDL](system-backup-d-admin-read-index-candidate-20261012.sql)列出每表的安装范围及状态分页索引，尚未编号或执行；需在隔离 MySQL 用实际任务量核对 `EXPLAIN` 和写入成本后评审。正式详情 DTO、A 权限、真实 MySQL 数据专项及浏览器验收仍未完成；现有隔离测试没有可复用的四类完整任务行 fixture，不能用空表结果冒充分页验证。

2026-10-12 后续增量：[列表 DTO](../backend/internal/systembackupread/task_dto.go)已用四表共同的非私密列生成 v12 `TaskList`，包含合同要求的 Task 字段、可空续页游标和一致性标记；投影拒绝跨安装、无效值和内部主键外泄。前端列表现按 `Task[]` 合同解析，详情仍按带 `task` 的各类 DetailResource 解析，修复了原先把列表也当详情读取的形状冲突。Go 包读取/DTO 测试和前端 37 项 Node 测试通过；未安装依赖，临时 Go 缓存已清理。四种详情含执行、校验、artifact 与 B/C/A 受信证明字段，尚不能只靠四张任务表合成；详情仍保持未就绪，不用示例值填充。[索引评审](system-backup-d-admin-read-index-review-20261012.md)已记录现有索引缺口与现场 EXPLAIN/写入成本判据，候选 DDL 未执行。

详情的共同 Task 部分已由 [GetTaskBase](../backend/internal/systembackupread/task_detail_base.go) 实现：按四类准确公共 ID 定位，同事务先授权、按受信安装读行、最终复查后提交；无效 ID 在查询前拒绝，缺行仍执行最终复查，跨安装或异常行失败关闭。`Service.GetTaskBase` 只返回脱敏 Task DTO，不是完整 DetailResource，也没有 HTTP 路由。后续组装执行、校验、artifact 和证据字段时，必须在同一授权事务中取得各自权威行并在最终复查后统一返回；不能把 `GetTaskBase` 的已提交结果与后续无授权读取拼接。四类读取、缺行/撤权竞争、SQL 错误和敏感列排除已有本地 Go 测试；真实 MySQL 与生产接线仍待受信输入。

内部 `readTaskInTransaction` 已进一步承载详情构建回调：回调在同一事务的任务读取之后、最终权限复查之前执行；回调错误或撤权不会返回部分结果。当前没有实现各类完整详情构建器；[字段来源交接](system-backup-d-detail-source-handoff-20261012.md)列出任务汇总、attempt/Job/check 与 A/B/C 证明的边界。该事务入口的顺序、回调内受信安装查询和撤权抑制已通过本地 Go 测试，测试缓存已清理。

后续读取加固：四表 Task 固定投影现包含并校验存储行的 `schema_version=system-backup-task.v1`；未知版本、重复或乱序的数据库行会使整页失败，不返回部分结果。前端列表读取会核对过滤状态、逐项状态、分页一致性和任务时间字段。上述本地检查不替代隔离 MySQL 的真实行、索引计划与权限撤销竞争验收。

详情读取客户端也复用完整 Task 字段校验，缺少合同必需字段或夹带原始配置快照的响应会被拒绝。此校验仅约束嵌套 Task；四类详情其余字段仍需各 Owner 的权威来源和完整投影评审。前端定向测试 37/37 通过，未生成构建产物。

后续 D 本地加固：后端 `ProjectTaskList` 在序列化前再次核对非空续页、页内 `id` 严格递减、同一任务类型、固定上界和末行游标位置，防止内部调用把不一致的分页结果投影为成功响应。`go test ./internal/systembackupread -count=1` 离线通过，专用 Go 构建缓存已清理。此检查不替代正式读授权、隔离 MySQL 真实行和索引计划验证。

配置真实读源另发现 [canonical 快照缺口](system-backup-d-config-read-canonical-source-review-20261012.md)：当前配置表只存展开列及 hash/size，而写入 hash 时保留 registry/ref 数组顺序。无法从该表独立重建并核验原 canonical 配置，故配置详情仍保持未就绪；候选追加迁移、准确旧行回填与隔离 MySQL 验证须另行评审。

D 已准备可空快照列的候选 DDL 和不暴露 HTTP 的内部 active-config 读取器；该读取器核对准确安装、active version、字节数和 SHA-256，并在 FinalGuard 后返回禁止直接序列化的内部结果。当前库缺列、旧行缺快照均失败关闭。v12 ConfigResource 的闭集 DTO 已有本地投影和合同摘要门禁；候选列未入编号 migration，A 正式授权、同事务新写路径和真实 MySQL 仍待完成。详见上述评审页。

配置读取又补同事务共享锁与全部展开列比对；页面只有在 canonical 字节、hash/size、安装 active 指针和 controller 消费的展开列一致时才可取得内部结果。静态 migration 列检查和本地列漂移拒绝测试已通过；候选 SQL 未执行，实际锁序及列类型仍待隔离 MySQL 验证。

D 另备好现有 `066` 表可用的旧行 canonical 原文只读核对器，用准确版本、hash/size 和展开列验证回填输入；它不写库、不返回可直接序列化的资源。bootstrap 新写路径的 canonical 参数也已作为候选生成，但运行时入口未切换。两者本地定向测试通过，正式 migration/写入/回填仍待评审和真实 MySQL 回执。

配置内部读服务已补准确历史版本读取，复用同一授权事务、最终复查、canonical/hash/展开列核验与共享锁。历史版本按安装状态 active 指针判定，不能继承当前安装的 `last_effective_enabled`；本地测试覆盖精确版本、缺版本、撤权和跨安装异常。尚无生产 HTTP 路由或 MySQL 回执。

配置版本内部列表按版本倒序采用独立签名 keyset 游标，固定首项最高版本并绑定安装及 limit。每页均重新执行授权与最终复查、逐行闭集投影，坏行使整页失败；空页只在成功查询后成立。`stable_cutoff` 约束版本集合，`active`/`effective_enabled` 仍按每页读取时的安装状态计算。假驱动覆盖分页、新版本漂移、坏行、篡改及跨安装游标；真实 MySQL 与生产接线仍待验收。

前端只读客户端现在提供 `configVersions`，按合同请求历史列表并核对游标、安装、版本倒序与 `stable_cutoff`；active 与指定版本响应也共用 ConfigResource 外层及 ConfigValues 闭集校验，拒绝原始列、未知数值字段和 registry/ref 私密字段。Node 定向测试 38/38 通过。当前环境无已安装的前端 TypeScript 构建依赖，未自行安装，故这轮没有完整 Vite/tsc 构建回执。

D 自有的 `system_backup_operations` 现在有[内部详情读取器](../backend/internal/systembackupread/operation_detail.go)及[闭集 Operation DTO](../backend/internal/systembackupread/operation_dto.go)：准确公共 ID 在查询前校验，同事务按受信安装选固定列、最终复查授权后提交；目标 ID、状态、结果版本/资源、失败分类和时间关系按 066 表约束核对。原始失败消息、响应证据、external-action JSON 与 claim 字段不入查询；wire `failure_message` 固定为 `null`。本地假驱动覆盖正常行、跨安装、缺行/撤权竞争、损坏行和数据库错误。该组件没有生产 ScopeProvider 或 HTTP 路由，真实 MySQL 列类型及锁序仍待验收。

[前端 operation 只读入口](../frontend/src/pages/admin/backups/backupApiRead.ts)现在校验准确 `sop_` ID、合同闭集字段、目标 ID、状态与结果关系，并拒绝非空原始失败消息。请求仍经调用方提供的已认证 transport，fixture 来源会被统一拒绝；没有把 operation 详情接成生产路由。页面与国际化定向测试 39/39 通过，覆盖正常合同示例及错误 ID、敏感字段、目标/状态漂移。

活动读取客户端也已按 v12 EventResource/LogEntryResource 的字段闭集核对目标、状态、详情及日志 phase/索引，拒绝额外的原始载荷列和跨任务日志。页面与国际化定向测试 40/40 通过。`system_backup_events.message` 的数据库列虽标注写前脱敏，当前没有 A 的可验收来源证明；`system_backup_log_chunks` 只保存 redacted evidence 引用，日志内容还需 A/C 的只读证明。因此后端 events/logs 仍保持未就绪，不从未审消息或证据对象合成 200 响应。

总览客户端进一步按 v12 OverviewResource 核对全部顶层字段、健康状态闭集、非负计数、短缺 failure-domain 项与观察时间，并拒绝未知原始列。页面与国际化定向测试 41/41 通过。该前端形状校验不产生 controller、artifact、evidence、catalog 或 source-writer 的权威事实；后端总览仍需各 Owner 的真实来源与 A 正式读授权，不由缓存或备份任务成功状态推断恢复就绪。

四类详情的前端入口现按 v12 各自闭集核对外层字段、Execution、Verifier、Source、Checksum 和 Evidence，并检查 eligibility、artifact、清理结果等合同条件；未审原始 Owner 字段会以 `invalid_response` 拒绝。四种合法示例及外层、嵌套敏感列拒绝均在页面与国际化定向测试中通过（42/42）。这只是客户端响应边界；后端详情仍需 B/C/A 的权威来源、同事务投影评审、正式读授权与真实 MySQL 验证，生产端点仍保持未就绪。

任务投影另有本地 migration 结构校验，逐一确认四张 067 任务表包含查询所需列，并拒绝把配置快照、原始失败消息等敏感列加入固定投影。原有十项统一远测的专项数据库只装配证据和恢复候选表，其 PASS 不能充当任务读取验收。2026-10-13 另收到完整 066/067/080 schema 和真实约束任务行的[隔离 MySQL 专项回执](evidence/system-backup-d-admin-read-mysql-user-receipt-20261013.md)，覆盖查询、授权撤销、跨安装与分页；索引计划仍待单独测量。

D 自有的 Operation 列表已有内部读取和 v12 `OperationList` 投影：固定 `id` 倒序、准确安装范围、首屏上界及独立 HMAC 游标；每页在同一事务内先授权、查行、最终复查，结果不含原始失败消息或外部动作正文。前端列表入口逐项校验闭集 Operation、安装一致、游标和 `stable_cutoff`。本地定向验证覆盖两页、游标篡改/跨安装/跨域、撤权、坏行和数据库失败；Go 包读取测试与 vet 分开运行均退出 0，前端页面及国际化 43/43 通过，专用 Go 缓存已清理。2026-10-13 隔离 MySQL 专项已验证 Operation 真实行及分页；`system_backup_operations` 的候选分页索引仍需执行计划和写入成本验收。生产 HTTP 路由已完成受开关控制的接线，尚无实际 HTTP 200/403/503 回执。

2026-10-12 接线增量：服务端新增受 `SYSTEM_BACKUP_READ_LIVE_ENABLED=true` 控制的真实读路。它用登录时同一 `SQLLoginSessions` 构造 A 的 hash 固定授权器（`SYSTEM_BACKUP_READ_PINS_PATH`、`SYSTEM_BACKUP_READ_PINS_SHA256`），用独立的 `SYSTEM_BACKUP_READ_CURSOR_KEY_HEX` 签名分页游标；每个 GET 从真实 access token 取得 request-bound scope，并使用 `scope.Context()` 在 D 查询事务内授权和复查。当前开放四类任务列表、Operation 列表及详情，成功响应带 `X-System-Backup-Data-Source: live`；其余来源尚未审定的读端点仍返回 `503 not_ready`。启用后任何会话登记、pin 或数据库输入缺失都保持真实路未就绪，不回退 fixture。未启用时保留原显式 fixture 联调路径。D Reader 现在保留 ScopeProvider 的权限或不可用错误类型，供 HTTP 分别映射 403/503。

隔离 MySQL 验收入口已补到 `-AdminReadOnly` 远程流程：在临时命名空间全量迁移之后，`TestDAdminReadFullSchemaMySQL` 要求准确的 run marker、server UUID、066/067/080 迁移记录和 InnoDB 表；在该临时库插入完整约束的双安装配置、四类任务与 Operation 行，用真实 A scope/D service 验证四类任务列表、多页、固定上界、新增行漂移、跨安装游标、Operation 详情、会话撤权和锁等待。2026-10-13 首轮[用户提供的远程输出](evidence/system-backup-d-admin-read-mysql-user-receipt-20261013.md)显示全量迁移 94 条、A/D 两项 MySQL 测试及最终专项门禁通过，同一 UID 命名空间、远端 scratch 和本地构建缓存均报告已清理；该首轮摘录没有显式退出码。后续[完整 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013-r2.txt)补足 A/D 专项通过、清理和 `A_ADMIN_READ_REMOTE_EXIT=0`。完整 schema 的真实行功能已通过专项测试；执行计划与索引写入成本尚未验收。

D 接收远程回执时须看到本轮 `TestDAdminReadFullSchemaMySQL` 的 `--- PASS` 与最终 `PASS a-admin-read-mysql`、命名空间/远端 scratch/本地缓存的 `CLEANED` 及进程成功退出；若只有 A 的 `TestAAdminReadAuthorityMySQL` 通过，仍只能接收 A 的窄授权专项。任何 `CLEANUP_PENDING`、缺少本轮二进制摘要或未核对隔离 MySQL 身份，均不能记作 D 的真实行验收。

页面端到端状态另受总览与配置权威来源约束：[前端 live source](../frontend/src/pages/admin/backups/backupLiveSource.ts)会先读 overview/config 并核对同一安装与版本，之后才展示四类任务列表；当前这两个真实后端端点仍明确返回 `503 not_ready`。因此本轮接线只使列表与 Operation API 可以接受独立的真实读验收，页面会继续显示未就绪，不可把 API 测试 PASS 记作完整页面上线。配置 canonical 来源、总览各 Owner 观察及四类详情仍需后续单独验收。

2026-10-13 追加真实 HTTP 探针 `TestDAdminReadLiveHTTPMySQL`：在原有 UID 固定的 fresh-migration 命名空间、完整 schema 和固定摘要 fixture 中，通过 `registerBackupReadLive` 的 Gin 路由发 GET，验证备份列表及 Operation 列表/详情的 200、`X-System-Backup-Data-Source: live`、跨安装行不外泄、无 token 401、非法参数 400、未审配置 503，以及会话撤销后三路 403。`-AdminReadOnly` 远程 profile 已增加该探针的 Linux 二进制构建、摘要校验、Pod 内运行和清理。修正后本地完整 profile 退出 0；[远端完整 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013-r2.txt)记录同轮 `TestAAdminReadAuthorityMySQL`、`TestDAdminReadFullSchemaMySQL`、`TestDAdminReadLiveHTTPMySQL`、`PASS d-admin-read-live-http-mysql`、`PASS a-admin-read-mysql`，HTTP 探针本地与远端摘要均为 `431a193058be60c466f8edbd3c15cb691eafc97ec571364f5004c501b9da6885`。运行身份为 namespace `sbk-mig-261013023630-18d2`、UID `6bfcde95-73e0-40f5-a0e4-c292cf4fe3fd`、MySQL 8.4.8；94 条迁移、准确文件名、完整清理和两个最终退出标记均在同一 transcript。**该限定范围的真实 HTTP/MySQL 专项已通过。** 此测试验证 handler 与 A/D 内部读路，不等于完整应用镜像的上线或页面总览/配置验收。

该专项从本仓库根目录运行下列 PowerShell 命令保存完整回执。`D_ADMIN_READ_LIVE_HTTP_REMOTE_EXIT=0` 仅在脚本成功返回后输出；同轮测试、摘要、清理和退出标记已由上述 transcript 核对。

首次远程回执见 [HTTP 探针失败日志](evidence/d-admin-read-live-http-mysql-remote-20261013.txt)：同轮 A 授权、D 全 schema 服务测试通过，新增 HTTP 探针在插入跨安装对照任务时触发 `fk_sb_backup_config`，最终门禁失败；准确 UID 命名空间和 scratch 均已清理。原因是探针只把本安装配置的 `config_sha256` 改为任务快照 `SHA2('{}',256)`，却给外安装也插入了相同快照的任务行。修正使两个隔离安装的配置快照摘要/字节数先与任务行一致，并核对两行更新；首次失败保留，不计 HTTP PASS。修正后的第二轮结果见上。

第二轮 HTTP PASS 覆盖备份列表和 Operation；D 服务层虽验证另外三类真实表，HTTP 探针当时没有请求其路由。后续探针已扩展为四类任务列表均返回 live 200，并在授权撤销后均返回 403；备份列表通过 HTTP 游标续页，第一页后插入的新行不得进入旧上界。远端阶段通过 `-test.list` 确认 A、D 和 HTTP 三个准确测试都已编进上传二进制。扩展版本地完整 `-AdminReadOnly -BuildParallelism 1` 门禁退出 0，HTTP Linux 探针 `sha256=5f6c9068ee5f4ba90803be1a543a117ff31ff59cb18a23732bcd601a8ab2cf15`，`CLEANED local-registration-build-cache=True`；Windows Go 编译曾一次 `0xc0000043`，同命令重试后通过。[第三轮远端完整 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013-r3.txt)记录 MySQL 8.4.8、94 条准确迁移、同轮 A/D 服务及扩展 HTTP 三项测试 PASS，HTTP 探针本地与远端摘要一致；运行身份为 namespace `sbk-mig-261013040654-18e9`、UID `edd4b2cb-8f79-4ad4-832c-c0418e601170`。该命名空间、远端 scratch、本地构建缓存均报告清理，最终 `A_ADMIN_READ_REMOTE_EXIT=0` 和 `D_ADMIN_READ_LIVE_HTTP_REMOTE_EXIT=0`。**四类任务列表、备份续页和 Operation 的限定范围真实 HTTP/MySQL 专项已通过。** 此探针以测试二进制调用 Gin handler，完整应用镜像、页面总览/配置及详情仍需各自验收。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-admin-read-live-http-mysql-remote-20261013-r3.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D Admin read live HTTP MySQL validation failed' }
  Write-Output 'A_ADMIN_READ_REMOTE_EXIT=0'
  Write-Output 'D_ADMIN_READ_LIVE_HTTP_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

2026-10-13 后续增量：真实读路另注册配置 active、版本列表与准确历史版本 GET，复用 A 的请求绑定读授权及 D 的 canonical/hash/展开列校验。现有正式 94 文件 schema 缺候选列，配置 GET 仍返回 `503 not_ready`；旧行缺原文同样失败关闭。候选列的内部 MySQL 专项已通过，新增 Gin 配置 HTTP 专项及完整远程命令见[配置 HTTP 候选交接](system-backup-d-config-http-candidate-20261013.md)，目前待操作者执行。总览仍为 `503 not_ready`，页面端到端验收未完成。
