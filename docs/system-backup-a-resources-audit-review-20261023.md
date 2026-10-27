# A 对双审计表离线恢复候选的静态安全复审

2026-10-23。对象为 `d-resources-audit-review-request-20261023.json` 固定的 158 份来源，重点为 `restore_audit.go` 与测试。结论：本版实现符合 A 已接收的 v2 双审计表安全约束；这是静态代码结论，原完整 resources 包的新测试结束/退出/清理尚待独立接收。未批准恢复写入或真实 B proof。

已核对的实现行为：

- 两表必须包含完整列，空表保留列；source/target 的 ID 和 user/instance/两类 audit 映射各自分型，缺映射、重复、合并或目标占用拒绝。目标空占用列表只是一份声明，不证明目标为空。
- audit_logs 的资源类型闭集为 user、instance、system_backup；安装本地 system_backup 只允许 NULL 引用。未知类型不静默丢行，错误返回零候选，不交付另一表的局部结果。
- JSON 正文先验证 UTF-8/合法 JSON，再对所有非 NULL 值整体输出合法 JSON 字符串 `"[REDACTED]"`；SQL NULL 保持 NULL。IP 非 NULL 整体遮蔽。action、来源时间只作为受认证历史保留，不触发北向 settings/caller/端口动作。
- action 受迁移字符数和 UTF-8 限制，时间限定 SQL 文本与微秒精度；northbound 时间不能为 NULL。它们不证明来源真实性、目标 schema/sql_mode 合法性、目标时钟关系或启用授权；完整目标验证仍须受审外层完成。
- 源最大审计 ID 与独立源 cutoff 对应，目标重编号不会替代来源 cutoff。历史关联保存原/目标 ID、来源 actor/资源/时间，map、slice 和指针独立，不包含原正文或正文摘要。该记录必须进入受认证、受控历史证据；公共输出只引用证据 ID。
- 源与输出分别检查行/值字节预算，遮蔽扩容与 ID 扩张也受输出预算约束；取消与任一行错误均不得返回部分结果。错误不携带原正文、SQL 或 driver 原错误。

B 仍须认证准确 dump/checkpoint/schema/cutoff、完整两表行集、映射和目标身份，并在共同写事务中认证 ID 保留/占用、权限/隔离门禁与目标时钟；外层完成参数化写入、确认提交、销毁写凭据及独立只读读回。仅输入一个 occupied 数组或合法时间文本不能证明这些事实。其余七表、九表一致性、35 控制表排除、启动门禁、freeze/完整 GC 和真实整链仍未完成。

独立机读回执绑定原请求、全部来源和本文，明确 `validation_accepted=false`。待原新轮完整日志、退出和准确清理齐备后再另存测试接收回执，不把此静态评审改写为当前整个包测试通过。后来新增/变更文件须增量评审，正式 registry 与批准字段不变。
