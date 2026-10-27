# A 历史恢复部署授权适配增量交接（2026-10-10）

第二轮候选部署行专项已限定范围通过。本次新增 `SystemDeploymentBoundHistoricalAuthority`，把该行校验接到非测试 `SystemHistoricalAuthority` 的 L0/L1a、Authorize 和 FinalGuard 回调中。被包装的 authority 仍负责 D 的 L2 撤销、引用、容量、审计和 C 的独立 Stat；其 `LockInstallation` 只能取得 L0 安装锁，本适配随后取得 L1a。未提供这些真实依赖时不构成可启用的生产恢复入口。

本地执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest ADeployment -BuildParallelism 1` 退出 0：新增适配的准入与拒绝测试、原部署行测试、默认 vet、带 MySQL tag 的离线 seed、Linux MySQL 探针及迁移工具编译通过，输出 `CLEANED local-registration-build-cache=True`。该轮探针 SHA-256 为 `a03a8b23e7f786d1284523776d84563193bd439e57995a446a67dc70a02ae776`；组合 DDL 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`；迁移工具为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。并行开发会改变共享脚本或探针二进制，远程命令会重新执行本地门禁、编译一次并将该次准确二进制上传，不沿用旧指纹。远程 MySQL 尚未运行。

## 操作者远程命令

在 Windows PowerShell 复制整段执行；源码或脚本摘要变化时先停止，重新进行本地预检。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$expected = @{
  'backend/internal/systembackupevidence/system_historical_deployment_authority.go' = 'bf92052248f7f8858f9fde06bb60d171add10fefebd0db30e60e426e5bf21448'
  'backend/internal/systembackupevidence/system_historical_deployment_authority_test.go' = '0ee10f14be8c8423d23108e982bd4f0690e9e02d982ec217f68fb4d1a89d00ff'
  'backend/internal/systembackupevidence/a_historical_deployment_mysql_test.go' = '4d2e1c7f8ba8806451c67a69de9d523f5e66b6125415158fe1134ef387ade1ac'
  'backend/internal/systembackupevidence/system_historical_deployment_sql.go' = '816aaf73951f0dcf1ac3f61be883399cf66430ae92e9e900997c490bc14e693c'
}
foreach ($path in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$path]) { throw "Input changed: $path" }
}
$shared = @('scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-producer-service-phase.sh')
$sharedBefore = @{}
foreach ($path in $shared) { $sharedBefore[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
$log = 'docs/evidence/a-historical-deployment-authority-mysql-remote-20261010.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest ADeployment -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'A historical deployment authority MySQL validation failed' }
  foreach ($path in $shared) {
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $sharedBefore[$path]) { throw "Script changed during run: $path" }
  }
  Write-Output 'A_DEPLOYMENT_AUTHORITY_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

接收时核对新的 namespace/UID、94 文件 fresh migration、`TestSystemHistoricalDeploymentGuardMySQL` 通过、`PASS a-recovery-deployment-mysql`、**本次**本地与远端三项二进制/DDL 指纹一致、`A_DEPLOYMENT_AUTHORITY_REMOTE_EXIT=0`，以及专属数据库、准确 UID namespace、远端 scratch、本地缓存均为 `CLEANED` 且无 `CLEANUP_PENDING`。新增同一 MySQL 测试内的适配段必须执行；旧第二轮成功记录只覆盖修改前的探针。

即使本专项通过，生产 D authority/管理事务、C 受限 Stat 证明、正式 migration/inventory、实际部署和 V01–V10 仍须分别验收。B/C 缺席期间保持入口关闭。

## 本次限定范围接收

操作者已执行上述命令，完整日志见 [远程 transcript](evidence/a-historical-deployment-authority-mysql-remote-20261010.txt)。run `sbk-mig-261010040152-6a35`，namespace UID `07463262-f6d8-4061-93b6-10cb20286640`，MySQL 8.4.8；94 文件 fresh replay、`TestSystemHistoricalDeploymentGuardMySQL` 和 `PASS a-recovery-deployment-mysql` 均通过。该测试包含新增非测试适配器的真实 L0/L1a 行准入与 FinalGuard 读回段。探针 `7aeb517f18b7b44072ce21c078b24c021e721e63002bdb9e60bd05a57bbe9065`、DDL `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60` 与 runner `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f` 在本地/远端逐项一致。日志含专属数据库、准确 UID namespace、远端 scratch、本地缓存清理及 `A_DEPLOYMENT_AUTHORITY_REMOTE_EXIT=0`，无 `CLEANUP_PENDING`。SSH 密码提示附近的 closed-socket 文本不改变后续测试、清理及退出结果。本项只接收隔离 MySQL 的 A 部署授权适配；生产委托 authority、管理事务、C Stat 和正式迁移仍独立待办。

## 后续 L2 FinalGuard 增量（待统一远程验证）

`SystemDeploymentBoundHistoricalAuthority` 现在在 D 已锁定准确 L2 撤销行后，于 `LockReferences` 读出当前 epoch、撤销状态和行版本；最终 Guard 在 A 的 L1a 部署行及委托 authority 复查之外，再复读同一 L2 行。缺行、撤销、代次不符或版本变化均拒绝提交。新增隔离 MySQL 断言先验证同一 L2 行正常读回，再在事务内改动版本，要求 FinalGuard 拒绝且回滚。该适配没有创建或授予 C 的 Stat profile，也不替代委托 authority 的引用、容量与审计策略。

本地 `-ProducerRecoveryOnly -RecoveryTest ADeployment -BuildParallelism 1` 最终预检退出 0：定向 Go 测试、默认 vet、离线 MySQL seed、Linux 探针和迁移工具编译通过，`CLEANED local-registration-build-cache=True`。探针 SHA-256 为 `02facf1417eb9d541ef5442c0924905bbd59fc15f0af62c77235e46f9f7c2cdb`，组合 DDL 为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，runner 为 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。首轮本地用例因专用 fixture 默认拒绝 `LockReferences` 而失败；另一次编译遇到重复的测试夹具方法，均已修正并以最后一次完整预检为准。既有 ADeployment 远程成功回执早于 L2 增量，不能覆盖它；按本次约定等待其余 A 侧独立工作完成后统一远测。
