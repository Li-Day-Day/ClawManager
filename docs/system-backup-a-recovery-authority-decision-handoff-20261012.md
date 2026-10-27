# A 恢复管理决策与独立审计候选交接

日期：2026-10-12。本轮补齐 A/D 原子管理事务的候选受信提议输入，并增加可接入独立保留存储的本地同步审计 journal。它们不依赖 B/C 的真实 capture 或 artifact。

`PinnedRecoveryAuthorityDecision` 只读取部署侧固定路径和 SHA-256 的离线决策文件。文件逐项绑定准确 scope、`RecoveryAuthorityHash`、管理身份与 issuer、当前 L1a 行和下一版完整 L1a 提议，并限定数据库 UTC 时间窗。A 已锁 L1b 且核对管理写入/部署管理权限后才调用它；D 继续在同一事务验证 L1a/L2 的 epoch、row version 和对象身份。A 的 FinalGuard 复读原文件并拒绝文件撤换、到期或身份变化。决策文件没有从普通 Admin 请求或会话获取的入口。

`RecoveryAuditJournal` 只能打开预置的普通文件，不会创建缺失路径。每条记录同步写入并 `fsync`，逻辑容量耗尽、路径换绑、文件长度被外部截断或追加，以及写入失败后拒绝后续操作。它分别实现首位管理者注册、部署变更和管理身份撤销的外部审计接口；部署变更的 `result_prepared` 表示事务提交前的准备记录，不能冒充确定 COMMIT。数据库 `audit_logs` intent/result 仍在 D 的同一管理事务中，外部审计写入失败使本次事务失败关闭。**独立存储卷、预留物理容量、单写者和访问控制必须由部署侧提供并验证**；仓库内的临时测试文件不构成该生产证明。

`TestSystemRecoveryAuthorityPinnedDecisionMySQL` 已加入 `AManager` 远程候选专项，验证固定决策文件驱动的 A mTLS/L1b 与 D L1a/L2 原子注册、两条事务审计和实际 journal 文件同步写入。该文件位于隔离测试临时目录，不证明生产独立存储；真实 MySQL 尚未运行。单元测试覆盖准确请求、文件漂移、外部审计失败，以及 journal 的预置文件、记录格式和容量失败关闭。

本地执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest AManager -BuildParallelism 1`，在 journal MySQL 用例改动后的最终退出码 0：定向测试、默认 vet、离线 MySQL seed、Linux MySQL 探针及迁移工具编译通过，`CLEANED local-registration-build-cache=True`。本轮探针 SHA-256 `878c8a138ff5045a2a69016e1337eb9b8cdf13dfaad02b2ce478792809814722`，候选 DDL SHA-256 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，迁移工具 SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。再前一轮首次 vet 工具进程 `0xc0000043`，相同命令自动重试后通过；更早一轮 Linux 编译遭 `0xc000026b` Windows 工具崩溃而中断，其自有临时目录已核对并清理，均不计为本轮通过。

2026-10-12 后续本地复验：补上类型化 nil 外部审计拒绝和 journal 同文件长度漂移拒绝（截断、追加负测），`AManager` 定向测试、vet、离线 MySQL seed、Linux 探针和迁移工具编译均通过，最终退出码 0，缓存已清理。最新探针 SHA-256 `7625045f15af955d9ce43657be16b4d921633ff84e84e70aa4f5419531ba0233`；DDL 与迁移工具 SHA-256 仍为上段所列值。第一次测试编译和第一次 Linux 探针编译各遇到一次 Windows 工具进程 `0xc0000043`，脚本重试同一命令后通过；真实 MySQL 未运行。

本轮未连接远端。A 侧独立计划项全部收口后，操作者再按统一完整命令运行十个候选隔离 MySQL profile，并以当轮构建指纹、原始退出码和逐项清理回执验收；旧 AManager 远程成功记录早于本增量，不覆盖它。生产使用还取决于受信离线授权来源、独立审计存储验收、管理身份撤权来源、候选表正式 migration/inventory 及跨 Owner 签收。
