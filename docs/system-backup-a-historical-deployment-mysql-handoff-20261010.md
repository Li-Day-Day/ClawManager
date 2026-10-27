# A 当前历史恢复部署行隔离 MySQL 交接（2026-10-10）

本专项只验证候选部署表在隔离 MySQL 中的 A L0/L1a 锁定、受信工作负载字段和撤销代次准入、FinalGuard 行版本漂移拒绝、缺安装及 disabled 行拒绝。它不接入生产 `SystemHistoricalAuthority`，不签收管理事务、C Stat 证明、正式 migration 或生产启用。

第一次远程 run `sbk-mig-261010024518-11ee` 在测试第 44 行拒绝夹具 scope，原因是测试用 installation ID 不符合 v12 的 `installation_` 前缀规则；迁移、专属数据库、准确 UID namespace、远端 scratch 和本地缓存均报告清理。原 [失败日志](evidence/a-historical-deployment-mysql-remote-20261010.txt)保持原貌，不能记为 MySQL 专项通过。

已修正测试夹具的 installation ID。本地 `-ProducerRecoveryOnly -RecoveryTest ADeployment -BuildParallelism 1` 重检退出 0：定向测试、默认 vet、MySQL 离线 seed、Linux 探针及迁移工具编译通过；输出 `CLEANED local-registration-build-cache=True`。新版探针 SHA-256 为 `5d72b24ed9197f8a8f434f6af8bbe2ad235d07151803dd417fe6e387e99f781f`，组合 DDL 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，迁移工具为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。这些是本地编译证据，`real_mysql=not_run`。

## 操作者命令

在 Windows PowerShell 从仓库根目录执行。输入有变化时会先停止；需重新做本地预检并更新指纹，不能套用本次预检结论。脚本只创建 run-owned namespace、数据库及临时文件，自动清理。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$expected = @{
  'backend/internal/systembackupevidence/system_historical_deployment_sql.go' = '816aaf73951f0dcf1ac3f61be883399cf66430ae92e9e900997c490bc14e693c'
  'backend/internal/systembackupevidence/system_historical_deployment_sql_test.go' = '626ccaea3109a18b0d4c23890c26ecb028b8c35dd1a3e397d33c91a6531b13dc'
  'backend/internal/systembackupevidence/a_historical_deployment_mysql_test.go' = '5711724dbcccca066502376cea4814f9732fba172256f78890d96dd65ffdaafc'
  'contracts/system-backup/v12/producer-recovery-authority-candidate.sql' = 'fb9e64e60139ad84285e5ee8c56d26245c677851b8d4886f8b0bd9f4b6b1729c'
  'scripts/system-backup-a-evidence-validation.ps1' = 'dbe58e525bec25f3806d02e5aeed5064418cb90db940d32aeca988818de8910f'
  'scripts/system-backup-d-producer-service-phase.sh' = 'ce11846c7b9cf0c7faeb1931bb1aa8c6a8074aa72be246b984d1df9ef71652e1'
}
foreach ($path in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$path]) { throw "Input changed: $path" }
}
$log = 'docs/evidence/a-historical-deployment-mysql-remote-20261010-r2.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest ADeployment -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'A historical deployment MySQL validation failed' }
  Write-Output 'A_DEPLOYMENT_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

## 接收标准

- 完整日志包含准确 namespace/UID、94 文件 fresh migration、`TestSystemHistoricalDeploymentGuardMySQL` 通过、`PASS a-recovery-deployment-mysql` 和 `A_DEPLOYMENT_REMOTE_EXIT=0`。
- 远端探针、DDL 和迁移工具 SHA-256 与上述本地预检值一致。
- 该 run 的专属数据库、准确 UID namespace、远端 scratch、本地构建缓存都报告 `CLEANED`，且无 `CLEANUP_PENDING`。若测试或清理失败，保留原始日志，不将旧回执挪用为本次成功。

通过后，A 仍须把部署校验接入非测试 `SystemHistoricalAuthority`，并另验管理权限与部署轮转、D L2/Guard、C Stat 受限通道、正式迁移和 V01–V10。

## 第二轮接收

操作者执行修正版后，完整 [PowerShell transcript](evidence/a-historical-deployment-mysql-remote-20261010-r2.txt) 已归档，SHA-256 为 `3736c15f659471217c1287e9c1cc31ed0cd4c49a8a6bc9ed5bb487d258c1624d`。run `sbk-mig-261010032105-58d6` 的 namespace UID 为 `092a25a6-3b39-4de1-9a25-25cd93d0ebfc`；MySQL 8.4.8 上 94 文件 fresh replay、`TestSystemHistoricalDeploymentGuardMySQL` 和 `PASS a-recovery-deployment-mysql` 均通过。远端探针、组合 DDL 与迁移工具摘要和上方本地重检一致；专属数据库、准确 UID namespace、远端 scratch、本地缓存均报告清理，日志无 `CLEANUP_PENDING`，并输出 `A_DEPLOYMENT_REMOTE_EXIT=0`。SSH 密码提示附近的 closed-socket 文本未阻止后续测试或清理。本轮**限定范围接收候选部署行的 A L0/L1a 隔离 MySQL 专项**；第一轮夹具失败保持原结论，不扩大为生产授权或 C provider 验收。
