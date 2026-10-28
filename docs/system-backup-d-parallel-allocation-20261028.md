# D 当前并行分工（15:35，17:00 前收尾）

主窗口：`01a18018-d7b7-7ee2-9236-dd28444454b0`。接入窗口：`01a1814a-684d-7012-bef5-a10c9c943704`。已读取后一窗口用户的直接跨窗口协调授权，允许回复协调。

## 主窗口负责，其他窗口暂勿改

- 已导入并正在最终验证 B PR `08d15abf443511376bf1a0c9c9593caea8feef5c` 的九个执行包；正在编辑 `systembackup/publicadapter/runner.go`、`linux_profile.go`、`d_spec_integration_test.go`，`systembackupdispatch/{contract,backup_spec,task_binding,task_binding_test}.go`，以及 `cmd/system-backup-controller/task_execution_live*.go`。当前 controller loop/start/claim/authority 四组文件也由主窗口收尾。
- 主窗口负责 B 完整任务单、D→B 构造/计划绑定，C/Teams 新分支 `288d74a92c37c6432ebb3dcdd6fd7c2afd837675` 的兼容范围核对，当前原生 B/D 验证和 Linux 构建的清理/汇总。
- A 正独立编辑 `systembackupevidence/relay_message.go/test.go`；不得覆盖。计划用途/加密托管授权仍缺，不得用 job_log_chunk/capability_snapshot scope 借权。
- 不更新 runtime grant 矩阵、catalog pin 或自动执行迁移，不重写 C 的 system_backup_v2_* 到当前 unversioned 公共表，也不启用第二 controller。

## 分给接入窗口：具体实现 Requests，关闭一个实际生产依赖

请实现 `backend/internal/systembackupapi/task_requests.go` 及测试，提供 concrete `TaskRequestContract`（现定义在 `sql_writer.go`），补 D 拥有的 backup/preflight create closed schema/OpenAPI requestBody，接入 `cmd/server/system_backup_tasks_live.go` 的 Requests 构造。后两个 API/server 文件由你负责，主窗口暂不编辑它们。目标是可被真实 SQLTaskWriter.Prepare 调用的 decoder/normalizer，不交另一个空接口或模型 owner。

合同依据：原 v12 计划及 `067_add_system_backup_task_execution_core.sql`，创建 hash 是 defaults/null 规范化后的业务 DTO 的 JCS SHA-256，原 actor/installation/endpoint/key 是独立唯一 tuple。现 `TaskRequestContract.Decode(ctx,TaskKind,endpoint,raw)→NormalizedTaskRequest.CanonicalJSON()`；SQLTaskWriter 已实际调用该入口，授权仍在原 SQLApplication 同一事务进行。

本轮由 D 明确的最小输入决定：backup 必须显式给非空 `requested_parts`，不得将 `{}` 定为请求；`task_purpose` 省略默认 `acceptance`，null拒绝，acceptance要求原六part全齐，只有显式 functional_test 可部分；重复part拒绝，set按合同固定顺序规范化。安装/orchestrator/profile/matrix/runner/provider/凭据/权限均由原服务器准入和config确定，不接客户端任选值。业务体不接受 auth/request_id/idempotency_key/strong_auth_proof 等 transport。

preflight 使用原已有 `source_artifact_type=backup|catalog_import`、`source_public_id`、`target_profile=cluster|single-node`、`restore_target_config_ref`，均必需显式输入；`preflight_mode`省略默认production_readonly，null拒绝。只接受原合同定义的public ID/ref，不接受任意DSN/路径/URL/namespace/observed descriptor；source checksums/target hash由真实Admission获取，不由body决定。若catalog_import原ID/领域合同尚缺，准确拒绝该路径，不能发明格式或把B observed restore_target候选当创建请求。

`retry_of_public_id` 的省略/null统一原无重试值；非null仅在现 writer/Admission 真正同事务检查同安装、同kind、终态原任务且入库/最终复查均实现时开放。当前 TaskCreation 输出没有retry字段，禁止decoder接受后静默丢弃。若本轮不能完整实现，明确非null not_ready，不把旧key重放与新任务retry混同。

必须拒绝未知/重复键、大小写别名、非法UTF-8/孤立surrogate、数字/类型混淆、越界body和endpoint/kind错配；语义等价字段顺序/default/null产生相同JCS bytes。不要自行安装JCS依赖；现工作区没有C分支新增的cyberphone模块。请求字段只使用受限字符串、闭集、list/null；复用现有受审canonical实现或实现其所需的精确JCS子集，不以普通json.Marshal泛称完整JCS。

生产构造只能填真实 Requests 槽位。Admission/CurrentFacts/Manifest 仍归各原owner；没有它们时现整体owner link继续关门，不填allow/no-op，不改nil测试来掩盖缺依赖。schema仍须原跨owner/registry门禁，不改draft/frozen/policy状态为绿。

请在17:00前交代码、准确构造caller、原生日志/源码pin/清理记录，必要时把未完成的非nullretry/catalog_import精确标阻塞。测试后删除本轮自有cache/tmp/binary，保留日志。不接管其他窗口现场部署，不部署/启用。
