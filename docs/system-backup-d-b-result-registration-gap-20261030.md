# D/B 正式结果 evidence 登记：当前源码缺口

## 后续修正：小型结果走现有 inline 分支

再次核对本地 A 与公共 C 后，确认下文将全部 B 结果视为外部对象登记，范围过宽。现有 A `systembackupconfig/response_content.go` 和 `systembackupsecurity/config_operation_store.go` 已提供原事务内 `inline` 登记模式；正式迁移 096 支持该格式，097 提供容量和 evidence 保留期限。C 的外部 framing/发布不是所有结果的必经路径。

本次 D 接线对不超过 8192 字节的 B 完成报告使用 `diagnostic`、`application/json`、`internal`、`inline`。它只是原 Job 的结构化完成记录，不冒充 verifier report、capture certificate 或最终备份验收。原 frozen plan 校验之外，再限制为空 warnings/evidence IDs 和五项固定数值统计；不接受任意 JSON，不填充、不截断。

`PublicJobOwner.saveResult` 在原 authority 与 Job 锁事务内同时写加密 runtime 结果、容量预留、正式 evidence 和 sealed observation。期限来自原安装/config 版本。ID 使用安装/task/attempt/phase/Job/报告 SHA 的域隔离摘要生成 UUIDv8；重试逐字节核对同一记录，不重复登记、延长有效期或再占容量。登记失败会使整个结果事务回滚。原始响应丢失时重新 complete 复用同一 ID。

事务提交后才返回 completed/3 模板；worker 在原截止时间内对临时失败重试，并沿用原 mTLS、token 和相同 relay 字节。结果读取核对正式 inline 记录和原加密报告字节；completed 接收额外拒绝 pending、write_unknown、失败、删除中、已删除、非健康及过期 evidence。

下文保留为实施前审计。其外部 Prepare/Register/Publish 依赖仅适用于超过 8 KiB 或需要敏感级别加密发布的后续报告，本次对此明确拒绝。旧版本已落库但没有正式 evidence 的 runtime 结果不会被凭空升级为成功，须由仍具当前授权的原 worker 重试 complete。现场部署、真实 MySQL 和整条停止/恢复验收仍须另行执行。

核对包含 8e34487d 的共享工作树。本记录说明为什么不能直接给现有 worker complete 返回 completed relay；不是实现交付或现场验收。

## 本次验证与部署变化

- `systembackupexecution` 的 InlineResult、RegisterInline、WorkerRelay 专项通过（6.516s）；`systembackupcontroller` 的认证 relay SQL、结果权限、原 capture/runtime 权限专项通过（10.802s）。包含精确重放、不匹配 owner/body、过期、容量/登记失败以及不可用 evidence 不推进游标。
- worker 全包通过（14.380s），publicadapter 全包通过（17.617s）。worker mTLS 测试覆盖 completed/3 收到 503 后重新授权并发送完全相同字节。
- execution 全包曾在其他窗口正在修改的 `TestNativeRuntimeRequiresPinnedAgentCA` 失败；本次未修改其文件，不宣称共享工作树全包通过。早期模板测试暴露旧 `sev_+SHA` 格式被 B 宽松校验接受，本次已加严格 UUID 检查并重跑通过。
- PublicCapture 和 RuntimeControl 的生成/校验权限均要求 evidence `SELECT, INSERT`，不授予 UPDATE/DELETE。部署须重新应用生成的准确权限，并更新 controller/worker 配套镜像。
- 本轮独占 Go 临时目录均已清理；其他窗口的构建目录未动。尚未运行真实 MySQL 或现场整链测试。

## 已有链路与不能复用之处（实施前记录）

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
