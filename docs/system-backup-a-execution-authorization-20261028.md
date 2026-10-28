# A：公共 execution 授权接点复核

2026-10-28，源码复核交给 D。`SQLExecutionAuthority` 的公共记录锁、claim/fence/config/task/attempt/时钟检查可作为结构守卫；其 `ExecutionAuthorization` 仍须独立原授权来源。当前未找到可直接接入该接口的生产 A 实现，不能以一个转发 hash 比较的 wrapper 宣称授权完成。未编辑 D 的 controller/main 或 execution 文件，未执行 D 新测试或真实 SQL。

后续两项源码问题已由 D 修复并经 A 独立核对：guard 改为指向包含 mutex/failed 的共享 state，副本不能各自恢复；Bind 保存原 context，Recheck 精确比较同 context/tx，Check/Bind 拒绝 typed-nil/non-comparable context。A 随后核对 D `838a12af4f4c4b838735c6281695159d` 的 execution-controller 阶段：实际 exit=0、完整 package pass、无 fail/skip，两个新增负例根均通过，冻结源码 SHA 与 A 所审两份文件一致；A 不重复运行。D 整轮构建/清理当时尚未终结，不能把这个阶段结果写成整轮终态。源码 pins、原生日志摘要及限定结论在 `evidence/a-d-execution-guard-review-20261028.json`；不代表完整 SQL authority 评审或原工作资源授权通过。

最终回执随后已接收：`evidence/d-execution-wiring-20261028.json` 引用 `a74d9157f9b94a74ab1dec38904e7099` 最终冻结轮。A 已用 `scripts/system-backup-a-d-execution-receipt-review.ps1` 实际核对三包完整原生 run/pass（21 根 / 33 条、无 fail/skip）、四个 phase exit=0（含 controller 原生 build）、当前 source pins 和两项 guard 精确被审字节；四轮 owner 目录均不存在，cleanup=true。前三轮只作 superseded 历史，不代替最后字节。`D_final_test_receipt_verified=true` 仅接收此测试/清理回执，`full_SQL_authority_review` 和 production 授权标志仍为 false。

D 新增 Input.Backup/BackupSpec，保留原 task purpose/parts 观察并深拷贝。A 单独比较 `d3c5715a` 与当前文件的 Authority/JobBinding 完整声明（只忽略空白），两者均未变，四份 A relay 字节仍与原 8/70 回执一致；不用为该观察字段增量重复跑 relay。未增加或扩大后台 grant，两个生产 link 仍未绑定，总装配仍受原来源/合同/材料阻塞。

## 后续 SQL start 原子边界复核

D 后续新增 `SQLBackupStartStore` 并修改 execution guard 的 ValidUntil/floor；上述 21/33 只验收原冻结字节，不能覆盖这次新增源码。A 按 D 请求只读复核 shared claim staging、同一 RR 事务的状态/双 attempt unit/三个 event、clone 输入、缺 owner 拒绝、唯一 commit 和 unknown commit 不返回授权等边界，没有编辑 D 文件或重跑测试。

原报告的 post-A/fixed-final 时钟缺口已有源码修正：D 新增失败后归零的 ObservedAt 观察，Start 传入成功 A floor，固定 claim 样本必须不早于该 floor，函数返回这个固定样本供 finalNow 比较；固定 SQL 后仍没有 owner callback。A 已核对新负例模型分别产生 A=4→fixed=2、fixed=5→final=4，均针对原报告时间序列；新字节的最终测试/清理回执尚未接收，不能借 `93c1118f` 旧 snapshot 代验。

先前还发现预算首时钟 now=5 被复查时钟 now=2 覆盖的同类缺口。D 后续已将入口→stage first/heartbeat/last→原 claim→Bind→预算首/次采样→RecheckAfter→成功 A→fixed→final 全段传递，预算回退在 RecheckStart 前拒绝，RecheckAfter 在 A owner callback 前保留调用者更近下界。A 已只读复核该链和五条反例模型，在这次所审原子边界内未再发现阻止源码接收的新问题。

最新 `937673dedd044162bee2c511dd26d92c` 的 controller 阶段已有实际 exit=0/完整 package pass/无 fail skip；两根时钟回归和五个子例都通过，四份当前 Go 源码 SHA 与该轮 frozen inputs 一致。A 不重跑，只接收此阶段证据；当时整轮仍 running/cleanup=false，待 D 最后构建和清理回执。准确源 pins、历史发现及修复、当前阶段结果均在 `evidence/a-d-backup-start-atomic-review-20261028.json`。生产 original grant/材料和完整 execution store 仍缺，此次 source/回归接收不等于真实初始化或执行准入。

最终整轮随后已接收：`evidence/d-backup-start-atomic-20261028.json` → 同一 `937673...`。A 实际运行只读 `scripts/system-backup-a-d-backup-start-receipt-review.ps1`，核对当前十二项 D source pins、原 frozen Go pins、A 所审四文件字节、三包完整 run/pass（controller 34/92、dispatch 1/1、main 3/3，共 **38 根/96 条**、0 fail/skip）与四 phase exit=0（含原生 build）。五个时钟回退子例及原授权期限跨最后 SQL 的负例均在该最后轮中；c54e/93c/385f/9376 四轮 owner 目录实际均不存在，cleanup=true，旧三轮不代最后字节。

因此本次报告的两项时钟发现已在限定源码和模型回归范围关闭，`final_receipt.verified=true`、`D_final_run_pending=false`，没有重新执行测试、安装依赖或产生构建缓存。该结果没有真实 MySQL、真实 B 执行或 provider 验收；完整 ExecutionWorkStore、A 原资源授权/业务容量准入、B publicadapter、C 产物和两个 production link 仍缺，不关闭任何现场 bootstrap 槽，总装配阻塞维持。

## 后续锁权限相容性与 grant 差集

D 之后对照原 `controllerTableGrants`，把 installation/config 的联合 `FOR UPDATE` 改为先排他锁 installation、再 `FOR SHARE` configs；attempt/event 的只读核对也用 `FOR SHARE`。A 核对源码和原矩阵后，确认不应为历史表追加 UPDATE/DELETE/LOCK TABLES 来迁就读锁。[MySQL 官方锁定读文档](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)明确：SELECT-only 的 `FOR SHARE` 要求 MySQL 8.0.22 起，`FOR UPDATE` 仍需 SELECT 加额外写/锁表权限。实际部署版本须单独确认，不能把通用“8.0”描述当作满足该条件。

当前可见 start SQL 相对原 runtime 矩阵有四项最小候选差集：events SELECT、attempts INSERT、job_observations SELECT、staging_resources SELECT。准确表名、原 verbs、理由、源码 SHA 和真实正反 grant 验收要求在 `evidence/a-d-controller-start-grant-review-20261028.json`；只读脚本 `scripts/system-backup-a-d-start-grant-review.ps1` 已运行。A 只接收此源码差集作为 D/A 后续矩阵审查输入，没有修改矩阵、签发原资源授权或执行 GRANT。原 exact probe 继续拒绝缺权限与额外扩权；该扩展仍需正式审查与真实 MySQL 上 candidate 正向、逐项撤除四权限的负向、非法额外权限及并发锁语义验证。原 Owners 十一项不重跑。

旧 `937673...` 的 38/96 回执只验收旧锁语句字节，不能代验这次新 SQL，D 已将它保存在 `.clock-reviewed.json`。随后新最终 `8bd0243724f441f4b1f9bc86f91a9f7a` 回执已接收：A 实际运行 `scripts/system-backup-a-d-start-lock-receipt-review.ps1`，核对 D 当前十四项 pins、native frozen Go 字节、A 所审五份 grant/锁源码、三包完整 run/pass（36/94 + 1/1 + 3/3，共 **40 根/98 条**、0 fail/skip）、四 phase exit=0（含 build），五轮 owner 目录实际均不存在，cleanup=true。两项新增锁形状根和时钟回归根均在该最后轮通过；不重复执行测试。结果在 grant review 的 `final_receipt` 及 atomic review 的 `lock_shape_final_receipt`，原矩阵字节仍未变。

该接收仅证明新 Go 字节的源码/模型回归与清理，不证明真实账号权限、并发锁或新四项 grant 已授权；field preflight 的 Python/Bash 检查也未被本 A 回执代验。四项差集仍待正式矩阵审查和新的真实正反 grant 测试，production link、现场槽位及真实链状态不变。

| 已有入口 | 准确权限和事务边界 | 对 D 新接点的结论 |
| --- | --- | --- |
| `systembackupsecurity.SystemBackupActionAuthorizer.Scope` → `SystemBackupActionScope.AuthorizeAction/RecheckAction` | 精确 HTTPS POST 创建路径、原 JWT/SQL login session、当前 `system_backup.operate` 和 pins；同一请求 context/SQL tx | 只授两个 create action。不能把已提交创建请求的 scope/actor 延长为后台 prepare/capture/preflight 工作授权。 |
| `systembackupevidence.NewRelayPeerAuthenticator` → `BindDispatch/RecheckDispatch` | 已独立准入的证书/CA/SPIFFE/Job 绑定，完整 dispatch tuple、同 context/tx、原期限；无 SQL/网络 | 可直接叠加在 D relay 事务，但只是 transport/material 守卫，不实现 `ExecutionAuthorization`。 |
| `systembackupevidence.NewSQLTaskAuthority` / `TaskRuntime` | 精确 Job 日志 evidence producer、内容加密/登记/发布/STS；自身阶段和事务协议 | 不能扩大为任意 runner/controller 执行许可，也不能在 D 已开事务中调用其另开事务的 runtime。 |
| `systembackupproducer.Execution.BeginCall/RecheckCall` → `NewSystemExecutionPreparer` | 原 C1 handle/snapshot、原 `content_read`/`wrap` 与 system capability evidence；原 `ExecutionEnvironment` 的安装、domain/grant、host、refs、容量和最终复查 | purpose 和凭据域不是公共 runner dispatch；不能把 Authority 字段转成 handle，也不能在 D 单事务中嵌套其 committed calls。 |
| bootstrap Original 的 `PrepareBootstrapCandidates` → session `Authorize/LockHosts/LockReferences/Reserve/LockEvidence/Recheck` | 只在真实初始化合同中认证原安装/资源 selections 并事务消费 | 初始化准入不能自动成为永久运行授权。实际独立 Original 和 production link 仍未交付。 |

D 的准确保留接口为：

```go
AuthorizeExecution(ctx context.Context, tx *sql.Tx,
    authority dispatch.Authority, dbNow time.Time) (ExecutionAuthorizationGuard, error)
// guard.RecheckExecution(ctx, 同一 tx, 同一 Authority, freshDBNow)
// guard.ValidUntil() 固定原最短期限，禁止刷新或从新授权静默续期。
```

实施这个生产 owner 仍须原部署来源提供：原 controller 工作身份/版本及其认证方式；installation/config 与 prepare/capture/preflight 的精确用途映射；各操作所需 provider/scope/resource/key/credential refs 和版本（包括 Secret allowlist）；当前撤销、not-before/expires、保留历史策略及可在该 tx 锁序内读取的来源。`ClaimOwner` 字符串、SQL 行存在、grant receipt/hash、一次 provider 调用成功都不代替这些事实。缺扫描不能当作空资源集合。

责任：A 实现并复核身份、用途/资源授权和期限；原部署/资源 owner 认证来源，B/C 固定实际操作与资源组合；D 提供其真实锁序内读取/最终 guard 接点并统一现场发现。若来源需网络，先在事务前准备不可延长的原观察，事务内只做原当前事实检查；没有来源不得填静态 allow、内存批准表或测试替身。

复核时 D 应保留以下条件：无实现/typed-nil 时不注册生产执行；同 context/tx、原 Authority 和原 deadline；原 guard 副本共享失败状态；当前 purpose/resource/revocation 检查后仍执行最终 SQL clock/claim/fence 守卫。新授权仅供 forward prepare/capture/preflight，取消、期限后恢复、密文发布及 Job 创建各走原专用协议。这是接线边界说明，不是对 D 新源码完整正确性的签收。
