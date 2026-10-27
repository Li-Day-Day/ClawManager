# A 登录会话 MySQL 并发探针

日期：2026-09-30。交付范围为 `SQLLoginSessions.RecordPair` 与 `RevokeUserSessions` 的真实 MySQL 探针及隔离执行入口。**操作者运行 `sbk-mig-260930024748-02c7` 已完成真实 MySQL 15/15 验收。** 本轮没有启用部署开关、连接业务数据库或重跑 GC／恢复的 25 项成功套件。

## 远程验收结果

A 已核对 [操作者完整日志](evidence/a-login-sessions-remote-20260930-103129.txt)：MySQL 8.4.8，15 个预期子用例全部通过，12 条实际行锁等待记录；测试数据库、namespace、远程 scratch 和本地构建缓存清理标记齐全，wrapper 退出 0。探针、DDL 和 migration 二进制摘要均匹配本地准备记录；93 文件迁移及 catalog 摘要见 [独立远程接收记录](evidence/a-login-sessions-mysql-remote-sbk-mig-260930024748-02c7.json)。连接关闭诊断未伴随测试或清理失败，无需因此重跑。

接收绑定日志中的二进制与 DDL，不覆盖之后的代码修改。接收复核时工作区与准备记录比较为 164/166 项一致，`migrations.go` 和 `bootstrap.go` 已有后续修改，差异摘要保存在接收记录；不能把它们视为本次已验证。下文“本地验证”保留准备阶段的历史结果；HTTP 登录链、repository `UpdateLoginState` 真实 MySQL 行为和 LDAP 撤销事件仍未验收。

实现见 [探针源码](../backend/internal/systembackupsecurity/login_sessions_mysql_test.go)、[执行器](../scripts/system-backup-a-evidence-validation.ps1)、[远程阶段](../scripts/system-backup-a-login-sessions-phase.sh)。本地结果与源码指纹见 [交付记录](evidence/system-backup-a-login-sessions-local-20260930.json)。

## 验证范围

探针调用实际会话登记和退出撤销代码，使用独立数据库连接并查询 `performance_schema.data_lock_waits`，按连接 ID、数据库及目标表确认 InnoDB 行锁等待。只有观察到指定等待后才释放阻塞事务；没有观察到时直接失败，不能用固定 sleep 或启动协程数量冒充竞争证据。刷新先于退出、退出先于刷新分别使用不同下游行锁固定顺序。

| 序号 | 子用例 | 必须验证的结果 |
| --- | --- | --- |
| 1 | pair_and_audit_commit_atomically | access/refresh 的 hash、用户、安装和凭据绑定一致，两条会话及一条审计原子提交。 |
| 2 | same_refresh_has_exactly_one_concurrent_winner | 三个请求都真实等待用户行锁；同一父 refresh 只有一个请求成功，另两个明确拒绝。 |
| 3 | refresh_commits_before_logout_all_tokens_revoked | 刷新持有用户锁并等待父会话锁，退出随后等待用户锁；刷新成功后全部四条会话被撤销。 |
| 4 | logout_commits_before_refresh_no_new_pair | 退出持有用户锁并等待 epoch 锁，刷新随后等待用户锁；退出成功后刷新拒绝，不新增会话。 |
| 5 | login_waits_for_password | 已验证的旧凭据等待用户锁期间被改密，登记拒绝。 |
| 6 | login_waits_for_disable | 等待用户锁期间用户被禁用，登记拒绝。 |
| 7 | refresh_waits_for_password | 刷新等待期间被改密，父 refresh 不被消费且不产生新会话。 |
| 8 | refresh_waits_for_disable | 刷新等待期间被禁用，父 refresh 不被消费且不产生新会话。 |
| 9 | old_refresh_cannot_rebind_new_password | 即使调用方提交新凭据摘要，旧 refresh 也不能重新绑定新密码。 |
| 10 | login_audit_failure_rolls_back_pair | 真实数据库 trigger 拒绝审计，整对会话回滚；移除故障后原请求可成功。 |
| 11 | refresh_audit_failure_restores_parent_and_allows_retry | 审计失败同时回滚父 refresh 消费和新会话；移除故障后原请求可成功。 |
| 12 | logout_failure_rolls_back_epoch_and_revocations | 撤销会话的 UPDATE 失败，先前写入的 epoch 一并回滚；移除故障后退出成功。 |
| 13 | token_expires_during_observed_user_lock_wait | 确认真实锁等待后等待数据库时间达到 token 期限，释放锁后拒绝登记。 |
| 14 | wrong_database_pin_rejects_before_writes | 数据库名 pin 不符时在任何会话或审计写入前拒绝。 |
| 15 | logout_is_scoped_to_exact_installation | 同一用户在另一安装的会话保持有效，退出只撤销目标安装的会话与 epoch。 |

调用方的身份验证与 JWT 签发为明确标注的合成输入；探针不执行密码认证、LDAP、HTTP handler、`UpdateLoginState` repository 更新或完整服务启动。它也不验证数据库 COMMIT 回包丢失、真实 provider、MFA 或下载权限。这些范围不能因本套件成功而自动关闭。

## 数据库来源与清理

执行器复用现有 fresh migration 隔离入口：源安装只用于既有只读发现，新建 `sbk-mig-*` namespace 中的 emptyDir MySQL 承担写入，先运行当前源码编译的 migration runner，再启动本探针。探针要求 run namespace、namespace UID、root 凭据及数据库内 marker 一致，核对 `@@server_uuid`；缺少环境不会跳过测试。DDL 文件另以 SHA-256 绑定，所有检查在创建探针数据库前完成。

探针另外创建随机 `als_<32位十六进制>` 数据库。DDL 由 migration `001` 的原始 users/audit_logs CREATE 语句和完整 `080` 原文组成，不包含默认账号 seed，不改原 SQL，不使用 GC 约束提案。这里覆盖会话代码所需的用户/审计列和 `080` 的真实索引、FK、类型；不声称 users 的后续 LDAP 字段迁移或完整业务 schema 也在该探针库内验收。外层 fresh migration 的完整重放结果单独记录。

每个子用例使用独立的测试用户数据；所有密码摘要、JWT secret、token 均为本次合成值。worker 有独立超时并在子用例结束时取消和回收。SQL 错误只输出错误码或固定说明，不打印 token、密码或 DSN。

结束时先关闭连接，再在核对服务器 UUID 后仅删除本次随机数据库，并查询 `information_schema` 确认不存在。外层执行器负责核对 namespace 身份、清理 namespace、远程 scratch、本地 Go cache/二进制/遥测目录。任一缺少清理标记或出现 CLEANUP_PENDING 的运行不能记为通过。

## 本地验证

本轮使用已有依赖；执行器强制 `GOPROXY=off`、`GOSUMDB=off`、`GOTOOLCHAIN=local` 和 `-mod=readonly`。新增 `-LoginSessionsOnly` 与 IncludeSecurity/IncludeAuth/AuthSourceOnly 互斥：只运行 security 本地测试、无数据库的 `TestLoginSessionMySQLSeed`，并编译 security Linux MySQL 探针和 migration runner。

执行器的 [8 项测试](../scripts/system-backup-a-login-sessions-runner.test.ps1) 覆盖默认 evidence 模式保留、会话模式选择、种子/探针/迁移失败时停止后续步骤并清理、三种互斥参数拒绝，以及 DDL 摘要和环境恢复。工具边界为显式模拟，不计作真实 Go/MySQL 运行。测试期间发现 PowerShell 将原来未设置的环境变量恢复成空字符串；执行器现对原来不存在的变量明确移除，对原来存在的值原样恢复。

本地 security 包的 78 个主测试、370 个子用例通过（46.792 秒），新增种子门禁通过（1.666 秒）。Linux MySQL 探针与 migration runner 编译通过，执行器退出 0，本轮二进制、缓存及临时目录已清理。执行器 8 项模拟测试分别在 PowerShell 7 和 Windows PowerShell 5.1 通过；Go 格式、PowerShell 解析和 Bash 语法检查通过。本机已缓存镜像中没有 MySQL，未下载镜像或安装依赖；此准备阶段尚未执行真实 MySQL，后续 15/15 结果见上方远程验收。完整本地输出见 [日志](evidence/system-backup-a-login-sessions-local-20260930.txt)，准确构建摘要及执行器环境恢复修订的验证范围见机器记录。

仅运行本地验证：

```powershell
& .\scripts\system-backup-a-evidence-validation.ps1 -LoginSessionsOnly -BuildParallelism 1
```

## 操作者隔离验证命令

在本机仓库根目录 PowerShell 执行；SSH 密码仅在终端交互输入，使用现有受信 host key。命令不会安装依赖，也不会对实际业务库执行升级或启用会话登记。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    $aSessionRemoteExit = 1
    $aSessionTranscript = Join-Path (Get-Location) ('docs/evidence/a-login-sessions-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    Start-Transcript -Path $aSessionTranscript -NoClobber | Out-Null
    try {
        & .\scripts\system-backup-a-evidence-validation.ps1 `
            -LoginSessionsOnly `
            -Remote `
            -BuildParallelism 1 `
            -SshTarget 'root@10.130.14.23'
        if (-not $?) { throw 'Login session MySQL runner failed' }
        $aSessionRemoteExit = 0
    } finally {
        Write-Output "a_login_sessions_remote_exit=$aSessionRemoteExit"
        Stop-Transcript | Out-Null
    }
}
```

执行入口固定沿用 context `kubernetes-admin@kubernetes`、源 namespace `clawmanager-zhanghui08-system`、测试节点 `node1` 及原 runner 中固定的应用镜像 digest。远程阶段只选择 `^TestALoginSessionsMySQL$`，不执行 `TestAEvidenceMySQL` 或原登记套件。

请回传完整输出，至少包括：

- 本轮 probe/DDL/migration 二进制摘要，fresh migration 的 catalog 数量和 hash，以及 namespace/UID。
- `TestALoginSessionsMySQL` 下全部 15 个子用例 PASS，竞争场景的 `OBSERVED session lock wait table=...`，以及最终 `PASS a-login-sessions-mysql`。
- `CLEANED login-sessions run-owned database`、namespace 清理、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True` 和 `a_login_sessions_remote_exit=0`。

本地种子测试 PASS 或 Linux 编译成功均不能替代上述回传。操作者运行后，A 按本轮源码指纹、实际用例和清理范围登记验收；既有 GC／恢复 25/25 记录继续独立保留。
