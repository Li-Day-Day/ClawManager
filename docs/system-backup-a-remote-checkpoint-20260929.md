# A：本轮收尾后的远程测试交接（2026-09-29）

后续更新：用户已授权补 GC／恢复授权与并发探针。当前脚本另含 17 个新增叶子用例，最新命令和验收范围见 [新探针交接](system-backup-a-authority-mysql-20260929.md)。本页以下保留上一轮 8/8 远程验收历史，不能据此判定新增用例通过。

操作者回传已接收：`sbk-mig-260929090519-4483` 的 8/8 MySQL 子用例、摘要匹配及清理输出通过限定范围核对，见 [接收记录](evidence/system-backup-a-evidence-remote-sbk-mig-260929090519-4483.json)。原 transcript 未包含远程 stdout，已用操作者补充的控制台输出补齐；下文命令保留供复现，此成功套件当前无需重跑。开发仍按用户要求暂停。

第二份完整控制台补充进一步确认 MySQL 8.4.8、`001..080` / 93 个准确文件名的空库迁移重放通过。本地按正式长度前缀算法重新计算 93 文件 catalog，与远程 `68794bddc66b9809fae57a111778dd8ad53e2a5a5bfb218108295c8d751b1564` 一致，源码摘要已登记。初始化配置激活、历史库等价性和本人 MFA 均明确为 false；不扩大此次验收范围。Socket close 提示没有伴随非零退出，传输校验、测试和清理标记齐全，本轮不据此判失败。

用户要求本轮结束后暂停并交付完整远程测试命令。A 完成本轮 GC 观测/重试代码、本地验证及远程探针准备后暂停；不自动连接服务器、不继续下一轮开发。

本轮本地组件验证为 88 个主测试、630 个子测试通过，vet 开启。Linux 原探针和迁移工具编译通过，隔离构建产物已清理。随后仅更新 `systembackup_mysql` build tag 下的探针，增加实际 MySQL 的 GC 观测、result 审计失败回滚和确认删除后的重试清除断言；此变更不进入 Windows 普通组件测试。更新后的探针仅做编译，远程执行待操作者完成。

更新后的 Linux 探针编译已通过，退出 0；111 项跟踪源码在编译期间未变，仅远程 tag 文件与前一份本地测试快照不同。探针二进制/缓存已清理并独立确认目录不存在。见 [探针准备记录](evidence/system-backup-a-evidence-gc-remote-probe-preparation-20260929.json) 和 [编译输出](evidence/system-backup-a-evidence-gc-remote-probe-build-20260929.txt)。未安装依赖、未执行远程操作。

## 当前命令覆盖的范围

入口复用 `scripts/system-backup-a-evidence-validation.ps1 -Remote`：本地重新测试/编译，再通过 SSH 上传带摘要的 bundle，在新建 `sbk-mig-*` namespace 的 emptyDir MySQL 中运行当前 93 文件迁移，并在随机 run-owned evidence 数据库执行原始 evidence DDL 加 GC 提案。源 namespace 用于只读获取 MySQL 镜像/版本及初始化配置；不向业务库导入 GC 提案，也不启用生产配置。

更新后的 `TestAEvidenceMySQL` 共 8 个子用例，覆盖：

- 登记/chunks 原子性和重复拒绝。
- 恢复候选 SQL 的 due、claim、store 和 installation 字面前缀过滤。
- 发布及精确版本读取。
- 保留与引用拦截 GC。
- intent 审计失败阻止 provider 删除。
- 未确认删除保留引用，并原子保存 unknown 检查及 60 秒重试。
- result 审计失败保留旧观测、引用和 chunks。
- 后续确认已不存在时清理 payload/chunks 和重试时间，不重复 DELETE。

探针使用实际 SQLRegistry、GC result 保存逻辑和 MySQL 事务；对象服务、KEK、owner policy 是测试替身。为单独验证 SQL 保存路径，测试内的 registry 包装没有生产操作租约/mTLS/扫描调度授权。这条命令不覆盖真实 MySQL 下的完整 GC runtime 授权并发、真实 OIDC/STS/Transit ACL、C 权威不存在证明或生产 worker/HTTP/完整备份恢复验收；这些仍须正式接点与环境输入就绪后再测，不能借本套件通过签收。

## 在本机 PowerShell 执行的完整命令

使用当前源码，测试运行期间不要修改源码。目标使用既有测试服务器 `root@10.130.14.23`；脚本固定检查 `kubernetes-admin@kubernetes`、源 namespace `clawmanager-zhanghui08-system`、`node1` 及已钉住的测试镜像，校验失败会停止。SSH 主机信任必须已存在，按提示输入密码；脚本不安装 Go 依赖。日志仅保存测试输出，不要把密码、token 或私钥贴回任务。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    $aEvidenceLog = Join-Path (Get-Location) ('docs\evidence\a-evidence-remote-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    $aEvidenceExit = 1
    Start-Transcript -Path $aEvidenceLog | Out-Null
    try {
        & .\scripts\system-backup-a-evidence-validation.ps1 -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
        if (-not $?) { throw 'A evidence remote validation failed' }
        $aEvidenceExit = 0
    } finally {
        Write-Output "a_evidence_exit=$aEvidenceExit"
        Stop-Transcript | Out-Null
        Write-Output "完整日志：$aEvidenceLog"
    }
}
```

## 回传和判定

回传生成的完整脱敏日志，包含 run namespace/UID、binary/DDL/migration 摘要和 `a_evidence_exit`。成功须同时出现更新后 8 个 MySQL 子用例通过、`PASS a-evidence-mysql`、`CLEANED evidence run-owned database`、`CLEANED namespace=... uid=...`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True` 及 `a_evidence_exit=0`。

任何非零退出、`CLEANUP_PENDING` 或 `CLEANUP_SKIPPED` 都不能签收。保留原始错误及对应 run/UID，先定位本次资源；不要用批量删除共享 namespace/lab 的方式收尾。编译产物、缓存和临时数据库由脚本清理；日志作为验收记录保留。
