# A→D/C：系统历史恢复授权接线草案（2026-10-09）

本草案只覆盖 `system/capability_snapshot` 原 evidence 的历史读取与 evidence-only 恢复。发起者是后台恢复工作负载。它不恢复原 producer 执行权，也不使用管理员会话、旧 grant、当前活动配置或历史绑定本身作为许可。

## A 已交付的事务输入

`SystemPeerAuthenticator.AuthenticateRequest` 验证独立 CA 与准确证书 pin，产生随 HTTP 请求结束而失效的 `SystemPeer`。`newSystemHistoricalWorkloadIntent` 将该身份绑定到一个待核对的原始 evidence ID、准确 scope 和 `Stat` 用途。D 在事务内提供锁定的 scope、evidence ID 与 `UTC_TIMESTAMP(6)` 后，A 调用 `intent.check` 重新验证证书、请求仍存活、身份摘要与用途绑定。返回的 `SystemPeerFacts` 和绑定摘要只是比对材料；它们不授予 SQL 或 S3 权限。

## D 需要冻结的当前授权记录与锁序

独立的后台恢复部署记录至少须持久化：scope、workload 身份摘要、证书/CA 准入摘要、issuer/subject、启用状态、单调递增撤销代次、当前允许的 `Stat` profile、授权截止、行版本。它须有独立管理/撤销路径；不得复用 producer domain/grant 的 active 状态或管理员 session 表。部署停用、证书轮换或撤销更新同一记录并推进代次，旧请求在下一次事务校验时失效。

在 `LoadHistoricalBinding`、`ClaimRecovery`、`FinishRecovery` 和相关历史收据读取中，D 的 L2 锁定该当前记录，读取数据库时间，并核对 A 的 `SystemPeerFacts`、scope、profile、状态、代次和截止。随后按 C1 的 L3–L8 顺序锁准确历史绑定、原 ref、claim、A registry 与有序 chunks；最终 Guard 只能复核此前已锁的当前授权与历史事实，不得新增业务锁。授权截止取当前部署、证书/准入、claim、对象保留截止及短操作预算的最早值。新恢复权限不得转换为 `ExecutionHandle`。

`LoadHistoricalBinding` 的输出应包含 D 已锁定且经当前授权校验的完整原绑定及仅供准确原 ref 的 `Stat` 上下文；不得返回 PUT/Range/Delete/Unwrap 凭据。`ClaimRecovery` 必须在数据库时间达到原 owner 写截止后认领，并拒绝仍有效的前一个 claim。`FinishRecovery` 只允许在相同 claim 和当前授权下按 C 证明收敛原 evidence 行及退避字段；不能修改 capability、health、observation 日期或重启 producer。普通 404、超时和无法验证的 provider 响应保留未知状态。

## C 需要冻结的证明

C 的独立受限通道只执行原 ref 的准确 `Stat`。证明至少绑定当前恢复授权/代次、scope、evidence ID、claim、原 provider identity/profile、原 key 与对象版本、预期 checksum/size、观察结果、观察时间与短截止。A/D 对 `match` 只能在完整比对和证明来源验证后接受；`mismatch`、`unavailable`、404 和超时不得伪装成匹配。C 需证明该身份无法取得 Range、PUT、Delete 或 Wrap 权限。

## 接线验收

1. 本地跨包测试：同一请求内匹配通过；跨 scope/evidence、JSON 构造、请求结束、证书轮换、部署停用/撤销、过期/回拨数据库时间拒绝。旧 grant 有效或无效均不能改变独立授权判断。
2. 真实 MySQL：旧配置停用后可按当前恢复授权读取原绑定；当前撤销及时拒绝；并发 claim 只有一个提交；L8 原 evidence 行锁等待；最终 Guard、审计或 CAS 失败完全回滚；未知提交仅按准确收据键查询。
3. 真实 provider：准确 Stat 匹配可收敛；404、超时、不匹配与证明过期保持可核验的失败/未知状态；同一恢复身份的 Range/PUT/Delete/Wrap 均被拒绝。

当前 D 的历史恢复事务、撤销候选记录和 A mTLS 原行重建已通过[隔离 MySQL 专项](system-backup-a-historical-recovery-mtls-mysql-handoff-20261009.md)。当前部署授权来源、独立管理入口、A 的非测试 `SystemHistoricalAuthority` 与 C 的受限 Stat 通道及真实证明尚未交付，因此本草案仍不授权开启生产恢复入口。
