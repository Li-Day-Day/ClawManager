# D：producer 观测绑定与固定调用快照

日期：2026-09-30。承接 [四命令生命周期](system-backup-d-producer-lifecycle-20260930.md)，本轮增加 `BindObservation`、`BeginCall` 和 `RecheckCall`。生产环境认证和 provider 接线仍未完成，没有新增 HTTP/controller/worker 启用入口。

## 实现与边界

[execution.go](../backend/internal/systembackupproducer/execution.go) 提供服务接口和私有 `CallSnapshot`，[execution_policy.go](../backend/internal/systembackupproducer/execution_policy.go) 负责事务内授权及状态比较。

| 接口 | 行为 |
| --- | --- |
| BeginCall | 要求本 Lifecycle 实例已提交的执行句柄，读取当前 domain/grant/run/host/target/ref；确认提交且期限未过后返回固定快照。 |
| RecheckCall | 重新读取并比较原 binding 和全部 facts；续租、撤销、接管、身份/ref/策略/claim/证据变化均可能使原快照失效。不替换快照或延长期限。 |
| BindObservation | 要求原 probe 快照及独立 evaluator 证明；精确绑定 run 版本、原输入/配置和时间窗口。观察时间与到期时间只写一次，run 版本增加；完全相同的重放只读回。 |

调用用途封闭为 `probe`、`content_read`、`wrap`、`sts`、`publish`。初始 probe 只允许尚未绑定观察时间的 acquired run，选择的 ref 必须是原探测目标。content_read/wrap 必须已有有效观察时间，run 仍为 acquired，且环境证明对应 system capability evidence 尚未写入。STS/发布必须为 pending run，持有本 Execution 实例的私有 `PublicationClaim`，并精确匹配证据版本、原 manifest、claim owner/期限和 refs 版本。

**本轮没有实现 PublicationClaim 的生产签发器。** 测试仅在包内构造私有 claim 验证拒绝边界；外部调用者不能用普通 ClaimBinding、pending 行或 JSON 获取它。pending/claim 提交事务落地前，STS/发布仍不可从生产入口使用。

快照固定服务实例、scope、主体、grant/generation/version/run、用途、证据、ref/策略、完整事实和最短期限。期限取 domain admission、lease、grant authorization、当前身份、依赖、原请求预算及适用的观察/claim/原 owner 写截止最小值。每次事务均在锁等待、工作及最终复查之后采样数据库 UTC，提交不明或提交返回时已过期不返回新快照。

View 的 CapturedAt 是最终检查后、提交前采样的数据库时间，不是磁盘提交完成时间。BindObservation 已知提交但返回跨期时可以返回历史结果和 ErrCommittedExpired；调用者不能把该结果当作新的调用权限。

`CallSnapshot` 不可 JSON 编解码；hash 是关联数据，不是凭证。`View()` 返回深拷贝，只供 A 适配读取绑定数据，修改副本不会改变原快照。A 必须保留原对象并在远端 I/O 前后调用 RecheckCall；本轮尚未实现该 A 接线，也未宣称跨进程或远端撤销原子性。

## 必须实现的环境

`ExecutionEnvironment.PrepareExecution` 在 BEGIN 前固定每次调用独立的 `ExecutionSession`，构造器拒绝缺失实现。安装/config、当前身份/撤销、host/ref、精确 evidence 行或缺席范围、最终 current read 都由受信环境在指定锁序中核验；没有通用成功实现。环境回调不得持 SQL 锁调用 provider。

BindObservation 的 Authenticate 必须独立验证 evaluator 来源及 attestation 对原 probe hash、scope/run/input/profile 和精确时间的绑定；对调用者字段求 hash 不能替代证明。绑定必须在原 probe 期限内完成，不能借新的预算延长旧探测。

BeginCall/RecheckCall 不分配持久记录，不预留容量或写 mutation audit。首次观测绑定增加 64 KiB 固定事务成本及环境证明的现有审计成本，并在同一事务内执行 reservation、intent audit、run CAS、result audit。BEGIN 前固定的容量报告在等待后仍须满足五秒窗口；缺报告拒绝新写入，完全相同的重放不收费。计数及费用溢出拒绝。

执行请求和快照摘要分别使用 `system-backup-producer-execution-request.c1`、`system-backup-producer-call-snapshot.c1`，沿用 typed frame 编码。这些新增摘要域、只读调用收费/审计解释、原 probe 期限内绑定及 A View 接口仍是 A/C 集成评审输入，不代表公共合同已冻结。

## 验证与后续

最终脚本退出 0：Windows 31 个顶层测试、含子测试共 424 项通过，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行该二进制。独立测试缓存与构建产物已清理，未安装依赖。migration catalog 仍为 94 文件，hash 为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

测试使用可模拟提交/回滚的标准库 driver，覆盖实际生命周期变更导致旧快照失效、观测只写一次、锁等待跨期、环境/审计失败、固定费用、提交不明、提交返回跨期、私有 claim 和副本隔离。它不证明真实 MySQL FK/gap lock、跨进程并发或 provider 行为。

沿用禁止下载依赖且清理本轮产物的 [验证脚本](../scripts/system-backup-d-producer-validation.ps1)。最终源码指纹记录于 [本轮机器记录](evidence/system-backup-d-producer-execution-20260930.json)，旧里程碑记录保留原范围。

后续继续 pending/claim/发布/结果事务、历史读取与恢复、独立域 provisioning/紧急撤销、生产 CommandEnvironment/ExecutionEnvironment、A 实际适配及 C 独立证据通道；使用 Job 时还需 B 宿主身份签收。候选八表尚未执行或纳入正式 migration/inventory，真实 MySQL V01–V10、A/C 评审与生产部署验收仍未完成。
