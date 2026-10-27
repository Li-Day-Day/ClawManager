# A 对 D 事务内逐字段 SQL reader 的增量安全复审

2026-10-23。范围为 D 的 `d-resources-sql-review-request-20261023.json` 固定的 153 份来源，重点为 `restore_fields_sql.go`、其测试及已评审的离线逐字段比较器。结论：**接收私有 reader 候选的安全边界及这份冻结版本的合成测试证据；不批准真实恢复读取或生产装配。**

已静态核对：SQL 标识符来自编译期闭集，表名元数据查询参数化；要求显式 UTC、InnoDB 和完整列名集合；使用 SQL 文本投影、全局行/值字节预算及额外一行哨兵，避免 Go float64/parseTime 转换和行预算溢出。错误固定，不回显 driver 原错误或原正文；query/scan/迭代/close/取消失败均返回 nil，不交付部分结果。reader 不开启、提交或回滚事务；最终成功前复查取消，外层仍须确认事务完成。单 cell 的 driver 分配和查询执行工作量不由保留字节预算证明。

逐字段相等不证明预期数据合法。候选只验证列名集合，B 必须在同一准确目标/会话上认证完整 schema（类型、NULL/default、索引/FK、schema-hash）、新 SELECT-only 身份、写凭据不可达、隔离和一致视图；DDL freeze、实际数据规模与计划也需现场验收。预期候选必须由受审 normalizer 和真实 B/C proof 产生，并使用相同的受审 SQL 表示。CAST 不能代替 schema 证明，两个相同的坏值仍然相等。没有这些前置条件，不把 helper 返回成功解释成恢复资格。

独立接收程序核对 D 原 23 份冻结输入的原始字节/摘要、153 份请求来源、原始 JSONL 的单包完整结束、42 根/388 条通过事件、16 个失败路径场景、111 列变异、默认 vet、准确 owner 缺席与清理回执。没有重跑 Go、安装依赖或连接实际 MySQL。原运行不覆盖后来新增的 `restore_audit.go` 等文件；新增文件集合另列，不修改原请求或历史通过结论。

后续仍须 B/C 真实事实、九表完整 normalization、受审外层事务与独立 SQL reader 装配、35 控制表排除、实际恢复/启动门禁和 GC/freeze 整链。A 的旧六表及 report 正文要求不变，正式 registry/批准字段未写入。
