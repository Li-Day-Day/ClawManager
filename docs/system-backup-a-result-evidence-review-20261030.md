# A：worker 完成结果 evidence 准入复审

2026-10-30；基于共享工作树中 D 的在途 `result_evidence.go`、`public_jobs.go` 与 `authenticated_relay_sql.go`。本记录是接口复审，未批准新的 evidence 类型或现场发布。

`PublicJobOwner.saveResult` 已将原 worker 结果加密保存并以原 Job/任务授权复查。D 的候选增量用 `inlineResultBody` 与 `ValidatePartResult` 限制报告正文及冻结计划/Job 绑定，再按任务、attempt、Job、正文摘要生成稳定 `sev_` ID，向 `system_backup_v2_evidence` 直接插入 `evidence_type='diagnostic'`、`storage_state='inline'` 的 JSON，随后把该 ID 交给 completed relay。此设计能避免把随机报告或仅有文件摘要的结果直接当成完成证据；但 `diagnostic` 是现有数据库枚举值，不等于 B 完成结果的正式内容类型和发布授权。

在启用 completed relay 前，B/C/D 需固定以下原始事实并给出可复核来源：

1. B 完成报告是否正式允许作为 `diagnostic` evidence；若允许，固定其 closed 正文字节、用途、owner、保留期及读取范围。现有 `ContentDispatcher`/`ContentAuthorization` 没有 B result 正文策略，不能只凭枚举值推定批准。
2. 原 Job 事务是否就是该类型的登记/发布 authority；应证明当前 task/attempt/config/fence、原 Job/Pod/SA、同一结果字节与容量/撤销/期限在原事务内持续成立，未知提交只从稳定 ID 和原字节收敛。`inlineResultBody` 仅校验形状，`ValidatePartResult` 仅校验冻结绑定，两者不单独授予登记权。
3. 原加密结果转为 `inline_payload` 的访问策略。该字段是明文 JSON，当前候选标记 `redaction_classification='internal'`、`encryption='none'`；须证明其中 checkpoint、sealed ref 与统计对所有 evidence reader 的可见性符合原策略，或维持加密/受控读取。
4. 用原 SQL evidence 行及 completed relay 读回验证同 Job、错 part/attempt、过期、撤销、容量不足、提交未知和重启收敛。测试替身与正式 SQL/现场回执分开报告。

在上述合同和授权未固定前，候选代码不应被计作 A 正式 KEK/签名/Provider 接线完成，也不应把 completed relay 当成正式成品已发布。该风险不影响既有 ready/running 的原身份 relay。
