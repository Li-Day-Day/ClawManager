# A 首位恢复管理者离线注册候选交接

日期：2026-10-10。本轮只增加不依赖 B/C 输入的 A 侧首位 L1b 管理者注册候选，仍不开放生产入口。

`RecoveryManagerBootstrapService.RegisterFirst` 要求部署侧固定的授权文件路径及 SHA-256、独立管理 mTLS 证书、实际 MySQL server/database 身份和外部审计写入能力。授权文件严格限制大小、字段、scope、管理身份、时间窗和三项管理权限；事务先锁安装 L0 父行，再确认当前 L1a 部署及 L1b 管理行均缺席，只能登记首位管理者。管理行与两条数据库审计在同一事务提交；提交前复查证书、授权文件和刚写入的管理行。外部 intent 审计失败不进入事务；提交后外部 result 审计失败返回 `recovery_manager_commit_unknown`，不得盲重试，须独立读取当前准确行。

外部审计是必需接口；现有 `RecoveryAuditJournal` 可写入预置文件并同步落盘，但独立持久卷、物理容量、单写者和访问控制尚需部署侧验证。受信的授权文件摘要及管理证书撤权来源仍需运维/安全输入与独立签收。候选 L1b 表尚未成为编号 migration，故本代码不代表生产可用的首位注册入口。

新增 `ABootstrap` 隔离 MySQL profile，预定验证外部 intent 拒绝、提交后外部 result 失败的未知结果、准确管理行及数据库审计、重复注册拒绝。该专项已编译进入 Linux 探针，**真实 MySQL 尚未运行**。最终本地命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest ABootstrap -BuildParallelism 1
```

最终本地退出码 0：授权文件负测、默认 vet、离线 MySQL seed、Linux 探针和迁移工具编译通过；`CLEANED local-registration-build-cache=True`。本轮探针 SHA-256 为 `0220acf5bccc7082738397c470ef8b42b049af9b10cce5ba625356c60be8d91d`，候选 DDL 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，迁移工具为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。此前一次本地运行首轮 Windows `vet.exe 0xc0000043`，脚本重试后通过；最终重跑未出现该工具错误。源码变更后远测必须重新构建并比较同轮指纹，不沿用上述值。

2026-10-12 后续本地复验：补上类型化 nil 外部审计负测后，`ABootstrap` 定向测试、vet、离线 MySQL seed、Linux 探针与迁移工具编译通过，最终退出码 0，缓存已清理。探针 SHA-256 `2ca72d7195ba8d4dd95feb3a763d4fa957a4944791e5501d336db75e613e5191`；此后 journal 源码继续变化，远测须按当轮重新构建的指纹核对。首次本地测试因新增测试桩重名失败，修正后重跑通过；Linux 编译首次遇 Windows `compile.exe 0xc0000043`，脚本重试后通过。真实 MySQL 未运行。

统一远测入口已包含 `ABootstrap`；后续又加入 `ARevoke`，目前共十个候选 profile。2026-10-12 用户决定先执行这两个尚未远测的 A profile，限定接收结果见 [增量远测记录](system-backup-a-bootstrap-revoke-mysql-remote-20261012.md)。其余完整计划和最终统一远测命令仍需后续收口。
