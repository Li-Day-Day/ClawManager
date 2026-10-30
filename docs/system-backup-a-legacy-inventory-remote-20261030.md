# A：现库结构直接采集的本地 SSH 入口

2026-10-30。当前现场 App 容器对 `/usr/local/bin/system-backup-legacy-inventory` 的只读可执行检查返回 `SSH_EXIT=1`。D 已从用户提供的全库无数据 DDL 在隔离 MySQL 中重建候选结构指纹 `ec1b3e004d83fb6e82aebecf33d1d5ad1d88cb2e094325c26aea9d3530d5e28b`，但那不是现场数据库的直接采集。[D 的现库导入交接](system-backup-d-existing-db-import-4fe83bcd-20261030.md)要求同算法现场读回。

从本地仓库 PowerShell 执行：

```powershell
py -3 -B scripts/system-backup-a-legacy-inventory-remote.py; "A_REMOTE_EXIT=$LASTEXITCODE"
```

脚本固定 namespace `clawmanager-zhanghui08-system` UID `337cfe30-2c17-4b8e-b32a-760778b8098e`、App Pod `clawmanager-app-788b97b78f-l8k5f` UID `aabba383-5db9-48a7-a3b7-2b92624c2f3a`、MySQL server UUID、库名和原 97 行 ledger SHA。它先核对 Pod UID、架构及 App DB 环境变量是否存在，再在本地独立临时缓存中构建 D 已提交的只读命令。经 SSH 标准输入把二进制 base64 传给固定 Pod，在该 Pod 的 `/tmp` 创建一次性文件；执行后检查删除回执并再次核对 Pod UID。本地构建目录在退出时删除。远侧不需要仓库，不滚动 App 镜像，不读取业务行或密码值，不运行 DDL、导入或备份。

只有成功读取、固定身份/ledger/只读标志与 JSON 结构均验证后，才会创建 `docs/evidence/a-site-legacy-inventory-direct-20261030.json`，并打印文件 SHA、现场 schema SHA、表数与两侧临时产物清理状态。这个 JSON 是结构证据，不是迁移或备份准入；现场与隔离候选指纹即使相同，也仍需 D 核对三项额外历史 SQL 原字节及真实行的隔离副本迁移和回退。命令失败时保留原现场，若提示远侧临时文件清理未证实，按错误中的唯一 `/tmp/sbk-a-legacy-inventory-*` 路径单独核查，不重建 Pod。

本地 `py -3 -B scripts/system-backup-a-legacy-inventory-remote.test.py` 三项退出 0，覆盖固定身份、拒绝迁移标志、ledger 变更、重复 JSON 字段和只接受本轮命名前缀下的缓存续跑。`GOOS=linux GOARCH=amd64 CGO_ENABLED=0` 对 D inventory 命令的独立缓存构建退出 0，8,896,807 字节且 ELF 头正确；该次验证的临时构建目录已删除。现场入口首次执行的 Python 进程已退出而 Go 子进程仍在运行，原窗口的最终退出码和原因尚待操作者回传，且未产生直接 schema JSON；本地残留缓存须取得 Go 终态后才能复用或清理，不能把初次执行记为远测成功。
