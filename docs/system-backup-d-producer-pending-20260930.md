# D：producer pending 原子事务

日期：2026-09-30。承接 [观测绑定与固定调用快照](system-backup-d-producer-execution-20260930.md)。本轮新增 D 的 pending 入库事务编排；A 原有 `SQLRegistry.PersistPending` 自行 BEGIN/commit，不可嵌套调用。生产 PendingSession 和实际 A registry/chunks 写入适配仍待实现。

## 实现

[pending.go](../backend/internal/systembackupproducer/pending.go) 的 `NewPending`/`AdmitPending` 要求本 Execution/Lifecycle 实例的私有执行句柄以及必需的受信 PendingEnvironment。没有通用成功实现或 HTTP/worker 启用入口。

事务按 installation/config/domain、身份、grant/run/原历史绑定、host、target/保护引用、其他已规划 refs、容量、intent audit、A evidence/chunks、D 状态写入、result audit、最终复查推进。历史绑定与 hold 缺席范围在较早锁层先锁定，L8 后只写这些已锁键。SQL 接口不暴露 commit；既有事务执行器统一决定提交，并锁存 SQL/CAS 失败，即使适配错误地忽略失败也不能提交。

首次入库将以下内容放进同一事务：

- A 的 registry、原 manifest/chunks 和已预锁的 legacy refs，由强制 `InsertEvidence` 接口写入。
- D 的完整 `HistoricalBindingRecord`，包含原 run、domain epoch/admission、输入、证据/manifest/content/object/ref 摘要、相对路径、观察时间、写截止及保留策略。
- D 的确定性 `hold` 引用，绑定 scope/run/evidence，保护期固定为该历史记录的 retention。
- D 的 run 从 acquired 推进到 pending，row_version 加一；原观测时间和 owner 写截止保持不变。
- 一次容量预留及 intent/result audit，任何一步失败都整体回滚。

请求中的历史数据不是授权证明。Authenticate 必须独立验证 A 已准备成功的原 manifest/chunks、原 evaluator 观察和 channel/policy，再返回完整历史摘要；D 还会把该历史逐项对比当前锁定的原 run/domain/grant/target。未来时刻、早于观察的创建时间、改变的观察期/写截止/输入/目标、错误版本以及不足的保留期均拒绝。

新写收费为 64 KiB 固定事务成本，加历史绑定及 hold 各自记录上限/4 KiB 取整和每行 64 KiB 成本，再加环境认证的 A registry/chunks/legacy refs/audit 成本一次。测试夹具的合计为 368640 字节，不是生产通用报价。容量报告必须在 BEGIN 前固定，后续锁等待及最终检查计入原五秒窗口。

同 evidence 的完全相同重放要求当前执行授权及独立 `ReadExisting` 权限，精确匹配历史绑定、原期望版本加一后的 pending run、保护引用和 A 原记录/分块。它不写入、不重复收费、不重加密、不延长观察期或保留期。历史存在但 hold/evidence 缺失、ready 状态或任意原字节不同均拒绝，不能修补成新写；跨配置、过期或 ready 的历史读取另走后续独立恢复入口。

`PendingResult` 只是确认提交后的历史数据，不含 publication claim。提交不明返回空结果和 ErrCommitUnknown；已知提交但返回跨期可返回历史结果及 ErrCommittedExpired。pending 完成后，旧 content/wrap 快照以及新准备调用均失效；发布仍须后续独立 ClaimPublication 事务确认，不能用 pending 结果直接换取 STS/PUT 权限。

## 生产接线与评审输入

PreparePending 必须为每次调用冻结独立 session、A 原准备产物及报告，不能在重试时重新 Wrap。LockEvidence 必须在同一事务核验真实 registry/chunks、owner/type/ref/原观察/retention 和完整原始内容；只把请求字段复制为 PendingEvidence 不构成证明。Recheck 必须复核实际已锁权威和 D/A 最终状态。回调禁止远端 I/O，也不能再次开启事务。

本轮提供 D 拥有外层事务的组合入口，A 通过限定 SQL 接口加入。C1 描述的任意 caller-owned `LockedPrefix`/`LockAdmission` 组合 API 尚未提供；不能把本入口称为该 API 已全部完成。后续若需要与结果事务合并，必须保留单事务、精确 scope/键及最终 Guard，不把原始可提交 tx 暴露给调用者。

新增三个内部摘要域 `system-backup-producer-pending-request.c1`、`system-backup-producer-pending-history.c1`、`system-backup-producer-pending-reference.c1`；沿用 C1 typed frame。pending hold 的生命周期、跨表完整锁计划、外层事务组合方式、重放的独立读取权限和新增摘要均需 A/C 集成评审。此处不改变原 A manifest 编码，也未代填批准。

## 验证与剩余工作

最终脚本退出 0：Windows 35 个顶层测试，含子测试共 488 项通过，默认 Go vet 通过；Linux 测试二进制交叉编译通过，未执行该二进制。独立测试缓存和构建产物已清理，未安装依赖。migration catalog 仍为 94 文件，hash 为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`。

[pending_test.go](../backend/internal/systembackupproducer/pending_test.go) 将模拟 A evidence 行与 D 行放入同一带 BEGIN/rollback 快照的标准库 driver，检查一次提交、精确重放/费用/锁序、原状态绑定、审计/插入/CAS/最终复查失败回滚、提交不明与返回跨期。它没有验证实际 A registry/chunks SQL、MySQL FK/gap locks、跨进程竞争或 provider。typed Go 校验器同时补齐 bool 原语，以支持受信环境返回的 existing/read 权限位；未改变既有数字拒绝、closed 类型或 typed frame 编码。

验证入口为 [禁止下载依赖并清理本轮产物的脚本](../scripts/system-backup-d-producer-validation.ps1)，源码指纹及结果见 [本轮机器记录](evidence/system-backup-d-producer-pending-20260930.json)。旧里程碑指纹保持原样。

继续实现 ClaimPublication、发布完成/结果提交、独立历史读取与恢复、域管理、生产 Command/Execution/Pending 环境、A 实际入库适配及 C 独立通道。八表 DDL 未纳入正式 migration/inventory，真实 MySQL V01–V10、A/C 及适用的 B Job 评审、生产部署验收仍未完成。
