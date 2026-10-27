# A 接收 A D 服务 MySQL 验证交付

最新状态：A 已接收 2026-10-08 的远程复测。[完整日志](evidence/a-d-producer-service-remote-20261008-135516.txt)显示 22/22 个 MySQL 子用例通过，远端 migration replay 通过，所有 22 个临时数据库和本轮 namespace/UID 已清理，包装命令退出 0；[A 验收回执](evidence/system-backup-a-producer-service-remote-acceptance-20261008.json)记录摘要与检查结果。首次 Windows Go compile 进程异常 `0xc0000043` 后，脚本以同一冻结输入和缓存重试成功，vet 保持开启；这是工具进程故障，未出现测试断言失败。远程测试范围仍限 A/D SQL 服务链。

日期：2026-10-08。首轮远程运行 `sbk-mig-261008040523-2a2d` 未通过：22 项用例均在 Acquire 初始化报 `producer_unavailable`。22 个专属数据库、namespace/UID、远程 scratch 和本地缓存已清理，见 [失败回执](evidence/a-d-producer-service-remote-failure-20261008.json)。原 transcript 漏记部分原生进程输出，已保存用户粘贴的完整输出。SSH socket 警告不是本次断言失败的原因。

原因是夹具沿用合同样例的 server UUID/数据库名，未绑定随机临时数据库，D 的事务身份校验按预期拒绝请求。现已在写入初始记录前读取连接身份并绑定所有后续请求；生产身份检查未改。该轮数据库身份修正本地通过；后续取消回滚修正以本页最新记录为准。此次仍限定为 A/D SQL 服务链，不包含真实 STS/provider 权限、生产身份或 V01–V10 整体验收。

## 首轮本地证据（历史）

[固定快照](evidence/system-backup-d-producer-service-snapshot-20261008.json) 的 853 个输入文件在首轮交付时与工作区匹配；[最终日志](evidence/system-backup-d-producer-service-advancing-local-20261008.txt) 记录 181 个主测试、1829 项含子用例检查，固定及推进时钟 seed、默认 vet、Linux MySQL probe 与 migration runner 均通过。A 已复核快照和日志摘要、通过计数、零断言失败及本轮源码副本、缓存和二进制的清理标记。见 [A 接收回执](evidence/system-backup-a-producer-service-handoff-20261008.json) 及 [D 原始回执](evidence/system-backup-d-producer-service-mysql-20261008.json)。

A 的 [早期前置检查](evidence/system-backup-a-producer-service-preflight-20261008.txt) 退出 0，经历两次 Windows 工具故障的同快照重试，产物已清理；但运行时后续修订了时钟用例和远程脚本，因此最终交付采用上述 D 的完整修订快照，不混用早期结果。

观察时间已绑定 probe 的 CapturedAt，历史创建和模拟对象证明时间随之对齐，容量采样保持微秒精度。推进时钟 seed 使用每次 SQL 采样增加一毫秒的测试时钟，覆盖完整服务链，防止固定时钟掩盖真实数据库的先后顺序问题。

## 数据库身份修正本地门禁（历史）

本轮仅变更三个测试夹具文件，并新增 `TestDIntegrationDatabaseScope`：验证连接身份与合同向量不同时正确绑定、保留 installation，且读取失败不回退到样例身份。默认事务身份拒绝测试仍保留。

[新快照](evidence/system-backup-a-producer-snapshot-20261008-041240-2081521c.json) 包含 854 个输入文件；[本地日志](evidence/system-backup-a-producer-scope-fix-local-20261008.txt) 和 [本地回执](evidence/system-backup-a-producer-scope-fix-local-20261008.json) 记录退出 0、182 个主测试及 1830 项含子测试检查通过、固定/推进时钟 seed、默认 vet、Linux probe/migration 编译通过，源码漂移为 0，本轮产物及缓存已清理。Windows asm 进程发生一次 0xc0000043 故障，按既有规则使用相同快照和缓存重试成功；测试断言失败为 0，未安装依赖。原 853 文件快照仅为历史证据，不再匹配本轮修正。

## 取消回滚修正本地门禁

新一轮使用 [854 文件快照](evidence/system-backup-a-producer-snapshot-20261008-054411-8848e9d0.json) 与 [完整本地日志](evidence/system-backup-a-producer-cancel-fix-final-local-20261008.txt)。完整门禁退出 0：182 个主测试、1830 项含子测试检查通过，另有 100 次受控取消回滚验证通过；固定/推进时钟 seed、默认 vet、Linux probe 和 migration 编译均通过。源码漂移为 0，产物及缓存已清理，未安装依赖，本轮无工具故障重试。见 [最终本地回执](evidence/system-backup-a-producer-cancel-fix-local-20261008.json)。后续远程复测已通过，见本页顶部与下节。

## 远程复测验收

本轮使用预期快照 `054411-8848e9d0`；运行时生成的 [快照](evidence/system-backup-a-producer-snapshot-20261008-055525-711bff7e.json)也包含 854 个输入文件，逐项路径和 SHA-256 比较差异为 0。日志记录 `SNAPSHOT live-drift-files=0 snapshot-passed=True`。本地 probe 和远端校验的 binary SHA-256 均为 `023007c995fd9b15a5543377c305516bdb604f90282ae9d35eec97e316cef778`，DDL SHA-256 均为 `70d001e7cfc465f8098dc037fd932a6d76647629561e2e8be91decbdf75df016`。

远端运行于 `sbk-mig-261008060225-0672`（UID `ae9ddc4a-2856-46c9-8fb1-5986a825491f`），migration replay `001..080`、94 项应用通过；`TestDProducerMySQL` 22 个子用例全部通过。日志有 22 条专属数据库清理记录，以及匹配 namespace/UID、remote scratch、本地 registration build cache、producer adapter build cache 的清理标记；没有 `CLEANUP_PENDING`。SSH 退出时的 closed socket 提示不影响已记录的测试和清理结果。此验收不扩展至生产身份、真实 STS/provider 权限、独立历史恢复或 V01–V10 整体验收。

本轮只调整事务测试和验证脚本：取消用例主动等待后台回滚接管、暂缓驱动完成，再释放并通过完成信号同步计数读取；保留恰好一次回滚、零提交、无已提交收据断言。该受控时序另重复 100 次。生产事务实现未改，上一轮数据库身份修正仍包含在新快照中。

[中间诊断轮](evidence/system-backup-a-producer-cancel-fix-local-20261008.txt) 的两包测试通过，但新增脚本阶段名称不在允许列表内，门禁提前失败并清理。该参数已改回允许的 test-vet，并核对全部阶段参数；中间轮不计作最终完整通过。

## 完整远程命令

在本机 PowerShell 执行。目标为 root@10.130.14.23，Kubernetes context 为 kubernetes-admin@kubernetes，测试节点为 node1。命令先核对快照、离线测试并构建，再连接远端的隔离 namespace/emptyDir MySQL；不安装依赖或拉取镜像。若指纹变化，入口会在连接远程前拒绝继续。

这是修正数据库身份和取消回滚测试时序后的重测。输出通过 Tee-Object 直接保存，避免外层 Start-Transcript 漏记子进程输出。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$aProducerLog = Join-Path (Get-Location) ('docs\evidence\a-d-producer-service-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
& 'C:\Users\zhanghui08\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe' -NoProfile -ExecutionPolicy Bypass `
    -File '.\scripts\system-backup-a-producer-adapter-validation.ps1' `
    -MySQLService -Remote `
    -ExpectedSnapshot '.\docs\evidence\system-backup-a-producer-snapshot-20261008-054411-8848e9d0.json' 2>&1 |
    Tee-Object -FilePath $aProducerLog
$aProducerExit = $LASTEXITCODE
"a_d_producer_service_remote_exit=$aProducerExit" | Tee-Object -FilePath $aProducerLog -Append
Write-Host "日志文件：$aProducerLog"
if ($aProducerExit -ne 0) { throw "MySQL 验证未通过，退出码：$aProducerExit" }
```

## 验收标准

22 个 TestDProducerMySQL 子用例全部通过，并出现 `PASS d-producer-service-mysql`。本次生成的 binary/DDL 摘要须与远程校验结果一致；编译摘要按当次构建核对。

需同时有每个运行专属数据库的清理记录、匹配 namespace/UID 的 `CLEANED`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True`、`CLEANED producer-adapter-build-cache=True`，以及 `a_d_producer_service_remote_exit=0`。任何 `CLEANUP_PENDING` 或非零退出码均待处理，不能视为通过。

测试涵盖完整服务事务、精确重放、撤权/过期拒绝、审计与最终检查回滚、真实 SQL 插入失败、claim/结果并发竞争和 COMMIT 确认丢失后的收据读取。身份、引用、容量、evaluator 和 C 对象证明仍为测试 authority；生产调用环境、真实 provider、独立历史恢复及正式迁移继续保留原验收范围。已通过的登录状态、会话和旧 evidence 远程套件无需重跑。
