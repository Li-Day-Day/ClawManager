# A 对 D 登记、HTTP/MFA 与首次初始化组件的复审（2026-09-28）

最新结论：**A-D-REG-01/02 在本地组件范围关闭；`080` / 93 文件迁移与隔离登记链路已获 A 限定范围接收，实际部署、配置激活和整体 capability 仍未批准。** 当前仍为 v12 draft。

## 远程结果接收（2026-09-28 07:55 UTC run）

操作者回传 `sbk-mig-260928075523-63e2` / UID `f79546bb-6441-49c7-9cf8-bd624f77ccad`：MySQL 8.4.8，固定摘要 migration runner PASS，`001..080 applied=93 exact_filenames=yes`，九项一级用例与三项 bootstrap 嵌套用例全部 PASS，总耗时 1.28 秒，`a_review_remote_exit=0`。见 [A 接收记录](evidence/system-backup-a-runtime-migration-sbk-mig-260928075523-63e2.json)和[完整操作者输出](evidence/system-backup-a-runtime-migration-sbk-mig-260928075523-63e2.txt)。

A 已核对 probe/DDL/migration binary/catalog 四个摘要，并重新核对 A 本地记录的 60 项、D migration 本地记录的 163 项源码绑定，全部匹配。输出含两个测试数据库、匹配 UID 的 namespace、remote scratch 和本地缓存的 CLEANED 标记；本地另行检查剩余 runner scratch 为 0。四条 SSH socket close 提示之后仍有成功测试、清理及退出 0，未据此判失败，也未诊断其根因。远程事实来自操作者回传，本轮未独立连接远端。

本次与 D 已登记的 `sbk-mig-260928072119-004e` 是不同 run，分别保留，不混用 UID、耗时或退出码。**这组成功测试无需再跑。** 当前关闭的是全新隔离库迁移与 synthetic HTTP/MFA/bootstrap 链路验证；实际业务库升级、controller 现场准入、本人 MFA、真实 admission/部署及正式激活仍待完成。

本轮机器记录见 [A 本地复审证据](evidence/system-backup-a-d-activation-review-local-20260928.json)。历史 [09-24 复审](system-backup-a-d-registration-rereview-20260924.md)保留当时失败，不改写为通过。用户要求需要远程测试时暂停目标；本轮未执行 SSH、部署、配置写入或本人 MFA。

## 本地复审时的版本与旧证据关系（远程执行前历史）

- 09-28 runtime migration 本地记录的 163 个源码绑定与本轮工作树全部匹配。
- 09-28 HTTP/MFA 修复记录的 55 个绑定中，53 个匹配；`system-backup-d-provider-registration.ps1` 和 `system-backup-d-provider-registration-phase.sh` 已为新迁移流程更新。原 9/9 PASS 继续证明原隔离链路，不能证明新执行脚本或 `080` 已远程通过。
- 当前 catalog 为 93 个文件，SHA-256 `68794bddc66b9809fae57a111778dd8ad53e2a5a5bfb218108295c8d751b1564`。新迁移为 `080_add_system_backup_registration_runtime.sql`。历史远程 fresh migration 只有 `001..079` / 92 文件。
- A 使用当前源码重新计算五个 issuer 执行器绑定及 challenge，核对两个候选 registry pin，并重新验证 `d-sig-fa480a2d4c87ebdf0e48f9e6` 的两份 Ed25519 签名通过；16 项 ACL 拒绝和清理仍是该运行的报告事实，本轮未独立查询远端。
- 旧 schema candidate 不自动更新。本轮没有把候选 registry 设为 active，没有修改冻结/能力批准标志，也没有把历史操作者摘要补签成新 provider 观察。

## A 审阅结论

| 范围 | 当前可接收的行为 | 限定与未完成项 |
| --- | --- | --- |
| 三个 registry profile | pinned 原始字节 hash 后，逐层检查精确字段、必填、非 null、重复字段、Unicode 和规范公钥 base64；原大小写角色/撤销覆盖及缺失/null 撤销反例独立复测通过。 | 关闭 A-D-REG-01/02。格式兼容不批准候选启用；C/D 的 profile 及实际映射评审仍需独立完成。 |
| provider-proof 事务 | 服务端 actor/config/target 绑定；已提交重试重新鉴权；未提交请求验签后将 evidence、operation、nonce、audit 与容量预留放入同一事务；Commit 后才返回 201。 | 本地故障 driver 不证明真实 commit 断连；跨安装 HMAC 轮换并发也尚无覆盖。 |
| HTTPS/JWT/MFA | HTTPS 在顶层入口强制；不信任转发身份头；JWT 只接受 access/HS256，并要求 iat/exp；TOTP 将权限、配置、密码和重放状态检查放入同一事务，密文绑定 installation/user；退出钩子撤销会话。 | 真实运行 token/TLS/collector/core logout 部署与管理员本人 MFA 未验收。失败 HTTP 请求审计仍有缺口，不能视为完整审计闭环。 |
| provider 观察与签名 | 目标来自锁定的 external_action；S3 只读限定 endpoint/bucket/prefix，HEAD 后按明确版本 GET 并核对实际 checksum/长度；Transit 固定 CA/key/version，返回签名经本地公钥复验。 | 仅覆盖 manifest/marker/acceptance 的 presence；不覆盖 catalog、absence、staging/restore ownership。位置 hash `{bucket,endpoint,key}` 只能在当前 profile 内解释，跨 provider 仍待 C/D 共同确认。 |
| 首次配置 | 完整解码所有九类 registry、二十类 ref；配置固定为 v1 enabled=false；数据库 UUID/库名与当前本地管理员绑定；缺少 admission 拒绝；同键重试仍检查 offline grant。 | 生产 `BootstrapAdmission` 和调用入口尚不存在。六类 registry 和二十类 ref 的实际映射不能用测试 fixture 代填；只读 `-check-activation` 不是激活命令。 |
| 容量/历史 nonce | 容量报告绑定数据库与时间，预留在登记事务内；历史 nonce identity/version 解析缺失或歧义时拒绝。 | 容量尚未覆盖其他控制面写路径；不能用单一登记路径证明共享预算完整性。 |

本轮未在上述审阅范围确认新的独立实现缺陷；这不替代未覆盖的部署、数据库并发和跨 owner 验收。仍缺少的生产入口、审计和适配能力是明确的开放工作项。

## 新增 A 独立负测

测试位于 `scripts/system-backup-a-d-registration-review/activation_review_test.go`，由原 A runner 一并执行：

1. 逐一移除九类 registry、二十类 ref；所有请求必须在 admission/写入前拒绝，不接受以有效格式 hash 替代缺失输入。
2. 模拟数据库已提交、客户端丢失回执后撤销 offline grant；同键重试必须拒绝，不能凭旧 operation 返回成功。此项使用本地故障 driver，不声称真实断网覆盖。
3. 对五条敏感路径伪造 `X-Forwarded-Proto` / 身份头，HTTP 明文必须返回 426；HTTPS 上两个 bootstrap 路径必须返回 404。

原 A 反例断言保持不变。runner 使用已有依赖、关闭下载，并清理专用源副本与编译缓存。详细测试结果以机器记录为准。

本轮结果：A 六个顶层测试、37 个具名子测试全部通过（1.693 秒）；D 安全、db、migrationcoord、migrationcatalog 四个包及默认 vet 通过，Linux MySQL 探针、HTTPS 服务和独立迁移程序均编译成功，两个 runner 退出 0。Node 共 83 项通过，bootstrap 规则对照及非 strict 合同检查通过，strict 冻结仍未达成。两个 runner 的临时目录均已清理，最终重新核对 60 个源码绑定全部一致。期间 Bash 子进程受沙箱 EPERM 阻止、一次语法校验进程以 `0xc0000043` 退出；对应离线检查在沙箱外重跑通过，未安装依赖。

## 本次已执行的远程增量验证（保留复现命令，无需重跑）

目标是 **`080` 随完整 embedded catalog 在隔离 MySQL 重放，并在当前迁移提取 DDL 上完成登记/HTTP/MFA/bootstrap 回归**。不是重复部署 provider lab，也不是上线或激活。现有远程入口不验证已部署 controller 准入、真实 commit 断连、跨安装轮换并发或本人 MFA；这些继续单独待验。

在本机仓库根目录的 PowerShell 中执行以下完整命令；使用已有 Go/SSH/SCP/tar，SSH 密码只在终端交互输入：

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    $aReviewRemoteExit = 1
    try {
        & .\scripts\system-backup-d-provider-registration.ps1 `
            -Remote `
            -BuildParallelism 1 `
            -SshTarget 'root@10.130.14.23'
        if (-not $?) { throw 'Remote registration/migration runner failed' }
        $aReviewRemoteExit = 0
    } finally {
        Write-Output "a_review_remote_exit=$aReviewRemoteExit"
    }
}
```

执行器固定 context=`kubernetes-admin@kubernetes`、source namespace=`clawmanager-zhanghui08-system`、node=`node1`，应用镜像固定为已交接 digest；它读取源安装版本/镜像信息，在新 `sbk-mig-*` namespace 的临时 MySQL 内写入并测试，不对实际业务库运行迁移。host key 必须已受信；命令不关闭主机校验，也不下载依赖。

请保留完整输出，至少包括：

- `LOCAL_PASS` 中 probe/DDL/migration binary SHA-256；新的 DDL 预期为 `3d5eeab6f1b4393bfb3f92c57b5ce18d910694ac186c186d06e79b6058141b52`，以当前源码重新构建的实值核对。
- `PASS pinned-migration-runner` 及上述 93 文件 catalog hash、完整 migration 文件名核对输出。
- `TestDProviderRegistrationMySQL` 的九项及 bootstrap 三个嵌套子项，`PASS d-provider-registration-mysql`。
- run namespace 和 UID、bootstrap/registration 数据库清理、`CLEANED namespace=...`、`CLEANED remote-registration-scratch=yes`、`CLEANED local-registration-build-cache=True`，以及 `a_review_remote_exit=0`。

出现 `CLEANUP_PENDING`、`CLEANUP_SKIPPED` 或缺少上述关键结果时保持未通过，回传原输出和对应资源身份；不得按名称通配删除其他运行资源。成功后只登记本次版本覆盖的结果，不据此关闭全部 P0 门禁。

## 接收后的 A 工作

1. 【已完成】核对本次 hash、迁移数量、测试和清理结果，补充顶部 A 限定范围接收记录。
2. 与 D/C 闭合真实 `secret_allowlist`、灾备身份映射及安全 ref 输入，评审真实 admission；由 D 完成部署接线后再验本人 MFA/配置激活。
3. 推进 A 外置 evidence 加密、`sev_` 下载鉴权/Range、保留与 GC，以及生产 task/attempt 授权、源集群外读取验签。
4. 基于明确的新迁移部署状态重新接收 schema evidence；保留旧 candidate 和原历史签收，不自动补批。
