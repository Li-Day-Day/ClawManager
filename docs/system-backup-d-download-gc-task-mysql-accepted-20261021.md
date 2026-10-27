# D GC task eligibility 实际 MySQL 接收

本轮在 MySQL 8.4.8 的 run-owned 测试数据库执行 `TestDDownloadGCTaskMySQL`，18 项全部通过、无失败或跳过，父测试耗时 77.18 秒，最终 `download_gc_task_exit=0`。[独立接收回执](evidence/d-download-gc-task-actual-accepted-20261021.json)绑定完整日志、来源清单、二进制和输入摘要，可用 `node docs/evidence/d-download-gc-task-actual-review-20261021.mjs --check` 复核。

此前失败的 `prune_reference`、`empty_prune_range`、`late_prune_reference` 本轮均通过。fresh replay 为 `001..081`、96 份正式迁移、文件名完全匹配；追加 081 的 UUID CHECK 修复已经过这一实际场景验证。070 原文件与旧 15/18 失败记录保留，不将新结果写回旧回执。这仍不等于已验证旧生产安装的升级路径。

本次来源为 1,475 份输入，SHA256 `5383dd6b3967edf9966896b7b298a0d05df04ab23b10db42df18f354c33a5f5b`，与上一轮修复发布上下文一致。原始材料：

- [完整日志](evidence/d-download-gc-task-remote-20261021-154631-7f8bf868.txt)
- [来源清单](evidence/d-download-gc-task-remote-20261021-154631-7f8bf868-source.json)
- [原三项失败与约束根因](evidence/d-prune-identity-operator-failure-20261021.json)

日志报告 namespace `sbk-mig-261021083028-23bd` / UID `ab140148-6c3b-4fc5-8d20-7b918aa97b5d`、remote-registration scratch 和本地 build cache 清理成功。准确本地 source owner `.tmp-d-index-cache-0b153d82adc04cddb5567bce61286f09` 已独立确认不存在。中间两条 socket-close 提示没有改变父测试通过、清理标记及退出 0 的完整结果；评审没有另行访问服务器确认 namespace 缺席。

接收范围是 `SQLDownloadGCTaskEligibility` 的实际 SQL 组件探针，任务与数据是合成夹具。`full_gc=not_run`、role approval、人类 MFA、provider read 和 production approval 都保持未完成。下一步应推进完整 GC 生命周期、角色权限/真实 provider 事实、持续 DDL freeze 与现场审计证据；不必为这份已完整通过的来源重复相同十八项。
