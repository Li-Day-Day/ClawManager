# D resources 完成边界的取消保护

【2026-10-22 控制表排除闭集与完整 resources 包已修复】[35 表闭集与本地验收](system-backup-d-control-exclusion-35-20261022.md)显式补入 admin_revocations/admin_sessions/metadata_reservations/totp_credentials 四张已登记 metadata-only/reference-only 表，同步 verifier schema 的四个检查 ID；未知表/策略漂移继续拒绝，schema_migrations 保留目标本地语义。另补控制排除提交后的取消保护，并修正一个未真正移除批准的负例夹具；正式 registry、批准及迁移未改。原包三个既有失败逐名复现后，隔离/写回完整 resources 包各 21 主/94 条通过事件、default vet、共享合同回归各 73、DTO 各 49 类型/435 字段及 271 项输入复核通过；三个迟到结果反例和正常/原提交错误控制有效。准确 owner 及 2,827 份文件已清理，无依赖安装或远端 SQL。真实 B target/capture proof、九表 normalization、实际目标/权限和原六项仍未完成；contract_frozen=false 与四份缺失合同保留。

本轮选择 D 自有的 `backend/internal/systembackupresources`。开工前读取另一个 D 对话，确认它正在处理 `cost_records` 金额/token 汇总及 prune 修复后续；本轮仅合入两个 resources 生产文件和一个新回归文件，没有修改其业务实现、共享合同、registry 或部署文件。合入前核对 resources 原文件摘要全部与开工基线一致。

## 修正

`SQLCountCollector.CollectSnapshot` 原先只检查 `Commit()` 返回值。驱动在实际提交期间取消请求、随后返回成功时，调用者仍会收到完整计数和审计 cutoff。现于提交成功后检查 `ctx.Err()`，取消或超时均返回零值及原 context 错误；`Collect` 同样不会返回迟到计数。

`VerifyBackupSnapshot` 原先在 B 的 capture proof 返回成功后直接输出检查项。proof 期间取消或超时，仍可获得 passed/failed 结果。现于 proof 成功后检查 context，取消时不输出检查项。

两个分支不修改查询、只读 RepeatableRead、proof 调用次数或单次提交。提交/proof 自身报错仍优先保留原包装错误，正常的计数不一致仍输出原 integrity/validation_failed 检查。提交后的取消保护不撤销已经完成的提交。

## 验证和证据

- 旧代码对照准确复现六个取消/超时叶子；五个正常、有效不一致及错误优先级对照通过。初轮包含控制排除试验的失败日志保留，其后收窄测试范围。
- 修正后定向两个主用例、共 **13 项**通过，包含驱动 `Commit()` 内取消、确定性 deadline、`Collect` 包装入口、proof 内取消及原错误优先级。
- 使用原始项目 `go.mod/go.sum` 和本机 Go 1.26.1 再验：13 项通过；resources 整包 **66 项通过、三个既有失败场景**。包括父用例共四条 fail 事件，与修正前的既有失败清单逐名一致，没有新增失败或跳过，默认 vet 通过。
- 依赖代理与自动 toolchain 下载关闭，未安装依赖、执行远端或启用生产路径。首次标准库编译使用独立最小模块；最终结果以项目模块复验为准。初轮 Go telemetry 写入用户目录被权限拒绝，后续改用本轮专属 telemetry 目录并关闭采集，原 stderr 保留。

[独立回执](evidence/d-resources-completion-context-accepted-20261021.json)绑定源码、冻结输入、实际退出码及日志摘要；[复核脚本](evidence/d-resources-completion-context-review-20261021.mjs)检查失败清单、13 项结果、合入摘要及[清理回执](evidence/d-resources-completion-context-cleanup-20261021.json)。测试结束后删除本轮独立副本、构建缓存、临时文件与 telemetry 目录，仅保留源代码及验证证据。

## 已有独立缺口

三个既有失败为：`TestCaptureTableAllowlistFailsClosed/unreviewed_other_domain` 的负例没有清除已有 D 批准；`TestControlExclusionEmptyTarget` 和 `TestControlExclusionDetectsSourceRows` 使用旧 31 表清单，当前 registry 新增的四张 runtime 控制表使其提前拒绝。四表及原合同数量见[缺口记录](evidence/d-resources-existing-control-gap-20261021.json)。本轮没有绕过这些拒绝或修改共享合同，整包不记为通过。

本次接收仅覆盖两个完成边界。真实 B capture/target proof、resources 恢复规范化、控制表完整排除、现场 SQL、生产装配和 D 原六项整体验收仍需各自证据。
