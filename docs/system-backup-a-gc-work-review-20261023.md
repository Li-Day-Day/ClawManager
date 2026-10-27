# A：GC 同事务工作阶段与装配方案复审

2026-10-26 当前结论：私有 candidate 的末次业务复查及 F1–F10 本地算法门禁已在 [最终 owner 接收](evidence/a-owner-final-local-accepted-20261026.json)关闭：647 根/5,190 条原生事件，旧库存逐名保留，原 seed/编译、两项单语义回退反例和准确清理齐全。具体范围见 [finalizer 审查](system-backup-a-gc-finalizer-review-20261026.md)。下文保留旧静态审查历史。生产 Collect 装配、准确 worker/observer 权限、共同锁协议、物理容量与十二组实际协议仍待原事实和联合验收。

2026-10-23。复审 D 的 `system-backup-d-gc-work-handoff-20261023.md`、当前 `download_retention_gc.go` / `download_retention_gc_work_test.go` 及私有 freeze 协议。结论只覆盖静态边界与已有私有协议证据，不批准新的实际 grants、完整 Collect 或生产装配。

## 本地设计意见

- 接受把原删除流程拆为私有 `collectInTransaction` 的方向。原 `Collect` 仍拥有连接和唯一提交；工作阶段不 Begin/Commit/Rollback、不解锁、不新建连接，也不重试。入口仍检查原 peer context 和原截止时间；L0..L7、原 worker/config/nonce/引用、容量、审计、保留 envelope、tombstone、原组删除及最后 absent-key/SQL 时钟检查均在同一事务内。
- 接受“全局 freeze 在唯一 RR 事务及最终 metadata 观察之前取得”的提案方向。锁前 admission 只做准入，不能作为冻结后的完整 schema/grants 观察。完整外部 FK、routine/view/trigger/event、临时表/会话状态及所有参与者的等待关系仍需实际定义和验证。
- 接受事务结果与解锁结果分别报告、未知提交不重试/不宣称回滚、原连接明确解锁后观察零 ticket、最终请求物理 discard 的边界。`ErrBadConn` 与连接关闭仍不证明服务端释放；取消后必须独立观察原 holder 并停止后续批次。
- 现有 `download_retention_gc_work_test.go` 覆盖完整 SQL/state 模型的共同提交、调用方晚拒绝、末次锁丢失、最后删除失败和无关 context。它们使用合成 admission/锁/传输，不能替代完整包门禁、真实权限、实际锁观察或完整 Collect。

## 必须关闭的具体决定

| 编号 | A 的要求 | 当前缺口 |
| --- | --- | --- |
| A-GC-WORK-01 | 在最终 freeze 查询之后、唯一 Commit 之前落实当前权限、worker/fence 和原 SQL/lease/deadline/容量时限的末次复查；明确该阶段使用同一 tx，不续期。 | 当前 helper 在 work 返回后只查询 ticket、检查 context，再 Commit。慢 ticket 查询可能越过比 context 更短的 worker lease/容量期限；现有 API 没有表达查询之后的业务末次复查。D 提案已承认此处仍需落实，因此当前候选不能直接装配生产。 |
| A-GC-WORK-02 | 提交准确的 freeze worker/observer 权限闭集及权限来源、撤权和额外权限拒绝规则，评审两个角色的实际可见性。 | 只有独立 profile 的原则，没有获批的完整实际 grants。原 Early global REFERENCES 不隐含 BACKUP_ADMIN，也不得扩大白名单继承旧角色回执。 |
| A-GC-WORK-03 | 冻结完整 metadata 范围及与 L0..L7、DDL/账号管理的锁顺序，给出 wait graph 和有界等待/取消/故障接管验收。 | 私有 Admit/Work 回调仍非生产策略；B/C catalog/schema 本域输入尚缺，不能将合成允许回调当权威事实。 |
| A-GC-WORK-04 | 保持同一物理连接、唯一 RR 事务、原授权与清理预算；以原 holder 独立观察证明释放，未知结果停止批次。 | 实际 MySQL 十二组协议、完整 Collect 晚失败与接管、物理容量和全局影响未验收。 |

A-GC-WORK-01 是生产装配阻断意见，不是已启用代码的生产漏洞声明。私有 helper 当前未接入 `Collect`，不可为取得本地通过而用默认 allow 回调补位。

## 准确证据范围

最新本地协议请求为 `evidence/d-gc-freeze-protocol-review-request-20261023-local-closeout.json`。其 18 份输入中，当前请求生成脚本发生变化；运行代码和原验证材料保持对应范围，脚本漂移在机器复核中单列。没有改写原请求或把历史回执扩大为新完整工作阶段已通过。

当前完整 owner 轮以真实失败/超时结束；D 六包门禁也已报告 HTTP 失败。单个新 GC 子例通过不替代这些完整门禁。本次只提交 A 的设计和静态复审意见，A/D 联合批准保持未完成，实际 grants 和生产装配均未批准。

## D 设计回应的增量复审

2026-10-23，收到 D 交接中“对 A-GC-WORK-01 的明确装配回应”后，A 再核对当前 `collectInTransaction` 的捕获事实、删除后独立检查和 `runDownloadGCFreeze` 的实际提交顺序。**接受这项设计顺序作为后续实现要求；A-GC-WORK-01 的实现及生产装配阻断仍未关闭。**原静态意见及原失败范围不改写。

D 提出的 work → 原会话准确 ticket → 同一 tx 的私有 finalizer → 唯一 Commit 顺序符合 A 的要求。finalizer 必须保有 work 已建立的原 scope、config、worker、peer、guards、reservation、retained evidence、tombstone、absent keys 及原 until；拒绝跨 tx、二次调用、取消、时钟回退和原期限已过。它不能由调用方新 DTO、默认 allow 回调或重新签发的授权重建。只有 `nil` 的 work 返回值不足以传递这些受保护事实。

删除后的末次检查必须沿用当前 work 的两层顺序：先执行原 guard/reservation/early/direct 的事务内复查，再在所有这些回调之后独立核对原 worker/lease/deadline、config、保留 evidence envelope、tombstone 和原组 absent keys，最后采样原 SQL 时钟及取消状态。不能在组已经删除后调用要求原组仍存在的 `g.Recheck`，也不能在独立检查后再插入部署回调或网络调用。末次阶段只访问已经建立的原锁范围，不能获取新 prefix 或延长任一有效期。

当前源码仍是 `work` 返回后查询 ticket、检查 context、直接 Commit，尚无上述 finalizer；生产 `Collect` 仍自行拥有原事务，没有调用私有 freeze helper。本次没有改动这些 Go 文件或重跑 D 正在执行的门禁。后续实现至少应给出慢 ticket 跨越 worker/容量原期限的拒绝、末次回调改变事实的拒绝、跨 tx/重入的拒绝，以及末次失败共同回滚的证据；这些是待交付条件，不是本轮已经通过的测试。

A-GC-WORK-02 的准确 worker/observer grants 与来源、A-GC-WORK-03 的完整 metadata/等待关系，以及 A-GC-WORK-04 的实际十二组协议、释放/接管和容量影响仍待原事实。已有四根/33 条私有协议回执只保留其四文件候选范围；不覆盖后来完整 work 的集成用例。完整包和 owner 当前门禁另由 A1/D2 收尾，旧 ready 不继承给新字节。
