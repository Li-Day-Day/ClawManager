# D 对 A 十五表组合入口与 B proof 接口的候选评审

日期：2026-10-14。输入是当前 `NormalizeBusinessForRestore`、相关映射/复制逻辑及 A 归档的本地回归记录。结论：接收候选组合接口和控制流，供 B/D 后续接线；不批准真实目标写入、registry/schema 冻结或恢复放行。[机器记录](evidence/system-backup-d-a-business-batch-review-20261014.json)绑定八份源码原字节摘要，本次核对全部与 A 本地验收记录一致；D 未重复运行 A 包测试。

此前[六处边界评审](system-backup-d-a-normalization-boundary-review-20261014.md)不覆盖本组合入口；本页明确增补组合层的范围，也不把它扩大为十五表逐列真实数据库验收。

## 已接收的组合语义

| 接点 | 当前代码核对 | 接收范围 |
| --- | --- | --- |
| binding | registry/schema 与受信 `CaptureScope` 相符；checkpoint/capture-context/目标身份 hash、evidence 和目标时间必须有合法形状；15 表来源长度与完整 dump 计数逐项相符 | 格式和计数闭合。hash 和时间的来源认证仍必须由 B 给出，不能以本地校验当作证明 |
| 一份依赖映射 | users/model 使用 `Gateway.Users/Models`；网关六表先做跨表检查；历史 instance 引用再逐项匹配 B 的统一 `Instances`，别名使用同一份 instances 映射 | 拒绝同批引用漂移。目标占用、collation/唯一性和源 dump 对应关系仍由 B 认证 |
| 初次 proof | 全部 Batch/Enterprise/Models/Rules/Aliases/Gateway batch/六表 leaf proof 都必须存在，typed nil 也拒绝；先给 Batch 独立副本再进入逐表转换 | 整批 proof 不替代 leaf proof，空表也不能绕过 |
| 输入固定 | dump 表计数、所有输入切片/容量 map 和当前结构中的可变指针逐层复制；quota/北向/企业/模型/规则/别名/网关复用已有转换器 | 同步 proof 回调修改它收到的副本或调用方原始值，不改本轮转换对象。复制期间的并发写仍属调用方数据竞争，接口不承诺并发可变输入安全 |
| 失败和最终 proof | 每一步失败立即返回空 `BusinessRestoreRows`；转换后用原固定 binding/input 副本执行 B `RecheckBusinessRestoreSources`，取消/撤权也返回空结果 | 返回值只有候选 SQL 行，没有成功状态、`PartResult`、eligibility 或提交收据。B 当前权限的最终核对仍要在实际写事务内再执行 |
| 错误分类 | `ErrBusinessRestore` 已接入 `KnownVerificationFailureCategory` 的 `normalization_failed`；B proof 错误保留 wrapping，context 取消/超时保留原原因 | D 组装任务结果时只使用已知类别和脱敏公开错误，不能序列化 B 原始 error 文本或候选行中的历史 credential hash |

本页没有在以上组合层发现需要修改 A 控制流的 finding；这个结论依赖当前输入指纹及原有 normalizer 边界，不代表 B proof 已实现或目标写入有通过证据。

## B/D 正式接线要求

1. B 的 `VerifyBusinessRestoreSources` 必须从独立权威认证同一封存 dump/checkpoint/evidence、15 表完整投影及 NULL/Secret/ref 状态、统一映射、目标 quota 容量、目标身份和库时钟、占用/写权限及应用启动 fence。目标 hash/时间由调用方填入仍不是授权。
2. `RecheckBusinessRestoreSources` 必须重验同一 binding 和当前目标权限。A 转换结束到 B SQL 写入之间有时间窗口；B writer 须在自身目标事务中再检查，不能拿 A 返回的批次当成长期或可重放 write permit。
3. B 在同一准确隔离目标中写全部依赖与十五表，保留 SQL NULL、DECIMAL 字符串、真实 FK/collation 和跨表字符串引用；任一失败回滚全部行。事务提交不明须独立观察，不由 D 自动重新写一批。
4. B 提供当前 SELECT-only 目标身份和只读 proof 后，D 组织 A `SQLRestoreVerifier` 与 B 资源/isolation/停止/清理事实。实例直接 token 清除和风险规则启动/流量门禁保留此前跨 Owner 要求。
5. A 新增 `-BusinessRestoreOnly` 是候选十五表 MySQL/外键/事务/只读账号专项；它的 source proof 与 writer 明确是 fixture。接收其回执后仍须真实 B adapter、完整 D 编排、大数据量与生产放行验收，不能用三表 `-BusinessHistoryOnly` 或本地编译补齐该范围。

本评审关闭“新组合入口尚未得到 D 候选接口评审”的交接缺口；registry 的 approved reviewer 列表、公共合同冻结、真实恢复资格继续由各自独立门禁控制。未来源码或 proof 形状变更须按新指纹复核。
