# D/B 原结果正文与冻结计划校验

B 新增 `ValidatePartResult(in, plan, job, raw)`，复用现有严格 JSON/必需字段、ModuleResult、Checkpoint 和 JobIntent 校验。只接受有界的 backup 结果，绑定原 part/category、task/config/attempt/phase、inventory、Job UID/generation 和 invocation 摘要；未知/重复字段、缺失必需字段、错误 Job 或旧 attempt 拒绝。验证不重写正文，也不产生 ID、签名或权限。

D `PublicJobOwner.ReadResult` 在原日记解密及 SHA 验证后，读取原冻结执行计划并 unwrap B plan，调用该入口，然后再次检查原 Gate，最后返回原字节。完整 envelope/hash 不再替代业务绑定检查。

这为后续正式正文策略提供 B schema 所属的可复用校验；它本身不是 redaction/内容准入、独立 seal proof 或正式 registry admission。正式 evidence 类型/内容策略、稳定 UUID、登记发布及未知结果收敛仍按 `system-backup-d-b-result-registration-gap-20261030.md` 待接，不用本次校验冒充已闭环。

回归包含合法原报告、part/category 漂移、未知/重复字段、缺 statistics、替换 Job、旧 attempt、inventory 漂移和超限正文。命令：`go test -p 8 ./internal/systembackup/publicadapter ./internal/systembackupexecution -run 'TestPartResultValidation|TestPublicCapture' -count=1`。使用共享 Go 缓存；专用临时目录 `backend/.tmp-d-result-validation` 在测试后删除。未运行现场 MySQL/Kubernetes/evidence 发布验收。

最终定向测试退出 0：publicadapter 6.823s、execution 9.345s，默认 vet 启用。
