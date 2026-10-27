# A：隔离 MySQL 的 GC 受限账号探针

【2026-10-21 最新：十项已接收，无需重跑】操作者 `164523-7cba478a` 轮通过 [91 项独立核对](evidence/a-download-gc-role-mysql-accepted-sbk-mig-261021091731-79c1.json)，metadata_drift 原 1146 已关闭。[接收说明](system-backup-a-download-gc-role-mysql-accepted-20261021.md)保留一次本地 vet 工具崩溃及同命令重试，完成十三份并行业务输入的独立组合基线复核；接收器 owner 67/角色 64 项及十五真实 CLI 拒绝通过。原日志/来源不改写，不再要求重跑本专项。下文“待十项/可重测”均为历史；生产身份/扩展组件权限、owner 十一项和完整 GC 仍继续。

【当前可重测来源】[第十一份限定来源](evidence/a-owner-dependency-baseline-accepted-20261021.json)已核对实际 tagged 测试依赖图，资源包的三份改动不在 owner/角色依赖中，原 5,019 项完整清单保持；其 module-full 四个既有失败明确保留，不接收资源包全包成功。新冻结/依赖缓存已清理，无依赖安装或测试重跑。[当前接收器](evidence/a-owner-dependency-receipt-readers-preparation-20261021.json)通过 owner 67、角色 48 项及十五真实 CLI 拒绝。完整重测入口新增只读开跑前来源检查；并行普通输入若再改变且没有受审基线，会在 Go/SSH 前停止，原稳定复制、完整 gate 和最终复核仍全部执行。

【当前重测目录】081 prune identity 修正已由 D 提供并经[A 普通来源独立复核](evidence/a-prune-identity-baseline-accepted-20261021.json)，当前目录为 96 文件/001..081。原 070 不改写，原 95 文件回执不扩大。[接收器同步](evidence/a-prune-identity-receipt-readers-preparation-20261021.json)通过 owner 65、角色 46 项及十五真实 CLI 拒绝，按受审冻结目录精确校验 95/96 的各自数目、范围与摘要。下面完整入口会重新验证当前源码与 96 文件迁移，1146 角色失败仍须新十项实际回执。

【15:11 新轮实际九过一败，夹具已修订】[独立失败记录](evidence/a-download-gc-role-drift-failure-reviewed-20261021.json)确认 `142757-6ad9fc5f` 完成本地两包 5,019 项、seed 9 项、跨平台构建后进入 MySQL 8.4.8。唯一失败 `metadata_drift` 在准备 ALTER 时因 1146 中止：该 role fixture 没有创建 `synthetic_download_mfa_owner`，旧 pin 拒绝及新 pin 正向尚未执行。原十个账号/十库、namespace 原 UID/两端清理齐全，本地目录独立缺席，最终 exit 1，不接收为角色十项通过。

修订仅改 tagged 测试，在一次性隔离库中 ALTER 正式 capsule 已创建的 `system_backup_configs`，并要求特权观察者的 Columns pin 确实变化，再核对旧 pin 拒绝与新 pin 正向。生产 GC、候选 grant/权限和正式 schema 不变。[新本地准备回执](evidence/a-download-gc-role-drift-fixture-accepted-20261021.json)已接收 1,473 输入，role seed 三处各 9 项、两修订合并后的 owner seed 包内/脱离各 13 项、Windows/Linux probe、迁移工具、默认 vet/最终来源复核/退出 0 与自有源码及缓存清理；无依赖安装。实际十项仍须新轮，原九过一败不改判。

可运行[完整重测脚本](evidence/a-download-owner-role-retest-20261021.ps1) `-Mode Role` 单独重测角色；`-Mode Both` 依次重测 owner 十一项和角色十项，任一 gate、SQL 或独立接收失败即停止。它逐轮创建新日志/来源，沿用下方全部原守卫，只在成功闭合 transcript 后调用原接收器，不重跑已接收的旧 MFA/准入专项。

【第七份稳定冻结基线】[读取完成边界合并验收](evidence/a-read-completion-integration-accepted-20261021-r1.json)通过五包 6,759 项，两包 5,019 项；旧六份清单保留。[新接收器验证](evidence/a-read-completion-integration-receipt-readers-preparation-20261021.json)采用该清单，角色 43、owner 57 项解析器及十一真实 CLI 拒绝。清理后并行新增两份 task_check_control 文件另行待审，本记录不扩大实际十项范围或放行当前整树，实际 SQL 尚未接收。

【第六份冻结基线已同步】[连接与日志合并轮](evidence/a-gc-connection-integration-accepted-20261021-r1.json)通过五包 6,591 项，两包 5,012 项；旧五份清单全部保留。[接收器验证](evidence/a-gc-connection-integration-receipt-readers-preparation-20261021.json)通过角色 43、owner 56 项解析器及十一真实 CLI 拒绝。后续 HTTP/读取路径变化不由本记录接收；实际十项、完整 GC 与生产权限仍待各自验收。

【后续第五份冻结基线】[共享日志取消修订](evidence/a-journal-cancel-accepted-20261021-r1.json)两包 4,977 项已固定，[新同步记录](evidence/a-journal-cancel-receipt-readers-preparation-20261021.json)通过角色 43、owner 55 项解析器及十一真实 CLI 拒绝。旧四份清单保留；冻结后另三份普通输入仍要求新完整受审基线，本专项十项范围不变，实际 SQL 尚未接收。

【2026-10-21 GC 日志新增源码后的同步】接收器已加入[第四份完整普通基线](evidence/a-gc-journal-accepted-20261021-r1.json)，当前两包 4,967 项；旧 4,822/4,864/4,939 项的来源和清单保留。[最新同步验证](evidence/a-gc-journal-receipt-readers-preparation-20261021.json)在当前基线下通过角色 43 项解析器、owner 54 项及十一真实 CLI 拒绝，实际 SQL 接收零新增。下方 r1 准备保留历史范围，本专项十项范围不变。

【2026-10-21 接收工具已准备，实际十项仍待执行】[新离线工具](evidence/a-download-gc-role-actual-review-20261021.mjs)与[准备回执](evidence/a-download-gc-role-actual-review-preparation-20261021.json)完成 43 项内存解析/反例检查及六份真实日志的 CLI 拒绝，实际接收文件零新增。它复用 SHA 固定的三份受审普通基线（两包 4,822 / 4,864 / 当前 4,939 项），不缩小完整清单；检查准确十叶子/root、两个位置 seed 各九项、实际元数据/撤权/角色/FK 观察、十账号/十子库/一角色/两 foreign schema 与原 UID/两端清理。没有重跑 Go、安装依赖或连接 SQL。先收齐 owner 十一项新回执，再使用本专项完整入口。

这是独立的 `-DownloadGCRoleOnly` 档位。已有 MFA 九项和准入/结果二十四项不重跑；task owner 十一项仍按原交接单独收回执。本专项只验证 `SQLDownloadGCEarlyReferences` 的实际账号、元数据与锁读前提，不执行 `Collect` 或完整 GC。

每项从正式 95 文件迁移 schema 克隆空表，再应用已有摘要固定的 canonical/ownership 候选夹具。账号权限是测试候选，不是已经批准的生产角色；候选 DDL 不进入正式迁移目录。

本地准备已通过[独立核对记录](evidence/a-download-gc-role-preparation-accepted-20261020-r2.json)：1,442 份冻结输入、普通两包 4,552 项检查、两个 seed 在包内和空目录独立二进制中各 9 项、默认 vet、Windows/Linux 探针和 Linux migration runner 编译、两种 PowerShell 各六档派发及两份 Bash 语法检查均完成。最终退出 0，所有本轮源码、缓存和二进制已删除并独立确认，未安装依赖、未连接远端。实际 SQL 十项尚未执行，不能计为通过。

r1 因并行 GC-task 测试的 vet 转发问题失败，原记录和退出 1 保留，其产物已清理；工作树中已有修正，r2 冻结副本包含该修正。r2 有一次已知 Windows 汇编工具故障，按原命令和同一缓存重试后通过；未关闭 vet，也未重试任何失败测试断言。r1 较早的角色夹具由当前带 Operation 标识 seed 校验的版本替代。回执只接收 r2 来源，不把旧失败记成通过。

## 十项范围

| 用例 | 实际观察 |
| --- | --- |
| least_privilege_metadata_and_lock | 受限账号的 tables/columns/incoming-FKs/indexes 摘要与独立 root 观察者一致；组件 Lock/Recheck；仅 users.id 的真实用户行 FOR UPDATE。 |
| forbidden_data_and_ddl | 七次明确的 MySQL 1142/1143 权限拒绝：读取密码、修改用户/任务、写入/修改审计、删除墓碑和 CREATE TABLE。约束错误或空数据不算权限拒绝。 |
| table_revoke_old_and_new_sessions | 撤销 audit_logs SELECT，原事务和新连接均拒绝，恢复后旧 guard 不复活，重新连接后的新 guard 可用。 |
| column_revoke_old_and_new_sessions | 撤销 users.id SELECT；同时验证新连接锁读被实际 SQL 权限拒绝。 |
| database_revoke_old_and_new_sessions | 撤销库级 LOCK TABLES；同时验证新连接的 users.id 锁读被拒绝。 |
| global_revoke_old_and_new_sessions | 撤销全局 REFERENCES；分别验证原连接/新连接的当前 SHOW GRANTS 拒绝，并记录新连接的元数据可见性，不预设服务器一定隐藏哪些行。 |
| active_role_rejected | 实际创建、分配并 SET ROLE，观察 CURRENT_ROLE 变化及组件拒绝。角色分配本身也改变 pinned grant 集合，不把此用例声称为单独覆盖某个内部判断分支。 |
| cross_schema_restrict_rejected | 独立随机 schema 的 incoming FK 可见；即使 root 重新采集 pin，组件仍拒绝跨 schema 引用。撤销 REFERENCES 后另建连接记录可见性并拒绝。 |
| cross_schema_cascade_rejected | 同上，另验证 CASCADE 结构。 |
| metadata_drift | 在拥有的克隆库中增加列，原 pin 拒绝；仅在探针内由 root 重采 pin 后恢复组件正向测试。 |

静态全局/库级权限可能受已有会话缓存影响，所以探针依赖当前 `SHOW GRANTS` 和独立新连接，不把旧连接里一次 SQL 成功/失败当作完整撤权证明。参见 [MySQL 权限变化](https://dev.mysql.com/doc/refman/8.4/en/privilege-changes.html)与 [SET ROLE](https://dev.mysql.com/doc/refman/8.4/en/set-role.html)。

## 执行命令

在 Windows PowerShell 中一次运行。先收齐原 task owner 十一项回执，再执行本专项。账号与角色的 GRANT/REVOKE 只发生在该脚本创建、校验 namespace UID 的一次性 MySQL Pod 中。不要将测试二进制直接指向共享或生产 MySQL。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ErrorActionPreference='Stop'
$gcRoleRun=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$gcRoleLog=Join-Path (Get-Location).Path ('docs\evidence\a-download-gc-role-mysql-remote-'+$gcRoleRun+'.txt')
$gcRoleSource=Join-Path (Get-Location).Path ('docs\evidence\a-download-gc-role-mysql-remote-source-'+$gcRoleRun+'.json')
$gcRoleExit=1
Start-Transcript -LiteralPath $gcRoleLog -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -DownloadGCRoleOnly -Remote -BuildParallelism 1 `
        -SshTarget 'root@10.130.14.23' -SourceManifestPath $gcRoleSource
    $gcRoleExit=0
} finally {
    Write-Host ('a_download_gc_role_mysql_remote_exit='+$gcRoleExit)
    Write-Host ('日志='+$gcRoleLog)
    Write-Host ('来源清单='+$gcRoleSource)
    Stop-Transcript
}
```

脚本使用现有依赖并禁用下载，不安装依赖。每轮冻结来源，保留原始日志；拥有的构建缓存、源码副本和二进制在 finally 清理。输密码时的 OpenSSH socket 提示仍以实际测试结果、清理标记及最终退出码判断。

## 回执要求与限制

完整日志须有准确的 `RUN namespace=... uid=...`、本轮 96 文件正式迁移目录及完整 001..081 回放、同轮二进制/胶囊摘要、恰好十个叶子和一个 root 的 RUN/PASS，以及以下总标记：

```text
PASS a-download-gc-role-mysql ... new_cases=10 actual_sql_accounts=yes metadata_observer=privileged maintenance=absent full_gc=not_run role_approval=no ... production_approval=no
CLEANED namespace=... uid=...
CLEANED remote-registration-scratch=yes
CLEANED local-registration-build-cache=True
LOCAL_PASS config-writer-frozen-postcheck=yes default-vet=yes dependencies-installed=no remote-requested=True
LOCAL_CLEANUP config-writer-source-owned=... removed=True
a_download_gc_role_mysql_remote_exit=0
```

另核对十个随机克隆库和十个临时账号、一个临时角色、两个 foreign schema 的删除及缺席确认。任何 `CLEANUP_PENDING` 都保留原身份处理，不以总 PASS 覆盖。探针错误只输出阶段和 MySQL 编号，不输出 SQL 密码、DSN 或完整服务端错误。

本专项明确使用 `maintenance=absent`：不证明候选维护收据表的实际空范围锁，也不证明完整 owner/artifact/ref/hold/lease、触发器/存储程序、DDL freeze、物理容量、worker 授权或真正删除。`REFERENCES ON *.*` 是探针中的候选元数据权限，尚无生产最小权限批准。生产账号、部署和真实人员 MFA/provider/E2E 仍待独立验收。

## 新完整日志的独立接收

本专项结束后，在同一个 PowerShell 会话中执行只读检查：

```powershell
node .\docs\evidence\a-download-gc-role-actual-review-20261021.mjs `
    --log ([IO.Path]::GetFileName($gcRoleLog)) `
    --source ([IO.Path]::GetFileName($gcRoleSource))
```

通过后，在同一命令末尾加 `--write`，按该轮准确 namespace 独占创建 `a-download-gc-role-mysql-accepted-<namespace>.json`，已有回执不覆盖。任何 FAIL、SKIP、panic、CLEANUP_PENDING、缺项/重复身份、错误 pin、缺失 postcheck/退出 0/transcript 结束均拒绝。各用例的角色和 foreign schema 必须绑定该用例准确随机账号，不能借另一用例的清理标记补齐。普通来源改变必须先取得新完整受审基线；新增 tagged 输入仍校验当前准确字节和 build tag。

[43 项解析器检查](evidence/a-download-gc-role-actual-review-parser-checks-20261021.json)的成功样例只存在于内存；六次真实 CLI 均使用 `--write`，确认失败的 role/owner 轮、本地准备及已接收 producer 十八项不能冒充实际角色十项，未生成实际 SQL 接收文件。r2 历史本地准备曾记录构建工具失败后同命令重试，仍由原准备回执说明；角色实际接收工具不会把其中的 `FAIL` 行视为实际 SQL 成功。
