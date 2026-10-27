# D：GC 同事务工作阶段与装配方案

【2026-10-26 当前入口】准确 GC 实现、23项冻结原生验证、演练 tagged 修复及 A owner 本地最终签收已完成，原测试/构建产物已清理；修复后实际演练十九项由另一路限定接收。阶段来源为原2099，随后新增的 bootstrap candidate 消费代码仍须完成接线、测试和独立复核。准确边界见 [10月26日本地收尾](system-backup-d-local-closeout-20261026.md)。以下原轮次记录保持历史含义。

【2026-10-26 当前进度】旧 r4 已中断并准确清理，不是当前完整通过。私有 finalizer 与固定内部候选已落盘，修复完整动态可比较检查，保留最后 SQL 样本并新增中间回退/前进、原 reservation 台账及晚发引用等回归。新冻结来源 1,629 项，SHA `41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16`。当前原生门禁尚未完成；运行中入口的 detached 点参数存在静态风险，是否影响本轮以实际 native 结果为准；原轮全部通过时直接接收，只有实际失败才启用同源修正补测。原脚本保持不变，不把局部通过记为全轮通过。准确状态见 `evidence/d-d-local-coordination-20261023.json`；最终仍需新来源完整验证、F1–F10 复审及产物清理。

本轮按“做除了远测的部分”完成 D 本地实现、回归和交接准备。本文是 D 对 A 既有装配约束的具体响应，尚无新的 A/B/C 联合签收；不发放权限、不连接远端、不启用生产 freeze。

## 代码边界

`SQLDownloadRetentionGC.Collect` 继续拥有连接、唯一 RR 事务和唯一 commit，并负责失败后的 rollback 与物理 discard 请求。原受保护工作拆为私有 `collectInTransaction`，只使用调用者传入的 `*sql.Tx`。它不取连接、不开始或结束事务、不解锁、不重试、不延长授权。入口复核原 peer context 与原截止时间，拒绝无关 context 在 SQL 前进入工作阶段。

工作内容及顺序保留：L0 installation/config/nonce scope、L1 incoming/direct reference ranges、L2 原用户 FK、L3 worker/组/tombstone keys、owner/nonce/引用范围、容量预留、审计核对、已删除 evidence envelope、tombstone、原组删除，以及所有原有的末次 worker/config/evidence/tombstone/absent-key/SQL-clock 检查。工作返回成功仍是未提交状态，调用者后续失败必须回滚全部变更。

`download_retention_gc_work_test.go` 只在测试中把该实际工作阶段送入私有 freeze 候选，复用原完整 collector SQL/state 模型。证明同一连接、一次 Begin、工作不提交、事务结束后才解锁，以及调用方晚失败/最终锁观察失败/最后删除失败恢复组、审计正文、nonce、tombstone 与容量预留。测试里的 admission、锁观察和数据库传输是合成事实，不构成实际 MySQL 或生产授权证据。

## 提交 A/D 共同核对的具体方案

| 阶段 | D 方案及必须维持的约束 | 仍需的决定或证据 |
| --- | --- | --- |
| 准入 | 单独配置的 fresh connector/private pool；精确 server/database/account/role/UTC/session pin；原 worker/peer/config/授权截止时间不续期。锁前 admission 仅认证准入，不把锁前 metadata 快照当作最终完整 schema。 | A 核对新 profile 的准确 BACKUP_ADMIN/观察权限、最小 grants、额外权限拒绝、撤权与授权来源。旧 Early 白名单不扩大。 |
| 全局锁 | 原授权 context 内等待 1..5 秒；独占连接获取全局 freeze 并观察本会话准确 ticket，随后复核准入。 | A/D 核对所有 DDL、账号管理及其他参与者与该全局锁的等待关系。提议顺序不代表已证明无死锁。 |
| 工作事务 | freeze 观察成功后才 Begin 唯一 RR 事务，在同一 tx 取原 SQL 身份/时间，执行 `collectInTransaction`。完整 metadata/schema/grants 与 incoming references 必须处于受保护范围；保留原 L0..L7 顺序与全部末次守卫。 | 受审完整 Policy/metadata 可见性/DDL freeze 定义，以及 B/C 尚未交付 catalog/schema 的本域输入。生产不得把合成 Admit/Policy 当适配器。 |
| 最后检查与提交 | 工作成功后在同一事务复查 freeze；仅 owner 提交一次。工作或末次检查失败共同回滚，不在回调里调用现有 `Collect` 形成第二事务。 | 当前候选只复查 ticket；正式装配仍须落实当前权限/worker/fence 末次证明的准确位置，不能将提案当实现已验收。 |
| 结束与清理 | 已知事务结束后，在同连接显式 UNLOCK，观察原会话 ticket 为零，再请求物理 discard。未知提交不重试、不宣称回滚；未知回滚/释放停止批次。 | 取消、丢回复、连接被杀、独立观察原持有者与接管回执；不能把 Close/ErrBadConn 当服务端锁已释放。 |
| 时限与容量 | 保留原授权 context、SQL 时钟、lease/deadline、容量 reservation 有效期和最后检查；清理不得延长业务授权。取消后不在新连接补解锁。 | 工作与清理预算、独立观察所需权限/时限、物理审计卷/容量/全局影响的实际证明。 |

## 验收范围

A1 的[独立静态接收](evidence/a-gc-work-extraction-reviewed-20261023.json)已经按准确 `77718ddf...` 来源确认：反向移除抽取包装可逐字还原原 `f919c6...` collector，受保护原 body 完整保留，事务结束仍归原 owner。该接收不覆盖运行结果、末次 finalizer、完整权限/freeze 或生产；本轮完整门禁另行签收。

### 对 A-GC-WORK-01 的明确装配回应

A 的 `system-backup-a-gc-work-review-20261023.md` 要求末次 worker/authority/fence/SQL deadline/capacity 检查位于最后 ticket 查询之后、唯一 commit 之前。D 接受此顺序要求，拟议正式适配顺序如下：

1. 同一受保护事务执行 `collectInTransaction`，保留原 work 内全部检查。
2. 在这个事务查询原会话准确 BACKUP LOCK ticket；丢锁或观察失败立即失败并共同回滚。
3. 调用与该**准确 tx 和原 scope** 绑定的私有末次检查阶段。它须保留 work 建立的 worker/config/peer/fence、引用/owner guards、容量 reservation、evidence envelope、tombstone/absent-key 和原 until；这些事实不从 caller 提供的新版 DTO 或回调常量重造。
4. 末次阶段只复查原锁范围，不新增 prefix、不读 provider、不开始新事务、不延长 context/lease/reservation。先重新采样 SQL 时钟并拒绝超出原 until/回退；复查原 authority/worker/fence、全部可在本组删除后使用的 guard 与 reservation；随后独立复查原 worker/config/envelope/tombstone/absent-key，再作最后 SQL-clock/原截止时间和取消检查。不得在已删除组上重用要求原组仍存在的 `g.Recheck`，须沿用原删除后独立检查。
5. 无其他外部/部署回调后，由唯一事务 owner commit 一次；未知提交不重试或声称回滚。事务已知结束后才执行同连接解锁/观察/物理 discard。

为使第 3 步可执行，后续受审适配应把 work 的原捕获事实封装为不可伪造、不可序列化、准确 tx 绑定且只调用一次的私有 finalizer；仅返回 `nil` 的 work 结果不能代表此阶段已完成。末次检查返回后至 commit 之间不得再调用可撤权/改变事实的回调或交出连接。最终协议仍须共同确认 BACKUP_ADMIN/观察权限、锁序、完整 metadata、失败与不确定结果的边界。

**当前状态没有改写：**私有 `runDownloadGCFreeze` 仍只有 work/ticket/commit，没有上述正式 finalizer，也没有生产授权/Policy 实现，因此不能据当前候选或 work 合成回归宣称 A-GC-WORK-01 的生产装配已经验收。本轮完成的是明确设计回应；该检查阶段与正式接线仍须 A/D 共同方案和实际协议证据后实现。

本地完整包与精确来源/产物清理的最终结果见本轮 closeout 机器回执。独立 freeze 验证入口现在包含 A 的 `download_retention_gc_freeze_a_test.go`，覆盖 map/slice/func/chan 空值及非空对照；旧两文件回执只保留历史范围。

生产 `Collect` 没有接入 `runDownloadGCFreeze`，没有新增 grant 或扩大 Early profile。原历史详情十六项、GC 前置/连接生命周期四十二项不重跑、不扩大背书。原协议实际专项、完整 Collect、现场权限/容量/故障接管、A/D 准确版本联合批准继续未完成。
