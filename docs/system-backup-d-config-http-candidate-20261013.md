# D 配置真实读路候选交接（2026-10-13）

本轮将 `/api/v1/admin/system-backup-config`、`/versions`、`/versions/{version}` 接到现有 A `system_backup.read` 授权与 D 配置只读事务。所有成功响应来自准确 canonical 原文、hash/size、展开列及闭集字段共同校验后的 DTO，带 `X-System-Backup-Data-Source: live`。缺少候选列、旧行缺原文、授权或数据异常时失败关闭；总览仍未就绪，页面整体尚不能上线。

`ConfigBootstrapService.CanonicalSnapshot` 是显式候选写入开关。启用后 bootstrap 在原有配置/安装状态/操作收据/审计同一事务中写入准确 canonical 字节。默认路径仍使用现有 schema；候选列尚未编号进入正式 migration，开关不得用于真实安装。旧行回填仍要求原始受审材料与独立授权，隔离测试中复制同一已核对配置的字节不代表生产回填批准。

本地结果：`TestLiveBackupRead*` 定向源码测试通过；`TestBootstrapCanonicalCandidateWritesExactSnapshotAtomically` 通过；带 `systembackup_mysql` 标签的 server HTTP 探针编译通过（未运行 MySQL）。测试均使用离线模块模式，隔离 Go 构建缓存已清理。完整 server 包测试被本机缺少 `github.com/klauspost/compress@v1.18.0` 缓存阻断，没有安装依赖。Git Bash 在当前 Windows 环境返回 `E_ACCESSDENIED`，脚本语法需由远程运行实际验证。

## 操作者远程命令

首次远程运行从仓库根目录使用以下完整 PowerShell 命令，结果保留为失败轮 transcript。脚本仅在 UID 固定的临时 namespace 内重放正式迁移并运行未编号候选 DDL；它会核对上传二进制、DDL、迁移目录指纹，最后清理 run-owned 数据库、namespace、远端 scratch 和本地构建缓存。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-config-live-http-mysql-remote-20261013.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadConfigCandidate -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D config live HTTP MySQL validation failed' }
  Write-Output 'D_CONFIG_LIVE_HTTP_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

接收回执须在同一运行中看到 `TestDConfigCanonicalCandidateMySQL` 和 `TestDAdminReadConfigHTTPMySQL` 均 `--- PASS`，`PASS d-config-canonical-candidate-mysql`、`PASS d-config-live-http-mysql`、最终 `D_CONFIG_LIVE_HTTP_REMOTE_EXIT=0`，并核对准确 namespace UID、二进制/DDL 指纹、run-owned 数据库与所有清理标记。该专项通过后再评审正式追加迁移、同事务生产写入、旧行原文回填与总览权威来源；不能由此宣称实际安装已升级或页面已上线。

## 首次远程运行与修复

[首次完整 transcript](evidence/d-config-live-http-mysql-remote-20261013.txt)在 namespace `sbk-mig-261013071511-70df`、UID `69d9cf6c-6c82-4475-9cf2-8cc307209c6d` 中完成 94 文件准确迁移重放，随后在专项启动前退出 1；namespace、远端 scratch 和本地构建缓存均报告清理，没有任何 A/D MySQL 专项 PASS。静态核对发现候选模式的远程 phase 要求 `TestDAdminReadConfigHTTPMySQL`，但 PowerShell 的 Linux HTTP 探针打包文件列表遗漏了新增测试文件；`-test.list` 因此返回空，原脚本静默退出 1。现已在候选模式加入该源码文件，并为缺测试名增加明确错误。首次结果只证明迁移重放和清理，不计配置 HTTP 验收。

修复后的远程重测沿用相同隔离入口，使用下方命令保留 r2 transcript 和成功退出标记。

修复后本地 `-AdminReadOnly -AdminReadConfigCandidate -BuildParallelism 1` 退出 0：A 授权、D 读取及 Gin 定向测试、MySQL seed、Linux 两个探针和迁移工具均通过编译/本地门禁。新的 HTTP 探针 SHA-256 为 `295de0e0e8d0261194cd0ddd5447e6b06aa4b3d16042ec8d2089791a0fc59680`（失败轮为 `bb56ab29…e05353d73`），`CLEANED local-registration-build-cache=True`。该本地结果仍未运行真实 MySQL。

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-config-live-http-mysql-remote-20261013-r2.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadConfigCandidate -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D config live HTTP MySQL validation failed' }
  Write-Output 'D_CONFIG_LIVE_HTTP_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

## 修复后隔离 MySQL 回执

2026-10-13 16:09 收到并核对[r2 完整 transcript](evidence/d-config-live-http-mysql-remote-20261013-r2.txt)，文件 SHA-256 为 `a003e737d708568edc079bd2e92d8bfa86808bb87073cf0c6e50a86916f56f27`。MySQL 8.4.8 的临时 namespace `sbk-mig-261013080755-10e4`、UID `3f0200de-a8fd-4f0b-8463-3829f46f7798` 先准确重放 94 条 migration（catalog SHA-256 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`），随后同轮 `TestAAdminReadAuthorityMySQL`、`TestDAdminReadFullSchemaMySQL`、`TestDAdminReadLiveHTTPMySQL`、`TestDConfigCanonicalCandidateMySQL` 与 `TestDAdminReadConfigHTTPMySQL` 均 `--- PASS`。配置 HTTP 探针二进制 SHA-256 为 `295de0e0e8d0261194cd0ddd5447e6b06aa4b3d16042ec8d2089791a0fc59680`，候选 DDL SHA-256 为 `2a4ee20f3a7f9ed50f5f402165345ec8e4cfc1cdeaa25d8eda3464e1e0567fe9`，与本地编译/候选文件一致。回执末尾有 run-owned 数据库、相同 UID namespace、远端 scratch、本地构建缓存的清理标记和 `D_CONFIG_LIVE_HTTP_REMOTE_EXIT=0`。

**结论：配置 canonical 候选与配置 HTTP 的隔离 MySQL 专项通过。** 该轮使用未编号候选列和临时数据库，配置版本测试中的原文复制仅模拟已核对来源；它不批准正式 migration、旧行生产回填或启用 `CanonicalSnapshot` 生产开关，也不证明实际安装已升级、总览有权威读源或完整页面可上线。

## 下一专项：bootstrap canonical 同事务真实 MySQL

r2 的候选测试手动插入配置版本，尚未调用 `ConfigBootstrapService.Bootstrap` 的候选写入口。现于同一候选测试增加 `bootstrap_canonical_commit_and_receipt_rollback`：用隔离环境的 synthetic admission 创建全新安装，调用真实 bootstrap 事务，核对提交后的准确 canonical 字节、hash/size、配置/安装状态/操作收据及两条审计；再用仅针对另一测试安装的临时操作收据 trigger 注入后置失败，要求配置、状态、收据及审计全部回滚，最后删除 trigger。该专项不验证真实 Owner admission 或生产操作授权。

本地 `-AdminReadOnly -AdminReadConfigCandidate -BuildParallelism 1` 退出 0；A 授权、D 读取及 Gin 定向测试、MySQL seed、Linux 探针和迁移工具编译通过，本地未运行真实 MySQL。Windows vet 首轮遇 `0xc0000043`，脚本保留 vet 并重试相同编译命令后通过。新的 A/D 探针 SHA-256 为 `1294e9c066c8a5036d0b2b60beaabb943e218bfaba763629589a49ff70091a5d`；HTTP 探针仍为 `295de0e0e8d0261194cd0ddd5447e6b06aa4b3d16042ec8d2089791a0fc59680`，候选 DDL 仍为 `2a4ee20f3a7f9ed50f5f402165345ec8e4cfc1cdeaa25d8eda3464e1e0567fe9`。`CLEANED local-registration-build-cache=True` 已核对。远程运行使用以下完整命令：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-config-bootstrap-canonical-mysql-remote-20261013.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadConfigCandidate -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D config bootstrap canonical MySQL validation failed' }
  Write-Output 'D_CONFIG_BOOTSTRAP_CANONICAL_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

已核对[完整远程 transcript](evidence/d-config-bootstrap-canonical-mysql-remote-20261013.txt)，文件 SHA-256 为 `3211815fcaafb3645ad61f27dd030f0a19b8b96fd27b920ab3068465ca2eb8a8`。MySQL 8.4.8 的临时 namespace `sbk-mig-261013092726-1154`、UID `5214782a-fc6e-4daa-b682-9869450060e0` 完成 94 条准确 migration 重放；新增 `TestDConfigCanonicalCandidateMySQL/bootstrap_canonical_commit_and_receipt_rollback` 与同轮 A 授权、D full schema、任务 HTTP、配置 HTTP 探针均 `--- PASS`。`PASS d-config-bootstrap-canonical-mysql` 的二进制 SHA-256 与上述本地摘要一致，候选 DDL 摘要不变。run-owned 数据库、相同 UID namespace、远端 scratch 和本地构建缓存均报告清理，最终 `D_CONFIG_BOOTSTRAP_CANONICAL_REMOTE_EXIT=0`，没有 `CLEANUP_PENDING`。**bootstrap canonical 候选写入的限定范围真实 MySQL 提交与后置失败回滚专项通过。** 本轮 admission 仍为 synthetic，未批准正式 migration、生产开关或实际安装激活。
