# A：证据下载 SQL 审计只读采集器

新增独立 `backend/cmd/system-backup-audit-collect` 和本地 `scripts/system-backup-a-live-audit.mjs`。不修改另一 A 的 registration SQL 元数据采集入口；本工具只取一个真实下载 Operation 的业务审计关联，不采集表结构或 SHOW GRANTS。

【2026-10-22 14:43 原轮隔离 MySQL 专项已接收】[完整记录](system-backup-a-live-audit-mysql-20261022.md)与[A 接收回执](evidence/a-live-audit-mysql-accepted-20261022.json)确认 17 个实际 SQL 子项、五份原始 envelope 的 Node 正负复核、原 31 项源码/二进制绑定、SSH/远端退出 0 及准确 UID namespace/两端清理报告均通过，无需重跑此专项。两轮旧失败保留；原源码证据胶囊及专用历史复核不受后续共享 checker 变化覆盖。实际 HTTP 回执仍是合成夹具，正式迁移、TLS、本人 MFA/provider、受审装配及整条真实下载链路尚未验收。

HTTP 成功回执仍为 `HTTP_PASSED_AUDIT_PENDING`。新工具与原 `--query` 共用 `backend/cmd/system-backup-audit-collect/audit.sql`；Go 编译时嵌入同一文件，只以绑定参数查询指定 `sop_...`，没有接收任意 SQL 的入口。查询返回至多两行，必须恰好一行且不超过 64 KiB。关联范围保持 Operation、admission receipt、原 intent audit、result retention link、原 result audit 和 consumed nonce 计数，不选择密码、token、proof、raw claim、nonce HMAC 或 provider locator。

## 采集边界

使用原受控观察 DSN 文件，不复制或打印凭据；不授予新权限、不替代真实运行身份验收。请求绑定完整 `CURRENT_USER()`、`CURRENT_ROLE()`、server UUID、database、Operation 及原 HTTP 回执**完整文件字节 SHA**。一个 repeatable-read/read-only 事务内前后核对这些身份、connection ID 和 SQL UTC，读取失败、额外行、身份/角色/连接变化、时间倒退或回滚失败均不输出采集成功结果。只执行身份 SELECT 和固定业务 SELECT，最终显式回滚，永不 commit。

Unix 模式仅允许原绝对 socket DSN；TCP 只允许正常验证的 TLS，必须提供固定 SHA 的原 CA bundle 及准确 server name，不接受 skip-verify/preferred 或明文回退。拒绝 multiStatements、allowAllFiles、cleartext/旧密码选项及任意 DSN session SET 参数；仅接受既有 UTC time_zone。超时有界，事务中失败即终止，不重放采集查询。

结果 envelope 记录请求/查询/原 HTTP 回执摘要、前后观察身份、只读和回滚状态，以及原 SQL JSON 字节的 base64 与 SHA。base64 用于无损传递，不是加密。Go 在输出前限制公开字段形状和类型；本地接收器继续执行原审计核验，校验所有链接、关闭正文、规范摘要/大小、时间顺序、字节数及唯一 consumed nonce。任何校验失败均不创建 export；旧文件不覆盖。

通过后仍只表示 `LIVE_HTTP_AUDIT_LINKS_PASSED`。envelope 不是签名证明，操作者导出来源、受审二进制/镜像摘要及 SSH/Kubernetes 传输/Pod UID 仍须结合当轮来源复核；它不证明完整恢复 E2E 或其他准入条件通过。

## 使用顺序

以下是有真实 HTTP 回执和受审观察连接后的命令格式。当前现场尚未具备完整下载运行时和输入，因此本轮不执行远程命令；取得准确 Pod/UID、原 DSN/CA 路径及镜像内二进制摘要后，再给操作者固定现场命令。不要把占位路径或本地构建指纹当成部署事实。

先准备公共 `observer.json`，每个值都取既有观察连接的真实结果。Unix 格式如下；这里的账号是示例，不能直接作为现场事实：

```json
{"current_user":"observer@localhost","current_role":"NONE","transport":{"mode":"unix","server_name":"","ca_sha256":""}}
```

TCP 则使用 `mode=tls`，填写真实 `server_name` 与原 CA bundle 的完整文件 SHA。不能通过改请求中的观察账号绕过原数据库身份核对。

```powershell
node .\scripts\system-backup-a-live-audit.mjs `
  --request C:\evidence\http-receipt.json `
  --observer C:\evidence\observer.json `
  --output C:\evidence\audit-request.json
```

在已有受审观察容器内运行的 Linux 命令格式：

```bash
# stdin 是上述原 request 文件字节；--dsn-file 只指定原受控挂载路径。
/usr/local/bin/clawreef-system-backup-audit-collect \
  --dsn-file /original/mounted/observer-dsn < /original/input/audit-request.json
# TLS 模式再增加 --ca-file /original/mounted/mysql-ca.pem。
```

输出是单个 collection JSON。经受审通道保存其原始字节为 `audit-collection.json` 后，本机核验并独占生成与旧接收器兼容的原始 export：

```powershell
node .\scripts\system-backup-a-live-audit.mjs `
  --collection C:\evidence\audit-collection.json `
  --receipt C:\evidence\http-receipt.json `
  --request-file C:\evidence\audit-request.json `
  --output C:\evidence\audit-export.json

node .\scripts\system-backup-a-live-chain.mjs `
  --audit C:\evidence\audit-export.json --receipt C:\evidence\http-receipt.json
```

两套既有应用 Dockerfile 已增加 collector 的 build/COPY，不启用 listener 或工作负载。本次不构建/推送镜像，也不执行安装依赖的镜像步骤；旧 fix18 镜像不会因此自动获得新二进制。

## 本地验证

Node 的新增请求/接收器用例与原 live-chain 回归分开执行。Go 用显式 synthetic SQL driver 检查只读事务、参数化原查询、前后身份、缺行/重复行、流/关闭/回滚失败与字段拒绝；不将这些用例描述为真实 MySQL 验收。

```powershell
node --test --test-isolation=none .\scripts\system-backup-a-live-audit.test.mjs
node --test --test-isolation=none .\scripts\system-backup-a-live-chain.test.mjs
.\scripts\system-backup-a-live-audit-validation.ps1
```

Go runner 在独占目录冻结本命令源码/SQL/fixture 和 go.mod/sum，使用已有模块缓存、关闭下载、保留默认 vet，编译 Windows/Linux 命令。finally 恢复环境并删除本轮副本、cache/tmp 与二进制；不触碰其他对话的工作目录。现场 SQL、TLS 握手、连接授权和实际执行计划仍待真实环境验证。

2026-10-22 新增[独立 MySQL 远测入口](system-backup-a-live-audit-mysql-20261022.md)：17 个实际 SQL 用例，隔离命名空间、已有镜像缓存、合成选定列夹具和 Node 错链复核。原准备阶段的本地单测/default vet/Linux 编译及清理结果保留，14:43 轮实际结果已按页首接收，不再列为待回传。该夹具不运行正式应用迁移、不执行真实 HTTP，也不替代另一个 A 的 owner/角色验收。

[本地最终回执](evidence/a-live-audit-collector-local-20261022-095403-2f5c657f.json)确认 Go 单元测试/默认 vet、Windows 和 Linux 编译全部通过，入口退出 0，源码和文件集合前后匹配，cleanup=true；独占目录随后已独立核对不存在。冻结输入摘要为 `2a45e6cdcd732635a8c89bf6931bd6e3ff1c1807b43a98c8ce8c70159c3e8ecd`，起止 UTC 为 `2026-10-22T01:54:03.276539Z` 至 `2026-10-22T02:09:08.6258561Z`。Windows 实际命令另完成无效请求检查：退出 1、仅固定公共错误、未打开数据库。回执的两平台二进制摘要仅是已删除测试构建的指纹，不能自动当作镜像 digest 或镜像内经过不同构建参数生成的二进制指纹。

[交付核对记录](evidence/a-live-audit-collector-delivery-20261022.json)保留新增 Node **7/7** 和原 live-chain **11/11** 通过、关键交付文件摘要及未验范围。原套件首次沙箱内为 6 通过/5 失败，Bash/OpenSSL 子进程启动受限；申请本机执行后完整 11 项通过，没有删减用例。Go 首轮因测试夹具使用 POSIX socket 路径而未通过，已保留[失败记录](evidence/a-live-audit-collector-first-attempt-20261022.json)，改为宿主绝对路径并补 TLS pin/降级负测后完整重跑通过；不把首轮改判成功。Node 临时证书/计划/请求/export、Go 缓存/副本/二进制均已清理，没有安装依赖、构建或部署镜像、连接真实数据库，也没有关闭任一 bootstrap 准入缺项。
