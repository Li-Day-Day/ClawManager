# A 复核 D 审计专项远测准备与完整命令

【实际四项已限定接收，无需重跑】操作者 [14:52 新轮日志](evidence/d-download-audit-remote-20261016-145206-9924db6e.txt)与[源码清单](evidence/d-download-audit-remote-20261016-145206-9924db6e-source.json)已由 [A 实际 SQL 回执](evidence/a-download-audit-mysql-accepted-sbk-mig-261016070211-49af.json)接收：1,314 项稳定来源、首次捕获成功，MySQL 8.4.8 上四项及 root PASS、95 文件正式迁移、准确 probe/capsule/runner 绑定、四份 user/audit 清理、namespace/原 UID/两端 scratch 清理、外层 exit 0 齐全。17 项独立核对通过，准确本地源码 owner 和容器独立确认不存在；A 未访问远端或重跑测试。

389 份重点输入中 388 份仍匹配；D 的另一份 tagged detail/control 探针已并行修改，另一处 server-read wrapper 也与冻结清单不同，均明确排除在本次当前状态接收之外。真实四项只证明准确冻结审计组件；完整下载准入、nonce 消费、最小生产 grants、本人 MFA 和正式批准仍未完成。下方命令与准备时“待远测”的描述保留为历史及复现信息，本次四项待办已关闭。

[A 准备回执](evidence/a-download-audit-remote-preparation-review-20261016.json)独立核对 [D r50 准备轮](evidence/system-backup-d-download-audit-review-20261016-r50.json)的原始日志、1,310 项源码清单和载荷指纹。该轮与 [A 审计组件复核](system-backup-a-download-audit-review-20261016.md)使用相同 source SHA `d7ff758644a31b532e13119ee42a86ad5c55fa0c987361af496ba2d5923befc1`。security/evidence 两个完整包 434 主测试/2,812 子用例，共 3,246 项通过；另有 6 项 tagged seed 检查，脱离工作目录的 seed 重复运行不重复加总。A 的 27 项与 D 的 34 项审计组件检查均已包含在整包数中。

17 项独立核对通过；默认 vet、Linux probe/迁移 runner、13 项 dispatch 绑定、95 文件 catalog、源码 postcheck 和 exit 0 齐全。387 份重点输入及全部已有清单输入匹配；准确源码 owner 与 Docker 容器独立确认不存在。初次 Docker 只读观察因 sandbox 的本地 pipe 权限失败，随后只读提权观察成功，未启动、停止或删除容器。本轮只读取归档和现状，没有重跑 Go/构建、安装依赖或访问远端。

## 操作者执行

14:42:58 的[首次远测尝试](evidence/d-download-audit-remote-20261016-144258-2132fd19.txt)于源码捕获阶段以 `Source changed while snapshot was copied` 退出 1，没有生成 source manifest 或进入 Go/SSH/MySQL；日志报告本地 owner 已清理，旧入口当时未提前输出准确 owner，不能据此声称独立核对过那条未知路径。原日志保留。

[源码捕获修复回执](evidence/a-download-audit-source-retry-review-20261016.json)已限定验证当前入口：复用既有最多三次的 source-only 捕获，每次重新建立完整稳定副本，只对源码/文件集变动重试；不重试构建、SSH 或 SQL，并提前输出准确 owner。PowerShell 7.6.5/Windows PowerShell 5.1 的八项 helper 用例及各 13 项 dispatch 绑定通过，真实仓库 1,313 项输入首次捕获/postcheck 通过，三条准确自有测试路径删除；12 项独立核对通过。相对原准备轮 387 份重点输入仅此 wrapper 变化，其他 386 份匹配；完整 Go 包/探针旧结果仍属于原冻结轮，本轮没有重跑它们。重新执行下方完整命令即可创建新日志/清单，勿复用失败轮的文件名。

以下是新增审计专项四项远测。命令先为本次冻结源码重新生成 Linux 探针与迁移 runner，再显式派发远端隔离测试；已接收的配置 proof 十五项无需重跑。入口只使用现有 module cache、固定本地 Go Linux 镜像与 `--pull=never`，本地容器断网；SSH 使用既有 host pin 和交互认证。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference = 'Stop'
$downloadAuditStamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$downloadAuditLog = Join-Path $PWD.Path "docs/evidence/d-download-audit-remote-$downloadAuditStamp.txt"
$downloadAuditManifest = Join-Path $PWD.Path "docs/evidence/d-download-audit-remote-$downloadAuditStamp-source.json"
$downloadAuditExit = 1
Start-Transcript -LiteralPath $downloadAuditLog -NoClobber
try {
    & .\scripts\system-backup-d-download-audit-validation.ps1 `
        -Remote -SourceManifestPath $downloadAuditManifest
    $downloadAuditExit = 0
} catch {
    Write-Host "download_audit_error=$($_.Exception.Message)"
} finally {
    Write-Host "d_download_admission_audit_remote_exit=$downloadAuditExit"
    Write-Host "download_audit_log=$downloadAuditLog"
    Write-Host "download_audit_source_manifest=$downloadAuditManifest"
    Stop-Transcript
}
```

请回传上述三个输出：`d_download_admission_audit_remote_exit`、`download_audit_log` 和 `download_audit_source_manifest`。A 依据实际日志及源码清单复核，准备回执中的载荷 pin 不能替代新轮实际载荷。

## 接收标准与范围

远端 root 必须为 `TestDDownloadAdmissionAuditMySQL`，四项均实际 PASS：

| 场景 | 证明内容 |
| --- | --- |
| `actual_insert_id_and_timestamp` | 真实 INSERT ID、原行回查及提交后可见性、TIMESTAMP(0) 秒值、JSON 中原微秒与 claim 摘要 |
| `rollback_visibility` | 未提交时其他连接不可见、调用者 rollback 后原行不存在 |
| `same_transaction_mutation` | 同事务 callback 改写行后，原 anchor 返回零 ID 和错误 |
| `cross_transaction_anchor` | 另一个真实事务不能复用原 anchor |

还须同时核对本轮稳定源码清单、实际 archive/capsule/probe/runner pin、95 文件正式迁移、准确 namespace/UID/server UUID、四份 owned user/audit 夹具清理、namespace/两端 scratch 清理与外层 exit 0。专属 marker 是 `PASS d-download-admission-audit-mysql ... nonce_consumed=no production_approval=no`。仅 seed、本地包或 root PASS 不能替代全部清理/退出证据；`CLEANUP_PENDING` 表示尚未完成接收。

此专项使用隔离夹具 root grants，只验证已发布 `users/audit_logs` 上的审计存储；不创建候选下载 operation/claim/receipt，不消费 nonce，也不证明最小生产 grants、并发重放、完整授权原子性或提交不明处理。四项实际结果现已限定接收；D 的封闭前置锁、真实当前权限、容量与 operation/receipt/公共快照/nonce 唯一提交点仍待完成。

## 已接收的 D 勘误

[独立勘误](evidence/system-backup-d-sensitive-download-erratum-20261016-r47.json)保留原决议 `8b14d080...d73d8eac`，原始 SHA 为 `ed3f88b1eb3e2959fb853e2a521eebaf92f6572039e704e6a99c4d677cccf74b`。A 已接收其明确的现状：当前拒绝 size<=0，`0/0` 只保留为未来纯编码向量；key 仍为 `[A-Za-z0-9._:-]{16,128}`；TIMESTAMP(0) 与 JSON 微秒时间分开保存，不延长期限。此前文档说明冲突已澄清，空内容运行支持、正式共享 schema 和生产批准均未因此完成。
