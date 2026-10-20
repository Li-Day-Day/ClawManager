# A：nonce 时间修复的八项真实 MySQL 增量交接

【2026-10-19 10:06 新轮已接收，专项关闭】操作者[完整原日志](evidence/a-nonce-time-mysql-remote-20261019-094543-e42bc741.txt)及[40 项独立验收](evidence/a-nonce-time-mysql-accepted-sbk-mig-261019020511-4e94.json)固定 1,355 来源：MySQL 8.4.8 的八个指定叶子、两个 consumer 组及 root 共 11 个 PASS 条目齐全，实际 probe/input/runner pin、95 文件 migration replay、四份 provider 子库及四份 config writer/proof fixture、准确 namespace/原 UID、两端清理、postcheck/default vet 与最终 exit 0 通过。121 份消费代码/探针/合同/迁移重点输入仍匹配，另两份 D 模型/验证脚本的并行变动明确排除。准确本地 source owner 独立确认不存在；A 没有再次连接远端或重跑。该八项无需重跑，下面命令及准备过程保留为历史入口。

接收范围仅为 provider/config 的服务器 SQL 接受时间、允许/越界未来 auth_time 和原 expiry 回滚；实际服务器时钟回退、本人 MFA、真实 authority/capacity、D 完整下载准入、正式 schema 和生产部署不因此验收。首次 SSH 认证提示及 socket close 诊断保留在原日志；后续真实用例、准确清理和最终 exit 0 均齐全，没有把早期诊断当作实际 SQL 失败或隐去。

本专项承接 [nonce 接受时间修复](system-backup-a-nonce-acceptance-time-20261019.md)。只运行新的 `TestANonceAcceptanceMySQL`；不重跑旧 provider registration、writer 十四项、proof 十五项或维护专项。用户执行远测，A 只准备入口并核对回传。

## 八项准确范围

| consumer | 叶子用例 | 必须实际证明的事实 |
| --- | --- | --- |
| provider | `provider/past_auth` | 完整真实事务成功一次，ledger `authenticated_at` 等于本事务 SQL 验证采样，落在调用前后 SQL UTC 之间，与 issuer auth_time 不同；原 expiry/retain 仍准确 |
| provider | `provider/future_within_skew` | 签名 auth_time 确实仍晚于实际接受时间且在已配置偏差内，真实 INSERT/CHECK/FK 成功 |
| provider | `provider/future_outside_skew` | `strong_auth_expired` 在 nonce INSERT 前拒绝，所有效果为零 |
| provider | `provider/expiry_during_insert` | 通过实际数据库 UTC 观察原 expiry 到达后执行原 INSERT，拒绝并回滚 audit/evidence/operation/nonce/capacity |
| config | `config/past_auth` | 当前 JWT/session/RBAC、完整 writer、原 Operation/receipt 与 nonce 实际提交；接受时间和原 expiry 校验同上 |
| config | `config/future_within_skew` | 配置同样实际消费允许偏差内的未来 proof；不得因慢设置变成普通 past-auth 后冒充覆盖 |
| config | `config/future_outside_skew` | 准确 strong-auth 期限错误、未到 nonce INSERT；原配置/版本/审计/响应/nonce 计数不变 |
| config | `config/expiry_during_insert` | 观察实际 SQL 到期后尝试原 INSERT，完整事务回滚且所有 owned 计数与调用前一致 |

源码见[实际 SQL 探针](../backend/internal/systembackupsecurity/nonce_acceptance_time_a_mysql_test.go)。连接包装器只观察真实 INSERT 参数并可在调用前等到原 expiry；所有 SQL、UTC 和 affected rows 均由 MySQL 返回，不替换为模型。真实 SQL 时钟回退没有注入，本专项不宣称移动服务器时钟；回退反例仍按此前本地 transport 模型的限定证据保留。

parent 使用当前完整 catalog 的隔离数据库和原 namespace/UID/server marker。config 使用现有私有 081 候选与受审 fixture：只为本轮新造安装填原 canonical，真正降低保留期以触发风险分类/MFA，不给生产旧行回填。provider 在同一隔离 MySQL 上创建四个随机 owned 子库，从已核对 parent 的真实 `SHOW CREATE TABLE` 克隆 evidence/operation/nonce，保留原 CHECK/FK；用户/config/target/authority/capacity 仍为明确合成依赖。没有运行 grant、真实 provider 或管理员本人 MFA 的验收含义。

## 本地准备与边界

最终本地准备已限定接收，以 [r5 原日志](evidence/a-nonce-mysql-local-preparation-20261019-r5.txt)、[冻结输入](evidence/a-nonce-mysql-local-source-20261019-r5.json)和[47 项独立核对](evidence/a-nonce-mysql-preparation-review-20261019.json)为准。冻结 1,353 项输入，source `ef0314aae444500d10c117af0932eeb6e6e2e42bf43de52a4553c960402be5be`；17 项定向回归、两个 tagged seed 根及其脱离 checkout 的独立执行、默认 vet、Windows/Linux 探针和 migration runner 编译、实际派发绑定、frozen postcheck 与包装 exit 0 通过。五轮准确自有 source 及嵌套构建产物确认不存在，未安装依赖；该准备轮不含真实 SQL，后续实际八项已按页首新轮接收。

独立核对时原输入 1,349 项仍匹配，D 并行修改的 transaction、transaction 两份测试及 sensitive_download_config 共四份另列排除；13 份本入口重点 pin 均匹配，无原输入缺失。新增当前文件未枚举，这不是当前整个工作树已验收的结论。操作者命令会重新冻结、验证与编译当前输入，不能将本次 probe 的成功扩大到后续下载事务或新 MFA 源。

准备期间收紧了 future case 的实际时间覆盖断言，并将 config 场景改成真实保留期降低；新增 seed 直接核对风险分类，避免仅编译通过却未触发 nonce。r3/r4 的 seed 实际失败并清理：新夹具把 duration 字段加到了顶层，违反闭集配置；修订只将它放回正式 `durations` 嵌套结构，没有放宽 parser/风险规则。原失败保留 exit 1，不算通过。r1/r2 仅保留原成功编译范围，所有早期输入均在真实 SQL 前由最终输入取代，不合并成实际 SQL 结论。

PowerShell 7/5.1 的实际 SSH 表达式 13 项绑定、新 root/seed/phase 独占与四个既有 writer profile 兼容检查另留日志。[本地 Bash 记录](evidence/a-nonce-mysql-bash-local-20261019.json)保留首次普通沙箱的 Win32 signal pipe error 5；随后经自动审核允许的只读语法检查已 exit 0，没有执行 phase 命令。实际派发仍保留三条远端 `bash -n`，在 fresh smoke 前执行，没有绕过。

## 操作者完整命令

以下保留已接收新轮所用的完整命令，当前无需重跑。现有入口使用已配置的 SSH 交互认证；本命令不保存密码。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference = 'Stop'
$nonceTag = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$nonceLog = Join-Path $PWD.Path "docs/evidence/a-nonce-time-mysql-remote-$nonceTag.txt"
$nonceSource = Join-Path $PWD.Path "docs/evidence/a-nonce-time-mysql-remote-source-$nonceTag.json"
$nonceExit = 1
Start-Transcript -LiteralPath $nonceLog -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -NonceTimeOnly -Remote -BuildParallelism 2 `
        -SshTarget 'root@10.130.14.23' -SourceManifestPath $nonceSource
    $nonceExit = 0
} finally {
    Write-Host "a_nonce_time_mysql_remote_exit=$nonceExit"
    Write-Host "nonce_remote_log=$nonceLog"
    Write-Host "nonce_remote_source=$nonceSource"
    Stop-Transcript
}
```

## 回传与接收标准

回传本轮原日志和 source JSON。必须包含八个准确叶子 PASS、provider/config 两组及 root PASS（共 11 个 Go PASS 条目），不能仅有 root、seed 或编译通过。还须核对新轮 probe/input/runner SHA、完整 fresh migration ledger、准确 namespace/原 UID 和 server identity、四份 provider 子库及四份 config fixture 的真实清理、远端 scratch/内层 build cache/外层 source 清理与最后 `a_nonce_time_mysql_remote_exit=0`。

任何失败、源码漂移、缺 leaf 或 `CLEANUP_PENDING` 保留原状态，不自动重试 Go/SSH/MySQL；只有构建前的源码捕获允许现有最多三次漂移恢复。原日志中的远程输出和准确清理未齐前，不接收这次 SQL 增量。生产下载 MFA/完整前置锁与原子准入、真实材料、正式共享 schema 和部署/E2E 继续待完成。
