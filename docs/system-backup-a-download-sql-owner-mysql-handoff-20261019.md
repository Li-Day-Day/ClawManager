# A：实际 SQL 任务 owner 增量

【本地准备已验证，可执行下面命令】[独立回执](evidence/a-download-sql-owner-preparation-review-20261019.json)核对两个普通完整包 543 主/4,229 含子项通过、默认 vet，以及修订后 1,408 输入的三个 seed/独立二进制各 13 项、Windows/Linux 探针和 Linux runner 构建、冻结 postcheck、最终 exit 0 与三个准确源码/缓存 owner 独立缺席。普通 Go/module/嵌入输入在两次冻结之间逐字节匹配，变化的 Go 文件均有 `systembackup_mysql` build tag；首轮过短的 drill 键夹具明确排除。并发 D TaskChain 源码仅随探针类型检查，不扩大为本专项或其功能验收。后续两份传输脚本变化单列，并以当前 WinPS 5.1 四组 profile 回归、Bash 语法及脚本 SHA 前后核对独立验证；不追记到旧 Go 构建来源。未安装依赖或执行远端 SQL，所有本轮测试/构建产物均已删除。

## 当前边界

MFA 九项与完整准入/结果二十四项已经分别接收，不重复远测。其 owner 使用合成适配器，不能证明实际任务表、引用目录、原期限和 InnoDB 空区间。

本增量直接使用 `SQLTaskDownloadOwners`，先在原有受守卫的独立子库内建立正式四类任务行，配置快照用真实 canonical bytes/大小/SHA 与原 config FK 绑定，再删除旧测试的 `synthetic_download_mfa_owner` 表。Preview、LockOwnerReferences 和 Recheck 均执行生产 SQL，不替换 owner policy。新任务行仅为隔离夹具，不是生产历史记录或新的生产授权；没有改写正式 migration、共享批准或线上数据。

## 十一项实际检查

1. `backup`：备份任务原 ID/安装/时间及引用范围。
2. `drill`：恢复演练任务原 ID/安装/时间及引用范围。
3. `preflight`：预检任务原 ID/安装/时间及引用范围。
4. `artifact_verify`：制品验证任务原 ID/安装/时间及引用范围。
5. `wrong_installation`：证据安装与当前范围不匹配时拒绝。
6. `revoked_actor`：真实用户撤权后 Preview 拒绝。
7. `changed_original_deadline`：同事务改动原任务期限后，不能用旧 Preview 获得 owner 锁授权。
8. `unknown_reference_column`：真实 information_schema 出现闭集外 evidence 引用列时拒绝。
9. `missing_reference_column`：正式所需引用列不可见/缺失时拒绝。
10. `original_owner_lock`：并发更新原任务行，必须在 performance_schema 观察真实锁等待，释放原事务后写入完成。
11. `empty_reference_range`：向原来为空的 dependency evidence 引用范围插入，必须观察真实 InnoDB 锁等待，不能只把 sleep/超时当证据；释放后插入完成。

每例使用独立 `amfa_` 子库，沿用原 server UUID、namespace UID、DROP/缺席和两端产物清理守卫。等待用例持有连接并在退出路径释放/等待 goroutine 完成，不遗留持锁事务。当前仍需操作者实际执行；本地 seed/编译不替代 MySQL 结论。

每例另外检查 owner 读取/锁没有产生 Operation、nonce、claim 或新 audit，不能把 owner reader 当作写授权。首轮本地准备冻结后，静态复核发现 drill 测试幂等键过短；已统一修为满足正式任务表 16..128 字符规则的键，并在 seed 增加检查。首轮旧来源不用于远测放行，待修订后的新冻结门禁。

## 操作者命令

入口只选择这十一项根，不运行旧九项/二十四项或其他已接收 SQL 专项；仍在 SSH 前完成新一轮冻结源码、完整包、三个 seed/独立二进制及 Linux 构建门禁。验收用新轮自己的 probe/input/runner SHA、十一叶子/root、十一独立子库和 namespace 原 UID 清理及最终 exit 0，不能用本地准备代替。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$ownerRun = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$ownerLog = Join-Path $PWD.Path "docs/evidence/a-download-owners-mysql-remote-$ownerRun.txt"
$ownerSource = Join-Path $PWD.Path "docs/evidence/a-download-owners-mysql-remote-source-$ownerRun.json"
$ownerExit = 1
Start-Transcript -LiteralPath $ownerLog -NoClobber | Out-Null
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -DownloadOwnersOnly -Remote -BuildParallelism 1 `
        -SourceManifestPath $ownerSource
    $ownerExit = 0
} finally {
    Write-Host "a_download_owners_mysql_remote_exit=$ownerExit"
    Write-Host "日志=$ownerLog"
    Stop-Transcript | Out-Null
}
```

## 尚未覆盖的生产工作

producer history 的原始持久绑定、其余 staging/promotion/prune/catalog owner 来源、实际受限运行 SQL 身份/grants、持久故障 sink、真实 provider/材料/物理容量、分组 GC/墓碑、正式 schema 交叉批准和生产 main/E2E 继续。不能以本新增十一项替代这些工作，也不能用当前 `now+TTL` 或 parent task 期限回填原 owner 事实。
