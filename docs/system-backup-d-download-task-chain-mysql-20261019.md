# D 四任务 owner 下载链实际 SQL 专项

【2026-10-20 实际十二项已独立接收】[原始回执复核](evidence/d-download-task-chain-actual-accepted-20261020.json)接收用户 10:07 轮固定来源 1,424 输入 SHA `29bea1a7cc6df2f81d289929e2ea8060561f6736f471508671ef6314c1ac1d60`：本地两完整包 553/4,309、四 seed/脱离各 19；实际 MySQL 8.4.8 十二叶子和一个 root 全部通过。已核对 probe/胶囊/runner、95 文件 catalog、原 namespace UID、十二个不同子库和 namespace/远端 scratch/本地缓存/固定副本清理、最终 postcheck/退出 0。两类引用锁均记录准确 holder/writer，并回滚竞争写。一次 Windows 编译器 `0xc0000043` 只重试同命令；四条 socket 提示对应的上传、主远测及清理 native 退出检查均通过，未掩盖失败。当前十份并发部署/容量来源差异单列；原冻结回执不验证新增 GC 或当前生产装配。该十二项不再待跑，以下“待操作者”段落保留为接收前记录。producer 十八项、GC、人员 MFA/现场 provider/物理容量/正式权限及原六项仍未完成。

【2026-10-20 新入口本地终态】[Windows journal 与冻结来源修正](system-backup-d-download-journal-windows-20261020.md)补 r61 五完整包 709/5,624 和 r62 冻结入口实际两包 553/4,309、四 seed/脱离各 19、跨平台 probe/runner、来源 postcheck/退出 0 及四目录清理。原 08:59 轮仅因 Windows 替换夹具在本地失败，实际十二项尚未执行。下方命令已改用 D 冻结入口，须保存新来源 manifest；并发 registration 主入口差异单列，不扩大原冻结回执。

【本地准备已接收，实际 SQL 待操作者】[独立复核](evidence/d-download-task-chain-packages-20261019-r53-review.json)确认 r53 四完整包 **693 主/5,532 含子项**、默认 vet、无失败/跳过；四个 tagged seed/脱离 checkout 各 **19 项**、Windows/Linux probe 和迁移 runner、冻结 postcheck/退出 0 全部通过。r53 原冻结 1,406 输入 SHA `8b7ad66a15d7384e3362fc6178220974ea528842a5d5cd0087a450ebe5bc5ac7`。其后 A 修正建行幂等键长度并补 owner 读取无写入断言，D 增加独立派发入口，native 脚本增加封闭的 tagged-only 检查；全部差异已精确反向恢复原文件 hash，生产输入未变。r54 对当前 **1,408 输入** SHA `6124e387ccc0ef2479cdb5bc8c356051378e3632a8d0ed2d3f642505aa4d2e6a` 重新编译并运行四个 seed/脱离 checkout 各 19 项、Windows 探针、冻结 postcheck/退出 0，接收时当前来源零漂移。两个准确自有源码/缓存/临时目录和所有测试二进制均已清理；没有安装依赖。r53 Linux hash 只代表原 tagged 夹具，下面命令会在 SSH 前重建当前 Linux 探针。

本专项承接[保留组持久读取](system-backup-d-download-retention-group-20261019.md)。已接收的 MFA 九项和准入/结果二十四项使用 synthetic owner；共享目录新增 A 的十一项具体四任务 owner 探针，D 复用其受约束建行 SQL，再补完整准入、提交后策略、HTTP 加密对象读取及独立结果事务。两份专项分别保留，不复跑旧二十四项，不把新探针编译当作实际 InnoDB 通过。

## 新十二项

实际根为 `TestDTaskOwnerDownloadChainMySQL`，每叶子使用原受 namespace UID、server UUID、95 文件 ledger 保护的不同空克隆子库；每个子库都须 guarded DROP 并确认不存在。

| 叶子 | 必须核对的实际行为 |
| --- | --- |
| backup_http_result | backup 原任务行及全部引用前缀，准入/私有收据/nonce/intent、提交后 SQL 授权、HTTP 明文和结果关联共同成立 |
| drill_http_result | 相同完整链，实际 drill owner 与针对该 owner 重新加密的对象 |
| preflight_http_result | 相同完整链，实际 preflight owner 与针对该 owner 重新加密的对象 |
| artifact_verify_http_result | 相同完整链，实际 artifact_verify owner 与针对该 owner 重新加密的对象 |
| backup_late_owner_rollback | intent INSERT 后实际触发器改变原 backup deadline；最终复查拒绝，任务 deadline/claim/预算/Operation/receipt/nonce/intent 全部回滚 |
| drill_late_owner_rollback | 同上，实际 drill deadline |
| preflight_late_owner_rollback | 同上，实际 preflight deadline |
| artifact_verify_late_owner_rollback | 同上，实际 artifact_verify deadline |
| revoked_result | 原准入后实际撤销 user，提交后 provider 检查拒绝，独立结果仍完成审计、关联及准确 claim 释放 |
| result_link_rollback | 结果关联 INSERT 的实际触发器拒绝，结果审计/关联/claim 释放及新增预算一起回滚，原准入不变 |
| existing_task_reference_lock | 另一个 preflight 的逻辑 verifier-report 引用实际存在；引用更新须等待原持锁事务，释放后写事务完成并回滚 |
| empty_event_reference_lock | 原 events 引用范围为空；插入新逻辑证据引用须等待，释放后写事务完成并回滚 |

两个等待案例都查询 `performance_schema.data_lock_waits/data_locks/threads`，核对准确数据库、表、持锁 connection ID 和竞争写 connection ID，不以 sleep/超时或别的连接的等待代替证据。所有失败路径先释放/取消并 drain 自有 goroutine，再由夹具清理子库。

完整链夹具在重新装配前实际 DROP 原 synthetic owner 表。四任务写入绑定当前 v2 的准确 canonical config bytes/hash/size 与实际 config FK；保留 v1 历史 HMAC 配置。每种 owner 单独生成 envelope/chunks，不直接改旧密文的 owner 标签。使用原 synthetic issuer 签名新的请求绑定，保留原 nonce/认证/过期时间，不追加人员 OTP 步骤或延长期限。

## 本地检查及范围

`TestDTaskOwnerDownloadChainMySQLSeed` 检查当前 config FK 建行输入、四任务各自的真实加密/解密 roundtrip，以及篡改原 owner 后拒绝解密。它可脱离 checkout/CWD 执行，不连 SQL。原胶囊和正式 95 文件 catalog 未改变，正式 schema/grants 未安装。

本地整包及探针原始终态见 [r53](evidence/d-download-task-chain-packages-20261019-r53-native.txt)，当前夹具独立复验见 [r54](evidence/d-download-task-chain-current-seed-20261019-r54-native.txt)，范围与源码差异以页首独立复核为准。新增派发检查已分别通过 PowerShell 7 和 Windows PowerShell；原 A owner、准入和 MFA 派发检查均通过。新 phase 的 `bash -n` 通过，未执行 phase、SSH 或远端 SQL。

## 操作者命令

本地准备已通过。从仓库根目录执行，并回传 `$chainLog` 对应的完整日志：

```powershell
$chainRun = ".\docs\evidence\d-download-task-chain-remote-$(Get-Date -Format yyyyMMdd-HHmmss)"
$chainLog = "$chainRun.txt"
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadTaskChainOnly -BuildParallelism 1 -SourceManifestPath "$chainRun-source.json" -Remote *>&1 | Tee-Object -FilePath $chainLog
$chainExit = $LASTEXITCODE
"download_task_chain_exit=$chainExit" | Tee-Object -FilePath $chainLog -Append
```

这里使用 D 的冻结包装入口；它先稳定复制来源并保存 manifest，再让本地测试、tagged/脱离 CWD seed、Linux binary、迁移 runner 和打包都从固定副本执行，最后复核并清理。原先直接调用 A 入口会读取正在变化的工作目录；10 月 20 日两次本地失败及修正见[Windows journal 与冻结入口交接](system-backup-d-download-journal-windows-20261020.md)。只有新的 D 十二项实际根会执行；原 A 十一项和已接收九项/二十四项不会自动混跑。用户明确要求远测命令由其执行，D 不自行发起远测。

回传该轮完整原始日志与来源 manifest 路径，保留失败轮。接收必须核对十二叶子/root、准确 binary/胶囊/runner、95 文件、原 namespace UID、十二个不同子库清理、两端清理、来源 postcheck 及最终 native/包装退出码；孤立 PASS 或编译通过不能替代。

## 尚未覆盖

这里的任务内容、issuer、物理容量报告、provider transport 和密钥服务仍为隔离测试输入。实际四任务 SQL 成功也不证明现场生产任务、真实 STS/KMS、最小权限、完整元数据可见性、独立物理审计卷或生产 main。producer C1 的四表投影、历史绑定、引用空区间和所有生产参与者锁序需要自己的新增专项；组 GC/墓碑、其他 owner 原始绑定和[原六项](system-backup-d-six-scope-readiness-20261015.md)继续未完成。
