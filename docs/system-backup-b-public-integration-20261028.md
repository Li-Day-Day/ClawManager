# B 接入公共 v12：本轮范围、差异及待交付输入

最新来源与 B relay/runtime writer 增量：已在工作分支整合 `backup@8ef5fa7f`，详见 [最新交接](system-backup-b-relay-writers-handoff-20261028.md)。以下同步记录按当时版本保留；不再将 A relay 认证代码列为缺失，也不以 GitHub 无冲突代替新组合验证或真实链放行。

## 公共 runner 开发增量

基于下述共享 ABI 同步，已新增 `publicadapter.NewPublicRunner/NewLinuxDispatcher`、真实只读发现与 flow/Job/恢复适配，未另建控制面。最新范围、生产构造示例、差异关闭表与准确的 D/A/C 输入缺口以 [公共 runner 交接](system-backup-b-public-runner-handoff-20261028.md) 为准。下文“B publicadapter 待开发”等为同步时的历史状态，不表示当前增量未实现；公共生产 loop/Ports 与实际现场整链仍未通过。

## 最新同步：d3c5715a

后续按用户通知重新 fetch，公共 `backup` 更新为 `d3c5715a05a80c1134edd3ad0132a6c292ee1672`。已取得原 `systembackupdispatch/contract.go`、Dispatcher 测试及 Skill gate 交接，不再将共享 ABI 或 Skill 原增量列为缺失。下文 `680b0ce1` / `63a13b27` 及“ABI 未到齐”是上一轮准确历史状态。

本次合入解决四处冲突，保留公共 ABI 原定义不复制类型；Skill 使用 D 的 backfillAttempt/重开后恰一次回填/释放后再 claim，同时保留 B 的 ContextGate、取消子任务、等待清理后释放 permit。两边回归用例均保留。

这个 commit 尚未包含 `controller/sql_task_claim_store.go`、`controller/task_execution_loop.go`、`controller/execution_ports.go` 或 `cmd/system-backup-controller/task_execution_live.go`；已按实际 tree 核对。因此共享 ABI 到齐不等于生产执行 loop/Ports 已装配。A1 私有 profile 依赖抽离、B publicadapter 和后续 A2—A6 继续属于待开发工作，不以本次同步宣布完成。

本轮组合回归记录见 `shared-abi-merge-tests.jsonl`、`shared-abi-merge-exit.txt` 及单独 registry 测试记录；准确来源 overlay 见 `shared-abi-source-pin.json`，不覆盖上一轮原始日志或源码快照。沿用本聊天专用缓存，未安装依赖、未进行真实迁移。此前专用目录清理的策略拒绝仍未解除，不能记为已完成清理。

## 来源与判定

2026-10-28 实际 fetch 后：PR #1 / 功能分支基线为 `680b0ce164daeb71dafc166f632f22fa6dab2fb4`，公共 `backup` 为 `63a13b2771091e4ba47b691ce066a670cbc88d54`，后者已被前者整合。转发说明中 `14768599` / `52117dee` 属于旧来源，不能作为本轮集成通过依据。

用户提供的《给 B 的完整实现指令：接入公共 v12 系统备份链》（2026-10-28）补充了 D 的未提交增量。当前 checkout、远端 backup 和已 fetch 分支尚无 `systembackupdispatch/contract.go`、`controller/sql_task_claim_store.go`、`system-backup-c-skill-gate-integration-20261028.md`。已请求 D 的实际分支/commit/工作区或补丁。本文列出实施边界，不将转发文档当作这些源码已经存在或已运行的证据。

用户确认目前没有真实链路测试环境。本轮不进行真实 MySQL、Runtime Agent、K8s Job/快照、CSI/NFS/HostPath 或公共成品验收，不连接只读参考服务器。

## 控制面差异关闭表

| 项目 | PR 原实现 | 公共权威 / 本轮处置 | 状态 |
| --- | --- | --- | --- |
| 任务/claim | `control.Controller`、`SQLStore`、私有 Task/CAS | D `system_backups` / preflights / ClaimCoordinator 及 `SQLTaskClaimStore.AcquireWithReceipt` | 私有生产入口已移除；等待 D 原入口代码，B 不增加领取表 |
| 控制数据库 | `CLAWMANAGER_BACKUP_CONTROL_CONFIG` 打开独立库 | 生产 main 遇旧配置直接拒绝，不打开独立库、不执行私有 schema | 已关闭生产启动路径 |
| 管理 API | `/api/v1/admin/system-backup/*` | main 移除内部任务列表/创建/取消/报告路由；沿用公共 API/A 授权 | 已移除内部路由 |
| 管理页面 | 独立任务页面及菜单 | 菜单仅保留 `/admin/backups`，旧地址经原 AdminRoute 重定向 | 已移除重复注册；旧文件保留实验参考 |
| 独立 CLI | `backup-controller` 默认执行 host.Run | 真正执行必须 `--experimental-isolated-lab` 且没有公共安装/启用环境变量；离线诊断可独立使用 | 已加门禁；不属于公共构造入口 |
| gate | 私有 ApplicationGate / app_process / legacy_mutation | D 负责公共 mutation lease/participant/fence 装配；移除原私有 gate 和全局中间件注册，nil 不授予 capture 资格 | 生产公共 gate 尚待 D；B 只增加 ContextGate 接点 |
| 路由例外 | 内部 singular 路径前缀豁免 | method + c.FullPath 精确白名单候选；公共查询、取消、安全收尾仍经过原认证；创建/其他 admin/未知路径不豁免 | 本地负例；待 D/A operation policy 联核与注册 |
| 资源/Job | 私有 resource/worker 表 | D Ports 的已提交创建前 intent + B 实际 Ensure + D 登记真实 UID | 等待 D Ports；不把 observation cursor 当创建前 intent |
| 暂停/恢复 | 私有 pause journal + flow barrier | 完整 Authority 闭包转发 Ports.Check/CheckRecovery/PauseIntent/Paused/Resumed | 等待原 ABI；不以 ClaimRowVersion 代替 generation |
| 计划 | 私有 Vault plan | D 加密持久化 B 原 Plan bytes/hash 后才 Capture，接管沿用原 bytes | 等待 D Plan/Ports 持久化代码 |
| 产物 | 两域 functional artifact/recovery signer | 公共 provider/finalizer/catalog 由 C；密钥/签名由 A | 不兼容，禁止把私有产物接入公共 manifest |

此前 `680b0ce1` 同步了 136 份 migration 的目录摘要，仅证明源码目录计算一致。未核对现场 schema_migrations 历史字节，不视作 D/A 对已应用迁移漂移的评审，也不解除 strict 门禁。

## B/D 实际分工和调用位置

- D：`task_execution_live.go` 装配实际依赖 → `TaskExecutionLoop.RunOnce` 候选选择 → 公共 AcquireWithReceipt → attempt → `Dispatcher.Prepare` → 持久原计划 → `Dispatcher.Capture` / `Recover` → 公共最终结果事务。当前 checkout 没有这些新增 caller，不报告接通。
- B：按共享 ABI 导出 `publicadapter.NewPublicRunner`；复用源只读发现、具体 writer/collector、原 flow 安全顺序和实际 kube/Agent/proof。等待 `contract.go` 后再实现编译适配；不自行复制转发文档未给出的 Ports/Authority/ModuleResult 定义。
- D Ports：公共 SQL 锁内检查和持久化；锁外调用 B Ensure/Observe/Stop。B 不创建公共 task、claim、attempt 或替代账本。
- A：实际 grant/trust/SPIFFE/期限/撤销、签名输入、KEK、writer registry 安全与最终权限复查。
- C：公共 artifact/finalizer/catalog 原 adapter；Teams 的 SQL/Redis 同一 checkpoint、TTL 和实际 writer；Skill 对象版本/摘要及 workspace 证明。

本轮 `mutation.ContextGate` / `EnterContext` 是已有 writer 接入 D 公共 gate 的兼容接点，不新增授权协议。Skill backfill/batch、Runtime scheduler/代理续期、实例 sync、北向普通/批量/生命周期使用派生 context。D gate 丢失许可时可取消合作任务；释放仍由原 writer 在所有子任务、ReleaseToPending 清理结束后调用。原 Enter-only writer 尚不能因此计为具备失权取消能力。

## A1 待移除的私有依赖与真实 writer 差集

已核对仍有直接私有依赖：`profile/config.go` 的 Probe/fence，`discovery.go` 的计划读取，`execution.go` 的 cleanup/identity 读取，`collector.go` 的 ResourceJournal/CleanupJournal/WorkerStatus/Get/worker grant/credential，`target.go` 的 Job/NetworkPolicy 归属 SQL，`writers.go` 的 PauseJournal/Get，`applications.go` 的进程覆盖、`six_domain.go` 的私有发布计划。不能仅把 Driver.Store 改 interface 后宣称 A1 完成。

当前静态许可接点包括 api-request、skill-backfill、skill-materialize、instance-sync、runtime-scheduler、runtime-proxy-policy-renewal、northbound-operations、northbound-lifecycle、northbound-lifecycle-batches、legacy-deletion、pending-deletions、config-cascade、team-pvc-binding、instance-pvc-binding、workbuddy-prewarm、security-scan、team-deletions、team-event、team-outbox、team-stale-tasks、team-consistency、team-assignments。

这只是代码接点，不是完整受审 source_writers。尚缺每个部署副本的进程/Pod UID、generation、实际身份、policy、外部 writer、Redis/background writer、Agent/存储 proof 与 watchdog/hold 期限；不能据静态列表授予 capture。Enter-only 路径及不使用 context 的旧 SQL 方法继续列为覆盖差集，待与 D/A 原 registry 比对。

Skill 的本轮上下文取消负例证明：任务被取消后仍等待 ReleaseToPending 清理，清理结束才释放 permit。转发文档指出 D checkout 已修复 gate 重开后的 backfill 重试；未收到原文件前不以本地旧 worker 覆盖该增量，也不声称已验证其行为。

## 缺少的准确输入

| owner | 输入 | 阻塞点 |
| --- | --- | --- |
| D | `systembackupdispatch/contract.go` 原文件及相关新代码 commit/patch；SQLTaskClaimStore 回执协议 | 公共 runner 编译、完整 Authority/Ports 转发与未知提交消费 |
| D/C | `system-backup-c-skill-gate-integration-20261028.md` 和实际 worker 文件 | 保留 gate 重开恰一次 backfill 的共同增量与相关测试 |
| D | 公共 runtime Ports、plan/Job intent/grant 持久化 caller 与 main link | 真实派发、停止、补偿和任务状态收敛 |
| D/A/B | 已准入 profile ID/revision 的真实映射；历史 config snapshot 原 bytes/hash/size | Prepare/冻结计划及接管不可漂移 |
| A | relay 证书/trust/SPIFFE/binding/撤销/期限 proof；完整 source_writers | relay 原身份验证及实际 writer/fence 覆盖 |
| B+A+D | status_relay/restore_target 正式领域字段、共同审查记录及请求 schema 决定 | 不复制私有 DTO、不自创路由或关闭门禁 |
| C | 公共 sealed part 接纳、provider/finalizer/catalog adapter 和当前对象事实 | 公共 manifest、最终事务和结果不明收敛 |
| Teams / Skill | SQL/Redis checkpoint/TTL/写者；不可变对象/版本/摘要/workspace 证明 | 六域一致性验收 |
| 操作者 | 隔离安装/namespace UID、已 bootstrap 安装/config、observer SELECT-only 身份/pins、Agent/存储支持矩阵 | 实际整链；用户已明确暂时没有环境 |

## 验证记录

本轮限定验证 middleware、mutation、services、northbound、server 和实验 CLI；前端做无输出 TypeScript 检查。原生日志、退出码、源码范围及清理回执位于 `docs/evidence/b-public-integration-20261028/`。本轮不安装依赖；Go 使用本机已有 toolchain/module cache，GOPROXY/GOSUMDB 禁网及 readonly modules，独立 GOCACHE/GOTMPDIR；完成后只清理本轮目录。

实际结果：6 包均退出 0，记录 1,639 条测试通过、33 条按原条件跳过；新增 context 丢失测试另以 `-count=1` 运行通过。前端无输出类型检查退出 0，Linux amd64/CGO=0 的 server 与实验 CLI 编译退出 0；Linux 二进制未运行。本轮没有重复旧全仓测试。源码清单记录 2,284 份文件的准确字节摘要；静态边界清单记录 21 个命名许可调用及 37 处剩余私有 profile Store/Vault 依赖，均不构成真实覆盖证明。

清理状态：自动审批审查拒绝删除已核对绝对路径的本轮 `.codex-temp/b-public-integration-20261028`，理由为 `blocked by policy`；未采用其他工具绕过拒绝。该专用 cache/tmp 目录仍在，未计作清理完成，也没有删除其他 owner 产物。原生日志、退出码、零漂移核对及此拒绝记录见 `receipt.json`。

真实环境、D 未提交代码、公共 Runner/Ports、relay/restore_target、完整 A1/A2/A3/A5/A6 均尚未通过。本文不作首条公共真实链成功或全部开发完成的声明。
