# A：GC 私有 finalizer 增量审查

2026-10-26，本地私有候选审查已收口。[最终接收](evidence/a-owner-final-local-accepted-20261026.json)绑定原 native 来源 `41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16`、完整两包 647 根/5,190 条原生事件、两位置各 13 seed、Linux probe/migration、独立复核与准确清理。当前来源 `2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0` 仅组合已独立补验的非 owner tagged drill 增量，GC 字节不变。下表保留各要求与对应运行验收条件；F1–F10 的本地候选条件均已在准确证据范围接收，未批准生产 Collect、真实 grants、完整 metadata 或实际 MySQL。

| 要求 | 当前静态核对 | 尚需运行证据 |
| --- | --- | --- |
| F1 原事实与准确绑定 | 真实 protected work 成功后才签发私有 completion；闭包保留原 scope、guards、reservation、worker/config/evidence/tombstone/absent keys、最后 SQL 样本和原 until。finish 比较原 context、tx、collector、operation。 | 错误 tx/collector/scope/context、零值在回调和 SQL 前拒绝。 |
| F2 单次使用 | completion 的副本共享同一 state；CAS 在绑定检查前消耗，失败不能通过原值或副本重试。 | 串行及并发副本最多执行一次检查；失败后不恢复消费位。 |
| F3 提交顺序 | 固定候选入口内部生成 work/finalize 回调；最后 ticket 查询之后调用捕获 finalizer，随后检查原 context，唯一 owner commit。调用方不能提供代用 completion。 | 真实 collector 模型中，ticket 后改变事实必须共同回滚；旧无 finalizer 行为的反例另行保存并准确说明来源。 |
| F4 原时限与时钟 | work 最后一次 `s.clock` 的返回值已写回捕获的 now；finalizer 不重算 until，不续期；最后再采原 SQL 时钟。 | 除低于早期 T0 的回退外，还须证明 T0 < T2 < 工作末次 T1 时拒绝；前进对照成功，原 until 等值及取消拒绝。 |
| F5 回调与独立检查 | guard/reservation/early/direct 事务内回调之后，独立复查原 worker/lease/deadline、config、保留 envelope、tombstone 和 absent keys；其后只做原时钟/取消检查。 | 回调晚改 worker 等事实不能越过独立检查；不增加 prefix、provider 或事务。 |
| F6 删除后状态 | 末次阶段不调用要求已删除原组仍存在的 `g.Recheck`；使用保留事实和原 absent-key 范围。 | 完整删除成功；authority/reference/ledger/worker/config/envelope/tombstone/absent-key 晚失败全部回滚。 |
| F7 事务和结果 | finalizer 不连接、不 Begin/Commit/Rollback、不解锁、不重试。原 Collect 仍走 capture=nil 的原 owner 路径，没有接入 freeze 候选。 | 同一物理连接、唯一事务与明确释放；保留未知提交不重试、不声称回滚的原结果边界。 |
| F8 输出保护 | completion 值/指针采用常量 String/GoString，JSON 拒绝。 | 对格式化和 JSON 的 sentinel 回归。 |
| F9 当前来源门禁 | 周五 r4 中断，不能作为当前完整通过；旧 5,138 条 inventory 逐名保留是后续完整门禁要求。 | 最终完整两包与新增用例、两位置各 13 seed、Linux owner probe/migration、来源后检、准确清理和独立登记。 |
| F10 当前 standalone 范围 | 通用 freeze protocol 的 optional callback 签名仅依赖 context/sql。当前入口明确扩为五份 Go 源：原 freeze/两份测试，加 finalizer/测试；不包含 concrete collector。旧四输入回执保留历史范围。 | 五显式标准库源的 Windows 全测试与 Linux 编译；具体 collector/finalizer 组合另外用完整包验证。 |

## 已反馈的边界

A1 初读发现 `reflect.TypeOf(v).Comparable()` 无法保证 interface 字段中的动态值也可比较。带 slice/map 的值 context 可以委托合法原 context，却在接口相等比较时 panic。当前实现已改为 `reflect.Value.Comparable()`，并增加动态不可比较原 context 和替换 context 的拒绝用例。没有将工作稿问题称为已启用的生产漏洞；准确最终源码和测试仍需复核。

A2 独立要求精确覆盖末次工作样本 T1 与 ticket 后 T2 的中间回退，而非只测试低于最早 T0。当前模型已增加推进最后工作样本及回退/前进对照；须由最终原生结果确认实际命中了该位置。

第一轮定向诊断的 capacity 用例失败被保留。它修改新的报告文件，但容量 reservation 的既有合同固定原 report 与原 until，Recheck 检查同事务 ledger，不重新采样报告。当前测试已改为破坏原 reservation 的 floor、outstanding/sample；没有为这个夹具改变生产容量守卫或续期原报告。

## 未批准范围

即使上述私有算法和本地测试通过，A-GC-WORK-01 的生产装配部分、A-GC-WORK-02 的准确 worker/observer 权限与授权来源、A-GC-WORK-03 的完整 metadata/等待关系、A-GC-WORK-04 的真实十二组协议、释放/接管和物理容量仍需要原事实及联合验收。旧通用 freeze helper 的合成 allow 回调不是生产 Policy；新的私有候选也未接入生产 Collect。
