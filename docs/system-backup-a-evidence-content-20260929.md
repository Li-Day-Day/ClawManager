# A evidence 内容校验增量（2026-09-29）

本轮补齐两个已明确的准入规则：核心 `Identity.valid` 执行主计划 §6.2 的全部 evidence type/owner 组合；新增 `CapabilityRedactor` 为现有 `capability-evidence.schema.json` 正文提供严格、绑定受信输入的加密前校验。尚未实现其他类型的完整正文验证，不能把该实现称为通用 redaction 或所有 evidence 内容已验收。

## owner/type 组合

`Prepare`、manifest 读取校验及 `SQLRegistry.PersistPending` 使用同一 identity 校验。Provider presence/absence proof 只能归 external-action，ownership proof 只能归 staging/restore-resource，job log 只能归四类 task；其余组合按 [主计划](system-backup-restore-division-plan.md) §6.2 实施。枚举各自合法不再意味着组合合法；非法组合在加密或 INSERT 前拒绝。

这会使历史上违反该矩阵的外置登记无法通过新读取校验。没有重写历史数据或批准其迁移；若真实接线发现此类行，应保持失败关闭并由控制面诊断，不能改 owner/type 来使旧证据“通过”。现有正确组合的记录格式、framing 和 DDL 不变。

## capability snapshot

入口为 `NewCapabilityRedactor(CapabilityContentPolicy)`。调用方必须先认证 probe/producer，并从真实登记及任务配置提供 installation、evidence ID、classification、provider role/identity/ref、scope hash、run ID、owner marker、准确 observed provider version、最大有效期和可信最晚截止时间。不得先从待校验正文读出这些值，再把它们当作受信 policy 传回校验器。

该 validator 仅处理 `capability_snapshot`、system owner、`application/json`。校验所有字段名称的大小写和精确闭集、全部 required 字段（包括必须出现但允许 null 的两个字段）、重复/转义重复字段、嵌套未知字段、null 替代布尔/数组、尾随 JSON 和无效 UTF-8。实际内容必须匹配预期 checksum/长度；与 policy 的 installation/evidence/classification/run/provider/version 绑定不符即拒绝。

通过结构检查后复用 `systembackupsecurity.ValidateCapabilityEvidence`，验证现有 role/code、status/reason、去重、redaction 标记、cleanup、probe 时间窗和有效期规则；每次使用当前 UTC 时间检查，不固定在构造器创建时刻。D 的持久化事务仍必须使用数据库时间重新检查权限、有效期和 capability 准入。

本适配器对这类小型结构化报告设置 64 KiB 正文上限；它不是所有外置 evidence 的 1 GiB 通用上限变更。Ref/version 使用受限的标识符字符集，且 observed version 必须等于准入时的值或共同为 null；不接收 URI、任意错误消息、自由格式 provider response。它验证已脱敏的完整内容，不删除未知字段后继续接受一份被改写的证明。

拒绝结果统一为 `redaction_failed`，不会包含原文、字段值或底层 reader 错误。`Prepare` 的第一遍校验失败时不调用 KEK，也不写 framing/staging；第二遍的源漂移检查保持不变。原始字节和 JSON RawMessage 副本在使用后清零；Go 内部字符串副本无法保证完全擦除，不能据此声称整个进程没有秘密内存副本。

## 验证与范围

测试基于仓库已有 A-owned 脱敏 fixture，将时间替换为本次窗口。为覆盖外置路径，测试用合法 JSON 空白把小型报告填充到 9000 字节；生产格式没有填充要求，也没有因此增加 inline 支持。

新增用例覆盖完整 Prepare/OpenRange、未知/重复/大小写/嵌套字段、身份及期限、内容大小与 reader 失败、构造后 policy 指针变化；从当前机器 schema 读取全部 required 字段逐个删除以验证拒绝。另检查全部 12×13＝156 个 type/owner 组合，以及非法组合不能进入 Prepare 或 manifest 读取。

验证使用现有 `scripts/system-backup-a-evidence-validation.ps1 -BuildParallelism 1`，不带 `-Remote`。最终完整运行通过：21 个顶层测试、106 个子用例，包耗时 2.337 秒；新增部分为 5 个顶层测试、45 个子用例及 156 个 owner/type 组合断言。Linux/MySQL 探针与 migration runner 编译成功，runner 退出 0，构建缓存、二进制和本轮遥测目录已清理。Go 格式和 3 个 PowerShell 文件语法检查通过，未安装依赖、未执行远程操作。

本轮 [最终输出](evidence/system-backup-a-evidence-content-local-20260929.txt)、[源码/构建绑定记录](evidence/system-backup-a-evidence-content-local-20260929.json)与 [首轮失败输出](evidence/system-backup-a-evidence-content-first-failed-20260929.txt)分别保存，不改写 S3、Transit 或 MySQL 历史 receipt。DDL 和 migration runner 摘要保持不变；本轮没有运行真实 MySQL，不能把新的 type/owner 行为算作旧 MySQL run 已验收。

本轮首次完整运行中，Go 测试已通过（21 个主测试、106 个子用例，4.190 秒），Linux 探针编译因 `compile.exe: exit status 0xc0000043` 失败，runner 退出 1 并清理。因此该次不能登记为完整构建成功。Runner 随后把编译器的这一精确退出码加入已有 vet/asm 有限重试；仍最多 3 次，同一命令/缓存，断言失败不重试，不重试远程动作。

同时修正了遥测隔离：本轮观察到用户遥测目录的 `upload.token` 写入被拒绝；[Go 官方说明](https://go.dev/doc/telemetry)确认 `GOTELEMETRY` 是只读状态，原来设置同名环境变量不足以关闭它。现在在本轮 scratch 下预写 off mode，通过已安装 Go 工具链支持的 `TEST_TELEMETRY_DIR` 隔离，并用真实 `go env` 核验 mode=off 和准确目录，再开始编译。最后恢复环境并随 scratch 清理，不修改用户全局遥测配置。19 项策略/原生进程/遥测隔离用例在当前 PowerShell 与 Windows PowerShell 5.1 均通过；这个测试 hook 的支持情况由入口实际校验，不假定所有未来工具链都支持。

仍待实现：job log 的逐行安全决策/失败行丢弃与诊断、其他 evidence 类型的完整正文合同与对应 validator、真实 producer 认证和 validator 分派接线。生产 STS resolver、C 的不存在证明、独立 evidence KEK 和 D 的 SQLPolicy/HTTP/调度也仍未完成。本轮不更新 capability approval、本人 MFA 或配置激活状态。
