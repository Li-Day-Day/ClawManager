# D 双审计表恢复候选

2026-10-23，用户再次明确 B/C 仍未交付。本轮继续实现 A 已接收的 v2 安全约束，不把未交付的生产事实写为已认证；原九表、逐字段、reader 请求与 A 意见均保留。

`restore_audit.go` 的私有 `normalizeRestoreAudit` 生成 audit_logs 与 northbound_settings_audit 两张表的完整列候选：

- 必须提供正确表名与完整列集，空表也保留列。复用九表闭集的结构/ID/总行数/字节预算验证，只接受这两张表的实际行；非法/重复 ID、额外或缺失列拒绝。
- 用户/实例/两类审计分别使用现有 typed 映射。两张审计表的目标 ID 分别检查占用，来源 ID 必须显式映射，不清表、覆盖或用 target MAX(id) 代替来源 cutoff。非 NULL actor/reference 缺映射时整批拒绝；system_backup 只允许 NULL 引用，未知类型即使引用 NULL 也拒绝。
- details、before_json、after_json 非 NULL 时整体转换为合法 JSON 字符串 `"[REDACTED]"`；包括源 JSON null/空 JSON 字符串。SQL NULL 保留。ip_address 非 NULL（含空串）整体转换为 `[REDACTED]`。原 JSON 必须为合法 UTF-8 JSON，不把损坏 dump 当作可修复正文。
- action 按迁移 VARCHAR 字符上限检查并原样保留；created_at 按 UTC SQL 文本格式验证有效日期与至多微秒精度并原样保留，不用本机时间补造。northbound created_at 按 NOT NULL 拒绝缺失；audit_logs 的迁移未显式 NOT NULL，保留其 NULL，准确目标 nullable/type 仍须 B schema proof。动作只作为历史数据输出，不触发 settings/caller/端口调用。
- 输出保留独立的源 cutoff，受控历史关联记录保存源/目标 ID、来源用户/资源引用及来源时间；没有原正文或正文摘要。公共结果不得直接携带这些私有记录，必须由未来集成写入受认证的受控证据并仅返回证据 ID。
- 源和输出分别检查相同容量预算，防止空串遮蔽和 ID 扩张绕过输出预算。任一行失败、冲突、容量不足或取消时返回零值，不泄露另一表的局部结果；固定错误不携带正文。输出 map、列 slice、指针、历史记录与输入独立。

本函数的 occupied 列表、映射、来源 cutoff 都只是输入声明，空 occupied 不证明目标为空；时间文本有效也不证明来源可信或目标时钟关系。B 仍必须认证完整行集、dump/checkpoint/schema/cutoff、历史证据、目标真实引用、目标 ID 保留以及同一实际事务中的占用/权限/门禁；外层还须完成参数化写入、成功提交和独立 SELECT-only 读回。这个离线候选不执行 SQL，不认证 proof，也不生成九表完整可提交批次。

## 验证与后续

新增测试覆盖完整两表列/映射/遮蔽/历史关联/指针隔离、缺映射/错域/占用/缺列/非法 JSON/时间/预算等拒绝、SQL NULL/空表、原 cutoff 与目标重编号分离，以及遮蔽扩容后拒绝。完整 resources 包使用既有隔离验证入口，default vet 保留；原始退出、冻结来源与清理按本轮独立回执核对，不能由此文代替真实结果。

增量请求需 A 复审这两份新文件及与 reader/字段比对组合后的行为。B/C 仍未交付，剩余七表完整候选、可信 proof/事务 writer/SQL read 集成、九表实际 MySQL、启动门禁、freeze/完整 GC 和原六项验收继续未完成。原 16/42 项不重跑，本轮不安装依赖或执行远端。
