# A 管理身份离线撤权候选交接

日期：2026-10-12。L1b 当前管理行是管理读、写、部署变更的事务内撤权来源：A 在每个新事务和 FinalGuard 均检查准确行的 `enabled`、`revoked_at`、身份/凭据绑定、独立权限位、截止与版本。本轮增加不依赖被撤销管理证书的**写入路径**，使管理证书失陷时仍可执行准确撤权。

`RecoveryManagerRevocationService.Revoke` 只接受部署侧固定路径和 SHA-256 的离线上级授权文件。文件绑定准确 scope、上级身份摘要、目标管理身份、期望 L1b 版本、原因和 UTC 时间窗；普通管理 mTLS 请求及 Admin session 均不是其授权来源。事务先锁安装 L0 父行，再锁准确 L1b 行，要求版本和未撤销状态匹配；在同一事务写数据库 intent/result 审计、清除三个权限位、停用管理行、设置撤销时间并推进版本。FinalGuard 复读行、时间和授权文件。外部 journal intent 失败时不进入事务；确定提交后再写外部 result，提交回包或外部 result 不确定时返回专用 unknown 错误，不能盲重试。

新增 `ARevoke` 隔离 MySQL 候选专项：使用真实 L1b 行和 A 管理 mTLS，执行离线撤权，核对数据库与 journal 审计，并要求后续新管理读取被拒绝。该用例已进入统一远测脚本；2026-10-12 用户提供的完整终端输出显示真实 MySQL 专项通过，证据来源和限定范围见 [增量远测记录](system-backup-a-bootstrap-revoke-mysql-remote-20261012.md)。本地执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest ARevoke -BuildParallelism 1
```

最终本地退出码 0：定向测试、默认 vet、离线 MySQL seed、Linux MySQL 探针及迁移工具编译通过，`CLEANED local-registration-build-cache=True`。探针 SHA-256 `c919c20061139368119682073d9c2b044be7b7a7bd89627c2d79498dc5dece3a`，候选 DDL SHA-256 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，迁移工具 SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。首次 Windows `compile.exe 0xc0000043` 工具错误由脚本重试同一命令后通过；源码或脚本变更后远测须以当轮指纹为准。

生产仍需部署侧证明离线上级授权文件的审批、保管与固定摘要来源，以及 journal 的独立持久卷、物理容量、单写者和访问控制；候选恢复表尚未成为编号 migration/inventory。当前入口保持关闭，B/C 未接入不影响上述 A 侧候选验证，但不能将它扩大为完整恢复验收。
