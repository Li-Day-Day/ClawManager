# D → A/C：backup KEK 持久化、首次准入与锁协议

状态：D 实现交接，代码实现与验收尚未完成。输入为公共 C `f079600e` 的 mapping/retained 闭集提案；保留现有 `reference:kek`、BootstrapAdmission、ConfigMutation、原 Job/producer/recovery 授权。本文不登记现场 key、不签发 execution grant，也不声称 B frozen writer 或四类完整 scanner 已交付。

## 1. 存储决定与首次登记

现有 `system_backup_v2_configs.kek_identity_hash/kek_ref_version` 继续是配置选择的 pin；原 installation/config/operation/audit 事务继续拥有准入。现有表不保存完整 KEK 映射，D 将在同一 v2 控制域追加存储，不能把 provider profile SHA、key 名或 numeric version 生成新的 identity。

新增 `127_backup_v2_kek_registry.sql`；126 已由 native gateway proofs 使用，不覆盖。当前 Store 仍在本地实现和验证，不能作为已部署 schema。五张控制表如下：

| 存储 | 内容与约束 |
| --- | --- |
| `system_backup_v2_kek_fences` | 每个 installation 的稳定 fence 行及单调 epoch；所有 mapping/admission/reference/coverage/撤销变化都在同一事务推进它。coverage 保存四类原 adoption/source receipt 引用，不使用 `complete=true`。未完成历史回填/所有写入口接入时不提供完整扫描能力。 |
| `system_backup_v2_kek_bindings` | PK 为原 installation + identity_hash + opaque registry_version；不可变核心包含完整 KeyBinding、provider endpoint/key_name/provider identity/scope、CA SHA 与不可变 ca_source、generate_ref/unwrap_ref 原字节及摘要。核心 canonical bytes/hash 永不 UPDATE；同 key 不同核心拒绝。当前 write/unwrap 撤销各有独立 revision/source，不能由 write 撤销推导历史 key 可删除。 |
| `system_backup_v2_kek_admissions` | 独立保存 config_sha256、source_revision、原准入 operation/config 关系与 A 认证的观察来源/有效窗口，指向不可变 binding。多个配置可以引用同一 binding；这些变化不算重绑定，不能混入核心 hash。无原已提交 config/operation 关系的候选记录不得被生产组合消费。 |
| `system_backup_v2_kek_coverage` | 分区及原 source/adoption receipt；每类来源须有独立 PreparedCoverage 复查。缺真实历史回填与所有 writer/GC 参与时不提供完整扫描结论。 |
| `system_backup_v2_kek_references` | 四类分区的原 source record ID/version、backup/attempt/envelope、完整 binding、mapping_source、expected_request_source、原生命周期/保护来源。planned/unknown 与最终成品同样保留。无原已认证 release/cleanup/absence 证据不释放；不因任务终态、过期或 SQL deleted 标志自动删除。 |

与 C 的 `CheckSameKeyMapping` 对齐：`description_redacted` 仅是 typed ref 的展示/来源元数据，不参与同一逻辑 key 的安全语义重绑定判定。首次登记的原始 typed ref 字节和 SHA 永远保留在首笔 binding 证据中；后续配置若只改变说明文字，可以复用相同安全映射，但新原始字节与 SHA 必须另存于该次 admission 的来源证据，不得 UPDATE 首笔 binding。D Store 的判等须分别检查安全语义字段和原字节来源，不能把整份 JSON 字节相等当成唯一的“同 key”规则。

第一笔登记走原 `reference:kek` owner，不另开注册 HTTP API：

1. D 从受信部署组合取得 C 闭集 candidate 的固定原字节和来源引用；candidate 本身无授权。
2. A 在原 offline bootstrap grant 或原配置修改权限下，通过**独立配置的 original mapping source**认证原 identity/version 与两个操作 ref 的关系及完整 immutable mapping 字节，核实 provider/version、来源、当前用途与期限。OfflineBootstrapGrant.ConfigSHA256 只固定配置 pin，配置修改权限或 config/operation 已提交也不单独证明映射真实。调用者同时给 candidate+expectedSHA 不能自证。Prepare 在 SQL 锁外完成 provider/CA I/O，原来源身份/版本/摘要/撤销窗口必须有独立 Recheck。
3. 原事务锁定配置/授权/操作及既有引用，再绑定下述 KEK 子阶段；A 在该事务内复查原观察，D 才把 binding/admission 写入同一个事务。任一复查/配置写入/审计失败都整体回滚。
4. 仅原事务提交并能读回对应 config/operation 后，生产组合才可读取已登记映射。Prepare 返回值、SQL INSERT 返回值及 commit-unknown 都不产生可用的 `kms.Config`。

若 A 无法认证“首次登记”来源，应拒绝而不是要求 JSON 自报已注册。该拒绝不要求用户重复已完成的 JWT trust/profile 读回。

## 2. 四类历史事实来源与覆盖接入

完整性属于原业务来源及共同写协议，不属于 JSON 的 count/hash。以下是 D 接受的 coverage 分类；准确扫描字段由 C scanner 与相应原 owner 实现，不能用空 stub 代替。

| 分区 | 必须覆盖的原事实与接点 |
| --- | --- |
| `retained_artifacts` | 原 backup/registration 与不可变 manifest/envelope，包括 SQL 已标删除但仍受保留/恢复约束的对象；通过完整 mapping_source 和 expected_request_source 取回原 CA/请求，不能只存 binding hash。当前正式 C 成品来源尚待实现。 |
| `inflight_and_unknown_writes` | 原 task/attempt/frozen plan、Job/send intent、producer pending/unknown、原 key-use reserve/begin/end。125 `runtime_resources.key_use_json` 是其中一个输入，不是完整索引。B 最终 writer 尚未交付，所以不能宣称所有路径已接入。 |
| `holds_and_catalog` | 原 retention/hold、catalog append/tombstone 与结果未知的持久意图；不能只扫描当前可见 catalog head 或 succeeded 行。对应 C/provider 来源未就绪时拒绝完整性结论。 |
| `restore_and_prune` | 原 restore/recovery/prune 操作、预留、持久意图与原清理/不存在性证明；独立 recovery grant 继续由 A 复查，历史映射不携带旧 grant。 |

四类必须全部有真实 source adapter，完整分页 EOF、原 source revision 与 adoption/backfill receipt 必须可复查。新建空索引不证明旧安装没有引用。初次 adoption 必须在原维护/暂停授权下冻结未接入的旧写者，完成全量回填并对账；没有这个能力则不启用 complete-scan/retirement。D 本轮不以一个开关伪造接入完成。

新写者的事实索引从第一次 provider 调用以前开始：在原 Job/producer 授权、原计划及意图已锁定的事务中，先登记精确 planned KeyRequest/source 引用，再提交原 reserve/send intent；提交未确认不得发起 Generate、Job 创建或上传。外部结果未知时保留原 planned 引用。最终 envelope 只追加/推进原成员事实，不补造一次此前不存在的保护。

## 3. 统一锁序与扫描水位

使用 MySQL InnoDB，沿原 RepeatableRead 事务。KEK 是原授权/任务/既有引用锁之后的子阶段，不能持 KEK fence 再回头锁 task、gate、producer、evidence 或原引用表。

统一子阶段：**原 domain/授权/operation/host/target/全部既有 references → KEK installation fence → 按 identity/version 排序的 binding → 按成员 key 排序的 KEK index → 原 capacity/evidence/write 阶段**。多 key 先取得所需 fence，再按固定序读 binding/index。新 fence 不替代 `system_backup_gate`。

- Bootstrap candidate 当前是 `env.LockReferences` 后才 `p.lockReferences`，而 producer Pending 的回调位于 exact pending hold 之后。D 需在两者**既有引用均已锁完之后、capacity 之前**设置明确的 KEK bind/stage 接点；不能直接在所有 `LockReferences` 同名方法中加锁。
- ConfigMutation 在首次 readiness 阶段绑定 KEK 子阶段；mapping/admission 持久化须有独立同事务 Stage，不能藏在最终 Recheck 中。现有最终 `ready.Recheck` 保留。
- 原 Job/execution 先完成 engine/shared gate/maintenance/installation/config/task/attempt/授权锁，再进入 KEK 子阶段，与原 reserve/send intent 同事务持久化。
- 最终 Recheck 只核验已持有的 fence/binding/index、原观察和有效期，不首次获取 fence，不追加新引用，不执行网络 I/O，不自行 commit。

所有 append、unknown、保护变化、release、mapping/撤销/coverage 变化必须获取同一稳定 fence 并推进 epoch。扫描必须使用显式 current locking read（例如已持 fence 后 `FOR UPDATE` 读取 index），不能在等待 fence 后读事务早先建立的 RR 普通快照。空集合也靠稳定 fence 防插入，不能靠锁已有行、MAX(id) 或本机时间。

SQL epoch 是 D 新事实源的实际变更序号；它不是从业务行最大 ID 推算的水位。snapshot_revision/fence_revision 来源必须绑定 installation、coverage source 和已持 epoch；四分区计数及 JCS 集合摘要从同一已锁集合派生。原观察准备后任一 epoch/source revision 变化均重新准备，不默认为空。

退休/外部销毁不能在最终复查后解锁，再无条件调用 provider。它必须使用原持久意图与 outcome-unknown 协议；D 本轮不新增自动删除 key 路径。

## 4. Go 接点与文件归属

以下为本轮要落地的接口边界；实现完成前不作为已有能力。

中立类型已先落盘于 `backend/internal/systembackupkekregistry/types.go`；D 继续实现同目录 SQL Store。A 可在 `systembackupsecurity` 的新增 KEK validator 文件中实现以下结构化方法，不需等待 Store 完整实现，也不需导入 D 的组合包：

```go
PrepareBootstrapKEK(context.Context, OfflineBootstrapGrant, BootstrapConfig,
    systembackupkekregistry.AdmissionInput) (systembackupkekregistry.PreparedAdmission, error)
PrepareConfigMutationKEK(context.Context, ConfigMutationResourceInput,
    systembackupkekregistry.AdmissionInput) (systembackupkekregistry.PreparedAdmission, error)
```

`AdmissionInput` 只是 C candidate、配置/来源观察、D SQL snapshot 和原 coverage source 的比较输入。A 的构造必须注入独立 original mapping authority；`PreparedAdmission.OriginalMapping()` 返回其真实准备对象，含 SourceRecord、完整 Binding、SourceRevision、ValidUntil 与单独 Recheck。D 将拒绝 nil/缺失或不匹配的来源，不从 candidate hash、配置回执、profileSHA 或 provider 名创建它。

`PreparedAdmission` 另提供固定 Binding/Observation/ExpectedSnapshot/Risk/ValidUntil 和 Recheck。Risk 两字段只决定原 ConfigMutation 追加权限/MFA要求，不是批准布尔。`LockedSnapshot` 只能由 D 构造，`Facts()` 返回防御性副本；A 用传入 SQLReadView 和 SQL time 检查原事实。`PreparedCoverage`、`PreparedReferenceChange`、`PreparedRevocation` 同样只有强制原 owner 回调，无内置成功实现。缺真实 C scanner/B writer 接入仍拒绝完整性。

| Owner | 文件/接口与职责 |
| --- | --- |
| D | `internal/systembackupkekregistry/`：纯存储事实类型及 SQL Store，不导入 `systembackupsecurity`/`systembackupkms`，避免 A/C 循环依赖；`Binding`（不可变核心）、`AdmissionObservation`（配置/来源观察）、`SourceRecord`、`Reference`、`LockedSnapshot`。 |
| D | Store 的 `Bind` 在调用方原事务中取 fence/current reads；`StageAdmission` 只执行已复查候选的不可变 INSERT/判等与观察写入；`RetainPlanned`、受原证明约束的状态推进和 `Recheck` 使用同一事务；存储不 Commit、不调用 provider。完整扫描缺 adoption/来源时失败。 |
| A | 具体 KEK validator 在 A 所有的新增文件内实现。输出带固定 Binding/Observation/ValidUntil 的准备对象，并提供 `Recheck(ctx, SQLReadView, LockedSnapshot, now) error`；没有 `approved bool`，没有恒成功默认实现。D 在原 tx 调用它，A 检查原权限/撤销/两用途和历史保留，不代替 C 构造业务引用。 |
| C | 将最新闭集 candidate 解码为未准入 Binding/Observation；提供四分区原 source scanner 和受控 SourceRecord 解析，保留完整 mapping/CA/expectedRequest。来源数据与授权分开。 |
| D | 原 bootstrap owner/candidate Original 和 ConfigMutation 的组合适配；补明确 Bind/Stage/最终 Recheck 接点。构造时必须提供 A validator、C source 及原 authority，缺项拒绝。不会修改 A KMS transport/Job resolver 文件。 |
| B/原 writer owners | 在原 reserve/send/unknown/hold/release 生命周期调用 D 索引接口；尚未接入前不启用完整扫描能力。B 的 frozen capture context/最终 writer 不由本交接宣称完成。 |

源码接点：`config_bootstrap_transaction.go`（原配置/operation/audit 原子写入）；`config_bootstrap_candidates.go`、producer `bootstrap_consume.go`（L5/Work/FinalGuard）；`config_mutation_transaction.go`（首次 readiness、写入阶段、622 行附近最终 readiness）；`public_key_use.go`（原 Job key-use SQL，但仍需接 planned 引用）。

## 5. 需验证的拒绝边界

同 ref 重绑定；跨安装/配置；旧配置读取同一 immutable mapping；原 source/撤销 revision 改变；write 退休不销毁历史解密材料；恢复不能继承旧 grant；缺任何 coverage/未回填的新索引；缺/过期/分页不完整扫描；并发 planned append 导致观察失效；未知外部结果不能 release；在最终 Recheck 中首次 Bind/Stage；提交失败/未知不能输出已准入配置。

本文件是 D 对 C 五项问题的存储/锁协议答复。A/C 可据此对齐具体类型；实现、测试与生产装配能力将在本文件追加实际结果。当前没有现场变更，没有生成测试构建产物。

## 2026-10-29 存储候选进度

127 已新增 installation fence、immutable binding、原 config/operation admission、
四分区 coverage 来源和 planned/unknown/retained reference 表。`SQLStore`
提供锁外 `ReadSnapshot`、调用方原事务内的 `Bind`、`StageAdmission`、
`AdoptCoverage`、`RetainPlanned`、独立用途撤销和最终 `Recheck`；
`ReadCommitted` 只在原 config 与 succeeded operation 可联合读回时返回
历史映射事实，不签发当前使用权限。Store 不开始写事务、不提交、不调用 provider。
`CompleteScan` 在原 scanner、历史 adoption 和全部 writer 写入口就绪前固定拒绝。

本候选尚未接进 bootstrap/config mutation/Job 的生产 caller，也没有
真实 MySQL 或四分区 source adapter 验收。A 的 `PreparedAdmission` 现已允许
独立来源认证后的首次 binding 缺席；D 不通过伪造 SQL binding 来满足它。
本段只记录存储候选，不把初次 KEK 准入或密钥退休宣称完成。

## 6. 当前实现接口与接手边界

`internal/systembackupkekregistry` 已提供非授权 DTO、`SQLStore.Observe/ReadSnapshot`（准备比较数据）、`SQLStore.Bind(ctx, originalTx, installationID)`（原事务在既有引用锁之后获取稳定 fence 与当前锁读）、`Bound.StageAdmission`（已准备原映射的 binding/admission 同事务落表）、`Bound.AdoptCoverage`（四分区原来源收据）、`Bound.RetainPlanned`（原 provider 调用前 planned 引用）、`Bound.Revoke`（generate/unwrap 分立撤销）、`Bound.Recheck` 与 `SQLStore.ReadCommitted`（仅在原 config/operation succeeded 后回读）。`SameSecurityBinding` 是 A/D 共用的安全语义判等：仅排除 redacted description 和随之变化的原字节 SHA；首笔 `core_json` 不覆盖，每次 admission 保存本次 typed ref 原字节/SHA。`SameSnapshotFacts` 比较全部持久事实与 epoch，允许准备和 Bind 的 SQL 采样时间不同。

这些接口都不返回 Generate/Unwrap/Job 授权；`ReadCommitted` 的输出仍需当前用途 authority。`CompleteScan` 目前恒拒绝，直到 C 的四类完整原 source scanner、B/原 writer 的 append/unknown/hold/release 接线、历史 adoption/EOF 与退休持久意图均落实。原 bootstrap/config mutation 的 Stage/最终 Recheck 装配尚未完成；没有该接点不能称生产 KEK 已接入。新增五表在正式 schema registry 中均为 `pending_owner_review`，未补写审批。没有现场 key 导入或发布动作。

## 2026-10-30 原事务接点候选

`ConfigBootstrapService.KEK` 接受 `BootstrapKEKPreparation`：调用方固定的 C source 与 A validator 在 SQL 锁外准备 `PreparedAdmission`，原 legacy bootstrap 与 candidate consumer 的新写分支在原 config/operation 事务里调用 `SQLStore.Bind`、`StageAdmission(operation_public_id, 1, prepared)`，最终 guard 前调用 `Bound.Recheck`。legacy 历史重放先要求已有 admission 行，不能借重放补造映射。`ConfigMutationService.KEK` 接受 `ConfigMutationKEKPreparation`：原 resolver 提供 `reference:kek` 的防御性副本；A 的 KEK 风险进入原 MFA/权限判定；原 config/operation 写入后在同一事务 `StageAdmission(operation_public_id, newVersion, prepared)`，提交前复查。`SQLWriteView` 不暴露 Commit/Rollback，Store 不在锁内调用 provider。

`systembackupkekadapter.BootstrapComposition` / `MutationComposition` 只接受 C 的原来源接口与 A validator；缺 C 来源或 SQL 快照不一致时拒绝。现有生产构造尚未注入这两个可选接点，C 的四分区历史 scanner/adoption 和 Job 原 `PreparedReferenceChange` 尚未提供，因此本次接线是可编译的原事务候选，不能宣称生产准入、完整扫描或 Job planned 引用已启用。`CompleteScan` 仍固定拒绝。127 不进入现场 080 升级路径；[080 独立升级方案](system-backup-d-legacy-source-upgrade-handoff-20260929.md) 继续保留历史来源审查门槛。
