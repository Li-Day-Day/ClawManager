# A 当前恢复授权只读观察接线：隔离 MySQL 交接

日期：2026-10-10。D 的 `RecoveryAuthorityReader` 已提供当前状态的独立只读事务。A 新增 [SystemRecoveryAuthorityReadEnvironment](../backend/internal/systembackupevidence/system_recovery_authority_read.go)，用独立管理 mTLS 请求在 D 已取得 L0/L1a 后锁定当前 L1b 管理行，要求单独的 `read_fence` 权限，绑定准确 read request hash，并在 FinalGuard 重新验证证书、行版本和权限。观察结果不证明某次不确定 COMMIT 的来源，也不授予写入、部署管理或历史 Stat 权限。

首次远端运行记录在 [失败日志](evidence/a-recovery-authority-read-mysql-remote-20261010.txt)：fresh migration 94 文件通过，但 `TestSystemRecoveryAuthorityReadMySQL` 的空状态观察返回 `producer_unavailable`。专属数据库、namespace、远端 scratch、本地缓存均已清理。原因是测试夹具沿用合成 scope，而 D 的完整只读事务会核对真实 MySQL `@@server_uuid` 和 `DATABASE()`；夹具现从同一测试连接读取这两项并用于全程 scope、L1b 行和请求。生产读权限逻辑未改。

修正后的本地 `-ProducerRecoveryOnly -RecoveryTest ARead -BuildParallelism 1` 预检退出 0：定向测试、默认 vet、MySQL tag 离线 seed、Linux 探针及 pinned migration runner 编译通过，脚本输出 `CLEANED local-registration-build-cache=True`。该次本地探针 SHA-256 `6279407ca7aad0b910e364422aaa328e692f4e7d1ff921ed15c7e904865adb60`，DDL SHA-256 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，runner SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。

操作者随后执行下列命令，[第二轮完整日志](evidence/a-recovery-authority-read-mysql-remote-20261010-r2.txt)记录 run `sbk-mig-261010064256-5935`、UID `e9985cc2-98fe-4e2a-9715-f6827549f2e1`：94 文件 fresh migration、`TestSystemRecoveryAuthorityReadMySQL` 和 `PASS a-recovery-authority-read-mysql` 均通过，`A_AUTHORITY_READ_REMOTE_EXIT=0`。该 run 本地与远端探针 SHA-256 同为 `6e9dd44db3886ecd3cf2497117f22e5afffd0e1b7da4ea06ea294a463a13d855`，DDL 与 runner 摘要同上；专属数据库、准确 namespace、远端 scratch 与本地缓存均报告 `CLEANED`，无 `CLEANUP_PENDING`。首次失败仍保留为单独历史回执。此项仅验收 A 的管理只读接线，不批准生产管理注册、C Stat、正式迁移或完整恢复授权。

## 操作者完整命令

在 Windows PowerShell 从仓库根目录运行。源码摘要变化时停止并重新做本地预检；脚本在远程模式会重新执行本地门禁、编译一次并上传准确探针。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$expected = @{
  'backend/internal/systembackupevidence/system_recovery_authority_read.go' = 'd8325ed8422e21aa8104640b9501062319c9f7e5f6c85aaaca0727b7d2fefd0e'
  'backend/internal/systembackupevidence/system_recovery_authority_read_test.go' = '30a6b9dbbfc43b7aea70729bcbb3c5a4f730f9c3e8118d96ade1cfa34913ccc7'
  'backend/internal/systembackupevidence/a_recovery_authority_read_mysql_test.go' = 'cc301acc96c9c9f0d734003eb647b0cce411d63394f94b51e0a79c10d262fc55'
}
foreach ($path in $expected.Keys) {
  if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[$path]) { throw "Input changed: $path" }
}
$shared = @('scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-producer-service-phase.sh')
$sharedBefore = @{}
foreach ($path in $shared) { $sharedBefore[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
$log = 'docs/evidence/a-recovery-authority-read-mysql-remote-20261010-r2.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest ARead -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'A recovery authority read MySQL validation failed' }
  foreach ($path in $expected.Keys) {
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[$path]) { throw "Input changed during run: $path" }
  }
  foreach ($path in $shared) {
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $sharedBefore[$path]) { throw "Script changed during run: $path" }
  }
  Write-Output 'A_AUTHORITY_READ_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

验收标准：新的 namespace/UID、94 文件 fresh migration、`--- PASS: TestSystemRecoveryAuthorityReadMySQL`、`PASS a-recovery-authority-read-mysql`、本次本地与远端探针/DDL/runner 三项 SHA-256 一致、`A_AUTHORITY_READ_REMOTE_EXIT=0`；专属数据库、准确 UID namespace、远端 scratch 与本地缓存均 `CLEANED`，无 `CLEANUP_PENDING`。测试使用真实 L1b 行和 D 只读事务，覆盖尚无部署时的空观察与当前管理读权限撤销；不关闭生产管理注册、C Stat、正式迁移或 V01–V10。
