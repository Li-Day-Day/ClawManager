# D/B 正式结果 evidence 登记：当前源码缺口

核对包含 8e34487d 的共享工作树。本记录说明为什么不能直接给现有 worker complete 返回 completed relay；不是实现交付或现场验收。

## 已有链路与不能复用之处

1. `systembackupexecution.PublicJobOwner.Authorize` 在 complete 中验证原 staging 文件与 task key，调用 B `BuildPartResult`，然后 `saveResult` 加密保存原报告及 SHA，并登记 sealed observation。`Evidence` 返回的 `sev_` + SHA 是 runtime 读取引用，不是正式 evidence UUID；`ReadResult` 也只读 runtime resource，不读 evidence registry。
2. `systembackupcontroller.SQLAuthenticatedRelayAcceptor` 的 completed 要求正式 `system_backup_v2_evidence` owner/hash/attempt 时间检查，并已要求 SHA 等于当前 Job 的 result_sha256。不能用 runtime 的拼接 ID 满足该条件。
3. `systembackupevidence.TaskRuntime` 是真实 Prepare/Register/Publish 组合，但 `SQLTaskAuthority.accepts` 明确只准入 `job_log_chunk`、`text/plain` 和已固定 LogPolicy。将 JSON 结果作为日志送入会改变类型、正文校验及用途，不能沿用这条授权。
4. 生产 `ContentDispatcher` 的闭集只有 capability_snapshot、job_log_chunk、diagnostic；`ContentAuthorization` 没有 B result 正文策略。`business_report_delivery_test.go` 的 verifier_report 示例使用 testRedactor、testKeys 和 memoryRegistry，不能当生产 owner adapter。
5. `SystemPublisher` 是原 publication claim 的单次发布执行器，需要独立 C verifier、原 STS snapshots、FinishAuthority；它不是任意报告登记入口，不能直接用 runtime report hash 构造 claim。

## 下一段必须交付的完整接线

- 明确 B 原结果报告的正式 evidence 类型、原字节 schema 和正文策略；保留 task/attempt/phase/part、Job UID/generation、配置与冻结 plan 的精确绑定。`BuildPartResult` 返回数据本身不授予登记权。
- 原内容 authority 对同一报告进行当前认证与读取后复查，registry Policy 在原事务独立验证 owner、期限、用途、撤销和引用。不能使用允许任意 JSON 的 redactor 或临时签名。
- 由原 owner 预留正式 UUID，持久保存它与原 result digest、ciphertext、key version 的对应关系。未知 Register/Publish 结果必须从同一 UUID/原字节收敛，不能重新 Prepare 或更换 ID。
- 使用原 evidence store、key 和 publication 凭据来源完成 Register/Publish，再从 registry 读回正式状态与精确 hash，才能下发 completed/3。不能把先生成 UUID 当成已登记或已发布。
- 验证同 Job 成功、其他 part、旧 attempt、撤销、登记提交未知、发布结果未知、exact replay 和进程恢复；模型与现场分别报告。

本轮未改 A 的任务授权闭集、生产 ContentDispatcher 或其他窗口正在修改的 key_use，也未创建新表、凭据或 permissive adapter。正式结果内容策略、登记 owner 和部署材料仍是待实现项；ready/running 发送及 completed 接收端绑定不等于这段已完成。
