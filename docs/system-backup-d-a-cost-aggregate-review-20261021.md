# cost_records 金额与 token 汇总核验

【2026-10-22 成本并发与四项汇总差异实际已接收】[实际结果及来源边界](system-backup-d-cost-snapshot-concurrent-accepted-20261022.md)核对 MySQL 8.4.8、五个成本子项通过、并发子项 0.10 秒、恢复父测试 8.56 秒和退出 0。独立写连接提交后原 RR 快照不变，新事务看到新摘要；金额/token/币种大小写/actual_cost NULL 差异均通过。001..081/96 份迁移及 UID 清理记录核对完成，账户/库/远端 scratch/缓存清理已报告；没有独立远端复查，也未记录准确本地 scratch ID。三份当前测试文件匹配准备版本，但 A 入口未保存同轮源码清单/前后摘要，原“逐包输入校验”表述已修正。本轮只接收合成实际 SQL 行为，真实 B dump、生产恢复写入授权、完整 large-smoke、完整 GC 和原六项继续待验收。下方“成本实际待跑”为此前记录。

已发布本轮 14 份文件并清理准确自有产物，状态见[最终回执](evidence/d-a-cost-aggregate-v2-preparation-20261021.json)。最终冻结来源为 1,486 份输入、SHA256 `ff1f5c2c0a271dcecb24cd3b6205ecb56528b24e7c8ff36b7e56e6ff11321447`；A 业务与安全两个完整包 341 个主测试／2,398 项、Node 79 项、tagged 离线 seed 1 个主测试／3 项均通过，默认 vet 与前后来源复核通过。inventory／普通合同退出 0，strict 按现有缺口退出 1。

冻结前重取了 13 份并发输入。发布时另有 7 份 live-chain 脚本和 5 份前端上下文变化，均保留；[限定来源审查](evidence/d-a-cost-aggregate-v2-concurrent-publish-review-v3-20261021.json)确认它们不在这轮执行/输入依赖中，不为其功能或 UI 背书。本轮保护 Go 模块、实际 Go 依赖、合同、被读取的 DTO 快照和 14 份目标文件的摘要；[发布上下文](evidence/d-a-cost-aggregate-v2-published-context-20261021.json)只是观察记录，不能当成整份当前工作区通过测试。

原有 A 十五表核验能发现行数变化，但相同行数下的金额、token、币种或 `actual_cost` NULL 变化没有检查项。`cost_records` 的 registry policy 已要求校验金额和 token 汇总，因此这属于已有策略的实现缺口。此前十五表评审与失败日志保留，本轮不改其历史结论。

候选把 `SourceSnapshot.CostAggregateSHA256` 纳入完整快照，并在以下三个位置使用：源端 SQL 采集与十五表计数共用只读 RepeatableRead 事务；备份验证比较 B 证明绑定的 source/dump 摘要；恢复验证在独立 SELECT-only 目标事务中重算并比较该摘要。完整批次 normalizer 也会重算候选成本行的摘要，与已认证 dump 比较，失败时不返回任何候选行。B 必须认证这一新增字段，不能仅证明原有行数。

摘要按币种的 UTF-8 原始字节分组和排序，不合并 `USD` 与 `usd`。每组包括行数、`actual_cost` 非 NULL 行数、prompt/completion/total token 总量，以及 input/output unit price、estimated/actual/internal cost 五项总量。金额保留八位小数，累加和边界检查用精确整数；不经过浮点数。NULL 的 actual 总量记为八位零，但非 NULL 行数参与摘要，所以 NULL 与数值零不会混同。空表用空数组。超过 256 个币种时拒绝返回摘要，SQL 读第 257 组用于识别溢出，不能将截断结果标为通过。

摘要格式是 `SHA256("cost-record-aggregate-v1\n" + JSON)`，前缀的末尾是一个 LF 字节。JSON 使用 Go `encoding/json.Marshal([]costCurrencyAggregate)` 的 UTF-8 输出及默认转义，不添加结尾换行；它是固定字段顺序的组数组，字段顺序见 `costCurrencyAggregate`，整数总量以规范十进制字符串表示，金额以规范八位小数字符串表示。它证明本轮指定的汇总一致性，不能替代逐行内容认证、主外键映射证明或生产写入授权。

公共检查新增 `ai_gateway.cost_aggregates` 与 `ai_gateway.restore_cost_aggregates`，expected/actual 只含 `hash`。AI gateway 的 backup 检查数由 11 增至 12，restore 由 13 增至 14；users 数量不变。源端采集由 30 增至 31 个查询，恢复验证由 39 增至 40 个查询。完整比较的摘要不符分别返回 validation_failed / normalization_failed；SQL、扫描、结果流、关闭、最终证明或提交异常不返回部分结果。目标行数变化仍产生完整的失败检查，不会因拿期望行数验证实际汇总而错误退化为不完整读取。

回归覆盖独立固定摘要、多币种与大小写、八位精度、超过 int64 的合法总量、边界溢出、NULL/零差异、相同行数的金额/token/币种变化、空目标、257 组、SQL/Scan/Rows/Close 失败，以及证明输入修改、证明取消和迟到提交。已为现有 run-owned MySQL 探针补充金额、token、大小写和 NULL 四项实际注入及 NULL 汇总正例；本地编译/seed 不等于这些实际 SQL 已执行。

MySQL 对精确整数/DECIMAL 的 SUM 返回 DECIMAL，COUNT(expr) 统计非 NULL 值，见[官方聚合函数说明](https://dev.mysql.com/doc/refman/8.4/en/aggregate-functions.html)。本轮使用字节分组以隔离默认不区分大小写 collation 的影响，语义见[官方类型转换说明](https://dev.mysql.com/doc/refman/8.4/en/cast-functions.html)。文档依据不能代替真实 MySQL 8.4.8 运行回执。

未安装依赖，未执行 SSH/服务器命令，未批准 schema registry 或生产接线。真实 B dump/proof/writer、现场数据库、代表性数据量下的查询计划与耗时，以及原六项范围仍需独立证据。GC task 的 081 修复和完整十八项服务器复跑是另一条验收链。
