# D registration runtime 部署增量

后续准入增量与本轮实际搜索结论见 [真实配置准入与部署缺项](system-backup-d-real-admission-20260928.md)。新增强制 admission 编排和离线授权文件读取、公开输入核验、Dockerfile 二进制打包接线；仍缺实际资源 adapter、六类 registry 和二十类配置 ref 映射，未部署 HTTP、未验本人 MFA、未激活配置。

目标仍是实际服务部署、管理员本人 MFA 与配置激活；本文件记录部署前置的实现和验证范围，不表示这些验收已经完成。

最新隔离远程验证已通过：[93 文件迁移与 HTTP/MySQL 接收记录](evidence/system-backup-d-runtime-migration-mysql-sbk-mig-260928072119-004e.json)。namespace `sbk-mig-260928072119-004e` / UID `01632b8f-0728-4ed3-8aef-22ef44000a44` 使用 MySQL 8.4.8；固定摘要的独立 migration runner PASS，`001..080 applied=93 exact_filenames=yes`，9 个一级用例和 bootstrap 3 个嵌套用例全部 PASS（总计 1.54 秒）。三个构建摘要和 catalog 摘要匹配本地记录，163 项源码绑定复核一致。两个测试数据库、匹配 UID 的 namespace、远程 scratch 和本地缓存均报告 CLEANED；本地另查剩余 scratch 为 0。回执 SHA-256 为 `31bd7869b76e4c6002ff168e276f0efb03778cd2377822f57848bf55398e0b62`。来源为操作者控制台附件，未独立查询远端，未提供单独 shell 退出码。

此结果完成新增迁移入口及 080 的隔离 MySQL 验收，无需重复运行同一套件。HTTP/JWT/MFA 链中的用户、provider 事实和 bootstrap admission 仍是 synthetic fixtures；日志明确 `human_mfa=false real_transit=false active_config_updated=false`，独立迁移命令同样报告未激活配置、未验证本人 MFA。下一步属于真实 admission、运行身份与服务部署，不能以此测试替代。

## 正式运行表

`080_add_system_backup_registration_runtime.sql` 将已经在隔离 MySQL 验证的四张表纳入 embedded migration catalog。CREATE TABLE 语句保持与历史 addendum 一致，新增单元测试按 migration runner 的 SQL 分割结果比较两份 DDL，避免两套定义漂移。历史 addendum 只保留作已有证据的来源；后续 probe 从正式 080 取 DDL。

| 表 | 分类 | 备份/恢复策略 |
| --- | --- | --- |
| system_backup_totp_credentials | secret | metadata_only / reference_only |
| system_backup_admin_sessions | confidential | metadata_only / reference_only |
| system_backup_admin_revocations | confidential | metadata_only / reference_only |
| system_backup_metadata_reservations | internal | metadata_only / reference_only |

只记录 schema 元数据，不复制 seed、会话、注销截止时间或容量预留数据。恢复不得覆盖目标现有会话/注销状态或清零容量计数；新目标需要独立认证身份和管理员登记。ownership、schema registry 及 A 交叉评审请求已同步，状态为 owner_recorded，approved_cross_reviewers 仍为空；这不是已完成 A 评审或已冻结 schema。

新 migration catalog 为 93 个文件，SHA-256 `68794bddc66b9809fae57a111778dd8ad53e2a5a5bfb218108295c8d751b1564`，inventory 为 99 个对象。旧 92 文件/001..079 的现场证据保留，但不能作为新 catalog 的 live schema hash。

## 独立迁移入口

`backend/cmd/system-backup-migrate` 复用应用 `internal/db` 的 embedded migration runner。独立部署 job 无须启动 HTTP server/controller，运行条件如下：

- `--catalog-only` 只输出内嵌的公开目录，不打开数据库。
- `--apply` 要求 `--dsn-file`、`--expected-server-uuid`、`--expected-database` 和 `--expected-catalog-sha256`。DSN 从受保护的挂载文件读取，不放在命令行或证据里。
- catalog 摘要不匹配时不建立数据库连接；库名/UUID 在持有 migration exclusion 的同一物理连接中检查，在任何 DDL 前拒绝错库。
- 继续使用现有 capture gate 检查；capture 活动时拒绝待执行迁移。已有未知 migration filename 时拒绝，不能将新库伪装成旧 catalog。
- MySQL DDL 可能部分提交。失败后保留相同目标和 catalog 重试，依靠已有 migration ledger 与 CREATE IF NOT EXISTS 恢复；不会删除现有表或清空其内容。
- CLI 不输出原始驱动错误或连接输入，只在全部迁移和释放锁成功后输出 PASS。该 PASS 不代表配置已激活或 MFA 已验证。

## 隔离验证入口

沿用 `scripts/system-backup-d-provider-registration.ps1 -Remote -SshTarget root@10.130.14.23`。本次 runner 额外构建并固定 migration binary 的 SHA-256，在新建、UID 绑定的 MySQL namespace 内执行当前 93 文件目录，再核对实际 applied filenames，最后运行 9 个 HTTP/MFA/bootstrap 用例。旧应用镜像仍作为历史环境标识，但在此专用模式不启动其 migration-app Pod，也不以它的旧 embedded catalog 声称重放了 080。

远端 migration executable 和 DSN 临时文件在子进程 trap 中删除；整个临时 namespace、上传目录和本地编译缓存沿用现有清理逻辑。普通 fresh/controller smoke 模式保留原 app-image 路径；此独立二进制模式仅允许 D provider-registration 隔离验收。

## 本地校验记录

本轮离线 runner 退出 0：security、db、migrationcoord、migrationcatalog 测试通过；Linux MySQL probe、HTTPS registration service 和独立 migration CLI 编译通过。合同检查 6 项、smoke contract 检查 4 项通过；修正 A 评审请求清单遗漏后，contract artifacts 70 项复跑全部通过。schema inventory 与非 strict contract check 通过，现有冻结阻塞项仍保留。未安装依赖，测试构建缓存已删除，剩余 registration scratch 为 0。

证据：`docs/evidence/system-backup-d-runtime-migration-local-20260928.json`，包含 163 项来源摘要；证据 SHA-256 为 `c28e8ab2021c392121039e423d26167e5087cf976df1578b2e26ccd0497c3a6a`。

新 migration binary SHA-256 为 `4869c6c4e2bb4424cc24671b8ff9c11fc9e2b4a82e5cfb8a2140990b16894e88`，probe SHA-256 仍为 `d5d994bffb426a5be75073a8fb20457e7557e4485fed6f334c7efb3b4d9db877`，本轮 DDL bundle SHA-256 为 `3d5eeab6f1b4393bfb3f92c57b5ce18d910694ac186c186d06e79b6058141b52`。DDL bundle 的摘要变化来自正式 080 文件；表定义一致性测试已通过。本地证据生成时远程尚未执行；现由本文开头的新回执补充 `PASS pinned-migration-runner` 和 `fresh-migration-replay=001..080 applied=93 exact_filenames=yes`，原本地证据保留不改写。

## 实际部署待办

本次没有修改实际 `clawmanager` 库。实际运行时部署还需要数据库身份现场复核、完整九项 registry 与二十项 typed ref admission、最小权限数据库/Transit/S3 运行身份、TLS listener/容量采集、core logout hook 接线、真实管理员 MFA，以及配置事务和激活验收。现有非交互 SSH 在本轮只读复查仍为 Permission denied；远程命令需要操作者自己的密码终端，凭据不经聊天传递。
