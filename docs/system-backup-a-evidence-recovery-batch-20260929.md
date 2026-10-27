# A：到期写入的扫描与批次恢复（2026-09-29）

新增 `SQLWriteRecovery.ReconcileBatch`，将候选查询与已有单条恢复接成可由 worker 调用的一次执行入口。它仍只确认原确定性 key，不获得 Put、Delete、Range 或解密能力，不更新 owner 终态。本轮交付的是批次执行组件，尚未挂载生产 HTTP/worker 入口。

## 扫描和逐条执行

扫描复用单条恢复的配置锁与准入校验：固定 mTLS peer、DB UUID/name/UTC、installation、active config version/hash、store/read ref 与合法 retry policy。enabled=false 不阻断只读收敛。扫描使用 5 秒上下文，提交并释放控制面锁后才开始逐条恢复；批次上下文为 30 秒，单条 provider 调用仍受 20 秒上下文限制。失败信号沿用独立的 3 秒上下文，可能在批次取消后继续完成持久化。

候选限定为 pending/write_unknown、immutable version 未定、相同 store identity/version、精确 `root/installation/` 前缀、next reconcile 已到期或为空、无 live claim。前缀使用字面 LEFT 比较，避免 installation 中的下划线被 LIKE 当作通配符。证据表没有独立 installation 列，因此该前缀只用于缩小候选，不能替代随后 `SQLPolicy.LockScope` 的真实 owner 校验。

批量上限为 100，按数值主键 keyset 分页，不用 OFFSET；最多读 limit+1 个候选判断后续页。返回值 `AfterID` 只推进到已尝试的最后一个候选，`More` 表示仍有候选页或本页尚未尝试的候选。调用端在 More=true 时从该游标继续，到页尾后下一轮从 0 重新扫描。新变为到期的旧 ID 会在下一轮被重新看到。

每个候选重新执行完整 `Reconcile`，检查配置、owner deadline、claim、精确 key 和 manifest。单条被拒绝或失败会记录有界错误并推进游标，避免总是卡在首条记录；它仍保留在数据库，下一轮可再次检查。扫描查询失败、行读取失败、非法顺序/ID、提交不明或身份变化不交付部分候选，也不调用 provider。

取消会停止后续候选，保留已尝试记录的结果和游标；已取得但未完成的 claim 按原租约过期后接管。调用者必须同时检查批次 error 与逐条 Results，不能把“批次执行完”解释为所有 evidence 已 ready。

## 重试时间成为事务内约束

单条 `Reconcile` 在证据行已锁定、准备取得 claim 时重新读取 next_reconcile_at。未来时间返回 version_conflict，不写审计/claim、不访问 provider；时间恰好等于数据库当前时间允许执行。该检查也覆盖直接调用及扫描后的调度漂移。

结果登记仍沿用上一轮实现：未知结果安排下一次重试；成功或完整性冲突清除重试时间。授权复查和结果提交不受本次调度时间再次阻断，否则会妨碍已经合法取得 claim 的工作完成。

## 运行接线和验证边界

D 仍需提供正式 SQLPolicy、持久化 Failure/指标、工作身份准入、配置装载和生命周期入口；轮询周期、游标保存/重置、退出与重启交由该宿主实现。本轮没有创建常驻进程、自动任务、生产身份或路由。A/C 的独立 STS/read ACL、真实 provider 版本/checksum profile、历史 store 映射及不存在证明仍待完成。

limit 限制返回候选数量，5 秒上下文限制查询时间；不能据此声称数据库只检查 limit+1 行。现有索引下的实际执行计划、数据量和多副本竞争仍需要 D 的真实 MySQL 验收。DB driver/provider 必须遵守 context 取消。

新增事务 transport 测试覆盖扫描提交先于 provider、游标推进/页尾、非法批量参数、错误身份/配置/查询/行/提交、扫描后调度/claim/config/owner deadline 漂移、取消和直接重试边界。它使用真实 SQLRegistry 与 authority 路径，但数据库、owner policy 和 provider 为模拟。

隔离 MySQL 探针另增实际候选 SQL 的过滤用例，覆盖 store/version、字面 installation、游标、next reconcile 和 live/expired claim。本轮只编译该探针，未在真实 MySQL 执行，不把新增用例纳入已通过现场证据。

本地验证命令：`pwsh -NoProfile -File scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`。结果见 [机器记录](evidence/system-backup-a-evidence-recovery-batch-local-20260929.json) 和 [完整输出](evidence/system-backup-a-evidence-recovery-batch-local-20260929.txt)。禁止依赖下载，并清理本轮缓存、临时文件与构建二进制；保留交付源码和验证记录。

入口退出 0：67 个主测试、466 个子用例通过（36.720 秒），其中本增量新增 6 个主测试、21 个子用例。Linux 探针与迁移工具构建通过，95 项源码摘要保持一致；本轮 scratch/cache/二进制已清理，并独立核对目录不存在。
