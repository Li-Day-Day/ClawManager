# A 配置 proof 签发独立 MySQL 专项

本专项补足 [配置 proof 本地签发验证](system-backup-a-d-config-mutation-review-20261015.md)的真实数据库边界。仅使用新建 `sbk-mig-*` namespace 中的 MySQL，完整重放执行时的正式迁移（当前合并后为 95 文件；下方 10 月 15 日历史记录为 94 文件）并校对 ledger、catalog、namespace UID 和 server UUID。不执行配置 update/rollback writer、081/082 提案或旧行回填，不修改实际应用库。

## 当前状态

2026-10-16 11:06–11:24 操作者远测已限定接收，十五项专项待办关闭，无需重跑。见[完整日志](evidence/a-config-proof-mysql-remote-20261016-110614-b99f5f47.txt)、[当轮源码清单](evidence/a-config-proof-mysql-remote-source-20261016-110614-b99f5f47.json)与[独立验收回执](evidence/a-config-proof-mysql-accepted-sbk-mig-261016032334-5226.json)。1,292 项输入稳定捕获第一次成功，source `476a88c5f3b645b66ac604f1e69f6ea7f26a5820e699886a711d2376dc98e36b`；44 项不同本地 Go 检查、11 项不同派发、默认 vet、Linux probe/runner、MySQL 8.4.8 完整 95 文件正式迁移与 15/15 叶子全部通过，最终退出 0。重复 seed/派发不重复计数。

当轮 namespace `sbk-mig-261016032334-5226`、UID `87f15bb5-1b91-40c1-8479-a13a7ec785c7`，catalog `2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237`；probe/input/runner 的本地与远端 pin 一致。state/config 两次实际行锁等待、十五份 owned 数据清理、准确 namespace 与远端 scratch、内层 cache 清理、冻结副本 postcheck 均有记录，准确源码 owner 独立确认不存在。内层 owner 路径没有输出，仅接收其清理报告及外层 owner 缺席，不声称单独检查远端或未知内层路径。四条 socket-close 诊断后仍有完整成功及清理链，派发负向测试的预期 TerminatingError 不记作 SQL 失败。

25 项核对通过，归档时 254 份 security/proof/迁移重点输入仍匹配；原清单唯一变化为并行 D 的 `scripts/system-backup-d-control-health-validation.ps1`，新增输入未纳入接收。本轮只覆盖冻结 proof 签发，不签收整个当前树；合成人员/MFA/issuer/key、真实提交后合成回执丢失边界保留，没有执行配置 writer/回填或授予运行维护权限。以下准备失败与本地待远测描述均为历史记录，以本条为当前状态。

## 历史准备与本地门禁

2026-10-16 后续准备修订：操作者 [10:26 日志](evidence/a-config-proof-mysql-remote-20261016-102630-2be3b2af.txt)与 [10:30 日志](evidence/a-config-proof-mysql-remote-20261016-103036-61621cef.txt)均在 `Source changed while snapshot was copied` 退出 1，未发布 source manifest、未编译/SSH/运行 SQL；两个准确 owner 已确认不存在，不记作 MySQL 断言失败。[新准备回执](evidence/a-config-proof-source-retry-review-20261016.json)对应私有 source helper：仅对源码内容/文件集合变化最多捕获三次，重试前核对 owner 并删除部分副本；每次仍要求完整前后 pins 一致。权限/重定向/其他 I/O、Go、SSH 和 SQL 失败均不重试，manifest 只在稳定捕获成功后写入，下游仅调用一次。

八个准备场景分别在 PowerShell 7 与用户实际使用的 Windows PowerShell 5.1 通过；原五项快照保护及十一项派发检查通过。含两个实际 wrapper 的测试用例将下游替换为显式 stub，只验证准备阶段与恰好一次派发，不当作 Go/vet/远测成功。随后对真实当前 1,288 项输入的单次稳定捕获与 postcheck 通过，相关九条本地 owner 路径确认删除。该准备验证没有重新构建 Go 或执行远测，旧本地编译回执保留其原冻结范围。下方操作者完整命令和参数不变，新轮将冻结当时输入后再编译/远测；十五项真实 SQL 仍未执行。

2026-10-16 新门禁已通过，见[当轮本地回执](evidence/a-config-proof-mysql-local-review-20261016.json)与[原日志](evidence/a-config-proof-mysql-local-20261016-095009.txt)。冻结 1,274 项输入，正式 catalog 95 文件；7 项 proof 主测试/30 子用例及独立 seed 1/6，共 44 项不同 Go 检查通过，同 seed 从空 CWD Windows executable 再执行，不重复加总。11 项派发、默认 vet、Linux 探针及 migration runner 编译、冻结副本 postcheck 和最终退出 0 均通过，无工具重试。源码 owner 路径独立确认不存在，内层 build cache 已报告清理；未执行 15 项真实 MySQL。108 项 proof/迁移重点输入在归档时匹配；之后新增 holder 及并行 server/控制面输入不据此接收为整个当前树通过。远测由用户按本页完整命令执行，按新一轮 source/binary/catalog 单独验收。以下 10 月 15 日记录保留原冻结范围。

已新增 tagged 探针与无外部文件依赖的 seed、独立 `ConfigProofOnly` profile、冻结源码 wrapper 和 11 项派发回归。三份 Shell 已用已安装的 Git Bash 执行 `bash -n` 通过；首次沙箱调用因 signal pipe 权限失败未执行脚本，随后只读语法检查成功。未安装依赖或启动远测。

本地门禁已通过，最终退出 0，见[完整输出](evidence/a-config-proof-mysql-local-20261015.txt)、[固定输入](evidence/a-config-proof-mysql-source-20261015.json)与[验收记录](evidence/a-config-proof-mysql-local-review-20261015.json)。1,196 项输入摘要为 `3c4b7ff525cc9784fbf05c2433de14c05c7e1aa1fb5aebd5ac42bf9ee41095e4`；proof 定向 6 主测试/30 子用例、seed 1 主测试/6 子用例，共 43 项不同 Go 检查通过。另将同一 seed 编译为 Windows 二进制并从空目录运行通过，重复覆盖不另加总。默认 vet 开启，无工具重试；11 项派发回归和三份 Shell 语法检查通过。Linux 探针及 pinned migration runner 均构建成功。

Linux 探针 SHA-256 为 `81103fe9a96bf16afb24a1abd38b9cb37fe4782aed35334ce6d79219ccf4cb92`，输入 capsule 为 `92e50348689afc87ba35edb8b8caca3c9ece060b75ebcac7732396c2f39e0854`，迁移 runner 为 `d7713a41078fadcbe20d151b4a2e8e7340148abf8f7c44133a21bcff0cc42e36`。测试后冻结副本复核通过；归档时全部 1,196 项已有 live 输入仍匹配。该定向门禁不扩大为完整 D writer 或整个工作树的回归验收。

本轮源码目录 `.tmp-d-index-cache-1450e30bb2a04913a08f6609a3fc5e81` 及其 `source/.tmp-a-evidence-e50aa85a92774bd49eda39f9b0eda177` cache/tmp/telemetry、二进制和 bundle 已删除，并独立确认两条准确路径不存在。未安装依赖、未 SSH、未执行真实 MySQL。15 项数据库用例仍待操作者远测。

## 范围与通过条件

`TestAConfigProofMySQL` 共 15 个直接子用例：HTTPS update/rollback proof 两项；同一 TOTP 并发仅一次；缺失、撤销、缩短及 issued-at 撤销会话；停用用户、改密、未确认 TOTP；签名失败；审计触发器故障回滚；真实 COMMIT 后合成丢失回执；实际 config 行锁等待后配置撤权；签名期间由数据库观测到会话过期。

HTTPS 使用实际 JWT、bcrypt、AES-GCM TOTP 和 Ed25519 验签。registry、管理员、MFA seed、issuer 和 key 均为合成测试材料，不代表管理员本人 MFA、实际运行 grant、生产目录事实或 provider 证明。COMMIT 丢失由驱动在实际提交成功后注入，并非真实断网事故。

并发与撤权用例通过 `performance_schema.data_lock_waits` 按 worker 的实际 CONNECTION_ID、库和表证明等待发生，再释放 blocker；没有观察到等待就失败，不按时长猜测。每项 fixture 用独立安装、用户和会话；失败不得释放 proof 或遗留 committed TOTP step/verified audit。丢失回执例外要求数据确实提交，同时不释放 proof、相同验证码不能再次签发。

fixture 清理自身行和审计触发器；外层 harness 按准确 namespace UID 删除隔离环境，再清理远端 scratch。wrapper 删除本轮源码副本，子入口 finally 删除本轮 cache/tmp/telemetry、Windows/Linux 二进制和 bundle。证据日志和 manifest 保留。

## 已执行的操作者远测命令（归档，无需重跑）

由用户在本机 PowerShell 执行；本轮已明确 A 不执行远测。此命令包含本地冻结、测试与编译，再由操作者交互式 SSH 上传运行专项。完整路径和随机后缀避免覆盖历史回执；不安装依赖。远测冻结执行时的当前 catalog（合并后已为 95 文件），不能沿用下方旧 94 文件回执作新轮结论。已通过的十五表业务恢复、旧登录会话或 A/D 管理读取套件不在本 profile 中重新执行。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference = 'Stop'
$proofStamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$proofLog = Join-Path $PWD.Path "docs/evidence/a-config-proof-mysql-remote-$proofStamp.txt"
$proofSource = Join-Path $PWD.Path "docs/evidence/a-config-proof-mysql-remote-source-$proofStamp.json"
$proofExit = 1
Start-Transcript -Path $proofLog -NoClobber
try {
    & .\scripts\system-backup-a-config-proof-validation.ps1 `
        -Remote -BuildParallelism 2 -SourceManifestPath $proofSource
    $proofExit = 0
} finally {
    Write-Host "a_config_proof_mysql_exit=$proofExit"
    Write-Host "proof_log=$proofLog"
    Write-Host "proof_source_manifest=$proofSource"
    Stop-Transcript
}
```

上述命令已由操作者执行并回传完整 transcript 与 source manifest，本页最新回执已关闭十五项待办。保留原核验标准供审计：当轮完整 catalog、15 项子用例及两个 `OBSERVED session lock wait`（state/config）、`PASS a-config-proof-mysql`、准确 UID namespace 和两端清理、冻结副本 postcheck 与最终退出 0。任何 `CLEANUP_PENDING` 必须保留准确身份并处理；仅有二进制构建成功不算真实 SQL 通过。每轮按自己的 source/binary/catalog 摘要限定接收。
