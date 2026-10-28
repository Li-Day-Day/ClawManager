# D：首条真实系统备份集成

2026-10-28。当前真实链仍未通过，`systemBackupTaskOwnerLink` 没有生产绑定。本文记录可运行实现、当前核对和具体依赖，不以接口、模型或 B 分支测试替代公共整链验收。

## 精确来源与唯一控制面

当前本地 `HEAD` 及远端 `backup` 为 `8ef5fa7fd4df45f6306e910705db01f589266ba7`，包含共享 ABI/Skill gate/A relay peer adapter；B PR #1 远端 head 为 `08d15abf443511376bf1a0c9c9593caea8feef5c`。本轮原生只读 ls-remote 已核实（沙箱 schannel 失败后恢复），不是旧 `52117dee` 基线。D 已逐 blob 导入 B 九个执行包共110文件、三候选合同与交接，未 merge/checkout、未执行独立 schema。导入记录见 `d-b-public-adapter-import-20261028.json`；D后续最小适配另计，不冒充仍与B原blob相同。完整可转发任务单是 `system-backup-b-implementation-instructions-20261028.md`。

D 按用户指令固定公共 v12 为唯一权威：`system_backups` / `system_backup_preflights`、公共 claim/fence/gate、资源与 evidence 账本、A action/read scope，以及现有 API/错误/幂等合同。B 的 domain/flow/kube/worker/profile 执行能力按此接入。独立 `control.Controller`、`SQLStore.Create`、`cm_backup_control_*`、实验管理路由和同名异构 events/catalog/prune 表不在本安装启用；不执行两库各自 commit，也不把另一套任务当作公共任务。

这项控制面选择是 D 按用户要求固定的集成边界；B最新已交付不依赖独立控制库的公共runner，仍不能据此声称双方现场已签收。当前以完整任务单和 B 新 `system-backup-b-public-runner-handoff-20261028.md` 为准；旧 [B 核对](system-backup-b-pr1-integration-20261028.md)、[C 核对](system-backup-c-pr1-integration-20261028.md)和 [A 安全映射](system-backup-a-b-pr1-security-mapping-20261028.md)保留其原基线历史。

## 已实现与装配位置

- `backend/internal/systembackupapi/sql_writer.go`：具体 `SQLTaskWriter` / single-use prepared write。原 A 授权后，同事务锁安装行、查完整幂等 tuple 和 tombstone；新建 task、完整 canonical config snapshot、`next_reconcile_at`、调度 event 和 audit。容量/资源/readiness guard 后再固定复查 active config、task identity、原 snapshot、schedule、数据库时间与原期限。最后仍由 `SQLApplication` 关闭 capability、`RecheckAction`、唯一 commit。提交结果不明不自动重试、不返回新 ID。
- `systembackupapi/task_requests.go`：并行D窗口已交具体closed decoder/default/null及受限JCS子集，server现在实际调用 `NewSQLTaskWriter(NewTaskRequestContract(), owners.Admission, enabled)`；Requests不再是外部空槽。backup必须显式非空requested_parts，默认acceptance须六part；仅显式functional_test可部分。preflight默认production_readonly，source/profile/config ref均显式；非null新任务retry和catalog_import路径精确not_ready，不能静默接受丢字段。JSON schema与两条OpenAPI requestBody同步，原跨owner/registry门禁未改绿。
- 同键同 hash 在当前授权下返回原任务，保留原 config/deadline，不重复调度；异 hash 为 409；tombstone 同 hash 为 410，并在最终授权复查后返回原 ID/终态摘要。历史重放先于 new-work kill-switch，依据原计划第 756/772 行，不豁免当前身份/权限。
- `sql_details.go` + `systembackupread/backup_preflight_detail.go`：完整 backup/preflight DTO 及 manifest 适配。所有 task/attempt/Job/check/evidence/current facts 在原 read scope、同一 snapshot 和最终复查内组合；owner SQL capability 在最终授权前关闭。缺当前事实不返回部分 DTO。
- 原始 manifest 必须绑定安装/task、当前 committed 状态、不可变 checksum 和原有效期；HTTP 保留原字节，冒烟对原字节 SHA-256、响应 checksum header 和详情 checksum 联合比对。没有以 evidence 对象冒充 C manifest。
- 唯一生产 composition 是 `backend/cmd/server/system_backup_tasks_live.go` 的 `systemBackupTaskOwnerLink` → `composeOwnedSystemBackupTaskApplication` → 具体 writer/details → 原 `NewSQLApplication`。受控 Go link 必须提供 Requests、Admission、CurrentFacts、Manifest；无运行时 JSON/回调注入，没有默认 allow 或 `{}` 请求。
- 独立只读 observer 及命令见 [observer 交接](system-backup-b-first-chain-20261028.md)。公共 claim 历史的同事务入口与真实 caller 见 [领取协议](system-backup-d-task-claim-receipt-20261028.md)。pending deadline 的领取不代表 B 已执行。
- `controller/execution_ports.go`：真实 SQL `SQLExecutionAuthority.Check/Bind/Recheck`。同一事务先锁公共 gate，再核对安装/active config、task/claim/原 snapshot 与 bytes/hash、最新公共 attempt；capture 只允许 running attempt+capturing task+held gate 的准确 owner/fence/未过期 hold。末尾执行 A guard 和固定 SQL/时钟复查。guard 绑定原 context/tx，副本共享失败锁存；typed-nil context 拒绝。它只实现 forward `Check`，不冒充完整 Ports 或 recovery 授权。
- `controller/task_execution_loop.go` + `cmd/system-backup-controller/task_execution_live.go/main.go`：已写入 main→独立 leader 执行循环→Dispatcher→Runner 的实际代码调用，Prepare 与 Capture 必须间隔持久化 round trip；输入与 plan 分离复制，返回失败也交 D Record。安全 ControlLoop 与执行并行；LeaderLoopGroup 拒绝旧清理未 join 时的新代及关闭后的迟到 callback；runtime 退出前等待所有旧执行退出。取消不是完成清理证明。
- 新 `systemBackupExecutionOwnerLink` **仍未绑定**。main 已实际调用 B `NewLinuxProfile→NewPublicRunner`，再以 D `BindTaskRunner` 包装并注入 TaskExecutionLoop；不是仅声明 Runner 接口。完整 `ExecutionWorkStore` 的加密plan/Job intent/pause/结果持久化、A后台授权和C能力仍缺，Ready不得允许Next/领取。main构造调用测试不等于已部署运行B。
- 新 `systembackupdispatch/task_binding.go` 保持 B `system-backup-b-plan.v1` 原 bytes/hash，加外层 `system-backup-task-plan.v1`，绑定原任务spec（含purpose/parts）、config、attempt、profile/revision及绝对deadline。捕获/恢复每次使用当前claim/fence；materializer先UnwrapTaskPlan再DescribePlan。外层摘要不授权限，不替代A加密托管。B profile/owner callbacks获得深拷贝，不能改写D原输入或另一builder的SQL清单。
- A新增 `systembackupplancustody.Save/Load` 已实际完成原计划的认证密文文件存取，并复用B staging；原生真实临时文件正反测试和Linux编译已有独立回执。它关闭的是文件组件；D仍欠原SQL intent/record/CAS调用，原task DEK用途/版本/托管和持久root仍须A/部署owner交付，不能把plan改名借其他purpose。
- 新增 `controller/sql_backup_start_store.go`：`StartNext` 按持久 `next_reconcile_at`、原安装、期限/claim 约束选候选，关闭读取 cursor 后调用 `Start`；一连接池也不会拿着 cursor 等自己的写事务。`Start` 同一 RR 事务调用公共 stage claim/receipt（不独立 commit），保存原 task spec/snapshot，把 pending→preparing，与 attempt 1 的 capture/secret_capture 两协调单元、`task_status_changed/attempt_started` 两核心事件一起提交。包括原 claim 回执，共三个事件；末尾按准确 ID/原 request/状态/attempt 复查，任一阶段失败整体回滚，未知 commit 不返回身份、不自动重试。
- `BackupStart` 是原 task 的真实 SQL 投影，**不是完整 Runner Input**，不填假的 ProfileID/revision。`BackupStartAdmission` 必须提供原业务/物理容量报告和策略的准入及原期限；还必须有 A 后台 purpose/resource 授权。缺其中任一 production owner 即不开事务。它是完整 `ExecutionWorkStore` 的初次启动组件，目前仍未注册为生产执行 store。
- SQL 时间下界逐段传递：入口 UTC/offset 检查→公共 claim stage 第一/最后时钟→原 claim reread→A Bind→预算首次/复查→`RecheckAfter`（owner callback 前检查调用方更近下界）→fixed-final→最后 UTC 时钟。末采样必须同时早于原 A/业务 guard/claim/task 最短期限。`ObservedAt/ValidUntil` 只是不可续期观察，不是授权。
- 权限相容性复核已修复只读 JOIN 的排他锁：先单独锁安装行，再共享锁 config；attempt/event 校验也用共享锁。原 controller exact grant matrix 未扩大。初次 start 需要待审的四项增量：events SELECT、attempts INSERT、Job observation SELECT、staging resource SELECT。不得给追加式事件账本增加 UPDATE/DELETE 来掩盖查询问题。生产注册仍须原矩阵审查、受控 server 版本和真实正反 grant 验证；[MySQL 官方](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)规定从 8.0.22 起共享读锁仅需 SELECT。

## D 新执行接点的准确剩余工作

- D：初次 SQL candidate/claim+receipt/attempt/state 原子组件已实现，仍须组合完整 `ExecutionWorkStore`（真实 profile 映射、A已交Save/Load的原SQL intent/record/CAS接点、接管/结果事务）、Job 创建前 intent/WorkerGrant、pause/ACK/resume 账本；当前 Job observations 不能替代创建前 intent。初次启动的业务/物理容量 guard 也仍须真实装配，不能用测试 admission。
- D/A：后台 `ExecutionAuthorization.AuthorizeExecution(ctx,tx,Authority,dbNow)` 与 guard 的真实生产实现。A 已明确 HTTP create scope、evidence runtime scope、C1 content-call scope 均不授这种后台操作。必须补 controller 工作身份/version、installation/config→用途/全部资源/provider/ref/version/Secret allowlist 及当前撤销/期限的原可信来源和锁内读取，不造 static grant。
- D：长 capture 续租后的当前 claim token 与已派发 Job 原身份映射。现 guard 准确拒绝版本变化；不拿 ClaimRowVersion 当执行 generation，不因此放宽比较。
- B：公共runner/profile/Job/result/recovery/relay已经交付并导入；合入D的Spec/清单隔离适配、交付受审实际writer/builders及覆盖不足域，配合A worker授权传输/C seal格式适配。status_relay/restore_target/checkpoint候选已到，正式合同联审仍待完成；不接管A材料或C provider/catalog。
- C：最终 public artifact/finalizer/catalog/manifest adapter 和原 schema；A：原始材料/用途授权/信任与签名映射。Requests 已具体构造；现HTTP owner只剩 Admission/CurrentFacts/Manifest 三项，生产 link仍未绑定。

## 三项生产依赖

| 依赖 | 已确定部分 | 必须交付才能绑定的部分 |
| --- | --- | --- |
| Requests，D 牵头 | concrete decoder、closed schema/OpenAPI、显式parts、default/null、ASCII受限JCS规范化及hash已实现并实际构造；21根/86 pass、server build0。 | 非nullretry仍须同事务原任务校验/入库；catalog_import仍须C原领域reader与准入。两路径准确not_ready。正式cross-owner/schema gates继续保留，B private control.Request不作替代。 |
| Admission，A/B/D | 调用者唯一事务、原 action authority/final recheck、固定 config snapshot 与 SQL 时钟；确定性本地准入，不在 handler 连接 provider。 | 真实 profile/readiness/capability cache、原可信安装/资源映射、source acceptance/readability、concurrency、task+snapshot+event+audit 的准确容量预留与原物理报告/最后复查。A 的配置 mutation 容量实现不能不经适配直接套用 task。 |
| CurrentFacts，A/B/C/D | exact task row version/installation、原 observation/expiry；同 snapshot query-only capability；最终 A recheck。 | 真实 artifact/provider/credential/KEK/catalog/evidence/source/report 当前事实及原期限，C immutable manifest reader。不能从保存的 usable/valid hint、独立 B Report 或 TLS 成功推导。 |

还有一项现合同冲突：pending backup 数据允许 `consistency=NULL`，现完整 backup detail schema 要求非空枚举；当前准确拒绝，未擅设 `weak`。B/C/D 必须决定并更新唯一合同后才可让完整 pending 轮询通过。

## B 真实执行与公共基础设施

最新公共 adapter 不再依赖 `Pipeline.Store/profile.Driver` 或独立控制 SQL；只读 Linux source profile 可使用单独 SELECT-only source handle，D main已实际构造调用。当前profile只覆盖明确准入的users/instances，不能推导六域或acceptance成功。剩余缺口是D原WorkStore/Ports/Job及ConfigMap intent/WorkerGrant、A原trust/身份/授权与C immutable seal/发布组合。旧lab driver和publication journal继续隔离，不能作为公共fallback。

公共 artifact/finalizer/catalog 的唯一领域 owner 按原分工为 C，D 负责公共 SQL/HTTP/编排边界，A 负责安全语义，B 贡献已有真实 data plane/recovery 实现与领域输入。Skill Hub 只交付其领域 collector/normalizer/verifier，不要求它重写公共 artifact/finalizer/catalog。

PR recovery 对象虽也写 `system-backup.v1`，其 identity、字段、签名 envelope/domain/算法、marker/acceptance/finalizer wire 均与现 v12 不同。重新命名字段/重编码后不能沿用原 checksum/signature。必须由 A/B/C/D 对唯一 wire 及兼容策略明确决定，不能静默接入。

最新 `0a4bdc19` 已隔离独立 controller（要求实验 flag、拒绝公共安装变量），生产 server 已拒绝独立配置并移除旧 singular API 和全局 gate 注册；middleware 已改成 method+FullPath，增加 ContextGate 与 Skill context 传播。保留复用，旧 singular 排除缺陷不再作为最新 PR 未修问题。D/A 仍须对照原 operation policy 审查候选列表与阶段锁；A 发现的八项 allowed_when_disabled 差集不能自动当 business-gate 豁免。全部 writer 的实际公共 gate adapter/main 注册仍缺。不能按 GET 全放行，原认证授权完整保留；nil/disabled 行为不代表 capture 资格。D 当前启动关门后重试 backfill 的修复不能被 PR 旧 worker 覆盖。

## catalog 与原门禁

当前原生 `--strict` 仍为 exit 1；`--check` 还发现上游合并后的生成 inventory/registry 过期。直接构建当前报告、不改生成文件得到：122 个对象、121 个 migration 对象、22 个新增未分配对象、136 份 migration；Policy pending 32、cross-review pending 68。旧 40/60 计数不作为当前状态。

| 缺项 | 首责交付 | D 动作 |
| --- | --- | --- |
| catalog imports/records/scan_states 三张 canonical 表 | C 给出领域/状态/唯一性/原 authority 与 reader/finalizer 事实；D 负责 migration 和公共 SQL | 按准确同版本合同建迁移、复核，再跑真实 SQL；PR 独立 catalog_records 不作替代。 |
| recovery_catalog_records、catalog_scan_record | C，A 复核签名/authority | D 消费并落实 schema/查询；维持 missing。 |
| restore_target、status_relay | B候选已交付；A复核隔离/身份/期限，D联审 | `b-candidates`已导入，尚未晋升正式registry；公共门禁继续按正式合同缺失处理，不能把候选记成签收。 |

原阶段、权限、cross-review、现场 schema-hash 与四部署门禁保持不变。

## 现场与命令

首轮安装环境固定 `clawmanager-zhanghui08-system`。用户实际公共盘点确认 namespace UID `337cfe30-2c17-4b8e-b32a-760778b8098e`，当前应用仍为 fix18/digest `c16f07c2…`，并非本轮新 server/B/C 组合。白名单备份变量无显式引用、应用无相应材料挂载；这不证明容器所有文件或其他配置来源均不存在。容量 PVC Bound 不证明原物理报告或授权。

`scripts/system-backup-d-field-preflight.sh` 支持：

- `--public`：公共 namespace/Pod/deployment/PVC 引用，不输出 Secret 值或 env literal。
- `--sql-pins`：在已固定 namespace/Pod UID 下，仅用 MySQL Pod 原 DBA 环境执行白名单只读元数据/安装查询；不创建账号，不冒充独立 observer，不输出密码。没有原 credential/database 映射则拒绝。
- `--account-plan`：操作员显式设置 `SBK_OBSERVER_DATABASE/USER/HOST` 后，只打印新独立 TLS/locked reader 与六张精确 SELECT grants 的待执行方案；不执行 SQL，不生成或输出密码。凭据经原受控渠道配置后才解锁，pins 仍须独立核验。

公共盘点旧命令的 SSH socket close 警告没有远端退出码或删除后检，暂只接收已输出的公共事实。后续命令加入 `REMOTE_EXIT` 和 `TEMP_CLEANED`，不要据该警告自行宣布实测成功或失败。原始日志保留在 `docs/evidence/d-first-chain-field-20261028.log`。

新 `--sql-pins` 加入 `server_version`。TLS rollout已重建MySQL，旧 `mysql-66496b8965-d6tsl/dab1cbf6…` 失效。以下使用最新现场TLS交接中的Pod/UID，执行前仍须核对未再次重建；脚本不匹配即拒绝，不创建账号、授权、安装或启用：

```powershell
scp .\scripts\system-backup-d-field-preflight.sh root@10.130.14.23:/tmp/sbk-d-version-readonly-20261028.sh
ssh root@10.130.14.23 'SBK_EXPECTED_NAMESPACE_UID=337cfe30-2c17-4b8e-b32a-760778b8098e SBK_EXPECTED_MYSQL_POD_UID=6d314752-86e1-41ce-9831-af03179dcf3b SBK_MYSQL_POD=mysql-74bd777b8-j85z7 bash /tmp/sbk-d-version-readonly-20261028.sh --sql-pins; rc=$?; rm -f -- /tmp/sbk-d-version-readonly-20261028.sh; echo REMOTE_EXIT=$rc; if test -e /tmp/sbk-d-version-readonly-20261028.sh; then echo TEMP_CLEANUP_FAILED; exit 1; fi; echo TEMP_CLEANED; exit "$rc"' 2>&1 | Tee-Object .\docs\evidence\d-first-chain-mysql-version-20261028.log
```

接收条件为 UID 匹配、原 SQL pins/版本清楚、`REMOTE_EXIT=0` 和 `TEMP_CLEANED` 均出现。此仍是 DBA 元数据预检，不代独立 observer 或 live grant/执行验收。脚本三组 Python 投影测试及 Bash 语法验证的原始失败/恢复记录见 `d-field-preflight-server-version-20261028.*`；没有自行安装 Python，使用已带运行时，禁写 bytecode。

本地验证入口：

```powershell
.\scripts\system-backup-d-first-chain-validation.ps1
# 仅验证本轮执行/authority/leader 改动及 controller 构建：
.\scripts\system-backup-d-first-chain-validation.ps1 -ExecutionOnly
```

此入口 `GOTOOLCHAIN=local`、`GOPROXY=off`、`GOSUMDB=off`、`-mod=readonly`；冻结准确来源，原生测试/构建后删除本轮自有 source/cache/tmp/telemetry/binary，保留 json/jsonl。Node/Python 的 harness/preflight 结果均为本地工具验证，不算真实链。

最新B/D接线回执 `d-b-public-runtime-wiring-20261028.json`：B四包86/251、controller36/94、dispatch6/17、main4/4，共132根/366pass，零fail/skip，Windows controller构建0；同一D/B准确源码Linux/amd64构建0（未执行）。两轮自有目录已删除。Linux全目录current-match=false的并行API/schema/observer/托管变化逐项列出，不能冒称全checkout通过；D/B精确pins与两轮snapshot及当前字节一致。

Requests独立回执 `d-task-requests-20261028.json`：API全包19/84 + server构造2/2，server构建0，五份实现/合同字节精确匹配，cleanup=true。原合同Node检查旧deadline caller断言改为带回执的SQLTaskClaimStore后，全70项通过；`d-contract-artifacts-receipt-caller-20261028.*` 保留沙箱spawn EPERM及原生恢复日志，未安装依赖。这些结果均不代真实SQL/provider/整链。

上一轮执行接线记录：`docs/evidence/d-execution-wiring-20261028.json`，原生全日志前缀 `d-first-chain-native-a74d9157f9b94a74ab1dec38904e7099`。当时 21 根/33 pass events、controller Windows 构建 exit 0，准确自有产物清理完成；此后新增初次启动事务与权限锁修正，不能用该历史回执背书新字节。

当前初次启动事务最终回执：`docs/evidence/d-backup-start-atomic-20261028.json`（v2），原生日志 `d-first-chain-native-8bd0243724f441f4b1f9bc86f91a9f7a.*`。36 根 controller 定向测试、1 根 dispatch、3 根 main，共 **40 根/98 pass events，0 fail/skip**；4 phase exit 0，含 controller 原生构建；冻结源码与当前 backend/contracts 一致。五轮本轮自有 source/cache/tmp/telemetry/binary 目录均实际不存在。先前 9376 的 38/96 保留在 `.clock-reviewed.json`，只审过旧锁形状，已被新记录替代。

新验证含整个初次 write-set 的整体回滚、双 attempt 单元、核心事件/claim receipt 按 ID 复查、未知提交不授身份和不自动重试、原 spec 防修改、关闭/缺 owner/过期/非 UTC 拒绝，以及入口→stage、stage 出口→外读、预算→复查、A→fixed、fixed→final 的时钟回退和最后 SQL 越过原授权期限。只读历史/追加账本不请求写锁的两根也通过。**它们是本地 SQL 协议/调用验证，不是实际 MySQL/grants/B/C 成功任务**；原 catalog 门禁、实际权限/版本验证与真实整链仍未通过。A 独立源审和回执核验不授 production resource grant。

之前三轮的原生日志和构建记录保留，但代码随后补过 leader 生命周期、guard 或 BackupSpec，不能替代上述最终字节。`BackupSpec` 的最小共享 ABI 补丁是 `docs/evidence/d-public-dispatch-backup-spec-20261028.patch`；B 仍须提供 runner，D 仍须提供真实 spec/plan/claim 输入 store。A 对 execution guard 两项修正的独立复核见 `docs/evidence/a-d-execution-guard-review-20261028.json`，不代替后台授权来源。

真实成功、同键重试、权限/跨安装拒绝及约定失败轮，仍须上述真实 owner link、同版本 B/C wire/adapter、受控材料/SQL reader/pins 与新部署到齐。当前不发会必然 not_ready 的创建请求，也不绕过门禁制造模型成功。
