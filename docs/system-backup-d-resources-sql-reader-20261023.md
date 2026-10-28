# D 九表事务内 SQL reader 候选

2026-10-23。先通过 A 原复核程序并保存 [D 接收回执](evidence/d-a-resources-v2-intake-20261023.json)及 145 份历史来源胶囊，再新增 reader。A 六表安全规则与 report 正文约束已收到，限原 142 份输入所对应版本；A 没有批准恢复写入，也没有审阅本轮新增 reader。原 v2、逐字段请求及 A 回执保持不变。新增文件后，原 A 程序的当前文件集合检查应拒绝；历史接收可用 `node docs/evidence/d-a-resources-v2-intake-20261023.mjs --check` 复核，不能改写成当前包已受审。

`restore_fields_sql.go` 提供私有 `readRestoreFieldRows`，仅供后续受审集成：

- 不打开、提交或回滚调用方事务，不对未提交读取赋予恢复资格。九表必须在同一被 B 认证的事务/会话中读取，比较后仍须由外层确认事务结束与 context。
- 首先要求 `@@session.time_zone` 精确为 `+00:00`，不把 SYSTEM/UTC 名称猜测为等价；逐表检查 InnoDB 和 information_schema 的完整列名集合，空表也不能跳过。
- 只使用闭集表/列标识符和显式 SELECT，逐列 CAST 为 UTF-8 SQL 文本，避免 Go driver 的 float64 或 parseTime 转换；保留 DECIMAL 尾零、SQL NULL、JSON null 和时间小数。预期候选必须使用受审的相同 SQL 表示，不能通过模糊重编码“修好”差异。
- 查询按 id 排序并带剩余总行预算加一的 LIMIT 哨兵；扫描前检查行数，复制值前检查累计值字节预算。拒绝未投影的 native 数字等 driver 类型。调用方上限不可用 MaxInt64，避免哨兵溢出。超量、非法/重复 ID、投影差异、query/scan/迭代/close 失败或取消均丢弃全部结果，关闭游标，不输出局部快照。错误不携带 SQL driver 原始错误或正文。

本轮只检查现场列名集合，不校验完整类型、nullable/default/index/FK/schema hash。B 必须先对准确事务证明完整目标 schema、目标身份、隔离与新 SELECT-only 身份，以及恢复写凭据不可达。SQL CAST 不是 schema 证明；两个相同坏值仍可比较相等。driver 可能已经分配单个大 cell，复制预算也不是协议包或物理内存证明。分页/大规模 SQL 工作量、DDL freeze 与现场执行计划仍须实际实验。没有调用业务 service/ensureConfig/migration，没有改写数据、正式 registry 或批准，没有生产入口使用此私有候选。

## 尚需交付

| Owner | 当前收到 | 尚需完成 |
| --- | --- | --- |
| A | 原六表安全规则修订与 report 正文边界 | reader 增量复审、完整候选及真实集成安全验收。 |
| B | 无新增生产交付 | 九表准确来源/目标 proof、typed 映射、时钟/fence、共同事务 writer、目标 schema/身份/SELECT-only、凭据销毁、启动门禁及实际数据量预算。 |
| C | 无新增生产交付 | analyzer/timeout/能力、资产/结果版本、父子终态和闭集 report schema。 |
| D | 离线列比较及本事务内 SQL reader 候选 | 同版本评审后完整候选、受认证外层事务与比较/35 控制表整合、实际恢复/启动验收、freeze adapter/完整 GC，以及原六项。 |

完整 resources 包用原隔离入口验证，保留默认 vet；实际结果、冻结来源、退出和准确清理另有同轮复核回执。合成 driver 测试不能替代实际 MySQL、B 权限证明或生产恢复验收。旧十六项与四十二项按原来源复用，没有重新运行。
