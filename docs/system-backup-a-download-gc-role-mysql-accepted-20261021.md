# A：受限角色十项实际 MySQL 已接收

操作者 `164523-7cba478a` 轮已通过 [91 项独立核对](evidence/a-download-gc-role-mysql-accepted-sbk-mig-261021091731-79c1.json)。十叶子/root、MySQL 8.4.8、001..081 的 96 文件迁移、probe/input/runner/catalog、十账号/十子库/一角色/两 foreign schema、namespace 原 UID、两端清理、最终来源复核/default vet/外层退出 0 和完整 transcript 均齐全。准确本地源码目录另经独立检查不存在。此前 `metadata_drift` 的 1146 已关闭：本轮确认特权观察者看到列 pin 变化、原 pin 被拒绝、隔离重采 pin 后正向通过。

包装器在远测成功后曾拒绝接收，因为原全局 `FAIL` 规则命中了构建阶段的 `internal/abi` Windows `vet.exe: exit status 0xc0000043`。原门禁已对同一 `mysql-probe-build` 命令作一次有界重试，vet 保持启用，随后 probe 构建和远测全部完成。接收器现仅对这一确切原始失败片段、正确本地阶段、首次/最多三次且随后构建成功的情况单列保留；还要求实际执行 helper 字节与冻结清单一致。没有删除日志、重试 SQL、忽略断言失败、skip、未知崩溃或 CLEANUP_PENDING。

随后来源守卫发现的新业务输入也单独核对了：[第十二份组合基线](evidence/a-owner-cost-context-baseline-accepted-20261021.json)确认这轮全部 backend/contracts 与 D cost 冻结范围一致，十三份变化准确匹配；D 两完整包 341 根/2,398 项逐名保留旧 2,346 项，Node 79 项、tagged seed 3 项、来源复核及清理齐全。owner 两完整包仍精确保留原 620 根/5,019 项。strict 原退出 1、资源包原四个失败、实际 cost SQL 待验及公共合同批准边界保持；没有将整个当前工作树改判通过。

[接收器验证记录](evidence/a-role-build-retry-receipt-readers-preparation-20261021.json)通过 owner 67、角色 64 项内存检查及十五份真实失败/不完整日志的 CLI 拒绝，反例未写入实际 SQL 回执。检查覆盖失败阶段错置、重复重试、未知状态、混入断言/skip、helper 字节漂移、缺 probe、修复断言缺失及后续 SQL 失败。

本轮只关闭 `SQLDownloadGCEarlyReferences` 的合成隔离账号专项，明确 `maintenance=absent`、`full_gc=not_run`、`role_approval=no`。实际生产 registration/download/GC 身份、扩展任务及 producer 元数据、完整 GC、本人 MFA/provider 和恢复 E2E 仍需各自证据。owner 十一项保持独立待办，不因角色通过而代验。无需再执行角色十项远测，也无需重跑已接收的 D GC task 十八项。
