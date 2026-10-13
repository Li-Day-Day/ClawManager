# A：Admin 真实只读授权适配

日期：2026-10-12。对应 D 的[真实只读查询边界](system-backup-d-live-read-query-boundary-20261012.md)。

正式 A 入口是 `systembackupsecurity.LoadSystemBackupReadAuthorizer(sessions, path, sha256)`。`sessions` 必须是 API 服务已启用的 `SQLLoginSessions`，与登录时登记 access token 的数据库身份、安装 ID 和 JWT key 相同；缺少会话登记无法构造授权器。`path` 是部署侧固定的绝对路径，`sha256` 是独立审核并固定的文件摘要。文件只含 `installation_id`、`config_version`、`rbac_registry_version`、`rbac_registry_sha256`、`registry_directory` 五项；严格拒绝缺项、额外项、重复键、错误摘要、跨安装及相对目录。配置轮换后旧 pin 与当前数据库不符时失败关闭，须审核并加载新文件。

D 对每个 GET 请求调用 `authorizer.Scope(request)`，得到独立的 `SystemBackupReadScope`，传给 `systembackupread.NewService` 或 `NewReader`；随后必须用 `scope.Context()` 调用读取方法（可派生超时 context）。原始或其他请求的 context 会被拒绝，请求取消后 scope 失效。Scope 只从真实 access token 得到 actor；安装和 RBAC pin 只从上述部署文件及会话登记器取得，查询参数、游标和请求正文不能改变它。非 GET、缺失/无效 access token 均拒绝。对象实现 D `systembackupread.ScopeProvider` 所需的 `AuthorizeRead` / `RecheckRead` 方法。

接线调用顺序（`backupSessions` 是现有 `backupSessionRecorder` 的非 nil 返回值）：

```go
authorizer, err := systembackupsecurity.LoadSystemBackupReadAuthorizer(backupSessions, readPinsPath, readPinsSHA256)
// 启动时加载失败：保持真实读端点 not_ready。
scope, err := authorizer.Scope(c.Request)
// 仅在 Scope 成功后创建读取服务；cursorKey 须有 D 独立受信来源。
service, err := systembackupread.NewService(sqlDB, scope, cursorKey)
result, err := service.ListTaskDTO(scope.Context(), kind, status, limit, cursor)
```

两次检查都在 D 的同一 `ReadCommitted` 查询事务中执行：核对数据库身份，按既有顺序锁安装行与当前配置，要求当前配置与部署 pin 一致；锁定当前用户及准确会话，检查有效期、撤权和凭据 hash；读取 hash 固定的 RBAC 文件并要求当前主体拥有 `system_backup.read`。返回的安装 ID 只来自部署 pin。D 在列表、详情或配置读取后调用 `RecheckRead`，继续持锁直到提交；授权、配置或会话任何一环缺失均失败关闭。

本地定向用例覆盖 D 读取器实际消费 A scope、viewer 成功、跨安装拒绝、页面读取后的会话撤权、用户停用、新事务撤权、配置 hash 漂移、RBAC 文件漂移、缺少 session recorder、错误 pin、跨安装部署文件、非 GET、缺失 token、错误 context 和请求结束后复用。当前工作区的 D 增量代码已在 `backend/cmd/server/system_backup_read_live.go` 用 `SYSTEM_BACKUP_READ_LIVE_ENABLED`、独立游标密钥和部署 pin 装配此授权器；未支持的真实读端点返回 `503 not_ready`。这段接线仍由 D 自行完成与验收，不能以 A 专项通过代替。D 的服务装配须拒绝未启用的会话登记或授权器加载失败；fixture 中间件不能作为生产权限来源。加载失败返回未就绪；`Scope` 的 `ErrSystemBackupReadAuthentication` 可映射 401，事务授权失败应失败关闭。当前 D Reader 用 `errors.Join(ErrDenied, 原因)` 保留可信 scope 错误，HTTP 层据此区分权限拒绝与数据库/配置不可用。D 负责 HTTP 错误映射、查询/DTO 与来源标记；D 的完整 066/067 任务行、分页、索引和详情仍需独立隔离 MySQL 验收，不由 A 授权专项代替。

## A 授权 MySQL 增量专项

`-AdminReadOnly` 是独立 profile，不重跑已通过的登录会话专项。现有 fresh migration 执行器先在隔离 MySQL 重放全部正式迁移；随后 `TestAAdminReadAuthorityMySQL` 在本轮随机数据库执行[专用最小授权表结构](../scripts/system-backup-a-admin-read-probe.sql)，验证 D 空页读取实际调用 A scope、当前会话行锁阻塞另一连接撤权、事务最终复查、提交后撤权成功及新事务拒绝。A 授权测试只证明读取授权与会话锁语义。同一远端 phase 现在还运行 `TestDAdminReadFullSchemaMySQL`：在 fresh migration 的完整 066/067/080 schema 上使用 SHA-256 固定的 enabled-controller fixture，校验真实任务行、稳定 cutoff 分页、跨安装游标拒绝、操作列表与会话撤权；两项测试的接收范围分别记录。

2026-10-12 本地执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -BuildParallelism 1`，退出 0：A/D 定向测试、默认 vet、MySQL seed、Linux 探针和迁移工具编译通过，报告 `CLEANED local-registration-build-cache=True`。第二轮运行在 Windows 标准库编译时遇到一次进程退出 `0xc0000043`，脚本按既定机制重试相同的测试与 vet 命令后通过。当轮探针 SHA-256 `8a67f9b8995b613cbd952524e8cad80f27ef59ecbd35b2c06c4a465d79687049`，专用 DDL SHA-256 `1a6abd1c8d01155184b8fa8c7cc8d6527201ed157cba1f80b4ccefc6218483f2`，迁移工具 SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。**真实 MySQL 尚未运行**；源码或脚本再改动时，以新运行指纹为准。

按现有约定，由操作者在代码冻结后从仓库根目录运行远程专项：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/a-admin-read-mysql-remote-20261012.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'A Admin read MySQL validation failed' }
  Write-Output 'A_ADMIN_READ_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

仅在日志包含当轮 fresh migration、`TestAAdminReadAuthorityMySQL` 与 `TestDAdminReadFullSchemaMySQL` 均通过、`PASS a-admin-read-mysql`、二进制/A DDL/enabled-controller fixture/迁移工具本地与远端摘要一致、run-owned 数据库和准确 UID namespace/远端 scratch/本地缓存全部 `CLEANED`、无 `CLEANUP_PENDING`，且最终有 `A_ADMIN_READ_REMOTE_EXIT=0` 时接收这一限定范围。任何清理或退出证据缺失都不记通过。远端 Bash phase 现增加 D 完整 schema 测试及固定 fixture，并在同一隔离 namespace 中执行；本机 Git Bash 因 Windows `Win32 error 5` 无法执行 `bash -n`，故远端 shell 语法仍由操作者运行时验证。

2026-10-13 补充错误分类：`CheckRegistrationSessionUntil` 把用户或会话行不存在归为权限拒绝，把 SQL 查询故障归为 `ErrProviderEvidenceStorage`；读 scope 不再抹掉该存储原因。D Reader 保留 scope 原因后，HTTP 可对真实存储故障返回 `503 not_ready`，撤权/缺席仍为 `403 permission_denied`。新增的读 scope 跨包用例覆盖两种 SQL 故障和缺席行。定向测试通过，随后 `-IncludeSecurity -BuildParallelism 1` 全量本地门禁退出 0：安全包、evidence 包、离线 MySQL seed、Linux 探针及迁移工具编译通过，`CLEANED local-registration-build-cache=True`。这一轮仍未运行真实 MySQL；已有 A Admin read 远端命令的二进制摘要须以其实际新运行输出为准。

2026-10-13 按当前 A/D 工作树重跑本地 `-AdminReadOnly -BuildParallelism 1`，退出 0：A scope、D Reader、server live-read 定向测试、MySQL seed 与 Linux tagged 探针/迁移工具编译通过，`CLEANED local-registration-build-cache=True`。测试二进制 SHA-256 `11a7a55ece089fb29f0ce40375f3ed3b299d78c62966c7e607ddb69343aeec70`，A 最小 DDL SHA-256 `1a6abd1c8d01155184b8fa8c7cc8d6527201ed157cba1f80b4ccefc6218483f2`，enabled-controller fixture SHA-256 `21f79e75a96622f8ecd01ec53ba57b4e6fa4625c007f8df317ea867ce35d313d`，迁移工具 SHA-256 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`。本地没有连接真实 MySQL；远端实际指纹须重新核对。

## 2026-10-13 操作者远端回执

[D 的用户回执摘录](evidence/system-backup-d-admin-read-mysql-user-receipt-20261013.md)记录同轮 94 文件 fresh migration、A 授权 MySQL 探针与 D 完整 schema MySQL 探针均通过，探针/DDL/迁移工具摘要与本地记录匹配，A 随机数据库、准确 UID namespace、远端 scratch 和本地缓存均报告清理。**功能测试的限定范围通过**。该摘录没有完整 transcript 或最终 `A_ADMIN_READ_REMOTE_EXIT=0`，所以不满足上文完整远端证据门禁；不重复运行已通过的功能套件来替代丢失的进程退出证据。真实 HTTP、索引执行计划和读写成本仍没有在该回执中验证。

随后出现的[D live HTTP 完整远端 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013.txt)是另一轮运行：A 授权探针及 D 完整 schema 探针再次 PASS，新增 HTTP 探针因跨安装测试行的配置快照外键不匹配而 FAIL，wrapper 未输出 `A_ADMIN_READ_REMOTE_EXIT=0`，但准确 namespace、scratch 和本地缓存均有清理标记。该失败属于 D HTTP fixture，不能据此否定 A 授权探针已通过的限定范围，也不能把本轮记为正式远端门禁通过。D 已在当前工作树修正两个安装的 fixture 配置摘要与字节数；修正后仍需新的操作者回执。

## 2026-10-13 第二轮完整远端验收

[修正后的操作者完整 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013-r2.txt)（SHA-256 `8034eca1a60105265bdca55f525752eae195c7fcf300f214841e7dc18caa6a1a`）在独立 namespace `sbk-mig-261013023630-18d2`、UID `6bfcde95-73e0-40f5-a0e4-c292cf4fe3fd` 上重放 94 个正式迁移。`TestAAdminReadAuthorityMySQL`、`TestDAdminReadFullSchemaMySQL` 和 `TestDAdminReadLiveHTTPMySQL` 均 PASS；后一项覆盖 live HTTP 的 200/400/401/403/503、安装隔离、撤权和来源标记。A 探针 SHA-256 `11a7a55ece089fb29f0ce40375f3ed3b299d78c62966c7e607ddb69343aeec70`，A DDL `1a6abd1c8d01155184b8fa8c7cc8d6527201ed157cba1f80b4ccefc6218483f2`，D HTTP 探针 `431a193058be60c466f8edbd3c15cb691eafc97ec571364f5004c501b9da6885`，迁移工具 `70a28fdd1e0773e06c609556b457ad1392fc91460a6fac7be61ea05b388bf15f`，与同轮本地构建输出一致。日志末尾有准确 namespace、远端 scratch、本地构建缓存清理，未见 `CLEANUP_PENDING`，并由 wrapper 输出 `A_ADMIN_READ_REMOTE_EXIT=0` 和 `D_ADMIN_READ_LIVE_HTTP_REMOTE_EXIT=0`，随后 transcript 正常结束。按上述判据，**A 正式读授权与 D 当前已实现的真实列表/operation HTTP 读路径在本专项限定范围内通过**。

这项验收不涵盖仍返回 `503 not_ready` 的总览、配置、四类完整详情、events/logs、manifest 等端点，也不代替候选索引的 `EXPLAIN`、写入成本、生产配置部署和浏览器验收。D 应只为已验证的 live 路径使用该 A scope；其余端点继续按未就绪处理。

## 2026-10-13 第三轮增量远端验收

[最新操作者完整 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013-r3.txt)（SHA-256 `8ae9df199b8117392c47b1f8a51200cbc7a8a95d21cbf1bd4669070e6b273ab6`）在新的独立 namespace `sbk-mig-261013040654-18e9`、UID `edd4b2cb-8f79-4ad4-832c-c0418e601170` 重放同一 94 个正式迁移。A 授权、D 完整 schema 及 D live HTTP MySQL 探针均 PASS；D 探针新增稳定分页续取场景，探针摘要为 `5f6c9068ee5f4ba90803be1a543a117ff31ff59cb18a23732bcd601a8ab2cf15`。A 探针、DDL 与迁移工具摘要保持上一轮相同。日志记录准确 namespace、远端 scratch、本地构建缓存清理，以及 `A_ADMIN_READ_REMOTE_EXIT=0`、`D_ADMIN_READ_LIVE_HTTP_REMOTE_EXIT=0`。本地曾有一次 Windows Go 工具 `0xc0000043` 构建失败，脚本用同一命令重试后通过；它不是远端探针失败。**A 正式读授权仍通过，D 已实现的列表续取和 operation 读路径增量通过。**适用范围仍以本页上一段为准。
