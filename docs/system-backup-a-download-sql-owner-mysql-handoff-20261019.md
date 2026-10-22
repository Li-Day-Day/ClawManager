# A：实际 SQL 任务 owner 增量

【最新来源及快速预检】[第十一份受审来源](evidence/a-owner-dependency-baseline-accepted-20261021.json)确认资源包三份改动不在两目标测试的真实 tagged 依赖中，原 owner 620 根/5,019 项完整清单不变；资源包四条原失败继续单列，不宣称整树通过。[67/48 项及十五真实 CLI 拒绝](evidence/a-owner-dependency-receipt-readers-preparation-20261021.json)已完成。完整重测脚本先核对当前普通输入是否属于固定受审来源；未知并行修改会在 Go/SSH 前停止，不跳过原完整门禁。当前来源预检通过，实际十一项/十项仍需新回执。

【当前 96 文件目录已同步】D 新增 081 修正迁移并保留旧 070；[A 独立普通基线](evidence/a-prune-identity-baseline-accepted-20261021.json)保留初轮 controller 两失败，结合完整 controller 143 根/191 项重测核对六包 919 根/6,332 项覆盖，owner 两完整包 620 根/5,019 项全部保留。第十份来源及回执固定 SHA。接收器现在从受审冻结清单推导完整目录摘要、数目和版本范围，当前为 96 文件/001..081，历史 95 文件回放不能冒充本轮。[同步验证](evidence/a-prune-identity-receipt-readers-preparation-20261021.json)通过 owner 65、角色 46 项解析器和十五真实 CLI 拒绝，没有实际 SQL 接收新增。下面入口会对当前 96 来源重新跑完整 Go/seed/构建门禁，再进入隔离 MySQL；A 早先 95 来源的夹具编译记录保留其冻结边界。

【13:43 新轮十过一败，1846 夹具准备完成】[完成轮独立核对](evidence/a-download-owners-inplace-failure-reviewed-20261021.json)确认两包 5,019 项、seed 13 项及真实 MySQL 已运行，只有 `missing_reference_column` 在准备 rename 时因 1846 失败；两个实际锁等待用例均已通过。十一库/原 UID/两端清理齐全，准确本地目录独立缺席，最终 exit 1。夹具现显式指定 `ALGORITHM=INPLACE` 并要求原列消失、新列与原 FK 可见。[新准备回执](evidence/a-download-owners-inplace-fixture-accepted-20261021.json)接收三处 seed 各 13、跨平台 probe/runner、默认 vet/最终复核/退出 0 及全部自有产物清理；原编译器失败轮保留。角色 1146 修订也已另行完成本地准备，可用[完整重测脚本](evidence/a-download-owner-role-retest-20261021.ps1) `-Mode Both` 依次重测；单独 owner 使用 `-Mode Owners`。原完整命令与所有 gate 保留，实际十一项仍须新回执。

【第八/第九份普通来源已接收】[任务检查 evidence 绑定](system-backup-a-task-check-evidence-binding-20261021.md)完成五包 796 根/6,868 项及跨平台/清理，原 6,759、D 新 73、A 新 36 项全部保留；第九份来源将 D 三份业务读取修订按其两完整包 2,346 项及准确源码逐项合并，owner inventory 仍为 620 根/5,019 项。九份来源及历史清单均固定 SHA，[接收器同步](evidence/a-check-evidence-binding-receipt-readers-preparation-20261021.json)通过 59/43 项解析器与十五真实 CLI 拒绝。本地普通来源接收不将原失败 SQL 改为成功。

【2026-10-21 第七份稳定冻结基线】[读取完成边界合并轮](evidence/a-read-completion-integration-accepted-20261021-r1.json)通过五包 783 根/6,759 项和跨平台探针/默认 vet/来源复核/退出 0/产物清理；owner 两包 620 根/5,019 项，原六份完整清单不变。[接收器 r8 验证](evidence/a-read-completion-integration-receipt-readers-preparation-20261021.json)采用新基线，owner 57、角色 43 项解析器和十一真实 CLI 拒绝。后续新 task_check_control 两份输入未接收，不能将新基线扩大为当前整树放行；实际十一项须新日志/来源并保留全部原门禁。

【2026-10-21 第六份冻结完整基线】[连接与日志合并验收](evidence/a-gc-connection-integration-accepted-20261021-r1.json)完成五包 6,591 项，owner 两包 617 根/5,012 项；原五份普通清单保持。[接收器 r7 同步](evidence/a-gc-connection-integration-receipt-readers-preparation-20261021.json)通过 owner 56、角色 43 项解析器与十一真实 CLI 拒绝，实际 SQL 回执零新增。先前三份 collector/测试漂移已纳入本冻结轮，但其后 HTTP 与读取路径并行改动仍另行待审；本记录不放行当前整树。下方完整命令与来源/门禁/清理守卫保持，实际十一项仍待新回执。

【2026-10-21 日志取消修订的第五份冻结基线】[新回执](evidence/a-journal-cancel-accepted-20261021-r1.json)接收 1,464 输入、四包 763 根/6,280 项和旧 6,270 全保留；冻结两包 613 根/4,977 项。[接收器 r6 同步验证](evidence/a-journal-cancel-receipt-readers-preparation-20261021.json)通过 owner 55、角色 43 项解析器及十一真实 CLI 拒绝。四份日志修订/测试保持受测字节，但冻结后三份 collector/测试并行变化明确未接收；它们仍需自己的完整受审基线，不能由本记录直接宣称当前源码已可放行。原完整命令和所有来源/SQL/清理守卫不变。

【2026-10-21 GC 持久日志增量后的新基线】[最终完整本地回执](evidence/a-gc-journal-accepted-20261021-r1.json)接收 1,459 输入、四包 759 根/6,270 项，新五根/28 项及原 6,242 项全部通过，构建/默认 vet/postcheck/退出 0 与三个自有目录清理完成。当前 owner 两包为 609 根/4,967 项；原三份基线保留。[接收工具 r5 同步记录](evidence/a-gc-journal-receipt-readers-preparation-20261021.json)通过 owner 54、角色 43 项解析器及十一真实 CLI 拒绝。下方完整远测命令保持不变；新本地源码不记为实际十一项通过。

【2026-10-21 修订后的完整基线已接收，可用新时间戳重跑】[A 独立复核](evidence/a-download-gc-producer-independent-accepted-20261021.json)完成 1,525 项核对：新 1,457 输入、完整四包 754 主/6,242 项、原 6,167 项全部保留，owner 两包 604 主/4,939 项；本次原五失败叶子及两根均通过。全部五个 probe 阶段、三二进制 pin、默认 vet、冻结 postcheck/最终 exit 0、源码与外部缓存等六目录缺席齐全。没有重跑四包或执行 SQL。接收工具保留三份完整历史基线，[r4 验证](evidence/a-download-owners-actual-review-cli-checks-20261021-r4.json)通过 53 项解析器检查和五真实失败/未完成 CLI 拒绝，实际十一项仍待新轮。

【2026-10-21 10:31 新轮在本地门禁失败】[完成轮独立回执](evidence/a-download-owners-local-failure-reviewed-20261021.json)确认 `100630-92ddbad0` 的 evidence 包五叶子/两根失败、最终 exit 1，未进入 SSH/SQL；失败来源与 D GC producer r2 相同。准确源码 owner 独立缺席，内层缓存清理已报告。修订后的新完整包、探针和清理仍需完整复核后再以新时间戳执行下方原入口；不能复用失败副本或跳过 gate。

【2026-10-21 实际 SQL 首轮七过四败，修订准备完成】[完整记录](system-backup-a-download-owner-repair-20261021.md)与[失败独立回执](evidence/a-download-owners-mysql-failure-reviewed-20261021.json)确认今天 08:37 轮完成当轮两包 4,864 项、真实迁移和十一叶子，四项因夹具安装 FK、CHECK rename 及跨子例遗留 err 失败，最终 exit 1；十一子库/原 UID/两端清理齐全，本地 snapshot 独立缺席。修订仅改 tagged 探针，保留生产规则；[新 32 项准备回执](evidence/a-download-owners-fixture-repair-accepted-20261021.json)核对 1,457 输入、三位置 seed 各 13、跨平台 probe/runner、默认 vet/postcheck/退出 0 及源码/缓存/二进制清理。D 四份普通变化不由此接收，实际十一项须新轮完整重测；旧 MFA 九项/准入结果二十四项不重跑。

【2026-10-21 接收工具新基线】[A GC 批次独立回执](evidence/a-download-gc-batch-independent-accepted-20261021.json)接收 D r3 原四包 746/6,167；旧两包 4,822 项完整保留，新两包 596/4,864。工具按普通输入选择新旧 SHA 固定基线，[r3 验证](evidence/a-download-owners-actual-review-cli-checks-20261021-r3.json)通过 46 项解析器检查及四真实失败/未完成日志的 CLI 拒绝，不生成实际 SQL 接收。仅接受四个准确 PowerShell 乱码别名并记入接收记录；后续普通源码变化仍要求新受审基线。

【2026-10-20 15:29 新远测尝试仅来源捕获失败】[原日志](evidence/a-download-owners-mysql-remote-20261020-152911-f87d0e35.txt)三次复制后校验均发现输入变化，15:32 以退出 1 结束，准确 owner `.tmp-d-index-cache-0cce70fa9ded4c3da010b4c1c87d4d9a` 已删除；未开始 Go 构建、SSH、迁移或十一项 SQL。现场核对到 D 的 GC 任务源码在 15:30:36、任务测试在 15:31:47 更新，与捕获窗口重叠；旧错误没有记录每轮变化的准确文件，不逐轮推断更多细节。来源守卫维持原完整前后校验和最多三次捕获，需在本轮编辑稳定后以新日志/清单重试，不能沿用失败的部分副本或把该轮记为数据库失败。

【2026-10-20 13:34 操作者轮失败，远端未开始】[原日志](evidence/a-download-owners-mysql-remote-20261020-133409-ebbf810b.txt)冻结 1,445 输入，来源 SHA `b23b2bce12b7735c991f87669d99fc3e5bd9b455912488dd3d955fa89f30a0ff`。本地 evidence 包已有 GC 正向断言失败，随后在 `TestSystemPublicationFinishFinalGuard/missing_version` 处达到 Go 默认十分钟包级超时；不能只延长超时便把原失败视为通过。原轮退出 1，源码 owner 与内层缓存已清理，实际十一项 SQL 没有执行。

后续 D r87 已修正测试 transport 将固定 metadata SQL 字符串内正则 `?` 误计为参数的问题，以及 GC 夹具 SQL 时间和准确到期相位；见[直接引用组件的限定记录](system-backup-d-download-gc-direct-references-20261020.md)。下载专项的完整两包门禁另显式设置 `-timeout=900s`，保持全部测试、`-count=1`、默认 vet 与断言失败不重试。

【2026-10-20 15:25 新完整本地入口已通过】[22 项独立回执](evidence/a-download-owners-local-repair-accepted-20261020.json)接收[新轮日志](evidence/a-download-owners-local-repair-20261020-144930-6819f05e.txt)与[1,445 输入来源](evidence/a-download-owners-local-repair-source-20261020-144930-6819f05e.json)，SHA `b9e29a7d5dc749665d391381ef349f7693d804abb7296b1ca05ee8932e763252`。security 完整包 255 主/2,011 含子项、evidence 完整包 324 主/2,612 含子项，共 4,623 项通过，无失败/跳过；原失败根及原超时的 publication 子用例均在本轮通过。三个 tagged seed 在包内和脱离源码的 Windows 二进制中各 13 项通过，Linux probe/迁移 runner、默认 vet、冻结来源 postcheck、最终 exit 0 与准确源码/缓存/二进制清理齐全。一次 Linux 构建中的 Windows `asm.exe 0xc0000043` 失败保留，只按既有规则用相同构建命令重试后通过，没有重试业务断言、安装依赖或执行远测。Go helper 21 项和 owner 派发检查另在 PowerShell 7/5.1 各自通过。

本轮只接收冻结来源。归档时 `download_retention_gc_task.go` 已由并行工作改变，明确排除，不能将本回执扩大为当前全部 GC 或整个工作树已通过；其后远测入口仍会重新冻结并运行完整门禁。现在可使用下方原完整命令、新日志和新来源文件名重跑十一项，MFA 九项与准入/结果二十四项不重复。13:34 原轮仍为失败，实际十一项 SQL 尚未接收。

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
$ErrorActionPreference = 'Stop'
$ownerRun = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$ownerLog = Join-Path $PWD.Path "docs/evidence/a-download-owners-mysql-remote-$ownerRun.txt"
$ownerSource = Join-Path $PWD.Path "docs/evidence/a-download-owners-mysql-remote-source-$ownerRun.json"
$ownerExit = 1
Start-Transcript -LiteralPath $ownerLog -NoClobber | Out-Null
try {
    & .\scripts\system-backup-d-config-writer-validation.ps1 `
        -DownloadOwnersOnly -Remote -BuildParallelism 1 `
        -SshTarget 'root@10.130.14.23' `
        -SourceManifestPath $ownerSource
    $ownerExit = 0
} finally {
    Write-Host "a_download_owners_mysql_remote_exit=$ownerExit"
    Write-Host "日志=$ownerLog"
    Write-Host "来源清单=$ownerSource"
    Stop-Transcript | Out-Null
}
```

## 尚未覆盖的生产工作

producer history 的原始持久绑定、其余 staging/promotion/prune/catalog owner 来源、实际受限运行 SQL 身份/grants、持久故障 sink、真实 provider/材料/物理容量、分组 GC/墓碑、正式 schema 交叉批准和生产 main/E2E 继续。不能以本新增十一项替代这些工作，也不能用当前 `now+TTL` 或 parent task 期限回填原 owner 事实。

## 新日志的独立接收工具

已补[离线接收工具](evidence/a-download-owners-actual-review-20261020.mjs)及[最新 r6 同步准备记录](evidence/a-journal-cancel-receipt-readers-preparation-20261021.json)。它只读日志、来源清单和当前文件，不执行 Go、SSH、SQL、安装、授权或清理动作。完整新轮结束后，可复用上面命令中的 `$ownerLog` / `$ownerSource`：

```powershell
node .\docs\evidence\a-download-owners-actual-review-20261020.mjs `
    --log ([IO.Path]::GetFileName($ownerLog)) `
    --source ([IO.Path]::GetFileName($ownerSource)) `
    --write
```

输入必须是 `docs/evidence` 内的文件基名。去掉 `--write` 只检查；通过后使用 `--write` 按本轮 namespace 独占创建 `a-download-owners-mysql-accepted-<namespace>.json`，已有回执不会覆盖。任何门禁失败均退出 1，不产生接收回执，也不输出 DSN 或原始异常。来源捕获失败而未生成清单的轮次仍须保留为失败，不能拿另一轮清单申请接收。

接收时核对完整两包的准确 RUN/PASS 清单、三 seed/脱离二进制各 13 项、本轮来源 digest、实际十一叶子/root、95 文件迁移和本地/远端 probe/input/runner pin。两个真实锁标记须出现在各自的正确用例内；每个叶子分别绑定一个准确子库清理记录，十一库不能重复。namespace 原 UID、两端产物、准确本地 snapshot 的独立缺席、最终 frozen postcheck/default vet、外层 exit 0 和 transcript 结束必须齐全。任何 skip/fail/panic/CLEANUP_PENDING 都不接受。

工具按普通来源匹配五份完整基线，分别为 [A nil 修复](system-backup-a-gc-nil-adapters-20261020.md)两包 590 主/4,822 项、[批次 r3](evidence/a-download-gc-batch-independent-accepted-20261021.json)两包 596 主/4,864 项、[GC producer r5](evidence/a-download-gc-producer-independent-accepted-20261021.json)两包 604 主/4,939 项、[GC journal r1](evidence/a-gc-journal-accepted-20261021-r1.json)两包 609 主/4,967 项和[取消修订 r1](evidence/a-journal-cancel-accepted-20261021-r1.json)两包 613 主/4,977 项；旧准确测试全部保留。来源清单、原始 JSONL 和新增 A 独立回执均固定 SHA。要求 backend/contract 普通输入与所选基线匹配。新增或改变的 `_mysql_test.go` 只有当前准确字节与 manifest 一致且确有 `systembackup_mysql` build tag 才允许。普通 Go/module/嵌入数据/contract 若再改变，工具会要求新的完整受审基线；不能通过减少预期测试数来兼容。当前源码漂移逐项记录，回执不声称当前整个工作树已验收。

[最新 53 项解析器验证](evidence/a-download-owners-actual-review-parser-checks-20261021-r4.json)新增三份基线选择、完整清单互斥、新组件缺项/普通输入漂移和本次 10:06 原失败拒绝。五份真实失败/未完成日志以 CLI 的 `--write` 检查均拒绝，实际接收文件零新增。正向样例仍仅为内存合成结构，没有实际 SQL；下段 37 项/r2 记录保留历史范围。

[37 项解析器验证](evidence/a-download-owners-actual-review-parser-checks-20261020-r2.json)包括内存中的 UTF-8/UTF-16LE 正向结构对照，以及缺失/重复用例、旧专项混入、错误 UID/摘要、缺锁证据/子库清理、未完成 transcript、普通输入漂移和伪 tagged 文件等反例。正向样例是内存合成数据，没有执行实际 SQL 或写实际接收回执。另以真实 13:34 失败、15:29 无冻结来源、15:25 本地准备成功三份记录调用 CLI（含 `--write`），均按准确原因拒绝；15:29 负例故意传入一份已有清单，确认不能掩盖日志缺少本轮来源。三次均未生成实际接收文件。基线更新后这些检查重新通过，原 r1 工具与验证记录保留其历史范围。实际十一项依然待操作者新轮。
