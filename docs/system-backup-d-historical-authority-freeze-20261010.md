# D→A/C：历史恢复当前授权与全局锁序候选（2026-10-10）

状态：**待 A/C 签收的 D 接线合同**。本文把 [A 的五项复审意见](system-backup-a-d-recovery-fence-management-review-20261009.md)落实为可实现、可逐项验收的选择，并吸收 [A 的 10 月 10 日复审](system-backup-a-d-historical-authority-review-20261010.md)中的身份列与 epoch 绑定意见；生产管理事务拥有者仍待确定。它不表示候选表已获批准、生产适配已存在或恢复入口可以启用。现有 `ChangeFence`、`ReadRecoveryFence`、`HistoricalRecovery` 和 A 的 mTLS 组合层继续失败关闭。

## 1. 当前记录与身份

按 `Scope` 的准确 database、server UUID、installation 构造已存在的 `scope_key`。新增**候选**的当前恢复部署行，以 `scope_key` 为唯一键，至少保存：`origin_installation_id`、`workload_identity_hash`、`issuer_identity_hash`、`subject_hash`、管理签发者的 issuer 摘要、`actor_identity_hash`、`admission_hash`、精确 CA 与证书 SHA-256、`stat_profile_hash`、`enabled`、`deployment_epoch`、`authorized_until`、`row_version` 和更新时间。`subject_hash` 使用 A 的 `SystemPeerFacts.SubjectHash`：准确 UTF-8 subject 在 `system-backup-recovery-subject.v1` 域内的 JSON 字段摘要；其他身份摘要同样沿用 A 的 `SystemPeerAuthenticator`。数据库不得从 HTTP body、证书 CN 或旧 producer grant 重新派生身份。`actor_identity_hash` 随 CA/证书变化，`workload_identity_hash` 在同一 issuer/subject 下可以不变。`stat_profile_hash` 只标识 C 签收的准确原 ref 只读 Stat profile，不是 provider 凭证。

另设**候选**的独立管理主体行，以 `(scope_key, management_identity_hash)` 为键，保存受信认证来源/issuer 摘要、明确的 `read_fence` / `write_fence` / `manage_deployment` 权限位、`enabled`、`authorized_until`、`row_version` 与撤销时间。A 已选择独立、精确 CA/证书 pin 的管理 mTLS `RecoveryManagerPeerAuthenticator` 作为认证来源：`RecoveryManagerPeerFacts.IdentityHash`、`IssuerIdentityHash`、`CredentialBindingHash` 与截止在每次新事务及最终 Guard 中同当前已锁管理行核对。身份和凭据摘要分别使用 A 的 `system-backup-recovery-manager.v1`、`system-backup-recovery-manager-credential.v1` 域；mTLS proof 本身不含权限位，也不能转换成恢复工作负载身份。管理主体不得来自普通管理员 session、`SystemPeerFacts`、原 producer domain/grant 或请求字段。撤销写权限不得同时撤掉执行紧急撤销所需的独立审计容量和 break-glass 管理路径；这两项的存储与权限由 A/D 单独评审。[两张表的候选 DDL](../contracts/system-backup/v12/producer-recovery-authority-candidate.sql)固定了可评审的列、主键、安装外键和基本 CHECK；首次管理主体注册的上级权限链、授权写入 SQL 与执行计划仍待签收。

现有 `system_backup_producer_recovery_revocations` 继续是第二道 L2 精确门禁。仅撤销行 `revoked_at IS NULL` 不构成部署许可。原配置停用不自动撤销历史读取，但当前部署 `enabled=false`、缺行、身份/pin/profile/版本不符或到期一律拒绝。三类候选记录均不进入 080、only-080 或现有 inventory；A/C 签收字段、权限和查询后，另行编号 migration 与 inventory 变更。

## 2. 所有路径共享的锁序

同一 MySQL Repeatable Read/UTC 事务中，先沿用 A 已有的安装锁顺序：`SELECT origin_installation_id FROM system_backup_installation_state ORDER BY origin_installation_id FOR UPDATE`（有界扫描、关闭结果集），再以 `origin_installation_id=? FOR UPDATE` 锁准确 installation 行作为 L0 父锁；D 的事务执行器已单独核对 `@@server_uuid`、`DATABASE()` 与 Scope，并要求数据库 UTC。扫描中找不到准确 installation、结果超过既有限额或第二次读取不一致时失败关闭，不能在恢复/管理调用中隐式建立安装。L0 锁使同一 scope 的部署/管理/撤销**缺行登记**串行化；生产 SQL 和执行计划须证明这一点，不能仅依赖对缺行的 `SELECT ... FOR UPDATE`。之后固定顺序：

| 位次 | 锁定对象 | 缺行与版本规则 |
| --- | --- | --- |
| L1a | 当前恢复部署行 | 恢复必须存在且 enabled；已授权的管理读取、停用和撤权可观察 disabled 行，但不能借此取得恢复许可。部署首次注册只允许独立管理事务在 L0 下插入，期望版本 0。每次检查准确 `scope_key`、身份、pin、profile、epoch、row version 与数据库 UTC 截止。 |
| L1b | 当前管理主体行 | 管理读/写/部署变更按身份键锁行并查相应权限；恢复工作负载不锁管理行。不存在时拒绝，管理主体注册须另走受审的上级授权流程。 |
| L2 | 旧撤销行，再到新身份行（如有） | 恢复只锁准确当前身份；写管理沿用 D 的旧→新顺序，读管理在 L1b 后锁目标。缺行只可用于已授权的首次登记；旧 hash 永不复用。 |
| L3–L10 | 原历史绑定、ref/hold/GC、容量、审计、A 原 evidence/chunks、结果审计、FinalGuard | 沿用 `HistoricalRecovery` 的既有顺序；任何 provider 网络调用必须发生在事务外。 |

`RecoveryFenceSession.LockInstallation` **必须一次取得 L0、L1a、L1b**；现有 D 写路径随后先锁 L2、才调用 `Authorize`，所以后者只能验证已锁行与准确请求摘要，不能补锁部署或管理行。`RecoveryFenceReadSession.LockReadInstallation` 同样取得 L0/L1a/L1b；`AuthorizeRead` 不得引入较早位次的锁。`HistoricalRecoverySession.LockInstallation` 取得 L0/L1a，`Authorize` 在检查 A 的当前 mTLS facts 后锁 L2。部署启停、pin/profile 轮转、管理权限撤销也必须遵守 L0→L1a→L1b→L2，按实际访问的子集前进，不能反序。管理主体首次建立与 L0 父锁的权限链尚须 A 审查，不由普通管理请求自举。

最终 Guard 只重读此前锁过的部署、管理、撤销和历史行，核对版本、权限、完整请求摘要和新的 `UTC_TIMESTAMP(6)`；不得补锁、查远端或用进程缓存代替当前状态。`RecheckRead` 须读回 L1a/L1b；`Recheck` 须读回 L1a/L1b；历史恢复 `Recheck` 须读回 L1a/L2。当前 D 回调没有默认 SQL，未接生产实现时均为不可用。提交确认不明时不返回授权行或恢复 claim；后续只能启动新的、独立授权的准确读取，不根据 `Found=false` 推断上次提交结果。

## 3. 启停、证书轮转与撤权

生产策略选择**单一当前证书/CA pin，不设双证书并存窗口**。精确 CA/证书 pin、`actor_identity_hash`、`admission_hash`、部署版本和撤销 epoch 在同一事务更新；旧 pin/旧 epoch 在下一个事务拒绝。证书截止、部署 `authorized_until`、管理身份截止、请求短预算、claim/保留截止取适用项中的最早值；所有事务使用数据库 UTC 再检查，不能通过延长请求预算刷新原截止。

**epoch 绑定规则：** 当前部署行的 `deployment_epoch` 必须等于当前 `workload_identity_hash` 的 L2 `revocation_epoch`，包括 disabled/revoked 状态；首次注册两行都为 1。每次启停、同身份 pin/profile 轮转、换身份或紧急撤权都在同一事务中将两者推进到相同的新 epoch，部署 `row_version` 另行递增。换身份时旧 L2 行以新 epoch 撤销，新身份行以同一新 epoch 首次登记，部署改指新 hash；旧 hash 不复用。`RecoveryAdmission.RevocationEpoch` 只从已锁的准确 L2 行取得，并与已锁部署 epoch 比较；L10 再比较原代次、当前双行代次及部署行版本。C 的准确 Stat 证明同时绑定部署 epoch、L2 epoch、部署行版本、profile 与 pin；缺任一项或两 epoch 不等一律不能导出 ready。A/C 需审此 proof 形状，当前代码和测试替身尚未实现完整比对。

- 同一 issuer/subject 换证书或 CA：L0→L1a→L1b→L2 下核验明确的 `manage_deployment` 与 `write_fence` 授权，更新部署 pin、actor/admission 摘要及版本，并用现有 `rotate` 精确 CAS 将同一 workload 撤销 epoch 加一。仅当新 pin 和新 epoch 同事务提交才重新准入。已撤销行不得因单独 `rotate` 自动启用部署。
- issuer/subject 改变：在同一事务撤销旧 hash，给从未出现的新 hash 登记下一 epoch，更新部署当前 hash/pin/profile 与版本；旧 hash 不复用。任一步失败整体回滚。
- 停用或紧急撤权：在 L0→L1a→L1b→L2 下停用部署、推进部署版本和撤销 epoch，保留原历史/evidence 不变。跨进程共享状态以已提交数据库记录为准；`SystemPeerAuthenticator.Close` 仅是本进程失效。
- 恢复准入：A 的 mTLS `SystemPeerFacts` 与已锁部署行逐字段核对，再检查 D 的 L2 撤销 epoch。`load/claim/finish` 均如此；旧配置状态和旧 grant 不参与授权。C 的 Stat proof 必须绑定同一部署 epoch、准确原 ref、profile、版本/checksum/size、观察时间与短截止，且只允许 Stat。

上述组合事务**尚不能由当前 `ChangeFence` 单独完成**：它只更改 L2 候选行。部署状态/pin/管理权限的写入必须由同一事务拥有者实现、审查与测试；在此之前不能把分别提交的 `ChangeFence` 与部署更新称为原子轮转或共享撤权。

## 4. A/C 签收清单与验证

| 签收方 | 必须明确的交付与判定 |
| --- | --- |
| A | 管理读/写/部署管理身份的实际认证与撤权来源；管理主体注册的上级授权；部署行与 mTLS facts 的逐字段比对；同事务 pin/epoch 轮转；`SystemHistoricalAuthority` 的非测试实现及 L1/L2/Guard 当前 SQL；准确请求结束、到期、跨 scope 与旧配置场景。 |
| C | 单一 pin/CA 过渡策略是否可接受；准确原 ref 的受限 Stat profile 与独立证明形状；同一身份 Range/PUT/Delete/Wrap 拒绝；profile 轮转如何使旧证明失效。 |
| D | 候选部署/管理记录的 SQL、索引、CAS、缺行父锁和 inventory 草案；将三条现有 session 接到统一锁序；部署与撤销原子更新；独立审计容量；默认关闭入口。 |

签收后的验证至少覆盖：管理读/写权限分别撤销、部署停用、同身份和换身份轮转、旧 pin/epoch 请求、L0 缺行并发登记、管理轮转/撤销与 `ClaimRecovery`/`FinishRecovery` 及独立读取竞争、死锁后准确请求重试、FinalGuard/审计/CAS 回滚、COMMIT 回包丢失，以及真实 C profile 的 Stat 正例和 Range/PUT/Delete/Wrap 负例。隔离 MySQL 测试须报告完整原始退出码、SQL/二进制/DDL 指纹、namespace UID 和全部清理结果；既有九项 D-only 及 A mTLS 专项回执保留原范围，不重复算作生产签收。

在 A/C 确认本合同、生产适配和编号 migration/inventory 完成前，已通过的 Schema 专项只证明候选表的物理约束；新增 Manager 专项需单独远程验证 L1b SQL。D 在执行前给出从仓库根目录运行的完整 PowerShell 命令、固定输入、PASS/清理判据，再暂停目标等待回执。

## 5. L1b 当前行校验进展

D 已增加 `RecoveryManagerRowGuard` 候选组件：由上层先持有 L0 和所需 L1a 锁，组件再按准确 `(scope_key, management_identity_hash)` 锁 L1b 行，核对安装、issuer、凭据绑定、enabled、撤销时间、数据库 UTC 截止和独立权限位；最终 Guard 只复读该行并拒绝版本或权限漂移。本地脚本 SQL 定向测试已通过。它要求调用方每次重新取得 A 的受信 `RecoveryManagerPeerFacts`，自身不负责 mTLS，也不负责首位管理者注册、独立审计容量或 L1a/L2 原子写入；尚未接到生产 `RecoveryFenceSession`/`RecoveryFenceReadSession`。

新增隔离 MySQL 的 `Manager` 专项只验证该 L1b 候选 SQL 与真实表的匹配、权限拒绝及回滚。操作者第二次远程回执已 PASS，完整判据与第一次夹具失败记录见 [交接](system-backup-d-recovery-manager-row-mysql-handoff-20261010.md)和[结构化证据](evidence/system-backup-d-recovery-manager-row-mysql-20261010.json)；这不构成生产授权签收。
