# A 准备调用 L8：真实 MySQL 缺席锁验收记录

日期：2026-10-08。A 已将 `content_read/wrap` 的 evidence 缺席检查接入 D 的真实 Execution 事务，并在最终 Guard 复查。操作者已运行隔离远程套件，InnoDB 缺席范围锁的跨连接行为在本次限定范围内通过。

## 本地完成范围

[适配器](../backend/internal/systembackupevidence/system_preparation_call.go) 只接受原准确的 scope/run/evidence/主体、两种调用 purpose、策略摘要和 provider ref；L8 对唯一 `public_id` 做 `FOR UPDATE` 缺席读取，拒绝已存在行、查询失败和 Guard 前新增行。其余当前部署、身份撤销、host/ref、容量及审计仍由 D/生产 authority 负责。[跨包用例](../backend/internal/systembackupevidence/system_preparation_call_integration_test.go)使用 D 实际生命周期/快照和本地 TLS JWT/Transit 完成加密，并验证缺席行竞争的最终回滚。

[最终本地完整日志](evidence/a-preparation-gap-lock-final-local-20261008.txt)和[冻结快照](evidence/system-backup-a-producer-snapshot-20261008-080606-a325d8a3.json)显示：861 个输入文件零漂移，188 个主测试及 1573 个子测试通过，额外 100 次取消回滚用例、默认 vet、带 MySQL tag 的离线 seed、Linux 探针与迁移二进制编译通过；退出 0，专属源码副本、缓存及二进制已清理。真实 MySQL 与 provider 未在本地运行。

首次[远程日志](evidence/a-preparation-call-mysql-remote-20261008-154330.txt)退出非零：24 个 MySQL 子用例中，23 个通过，`preparation_absence_gap_lock` 在原事务释放锁后的第二次 INSERT 报 MySQL 1062。旧测试给第一次竞争 INSERT 设置了 800 毫秒客户端超时；客户端超时后服务器仍可能等待解锁并提交，所以再插同一主键是测试竞态。修复后的用例只发起一条竞争 INSERT，先观察它在锁内 800 毫秒不返回，再释放锁并等待这同一条 INSERT 成功，最后核对行数和新准备调用被拒绝。首次远程运行的专属数据库、namespace、远端 scratch 及本地缓存已按日志清理；该次结果保持失败，不追认为通过。

修正版[完整远程日志](evidence/a-preparation-call-mysql-remote-20261008-161704.txt)及[接收记录](evidence/a-preparation-call-mysql-remote-sbk-mig-261008082403-4cba.json)显示 `TestDProducerMySQL` 实际 **24/24** 子项通过，其中 `preparation_absence_gap_lock` 通过；24 个专属数据库逐项清理，namespace/UID、远端 scratch、本地两个缓存清理齐全，`snapshot-passed=True`、零漂移、wrapper 退出 0。探针和 DDL 摘要在本地与远端输出一致。`close - IO is still pending on closed socket` 是 SSH 关闭诊断，此运行随后完成清理并退出 0。成功套件无需重跑。先前交接写作 23 项，遗漏了 `independent_historical_receipt_closed_domain`；以日志中的 24 项为准。

## 已执行的远程完整命令

在本机 PowerShell 执行。此入口先核对冻结输入并完成离线构建，再按既有脚本连接 `root@10.130.14.23` 的隔离 namespace/emptyDir MySQL；不安装依赖。指纹变化会在远程连接前停止。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$aPrepLog = Join-Path (Get-Location) ('docs\evidence\a-preparation-call-mysql-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
& 'C:\Users\zhanghui08\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe' -NoProfile -ExecutionPolicy Bypass `
    -File '.\scripts\system-backup-a-producer-adapter-validation.ps1' `
    -MySQLService -Remote `
    -ExpectedSnapshot '.\docs\evidence\system-backup-a-producer-snapshot-20261008-080606-a325d8a3.json' 2>&1 |
    Tee-Object -FilePath $aPrepLog
$aPrepExit = $LASTEXITCODE
"a_preparation_call_remote_exit=$aPrepExit" | Tee-Object -FilePath $aPrepLog -Append
Write-Host "日志文件：$aPrepLog"
if ($aPrepExit -ne 0) { throw "MySQL 验证未通过，退出码：$aPrepExit" }
```

## 验收标准

`TestDProducerMySQL/preparation_absence_gap_lock` 与 `TestDProducerMySQL` 全部 24 个子用例已通过，出现 `PASS d-producer-service-mysql`。新用例证明：原 D 事务在最终 Guard 前持有缺席范围锁时，竞争 INSERT 等待至少 800 毫秒；事务释放后这同一条 INSERT 成功且仅有一行；已有 evidence 后的新准备调用被拒绝。这个用例只证明 InnoDB 的该执行计划和事务边界，不代表生产 authority 已接入。

同次构建的 binary/DDL SHA-256 与远端校验一致，24 个专属数据库清理记录、匹配 namespace/UID 的 `CLEANED`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True`、`CLEANED producer-adapter-build-cache=True` 和 `a_preparation_call_remote_exit=0` 均已核对。此前 22/22 远程成功快照保持原范围；本次验收只接收本次运行证明的范围。

生产身份/evaluator、C 独立 profile/不存在/结果证明、真实 provider、历史恢复及 V01–V10 仍在后续范围。

