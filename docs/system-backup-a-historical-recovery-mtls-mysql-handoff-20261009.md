# A 历史恢复 mTLS × D 事务隔离 MySQL 交接（2026-10-09）

## 首次远程失败记录

操作者首次远程 run `sbk-mig-261009065153-2e5e`（UID `e663f61e-2a7e-49e8-9359-5bb5f782b9d3`）使用探针 `a8e9842e598e6e7306984845e28e6ce0c43568e013a17a53075ff5fafa1a872b`，94 个迁移文件回放通过，但 `TestAHistoricalRecoveryMySQL` 在篡改 chunk 又恢复后的正常历史读取报 `checksum_mismatch`，测试 FAIL。原日志见 [失败回执](evidence/a-historical-recovery-mtls-mysql-remote-20261009.txt)。run-owned 数据库、namespace、远端 scratch 和本地缓存均报告清理；该次不能判为通过。

修订测试已将损坏负测与正常恢复路径放在两个独立的 run-owned 数据库，避免负测的数据库写入影响正向断言。测试夹具同时给 L8 和 L10 错误加阶段标记，若仍失败可定位事务阶段。此修改不改变生产授权或 C 证明的未完成状态。

第二次远程 run `sbk-mig-261009074340-6393`（UID `3d2fe319-37b4-483a-bd18-8d832421dab3`）使用修订探针 `ad63c9a2b65bf4afd4072fb2d2f096143b037357c478dd06f5b93d3c473878e1`，在新 namespace 创建 MySQL Pod 时被 Kubernetes 拒绝：`serviceaccount "default" not found`。测试用例和迁移回放均未启动，不能判定 A 代码通过或失败。[第二次原始日志](evidence/a-historical-recovery-mtls-mysql-remote-20261009-r2.txt)保留；namespace、远端 scratch 和本地缓存均报告清理。隔离脚本现先按 namespace UID 等待默认 ServiceAccount，最多 60 秒，超时明确失败；本机 Git Bash `-n` 语法检查退出 0。没有重跑 Go 编译，因为此次只修改远程 shell 启动顺序。

第三次远程 run `sbk-mig-261009080124-03ad`（UID `d770d18f-9efa-4eea-9f03-3445a8fb7a84`）通过迁移回放和 `corrupted_original_rejected`，但独立正常数据库的 `LoadHistoricalBinding` 在 A L10 最终 Guard 报 `checksum_mismatch`，测试 FAIL。[第三次原始日志](evidence/a-historical-recovery-mtls-mysql-remote-20261009-r3.txt)保留；两个 run-owned 数据库、namespace、远端 scratch 和本地缓存均报告清理。根因是 L10 对只读 `load` 也执行了 `want.Version++`。现仅在 `claim/finish` 预期 CAS 后递增版本；只读 `load` 保持原版本，并按原行对象版本读回。第三次结果不改判；新探针须独立验收。

## 验证范围

新增 `TestAHistoricalRecoveryMySQL`，以 A 的真实 `SystemPeerAuthenticator`、请求绑定意图、原 registry/chunks 重建器接 D 的历史恢复事务和当前撤销行。D 的只读 `LoadHistoricalBinding` 现必须在 L8 调用 A 原行回调；A 最终 Guard 复查该行。独立负测数据库中篡改原 chunk，要求活请求的历史读取拒绝；另一全新数据库测试正常读取、到原 owner 写截止后认领、撤销 epoch 后拒绝旧权限，以及请求结束后拒绝身份重用。部署/容量/审计策略及 C 的 Stat 证明仍是隔离夹具；测试通过不代表生产授权或 provider 权限验收。

第四轮远程 run `sbk-mig-261009083707-27a5`（UID `eb5eac40-99ec-4255-b00c-17826ac0cc9c`）已由操作者完成，完整回执见[第四轮原始日志](evidence/a-historical-recovery-mtls-mysql-remote-20261009-r4.txt)。A 定向测试与默认 vet、MySQL seed、固定迁移工具、94 个迁移文件回放及隔离 MySQL 中的 `TestAHistoricalRecoveryMySQL` 均通过；损坏原始 chunk 的拒绝子测也通过。输出 `PASS a-producer-recovery-mysql`，探针 SHA-256 为 `5d843468d26aae658d357154ed87fc6ebbc8288408cba80c0bc5bedf938067ea`，组合 DDL 为 `97abacd3f045046d01cb74211362a9a6aeada8c724c16958b48178517d5c8ff8`，迁移工具为 `0de9fa2fe36acb028a5e449765bf7f1a1713005ec6afe2db03616b157e6f7fea`。两个 run-owned 数据库、准确 UID 的 namespace、远端 scratch 与本地构建缓存均报告清理，未见 `CLEANUP_PENDING`。这是 A mTLS 请求绑定、D 事务和 A 原行重建的专项通过；当前部署授权与 C 的真实受限 Stat 证明仍由测试夹具提供。

运行前核对以下源码 SHA-256。Go 源码或候选 DDL 改变时，先重新执行本地预检并更新探针/DDL 摘要；shell 脚本改变时，重新审查脚本、做语法检查并更新本交接。不能沿用不匹配的输入摘要。

| 文件 | SHA-256 |
| --- | --- |
| `backend/internal/systembackupproducer/recovery.go` | `751452a889ee11318c21c38ff4b9f03dab397e08d568443a2c7c0d39c3d52aaa` |
| `backend/internal/systembackupevidence/system_historical_recovery.go` | `ed52d4ff55bfbc69f51f40cc0e1acb19995c17476ddc9397d93a944460707480` |
| `backend/internal/systembackupevidence/system_historical_recovery_test.go` | `447f9294884b6bf7215c92ac35199cde8d74fd195a072cc9e3c06a7d03dbe4e4` |
| `backend/internal/systembackupevidence/a_historical_recovery_mysql_test.go` | `55e3fe65196e6d9604055a865c8fd05622ca54b7aa4c2c9bbc0876cab066e180` |
| `scripts/system-backup-a-evidence-validation.ps1` | `b20802bc6cb08fb3a14d5c2b89628b8e1b2cd047d0c15d10d9a4149beb4b6ce3` |
| `scripts/system-backup-d-producer-service-phase.sh` | `d8f86a48399cfa92531e4a53e94906c829c08e8f7e5c2080814fc457feefe0fa` |
| `scripts/system-backup-fresh-migration-smoke.sh` | `bab75aeba03bfb135167cdeb271c8c01cc0873f7f3009ec37fd95b712b4b6989` |

## 已执行的操作者远程命令

按既定远程执行约定，由操作者在 Windows PowerShell 中运行；该 profile 只执行新增 A MySQL 专项，不重跑已经验收的 D-only 恢复套件。脚本创建隔离 namespace 和 run-owned MySQL，使用候选 DDL，不修改现有业务数据库。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/a-historical-recovery-mtls-mysql-remote-20261009-r4.txt'
Start-Transcript -Path $log
try {
    & .\scripts\system-backup-a-evidence-validation.ps1 -ProducerRecoveryOnly -RecoveryTest A -Remote -SshTarget 'root@10.130.14.23'
    if (-not $?) { throw 'A historical recovery MySQL validation failed' }
} finally {
    Stop-Transcript
}
```

第四轮已满足 `PASS a-producer-recovery-mysql`、探针/DDL 摘要匹配及全部清理标记。保留完整原始日志和 namespace UID；无需重复该次专项。生产 authority、C 的真实受限 Stat 与完整 V01–V10 仍需独立交付。
