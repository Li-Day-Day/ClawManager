# A 对九表 v2 与逐字段比较交接的安全复审

2026-10-23。审阅对象为 `d.resources.restore.v2` 及 `d-resources-field-review-request-20261023.json` 固定的 142 份输入。旧 v2 请求因新增逐字段文件已不能证明当前文件集合；原请求和原“需修改”意见均保留，不回写批准字段。新请求的普通完整性检查通过，strict 仍须按其原规则拒绝缺失的集成条件。

结论：下列六表的 **v2 安全规则修订可接收为后续实现约束**，report 的正文规则同样可接收。当前离线 helper 和字段比较器不是完整 normalizer、可信 SQL reader 或恢复 writer，不批准恢复写入。A 不代签 B/C 的来源、目标、网络策略、能力、时钟和事务事实。

| 表 | A 对 v2 的结论及剩余验收 |
| --- | --- |
| audit_logs | 接收 user/instance 的分型映射、system_backup 仅 NULL、未知类型整批拒绝、整体 JSON/文本遮蔽及独立历史 ID 占用规则。闭集外真实历史必须另升版本；实现必须证明来源 cutoff 可追溯且没有覆盖目标审计。helper 的空 occupied 列表不证明目标为空。 |
| egress_private_exceptions | 接收整个前缀被允许网段包含、准确端口、禁止范围相交即拒绝、enabled=false 和 description 遮蔽。IPv4 私网/IPv6 ULA 只是结构上限；完整目标允许/禁止策略、真实身份存在性、启动门禁和后续启用仍须 B 认证。 |
| northbound_admin_settings | 接收完整关闭候选、显式 caller、来源 version 仅历史、缺行 version=1/锁定 v 后 v+1、溢出拒绝、CPU 精确 DECIMAL。纯计算不证明缺行或完成 CAS；全部规格/TTL/operation/端口、精确一行写入及无缓存失败、旧缓存、默认、环境、nil provider、重启门禁仍须实际集成验收。 |
| northbound_settings_audit | 接收与 audit_logs 分离的历史 ID 映射、NULL 保留和非 NULL JSON 整体遮蔽。历史 action 不回放 settings、caller policy 或端口变化；目标冲突和源身份/时间/cutoff 追溯须真实事务证明。 |
| security_scan_configs | 接收 allow_fallback=false、严格数组/模式/timeout 验证和不借服务默认补全的安全边界。0/1 行且非空 id=1 是 D 的领域提案，仍待 C 确认；两组 analyzer、能力/timeout 与空配置决定不能由 A 认证。B 必须封锁 ensureConfig、worker 和手动启动。 |
| security_scan_jobs | 接收严格 scope 键/类型/大小/重复键拒绝、分型 skill 映射及正文遮蔽。queued/running 的中断转换、completed_items 包含失败终态、父子时间及计数规则仍待 C 确认，处理时间和完整行集须 B 认证。不得把 helper 成功当成当前扫描资格。 |
| security_scan_reports（补充正文） | 接收禁止复制 generateReport 的嵌套 Config、凭据、URL、scanner 原响应，要求从脱敏父子行产生 C 审定的闭集历史 summary；schema 未交付时整批拒绝。A 的正文意见不认证风险、结果版本或汇总语义。 |

## 离线实现边界

已静态检查 `normalization_rules.go` 的 typed 映射副本/返回值隔离、NULL、精确整数范围、自由正文整体遮蔽、CIDR 全包含与禁止区相交、版本溢出、DECIMAL 和 scope 重复键/尾随拒绝。上述规则符合本次 A 的约束，但尚无完整六表候选生成路径。

`restore_fields.go` 对九表完整列集、ID/重复、逐值 NULL 与字节、调用方预算和取消进行比较，错误不输出原值。它只能比较输入相等性；相同坏数据仍然相等。未来必须先由受审 normalizer 与真实 B/C proof 得出预期行，再以独立 SELECT-only 身份在受审一致视图下读取实际 SQL 类型/列元数据。不得以字符串比较替代合法性、脱敏、父子关系、权限、35 控制表排除或恢复整链。本次不为并行测试生成通过结论，也不声称执行了 resources 包测试。

机器回执由 `a-resources-v2-review-20261023.mjs` 绑定原请求、全部来源和本文。`--check` 只验证这份评审的绑定，不是生产门禁。实现变化后需新请求/增量评审；原 registry、schema-hash 和批准状态保持原义。
