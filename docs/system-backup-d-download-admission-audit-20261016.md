# D 下载准入：真实审计 ID 与同事务原行锚点

【D r55 独立接收】[限定复核回执](evidence/system-backup-d-download-audit-remote-review-20261016-r55.json)记录只读重跑原复核器的 17 项通过、原日志/来源与 A 回执摘要核对，以及准确本地目录/容器再次确认不存在。四项实际 SQL 待测已关闭；下文 r50 的“待操作者回执”属于原准备记录，完整 nonce 准入仍未验证。

【操作者四项实际 SQL 已由 A 接收】[14:52 日志](evidence/d-download-audit-remote-20261016-145206-9924db6e.txt)及[A 限定回执](evidence/a-download-audit-mysql-accepted-sbk-mig-261016070211-49af.json)确认 1,314 来源、四项/root、95 文件 replay、准确载荷 pin、四份 user/audit、namespace/原 UID/两端清理与 exit 0；17 项核对通过，本地 owner/container 独立确认不存在。该专项无需重跑；并行 tagged detail/control 探针及 server wrapper 的当前漂移另记，不扩大为完整下载准入、nonce、最小生产 grants 或正式批准。下方准备命令保留为复现信息。

本项承接 [D 已确定的 operation/nonce 事务合同](system-backup-d-sensitive-download-admission-contract-20261016.md)，实现其中此前缺失的审计存储环节。[SQLDownloadAdmissionAudits](../backend/internal/systembackupevidence/download_admission_audit.go)在调用者的准确 `*sql.Tx` 内只 INSERT 一次，通过该 INSERT 的 `RowsAffected` 与 `LastInsertId` 取得真实 `audit_logs.id`，再按该 ID 读取并锁定落库行，逐项核对 actor/action/resource、完整闭集 details 和时间。任何错误均返回零 ID/anchor，调用者负责回滚；组件不 Begin、Commit 或重试。

`AuditIntent` 提供约定的 `(int64,error)` 低层 API；完整准入应使用 `StageIntent` 保留不能序列化的 `DownloadIntentAuditAnchor`。anchor 绑定准确事务、原 ID、原 actor、原始 details、微秒观察时间和落库秒时间。`RecheckIntent` 使用新 SQL UTC，拒绝时钟回退或跨事务使用，并比较原行，防止后续 callback 在同一事务里改写已锁定审计。复查不追加第二条 intent，也不根据新行重新生成一个自洽预期。

审计 details 包含准确 installation/operation/evidence/row version、request/完整 manifest 摘要、claim 摘要、Range 及 SQL 观察时间；不持有 raw claim、proof、nonce、bearer 或 provider URI。public ID、claim 格式、INT actor/audit ID 范围、安全 row version 和有界 Range 在写入前校验。MySQL JSON 的空白/键序变化不影响比较，未知字段或值变化被拒绝。

正式 001 的审计时间列为 `TIMESTAMP(0)`。组件将 SQL UTC 明确截到秒后写列，避免 MySQL 对小数舍入造成落库时刻跑到未来；details 及 anchor 另保留准确微秒 SQL 时间。该处理不延长 proof/session/claim 期限，不能代替完整准入在最后写入后的 UTC 和权限检查。参见 [合同勘误](evidence/system-backup-d-sensitive-download-erratum-20261016-r47.json)。

本组件是低层候选存储，不是授权能力或已消费 nonce 的证明。真实调用必须先由 D 建立统一锁前缀、当前认证/owner/RBAC、历史 HMAC 集和物理容量预留，并把同一 intent 与 claim/operation/receipt/公共快照/nonce 原子提交。当前 `SQLPolicy.Audit` 和生产 HTTP 没有接入此组件，已有敏感下载继续失败关闭；正式迁移、完整前置锁和原子准入仍待完成。

A 的 canonical/非消费 proof 候选已由 D 只读复核其原回执：16 项检查、426 主/2759 子项、94 项新候选覆盖、278 重点 pin、五组请求及一组完整 Manifest 向量均匹配；未重跑 A 测试或把这些结果扩大为 SQL 重放防护。A 已明确指出的空内容差异由上述勘误修正。

最终[本地 r50 日志](evidence/d-download-admission-audit-local-20261016-r50.txt)、[冻结清单](evidence/d-download-admission-audit-source-20261016-r50.json)和[独立接收](evidence/system-backup-d-download-audit-review-20261016-r50.json)已齐全：1,310 来源、逻辑 SHA `d7ff758644a31b532e13119ee42a86ad5c55fa0c987361af496ba2d5923befc1`，387 重点来源当前匹配；security/evidence 两个完整包 434 主/3,246 含子项全部通过。新增 D 审计为 5 主/34 含子项，A 补充独立回归为 3 主/27 含子项，合计 8 主/61 含子项，已包含在总数内；seed 为 1 主/6 含子项，脱离源码的二进制重复运行 seed 也通过，不重复计数。复核器初版漏计 A 的三项，已按实际源文件声明修正统计，未重跑 Go。

Linux 探针 SHA 为 `834934e039dd13761a4ad4d6b78dbf45eb882561cae25e25bde8ab1c5ae3744e`，95 文件 runner 为 `cff6270bf1537de361d938a533f155f7f1193de2c4f116327e53ec8b1ee97482`，实际 capsule 为 `a8c353102a7fbde8886314abfa0d62ad56635c51fcef5f37c6e7ba0418eda20e`。默认 vet、Bash 语法、13 个派发绑定、源码 postcheck、exit 0 和准确目录/容器缺席均核对，未安装依赖。scripted SQL driver 验证 INSERT 参数、秒精度列/微秒 JSON、回读语义、失败零 anchor、同事务篡改、跨事务、取消、非 UTC/回退和不能序列化 raw claim 输入；它不证明真实 MySQL 锁或完整准入，实际四项仍待操作者新回执。

此前尝试原样保留：r47 的 Windows vet 启动错误及既有 historical 用例在提交后越过 execution 期限，门禁 exit 1；核对其准确父子进程/专属路径后仅终止两个本轮测试子进程，原 finally 已清理两处 owner。r48 因已有 Go 镜像不含 Bash，在 Go 测试前 exit 127，已清理；改用本机已有 Git Bash，没有安装软件。r49 流式回传轮有既有 producer 用例提交后越过期限，exit 1，已清理。r50 改为在容器内保存原始 Go 报告、测试结束后原样回传并保留实际退出码，排除终端回传对短窗口测试的阻塞；未放宽生产期限、改动旧用例或跳过检查。不能把先前失败算为通过，也不据最后通过声称已证明先前失败的唯一原因。

## 独立 MySQL 四项与操作者命令

操作者 14:42:58 的首次尝试在稳定源码复制阶段失败，未进入构建/SSH/MySQL。A 已给专属入口复用经过验证的 source-only 有限次捕获：最多三次，每次丢弃不完整副本，稳定后才执行一次后续门禁；准确 owner 提前输出。原始失败日志、八项 helper/13 项派发绑定在 PowerShell 7/5.1 的检查、真实 1,313 项快照/postcheck 及清理见 [A 修复回执](evidence/a-download-audit-source-retry-review-20261016.json)。构建/SSH/SQL 不增加重试，原本地 r50 接收范围保持原冻结轮；[A 完整命令](system-backup-a-download-audit-mysql-handoff-20261016.md)已同步，可生成新轮日志与来源。

[专属入口](../scripts/system-backup-d-download-audit-validation.ps1)默认仅本地，使用已有 Go Linux 镜像、只读现有 module cache、断网容器和 `--pull=never`，完成两个完整包、tagged seed、Linux 探针和当前 95 文件迁移 runner 编译；本机已有 Git Bash 负责 phase 语法检查。容器/缓存/二进制均在准确 owner finally 清理，不安装依赖。显式 `-Remote` 才进入现有隔离 fresh-catalog harness；只选择 `TestDDownloadAdmissionAuditMySQL`，不执行已接收的健康、配置 proof/writer/回填或恢复 root。

四个实际 SQL 场景为：

| 场景 | 验证范围 |
| --- | --- |
| `actual_insert_id_and_timestamp` | 当前审计表真实 INSERT ID、独立回读与提交可见性、TIMESTAMP(0) 秒值及 JSON 微秒/claim 摘要 |
| `rollback_visibility` | 提交前其他连接不可见、调用者 rollback 后不存在 |
| `same_transaction_mutation` | callback 改写本事务已锁行后，原 anchor 必须返回零 ID 与失败 |
| `cross_transaction_anchor` | 已完成 Stage 的 anchor 不可被另一个实际事务复用 |

该 root 在准确 namespace/UID/server UUID 和完整 ledger 文件名核对后，只创建随机隔离 users/audit 夹具，不安装候选应用表、不创建下载 operation/claim/receipt 或消费 nonce。每项先注册准确 user/email 的清理，再初始化；结束删除该 user 的本测试 intent、核对零审计引用、删除准确 user 并核对不存在，外层再清理原 namespace UID 与两端 scratch。真实身份/RBAC、最小 grants、完整准入原子性、并发 nonce 与提交不明不在这四项范围。

```powershell
$downloadAuditStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$downloadAuditManifest = Join-Path $PWD "docs/evidence/d-download-audit-remote-$downloadAuditStamp-source.json"
$downloadAuditLog = Join-Path $PWD "docs/evidence/d-download-audit-remote-$downloadAuditStamp.txt"
$downloadAuditExit = 1
Start-Transcript -LiteralPath $downloadAuditLog -NoClobber
try {
    & .\scripts\system-backup-d-download-audit-validation.ps1 `
        -Remote -SourceManifestPath $downloadAuditManifest
    $downloadAuditExit = 0
} finally {
    Write-Host "d_download_admission_audit_remote_exit=$downloadAuditExit"
    Stop-Transcript
}
```

接收需新轮来源、实际 capsule/probe/runner pin、95 文件 replay、上述四项与 root PASS、四个准确 user/audit 清理、原 namespace UID/两端 scratch 清理及 exit 0 同时齐全。专属 marker 为 `PASS d-download-admission-audit-mysql ... nonce_consumed=no production_approval=no`；本地 seed、A 非消费 proof 或健康七项均不能替代实际四项回执。
