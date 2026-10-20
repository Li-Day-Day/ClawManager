# A：GC 审计 resource_id 的独立类型回归

本轮发现新的直接引用组件把 `audit_logs.resource_id` 期望为 VARCHAR，并用公开 Operation ID 查询它；正式 `001_init_schema.sql` 的该列为 INT，后续正式迁移没有更改这一类型。此前模型用 `gcDirectColumns` 自身生成列类型，因此不能发现这种期望与正式 schema 的差异。

核对写入端后，采用并行实现中的修正：保留 INT 元数据校验，移除公开 `sop_...` 与遗留 INT resource 的错误比较。`downloadIntentInsertSQL` 等备份审计写入将 resource_id 留为 NULL，公开 Operation 身份位于 JSON；不能因存在一个整数列，就推断它绑定私有 Operation 主键。此处不新增这种未发布的数值关联，也不修改正式表或迁移。

## 独立回归范围

新增 A 测试 `TestAGCDirectAuditResourcePublishedInteger`，直接以正式 INT 覆盖模型列类型，不从生产期望表推导这一事实：

1. 正式 INT、原组其他条件满足时可回收，且实际记录的引用查询没有错误的 legacy resource 比较。
2. 列改为 VARCHAR 后，即使重新采集外层结构指纹，内层关闭的引用目录仍拒绝。
3. 给该列新增指向 Operation 私有 PK 的未发布 FK 后，即使外层重新采集 pin，仍拒绝；合法列类型不等于允许任意新 FK。

验证脚本计划在拥有的临时目录中用 Go overlay 分别注入错误类型、重新引入公开字符串比较、放行未发布 FK。每次只运行独立 A 根，并要求恰好预定叶子失败；编译错误、其他测试失败或跳过均不算成功抓到错误。overlay 不改工作树，结束后与快照、缓存一起清理。只有定向回归和错误注入验证均通过后，才对原来源运行 evidence 完整包和默认 vet。本轮在定向回归失败后停止，没有执行这些后续阶段。

## 验证状态

本轮已结束，结果为失败，按用户“做完这轮先停一下”的要求暂停。首轮在测试前因为并行实现变化触发精确 counterfactual 绑定检查而停止，exit 1 和清理记录保留；没有执行 Go 测试/构建阶段。

第二轮冻结来源 1,445 个文件，SHA-256 为 `4c7d1c7664dc8c84498883f315b470310b7c979b8451c0560e1b54a7773309d6`。离线、默认 vet 的定向测试实际运行三个子用例：`wrong_type`、`unexpected_fk` 通过，`published_int` 返回 `permission_denied` 而失败，根测试随之失败，退出码为 1。没有编译错误或跳过；错误注入三个阶段、完整 evidence 包及最终来源后置校验均未执行。两个拒绝用例通过不能证明拒绝来自预期的内层规则，仍需正向用例和错误注入验证支持。

独立核对已重算来源清单摘要，核对原始 JSONL 的运行、通过与失败集合、退出和清理标记，并确认本轮拥有的快照、构建缓存及 overlay 目录不存在。没有安装依赖，没有远程执行。失败原因目前只定位到正向用例被拒绝，尚不能判断是 A fixture 还是 collector 整合问题；恢复工作后应先调查这一点，不将本轮视为通过证据。

失败记录：[a-gc-audit-resource-failed-20261020-r2.json](evidence/a-gc-audit-resource-failed-20261020-r2.json)。原始日志和来源清单保留在 `docs/evidence/a-gc-audit-resource-20261020-r2-*`。

本轮不执行实际 MySQL，不验证 SQL 的真实类型转换、受限角色、范围锁或完整 GC policy。真实 SQL owner 十一项、早期受限账号十项继续按原顺序等待用户回执，不增加已通过九项/二十四项的重复远测。当前 collector/reference 整合仍须自己的来源、完整回归及现场验证，不能仅凭这里的模型检查批准生产删除。
