# A2：finalizer 工作末次 SQL 时间下限复审

2026-10-26。这是对 D 正在实现的私有候选的增量静态意见，尚无本问题的 Go 反例运行或最终版本接收；不声明已启用的生产漏洞。D 的并行实现已将工作末次成功采样赋回 `now`，本项当前为“源码已体现要求，回归与准确版本接收待验”。

## A-GC-FINALIZER-01：捕获工作阶段最后成功采样值

首次读取的中间版本在 `collectProtectedWork` 删除后独立检查末尾调用 `if _, err = s.clock(ctx, tx, now, until)`，丢弃返回时间；随后签发的 finalizer 以较早的 `now` 为下限。落盘前再次核对时，D 已改为 `if now, err = s.clock(ctx, tx, now, until)`。本对话没有冻结首次中间版本的完整字节，不生成其准确源码胶囊或声称旧反例已经运行。`downloadIntentNow` 只拒绝低于所传 floor 的时间，因此捕获最后成功样本仍是必须保持的要求。

待验证的具体反例：删除后最初采样为 T0，工作末次采样已推进到 T1；最后 ticket 查询后，SQL 时间回退到 T2，满足 T0 ≤ T2 < T1。若 finalizer 仍以 T0 为 floor，就会接受 T2。所有样本可以相差毫秒、均处于原有效期和五秒新鲜度内，其他授权/容量/行身份也均不变化，因此原 until 和 host skew 检查不能覆盖这个回退。

必须将工作阶段末次成功 `s.clock` 的返回值捕获为 finalizer 的原时间下限，不能只保存末次检查之前的 `now`。例如将该次结果赋给原局部时间，或单独的不可替换捕获值；错误仍按原路径拒绝。不要增加续期、扩大时钟容差或改写原 until。

要求用实际 collector/state 模型验证上述 T0/T1/T2 对照：旧候选应暴露回退未拒绝，修订后应在提交前拒绝并共同回滚原删除、审计、nonce、tombstone 与容量；T2 ≥ T1 且原期限内的正例仍成功。测试应证明工作末次时钟确实达到 T1，避免只测试低于 T0 的既有拒绝。

此处是新增 finalizer 的有意时间事实传递修订。后续来源接收应准确登记这个差异和新验证，不应为维持旧“受保护正文逐字不变”断言而保留错误下限，也不把旧冻结回执扩大为新算法已通过。A-GC-WORK-01、F1/F4 与完整 owner 门禁均须以修订后的准确版本另行接收。

其他已读静态方向：finalizer 的副本共享原子消费位，错误调用也消耗能力；它绑定原 context、事务、collector 和 operation。后置闭包保留原 guards、reservation、worker/config、envelope、tombstone、absent keys 和 until，回调之后仍独立核对这些事实；这些方向不替代最终源码和运行证据复审。
