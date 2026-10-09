# A 历史 evidence 行重建：只读比较原语

日期：2026-10-08。进程丢失后不能从调用者提供的 `Prepared` 恢复执行权。v12 系统 producer 恢复只允许当前独立恢复身份取得原历史绑定，再对原对象做 Stat 并收敛 evidence；不得重新 Wrap、PUT 或延长原观察期。

## 本轮实现边界

[只读加载原语](../backend/internal/systembackupevidence/system_historical_original.go)仅接受 D 拥有的 `*Transaction`。调用者必须在其前缀中完成当前身份、撤销、协调锁、历史引用和恢复授权；该原语本身不执行这些授权，也不开放为 HTTP/provider 入口。它按原 evidence ID 对 A registry 和 chunks 做锁定读取，从存储列还原 manifest，再与 D 的严格历史绑定、通道、manifest 摘要、完整 A 不变字段及当前行状态做两次核对。返回值只有 `Record`，不创建 `Prepared`、`ExecutionHandle`、claim 或 provider 凭据。

[隔离用例](../backend/internal/systembackupevidence/system_historical_original_test.go)覆盖 pending/ready 原字节重建及缺行、缺块、A 行或块变更、D 历史 manifest 摘要变更的拒绝。[真实 MySQL 子用例](../backend/internal/systembackupevidence/d_producer_mysql_test.go)在 D 事务内重建 pending/ready，核对 D 绑定及 A 行篡改均被拒绝，并让另一连接尝试更新同一 A 行：原历史读取事务必须持锁阻塞它，释放后更新才能落库。该子用例的远端验收见下方记录。

2026-10-09 补充：[旧版写恢复入口](../backend/internal/systembackupevidence/write_recovery.go)现在明确拒绝 `system/capability_snapshot`，防止它借当前活动配置认领系统 producer 的历史 evidence。普通 `system/diagnostic` 仍可走原路径；[两条回归用例](../backend/internal/systembackupevidence/write_recovery_test.go)验证拒绝前没有 Stat、写入或恢复审计，以及普通系统 evidence 保持可恢复。[旧版恢复扫描器](../backend/internal/systembackupevidence/recovery_scan.go)也排除 `system/capability_snapshot`，避免同一行每轮成为无效候选；[真实 MySQL 用例](../backend/internal/systembackupevidence/evidence_mysql_test.go)在原隔离数据库中验证该类被排除且 `system/diagnostic` 仍可被扫描。[本地门禁日志](evidence/a-legacy-recovery-scan-local-20261009.txt)及 [867 文件快照](evidence/system-backup-a-producer-snapshot-20261009-004155-77d4ae43.json)记录 A/D 测试、默认 vet、MySQL tag 离线 seed、Linux 探针与迁移编译通过，退出 0、零漂移，构建缓存已清理；该本地门禁未运行真实 MySQL。

【历史行锁真实 MySQL 已验收】操作者的[远端日志](evidence/a-historical-record-mysql-remote-20261009-083920.txt)证明冻结的 D producer MySQL 套件 26/26 通过，其中 `historical_record_locked_reconstruction` 包括并发行锁竞争；26 个运行专属数据库、namespace/UID、远端 scratch 与本地缓存均显示清理，退出码 0。见[限定范围接收记录](evidence/a-historical-record-mysql-remote-sbk-mig-261009005351-5dea.json)。该次 `SNAPSHOT live-drift-files=2 snapshot-passed=True`：冻结副本通过，运行期间活树中的 `recovery_scan.go`、`evidence_mysql_test.go` 发生后续改动；该回执不覆盖新的扫描筛选。D MySQL 套件无需重复运行。

## 仍需的生产接线

D 提供独立 `LoadHistoricalBinding`、扫描/认领与最终 Guard 的事务入口；A 按 v12 合同创建独立的 `HistoricalAuthority`，绑定当前部署、scope、准确 evidence ID、恢复身份及撤销、只允许 Stat 的权限与截止，并只在 D 已授权且锁序成立的事务内调用本原语。C 提供受限 Stat 通道、准确版本/摘要/大小证明。后续实现只能按原 owner 写截止与 claim 状态收敛 pending/write_unknown/ready；404 与网络失败保持未知并登记退避。现有实时 `SystemPublisher` 与结果投影不应借此原语取得新执行权。生产跨组件锁序和真实 provider 验证尚未由本轮证明。

当前 D 的 `HistoricalReceiptReader` 和 `HistoricalCommandReceiptReader` 只读已提交收据，不能替代原历史 evidence 绑定和恢复认领。A 下一步须实现与原 producer 句柄隔离的 `HistoricalAuthority`，不能从调用者提供的 ID 或旧配置自行推导授权；D 再提供按准确 scope/evidence ID 锁定的历史绑定读取、恢复 claim 和最终 Guard。随后 A 在同一 D 事务的 L8 使用 `loadSystemHistoricalRecord`，仅按 C 对原 ref 的受限 Stat 证明更新原 evidence 行及退避状态。C 的证明必须绑定准确 ref、版本、checksum、size、当前恢复身份和短截止；它不能授权 Wrap、PUT、Range、Delete 或原执行续租。完成时需用真实 MySQL 覆盖旧配置停用/轮换、claim 接管、行锁等待、404/超时未知及审计/Guard 回滚。

## A evidence 扫描筛选远端 MySQL 已验收

[A evidence 冻结模式本地日志](evidence/a-evidence-mysql-frozen-local-20261009.txt)与[867 文件快照](evidence/system-backup-a-producer-snapshot-20261009-010042-7ed3e5cc.json)记录 A evidence 测试、默认 vet、MySQL tag 离线 seed、Linux 探针及迁移编译通过，零漂移、缓存清理、退出码 0。操作者随后按下列命令在隔离 MySQL 8.4.8 运行；[完整远端日志](evidence/a-evidence-recovery-scan-mysql-remote-20261009-091741.txt)与[限定范围接收记录](evidence/a-evidence-recovery-scan-mysql-remote-sbk-mig-261009012930-5373.json)证明 `TestAEvidenceMySQL` 九个顶层子用例全部通过，包括扫描器排除 `system/capability_snapshot` 而保留 `system/diagnostic`；运行专属数据库、namespace/UID、远端 scratch 及本地缓存均显示清理，最终退出码 0。运行快照通过，`live-drift-files=3` 仅涉及随后修改的 D producer MySQL 和 domain-open 文件，不涉及冻结的扫描器及其用例。因此这一 A MySQL 套件已验收，无需重跑。下面命令保留为本次运行记录：

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$aScanLog = Join-Path (Get-Location) ('docs\evidence\a-evidence-recovery-scan-mysql-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
& 'C:\Users\zhanghui08\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe' -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\system-backup-a-producer-adapter-validation.ps1' `
  -EvidenceMySQL -Remote `
  -ExpectedSnapshot '.\docs\evidence\system-backup-a-producer-snapshot-20261009-010042-7ed3e5cc.json' 2>&1 |
  Tee-Object -FilePath $aScanLog
$aScanExit = $LASTEXITCODE
"a_evidence_scan_remote_exit=$aScanExit" | Tee-Object -FilePath $aScanLog -Append
Write-Host "日志文件：$aScanLog"
if ($aScanExit -ne 0) { throw "A evidence MySQL 验证未通过，退出码：$aScanExit" }
```

该次 `SNAPSHOT live-drift-files=3 snapshot-passed=True` 证明冻结副本通过；上述三个活树改动不在接收范围内。远端 MySQL 结果不证明 D 的生产历史授权、C 受限 Stat 或真实 provider 验收。
