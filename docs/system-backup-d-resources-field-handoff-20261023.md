# D 九表逐字段比对候选与复审交接

2026-10-23，用户恢复 D 后续工作。本轮接续九表 v2，不继承旧来源的测试背书或正式批准。历史详情十六项和 GC 前置/连接生命周期四十二项已经接收，本轮不重复执行。

`backend/internal/systembackupresources/restore_fields.go` 新增私有离线比对候选。九表必须全部出现，空表也必须声明完整列；表、列、行顺序可不同，行按规范正整数 ID 匹配。缺失/额外表、列、行、重复表或 ID、非规范/越界 ID、逐列差异、取消和调用者指定的总行数/值字节预算不足均拒绝。错误只返回固定诊断，不包含原正文、字段值或行 ID。SQL NULL 使用 nil，空串和 JSON null 分别保留；没有 float64 转换、舍入、JSON 语义等价或时区猜测。

本候选只回答“预期目标行与读回行是否逐字段相同”。预期行仍须由受审 normalizer 和真实 B/C proof 产生；两份相同的坏数据也可以相等。因此它不是 normalization、权限、列类型/nullable 合法性、父子关系、35 控制表排除、目标隔离或恢复成功证明。SQL reader 尚未实现，未接 writer 或生产入口。未来 reader 必须使用独立 SELECT-only 身份及受审一致视图，在同一 SQL 类型、UTC 时间和 JSON 表示下完整读取，并验证实际列元数据；不允许通过字符串重编码隐藏差异。当前预算仅限制比较工作量和索引，不限制已由调用者分配的输入内存，reader 必须在读取阶段另行限制容量。

## 逐表复审闭环

所有表均缺真实 B 来源/目标 proof、共同事务/时钟/fence、目标门禁和独立读回；下表列出额外领域输入。状态均为待同版本复审，没有代签。

| 表 | 需复审者 | 额外输入与 D 后续实现 |
| --- | --- | --- |
| audit_logs | A | resource_type 闭集、整体遮蔽、typed 引用及审计目标 ID 占用；D 生成完整候选。 |
| egress_private_exceptions | A/B | B 完整允许/禁止网段、准确端口与目标身份；D 验证整个前缀并禁用。 |
| northbound_admin_settings | A/B | 目标规格/端口、缺行或锁定 observed version、启动门禁；D 完整列候选及精确 DECIMAL/CAS。 |
| northbound_settings_audit | A/B | 历史 ID 保留/重映射、完整正文遮蔽；D 不恢复 caller policy 或端口动作。 |
| security_scan_configs | A/C | C analyzer 闭集/timeout/能力/空配置决定；B 封锁 ensureConfig/worker/手动启动；D 完整配置候选。 |
| security_scan_jobs | A/C | C 确认父终态、scope 和中断转换；B 认证处理时间；D 完整父子计数与时间检查。 |
| security_scan_job_items | C | skill/result/版本、风险闭集、非敏感名称和缓存语义；D typed 映射及完整终态候选。 |
| security_scan_reports | C，另请 A 复审正文 | C 闭集历史 summary schema、父子汇总与中断报告决定；D 从已脱敏数据生成，不复制嵌套 Config。 |
| system_image_settings | B | 精确目标镜像及可用性、非敏感名称、逻辑键占用、默认/环境/启动门禁；D 完整列候选且禁用。 |

机读交接由 `docs/evidence/d-resources-field-review-request-20261023.mjs` 产生，绑定完整 resources 包、原 v2 输入、全部 migration catalog、本文件和检查器。检查器独立从六份实际 CREATE 定义核对列清单；它不是通用 SQL parser，也不证明现场 schema。后续任何 migration 或输入变化均要求新请求，原 v2 请求保持原字节，新请求没有评审回执。

命令 `node docs/evidence/d-resources-field-review-request-20261023.mjs --check` 仅检查本交接完整性；加 `--strict` 明确返回 1，表示评审、proof、完整候选、SQL reader 与生产整链仍缺。不得把普通检查 exit 0 当作恢复准入。没有向其他聊天或外部渠道发送请求。

## 验证与后续

完整 resources 包使用既有隔离验证入口，禁用依赖网络和 Go 自动工具链下载，保留默认 vet，验证后清理准确自有源码/缓存/tmp/telemetry。测试证据及退出码另存同轮回执，不以本交接声明代替实际结果。

接续顺序：取得 A/B/C 对本轮精确来源的意见与真实领域输入，完成九表候选；接入 B 共同事务 writer 与独立只读 SQL reader；复用本离线比对候选并完成实际恢复/启动门禁验收；接入受审 freeze adapter，完成完整 GC；继续原六项真实端到端及四部署矩阵。整体目标尚未完成。
