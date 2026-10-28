# D 公共 task claim 与持久 receipt

2026-10-28。用户追加要求把实际 claim CAS 与 receipt 放在同一事务，本增量落实该公共协议。此前 B 核对中“当前 claim 无历史 receipt / 建议 B 另写 diagnostic.b.*”为原轮事实及建议；**当前使用下面统一的 D 入口和 `diagnostic.d.task_claim_acquired`，B 后续适配须消费同一入口**。这不是 B 已确认或 B runtime 已接入的声明，也不改变 PR #1 的独立控制库/manifest 不兼容结论。

## 公开方法

```go
type SQLTaskClaimStore struct {
    DB *sql.DB
    InstallationID string
}

func (s SQLTaskClaimStore) AcquireWithReceipt(
    ctx context.Context,
    target Target,
    owner string,
    expectedRowVersion uint64,
    policy LeasePolicy,
) (ClaimToken, error)
```

实现：`backend/internal/systembackupcontroller/sql_task_claim_store.go`。仅 backup、drill、preflight、artifact_verify；operation 在 SQL 前拒绝。InstallationID 必须来自已准入的 controller 部署。该方法只授予原 task claim token，不授予业务执行权限，不创建 attempt/Job，不绕过现有 readiness/kill-switch/deadline/授权与原最终复查。

事务顺序固定：

1. 验证固定目标、安装、owner、expected version、原 LeasePolicy；使用原 context 的 TTL 有界子 context。
2. 唯一 repeatable-read transaction；通过现有 `AcquireClaimInInstallation(ctx, tx, ...)` 执行原 DB UTC 时钟 CAS、同安装/版本/活动状态/调度/原 owner 期限条件。
3. 在原 transaction 锁定已领取行，读取 schema/安装/public ID/kind/原 request_id/status/owner/version/heartbeat/lease/当前 DB UTC 时钟。检查 SQL lease 严格未过期、heartbeat 未在未来，until 精确等于原 CAS heartbeat+TTL。
4. INSERT 固定 `diagnostic.d.task_claim_acquired` 事件，绑定同安装/kind/public ID/原 request_id，固定脱敏 message，task_status 为已锁定原状态。无 provider/credentials/任意诊断文本；影响行数必须为一。
5. 同 transaction 再读并核对原 identity/request ID/status/owner/version/heartbeat/until；DB clock 不得回退，now 必须严格早于原 until。原 lease 不延长。
6. 唯一 commit 成功且 context 仍有效，才返回 token。CAS loser、receipt SQL/行数失败、最后事实漂移、时钟回退/过期共同 rollback；commit 错误或提交后 context 失效返回零 token + `ErrTaskClaimCommitUnknown`，入口不自动重试。

错误：`ErrClaimNotAcquired` 保留 CAS contention 分类；`ErrTaskClaimReceipt` 表示 receipt/最后事实不能确认；`ErrTaskClaimCommitUnknown` 表示结果可能已持久化，不能凭错误推断 rollback，也不能凭错误继续使用 token。调用方应独立重新读取原持久事实，不盲目换一个新 expected version 重领/重写历史。同一原版本重试在已提交模型中 CAS 失败，不增加第二份 receipt。

## 实际 caller 与 observer

`SQLDeadlineStore.Acquire` 调用该公共 store；原 ListExpiredPending、无 attempt/外部副作用的 pending Expire、Release、kill-switch 和原权限矩阵不变。该 caller **仍是 D 未开始任务超时处理**，不能记成 B 已领取执行。B 消费 D 已提交的身份，不自行再次 claim，不另建第二任务控制库或事后独立 INSERT receipt。

新增 `SQLBackupStartStore.StartNext→Start` 使用同一私有 `stageTaskClaimWithReceipt`，但由更外层唯一事务合并初次状态/attempt 写入：pending→preparing、attempt 1 的 capture/secret_capture 两单元、两个核心 event，含原 receipt 共三个 event。最后按准确 event ID 复查。stage 自己不 commit，并把原入口 SQL 时钟高水位带到最后读取后返回；Start 继续传至预算、A、fixed-final 和 commit 前最后时钟。完整 store/profile/plan/Job 与原 grant/容量尚缺，两个生产 link 仍未绑定，不把这个组件记为 B 已执行。

独立 observer 的 `ClaimEvent` 同步为 `diagnostic.d.task_claim_acquired`，只计真实持久事件；无事件仍为 `claimCount:null, claimHistory:"unavailable"`。lease、attempt、row_version 仍不用于猜历史次数；`claimCount` 本身不能证明 B 执行，必须联合真实 attempt/Job/relay、终态与 checksum。操作领取、续约和释放不记作新的 task acquisition receipt。

`AcquireWithReceipt` 本身仍只用原四张 task 表 SELECT/UPDATE 与 events INSERT。初次 Start 组件另需 events SELECT、attempts INSERT、Job observation SELECT、staging resource SELECT；这些是待审查/现场正反测试的精确增量，不是已批准或已授的权限。原 exact grant probe/matrix 未改、不执行迁移或部署。原低层 `ClaimCoordinator`/CAS 保留为 primitive（operation 及原 renew/release 继续使用）；两外层事务复用同一 stage 公共协议，B 不调用私有 stage。

只读核验使用 `FOR SHARE`，安装/gate/task 所有权行仍 `FOR UPDATE`；分开安装与 config 的锁，防止只读历史 JOIN 意外要求 config UPDATE。MySQL 从 8.0.22 起 `FOR SHARE` 仅需 SELECT，`FOR UPDATE` 仍额外需要写/锁表权限，依据 [官方 locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)。现场 server 版本与精确 grant 仍须验证，不以 driver 模型证明。

## 验证与清理

完整本地命令（使用已有依赖，不安装）：

```powershell
# 在 backend，设置本轮独立 GOCACHE/GOTMPDIR，并在终态后删除该准确自有目录。
$env:GOTOOLCHAIN='local'
$env:GOPROXY='off'
$env:GOSUMDB='off'
go test ./internal/systembackupcontroller ./internal/systembackupobserver -count=1 -json
```

新增 driver 模型验证四类 task 成功原子提交、CAS loser 无 receipt、receipt SQL/零行失败回滚、schema/安装/public ID/kind/request ID/status/owner/version/lease/heartbeat 漂移、SQL clock 回退及等值过期共同回滚；commit 已持久化但应答丢失时零 token/无自动重试，并验证原版本重试不重复 receipt；真实 `SQLDeadlineStore.Acquire` caller 通过该入口。operation/非法 scope/canceled context 在 SQL 前拒绝。模型不代替真实 MySQL/权限/远测整链。

原生日志：`docs/evidence/b-claim-receipt-native-20261028.jsonl` 和同名 `.status.json`。本增量源码 hash、准确通过数、退出码和独立 cache/tmp 清理见 `docs/evidence/b-claim-receipt-validation-20261028.json`。父 agent R2 冻结旧字节的结果不背书本增量。当前没有安装依赖或现场执行，生产 B 适配确认仍待交付。

实际完整命令原生 exit **1**：observer 完整包通过，本新增 claim 六根/25 条通过事件均通过；controller 唯一失败为原 `TestRepositoryMigrationCatalogMatchesControllerAdmission`。它观察当前 migrations 为 136 份、`dba576ad9efd3f377d8d07de2a9a86d4e523d8dafe8943751beb057a64e52441`，原固定门禁仍为 96 份、`0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`。本增量没有修改 migration、catalog 常量或跳过该测试；此失败作为准确剩余阻塞保留，不能把局部 claim 通过报告成完整 controller 通过。
