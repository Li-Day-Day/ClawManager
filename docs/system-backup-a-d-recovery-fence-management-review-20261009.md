# A→D/C：历史恢复撤销管理与读取复审（2026-10-09）

## 结论

**A 暂不签收生产管理入口、读取入口或系统历史恢复启用。** D 的 `ChangeFence`、`ReadRecoveryFence` 与 L2 恢复撤销行是可审查的候选事务骨架；当前没有生产 `RecoveryFenceEnvironment`、`RecoveryFenceReadEnvironment` 或 `SystemHistoricalAuthority` 实现，也没有编号 migration。D-only MySQL 回执验证了候选 SQL 与竞争路径，管理认证、部署状态、审计容量及 C 的 Stat 证明仍是测试替身。

## 当前源码依据与待关闭项

1. **独立管理读写身份（P1）。** `RecoveryFenceRequest` 和 `RecoveryFenceReadRequest` 都只是目标/摘要；写入 `Authorize` 与读取 `AuthorizeRead` 必须分别验证当前、受信的管理主体。读取必须从新会话重新认证，精确绑定 scope、身份摘要、nonce、预算和请求 hash；不能继承写事务、管理员普通 session、旧 producer grant 或 `SystemPeerFacts`。当前源码仅定义回调，生产调用方不存在。D 需给出实际认证来源、读/写角色或权限、撤权记录、失效期限及事务内查询；A 复核跨 scope、读权限撤销、写权限撤销、提交不明后独立读取。`Found=false` 只能表示该准确键在已授权查询时缺行，不能证明此前管理写请求成功或失败。

2. **部署启用与撤销（P1）。** `LockInstallation` / `LockReadInstallation` 没有生产实现。L0/L1 应锁定准确数据库、installation 和独立的当前恢复部署准入（包括未初始化/缺行范围），校验 enabled、scope、工作负载身份、管理签发者、Stat profile、授权截止及单调部署版本。部署停用或撤销必须更新这一持久状态并推进版本；管理读写、历史 `load/claim/finish` 都在锁等待后与最终 Guard 中读回同一状态。旧配置停用不应误杀经当前部署授权的原历史读取，但旧配置、历史 receipt 或撤销表中 `revoked_at IS NULL` 均不能代替当前部署准入。

3. **证书/CA 轮转（P1）。** A 的 `SystemPeerAuthenticator` pin 精确 CA 与证书；其 `WorkloadIdentityHash` 由 scope、issuer、subject 得出，`ActorIdentityHash` 才包含 CA/证书摘要。因此同一 issuer/subject 的证书或 CA 变更可能保持撤销表键不变。轮转须由受信管理路径原子更新当前部署 pin/版本并推进撤销 epoch；新 subject/issuer 则应先撤销旧键、插入从未出现的新键，并保证旧 pin/旧请求在下一事务拒绝。`SystemPeerAuthenticator.Close` 只作本进程失效，不能充当共享撤销。D/C 需冻结双证书短暂并存是否允许、CA 过渡窗口、证书截止与部署截止取最早值，以及旧、新证书和旧 epoch 的竞争验收。候选 `rotate` 允许已撤销的同键重新准入；生产策略若保留该能力，必须要求新的明确部署授权和 epoch 比较，不能把撤销状态清除视为自动启用。

4. **L0/L1 与 L2 锁序（P1）。** 写路径当前为环境 `LockInstallation` → 旧撤销行 → 新身份行 → `Authorize`；读路径为 `LockReadInstallation` → `AuthorizeRead` → 撤销行；历史恢复在安装前缀之后锁 L2 撤销行。D 应提供三类路径的真实 SQL 锁表、缺行/范围锁、管理权限与部署行的锁位，并保证所有共享行按同一全局顺序获取。若 `Authorize` / `AuthorizeRead` 在 L2 才锁原应属于 L0/L1 的部署行，或与历史恢复反序，就不能签收。最终 Guard 只能读回已锁行，不得补锁或访问远端；隔离 MySQL 需覆盖管理轮转/撤销、读取与 `ClaimRecovery` / `FinishRecovery` 并发，以及缺行登记竞争和死锁后准确请求的恢复。

5. **`RecheckRead` 的当前状态来源（P1）。** D 的固定代码只重读撤销行及调用 `RecheckRead`；该回调没有默认查询。生产实现必须在同一 Repeatable Read 事务内读回 L0/L1 已锁的部署/证书准入行与 L2 已锁的管理读取授权行，比较版本、权限、请求摘要、当前 DB UTC 和最短截止。不可只检查传入的 `RecoveryFenceObservation`、进程缓存、启动时配置、原写会话或 HTTP 字段。若读取权限在等待期间被撤销、部署版本改变、pin 轮转或 Guard 失败，返回空观察值。写路径 `Recheck` 适用同样规则。

## 已验证与下一次签收所需证据

本次按工作树直接阅读 `recovery_fence.go`、`recovery_fence_read.go`、`recovery.go`、A 的 `system_peer.go` 与 `system_historical_recovery.go`、候选 DDL 和 D 回执；没有修改运行代码、安装依赖或生成构建产物。读取时文件 SHA-256 分别为：写路径 `f9b7887ce9bff1533d57d30440ab4531a6c08acc3f00e1c1c500303931866c46`、读路径 `39d5f637d8079f38f61b50840d0ecc9644f4bd4ad63ba1e86aaef0ee33553ad9`、A 历史适配 `48dc189d31d87a941595055813c9e7d83b64f5e7a267072870b1766d7ca66b9e`、候选 DDL `9e9a70d50c907e32943b4359713a777f7cfe258b5212dc3bcf916c917dac0aca`。这些是当前工作树的审查快照；涉及文件再次修改须重审。

[D 的九项隔离 MySQL 结构化回执](evidence/system-backup-d-recovery-fence-read-race-mysql-20261009.json)记录 PASS 和清理完成，但来源是用户粘贴的控制台输出，仓库无完整原始成功日志或独立最终 shell 退出码；其管理身份、审计容量和 C 证明为替身。A 的 mTLS × D 专项此前第一次断言失败、第二次在 ServiceAccount 创建前中止；[交接](system-backup-a-historical-recovery-mtls-mysql-handoff-20261009.md)尚无第三次成功回执。下一次签收需上述生产适配、编号 migration/inventory、真实 MySQL 的共同锁序/撤权/轮转测试，以及 C 对准确原 ref 的 Stat 允许且 Range/PUT/Delete/Wrap 拒绝的真实证明。完成之前，不启用恢复或管理入口。
