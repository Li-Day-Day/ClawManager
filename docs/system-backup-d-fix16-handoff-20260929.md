# fix16：D 现场无重启恢复验收入口

操作者提供：`backup-test-zh-fix16`，digest `sha256:d462c2a08f8ff5dccabad5d1634c2ce1ccc478822b809d3329393a527e12169e`，manifest size 856。发布信息来自操作者，本地未拉取镜像或独立核对 registry。

沿用之前确认的 repository：`10.130.14.23:5000/clawmanager`。入口固定使用 repository@digest，不依赖 tag。若这次 repository 有变，使用 `-Image 新repository@同一digest`；不同 digest 会拒绝。

在本机仓库根目录的 PowerShell 中由管理员执行：

```powershell
.\scripts\system-backup-d-fix16-remote.ps1 -CheckOnly
.\scripts\system-backup-d-fix16-remote.ps1
```

默认 `root@10.130.14.23`、context `kubernetes-admin@kubernetes`、source namespace `clawmanager-zhanghui08-system`、node `node1`。操作者本人处理交互 SSH；脚本可能因传输、测试和清理多次提示密码。不关闭 host-key 验证。`-CheckOnly` 只核对本地文件和合同计数，不连接服务器、不产生构建/测试临时目录。

正常入口规范化并打包当前隔离 smoke 及 migration 输入，以 archive SHA-256 验证上传内容；沿用现有 harness 在随机 `sbk-mig-*` namespace 内重放所需 migration，启动两副本 Controller。source namespace 只用于读取既有 MySQL 镜像与版本，不更新实际应用 Deployment，不对实际应用库撤权。数据库不变量、注册/MFA、schema capture 等独立套件均关闭。

transition 准备阶段本身包括 failover/rolling-restart。**无重启断言只适用于之后的 grant drift 两轮**，以该阶段开始时的 Pod UID、container ID、restartCount 为基线：

- 撤销 `SELECT system_backup_configs`，两副本失去 readiness；恢复后自动回到 leader=1、standby=1。
- 撤销 `UPDATE system_backups`，同样自动恢复。
- 两轮期间 Pod、容器、重启计数和 installation 状态投影均须保持不变。

验收需要完整输出中的两条 `PASS controller-grant-recovery ... restored-without-restart=true`，harness 的匹配 UID namespace `CLEANED`、远端脚本和本地脚本 `CLEANED`，以及 PowerShell `$LASTEXITCODE`/成功返回。任何失败或 `CLEANUP_PENDING` 都不登记现场通过。不得用 fix15 的“恢复时重启”回执替代本轮证据。

此入口不发布 HTTP、不部署 collector、不完成 MFA 或配置激活。容量部署模板中的 `image` 可以引用本 digest，但镜像是否包含最新 collector flags、实际 DB/PVC/UID/专用账号及可信 schema 基线仍需按容量预检检查。仅收到 digest 不能消除这些门槛。

2026-09-29 已收到操作者完整阶段回传：run `sbk-mig-260929022805-0758`，UID `c95e3256-469b-4113-bd84-54112b8324be`。93 文件重放、专用账号和两副本 transition 通过；SELECT/UPDATE 两轮均报告无重启恢复，身份/计数/installation 投影不变。namespace 与两端脚本目录均报告清理，本地另查 `.tmp-d-fix16-*` 剩余 0。见 [fix16 隔离验收证据](evidence/system-backup-d-fix16-isolated-smoke-20260929.json)。

按操作者回传登记本次隔离范围通过；未独立查询远端，也未提供单独进程退出码，不补写 exit=0。SSH socket 关闭提示伴随完整 PASS/CLEANED，当前不据此要求重跑。容量采集器、实际 HTTP/MFA/激活仍未验收。旧 fix15 入口和历史证据保留不变。
