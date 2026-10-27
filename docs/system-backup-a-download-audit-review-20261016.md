# A 独立复核 D 下载 intent 审计存储候选

本轮只评审 [D SQL 存储组件](../backend/internal/systembackupevidence/download_admission_audit.go)及其准确冻结版本。它不提供下载权限，不消费 nonce，也未接入生产 HTTP。完整准入仍沿用 [A canonical/proof 交接](system-backup-a-sensitive-download-candidate-20261016.md)中的事务与授权边界。

## 组件边界

`StageIntent` 使用调用者提供的准确 `*sql.Tx`，插入一行后读取本次 INSERT 的 `LastInsertId`，核对 affected rows 为 1、ID 位于已发布 INT 范围，再以该 ID `FOR UPDATE` 回查 actor、action、resource、时间和闭集审计内容。它不查最大 ID、最新行或相邻行，也不自行 Begin/Commit/Rollback。任何失败都不返回可用锚点；调用者仍必须回滚可能已发生写入的事务。

输入来自服务端事实，含原始 claim，禁止整体 JSON 序列化；持久化使用闭集投影和 claim SHA。返回锚点只保留准确事务、真实 ID、原始审计内容与 SQL 时间，不保留原始 claim/proof/nonce/key，也禁止 JSON 序列化。`AuditIntent` 是返回真实 ID 的低层接口；完整事务应保留 `StageIntent` 的封闭锚点，供后续 callback 后重验。

组件从该事务读取 SQL UTC，拒绝 SQL 会话或驱动时间的非零偏移、零时间、非微秒精度和相对原始采样的回退。已发布 `001_init_schema.sql` 的 `audit_logs.created_at` 是 TIMESTAMP(0)，因此显式截到整秒后写入该列，JSON 中保留原始 SQL 微秒时间。回查允许 MySQL JSON 空白/键顺序变化，保持数字和字符串区别并拒绝内容或闭集字段漂移。

`RecheckIntent` 绑定原事务、原行、原内容和原时间，不能跨事务复用或在事务结束后继续使用。它的时钟下界是最初采样；完整事务 owner 还必须维护全流程最新观察时间、原始 proof/deadline、最终写后 guard 和唯一提交点。此存储组件不验证锁前缀、真实当前会话/RBAC、server UUID/database、容量、operation/receipt/公共快照或 nonce 候选。

## 独立验证范围

[A 测试](../backend/internal/systembackupevidence/download_admission_audit_a_test.go)通过真实 `database/sql` 加确定性 transport 模型，覆盖 3 个主测试和 24 个子用例，共 27 项。它核对真实返回 ID 的使用、原行回查、借用事务、claim 摘要、JSON 等价重排、跨事务/结束事务拒绝，以及写入/RowsAffected/LastInsertId 失败、错误 ID、时区/精度/取消、actor/action/resource/内容/时间篡改和时钟回退。模型结果不证明真实 MySQL JSON/FK/锁等待行为。

[最终回执](evidence/a-download-audit-review-20261016.json)、[完整日志](evidence/a-download-audit-local-20261016-141437-0f3a1ef3.txt)与[源码清单](evidence/a-download-audit-source-20261016-141437-0f3a1ef3.json)限定接收 1,310 项冻结输入，source SHA 为 `d7ff758644a31b532e13119ee42a86ad5c55fa0c987361af496ba2d5923befc1`；D 实现 SHA 为 `cb3115e82d7dd8d9ea5f45b840df1290ea644a74225a3362e0fdb67fef902fbd`。完整 evidence 包 **196 主测试/1,224 子用例，共 1,420 项不同检查通过**，无跳过；新增 A 的 27 项已包含其中，不能与此前整包轮重复相加。

默认 vet、离线只读依赖、Go 及外层 exit 0、冻结源码和 D 实现 postcheck 全部通过。独立复核器的 20 项核对通过，137 份重点来源及全部已有清单输入仍匹配；四轮八条准确自有路径独立确认不存在。仅最终轮实际执行了测试；日志、清单、源测试及夹具保留。本轮没有安装新依赖、执行远测或修改正式迁移/共享批准状态。

复核器初稿按名称前缀包含了 D 的 `TestDownloadAdmissionAuditActualIDAndPrivateClaim`，因此计数断言拒绝 28 项。已改为 A 三项主测试的准确名单及其子用例，确认 27 项；只重读归档，没有重跑 Go。修订及被排除的 D 名称记在最终机器回执中。

## 执行与清理记录

首次源码捕获因并行 D 新增验证脚本而中止，未进入 Go。随后一轮在依赖编译阶段出现 Windows `compile.exe` 的 `0xc0000043`，没有执行测试；确认构建已失败后停止其 driver，并完成清理。为恢复保留的自有缓存副本又在下一次源码捕获漂移时按 finally 清理，未进入编译。日志均保留，不能算测试断言失败或成功。

最终轮改为串行编译，并复用已有 proof 专项的有限次稳定快照捕获：最多三次，只重试构建前的源码捕获，Go 测试不自动重试。D 在两轮间补充了驱动 UTC 偏移检查和原始输入禁止 JSON 序列化；已静态核对，A 测试文件未变。旧日志中要求源码相同的恢复标记是当时的计划，不是断言；仅接收最终轮实际冻结并验证的 D 版本。

本地门禁为 [独立归档脚本](evidence/a-download-audit-review-20261016.ps1)，仅使用已有依赖、离线只读模块和默认 vet；它最终删除准确自有源码/cache/temp 目录，保留日志、清单和测试夹具。[结果复核器](evidence/a-download-audit-review-20261016.mjs)只读取归档，不执行 SQL/SSH。真实远测继续由操作者负责。

后续 [D 独立勘误及四项 MySQL 准备](system-backup-a-download-audit-mysql-handoff-20261016.md)已由 A 核对：17 项核对、387 份重点 pin 匹配，与本轮同一源码快照；提供完整操作者命令，真实四项结果仍未收到。D 勘误已修正空内容/key 说明并确认审计时间精度，不改变正式共享批准或生产状态。
