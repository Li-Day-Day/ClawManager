# D：已提交 bootstrap candidate 的同事务消费提案

状态：A/D 本地接口提案，尚未实现、批准或接入生产。它回应既有 C1 `result_projection.unconfigured` 和 `existing_entry_changes(config_bootstrap_transaction.go)`，不是新的 grant、wire enum 或部署许可。本轮已签收的 GC/owner 路径不覆盖此项。

分工：D2 负责 producer 消费实现和共同前缀；A2 负责具体可信关系绑定/adapter 与拒绝模型；A1 负责原 OfflineBootstrapGrant、期限和 bootstrap service 集成审阅；D1 按 BC1–BC12 独立审查。合同明确前不修改受测 backend/contracts/scripts，也不触碰其他活跃测试 owner。

## 阶段与已有实现

消费对象是已提交的 `ReceiptRecord.Request` / `ResultRequest`、原历史 binding 和 `bootstrap_candidate` 引用。`resultPolicy.write` 已令 run 为 committed；不能重新使用 `ExecutionHandle` / `CallSnapshot`，也不能放宽 `executionPolicy` 对 committed 的拒绝。

复用 `Transactions.GuardInTx`、`Transaction` 的失败锁存、`LockedRecord` 及已有 CAS/记录 codec；不新建并行事务 runner。`HistoricalReceiptReader` 只有历史读取权限，`DomainRevoker.RevokeDomain` 自管事务，二者均不能代替本次当前授权和原子 epoch close。

建议新增的 Go 接点（以下名称是接口草案，不表示仓库已有符号）：

1. `NewBootstrapCandidateConsumer(scope, trustedAuthority)`：受信装配固定 A 的具体 authority/关系 adapter。没有 default allow，不接收调用者提供的 `Policy`、approved 布尔或新 grant 文件。
2. `PrepareBootstrapConsumption(ctx, selectedResults)`：校验完整 C1 typed requests 和 digests、取得原 A grant/config/用途关联及有界排序锁计划，返回 D 签发的私有 prepared 对象。外部观察只在锁前完成；结果/范围提示不是授权，事务内仍逐项认证。
3. `ConsumeBootstrapInTx(ctx, tx, prepared, bootstrapWork)`：必须由 A 的唯一事务 owner 在 L0 之前调用；内部使用固定的消费 policy 和 `GuardInTx`。`bootstrapWork` 是受审 A service 的写入阶段，不是 HTTP/JSON 注入点。它包含全部 config/installation/operation/audit 写入；返回后固定 final guard 复核预期关闭状态，A 只检查原 context 并执行唯一 commit。

prepared 副本共享一次性状态，绑定原 service/context/scope；首次进入绑定唯一 tx。错误、取消或失败后不可重用，不以新 context/新 until/重新查询到的候选替换原事实。值/指针格式化为常量，JSON 拒绝。结果只返回原 A `ConfigBootstrapResult`，不返回 producer 执行 handle。

## 必须由 A 认证的原关联

建议采纳 A2 的映射方向，但须 A1/A2 明确准确 bytes 规则后实现：CandidateHash 对应原 `BootstrapConfig.SHA256()`；RegistrySetHash / RefSetHash 对应该配置固定两数组的准确 canonical bytes，不能把不同编码的“相似摘要”当相等。

DeploymentAdmissionID 只能来自原独立认证并持久化的 domain admission/provision 权威来源；不是 g.IdempotencyKey，也不从候选正文或 HTTP 选择。原配置与 OfflineBootstrapGrant 的全部语义、数据库/installation、purpose/ref identity+version、policy/profile、角色/完整 slot 集须由原 A 来源分别认证。当前来源未证明关联时拒绝，不能为跑通而新造授权材料。

用途关联必须保留到幂等身份：按明确键序列化每个 A purpose/ref identity/version/原 mapping digest 与对应 producer scope、target hash、receipt key、完整 request digest、result version。不能只对无用途关联的 receipt 集合求 hash；拒绝重复用途键、静默去重、最后项覆盖和未声明的多用途别名。若同一 candidate 可覆盖多个合法用途，由 A 的原受审关系明确允许，不能由调用者列出 alias 自批。

## 一次性共同锁前缀

当前 bootstrap 的 L0 → user(L2) → operation(L3) → config absence(L1) 不可直接后插 producer L1。候选消费路径须在 A 先锁 user/operation 前接管共同顺序，所有候选做一次 union 计划，不能逐候选反复取得完整前缀。

| 层 | 由 D/A 共同提前锁定的准确范围 |
| --- | --- |
| L0 | 复用全 installation index 行及空范围，按 installation 顺序；不得只读一个存在行代替缺行范围。 |
| L1 | 目标 installation/config v1 的存在或完整缺失范围（含 orphan config），再锁该 scope 的 producer domain PK/缺失范围。新消费要求原 unconfigured open domain；缺 domain 不伪造默认行。已有 all-inline 路径不强制创建 producer domain，是否需要关闭已存在 domain 须按实际选用 profile 明确。 |
| L2 | A 原 offline/admin/RBAC 当前权限与撤销范围；producer 原 deployment/issuer/subject 的适用身份范围。锁键从原可信计划取得，不能读到新 ID 后补早层锁。 |
| L3 | bootstrap actor/endpoint/idempotency key、已预生成的新 operation public-id 缺失范围，以及全部候选 result receipt 的 scope/key，稳定 type/key 排序。此层区分历史成功重试与首次消费。 |
| L4 | union 的 grants、runs、immutable evidence bindings/history、host identity；按既有 record 类型与 key 排序，不按输入顺序。 |
| L5 | 全部 target generation / current-run 键；`bootstrap_candidate`、`producer_receipt`、`hold` 的 scope/evidence/kind/key 范围及原保护时间；A 原 typed refs/nonce/相关 legacy keys 的共同 union。 |
| L6 | 原物理容量样本与 metadata reservation id=1；样本锁前采集，期限不在事务内刷新。 |
| L7/L8/L9 | 全部 actor/FK 已在前层锁定；intent audit，原 evidence public-id/chunk-index 顺序的 ready/no-claim/完整 manifest 内容检查，后续 result audit。其他资源 adapter 必须在进入后层前完成其前缀。 |
| L10 | 只写前面已经锁定的 keys，复查原事实/预期后态、SQL 时钟和原 context，然后由 A 唯一 commit；无新范围、provider/network/file 观察或新事务。 |

所有 C1 records 都使用现有 `(scope_key, primary-key...)` codec 并核对原 record bytes/columns。receipt 必须 found、完整 request/key/hash/result version 相同；run=committed，history/target generation/current-run 与原 request 一致；不得以调用者声明的 successful/healthy 或重新摘要的替代 payload 认证。

## 时间分类：禁止复活，也禁止随意缩窄

下表是拟议消费语义，等待 A1/A2 逐项确认后进入实现；不能以一个保守 min 偷换合同。

| 时间/状态 | 首次 committed-candidate 消费 |
| --- | --- |
| 本次独立 OfflineBootstrapGrant 的 not-before/expiry、当前 admin/RBAC/deployment 权限 | 当前必须有效，捕获本次原界限，后置复查；取消/截止等值拒绝。 |
| 原 domain admission、原 observation/资源依赖、evidence/receipt/ref/hold retention/protection | 原事实和适用当前授权必须有效；使用原 observation 时间和闭集期限，不重探测/重新签发，不延长原界限。 |
| 原 producer 执行 lease / 调用授权 deadline / owner-write 或 publish claim budget | 原结果必须在当时合法提交；这些不是新的 bootstrap 执行许可。拟不因仅时间经过而拒绝一个仍有效的 committed observation，也不允许借此恢复原执行。 |
| 显式撤销/supersede、domain epoch、grant generation、target generation/current-run 冲突 | 拟拒绝；允许与执行权限无关的合法历史结果读取不等于允许新消费。哪些更新只改变原执行预算、哪些改变原授权身份，由 A/D 明确字段级规则。 |

SQL 时间必须记录原事务内已成功观察到的最大样本，包含 GuardInTx 的各次采样和具体消费 policy 的采样。拟在现有 Transaction 内共享私有单调时钟记录，由 GuardInTx 和消费 policy 共同使用；不另造 runner，也不只检查低于第一样本的回退。固定最终采样必须在全部 callback/写入/独立事实核对之后。

## 写入、最后守卫与重试

新消费在同一 tx 中写 disabled config v1、installation、原 bootstrap operation/双 audit，并以原 epoch/row-version CAS 令 domain closed、epoch+1、row-version+1；不无界更新 child grants，不写 live provider/dependency 投影。

建议保留原 immutable result/history 及三类 candidate/receipt/hold 引用和原 protected-until，作为历史保护；“消费”由 disabled-v1 bootstrap 成功与关闭的原 domain epoch 原子确定，而不是删除证据或伪造新引用类型。该处亦须独立评审，不从旧 draft 文本推导未声明的新存储字段。

所有 A resource/authority/capacity callbacks 先完成，再固定独立检查原 receipt/history/evidence/ref/observation、原 actor/grant 映射，以及**合法预期的** closed-domain、新 config v1 disabled、operation/audit 后态。不能用“仍须 open/absence”的旧 guard 误拒合法自身写入，也不能关闭后跳过原证据。最后 SQL 时间/context 后不得再调用 adapter。

原 inline 路径保留原 grant-only request hash。新候选路径建议在现有 operation.request_hash 中使用独立内部编码域，覆盖原完整 grant + 上述用途关联的完整消费项，而非新增 operation enum/SQL 列/grant；精确编码与旧路径隔离须 A1 审阅。prepared 中用于缺行锁的新随机 operation ID 不进入幂等 hash；未知提交按稳定原 key 读回，不生成新请求身份。

L3 找到同一原 hash 的成功 operation，且 A 独立当前授权及精确 v1 disabled/config hash 满足既有重试规则时，只读返回原结果；不再次消费、不增加 epoch、不刷新 observation，不从当前 target 重新选择另一 candidate。不能要求原已消费 observation 永久未过期才能读取历史成功，也不能因一个历史 receipt 自证当前读权限。候选集合的原可信选择必须可稳定重建，若现有 A 来源无法保存/认证这个关联，先关闭该合同缺口，不能用当前最新 run 猜原请求。

## 开始 Go 实现前的确认项

1. A1/A2 确认上述可信映射、两数组 canonical hash bytes、完整用途关联与允许 alias 的来源。
2. 确认时间表及 grant lifecycle 字段比较，特别是执行预算过期与显式撤权的区别。
3. 确认 request_hash 的新路径内部编码域/旧路径兼容、原选择重建与只读重试，不新增未审存储或 wire 类型。
4. D1 审查 union 前缀、expected-post-state 与 BC1–BC12 反例；A/D 再明确对应具体 Go 文件和 native 门禁。当前 2099 只背书现存路径，此消费尚未完成。
