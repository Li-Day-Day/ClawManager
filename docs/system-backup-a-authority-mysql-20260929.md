# A：GC／恢复授权与并发 MySQL 探针

用户授权“补第一项，告诉我完整测试命令”。本轮只增加此探针及日志捕获修正，交付后暂停，远程由操作者运行。

## 最新验收：2026-09-30 全部 25 项通过

操作者重测 `sbk-mig-260930011620-0f52`（UID `250fd711-f2e4-49aa-88cc-c131036c79cd`）已通过原 8 项及新增 17 项，共 25/25 叶子用例，耗时 4.25 秒。MySQL 8.4.8 上 93 文件迁移重放通过，本地初始化门禁通过；修正后的探针摘要、DDL 摘要、当前 55 项准备源码绑定均匹配。隔离数据库、namespace、远程 scratch、本地缓存清理标记齐全，wrapper 退出 0。见 [远程验收记录](evidence/a-authority-mysql-remote-sbk-mig-260930011620-0f52.json) 和 [完整日志](evidence/a-authority-mysql-remote-20260930-085852.txt)。

本轮 GC／恢复 SQL 授权与并发探针按下述限定范围验收通过，无需重复运行；下文失败、修正及重测命令保留为历史记录。真实 STS/S3/Transit、正式 D SQLPolicy／完整控制表约束、完整备份恢复仍未验收。按用户要求保持暂停，不自动进入下一轮。

## 2026-09-30：GC 测试数据初始化修正

操作者运行 `sbk-mig-260930003602-2567`：93 文件迁移重放、原 8 项和新恢复类 6 项通过；11 个 GC 用例在 reset 内的 `Publish` 准备阶段返回 `artifact_unavailable`，尚未进入 GC 授权／并发检查。日志含完整数据库、namespace、远程 scratch、本地缓存清理标记，退出 1。见 [失败记录](evidence/a-authority-mysql-failure-20260930.json)。

原因是测试用 `testStore{}` 默认不提供权威不存在证明，`Publish` 因而正确阻止 PUT；GC 测试种子必须显式使用 `authoritative: true`。不放宽发布安全条件，也不修改正式运行逻辑。新增 `TestMySQLAuthoritySeed` 本地回归，分别检查确认不存在后成功发布，以及未知不存在时禁止 PUT。验证脚本在上传前执行此 build-tag 用例，不需要本地 MySQL。

修正已完成本地先失败、后通过验证：旧初始化稳定复现 `artifact_unavailable / write_unknown / puts=0`；修正后 2/2 子用例通过，vet 开启。Linux 探针重新编译通过；期间 Windows 编译工具出现一次已知 `0xc0000043` 进程退出，按既有脚本策略重试后成功。源码绑定未变，本轮二进制和缓存已清理，未安装依赖，未重跑远程。见 [修正记录](evidence/a-authority-seed-fix-20260930.json)、[失败复现](evidence/a-authority-seed-red-20260930.txt)、[通过与编译输出](evidence/a-authority-seed-green-20260930.txt)。

修正后探针 SHA256：`0984d84cb5f9b3984b49495623253668c5e4058bb10b79addd08cf7da23d20a7`。用下方完整命令重新执行；上传前应先看到 `LOCAL_PASS mysql-authority-seed=yes real_mysql=not_run`。交付后暂停，远程 25 项须由新运行结果确认。

## 新增范围

`TestAEvidenceMySQL/live_authority_concurrency` 增加 17 个叶子用例；连同原有 8 个，共 25 个叶子用例。复用同一个经过 namespace UID / server UUID 校验的随机 `aev_*` 隔离数据库。

- GC、恢复分别验证：两个工作者争抢同一 evidence，只有胜者访问 provider、提交结果。
- GC、恢复分别验证：旧 evidence claim 过期，第二个工作者接管完成；旧工作者不能继续删除或覆盖结果，row_version 只按新 claim/result 增长。
- GC、恢复分别验证：未知结果持久化 60 秒退避，直接调用不能提前绕过；将隔离记录的 retry 设为到期后可以收敛。
- GC、恢复分别验证：active config、配置摘要、读／删 credential ref 在 provider 期间变化，旧授权不能提交结果。
- GC 验证：operation 租约过期、operation 被另一 worker 接管、并发新增引用，阻止后续删除。
- GC 验证：删除返回前新增引用，不能清空 evidence/chunks/ref；保留失败记录。
- GC 验证：通过 `performance_schema.data_lock_waits` 确认实际 InnoDB 行锁等待，等待期间 operation 租约到期，解锁后不得领取或写 intent audit。

网络入口使用实际本地 TLS 握手及固定客户端证书验证；claim、provider 授权、结果事务调用正式 `SQLGCAuthority` / `gcRegistry` / `SQLWriteRecovery`，不走上一轮绕过 operation admission 的 adapter。多请求使用独立 HTTP 上下文与数据库连接池。

## 范围限制

evidence/chunks 使用现有正式 DDL 加 GC 提案。installation/config/operation 使用仅含授权查询所需字段的 InnoDB 测试表，**不是完整生产控制表约束验收**。owner/reference/audit policy、对象 provider、JWT 和加密密钥仍是测试输入。新引用用例故意绕过正常引用准入制造竞态；不表示生产允许给 deleting 对象新增引用。

此探针不连接真实 STS/S3/Transit，不验收真实 C absence proof，不验证完整备份恢复。正式 D SQLPolicy、生产 worker 装配及完整控制表写入约束仍须后续集成测试。

## 完整远程命令

在本机 PowerShell 执行。SSH 密码在终端提示时输入。脚本禁止下载依赖；先跑本地测试与 Linux 编译，再在新建 namespace 中测试，结束时清理隔离数据库、namespace、上传目录、二进制和构建缓存。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    $aEvidenceLog = Join-Path (Get-Location) ('docs\evidence\a-authority-mysql-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    $aEvidenceExit = 1
    Start-Transcript -Path $aEvidenceLog | Out-Null
    try {
        & .\scripts\system-backup-a-evidence-validation.ps1 `
            -Remote `
            -BuildParallelism 1 `
            -SshTarget 'root@10.130.14.23'
        if (-not $?) { throw 'A authority MySQL validation failed' }
        $aEvidenceExit = 0
    } finally {
        Write-Output "a_evidence_exit=$aEvidenceExit"
        Stop-Transcript | Out-Null
        Write-Output "完整日志：$aEvidenceLog"
    }
}
```

成功需同时出现新组下的 17 个 PASS、原 8 个 PASS、`PASS a-evidence-mysql`、`a_evidence_exit=0` 和全部 CLEANED 标记。若出现 `CLEANUP_PENDING`，保存对应 namespace / UID / 路径及完整日志。

`Invoke-AEvidenceNative` 将 SSH/SCP stdout/stderr 转为 host 输出供 transcript 捕获，并单独保留退出码。PowerShell 7 和 Windows PowerShell 5.1 均已通过 21 项 helper 检查，包含 native stdout/stderr、带空格参数、退出 0 和退出 37；不会因出现 PASS 文本而忽略非零退出。

9 月 29 日修正前的本地验证：88 个主测试、630 个子测试全部通过（30.182 秒，vet 开启），Linux 探针和 migration runner 编译通过，wrapper 退出 0。56 项源码绑定在验证期间未变，隔离构建目录已删除；没有安装依赖或连接远程。见 [旧准备记录](evidence/system-backup-a-authority-mysql-preparation-20260929.json) 和 [旧本地输出](evidence/system-backup-a-authority-mysql-local-20260929.txt)。这些普通组件测试未执行新 build-tag 下的初始化路径；9 月 30 日新增本地回归门禁补足此缺口。

修正前探针 SHA256：`a2cbe0445a9ef951dc5486550dd9ee3394bca355ee07054f390ece5a626e358f`，即上述失败运行使用的版本。DDL 与 migration runner 未因本次测试初始化修正发生变化。修正后的远程结果须重测确认，不能将已通过的 14 项扩大为全部通过。
