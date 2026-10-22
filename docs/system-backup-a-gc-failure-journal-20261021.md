# A：evidence GC 持久故障日志接线

【后续取消边界修订】[共享日志排队修订](system-backup-a-journal-cancellation-20261021.md)已补可取消等待和无须等待 writer 的原子失败锁存，GC/下载故障报告不再卡在标记日志失败这一步。最终冻结四包 6,280 项及新 10 项通过，错误注入、构建和准确产物清理齐全；不保证正在内核执行的 Write/Sync 可被 context 强行中断。下文 r1 接线回执保留原范围，冻结后的三份并行变化另待验收。

`NewJournaledGCRuntime` 的本地验证已完成。[独立回执](evidence/a-gc-journal-accepted-20261021-r1.json)接收 1,459 输入、最终完整四包 759 根/6,270 项，原 6,242 项全部保留；新增五根/28 项通过。Windows/Linux probe、Linux migration runner、默认 vet、冻结 postcheck/最终退出 0 齐全，两个源码/二进制副本和调用者缓存三个准确自有目录独立确认缺席，未安装依赖。本记录不表示实际 SQL、provider、持久卷或生产 GC 已验收。

定向轮原 19 根/152 项通过后，再补 projected token 读取后的日志检查；最终四包对该最终来源完整重跑，来源 SHA `a19467c877874a2bf4b850d69326c3fcefa39a3277109eb51727aae53610eb46`。没有把不同源码的定向结果拼成完整通过。两个位置的 producer seed 各 22 项通过；二进制只保留 SHA，文件已删除。

[接收工具同步记录](evidence/a-gc-journal-receipt-readers-preparation-20261021.json)通过 owner 54 项、角色 43 项解析器检查和十一份真实 CLI 拒绝，实际 SQL 接收文件零新增。普通来源基线增加为四份，当前 owner 两包为 609 根/4,967 项；旧三份完整清单全部保留。

原 `NewGCRuntime` 接受函数回调，不能据此证明故障已持久化。新构造器接收与原 Registry 完全相同的 installation/server UUID/database 和一个已经预置的专用文件，复用现有日志的准确文件身份、Unix 0600/0640、容量余量、换行及 fsync 检查。文件不创建，既有文件在构造失败和 Close 时释放；部署仍须提供独立预留的持久存储及单写者。

日志使用独立的 `evidence_gc_failure` / `system-backup-evidence-gc-failure.v1` 记录，固定原 worker Operation 与 admission principal SHA、数据库和 evidence ID，只接受 `evidence_incomplete`。不接受原始错误、claim、token、manifest 或 provider locator；记录的 host UTC 只是诊断时刻，不是 SQL 审计时间或授权。

每个候选之前检查日志健康；provider authority 和 GC registry 在授权、结果提交边界重新检查。同一批次先持久化当前候选的失败，再处理下一项。失败、文件替换、容量不足或写入错误会阻止后续工作；busy 检查立即返回不可用。写入使用独立于已取消请求的 context，共享三秒持久化预算仅累计日志操作时间，不消耗在 provider 请求上。

外部对象删除与本地文件/SQL 不是一个原子事务。若外部删除后在结果事务提交前发现日志不可用，该事务回滚，原 envelope/immutable ref/claim 保留为后续 reconciliation 依据。提交结果未知仍按原协议核查，不保证事务实际未提交，也不把缺日志当作删除成功。不能据本实现替代 C 的权威 absence proof、D 的完整 SQL policy、worker claim、引用/hold/lease 生命周期或正式 schema/角色审批。

验证入口为 `docs/evidence/a-gc-journal-validation-20261021.ps1`，先冻结运行新增日志回归及已有 GC authority/runtime/download/recovery journal 测试，再对新来源执行完整四包和跨平台 probe/runner。全部使用现有依赖、模块只读、默认 vet；每轮 snapshot 及调用者自有缓存在结束时清理，保留原始证据。
