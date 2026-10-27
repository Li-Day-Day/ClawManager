# A 历史恢复身份绑定增量 MySQL 交接（2026-10-10）

本专项只验证 A 新增的 subject/CA/证书 pin 请求绑定、授权截止失败关闭，与 D 既有历史恢复事务和 A 原 evidence 重建在隔离 MySQL 中继续贯通。它不验收候选当前部署/管理表、生产 `SystemHistoricalAuthority`、管理权限或 C 的真实受限 Stat 证明。

## 本地预检

[完整本地日志](evidence/a-historical-authority-preflight-local-20261010.txt)记录 `-ProducerRecoveryOnly -RecoveryTest A -BuildParallelism 1` 退出 0；定向测试与默认 vet、MySQL seed、Linux 探针及迁移工具编译通过，`CLEANED local-registration-build-cache=True`。首次 Windows vet 进程报 `0xc0000043`，脚本在同一源码和隔离缓存下重试一次通过；首次失败不作 PASS。另一次本地定向测试覆盖独立管理 mTLS、SystemPeer、历史工作负载与恢复适配，退出 0，临时缓存已清理。

预检输出指纹：探针 `e7d8ace89c18495e1312f4a9c1d69c5461c08de89f7bb04e90e9c8f18a585feb`；组合 DDL `97abacd3f045046d01cb74211362a9a6aeada8c724c16958b48178517d5c8ff8`；迁移工具 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。这只是本地预检，`real_mysql=not_run`。

## 操作者在 Windows PowerShell 中执行

从仓库根目录运行以下完整命令。脚本只创建隔离 namespace 与 run-owned MySQL 数据库；它不修改现有业务数据库。源码或脚本摘要不符时，先停止并重新做本地预检，不能沿用本页指纹。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$expected = @{
  'backend/internal/systembackupevidence/system_peer.go' = 'f329a34e052a507b41515e8c01113e8240a6a02398c847d69925a3fe494c5588'
  'backend/internal/systembackupevidence/system_historical_workload.go' = '8fdab9e8f4779a8ca52dab1da199e659f9e1155f09848f68963e28a1c5c83a1e'
  'backend/internal/systembackupevidence/system_historical_recovery.go' = '4580a9196b6d6763a2ac15995410b171692fc7e639e6e39ca8f469e74e8e28c7'
  'backend/internal/systembackupevidence/system_recovery_manager_peer.go' = '8d01cdfbf5665edfb31556c4ebc347c1863fddecf6f7dc23f5e40c27bc5f4be2'
  'backend/internal/systembackupevidence/a_historical_recovery_mysql_test.go' = '55e3fe65196e6d9604055a865c8fd05622ca54b7aa4c2c9bbc0876cab066e180'
  'scripts/system-backup-a-evidence-validation.ps1' = '43c63f1a9a60579842f27d921c1b23e4d0fb6481b45c3aeb3631934e12dc5a50'
  'scripts/system-backup-d-producer-service-phase.sh' = '55a4ceca2abb64be6b68066adcbfdb81df18d0c9220de063e98a8fb082738e7d'
}
foreach ($path in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$path]) { throw "Input changed: $path" }
}
$log = 'docs/evidence/a-historical-authority-mtls-mysql-remote-20261010.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest A -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'A historical authority MySQL validation failed' }
} finally {
  Stop-Transcript
}
```

## 接收标准

- 完整日志包含准确新 namespace 与 UID、94 文件 fresh migration 回放、`TestAHistoricalRecoveryMySQL` 通过和 `PASS a-producer-recovery-mysql`；wrapper 最终退出 0。
- 远端日志报告的探针、组合 DDL 和迁移工具 SHA-256 与上方本地指纹相同；不匹配则本轮不接收。
- 两个 run-owned 数据库、准确 UID 的 namespace、远端 scratch、本地构建缓存均明确 `CLEANED`，没有 `CLEANUP_PENDING`。若任一步失败，保留原始日志和清理标记，不把旧成功回执挪用到新源码。

操作者回传完整日志与最终 shell 退出码后，A 逐项核对并记录限定范围结论。即使通过，生产当前部署授权、管理读写、C Stat profile、正式迁移与 V01–V10 仍独立待办。

## 操作者回执与 A 限定范围接收

操作者已执行上方 A profile，完整 [PowerShell transcript](evidence/a-historical-authority-mtls-mysql-remote-20261010.txt)在仓库中。run `sbk-mig-261010012323-0a40` 的 namespace UID 为 `3010bb9b-e649-4db4-8c38-b897f603bd39`，MySQL 为 8.4.8。94 文件 fresh replay、`TestAHistoricalRecoveryMySQL`（含损坏原 chunk 拒绝）与 `PASS a-producer-recovery-mysql` 均出现；两个专属数据库、准确 UID namespace、远端 scratch 和本地构建缓存均报告清理，未见 `CLEANUP_PENDING`。探针、DDL、迁移工具摘要与本地预检逐项相同；上述七个源码/脚本 SHA-256 在回执后复核仍与运行前冻结值相同。SSH 密码提示附近有 closed-socket 文本，但远程测试及随后清理完整输出。transcript 末尾没有独立打印 PowerShell 进程退出码；包装脚本对外部命令非零返回会抛错，操作者的 `if (-not $?)` 检查未触发，且 transcript 正常结束。A 据此**限定范围接收**本次 A mTLS 请求绑定 × D 历史事务 × 原行重建的隔离 MySQL 专项，不将其记为生产部署授权或 C provider 验收。此成功范围无需重跑。
