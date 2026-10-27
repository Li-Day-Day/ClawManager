# A 管理 mTLS 接 D 原子恢复授权：隔离 MySQL 交接

日期：2026-10-10。新增 [A 管理授权适配器](../backend/internal/systembackupevidence/system_recovery_authority.go)：从独立管理 mTLS 请求取得受信事实，在 D 已取得 L0/L1a 后锁 L1b 当前管理行，分别要求 `write_fence` 和 `manage_deployment`，把准确请求 hash、管理截止与可信部署提议交给 D 的 L1a/L2 同事务变更，并在 FinalGuard 复查证书事实、管理行和两项权限。提议及 intent/result 审计仍必须由独立受信 `SystemRecoveryAuthorityDecision` 提供；本包没有默认放行实现。首位管理主体的上级注册授权和独立紧急审计容量仍待交付。

本地定向测试、默认 vet、带 MySQL tag 的离线 seed、Linux 探针及 migration runner 编译通过，脚本报告 `CLEANED local-registration-build-cache=True`。本轮探针 SHA-256 `44f35881e7d00035a8afa3d5f74bec0c68127613583a94126026686d468bc9ab`，DDL SHA-256 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`，runner SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。编译期间 Windows `vet.exe 0xc0000043` 发生一次工具错误，随后同一预检命令重试通过；同时 D 并行编辑短暂产生未定义测试类型，远程命令会重新执行本地门禁并编译准确上传探针，不把上述快照指纹当作未来输入的固定值。当前 `real_mysql=not_run`。

## 操作者完整命令

在 Windows PowerShell 从仓库根目录执行；任一摘要不符时停止并重新准备输入。本专项只运行新增的 `AManager`，不重复先前通过的 D Manager 专项。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$expected = @{
  'backend/internal/systembackupevidence/system_recovery_authority.go' = '9a424f2b3f903277da83be8e022fa72979bc706f37036cb0707e4b03b93fe18c'
  'backend/internal/systembackupevidence/system_recovery_authority_test.go' = 'a14d21696e54188f0d219316c5fc5dada804a5226f1252f5fb8658e74152d60c'
  'backend/internal/systembackupevidence/a_recovery_authority_mysql_test.go' = '6ae9fbe4362a3014d895f140f9ccf9cfa1042b520382463f41afa7a566af40cf'
}
foreach ($path in $expected.Keys) {
  if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[$path]) { throw "Input changed: $path" }
}
$shared = @('scripts/system-backup-a-evidence-validation.ps1','scripts/system-backup-d-producer-service-phase.sh')
$sharedBefore = @{}
foreach ($path in $shared) { $sharedBefore[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
$log = 'docs/evidence/a-recovery-manager-authority-mysql-remote-20261010.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest AManager -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'A management authority MySQL validation failed' }
  foreach ($path in $expected.Keys) {
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected[$path]) { throw "Input changed during run: $path" }
  }
  foreach ($path in $shared) {
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $sharedBefore[$path]) { throw "Script changed during run: $path" }
  }
  Write-Output 'A_MANAGER_AUTHORITY_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

接收要求：新 namespace/UID、94 文件 fresh migration、`--- PASS: TestSystemRecoveryAuthorityMySQL`、`PASS a-recovery-manager-authority-mysql`、本轮本地与远端探针/DDL/runner 三项 SHA-256 一致、`A_MANAGER_AUTHORITY_REMOTE_EXIT=0`；专属数据库、准确 UID namespace、远端 scratch 和本地缓存全部 `CLEANED`，没有 `CLEANUP_PENDING`。该测试验证真实 L1b 行、mTLS 绑定和 FinalGuard 权限漂移回滚；完整 D 组合事务、生产决策/审计、首位管理者注册、C Stat、正式迁移和 V01–V10 均不由此项关闭。

## 限定范围接收

操作者完整 [PowerShell transcript](evidence/a-recovery-manager-authority-mysql-remote-20261010.txt) 的 SHA-256 为 `8f64435cb0c76bfdc5fe3d9d8ba4e56eff2b2e5ef086619af8b471de604354d8`。run `sbk-mig-261010053903-3895`，namespace UID `27aaa1be-8bc9-4bb4-9b42-a433837f435c`，MySQL 8.4.8；94 文件 fresh replay、`TestSystemRecoveryAuthorityMySQL` 与 `PASS a-recovery-manager-authority-mysql` 均通过。探针 `44f35881e7d00035a8afa3d5f74bec0c68127613583a94126026686d468bc9ab`、DDL `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`、runner `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f` 在本地/远端一致。专属数据库、准确 UID namespace、远端 scratch、本地缓存均报告清理，无 `CLEANUP_PENDING`，并输出 `A_MANAGER_AUTHORITY_REMOTE_EXIT=0`。首次 Windows compile `0xc0000043` 后同一验证脚本自动重试成功；SSH 密码提示附近 closed-socket 文本未影响测试与清理。**接收本项的 A 管理 mTLS × 当前 L1b 行隔离 MySQL 范围**，不扩大为 D 组合事务与生产策略验收。

## 后续 A/D 组合增量（待统一远程验证）

新增 `TestSystemRecoveryAuthorityCombinedMySQL`：同一隔离数据库中由 A 的真实管理 mTLS/L1b 适配调用 D 的 `RecoveryAuthorityManager.Change`，验证结果审计失败时部署行、撤销行和 intent 审计一起回滚；新请求成功后核对两行 epoch、返回结果及 intent/result 审计；当前管理行撤掉 `write_fence` 后再发起 rotate，部署/撤销代次和审计数量不得变化。测试的可信部署提议仍是 fixture，因此本增量只验证组合事务，不构成首位管理者上级注册、生产决策或独立紧急审计容量的签收。

首次本地 `-ProducerRecoveryOnly -RecoveryTest AManager -BuildParallelism 1` 通过定向 Go 测试、默认 vet、离线 MySQL seed、Linux 探针及迁移工具编译，退出 0，并报告 `CLEANED local-registration-build-cache=True`；那一版新增回滚/成功路径探针 SHA-256 为 `0c3e879773c21f14a038ae12b5392acdab3a41331a63b216ddf2ef92223d13ad`。随后加入管理写权限撤销负测并重新运行相同本地门禁，退出 0、缓存已清理；新探针 SHA-256 为 `fb346aba9dc7831e2e7122f66c71d6a90e3732d6adfea26925d3e045d189e6f3`。组合 DDL 与 runner 摘要分别为 `0cb33ce18371f31e602c0435f07206f46f53cc7bac60dacf686034c14b2dae60`、`70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。此前远测须重编译并核对同轮指纹；旧 AManager 远程回执不覆盖新增用例。

2026-10-12 操作者续跑的 [AManager/ARead 输出](evidence/system-backup-d-amanager-resume-20261012.txt)（文件 SHA-256 `de7815bf78e10afa34f748cda9486ad5e2f2545775b68871c6933852b8dcefb1`）显示：新 `AManager` 的 `PinnedDecision`、原管理授权和 `Combined` 三项真实 MySQL 测试全部通过，`PASS a-recovery-manager-authority-mysql`，run `sbk-mig-261012075716-7b8b`、UID `30e8bc9c-55be-43e1-a2a7-331d16359ad3`；94 文件 fresh migration、三个专属数据库、namespace、远端 scratch、本地缓存清理均有回执。探针 `b5f0d2822c6aa0e426243dd914733a1bd48dc4aceec6f1b90c1b69f1120d0355`、修复审计表装配后的 DDL `2474fbc894ada0607ec88e5a2a0d9056a249798d8e07e48d76f7e090aaec0f82` 与 runner 摘要在本地和远端一致，末尾 `PASS resumed profile=AManager`。同一文件随后记录 `ARead` 通过并清理；它已有前次接收，后续无需再重跑。上述结果仅接收新增 AManager 组合专项的隔离数据库范围，生产部署提议、独立审计容量、C Stat 和正式 migration 仍未签收。
