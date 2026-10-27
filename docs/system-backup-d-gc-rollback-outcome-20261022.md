# D GC 回滚结果与批次游标（2026-10-22）

状态：五份文件已合入并接收。隔离与合入后完整 evidence 包各 369 个根测试、3,032 项含子测试通过，均保留 default vet，两个完整结果逐项一致；定向 7 主/58 项通过，两个反例准确失败且候选恢复后摘要一致。

原 Collect 在正常拒绝或审计失败后，通过 defer 调用 Rollback，却忽略其错误。批次将 ErrDenied 视为可计数拒绝并推进游标；若回滚回包丢失，调用方就把未确认结果当成了已结束的普通拒绝。

候选让连接所有者记录唯一提交尝试。成功提交和提交结果不确定均不再执行或宣称回滚；没有提交尝试时，只有本次 Rollback 返回 nil 才承认其结果。驱动回滚报错、取消后已被自动处理的 ErrTxDone，均返回独立的 download_retention_gc_rollback_unknown。该错误在批次中先于 context 取消处理：停止、保留上一已确认游标、不计拒绝、不计收集，也不重试。

Go 文档说明 Tx 在 Commit/Rollback 后不能再使用；本轮另检查本机 Go 1.26.1 的 database/sql 实现：事务的 done 标记先置位，再执行驱动 Rollback，后续 ErrTxDone 不携带之前驱动操作的回包结果。[Go Tx 文档](https://pkg.go.dev/database/sql#Tx)。

新增回归通过原始 Collect、CollectBatch、权限 guard、物理容量夹具和七条 group 写 SQL。故障包装仅在底层脚本回滚后替换 ROLLBACK 回包，覆盖写前/写后、已知拒绝与不确定结果，以及错误包装、取消、已知提交和提交回包丢失。另分别移除结果传播、移除批次分类，要求对应反例失败。

连接仍通过 database/sql 的 ErrBadConn 契约请求丢弃。本轮不把 Conn.Close 或模型中的 Close 成功解释为远端锁释放，不声称 Rollback/Close 具备不可突破的耗时上限，也没有加后台授权 context、重借池连接解锁或放宽角色权限。

此修改修复事务结果传播；backup lock 尚未接入 Collect。34/34 实际 MySQL 结果只证明此前合成前置行为，不能代替新错误路径的实际网络故障证据、批准角色、有界锁释放、完整 GC 或 D 原六项验收。

结果处理约定：

| 分支 | 已观察结果 | Collect 返回 | 批次动作 |
| --- | --- | --- | --- |
| 成功提交 | COMMIT 返回 nil | nil | 计收集，推进游标 |
| 提交尝试失败 | COMMIT 返回错误 | commit_unknown | 停止，保留上一确认游标 |
| 普通拒绝 | 本次 ROLLBACK 返回 nil | 原 ErrDenied | 计拒绝，推进游标 |
| 未提交路径清理不确定 | ROLLBACK 报错或未观察到的 ErrTxDone | rollback_unknown | 停止，不计拒绝，不推进游标 |

移除回滚错误传播的反例准确失败四个 unknown_early/unknown_late 叶子；批次实际错误表现为返回 nil、Rejected=1、AfterID=73。六个已知结果对照仍通过。移除批次分类的反例准确失败 plain/wrapped/canceled/wrapped_canceled 四叶子。完整测试记录与[准备回执](evidence/d-gc-rollback-outcome-preparation-20261022.json)、[输入范围](evidence/d-gc-rollback-outcome-scope-20261022.json)、[复核脚本](evidence/d-gc-rollback-outcome-review-20261022.mjs)保留；521 份输入包含实际项目编译输入和保守的契约、迁移及 SQL/JSON 夹具范围，外部依赖包自己的测试未纳入背书。

最终冻结来源 1,533 份，SHA-256 为 `1a36d0777c84c96bceecd7ad45f16d5af6a66af9eda1890eb6b61b57989ca413`。本轮准确自有目录中的 3758 份文件已删除，source/cache/tmp/telemetry 和测试构建产物均清理，另行确认整个目录不存在。[清理回执](evidence/d-gc-rollback-outcome-cleanup-20261022.json)与准备回执记录完整身份。未安装依赖，未执行远端，也未将整棵当前工作树纳入验收。
