# A：配置变更的公开 Operation 响应编码

本项落实 [A-CONFIG-WIRE-01](evidence/a-config-success-wire-audit-20261015.json)要求的准确公开成功体。既有 OpenAPI 要求 update/rollback 的 200 为 `task-operation.schema.json#/$defs/Operation`。新增 `a-config-operation-response.v1` 纯编解码器，不修改公开 schema，不把 ConfigResource 或当前查询结果包装成“原始响应”。

## 编码与表示边界

[CanonicalConfigOperationResponse](../backend/internal/systembackupsecurity/config_operation_response.go)接收独立取得的 installation、operation ID、admin actor ID、endpoint/key/request hash、新配置版本、operation row version 及数据库时间事实；输出完整闭集 Operation 的 UTF-8 JCS。固定 `operation_type=config_update`、system target、admin actor、succeeded、retryable=false、failure_category=none、failure_message=null、HTTP 200、result resource=null 和准确 result config version，包含所有 schema 字段。没有 config、reason、proof、会话、凭据或额外授权字段。

版本和 row version 限定安全整数，actor ID 以准确十进制字符串表达；两类 endpoint、安装/operation/key/hash 格式均严格校验。时间必须为有效 UTC，满足 created ≤ started ≤ finished ≤ updated < deadline，不能拿 SQL 锁外的准备时刻猜测完成时间。deadline 边界相等即拒绝。

`DecodeCanonicalConfigOperationResponse` 仅验证表示。它解析必要事实后重新生成独立期待的完整 JCS，与所有原始字节比较；未知/遗漏/重复字段、null-for-false、非 canonical 数字或时间、填充、错误常量和原始 ConfigResource 都拒绝，失败不返回残留 policy。解析结果不授予读写权限，也不证明操作已提交；重放必须先验证保存的 hash 与 SQL 收据，再逐项匹配独立锁定事实。

完整 Operation 只含有界标识、固定枚举、整数和时间；已将上限固定为 8 KiB。测试使用最长安装/key、int64 actor 字符串、安全整数最大值及最长合法年份/纳秒时间，当前完整 v1 成功体最大字段用例为 1,232 字节，不通过截断、删字段或省略失败字段适配 inline。此界限不扩大其他 evidence 类型的 inline 预算，也不解除完整新配置的 owner 引用/registry 校验、当前权限和容量准入。

## 独立向量与当前验证

[两份源 fixture](../backend/internal/systembackupsecurity/testdata/config_operation_response_vectors.json)由独立 Node 顶层 JCS/SHA-256 产生，分别覆盖 update 和 rollback；不是历史配置原文、成功操作或实际写授权。Go 逐字节比对向量并严格 roundtrip，另测试完整机器 schema、非法 policy、表示变异和最大字段预算。Node 按现有 OpenAPI 解析成功体 `$ref`，核对全部闭集字段及其引用的 scalar 约束、JCS 和摘要。

首轮 Node schema 检查因测试脚本对 `/$defs/` 的切片偏移错误而失败一项；[失败输出](evidence/a-config-operation-response-contract-20261015.txt)保留。修正测试引用解析且要求缺失 schema 明确失败后，[r2 三项检查](evidence/a-config-operation-response-contract-20261015-r2.txt)全部通过，不改向量或生产 schema 迎合测试。

[Go 完整输出](evidence/a-config-operation-response-local-20261015.txt)、[固定输入](evidence/a-config-operation-response-source-20261015.json)与[接收记录](evidence/a-config-operation-response-review-20261015.json)确认门禁退出 0：1,216 项输入摘要为 `210be78fedc497fa09f57cbd20cd5793c47703df7854bd7ec262a463642e474a`；定向 5 主测试/41 子用例（46 项，3.006 秒）通过，完整 security/config 两包 183 主测试/952 子用例（1,135 项）通过。security 为 163/839、31.383 秒，config 为 20/113、6.180 秒，默认 vet、无工具重试。定向重复覆盖不另加总。

冻结副本后检通过，归档时全部 1,216 项已有 live 输入仍匹配。五项新增源码/测试/向量/验证入口准确 pin 已登记。目录 `.tmp-a-evidence-4696dea9485943eeac5b2131304fdec3` 和 `.tmp-d-index-cache-42fa58613b204bf684ae58944153e28a` 及 cache/tmp/telemetry、源码和测试产物全部删除，并独立确认不存在。测试结果只接收本 codec 的表示边界与冻结回归，不将 D 组合接口的编译/模型通过当作生产适配批准。

## writer/receipt 后续接线要求

1. 锁外阶段只固定业务请求、actor/target、operation ID、风险、引用/准入与响应预算。最终 Operation 的 finished/updated 时间尚不存在，不能先发布一个声称已完成的响应或提前绑定其最终 hash。
2. 最终事务核对当前快照、权限、MFA/nonce、容量并执行配置/CAS 后，用新的数据库时间取得 terminal Operation 事实。采用本 codec 构建完整响应；SQL 行的 created/started/finished/updated/deadline、row version、result version 和其他公开事实必须与同一 policy 一致，不能让数据库默认 updated_at 偷换一个不同时间。
3. 完整有界成功体可在同一事务暂存为 inline evidence；原样字节、hash/size、operation FK、nonce、真实审计 ID 和收据共同提交。新的原响应必须是 Operation，不能只把外层 HTTP 改成 Operation 而继续保存 ConfigResource hash。
4. 原响应保存和最终 guard 完成后再次检查最新数据库时间与授权截止，提交成功才释放准确字节。未知提交仍只用同 target/key/hash 的当前授权观察，不盲重写。
5. 重放的当前会话和原风险权限复查保持不变；从可信收据/evidence 取原 Operation 字节，核对完整原事实并再检查当前授权后返回。不得新查一份当前 Operation 或 ConfigResource 重新编码来替代原字节。

本轮只交付正确公开表示组件。当前旧 writer/内容策略/reader 仍须迁移接线，finding 继续 open；未开启 HTTP、执行 SQL/远测、安装依赖或签发部署写权限。
