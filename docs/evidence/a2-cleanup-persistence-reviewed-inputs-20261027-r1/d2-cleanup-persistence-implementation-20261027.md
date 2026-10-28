# D cleanup 持久化增量

这是实际实现中的私有候选，不是生产装配、已安装 migration 或验收通过。当前人类 owner 验证仍在使用 1,720 份冻结来源，本增量只写 docs/evidence，不修改该轮源码。

原文已给出实现依据，无需用户再选择清理起点：方案 336/806 定义 immutable task config 的 cleanup budget；234/632 要求首次自动 drill 在同一终态 CAS 写 succeeded、finished_at 和 cleanup pending；238/633/640 要求显式 retry 使用新 operation 及其从 created_at 起算的独立 deadline。backup staging 在成功终态前清理，必须新增稳定持久化起点，不能借用 finished_at、resource intent created_at 或 updated_at。

## 已写出的实现

- `d2-cleanup-clock-candidate-20261027.go.txt`：计划进入新的内部包 systembackupcleanup。校验原快照 size/hash，复用 A 的完整 ConfigValues decoder，拒绝非 canonical/缺字段/越范围；分别构造自动 backup、首次自动 drill、显式 operation 时钟。operation 校验 origin/type/父目标或资源目标，始终保留其原创建/期限窗口。接管只读同一 Clock，不提供延长期限接口。这些时钟事实不构成删除权限。
- `d2-cleanup-clock-tests-candidate-20261027.go.txt`：覆盖原始队列时间、不同预算、严格越期、不重置、跨安装/类型/目标、首次 drill 时间相等与非法 snapshot；目前仅 gofmt 解析通过，尚未执行 Go 测试。
- `d2-cleanup-attempt-ledger-candidate-20261027.sql`：选择追加式内部 attempt ledger 保存每资源每次清理的原时钟，自动尝试每资源至多一次，新显式 operation 追加新尝试。保存 parent/resource/config 原绑定；现有资源增加同安装复合唯一键，使用标准 FK。该 SQL 未进入 embedded catalog、未执行，不创建 grant。

## 同一增量必须继续完成

1. 在原受控事务内实现并重读验证自动清理 CAS 与 attempt 插入。首次 drill 同一 CAS 时钟；backup staging 在外部删除前持久化，不等待成功终态。重复自动请求读回同一原 record，不忽略重复键或刷新起点。
2. 显式 operation/retry 校验同安装、operation_type=cleanup、endpoint/target、原创建/期限、当前资源父关系及 retry 链；只允许原允许状态/row version，CAS 与所有资源的本轮绑定同提交。新 operation 不得使已成功删除的资源复活。
3. 保留原 claim/lease/fencing 和事务锁序。若进入 producer C1，原 L0–L10 不变，所有新增 FK/key 锁在原最终 CAS 前取得，不在 L10 补锁、外部 I/O、重试或新事务。
4. 在一个有界 read-only RR/UTC snapshot 中完整读取当前 parent/resource/最新 attempt，验证原 config bytes、分支与 operation 关系、时钟不漂移、上限/rows error/cancel/commit。旧活跃行没有 attempt 时拒绝未知，不以当前时间 backfill；首次自动 drill 只在能排除显式 retry 的原子分支建记录。
5. 残留介质通过绑定 resource/UID/version/marker 的只读可信 provider 事实接入。namespace 包含 PVC/派生 PV，不能由 namespace deleted 或 resource_type 推导无残留；缺事实整体拒绝，不能用空集合或 nil=false。
6. 新 FK/列必须同时更新 A 的 direct-reference catalog、GC closed metadata/reference collectors 与准确 owner/GC 回归；检查 task evidence references、control-table exclusions、retention/删除顺序、schema registry/catalog/grant 候选。ledger 保留原 attempts，GC 不能忽略它来删除 operation、task、config 或资源。
7. 当前原生轮结束后才准备准确新私有 source/window，执行针对性的完整新包/集成、受影响 closure、Linux 编译、后检和准确清理；通过 A/D 独立接收后再把增量落到 live，并刷新完整来源与 GC operator 版本。不能沿用当前 1,720 份回执批准未来字节。

仍缺的真实 provider 适配/现场介质证明，与 D 可独立实现的持久化、绑定和 reader 是不同交付；不再把后者笼统列为“等待用户设计”。此前 d2-original-input-dependency-audit-20261027.json 的首次阻塞观察由本次原文推导和实现进展取代，目标继续 active。
