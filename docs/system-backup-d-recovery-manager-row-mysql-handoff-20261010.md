# D L1b 管理主体行 MySQL 专项交接（2026-10-10）

范围：候选 `system_backup_recovery_managers` 的准确 L1b 行锁、独立权限、凭据绑定、最终复读与事务回滚。此项不测试生产 mTLS 入口、首位管理者授权、部署和撤销的原子更新，也不放行历史恢复。

从仓库根目录在 PowerShell 运行：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
try {
    & .\scripts\system-backup-a-evidence-validation.ps1 -Remote -ProducerRecoveryOnly -RecoveryTest Manager -SshTarget 'root@10.130.14.23'
    'EXIT_CODE=0'
} catch {
    'EXIT_CODE=1'
    throw
}
```

固定输入：隔离 namespace、预设 `clawmanager` 应用镜像 digest、MySQL 8.4.8 镜像与现有 001..080 迁移脚本；脚本只在隔离 MySQL 的 run-owned 数据库应用候选 DDL。不得用生产数据库替换目标。

初次本地预检已通过：`TestRecoveryManagerRowGuard`、默认 vet、带标签 seed、Linux MySQL 探针与 pinned migration runner 编译。初次探针 SHA-256 为 `fb97c79957856f769dd7e97172b736491bff0a03b8cf4b23d319b63297f0a73e`，DDL SHA-256 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，迁移 runner SHA-256 为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。本地构建缓存已清理。修正夹具后探针 SHA-256 将改变，由脚本在下一次运行中重新计算并同时核对上传文件。

第一次远程回执：namespace `sbk-mig-261010024418-15aa`，UID `65ca4b87-45dc-4c9f-a4a5-cab3fbd61d81`，MySQL 8.4.8；94 个迁移精确重放 PASS。`TestDRecoveryManagerRowMySQL` 在第 36 行因夹具安装 ID `recovery-manager-row-test` 未满足 `installation_` 前缀而返回 `artifact_unavailable`，尚未执行 L1b 查询。回执为 `EXIT_CODE=1`，run-owned database、namespace、remote scratch、local build cache 均已清理。该次不是 Manager 专项通过。夹具已改为 `installation_recovery_manager_row_test`，并加入上传前运行的 `TestDRecoveryManagerFixtureSeed`；此种子测试已在本地通过且隔离缓存已清理。下一次只需重跑同一命令，脚本重新生成新探针指纹。

回执须包含完整原始输出及 PowerShell 退出码。判据：fresh migration replay 通过，`TestDRecoveryManagerRowMySQL` PASS，`PASS d-recovery-manager-row-mysql`，run-owned database、namespace、remote scratch、local build cache 全部 CLEANED。若出现 `CLEANUP_PENDING`，保留 namespace UID 和完整输出，不将其记为 PASS。SSH 密码提示期间的 closed-socket 文本以最终退出码和 PASS/清理标记核对。

## 第二次远程回执

操作者粘贴的完整控制台输出显示 `EXIT_CODE=0`。隔离 namespace `sbk-mig-261010031325-64ca`、UID `df32c39d-f1ca-43b2-a377-33a22bce327c`；MySQL 8.4.8；94 个迁移精确重放 PASS。`TestDRecoveryManagerFixtureSeed`、`TestDRecoveryManagerRowMySQL` 与 `PASS d-recovery-manager-row-mysql` 均出现。探针 SHA-256 `5d72b24ed9197f8a8f434f6af8bbe2ad235d07151803dd417fe6e387e99f781f`，DDL SHA-256 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，迁移 runner SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。run-owned database、namespace、remote scratch 和本地构建缓存均报 CLEANED；没有 `CLEANUP_PENDING`。结论仅为候选 L1b 行 SQL 专项 PASS，不代表生产管理事务或历史恢复入口已签收。
