# A 对 D 历史恢复当前授权候选的复审（2026-10-10）

状态：**changes requested；不签收生产部署/管理表或开启历史恢复入口。** 本复审仅针对 D 的 [当前授权与全局锁序候选](system-backup-d-historical-authority-freeze-20261010.md)和[候选 DDL](../contracts/system-backup/v12/producer-recovery-authority-candidate.sql)。A 的 mTLS 请求绑定和 D 的既有恢复专项已分别通过隔离 MySQL；其部署、管理身份、C Stat 证明仍为测试替身，不能扩展为生产验收。

## 需冻结的三项接口

1. **部署身份列与来源一致。** 文档说存 subject 的不可逆摘要，DDL 却存 `subject VARCHAR(255)` 原文。A 已在 `SystemPeerAuthenticator` 提供受信 `SubjectHash`，计算为准确 UTF-8 subject 在 `system-backup-recovery-subject.v1` 域内的 JSON 字段摘要；建议 DDL 改存其 32 字节二进制值，并冻结编码与比对规则。A 的 `SystemPeerFacts` 同时提供受信 CA/证书 SHA-256 与 workload/actor/admission/issuer 摘要；不能从 HTTP 输入补齐。准确 scope、installation、全部身份摘要、pin、profile、enabled、截止、部署 epoch 与行版本均要在同一已锁行核对。
2. **部署 epoch 与 L2 撤销 epoch 的绑定。** 候选部署表和既有撤销表各有 epoch。首次注册、同身份换证书、换身份、停用与再启用应明确两者的关系及 CAS 预期；`RecoveryAdmission.RevocationEpoch` 必须来自已锁的准确 L2 行，最终 Guard 比较原代次与当前代次。若部署 epoch 用于 C proof/profile 失效，还需规定它如何进入准确 Stat 证明，不能只检查一个表的版本。
3. **管理入口和原子写入拥有者。** A 选择独立、精确证书/CA pin 的管理 mTLS 身份作为管理请求认证来源，并已提供 `RecoveryManagerPeerAuthenticator`。其身份和凭据摘要在 `system-backup-recovery-manager.v1` 与 `system-backup-recovery-manager-credential.v1` 域内计算；请求绑定证明不含读/写/部署权限，不能转换成后台恢复工作负载身份。D 的当前管理行须在新事务内按准确 scope、身份摘要、凭据摘要、issuer、截止及独立权限位重新核验和撤权。`ChangeFence` 单独不能原子更改 L1a 与 L2；仍需确定生产事务拥有者、首次管理主体注册的上级权限链，以及紧急撤销的独立审计容量。`LockInstallation` 必须在 L0 下锁 L1a/L1b，后续回调不得补锁早期行；D 应给出实际 SQL、缺行父锁和执行计划。

## A 当前实现与下一步

A 的 `system_historical_recovery.go` 已将工作负载身份、准确 evidence 和 Stat 用途绑定到请求，并让 D 的 L2 授权与 L10 Guard 调用受信回调。本轮额外拒绝没有正数撤销代次、身份或部署截止已过的授权，在 Guard 前复查两个截止；`system_historical_workload.go` 的 v2 绑定加入 subject 与 CA/证书 pin 摘要。这些只是对受信身份和回调输出的失败关闭检查，**不替代**当前部署行的 SQL 准入或 C 的证明。

待上述接口和 C 的受限 Stat profile/独立证明签收后，A 实现生产 `SystemHistoricalAuthority`：L1a 已锁部署逐字段核对、L2 当前撤销、准确原历史引用/容量/审计委托、L10 同一行及版本复核。原配置停用不影响已获当前部署许可的历史读取；当前部署停用、证书轮转或撤销必须拒绝旧请求。随后先做本地跨包检查，再提供新的隔离 MySQL/真实 provider 完整命令交操作者执行；既有成功套件不重跑。

## D 修订后的 A 进展

D 的候选 DDL 已将 subject 改为 `BINARY(32)` 的 `subject_hash`，并加入独立管理 issuer 与 CA/证书 pin 列；合同已写明部署 epoch 与准确 L2 epoch 同事务保持相等。A 据此新增 `SystemHistoricalDeploymentGuard`：在同一事务按 L0 有界安装扫描、准确父行、L1a 当前部署行的顺序锁定，逐字段核对受信 mTLS facts、profile、epoch、截止和版本，在 FinalGuard 复读同一行并拒绝漂移。本地脚本 SQL 测试覆盖正常准入、subject/证书/epoch/截止不符以及停用、版本和 subject 漂移；`GOPROXY=off` 定向测试通过，隔离缓存已删除。

上述是**候选行校验组件**，尚未接入生产 `SystemHistoricalAuthority`。原复审中的管理事务拥有者、首个管理主体的上级授权、C Stat 证明和正式 migration/inventory 仍未签收；因此本页生产入口结论不变。已接收的 A mTLS × D 历史事务隔离 MySQL 回执单独记录在 [远程交接](system-backup-a-historical-authority-remote-handoff-20261010.md)，不能据此替代新表的 MySQL 验证。
