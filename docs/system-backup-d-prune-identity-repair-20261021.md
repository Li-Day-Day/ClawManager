# GC task 实测发现的 prune 身份约束修复

用户 `d-download-gc-task-remote-20261021-134319-dfd8756c` 轮已经进入 MySQL 8.4.8。18 项中 15 项通过，`prune_reference`、`empty_prune_range`、`late_prune_reference` 三项失败，整轮 exit 1。[原失败独立复核](evidence/d-prune-identity-operator-failure-20261021.json)绑定完整日志、1,471 来源摘要、实际子用例和清理记录。父根已失败时打印的内部 `PASS ... cases=18` 不构成接收，本轮候选仅补 `t.Failed()` 保护该日志，没有改变任何子用例预期或锁查询。

## 根因与迁移

070 的 `chk_sb_prune_item_identity` 对 `artifact_public_id` 使用 `8-4-4-12` 四段正则，少了倒数第二段。夹具和公开合同使用合法的 `sbk_` 加 `8-4-4-4-12` UUID，所以正常 prune item INSERT 被 CHECK 拒绝。错误号为 3819，空范围竞争写入明确报告该 constraint；另外两条相同 INSERT 在资格检查或最终重核前失败。这轮不能证明 prune 引用保护或空范围锁已通过。

修复使用追加迁移 `081_fix_system_backup_prune_item_identity.sql`，原 070 字节不变。单一 ALTER 替换同名 CHECK，只补 artifact UUID 缺少的一段；schema version、item public ID、installation、其余 CHECK 和 FK 全部保留。没有关闭约束、改短 ID 或跳过三项失败。

[MySQL 8.4 官方回归用例](https://github.com/mysql/mysql-server/blob/8.4/mysql-test/t/check_constraints.test#L523)包含在同一 ALTER 中 `DROP CHECK` 后重建同名 CHECK；[官方手册](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html)说明新增 enforced CHECK 不满足已有行时表不被修改。[InnoDB 原子 DDL](https://dev.mysql.com/doc/refman/8.4/en/atomic-ddl.html)是本次单语句替换的依据。这些资料支持实现选择，不能替代本安装实际迁移回执。

## 当前候选来源

正式 catalog 从 95 增至 96，摘要为 `0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`。controller pin、catalog 测试、draft registry、A 内嵌 registry fixture、MFA/producer 胶囊及其严格 pin 同步更新。注册表对象/policy、reviewer 和 freeze 状态没有扩大。

新 MFA 胶囊摘要为 `d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0`，producer 胶囊为 `2f7533093e5b1b38980f0c86bd65c632be8b6b515d4dbcf46d984e2032f060a8`。两套旧胶囊以准确原字节另存，旧 MFA 九项、四任务十二项、producer 十八项实际回执仍只证明各自历史冻结，不改成 96 份迁移的通过结果。C1 candidate DDL 和 typed records 没有因本修复加入正式迁移。

## 验证与实际复跑

最终隔离来源 1,475 输入摘要为 `6e76360a56b6153212875569be33341f7015e8f59bbd74b242a4003bb484ca2e`。合同、registry、十五表 fixture 与新增正反例共 94 项通过。

首轮六包来源 `4665a990...6ce49fe1` 共 919 主/6,332 项，migration catalog、业务、安全、证据、producer 五完整包通过，controller 仅两个旧指标测试失败：它们仍写死 25 个序列，当前合同已含 `evidence_download_admission`，实现输出 26 个。修正两份测试并增加该操作的明确零值断言后，controller 完整包 **143 主/191 项**通过。与首轮相比只改了这两份测试、一份被普通 Go 排除的 tagged 审计计数和 bundle 计数；生产 Go 未变，未重复运行五个已经通过且来源不受影响的包。六包覆盖的合计仍为 919/6,332，首轮整体 exit 1 原样保留，不改写为一次同轮成功。

另保留初期隔离输入漏带 Dockerfile、验证脚本引用不存在测试文件，以及首轮脱离源码参数传递错误的日志。补齐输入/修正参数与路径，没有降低测试预期。最终 tagged 与脱离源码 seed 各四根/29 项通过；Windows/Linux probe 和 Linux migration runner 编译通过，默认 vet、源码复核、PE/ELF64 x86_64 与二进制摘要检查通过。

[最终准备回执](evidence/d-prune-identity-preparation-20261021.json)已接收自有 17 文件发布及准确 source/cache/tmp/telemetry/二进制清理。发布上下文为 `5383dd6b...33a5f5b`，另有 A 两份 tagged 测试并发变化；[限定复核](evidence/d-prune-identity-concurrent-review-20261021.json)确认改动只在其他实际 MySQL 根用例、GC-role seed 和纯常量，GC task 所用根用例/共享 seed 未变，不覆盖或背书 A 的实际 SQL 结论。未验证的金额汇总草稿另存为明确不接收的源码草稿，其准确临时副本也已删除。

下一步由用户执行独立 `-DownloadGCTaskOnly`，应看到 fresh migration `001..081 applied=96` 以及新的二进制/胶囊 pin。运行完整 18 项，不能只挑三个叶子来替代资格/锁/回滚整体验证。不要手工删除 CHECK 或在生产库执行临时修补 SQL；历史安装的 ledger/schema 等价、capture gate 和升级授权继续按原流程。

```powershell
$gcTaskRun = ".\docs\evidence\d-download-gc-task-remote-$(Get-Date -Format yyyyMMdd-HHmmss)-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$gcTaskLog = "$gcTaskRun.txt"
$gcTaskSource = "$gcTaskRun-source.json"
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadGCTaskOnly -BuildParallelism 1 -SourceManifestPath $gcTaskSource -Remote *>&1 | Tee-Object -FilePath $gcTaskLog
$gcTaskExit = $LASTEXITCODE
"download_gc_task_exit=$gcTaskExit" | Tee-Object -FilePath $gcTaskLog -Append
Write-Host "日志=$gcTaskLog"
Write-Host "来源清单=$gcTaskSource"
```

本轮不安装依赖、不执行 SSH/服务器 SQL。真实修复后的 GC task、完整 GC、正式角色及原六项仍未验收。
