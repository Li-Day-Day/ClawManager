# D resources 备份校验草案（v12）

【2026-10-22 九表规范化方案待交叉评审】[D 方案与回执清单](system-backup-d-resources-review-pack-20261022.md)已整理逐表转换建议、A 六表/B 四表/C 四表评审问题、生产适配器交付要求、评审模板和十六项/四十二项远测完整命令。[机器清单](evidence/d-resources-review-request-20261022.json)固定九表与二十五份输入、文档摘要，评审回执为空；恢复状态、映射及 version 等选择仍待确认。本次仅整理待审材料，不改正式批准、registry 或运行代码。

【2026-10-22 verifier 必需检查数遗漏已修正】[合同声明与独立验收](system-backup-d-verifier-registry-counts-20261022.md)发现上一轮虽然把 runtime/registry/check ID 闭集同步到 35，机器合同 required_check_count 仍为 31，原 73 项回归未覆盖此字段。本轮同步为 35，并在共享合同命令 build/write 前校验 A/D 六份有限 ID 声明的数量、重复/非法 ID 与本地 schema 结构。隔离、写回及独立重验各 112 项通过；旧 31 声明在 --check/--write 下均按准确诊断拒绝，36 项反例恰两项失败、34 项通过。345 项限定输入与文件集合前后复核一致，DTO 49 类型/435 字段保持。第三轮包装器因三条测试自建 tmp 读取分类错误而 exit=-1，原失败及准备状态保留，由第四版独立复核接收，不声称原轮整体成功。四个准确 owner 共 4,714 份文件已清理并独立确认不存在；未安装依赖、未改 Go 运行文件或执行远端。strict 仍因 40 项 policy、60 项交叉评审、四份 missing 与 live schema-hash 阻断，B/C 未提交、真实 proof、完整 GC 和原六项继续未完成。

【2026-10-22 resources proof 输入隔离已验证】[修复与验收](system-backup-d-resources-proof-isolation-20261022.md)在九表结构校验后分别复制内部比较视图及 proof 参数中的 Tables/AuditMaxID，防止回调改写调用者数据或掩盖原始行数/audit cutoff 差异；空审计 nil、原 proof 错误优先级和 12 项输出保持。旧代码对照准确击中 16 个修改相关叶子，两项对照通过；隔离和写回后完整 resources 包各 25 主/115 条通过事件、default vet、224 项输入及文件集合复核通过。准确 owner 与 2,806 份产物已清理并独立确认不存在，未安装依赖或执行远端。真实 B capture/target proof、九表 normalization、实际 MySQL 和原六项继续待验收。

【2026-10-22 控制表排除闭集与完整 resources 包已修复】[35 表闭集与本地验收](system-backup-d-control-exclusion-35-20261022.md)显式补入 admin_revocations/admin_sessions/metadata_reservations/totp_credentials 四张已登记 metadata-only/reference-only 表，同步 verifier schema 的四个检查 ID；未知表/策略漂移继续拒绝，schema_migrations 保留目标本地语义。另补控制排除提交后的取消保护，并修正一个未真正移除批准的负例夹具；正式 registry、批准及迁移未改。原包三个既有失败逐名复现后，隔离/写回完整 resources 包各 21 主/94 条通过事件、default vet、共享合同回归各 73、DTO 各 49 类型/435 字段及 271 项输入复核通过；三个迟到结果反例和正常/原提交错误控制有效。准确 owner 及 2,827 份文件已清理，无依赖安装或远端 SQL。真实 B target/capture proof、九表 normalization、实际目标/权限和原六项仍未完成；contract_frozen=false 与四份缺失合同保留。

状态：**draft / 离线 fixture**。本实现不接入备份资格、controller 或真实 artifact。

## D 已定义的输入与检查

`backend/internal/systembackupresources.VerifyBackupSnapshot`接收源视图与 dump 视图各一份脱敏元数据、冻结的同版本 registry，以及 B 提供的 `CaptureProofVerifier`。两份元数据各含 checkpoint SHA-256、capture-context SHA-256、已登记 evidence ID、九张固定表的行数和 `audit_logs` 最大已纳入 ID。空审计表的最大 ID 为 `null`。

调用顺序固定为：registry 冻结门禁 → 两份元数据完整性校验 → B 的证明校验 → D 的逐项比较。没有证明校验器、证明校验失败、表集合不完整、审计 cutoff 与行数矛盾时，函数返回错误和空检查集，不产生通过结论。

机器合同 `verifier-contract.schema.json` 中 `resources/backup_validate` 的 D 草案登记了 12 个 check：checkpoint、capture context、九张表的 `resources.table_count.<table>`、`resources.audit_cutoff`。`expected/actual` 只包含 hash、非负行数或最大审计 ID，不包含业务行或凭据。已认证输入出现差异时，对应 check 为 `failed / integrity / validation_failed`。校验结果的封装、持久化和资格判定仍需公共合同冻结及集成。

## B 交接要求

B 的 `CaptureProofVerifier` 必须独立验证 capture certificate 的真实性、有效性和未被 forced resume/失效 gate 撤销；验证 dump 内容确实产生了所报告的表集、行数和审计最大 ID；证明源端统计和 dump 统计都绑定到同一 MySQL checkpoint 与 capture context。仅比较两份自报 JSON 或检查 `sev_` 引用格式不能实现此接口。若 B 无法在源端只读事务与 dump 之间给出共同 checkpoint，当前 `SQLCountCollector.CollectSnapshot` 的数值不能作为已证明的 expected 侧，需由 B/D 共同调整采集流程。

固定样例在 `backend/internal/systembackupresources/testdata/resources-backup-verify-draft.json`，其中 proof 明确标为 `synthetic-test-only`。Go fake verifier 只供离线逻辑测试，不代表 B 的证明已交付。A 仍需统一 redaction/evidence 接口；A/B 仍需评审北向平台管理配置字段的备份与恢复语义。

## D 控制表排除检查（restore_validate 草案）

`ControlExclusionAllowlist`从同一冻结 registry 核对 35 张系统备份控制表及其 `metadata_only/reference_only` 策略；任何新增、缺失或误归类的控制表都会使门禁失败。`schema_migrations` 属于目标本地迁移元数据，不作为源控制记录的空表检查对象。

`SQLControlExclusionVerifier.VerifyRestoreTarget`要求 B 提供的隔离目标证明、已登记 evidence ID 和独立只读数据库连接。它在一个只读 repeatable-read 事务内检查 35 张 InnoDB 基表并逐表计数：零行为 `passed`，非零行为 `failed / integrity / normalization_failed`。证明、表结构、查询或事务提交失败时不返回部分检查。机器合同中 `control_plane/restore_validate` 登记了这些封闭 check ID 和行数字段。

B 的目标证明需要在执行检查的同一个只读事务上覆盖 planned/observed 目标身份、normalization 已完成、restore 写凭据已销毁，以及 verifier 的新连接只有 SELECT/必要的 `information_schema` 权限。目前只有 fake proof 与 fake DB 定向测试；没有真实隔离目标或凭据证明，因此这项检查还不能用作 drill 验收。九张业务表的恢复归一化策略仍须 A/B/C 交叉评审和 normalization registry 冻结。
