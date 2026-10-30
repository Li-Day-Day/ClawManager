# A 复审：C50 新执行控制表的恢复排除边界

日期：2026-10-30。交接 D/B；复核当前 `codex/unified-backup-baseline`，不代替 D 的 owner 决定或公共 C 的合同评审。

## 当前证据

- `contracts/system-backup/v12/schema-registry.json` 已发现 `system_backup_v2_execution_records`、`system_backup_v2_runtime_resources`、`system_backup_v2_runtime_writers`、`system_backup_v2_runtime_captures`、`system_backup_v2_runtime_stop_proofs`。五者的 `decision_status` 都是 `pending_owner_review`，`backup_strategy`、`restore_strategy`、`required_cross_reviewers`、`approved_cross_reviewers` 尚未填入批准事实。名称来自 migration 122/123 的发现记录；发现不等于冻结策略。
- 当前 `backend/internal/systembackupresources/control_exclusion.go` 是 35 张显式控制表的闭集；`ControlExclusionAllowlist` 先要求 capture registry 可用，再要求每张入选表具备 `system_backup` / D / `metadata_only` / `reference_only` 的策略，并拒绝闭集外 `system_backup_` 前缀表。当前 `contracts/system-backup/v12/verifier-contract.schema.json` 也只列这 35 项空表检查。
- C50 候选增量拟同时将排除闭集与 verifier 检查扩为 40 项。仅扩代码/合同而保留五张表的待审状态不能构成受审策略；仅把测试中的待审状态改为冻结也不能制造 owner/cross-review 授权。

## 合并决定与接收条件

现阶段保持代码、verifier 合同、测试所用历史 capsule 一致的 35 项基线。不能把 35 项通过称为覆盖当前候选 registry 的完整恢复验证：新表被 `looksLikeControlTable` 识别时应拒绝，完整目标恢复仍待五张表的策略决定。D 合并 C50 时也要检查已暂存测试是否留有 `40` 项或相应探测数量的断言；这些断言须与保留的实现一致。

后续由 D 对五张表逐项给出源行处理和目标结构策略、原 owner 决定及所需交叉评审记录；公共 C 更新精确 schema registry、排除闭集和 verifier 合同，B 提供与冻结版本一致的历史 capsule/目标恢复样本。随后验证每张控制表的源行不导入、目标表结构存在且为空，并验证错版本、漏表、非空表、缺 owner/cross-review 的拒绝。真实恢复还要保留 forward 不可用时的独立 recovery 路径，不得以 35 项合成测试代替。

本记录只引用公开表名及策略状态；不包含现场凭据，也不宣称现场恢复已验收。
