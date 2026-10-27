# D：结果提交与精确收据重放

日期：2026-10-08。承接 [发布结果登记](system-backup-d-producer-finish-20261008.md)。本轮实现 CommitResult 的单事务编排，生产 evaluator/投影/容量/审计环境和 A ready 证据适配的完整联调仍待接通。

## 首次提交

[result.go](../backend/internal/systembackupproducer/result.go) 提供 `NewResults` 和 `CommitResult`，要求原 Execution/Lifecycle 的私有执行句柄及受信 ResultEnvironment。输入沿用完整 C1 ResultRequest 和原 result_key/result_request 摘要；新增内部 `system-backup-producer-result-commit.c1` 摘要还绑定主体与句柄 grant 版本。没有新增 HTTP/controller 入口或通用成功环境。

事务从安装/config/domain 和当前身份开始，L3 锁定收据键/缺席范围，再锁 grant/run/历史绑定、host、target。比较原 domain epoch/admission、主体/issuer、grant 版本、target 全部 profile/slots、代次、期望 result version、run/input/evidence、原观测时间和写截止。必须是当前 published run。结果槽集合及状态/reason 使用既有闭合 C1 校验，ready 证据本身不能代替独立 evaluator 对完整结果请求的证明。

本轮同时修正前一轮 FinishPublication 的状态衔接：ready 证据 CAS 与 run pending→published/row_version 加一处于同一事务；write_unknown 保持 run pending。旧存储层一直要求 published→committed，本轮没有放宽这一约束。首轮结果测试因此暴露缺失的 published 推进，修正后重新验证整包；旧 Finish 记录仅保留当时范围，新指纹和覆盖以本轮为准。

L5 必需的环境回调先锁完整证据引用/hold 前缀（含缺席范围）、legacy 投影键及 config 的规范目标映射，随后 D 按 kind/key 顺序锁定原 pending hold 和新增引用。环境返回候选或正式投影模式：

- 未配置场景只能是 candidate，不创建 installation/config、不写 live provider/dependency 槽。
- 已配置 disabled/enabled 场景也可保持 candidate，例如该 probe scope 不是 legacy 槽的规范目标。
- configured 必须由当前配置的规范目标映射独立授权；受信 ApplyProjections 在同事务内写入完整已批准槽集合和 legacy refs，不能靠请求字段自行决定映射，也不能改变 enabled 状态。

容量预留和 intent audit 后，L8 加载 A 原 registry/chunks，比较所有 EvidenceBinding 字段，包括原 manifest/content/object/ref/不可变版本及精确 evidence row_version；要求 ready、failure=none、无 claim/GC 冲突，retention/protection 覆盖收据期限。原历史的 immutable_version 保持 null，请求中的 ready 版本与 A 当前证据独立核对。

首次提交在一个事务内完成完整投影更新（适用时）、target result_version/row_version 加一、run→committed/row_version 加一、两类新引用、不可变 ReceiptRecord 和 result audit。任何投影、CAS、引用/收据插入、audit 或最终 current-read 检查失败都会整体回滚。原 evidence、manifest/chunks、观测时间、历史绑定和写截止不修改。

引用为 candidate 的 bootstrap_candidate 或 configured 的 producer_result，加 producer_receipt。它们使用该次 result key，分别保护到原历史/收据 retention。原 pending hold 保留；既有旧结果引用也暂时保留，尚未实现引用退休/物理回收及容量扣减。后续替换结果的引用退休必须按 C1 只处理自身引用并通过独立保留/GC 证明；本轮不能称作这一完整生命周期已经完成。

收费为 64 KiB 固定事务成本、98,304 字节收据记录上限加每行 64 KiB、两条 8,192 字节引用上限各加 64 KiB，以及环境证明的现有 audit/projection 成本。测试环境额外成本 64 KiB，合计 442368 字节；生产实际附加成本仍由适配证明。报告在 BEGIN 前固定，全部等待和最终复查计入原五秒窗口。

## 重放和提交结果

完全相同的收据重放必须取得独立 ReadReceipt 权限。匹配完整请求和 request hash 后只返回原收据，不收费、改库、刷新时间或调用 projection/evidence 执行路径。它可在执行租约/观察过期或 grant 撤销后返回历史数据；当前身份与收据保留期仍须有效。当前入口仍要求 scope domain 存在且 open；关闭域或跨配置的独立历史恢复入口未实现。

同 result key 的请求任何变化都拒绝；run 已 committed 时不能用新 request key 再生成结果版本。提交不明返回空结果和 ErrCommitUnknown，不自动重试。下一次精确请求若获得独立读取授权且发现已提交原收据，可读回；若未提交，仍须重新满足完整当前准入，不能沿用旧收费/执行权限。

CommittedResult 只含不可变历史收据及重放标志，不含新句柄或 claim。已知提交但返回跨期会返回历史收据和 ErrCommittedExpired。Receipt.CommittedAt 是本次事务中准备写入前采样的数据库 UTC，不是磁盘提交精确时间；最终检查及 commit 在其后。

## 验证与接线限制

Windows 单包测试及默认 vet 已通过：48 个顶层测试、含子测试 681 项；Linux 测试二进制交叉编译通过，未执行该二进制。脚本退出 0，本轮构建缓存、临时目录和二进制已清理，未安装依赖或执行远端操作。[result_test.go](../backend/internal/systembackupproducer/result_test.go) 从 lifecycle→observation→pending→claim→finish 的本地实现开始，使用标准库 SQL driver 模拟 rollback；正式投影使用同事务模拟参与者。覆盖 unconfigured/disabled/enabled、候选/正式投影、精确费用、收据先于 grant 的锁序、权限/证据/观测/版本/投影失败整体回滚、grant 撤销后的独立历史重放及提交不明/返回跨期。

此前完整运行失败后发现 Finish 缺少 published 推进；首轮大段输出被截断，未保留完整失败明细。随后一次定向诊断发生构建失败，当时紧凑日志未包含 Go 的 build-output 事件，无法确定其具体原因。脚本现已补充该事件和可选测试筛选；两次失败运行均已清理。最终成功运行使用默认全包范围，包含状态衔接修正后的源码，不以失败运行代替验收。迁移 catalog 仍为 94 文件，摘要 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`，未增加正式 producer migration。

这些测试不证明实际 evaluator 真实性、legacy projection SQL、A ready loader、真实 MySQL FK/gap locks、跨进程竞争或 provider。A 已并行提供 [ready registry/chunks 加载和最终回读适配](system-backup-a-system-result-20261008.md)，以及 pending/claim/finish 的实际 SQL 适配；本轮 D 单包验证不覆盖这些 A 适配，也不代表经真实 Lifecycle/ExecutionHandle 的完整 A/D 联调通过。ResultSession 必须按完整锁计划接入真实环境，最终 Recheck 不能只返回 nil。原配置规范映射、完整槽集/旧引用退休及这些新接口仍需 A/C 审查；Job 场景还需 B。

本入口由 D 拥有外层事务；任意 caller-owned LockedPrefix 组合 API 仍未提供。八表候选 DDL 未纳入正式 migration/inventory。独立历史读取/恢复、域管理、引用/GC 生命周期、生产 Command/Execution/Pending/Claim/Finish/Result 接线、真实 V01–V10 和生产部署验收继续推进。

验证使用 [禁止依赖下载且自动清理本轮产物的脚本](../scripts/system-backup-d-producer-validation.ps1)，源码指纹及结果见 [机器记录](evidence/system-backup-d-producer-result-20261008.json)。旧里程碑文档和指纹保留原时点范围。
