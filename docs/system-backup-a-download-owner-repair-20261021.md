# A：2026-10-21 owner SQL 失败修复与接收基线

【本次两处修订已完成本地准备】[owner 新回执](evidence/a-download-owners-inplace-fixture-accepted-20261021.json)确认 r2 同源重试三处 seed 各 13、Windows/Linux probe、迁移工具、默认 vet/最终来源复核/退出 0 和源码/外部缓存清理全部完成；r1 编译器失败保留。[角色新回执](evidence/a-download-gc-role-drift-fixture-accepted-20261021.json)确认 1146 夹具修订的三处 seed 各 9，以及两修订合并源码的 owner seed 包内/脱离各 13，全部跨平台/清理通过。没有安装依赖，实际十一项/十项仍需新轮。可用[完整重测脚本](evidence/a-download-owner-role-retest-20261021.ps1) `-Mode Both` 顺序执行，单项用 `Owners` / `Role`；任一原 gate、SQL 或接收失败即停止。

普通来源现保留九份固定基线：第八份五包 6,868 项与 D 73/A 36 项新贡献齐全；第九份组合 D 三份业务读取修订及其两完整包 2,346 项，owner 完整清单仍为 5,019 项。[接收器本轮同步](evidence/a-check-evidence-binding-receipt-readers-preparation-20261021.json)通过 owner 59、角色 43 项解析器及十五真实失败/未完成 CLI 拒绝，实际成功 SQL 回执零新增。原失败段和“运行中”描述按时间保留，以本段及新回执为准。

【13:43 新轮：真实 MySQL 十过一败】[独立失败核对](evidence/a-download-owners-inplace-failure-reviewed-20261021.json)确认 1,471 输入、本地两包 5,019 项与 seed 13 项通过后进入 MySQL 8.4.8；只有 `missing_reference_column` 失败，错误号 1846 出现在 rename 后的准备断言，尚未到生产 Preview。四任务正向、错误安装、撤权、原期限变化、未知列及两个实际锁等待用例均通过。原十一子库、namespace 原 UID、远端 scratch/本地缓存清理在日志齐全，准确源码目录独立缺席；整轮最终 exit 1，不接收为十一项通过。

本次修订仅改 tagged 夹具：准确 CHECK 移除后，rename 显式指定 `ALGORITHM=INPLACE`，再查询 information_schema，要求原列为 0、新列为 1、指向 evidence.id 的准确 FK 仍为 1，才进入 Preview。正式 schema、生产 owner policy、FK 检查和全部十一用例不变。MySQL 官方说明外键列重命名的算法限制，见[在线 DDL 操作](https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html)。新冻结 r1 首次/包内/脱离 seed 各 13 项及 Windows probe、默认 vet/普通来源复核通过，但 Linux 构建标准包 `net/http/httptest` 时 Windows `compile.exe 0xc0000043` 中断，最终 exit 1、准确源码和缓存已清理；无业务断言失败。r2 已用相同 1,473 输入及逻辑 SHA `262de9d8ede3f6522be7e4763e9768aa8a35c9738d476182dc1541dfa0095fee` 重试，使用独立外部缓存并在整体结束后清理；最多只对准确已知编译器失败再重试一次，不重试业务失败。本地验证不代替实际重测。

【最新结论：已可重新冻结完整十一项】[修订后完整普通基线独立回执](evidence/a-download-gc-producer-independent-accepted-20261021.json)完成 1,525 项核对，接收 D GC producer r5 的 1,457 输入、四包 754 主/6,242 项，原 6,167 项全部保留；owner 两包为 604 主/4,939 项。本次五个失败叶子/两个根均在新轮通过。五个 probe 阶段、Windows/Linux probe 与迁移 runner pin、默认 vet、普通/最终冻结复查、最终 exit 0 和六个准确自有目录独立缺席齐全；当前冻结输入逐项匹配。原普通修订与本次失败不再是待核状态，实际十一项 SQL 仍须新轮证明。

接收工具新增 SHA 固定的第三份完整基线，旧 nil/批次完整清单保留；[r4 验证](evidence/a-download-owners-actual-review-cli-checks-20261021-r4.json)通过 53 项解析器检查及五真实失败/未完成 CLI 拒绝，实际 SQL 接收文件零新增。可在原操作者 PowerShell 中用[下方完整命令](system-backup-a-download-sql-owner-mysql-handoff-20261019.md#操作者命令)生成新日志/来源重测，仍执行当前完整两包，不跳过 gate。本轮 A 没有安装依赖、重跑四包或产生测试/构建产物；下文按时间保留原始观察。

## 已完成的独立接收

[GC 批次独立回执](evidence/a-download-gc-batch-independent-accepted-20261021.json)完成 1,528 项原始证据核对：D r3 的 1,455 输入、四完整包 746 主/6,167 含子项、六个批次根/42 项、producer seed/脱离各 22 项、跨平台编译、默认 vet、来源 postcheck、最终退出 0 和四个自有目录缺席。A 没有重跑这四包或执行 SQL。r2 原中断继续保留最终退出 unknown。

与原 A nil 修复基线相比，旧两包的 4,822 项全部保留；新两包为 596 主/4,864 项，仅增加批次六根/42 项。原始 backend/contract 差异只有 collector worker 读取复用和两个批次文件。该接收固定历史来源；后续 D 的 `download_retention_gc.go` / `_test.go` 改动另待新回执，不能由本记录背书。

[owner 接收工具](evidence/a-download-owners-actual-review-20261020.mjs)按准确普通输入选择旧 nil 或新批次基线，两份完整清单与新 A 独立回执均固定 SHA。它仍核对准确十一叶子/root、两位置 seed 各 13 项、实际锁、catalog/payload、十一子库及原 UID/两端清理、来源 postcheck/default vet/最终退出 0。普通来源变化必须取得新的完整受审基线。

[工具 r3 验证](evidence/a-download-owners-actual-review-cli-checks-20261021-r3.json)通过 46 项解析器检查和四份真实日志的 CLI 拒绝，没有创建实际 SQL 接收文件。新增检查覆盖新旧完整清单互斥、新批次缺项及源码漂移。仅允许四个明确的一一对应 PowerShell 原生输出乱码名称（两个既有 scheduling 根的 ±1µs）；原日志字节不变，其他编码别名拒绝。

## 本次实际 SQL 失败

[失败独立核对](evidence/a-download-owners-mysql-failure-reviewed-20261021.json)保留 08:37 启动、09:23 结束的完整原轮：本地两完整包 4,864 项通过，MySQL 8.4.8 重放 95 文件后，十一叶子七过四败，实际 root FAIL、外层退出 1。十一隔离库及 namespace 原 UID/远端 scratch 清理由日志报告；本地 snapshot 独立确认缺席。失败轮没有最终源码 postcheck，不登记实际十一项通过。

| 失败用例 | 原因与修订 |
| --- | --- |
| wrong_installation | 原 UPDATE 先被安装外键以 1452 拒绝，未到 Preview。新夹具先用原配置列映射建立 foreign 配置快照及引用它的独立 installation-state 行，再改变证据绑定；保留配置与安装的全部 FK 检查。 |
| missing_reference_column | 原 rename 被引用 `evidence_id` 的 `chk_sb_dependency_evidence` 以 3959 拒绝。仅在该一次性负向子库，先移除这个准确 CHECK，再 rename；正式 migration 不变。 |
| original_owner_lock / empty_reference_range | 复用了外层 err，上一子例的 3959 在新子库中被再次检查，未到锁断言。err 改为每个子用例局部变量，原真实等待与释放后完成断言保留。 |

此外，原 root 在失败时仍写文字 PASS；现仅 `!t.Failed()` 时输出该标记。接收器始终要求真实 RUN/PASS 事件及整轮成功，不会把原文字 PASS 当成功。错误号解释参见 [MySQL 官方错误参考](https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html)。

## 修订验证与下一步

原本地冻结 `a-download-owners-fixture-repair-20261021-r1` 在补齐 foreign config FK 前启动，已按准确父子进程核对后停止，实际退出 -1，普通/最终冻结 postcheck 与 snapshot 清理完成；独立确认原目录缺席，不记为通过。仅复制了其按内容寻址的编译缓存到新的准确自有目录，没有复用测试结果或安装依赖。

最终修订冻结 `a-download-owners-fixture-repair-20261021-r2` 已完成。[32 项独立回执](evidence/a-download-owners-fixture-repair-accepted-20261021.json)核对 1,457 输入、首次 seed/包内 seed/脱离源码各 13 项、Windows/Linux probe、Linux migration runner、默认 vet、普通/最终冻结复查及最终退出 0；不重复已接收的普通四包。Linux probe SHA `9e667cddc2f17893a82eead8ef7f965809d831d9c4e4c716be6a668ddc6cf52c` 与 runner SHA `0f3dcf9ce6bfc2bd6ad826f8a28953cea6411d22e391e0c14e3eb27d29912510` 保留在原始日志，二进制已删除。

源码/二进制 snapshot 与调用者外部缓存已分别清理并独立确认缺席；原 r1 snapshot 也不存在。[调用者清理回执](evidence/a-download-owners-fixture-repair-20261021-r2-cleanup.json)保留 wrapper exit 0 与缓存缺席。没有安装依赖、执行 SSH/实际 SQL或启用部署。

本轮冻结包含 D 后续四份普通 GC/producer 变化，全部明确排除出本次 seed/编译功能接收。D 相同来源定向轮出现 `ReceiptFacts/null_version`、`no_version` 两个夹具失败并最终 exit 1；其原记录保留，后续修订的两份测试在本次接收时已漂移。不能用本次 tagged seed/编译成功宣称这些普通组件或当前工作树通过。接收新的普通基线仍需 D 修订后的完整包与独立复核。

下一次实际 SQL 沿用[原完整 owner 命令](system-backup-a-download-sql-owner-mysql-handoff-20261019.md#操作者命令)，使用新时间戳，并由入口重新冻结、执行当前两完整包后进入远端。若普通门禁失败，先修正并独立接收该来源，保持入口守卫。原十一项必须完整重测；旧 MFA 九项和准入/结果二十四项不重跑。

本机只读 SSH BatchMode 连接返回 `Permission denied (publickey,password)`，未修改服务器。远测需要操作者的现有交互登录会话；不在聊天或证据文件中收集密码、私钥或 DSN。

后续仍按[现场证据清单](system-backup-a-download-next-evidence-20261020.md)接受限角色十项、扩展任务权限/锁、原始材料、物理容量和 report/journal 运行卷；D 的 producer/GC task 专项单独验收。完整 GC policy、正式共享 schema/角色、本人 MFA/provider 和恢复矩阵 E2E 仍未完成。

已补[十二条准确 SQL 采集清单](evidence/a-download-gc-query-plan-20261021.json)：保留原八条 dependency 查询，新增批次四条原文与参数，不执行 SQL、不引入 DDL。实际计划/锁证据仍需现场采集。

## 10:06 新轮与普通门禁依赖

操作者 `a-download-owners-mysql-remote-20261021-100630-92ddbad0` 已于 10:31:51 结束。[完成轮独立核对](evidence/a-download-owners-local-failure-reviewed-20261021.json)固定原日志与 1,457 输入，来源 SHA `35c60b8d6eab12abee02d6949d6f9110c2952ef2c469895af533300ae4849390`：security 包通过，evidence 包 478.470 秒后五叶子/两根失败，外层 exit 1。尚未进入 seed、SSH 或实际十一项 SQL；没有最终来源 postcheck。原日志报告内层缓存清理，准确源码 owner `.tmp-d-index-cache-aad7419a27d0438582fef071ac5abed9` 独立确认缺席。没有重复启动或停止操作者原轮。

[A 对 D r2 失败的独立核对](evidence/a-download-gc-producer-r2-failure-reviewed-20261021.json)确认该轮与 D GC producer r2 的 backend/contract 来源逐路径/大小/字节相同；完整清单的差异仅为排列顺序，两份逻辑摘要分别重算有效。D r2 原定向门禁有五个失败叶子（两个无效 receipt version 夹具与三个 collector 组合场景）、两个失败根、包退出 1；普通/最终来源 postcheck 与自有 snapshot 清理通过，未进入 probe/实际 SQL。

两项版本负例在夹具解析阶段报告 `invalid character 'o'`，三个组合场景在写入前返回 `internal_error []`。D 当前文件已有后续修订，其结果需要新来源与完整包证明，不能覆盖原 r2 或操作者已冻结的来源。操作者该轮确已被这五项普通夹具失败阻断；保留原失败，在修复的新完整门禁和构建/清理复核通过后以新时间戳重新冻结重测，不跳过用例、放宽 hash/vet 或复用失败副本。早先 D r2 失败核对所记录的“操作者当时仍运行”是历史观察，由本完成轮回执补齐终态。
