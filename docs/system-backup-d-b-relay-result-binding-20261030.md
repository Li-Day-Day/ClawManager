# D → B：completed relay 的 Job 结果绑定

原 SQL acceptor 验证 evidence 的 task owner、checksum 和 attempt 开始时间，但这不足以区分同一任务同一 attempt 的不同分项。现于原 Job 锁和 A 请求认证之后，读取相同 task/namespace/name/Job UID/attempt 且未撤销的 runtime resource `result_sha256`，要求非空并与 relay evidence SHA 精确相同。原 evidence 表检查、时间边界、最终权限复查及事务提交仍全部执行。

这定义 completed 引用的正文为当前 Job 已保存的原 BuildPartResult 字节。只有同一正文已通过正式 evidence owner 登记后才能引用；其 ID 不得由 `sev_` 加 hash 临时拼造。本修改没有插入正式 evidence，没有使 functional saveResult 变成正式登记，也没有启用 worker completed 发送。

回归补入实际 SQL acceptor 模型：结果为空、其他分项摘要及 SQL 错误均拒绝，cursor 和 commit 计数保持不变；原合法完成、旧 attempt 拒绝、未知提交重放、撤销、receipt 失败与终态重开拒绝继续验证。模型含原认证 handler，但不代表现场 MySQL/TokenReview 或正式 evidence 登记验收。

准确测试入口：`go test -p 8 ./internal/systembackupcontroller -run TestRuntimeControlAuthenticatedRelaySQLCommitReplayAndRollback -count=1`。前次 `TestAuthenticatedRelay` 筛选不匹配该用例，不作为覆盖证明。专用临时目录为 `backend/.tmp-d-relay-result`，测试后清理，保留共享缓存和其他窗口产物。

最终准确筛选验证退出 0（21.643s），默认 vet 保留。
