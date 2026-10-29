# A：KEK 正式准入代码交接

2026-10-29。本文记录 A 的代码边界和当前实际装配状态；候选或测试通过均不表示已完成现场准入。

## 已落地的 A 边界

- `systembackupkekadmission.CheckUnadmittedInput` 只检验候选内部结构、两用途 typed ref、精确 provider 版本、四分区形状，以及每个历史引用的完整 KeyBinding 和 JCS 摘要。它不产生许可。
- `systembackupkekadmission.Prepare` 要求独立的 `PreparedMappingSource`、generate 与 unwrap 各自的 `PreparedCapability`、完整 `PreparedCoverage`。首笔登记允许 D 快照中的 binding 列表为空，但仍须有四分区独立完整扫描，且不能有悬空历史引用；已有同一 identity/version 须复用 D 的 `SameSecurityBinding` 安全语义比较并保持两用途未撤销。只有 `description_redacted` 及其原字节摘要允许在后续准入改变，其他来源、版本、期限或集合不一致均拒绝。
- `PreparedAdmission.Recheck` 只接收 D 在原事务及共享 fence 内取得的 `LockedSnapshot` 和 SQL 时钟；使用 D 的 `SameSnapshotFacts` 核对冻结的 SQL 事实，允许准备与加锁两次采样时间不同，再调用原映射、两用途及 coverage 的复查。epoch、引用或覆盖来源变化仍拒绝。它不调用 provider、不提交事务，也不签发 Job grant。
- `systembackupkekadapter.KEKAdmissionValidator` 分别将 bootstrap 原 grant/config pin、config mutation 的 `reference:kek` 当前/拟议 pin 与上述准入检查绑定。轮换时旧 binding 必须仍出现在完整历史快照。导入放在独立 adapter 包，避免 security → admission → typed-ref → security 的循环依赖。

## 原来源 reader 和生产 caller

`OriginalKEKPreparation.PrepareKEK(ctx, AdmissionInput)` 是 A 的注入入口。它必须由 **D 的原安装/配置 owner** 实现，读取并认证与候选独立的原 mapping 记录，返回 `PreparedMappingSource` 及两个目的各自的当前权限准备对象。reader 必须固定原安装、identity_hash、opaque registry_version、完整 provider locator/key/version、两份 typed ref 原字节与 SHA、来源 revision、有效窗口和撤销位置；不能把 candidate 与其 expected hash 当作两个独立来源。D 的 SQL Store、迁移和扫描接口正在共享工作树中开发，尚未形成生产 caller 与正式准入回执；A 不提供恒成功默认实现。

具体 caller 为 D 的 `BootstrapOwnerAdapters.References["kek"]` 与 `ConfigMutationResolverSources.References["kek"]`。它们在 SQL 锁外取得 A 准备对象；D 在原授权及既有引用锁之后 `Bind` 同一 KEK fence，提供 `LockedSnapshot`，于原事务内调用 A `Recheck`，再将不可变 binding/admission 与配置/operation/audit 一同 stage/commit。提交成功并读回准确 config/operation 关系后，运行组合才能创建 `systembackupkms.Config`。D 的 Store/Stage 仍在开发且原来源 reader 和生产接线未交付，故当前生产 caller 仍应 fail closed；不能从 A 准备对象直接构造 Config。

四分区完整扫描需要 C/B/原 producer、hold、catalog、restore/prune owners 接入同一个 D fence。缺 adoption/backfill、分页 EOF 或 writer 参与时，`PreparedCoverage` 不得由空列表替代。D 的 [持久化与锁协议交接](system-backup-d-kek-persistence-locks-20261029.md) 给出了需落盘的事实和锁序；该文档目前明确实现未完成。

## 验收边界

本地 vet/test 仅验证结构和独立来源接口的拒绝逻辑。正式准入需要 D 的 SQL reader/Bind/Stage、原来源认证、四分区完整扫描和成功提交读回；真实 generate/unwrap 还需要 B 的冻结 `systembackupkms.Access`、原 Job/Pod/SA 身份与 permit、精确 provider policy/role 及现场操作回执。已通过的 JWT trust 和 KEK profile 回执不替代这些证据。
