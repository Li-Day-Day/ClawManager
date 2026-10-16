# A 配置 proof 签发独立 MySQL 专项

本专项补足 [配置 proof 本地签发验证](system-backup-a-d-config-mutation-review-20261015.md)的真实数据库边界。仅使用新建 `sbk-mig-*` namespace 中的 MySQL，完整重放当前 94 份正式迁移并校对 ledger、catalog、namespace UID 和 server UUID。不执行配置 update/rollback writer、081/082 提案或旧行回填，不修改实际应用库。

## 当前状态

已新增 tagged 探针与无外部文件依赖的 seed、独立 `ConfigProofOnly` profile、冻结源码 wrapper 和 11 项派发回归。三份 Shell 已用已安装的 Git Bash 执行 `bash -n` 通过；首次沙箱调用因 signal pipe 权限失败未执行脚本，随后只读语法检查成功。未安装依赖或启动远测。

本地门禁已通过，最终退出 0，见[完整输出](evidence/a-config-proof-mysql-local-20261015.txt)、[固定输入](evidence/a-config-proof-mysql-source-20261015.json)与[验收记录](evidence/a-config-proof-mysql-local-review-20261015.json)。1,196 项输入摘要为 `3c4b7ff525cc9784fbf05c2433de14c05c7e1aa1fb5aebd5ac42bf9ee41095e4`；proof 定向 6 主测试/30 子用例、seed 1 主测试/6 子用例，共 43 项不同 Go 检查通过。另将同一 seed 编译为 Windows 二进制并从空目录运行通过，重复覆盖不另加总。默认 vet 开启，无工具重试；11 项派发回归和三份 Shell 语法检查通过。Linux 探针及 pinned migration runner 均构建成功。

Linux 探针 SHA-256 为 `81103fe9a96bf16afb24a1abd38b9cb37fe4782aed35334ce6d79219ccf4cb92`，输入 capsule 为 `92e50348689afc87ba35edb8b8caca3c9ece060b75ebcac7732396c2f39e0854`，迁移 runner 为 `d7713a41078fadcbe20d151b4a2e8e7340148abf8f7c44133a21bcff0cc42e36`。测试后冻结副本复核通过；归档时全部 1,196 项已有 live 输入仍匹配。该定向门禁不扩大为完整 D writer 或整个工作树的回归验收。

本轮源码目录 `.tmp-d-index-cache-1450e30bb2a04913a08f6609a3fc5e81` 及其 `source/.tmp-a-evidence-e50aa85a92774bd49eda39f9b0eda177` cache/tmp/telemetry、二进制和 bundle 已删除，并独立确认两条准确路径不存在。未安装依赖、未 SSH、未执行真实 MySQL。15 项数据库用例仍待操作者远测。

## 范围与通过条件

`TestAConfigProofMySQL` 共 15 个直接子用例：HTTPS update/rollback proof 两项；同一 TOTP 并发仅一次；缺失、撤销、缩短及 issued-at 撤销会话；停用用户、改密、未确认 TOTP；签名失败；审计触发器故障回滚；真实 COMMIT 后合成丢失回执；实际 config 行锁等待后配置撤权；签名期间由数据库观测到会话过期。

HTTPS 使用实际 JWT、bcrypt、AES-GCM TOTP 和 Ed25519 验签。registry、管理员、MFA seed、issuer 和 key 均为合成测试材料，不代表管理员本人 MFA、实际运行 grant、生产目录事实或 provider 证明。COMMIT 丢失由驱动在实际提交成功后注入，并非真实断网事故。

并发与撤权用例通过 `performance_schema.data_lock_waits` 按 worker 的实际 CONNECTION_ID、库和表证明等待发生，再释放 blocker；没有观察到等待就失败，不按时长猜测。每项 fixture 用独立安装、用户和会话；失败不得释放 proof 或遗留 committed TOTP step/verified audit。丢失回执例外要求数据确实提交，同时不释放 proof、相同验证码不能再次签发。

fixture 清理自身行和审计触发器；外层 harness 按准确 namespace UID 删除隔离环境，再清理远端 scratch。wrapper 删除本轮源码副本，子入口 finally 删除本轮 cache/tmp/telemetry、Windows/Linux 二进制和 bundle。证据日志和 manifest 保留。

## 操作者远测命令

从仓库根目录的 PowerShell 执行；此命令包含本地冻结、测试与编译，再 SSH 上传运行专项。操作者执行前应先确认下方本地验收已通过。已通过的十五表业务恢复、旧登录会话或 A/D 管理读取套件不在本 profile 中重新执行。

```powershell
$proofStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$proofLog = ".\docs\evidence\a-config-proof-mysql-remote-$proofStamp.txt"
$proofSource = ".\docs\evidence\a-config-proof-mysql-remote-source-$proofStamp.json"
$proofExit = 1
Start-Transcript -Path $proofLog -NoClobber
try {
    & .\scripts\system-backup-a-config-proof-validation.ps1 -Remote -BuildParallelism 1 -SourceManifestPath $proofSource
    $proofExit = 0
} finally {
    Write-Output "a_config_proof_mysql_exit=$proofExit"
    Stop-Transcript
}
```

回传完整 transcript 与 source manifest。核验 94 文件迁移、15 项子用例及两个 `OBSERVED session lock wait`（state/config）、`PASS a-config-proof-mysql`、准确 UID namespace 和两端清理、冻结副本 postcheck 与最终退出 0。任何 `CLEANUP_PENDING` 必须保留准确身份并处理；仅有二进制构建成功不算真实 SQL 通过。远测重新冻结当时源码，须按该轮摘要验收，不自动继承本地冻结副本的结论。
