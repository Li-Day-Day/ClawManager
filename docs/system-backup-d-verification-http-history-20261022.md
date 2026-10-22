# D artifact-verification 历史详情 HTTP / MySQL 增量探针（2026-10-22）

【2026-10-22 用户 16:28 轮实际十六项已由 D 接收】[完整日志](evidence/d-verification-detail-remote-20261022-162855-be1f39f2.txt)、[同轮来源](evidence/d-verification-detail-remote-20261022-162855-be1f39f2-source.json)与[包装器原结果](evidence/d-verification-detail-remote-20261022-162855-be1f39f2-source.json.result.json)齐全。[独立接收回执](evidence/d-verification-http-actual-accepted-20261022.json)由[离线复核脚本](evidence/d-verification-http-actual-review-20261022.mjs)生成并通过 `--check`：MySQL 8.4.8，正式 catalog 96 份、`001..081` fresh replay，A 授权、D 完整 schema、D live HTTP 三个根测试通过，十六个 `verification_history_` 子项逐一 RUN/PASS，无失败或跳过，历史专项 marker 与两个远端 phase PASS 齐全，最终退出 0。覆盖当前 attempt/汇总、Job 进度、报告/check 关联与一致性、历史状态、no-store 和正文遮蔽；接收限真实 SQL 与现有 Gin/reader 路径上的合成记录。

HTTP 二进制 SHA256 为 `424cb5254fac38991d80bd6f25988e179ed3c29e0cba9261b9a14cd2e1788a0e`，SQL 二进制为 `d8879ff77c0f0e7d72d47362b1cec9b8ed1915c2357f95226dfe32b3a86e3061`，DDL 为 `1a6abd1c8d01155184b8fa8c7cc8d6527201ed157cba1f80b4ccefc6218483f2`。冻结来源摘要 `e83adbae3f4ce1a2f9bec43ab6e73ad9577be67ebb9c8aa1f174d9185b914b61` 已按清单重算，1,576 份清单内文件与本次接收时的当前字节相同；未验证清单外文件集合，不扩大为整棵当前工作树背书。

日志报告 namespace `sbk-mig-261022092505-02a0` / UID `b6d3c337-b7ac-4530-bb80-82315d98e55f`、远端 scratch 和本地构建缓存已清理；包装器报告准确外层 owner 的 1,577 份文件和构建产物已删除，`.tmp-d-index-cache-8c10a93553ba41bfbd0e41e2d206332f` 已独立确认不存在。未作独立远端清理复查。关闭 socket 提示未改变测试及包装器的成功结果。包装器原结果的 `actual_mysql_results_accepted=false` 保留，D 的接收结论另存独立回执；本次只离线核对与文档更新，未安装依赖、执行远端或生成构建产物。

此前失败及“十六项待实测”文字保留历史含义，现由这轮完整同来源结果接收。`actual_provider=no`、`production_approval=no`；B/C 生产适配器、preflight 当前 freshness、真实 provider 证明、完整恢复/GC、生产权限及原六项整体验收仍未完成。用户先前暂停的其余开发保持暂停，本次仅接收已回传结果。

【2026-10-22 用户 15:02 轮本地编译失败】[原日志](evidence/d-verification-detail-remote-20261022-150230-2e5ffbcd.txt)、[来源](evidence/d-verification-detail-remote-20261022-150230-2e5ffbcd-source.json)和[失败回执](evidence/d-verification-detail-remote-20261022-150230-2e5ffbcd-source.json.result.json)保留：安全 scope 与完整 read 包先通过，随后按文件运行 HTTP 测试时 `system_backup_read_live.go:38` 报 `undefined: loadBackupReadCursorKey`，child_exit=1、source_postcheck=false，未开始 SSH/MySQL。原冻结清单中已有 cursor-key 实现及测试文件，故根因是命令来源列表遗漏，并非应补一个降级实现。原 owner `.tmp-d-index-cache-f12bc486005a4203b148259e3f88a831` 的 1,569 份文件已按回执清理，本地另行确认准确目录不存在；原十六项实际 SQL 仍未执行。

检查时，共享工作树中的 A 验证脚本已经补入四份普通 HTTP 来源和六份 tagged HTTP 来源。本轮保留该并发更新，另外修正 event-api native 与 task-read container 两个同样遗漏 cursor-key 文件的入口。AST 独立解析确认三个普通入口的来源集合相同，均包含实现与 cursor-key 测试；tagged 列表还包含父 MySQL 测试及 `system_backup_read_verification_history_mysql_test.go`，避免父探针调用历史详情辅助函数时再次漏编译。生产 Go 文件不由本轮修改，不把历史探针改成跳过或模拟结果。

修复已通过同一个 verification-detail 包装器的完整离线门禁：[独立复核](evidence/d-verification-http-source-repair-20261022.json)、[日志](evidence/d-verification-http-source-repair-20261022-local.txt)、[冻结来源](evidence/d-verification-http-source-repair-20261022-source.json)及[包装器结果](evidence/d-verification-http-source-repair-20261022-source.json.result.json)已保留。并行上限 4、1,573 份冻结输入；安全 scope、完整 read 包、Windows 普通 HTTP/cursor-key 回归、admin-read seed、Linux SQL/HTTP 探针及迁移程序、default vet、冻结 postcheck 均通过，最终 `verification_detail_http_exit=0`。原失败轮与本轮两份 cursor-key Go 文件逐字节相同，进一步确认修复的是编译列表。事件 native/container 两个替代入口只做 AST 来源集合一致性核验，未运行这两个包装器或 Docker。

首次最终复核因主脚本字节漂移而拒绝，未把它记成 Go 门禁失败。并发版本只将 `ConfigDownloadOwnersOnly` 的普通包预算从 900 秒改为 2,700 秒，并改五行说明；本轮详情分支不使用该条件。用受控反向替换准确恢复被测脚本 58,053 字节、SHA256 `605517965f6675f177cd75184793a2fd69ad3cc33e3a6e3e4760504f0d2c7d70`，两版完整字节、摘要、注释原始生成来源和两版相同的 HTTP 来源数组均保留在独立回执。其余九份关键输入与冻结版本相同；不改原来源摘要，不把 owners 档位的新运行行为纳入本轮接收，也不声称当前整棵工作树均已测试。

本轮准确 owner `.tmp-d-index-cache-c7e3f89da856423c820bc7844220e905` 已独立确认不存在；A 子脚本先清理构建缓存，外层再清理剩余 1,574 份来源/marker 文件，探针与迁移程序均已删除。未安装依赖、执行 SSH/MySQL 或由本轮改变生产 Go。原失败记录不改写，修复后的新增十六项仍需按下方原命令生成新的来源/日志/结果文件并实际复跑。以下准备及较早 PowerShell 派发修复保留为历史记录。

【2026-10-22 包装器 PowerShell 派发已修复】用户 14:38 轮在冻结 1,566 份来源后因 Get-Command 返回多个 pwsh 路径而失败；child_exit=null，未进入 A 子验证或远端 SQL，本地 1,567 份文件已清理并独立确认准确 owner 缺席。[修复验收](evidence/d-verification-pwsh-dispatch-fix-20261022-1488fbe3-r2-accepted.json)把派发改为当前 PSHOME 下的单一路径。多路径发现环境中，原版三个派发反例准确失败、FreezeOnly 对照通过；修复版四项回归通过，验证真实 PowerShell 子进程的参数/工作目录、退出 37 传播、冻结后复核及清理。首轮最小夹具目录失败保留；这些子验证均为本地合成 observer，未执行真实 A profile/MySQL/SSH。旧包装器和冻结回执保留历史含义；请按历史详情专项原命令重新生成 detailRun/detailSource 后重跑，不复用已存在的来源文件。

准备阶段历史状态：本地准备、发布和清理完成时，新增十六项实际 MySQL 执行数为 0；现已由页首 16:28 轮完整结果接收。B/C 生产适配器由用户明确确认为“未交付”，preflight 等依赖当前权威事实的接线继续未就绪。

本轮发布两份探针文件：既有 `backend/cmd/server/system_backup_read_live_mysql_test.go` 加入受控调用，新增 `backend/cmd/server/system_backup_read_verification_history_mysql_test.go` 承载十六项场景；另提供 `scripts/system-backup-d-verification-detail-validation.ps1` 操作者入口。生产 Go、schema、迁移与批准状态未改。

本地验收以 [第二轮准备回执](evidence/d-verification-http-history-20261022-r2-34ab37c4-preparation.json) 和 [原生执行及清理](evidence/d-verification-http-history-20261022-r2-34ab37c4-native.json) 为准：

- 隔离副本及写回后，普通 server 全部七个主测试各有 22 条通过事件，无 fail/skip；保留 default vet。实际 MySQL 根测试通过准确 run regex 排除。
- Windows/Linux AMD64 tagged test binary 构建及格式/摘要核对通过；Windows 独立 list 准确列出 `TestDAdminReadLiveHTTPMySQL`。list 只证明测试被编入。
- 冻结 1,564 份来源，SHA256 `fa09063579968cba83fbc589caa8b7534b968a742d2f72b6237c25289b979605`。832 份实际 Go/嵌入依赖、项目包 Go 文件和资产及其文件集合在发布前后复核一致；这不等于当前整棵工作树都已测试。
- 第二轮准确 owner `.tmp-d-index-cache-34ab37c4f552442bb455cec61599efd0` 的 14,177 份自有文件已清理，并独立确认目录不存在；未安装依赖。

首轮普通回归和 Windows 编译通过，但未引用的 `-test.list` 被 PowerShell 解析成 `-test` 与 `.list`，独立清单退出 2，整轮未发布。[原失败回执](evidence/d-verification-http-history-20261022-9539e976-native.json) 保留，其准确 owner 的 14,038 份文件已清理并独立确认不存在。第二轮改为字符串参数数组，统一测试/编译参数复用本轮缓存，Go 并行上限为 4；执行前的一次生成脚本语法失败副本也保留，修正并通过解析后才启动本轮。

探针在父测试完成 UID/server marker、正式完整迁移夹具、真实 SQL session 和 pinned RBAC read scope 的检查后，构造独立合成 task/evidence/check/Job 行，调用现有 Gin 路由及 SQL reader。夹具使用正式 DDL，不关闭 CHECK/FK。静态 SQL 参数/列数审计仅作字面量对应检查，不证明实际 SQL 已运行。

| 子项（均带 verification_history_ 前缀） | 预期 HTTP | 检查目标 |
| --- | --- | --- |
| current_attempt_history | 200 | 最高 verify attempt 决定当前汇总，时间更晚的旧 failed check 不混入 |
| catalog_import_null_state | 200 | catalog import 保留本地 artifact_state 的 null |
| parallel_jobs | 200 | 当前多个 unit 的 generation 为 null，旧 Job 进度不混入 |
| single_job | 200 | 单一当前 Job 保留 generation 和业务进度 |
| heartbeat_only | 200 | 心跳、observed sequence 和旧检查不制造业务进度 |
| full_restore_false_to_true | 200 | full 的 false→true / restored_usable 历史观察 |
| shared_report_reference | 200 | 两种报告引用可合法指向同一 owner-bound evidence |
| expired_evidence_is_historical | 200 | 过期证据作为历史引用，不能据此声明当前可下载 |
| summary_drift | 503 | 持久化汇总计数漂移 |
| report_hash_drift | 503 | 报告摘要不匹配 |
| report_wrong_owner | 503 | 报告 owner 不匹配 |
| report_before_current_attempt | 503 | 报告创建时间早于当前 attempt |
| check_hash_drift | 503 | check 证据摘要不匹配 |
| check_missing_attempt | 503 | check 引用不存在的 attempt |
| health_cannot_restore | 503 | health 试图恢复 usable |
| noncommitted_cannot_be_usable | 503 | 非 committed 状态试图标为 usable |

所有项检查 no-store 和 PRIVATE 正文哨兵不泄露；503 检查 not_ready、无局部 task ID 和 live 标记。探针只验证保存的 before/after 历史观察，不能提供实际 C 同版本 provider 验证或当前可用性证明。主计划 12.3 的 preflight GET 要求当前源可用性/校验和、引用版本、目标 schema、capability expiry 与 evidence availability 的有界 freshness；不能把保存的 report_validity_reason=valid 当作当前事实。

操作者入口的语法、源码冻结、前后核对和三项提前拒绝（Remote+FreezeOnly、evidence 目录外路径、已存在 manifest）已由 [原限定验收](evidence/d-verification-http-history-20261022-9539e976-operator-wrapper-accepted.json) 接收。发布后的 [最终冻结限定回执](evidence/d-verification-http-history-20261022-r2-34ab37c4-operator-final-freeze-accepted.json) 再次确认两份探针和 832 份限定输入一致、1,564 份来源稳定，准确 owner `.tmp-d-index-cache-b25d96ef367047ebbc780a53434c12ff` 的 1,565 份文件已清理并独立确认不存在。这里只运行 FreezeOnly；新入口的 A 子调用、SSH 与实际 SQL 尚未执行。

最终冻结 SHA256 为 `ad34de02e47c582d55645dae51a35426b36cfa4d6ce8d9fe559b1d754182d662`，与主验证来源不同：六份 `system-backup-a-live-audit-mysql*` 脚本有并发修改，均不在上述 832 份 Go/资产范围。两套来源和 [六份差异及当前字节](evidence/d-verification-http-history-20261022-r2-34ab37c4-concurrent-a-audit-inputs.json) 单独留档，不覆盖、不接收这些并发脚本，也不把 server 回归扩大为整棵当前工作树的测试。

操作者在本仓库 PowerShell 运行新专项：

```powershell
$detailRun = Join-Path (Get-Location) ('docs\evidence\d-verification-detail-remote-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$detailLog = $detailRun + '.txt'
$detailSource = $detailRun + '-source.json'
& pwsh -NoProfile -File .\scripts\system-backup-d-verification-detail-validation.ps1 -BuildParallelism 4 -Remote -SourceManifestPath $detailSource *>&1 | Tee-Object -FilePath $detailLog
$detailExit = $LASTEXITCODE
"verification_detail_http_exit=$detailExit" | Tee-Object -FilePath $detailLog -Append
Write-Host "日志=$detailLog"
Write-Host "来源清单=$detailSource"
Write-Host "本轮结果=$($detailSource).result.json"
```

接收时须核对全部十六个 `verification_history_` 子项 PASS、`synthetic_cases=16` marker、父测试 PASS、最终退出 0、MySQL 版本/迁移 catalog、binary SHA、新来源清单、准确 namespace UID 及远端/本地清理。新入口的 result.json 不自动代表实际结果已经接收。旧成本与 GC 日志不能代替本专项。

B/C 生产适配器、完整详情当前事实、完整恢复/GC、生产权限和原六项整体验收继续未完成。
