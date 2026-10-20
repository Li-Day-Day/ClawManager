# A：下载 MFA 九项实际 SQL 增量交接

【2026-10-19 MFA 九项实际 MySQL 已独立验收，不再重跑】[15:32 同轮原始日志](evidence/a-download-mfa-mysql-remote-20261019-153234-9c7cba5d.txt)、[冻结清单](evidence/a-download-mfa-mysql-remote-source-20261019-153234-9c7cba5d.json)通过[42 项独立核对](evidence/a-download-mfa-mysql-accepted-sbk-mig-261019074200-5d04.json)：1,399 输入，来源摘要 `47a48cc3b11db4cebc3abbefbc17f3596c27a5dd378b3be91e5fa9289d103002`，两完整包 536 主/4,120 含子项通过，包内和独立 MFA seed 各 8 项通过，无失败/跳过。MySQL 8.4.8 上准确九叶子/root 全部通过，95 文件完整迁移、probe/input/runner pin、九个唯一 owned 子库 DROP/缺席检查、namespace `sbk-mig-261019074200-5d04` / 原 UID `85af61d4-eec0-42c5-9627-0ca132621fdb`、两端清理、源码 postcheck/default vet 和最终 exit 0 齐全；准确本地 source owner 独立确认不存在。未安装依赖。

当前 441 份 MFA/security/evidence/正式 SQL/传输重点来源仍匹配；准入记录、结果事务及两份关联测试共四份后续变化明确排除，本回执不扩大为当前完整准入或结果保留链验收。owner/issuer/material 仍是合成输入，未执行人员 MFA、provider read 或准入 nonce 消费，也无生产批准。下一步按[完整准入十三项加结果保留八项交接](system-backup-a-download-admission-mysql-handoff-20261019.md)使用新冻结来源执行二十一项。下文启动阻塞、失败和待执行命令保留为历史，不改变失败轮 exit 1，不再重跑本已接收九项。

【MySQL 启动阻塞已关闭，继续完整九项】操作者轻量复测 `sbk-mig-261019073054-4a78` / UID `54ff8e2d-b156-461a-ac35-e973d1b12dee` 返回 `MYSQL_STARTUP_PASS readiness=yes image_pull_policy=Never`、`mysql_startup_diagnostic_exit=0`；MySQL 8.4.8，app/MySQL digest 与失败轮一致，bundle SHA256 `60b2b96561693a3cd3bd5022ec734f7b068d0957c697f268d8982ad1fabb8fe6`，原 namespace/UID、远端目录和本地 scratch 清理齐全。释放 node1 两个 Pod 名额后，原配置成功启动，调度阻塞已解决。该轮明确 `migrations=not_run mfa_cases=not_run`，仅接收启动与清理；下一步执行下方完整 MFA 九项命令，保留新 transcript/source 清单。旧超时/exit 1 回执继续保留，不能改记为九项通过。

【现场根因已确认，zhanghui08 缩容释放两席】轻量诊断 `sbk-mig-261019071509-45f7` / UID `90ccbabf-e2f4-44f0-82aa-5d05e8764d9f` 返回 `Pending`、`PodScheduled=False / Unschedulable`，事件明确为 `1 Too many pods`，另一节点不满足固定 selector；MySQL 容器尚未启动。节点 Ready、压力 False，namespace 原 UID 及两端 scratch 清理完成，exit 1、SQL 未运行，镜像缓存假设不成立。操作者随后仅在 `clawmanager-zhanghui08-system` 将 `clawmanager-app` 与 `clawmanager-secret-broker` 各缩为 1，二者均 Running，无 HPA；新贴出的 node1 非终态清单共 108 行，上限 110，已释放两个名额。该 namespace 的大量旧 Redis `ContainerStatusUnknown/Completed/Error` 记录位于 k8s-master，不是 node1 本轮占用；仅可按实际终态 selector 清理，保留运行中的 Redis。当前可先重跑轻量启动诊断，再按成功结果继续实际九项；尚无 MySQL Ready 或九项通过的新回执。

【15:05 新轮停在 MySQL 启动，先轻量诊断】[14:46 同轮日志](evidence/a-download-mfa-mysql-remote-20261019-144659-99e40950.txt)及[来源清单](evidence/a-download-mfa-mysql-remote-source-20261019-144659-99e40950.json)显示本地门禁、独立 seed、Linux 探针/runner 通过，已进入远端；`sbk-mig-261019070055-0166` / UID `38486ce7-cbd4-4423-a6ca-39688b141626` 的 MySQL Ready 等待 240 秒超时，尚未迁移或执行 MFA 九项。namespace 原 UID、远端 scratch、本地缓存/源码都有准确清理记录，整轮 exit 1，不能计为实际 SQL 成功。操作者随后确认原 MySQL 在 k8s-master，测试固定 node1 且使用 `imagePullPolicy=Never`；node1 Ready，资源分配无明显不足。node1 上报镜像列表没有匹配，但直接登录 node1 的 `crictl images --digests` 确认 MySQL 镜像存在，摘要前缀与本轮一致，不能将根因认定为缓存缺失。

先执行[轻量 MySQL 启动诊断](../../scripts/system-backup-mysql-startup-diagnostic.ps1)：在本地 PowerShell 运行 `& .\scripts\system-backup-mysql-startup-diagnostic.ps1 -Remote`，沿用 SSH 交互密码。仅打包校验 98 份 shell/catalog/migration 源文件，不编译 Go、不安装依赖；复用原 Pod 的镜像、node1、Never、资源、Secret/初始化及 240 秒探针等待，Ready 后立即退出，不执行迁移或九项。超时先核对 namespace 原 UID 和 Pod run 标签，再按准确 Pod UID 打印状态、事件及节点条件，每次诊断 API 调用限制 10 秒；不读取 Secret、Pod YAML 或数据库日志，随后沿用原 UID 清理。两端临时目录独立清理，远端清理失败保留准确 `CLEANUP_PENDING` 并使整轮失败。原完整远测也已加入同一超时诊断。五组新增模拟检查与四组既有 shell/catalog 检查、MFA 派发检查及本地打包/清理均通过；实际远程诊断仍由操作者执行。先定位启动原因，再重测下方完整九项；轻量 `MYSQL_STARTUP_PASS` 不能替代实际 SQL 验收。

【最新本地门禁已通过，可重新执行下方命令】[最终独立回执](evidence/a-download-admission-final-preparation-review-20261019.json)固定 1,394 输入，security/evidence 两完整包 532 主/4,084 含子项通过、无跳过，MFA 与完整准入的两个 tagged seed 在包内及脱离 checkout 各 12 项通过；Linux 探针/迁移 runner、postcheck、最终 exit 0 及准确源码/缓存清理齐全。路径解析、未使用 import 及测试时钟/oracle 修订详见[A 复核](system-backup-a-download-owner-review-20261019.md)，生产期限规则未放宽。A 重点来源仍匹配，D 一份后续测试变化及新增输入排除；新远测仍先重验其自身冻结来源。没有安装依赖或执行实际 SQL。13:47 操作者新轮于 14:08 在本地失败，未进入 SSH/MySQL；旧“完整准备正在验证”及 r2 构建描述保留为历史，以本条为准。实际九项仍待新轮同轮证据，旧 nonce 八项/审计四项不重跑。

【13:30 新轮已定位，但未进入远测】[实际失败日志](evidence/a-download-mfa-mysql-remote-20261019-133053-78a4ed52.txt)在 manifest 路径检查处退出，`a_download_mfa_mysql_remote_exit=1`；没有源码清单、构建或 SSH/MySQL 结果，不能计为九项成功。A 已复现 Windows PowerShell 的当前位置与 .NET 进程目录不同会误解析相对路径，并修订入口按调用者的 PowerShell 位置解析；仍拒绝非文件系统、仓库外、嵌套目录和已有文件。两种 PowerShell 的 11 项路径检查与既有 MFA 派发检查通过，完整准备正在重新验证。原日志不能区分路径错位与文件名重复；入口现分别给出原因。另 [A 已修复下载 native HTTP 输出/空请求体边界](system-backup-a-download-output-deadline-review-20261019.md)，其本地接收不替代本九项 SQL 回执。

本地准备已限定接收；[58 项独立回执](evidence/a-download-mfa-mysql-preparation-review-20261019.json)固定 r2 的 1,374 输入，来源摘要 `40c5a657682fb5f68221922768938ce2e637f8be3fb9214355c6a8b0ee2f59ff`。security/evidence 两整包 3,846 项通过，含新增只读预览 18 项；tagged seed 在包内和脱离 checkout 的二进制各 8 项通过，Linux 探针及迁移 runner 已构建。默认 vet、冻结 postcheck、最终 exit 0、两个准确外层 source 目录独立缺席及内层构建清理记录齐全，未安装依赖、未连接远端。

[原始本地日志](evidence/a-download-mfa-mysql-local-20261019-r2.txt)、[冻结清单](evidence/a-download-mfa-mysql-source-20261019-r2.json)、[PS7 派发记录](evidence/a-download-mfa-mysql-transport-20261019.txt)及[WinPS 原生输出记录](evidence/a-download-mfa-mysql-transport-native-20261019.txt)均保留。首轮脱离仓库的 seed 因相对路径读取失败，原 exit 1 保留；现配置输入已嵌入，并共享同一可注入夹具工厂。r2 一次 Windows `compile.exe 0xc0000043` 及既有机制的同源重试记录保留，未关闭 vet，也未重试断言失败。

接收时 19 份重点来源中 17 份匹配；D 的环境准备及 SQL 模型两份并行变化排除，原输入另有下载运行/HTTP 等变化共 8 份排除，新增文件未据此接收。远测入口会重新冻结当前来源，并在 SSH 前运行本地整包、seed、独立二进制和 Linux 构建；当前树没有被本回执整体放行。

## 操作者命令

在项目所在 Windows PowerShell 中执行。新入口只派发这九项 MFA SQL 检查，旧 nonce 八项、审计四项和 config-proof/provider/writer 远测无需重跑。本地会重新验证两个受影响完整包。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$mfaRunStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$mfaRunSuffix = [guid]::NewGuid().ToString('N').Substring(0,8)
$mfaRemoteLog = Join-Path (Get-Location).Path "docs/evidence/a-download-mfa-mysql-remote-$mfaRunStamp-$mfaRunSuffix.txt"
$mfaRemoteSource = Join-Path (Get-Location).Path "docs/evidence/a-download-mfa-mysql-remote-source-$mfaRunStamp-$mfaRunSuffix.json"
$mfaRemoteExit = 1
Start-Transcript -LiteralPath $mfaRemoteLog -NoClobber | Out-Null
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -DownloadMFAOnly -Remote -BuildParallelism 2 `
        -SourceManifestPath $mfaRemoteSource
    $mfaRemoteExit = 0
} finally {
    Write-Host ("a_download_mfa_mysql_remote_exit=" + $mfaRemoteExit)
    Stop-Transcript | Out-Null
}
```

遇到构建前源码漂移或本地测试失败，入口会停止，SSH 不会开始。实际 SQL 失败不自动重试；保留同轮日志和来源清单供 A 核对。

## 九项实际 SQL 检查

由 `TestASensitiveDownloadMFAMySQL` 唯一测试根执行：

1. `http_issue_step_replay`：真实密码、AES-GCM、TOTP、JWT 和 Ed25519，经实际 HTTP handler 签发，使用 SQL 中的完整 Manifest 校验相同请求绑定；同一步再次请求拒绝。
2. `concurrent_step_once`：两个并发请求共享一个新 TOTP 步，只允许一份成功 proof。
3. `final_owner_revocation_rollback`：签名阶段在原事务注入 owner 可见性变化，最终重读拒绝，TOTP/审计及注入写入回滚。
4. `final_manifest_change_rollback`：在原事务替换实际 evidence checksum，原 Manifest 绑定不可被回调替换。
5. `audit_failure_rollback`：真实 MySQL trigger 拒绝成功审计，TOTP 步与事务写入回滚。
6. `unknown_actual_commit_no_proof`：实际 InnoDB COMMIT 后隐藏确认；不返回 proof，数据库证明步已消费且只记一次成功审计。
7. `late_actual_commit_no_proof`：实际 COMMIT 后等到原材料期限，不返回过期 proof，不刷新期限。
8. `original_material_expiry`：签名期间等待实际 SQL UTC 到达原期限，拒绝并回滚。
9. `observed_L0_wait_original_expiry`：通过 `performance_schema.data_lock_waits` 观察真实 installation 行锁等待；等原期限后放锁，拒绝签发。

所有成功或失败路径还核对 admission nonce、operation、receipt、容量预留及 evidence claim 均无新增下载副作用；原 owner 可见性/Manifest 在拒绝路径保持原值。

## 来源与验收范围

新增 `SQLRegistry.PreviewDownloadEvidence` 核对真实存储的 installation 绑定，复用完整 envelope/chunk 解码，使用必需的当前 owner 授权回调提供实际 deadline；在读取 chunks 前授权，预览不获取 evidence/chunk 的 L9 行锁。旧 registry 读取仍保留原行锁。候选 ownership 列缺失归为 not_ready，NULL/外安装行拒绝，不回填历史数据。

探针先核对准确 namespace/UID、server UUID、MySQL 8 严格模式、全局 FK 和父库 95 份实际迁移账本；每例只用父库 `SHOW CREATE` 克隆空 schema 到唯一 `amfa_...` 子库。FK 仅在空 schema 创建阶段关闭，开始测试前恢复并核对；随后应用固定的 canonical/ownership 候选 DDL。真实 SQL 行、时间、事务和约束不被模型替换。每例结束以 UUID 和准确库名守卫 DROP，并查询缺席；不复制业务数据。

owner 可见性、issuer/registry/nonce key 和容量来源仍是明确的合成测试输入；独立 HTTP handler 使用 TLS 请求上下文，未验证真实网络 TLS 或人员 MFA。九项检验签发 SQL 及同事务保护，真实 owner/hold/reference、真实材料、完整下载准入与已知提交后 provider/plaintext、正式 schema 和部署/E2E 继续保留。

接收新远测时需九个叶子与 root 全通过、九个子库清理、namespace 原 UID/两端临时目录清理、载荷 pin、冻结 postcheck 和最终 `a_download_mfa_mysql_remote_exit=0` 齐全。旧专项成功不能替代这些新结果。

本地构建的探针 SHA：`f0f5a5bd0eff8fa056894769bee40f5b3c898eada3e6882a94672a35156a6fb5`；输入 SHA：`01526eea6ba68a2484ad896c23bd619b4e6b6871dda158c4487ca80417de79f9`；迁移 runner SHA：`d2d4b3d45fcf2feb4321d8b52064613e4026b5a54781716cffb598707ac55551`。操作者新轮以其重新冻结构建的同轮 pin 为准。
