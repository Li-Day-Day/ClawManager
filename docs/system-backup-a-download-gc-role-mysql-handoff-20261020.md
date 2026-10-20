# A：隔离 MySQL 的 GC 受限账号探针

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
$gcRoleRun=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$gcRoleLog=Join-Path (Get-Location).Path ('docs\evidence\a-download-gc-role-mysql-remote-'+$gcRoleRun+'.txt')
$gcRoleSource=Join-Path (Get-Location).Path ('docs\evidence\a-download-gc-role-mysql-remote-source-'+$gcRoleRun+'.json')
$gcRoleExit=1
Start-Transcript -LiteralPath $gcRoleLog -NoClobber
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadGCRoleOnly -Remote -BuildParallelism 1 -SourceManifestPath $gcRoleSource
    $gcRoleExit=0
} finally {
    Write-Host ('a_download_gc_role_mysql_remote_exit='+$gcRoleExit)
    Write-Host ('日志='+$gcRoleLog)
    Stop-Transcript
}
```

脚本使用现有依赖并禁用下载，不安装依赖。每轮冻结来源，保留原始日志；拥有的构建缓存、源码副本和二进制在 finally 清理。输密码时的 OpenSSH socket 提示仍以实际测试结果、清理标记及最终退出码判断。

## 回执要求与限制

完整日志须有准确的 `RUN namespace=... uid=...`、95 文件正式迁移目录、同轮二进制/胶囊摘要、恰好十个叶子和一个 root 的 RUN/PASS，以及以下总标记：

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
