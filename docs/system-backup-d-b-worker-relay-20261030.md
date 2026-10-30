# D → B：worker 主动 relay 首段

runtime-workspace 生产装配开启 PublicJobOwner.RelayEnabled。原 Authorize 在真实 Job/Pod/process、claim 和 gate 检查后，以原 Authority 和 JobBinding 构造 ready/1、running/2 模板；模板只有在原事务提交与 collectors 校验成功后随 Lease 返回。不使用请求自报 Job UID、sequence 或 evidence。

worker ControlClient 在 ready/acquire 成功后自动发送模板至同一 HTTPS origin 的 `/relay`，使用原 mTLS client 和 audience-bound Pod token。成功必须收到 advance/replay 回执。503/网络失败由已有 ready/acquire 重试流程重新认证，确定性结构体编码保持同一消息字节；错误响应不会交付 DEK 给采集函数。发送受原 lease 到期时间约束，不新增权限或独立身份。

当前只交付非终态消息。completed 需要正式 result evidence PublicID/hash；原 functional saveResult 不是这一正式 evidence，不能冒充。failed/canceled、更多进度、完整发布、现场停止恢复与 acceptance 仍待后续闭环。现有 worker control observation 和新 relay cursor 继续独立。

部署必须同时使用包含本次 Lease 扩展的 controller 和 backup-worker 镜像。旧 worker 严格 JSON decoder 不认识 relay 字段，会拒绝响应，不能沿用旧 image digest 宣称联调完成。非 Runtime profile 不下发 relay 字段。

测试范围：真实本地 mTLS fixture 验证原 TLS/Pod token、503 重试原字节一致、ready/running 顺序；模板测试检查原 Job 身份和缺 UID 拒绝；错误 task/attempt/part/sequence/terminal evidence 拒绝。SQL acceptor、现场 TokenReview 和正式 evidence 的整链尚未实测。

最终定向验证通过（默认 vet）：worker 22.031s、execution 16.933s、backup-worker command 30.584s。命令为 `go test -p 8 ./internal/systembackup/worker ./internal/systembackupexecution ./cmd/backup-worker -run 'TestControlRelay|TestLeaseRelay|TestWorkerRelayTemplate|TestDeploymentRuntimeRegistersRelay|TestWorkerDoesNotRun' -count=1`。专用临时构建目录 `backend/.tmp-d-worker-relay` 在测试后清理；共享依赖缓存及其他窗口产物保留。
