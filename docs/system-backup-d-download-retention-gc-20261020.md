# D 下载保留组 metadata GC 候选

【2026-10-22 GC 连接所有者生命周期本地准备完成，42 项实际待跑】[八项实验及操作者命令](system-backup-d-gc-owner-lifecycle-20261022.md)已写回两份测试与两份派发文件，现有 freeze profile 保留原 34 项并加入提交/回滚/解锁回包丢失、取消及杀连接等八项。隔离及合入后 security/evidence 完整包各 627 主/5,065 条通过事件、default vet、seed/独立运行与跨平台构建通过；743 项输入及文件集合前后复核一致，报告依赖的并发版本差异另行归档。准确自有目录及 6,977 份产物已清理，未安装依赖或执行远端。原 34 项实测是旧来源的历史结果，当前新增八项与整个 42 项 profile 均待实际 MySQL；freeze adapter、批准角色、完整 GC 和原六项仍未完成。成本日志的源码匹配是原接收时点观察，后续报告测试改动不继承旧成本实测背书。

【2026-10-22 成本并发与四项汇总差异实际已接收】[实际结果及来源边界](system-backup-d-cost-snapshot-concurrent-accepted-20261022.md)核对 MySQL 8.4.8、五个成本子项通过、并发子项 0.10 秒、恢复父测试 8.56 秒和退出 0。独立写连接提交后原 RR 快照不变，新事务看到新摘要；金额/token/币种大小写/actual_cost NULL 差异均通过。001..081/96 份迁移及 UID 清理记录核对完成，账户/库/远端 scratch/缓存清理已报告；没有独立远端复查，也未记录准确本地 scratch ID。三份当前测试文件匹配准备版本，但 A 入口未保存同轮源码清单/前后摘要，原“逐包输入校验”表述已修正。本轮只接收合成实际 SQL 行为，真实 B dump、生产恢复写入授权、完整 large-smoke、完整 GC 和原六项继续待验收。下方“成本实际待跑”为此前记录。

【2026-10-22 GC 回滚不确定结果修复已接收】[缺陷、反例和事务结果约定](system-backup-d-gc-rollback-outcome-20261022.md)修复 Collect 忽略 Rollback 错误、批次误计拒绝并推进游标的问题；新增 rollback_unknown，停止并保留上一确认游标，优先于取消处理，提交尝试后不再声称回滚。隔离和合入后完整 evidence 包各 369 主/3,032 项、default vet、521 份输入范围与来源前后复核通过；两个反例分别准确击中四叶子。三份运行时代码与两份测试文件已合入，准确自有目录及 3,758 份文件已清理，未安装依赖或执行远端。此为事务结果传播修复，尚未接入 backup lock；物理解锁、批准角色、完整 GC 和原六项继续待验收。

【2026-10-22 freeze 实际 34/34 已接收】[实际验收与下一步](system-backup-d-download-gc-freeze-mysql-accepted-20261022.md)核对 MySQL 8.4.8、001..081/96 份迁移、34 项通过、25 份精确 backup-lock 等待记录和退出 0。1,519 份来源清单及六份准备文件匹配；namespace/远端 scratch/缓存清理已报告，准确本地 owner 已独立确认不存在。只接收合成前置实验：freeze_adapter 仍未接线，完整 GC、角色批准、人类 MFA、provider read、生产批准和原六项仍未完成。下方“实际 freeze 待跑”为此前状态。

【2026-10-22 成本并发快照探针本地准备完成】[同步边界、证据和实际运行命令](system-backup-d-cost-snapshot-concurrent-20261022.md)已发布三份测试文件，生产文件未改。隔离与合入后完整业务包各 88 主/396 项、default vet、tagged/独立 seed、Windows/Linux 探针及 Linux 迁移构建通过；208 份实际项目输入及嵌入文件集合前后复核一致。准确自有目录与 6,782 份文件已清理，未安装依赖或执行远端。首个 COUNT 后并发提交的实际 MySQL 行为仍待操作者运行完整 BusinessRestoreOnly 专项，不提供真实 B dump 认证或生产写入授权。

【2026-10-22 程序观察器的迟到结果保护已接收】[修复与关闭语义](system-backup-d-gc-observer-close-20261022.md)在连接归还后检查原有读取 context，关闭期间取消/到期不再释放观察摘要。有效旧代码对照在这两个叶子失败，候选及合入版本各自完整元数据包 13 主/281 项、default vet、来源复核和退出 0 均通过；首轮物理 Close 错误的夹具预期不成立，已修正并保留原失败。两份文件已合入，本轮准确自有目录与 1,207 份产物已清理，未安装依赖或执行远端。Conn.Close 的返回值仍不证明物理关闭/远端解锁；34 项实际 freeze、完整 GC policy 和原六项继续未完成。


【2026-10-22 freeze 前置探针准备完成，实际 MySQL 待跑】[34 项实验及运行命令](system-backup-d-download-gc-freeze-mysql-20261021.md)已发布；最终来源 1,513 份，security/evidence 完整包 620 主/5,019 项，新增 read 依赖完整包 93 主/815 项，tagged seed、独立运行、Windows/Linux 构建、default vet 与来源复核通过。本轮准确自有目录及 1,813 份产物已清理，未安装依赖或连接服务器。现有 Collect 已持有专属 Conn 至唯一提交并请求坏连接丢弃，但尚未获取 backup lock；同连接有界释放、真实清理结果、受审 BACKUP_ADMIN/全局锁序、完整 metadata policy 与十二组实际验收仍欠缺。新 34 项只证明合成前置行为，不能代替完整 Collect、生产权限或原六项验收。旧协议中 DB.BeginTx 的入口描述是当时快照，当前连接归属实现以上述现状为准。


【2026-10-21 collector 连接归属已实现并本地接收】新增私有 `downloadGCConnection`：Collect 借入一个专属 `sql.Conn`，在它上面建立原 RR 事务并核对原 server/database/SQL 时间；唯一 commit 仍在原 Collect。退出先结束事务，再通过 `Raw` 的 `driver.ErrBadConn` 路径丢弃会话，避免把该会话交给下一借用者。Collect 原文件仅替换取得事务及 defer 的入口块，原授权、组/期限/引用/容量守卫、删除顺序及未知提交错误保持；公共 `SQLRegistry.begin` 和 grants 检查未改。入口可以借用已有池会话，池独占、首次初始化及临时表残留仍需后续 freeze 协议评审。

[独立回执](evidence/d-gc-connection-preparation-20261021.json)接收 r2 同一 **1,465 输入** SHA `6f0defb38abda8dc553ff307e68131e2e17010c56a646dbf587bb4a34caab839`：定向五根/50（新增连接三根/34、publisher 两根/16）、security/evidence/read/producer/metadata 五完整包 **775 主/6,581 项**、合入后 GC/publisher **51 主/661 项**，默认 vet、无失败/跳过、前后来源复核与整体 exit 0。五个发布文件与已测字节一致；原 r1 完整包的一个 publisher 失败叶子及 exit 1 保留，最终只补该测试夹具，生产 publisher 未改。全部自有 source/cache/tmp/telemetry 和构建产物已按准确路径[清理](evidence/d-gc-connection-cleanup-20261021.json)，未安装依赖或执行远端。

发布输入另有并发审计改动：新增 `system_recovery_audit_journal_context_test.go`，修改 `download_failure_journal_test.go`、`download_failure_journal.go`、`system_recovery_audit_journal.go`。[发布上下文](evidence/d-gc-connection-published-context-20261021.json)记录 1,466 输入及差异；五包整轮结果仅覆盖上述冻结来源，不扩大到这些审计变化。合入后定向复验也不替代其完整回归。

连接测试覆盖初始化/身份/扫描失败、提交后连接仍专属、拒绝/回滚错误/取消/回调 panic、未知提交与 Close 报错后的池丢弃；真实 Collect 模型核对成功/拒绝/晚到变更/未知提交/写墓碑后异常，原组、墓碑和容量回滚保持。driver Close 报错的模型刻意保留“远端可能仍持锁”的状态，只证明该旧连接不再被池复用。当前没有 LOCK/UNLOCK INSTANCE、BACKUP_ADMIN 审批或实际 server 释放证据；有界真实清理结果、worker 准入与全局锁顺序、完整来源 policy、[十二类实际验证](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)和原六项继续未完成，不启用生产 GC。

【2026-10-21 freeze 候选接线的前置结论】[六项 Go 生命周期实验](evidence/d-gc-freeze-session-accepted-20261021.json)及当前源码检查确认，不能把 session-duration backup lock 直接放进现有 `DB.BeginTx`/仅 `Tx` 的 policy：提交后连接可能带锁归还池，旧 Tx 无法解锁，普通 Conn.Close/driver ResetSession 也不等于物理解锁。下一实现须先解决 collector 的专属连接、唯一事务、同连接提交后清理/失败丢弃及真实结果分类；新 BACKUP_ADMIN 与锁序评审不能跳过。[候选约束](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)列出十二类尚未执行的实际 MySQL 验证，未批准或启用 freeze。实验仅假驱动/标准库，默认 vet/源码 postcheck/清理通过，未安装依赖、执行远端或修改运行代码；原组/容量/期限/引用守卫与原六项范围不变。

【2026-10-21 v2 程序观察增量】已补视图完整 `SHOW CREATE VIEW` 摘要及 event `ORIGINATOR`，包括准确对象名引用、旧结果集关闭、单行/单结果集/字符集绑定、算法变化和累计数据预算对照。[本地回执](evidence/d-gc-view-create-preparation-20261021.json)登记隔离与合入后各 12 主/276 项、默认 vet、源码复核及准确产物清理，保留两个原失败，未安装依赖或执行远端。v1 的两处来源缺口在本地实现中已补；完整程序依赖、受审期望摘要、实际 MySQL/驱动包限制、观察贯穿提交的 DDL freeze 和原六项继续未完成。没有修改或启用 collector，历史四包仍只覆盖各自冻结来源。

【2026-10-21 程序观察组件局部进展】[独立程序元数据包的范围](system-backup-d-download-gc-early-references-20261020.md)已完成隔离与合入后各 9 主/243 项、默认 vet 和来源复核，[本地回执](evidence/d-gc-program-observer-preparation-20261021.json)保留准确字节及清理。它只观察 trigger/routine/parameter/event/view 的明确投影，不实现完整 `Early`/policy 或 DDL freeze；完整 CREATE/视图算法、event 复制来源、受限现场账号、实际 SQL 及观察至提交的一致性仍待交付。没有修改 collector 或自动接线，也不把历史四包结果扩大到当前 A 并发变化；原六项继续未完成。

【2026-10-21 完整来源闭包与 DDL freeze 审计】[可复核需求清单](evidence/d-download-gc-source-freeze-requirements-20261021.json)对正式 95 文件 catalog 和现有组件重新逐项核对：`system_backup_catalog_imports`、`system_backup_catalog_records`、`system_backup_catalog_scan_states` 仍未进入 schema inventory/正式 CREATE TABLE，不能补造列、owner 期限或把缺来源当作没有依赖。另列出五处正式 `catalog_import` 来源类型声明、11 条指向保留 evidence envelope 的 FK 声明；后者不是原下载 Operation/audit/nonce 的自动删除判据，须审清实际生命周期和关联，不能一律永久阻断或直接放行。

当前四类结构指纹只有 tables/columns/FK/index，不覆盖完整 trigger/routine/parameter/event/view 定义。新清单固定九条只读采集规格与八类待实际观察的要求，包括完整可见性/NULL 正文/参数和返回类型、跨库引用、准确 metadata lock、观察连接撤权/断开、隐式提交及整组回滚；初稿遗漏参数/视图的版本原样保留并明确被取代。它仅为静态审查，未执行任何 SQL、Go 构建、依赖安装或远端，也不批准角色、DDL freeze 或生产启用。`LOCK TABLES` 的授权不能当作已取得 freeze：该语句会先隐式提交当前事务，`START TRANSACTION` 又会释放已有显式表锁，不能插入现有一次 RR/单提交的 collector。[MySQL 官方事务交互说明](https://dev.mysql.com/doc/refman/8.4/en/lock-tables.html)。

同轮还[独立复核 A 的 10:06 轮共享门禁失败](evidence/d-download-owner-shared-gate-failure-20261021-100630.json)：五个失败叶子全部来自 D 的 typed-frame 负例和非整秒历史审计夹具，远端未启动、原 exit 1 保留；与已接收 r5 仅一个测试文件不同，所有失败用例已由同源完整回归覆盖通过。A 十一项实际 SQL 接收状态不因此改变；没有修改 A 回执或向其他对话发消息。

【2026-10-21 当前进展】[producer owner 十八项实际 SQL](evidence/d-download-producer-actual-accepted-20261021.json)已独立接收，下一远端验证为 GC task 独立十八项。新增 system producer GC 原始 manifest/创建时间/C1 receipt-run-history-reference 组件已由[本地独立回执](evidence/d-download-gc-producer-preparation-20261021.json)接收：八根/75 项、四完整包 **754/6,242**、默认 vet、无失败/跳过、producer seed/脱离各 22、Windows/Linux probe/runner、普通/最终 postcheck/退出 0；1,457 输入 SHA `727348b948844c09a40390957f760d7f310a3f8d970b3d84e85740adae71042d` 接收时集合/字节一致。[六个自有目录](evidence/d-download-gc-producer-cleanup-20261021.json)及构建产物清理，无依赖安装、远端或实际 SQL。用户 10:03 GC task 轮的两个负例构造错误及四轮本地诊断失败均保留，详见[用户失败复核](evidence/d-download-gc-task-local-failure-20261021-100302.json)；生产约束和门禁未放宽。此为必要组件的本地准备，完整 catalog/import/logical 依赖、GC 专用角色与完整结构可见性/DDL freeze、实际 collector 锁/物理容量/墓碑后续生命周期及原六项仍未验收。

【2026-10-21 批次扫描本地准备接收】[独立复核](evidence/d-download-gc-batch-preparation-20261020.json)接收 `CollectBatch` 的每页最多 128 候选、固定主键范围、候选 enum 前置、空范围 worker 核对、每组独立完整 `Collect`、拒绝统计、取消与未知提交停止。最终 1,455 输入 SHA `d9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542` 的定向六根/42 项，以及相同来源的四完整包 **746 主/6,167 含子项**通过，无失败/跳过、默认 vet；producer seed/脱离各 22、Windows/Linux probe、Linux runner、普通/最终源码 postcheck 和整体 exit 0 齐全。r2 原中断及未知退出不改写；[四个准确自有目录](evidence/d-download-gc-batch-cleanup-20261020.json)和构建产物已清理，当前输入集合/字节匹配，未安装依赖或执行远端。SQL transport/完整 policy/物理容量仍是模型，实际查询计划、InnoDB、受限角色、完整 GC 与原六项仍未验收；没有启用生产调度、路由或墓碑二次回收。

【2026-10-20 实际任务锁专项准备接收】新增 [GC task 十八项独立 MySQL 档位](system-backup-d-download-gc-task-eligibility-20261020.md)，覆盖四 owner、活动 sibling/prune/原期限、准确行锁/空范围、prune 父 FK 假阳性排除及迟到事实/失败副本/原行回滚；实际 SQL 尚为 0。[本地回执](evidence/d-download-gc-task-mysql-preparation-accepted-20261020.json)接收当前 1,449 输入、seed/脱离各 13、跨平台 probe/runner、默认 vet、两次来源 postcheck/退出 0、两种 PowerShell 各八组派发和 Bash 两正向/四拒绝；三个自有目录及构建产物清理，无依赖安装或远端执行。普通 Go/依赖/嵌入字节未变，复用原四包 737/6,114，不宣称新整轮四包执行。此档位只证明准备可用，完整 collector、受限角色、实际计划/锁/DDL freeze、物理容量及原六项仍未完成。

【2026-10-20 恢复推进：源 backup 的其他任务/prune 依赖】[任务资格增量](system-backup-d-download-gc-task-eligibility-20261020.md)补其他 drill/preflight/artifact_verify 的完整原事实、原期限、cleanup/inventory/retry/promotion/lease，保留 prune 引用保护，集合变化在新增 child 范围选择前拒绝。允许保留清理完成的过期终态 sibling，避免 metadata 组相互阻塞。新增八根/186，任务合计 14/303、全部 GC 32/494；最终当前来源单并发四完整包 **737/6,114**、producer seed/脱离各 22、跨平台 probe/runner、默认 vet、两次来源 postcheck/退出 0 通过。[独立复核](evidence/d-download-gc-dependencies-accepted-20261020.json)保留 r1 recorder 断言失败及用户 producer 15:21 冻结失败，后者仅修正成功夹具的模拟 SQL 时钟，生产五秒限制与原请求/claim/保留期限不变。1,446 输入接收时零漂移，六个自有目录及全部构建产物已清理，无依赖安装或远端执行。catalog/import、system 原绑定、完整 policy、实际 InnoDB/索引与锁序、专用权限/DDL freeze、物理容量、批次与墓碑二次回收仍缺，没有生产启用。下方“暂停”为此前历史轮次。

【r87 直接引用守卫收尾，按用户要求暂停】[必需 References 组件](system-backup-d-download-gc-direct-references-20261020.md)由 collector 固定执行已发布 Operation/audit/nonce/收据关联范围及闭合列/FK 校验；原组准确主键排除、迟到引用回滚、metadata 漂移和共享失败状态均有回归。全部 GC 24/308 加 A 独立对照 1/4、producer seed/脱离各 22、跨平台 probe/runner、默认 vet、两次 postcheck/退出 0 通过。[独立回执](evidence/d-download-gc-direct-20261020-r87-review.json)接收分轮测试集合 729/5,925，保留此前整体失败，未称为单次完整四包通过；1,445 输入接收时零漂移，十个自有目录及二进制已清理，无依赖安装或远端执行。完整 policy、其他逻辑/evidence/artifact 依赖、system 原绑定、实际 InnoDB/受限角色/DDL freeze、物理容量、批次与墓碑二次回收及原六项仍未完成。阶段 1/3/5/7 是候选调用位置，尚无全局锁序批准或生产启用。

【r78 任务资格组件本地接收】[具体四任务/local backup 资格](system-backup-d-download-gc-task-eligibility-20261020.md)新增原任务期限/终态、artifact/hold、收敛 inventory、过期 lease/state、保留 promotion/retry 与原事实复核。新六根/117、全部 GC 十八根/242；r77 四完整包 **722/5,855**及普通包 postcheck 通过，后续 Linux 编译的 Windows vet 异常和整体 exit 1 保留。r78 准确同源补齐三 seed/脱离各 22、Windows/Linux probe/runner、最终 postcheck/退出 0，未重复四包或关闭 vet。[独立回执](evidence/d-download-gc-task-20261020-r78-review.json)接收 1,442 输入、接收时零漂移和六自有目录清理。该组件不能单独实现完整 policy；其他 Operation/audit/nonce/evidence/FK/逻辑引用、artifact 的其他任务/导入依赖、system 原绑定、实际锁与角色/DDL freeze、物理容量、批次及墓碑二次回收仍缺，没有生产启用。

【r73 前置守卫增量接收】[L1 审计引用/当前直接授权与结构指纹](system-backup-d-download-gc-early-references-20261020.md)新增必需 `Early` 阶段和提示独立重读，补四个早期审计引用范围、当前账号/角色/grants、结构漂移/危险 FK 与晚写回滚。r72 定向十二根/125，r73 四完整包 **716/5,738**、producer 三 seed/脱离各 22、Windows/Linux probe、Linux runner、冻结 postcheck/退出 0 全通过，1,437 输入接收时零漂移；两个快照/一个缓存及七份暂存草稿均已清理，没有安装依赖或执行远端。该前置 phase 保留 A 的 config→receipt 次序，但完整跨 owner 锁序尚无实际并发证明；结构指纹不代替触发器/存储程序审查与 DDL freeze。实际 owner/artifact/ref/hold、受限账号/完整 schema 权限、物理材料及生产 GC 仍未完成。下方 r71 为该增量之前的原冻结范围。

【r71 最终本地接收】[独立复核](evidence/d-download-retention-gc-20261020-r71-review.json)接收 r70 security/evidence 两完整包 **561 主/4,383 含子项**，GC 七根/73 和原生 HTTP/1/HTTP/2 一根/5 均通过，默认 vet、无测试失败/跳过；普通包来源 postcheck 通过。r70 后续 Linux 编译器 `0xc0000043` 和整体 exit 1、缺最终 postcheck 保留。r71 使用完全相同的 **1,429 来源** SHA `8d772a3c0a6845433e765f52e7e0e39854d162cc1cb323574f06d9327755bdcf` 与自有缓存，完成小型 tagged-only 补证：producer 三 seed/22、tagged seed/22、脱离源码/22、Windows/Linux probe、Linux runner、最终 postcheck/退出 0。未重复完整包或关闭 vet。[清理回执](evidence/d-download-retention-gc-cleanup-20261020.json)确认九个准确快照和一个自有缓存共十目录均不存在；全部二进制已清理，未安装依赖或执行远端。接收时当前 1,429 输入集合及字节零漂移。r68 四包尝试仍为失败轮，不能改记成单次四包整轮成功；read/producer 的独立组件通过及三份 evidence 来源差异在复核中明确列出。

本轮在持久保留组读取之上增加 `SQLDownloadRetentionGC` 的单组事务：先建立 compact tombstone，再按 FK 顺序删除结果关联、nonce、准入收据、Operation 和两条审计，最后只提交一次。这里只回收下载元数据，保留已删除的 evidence envelope；不调用 provider，不删除证据对象或续原下载期限。

### system producer 原绑定组件（本地准备已接收）

`SQLDownloadGCProducerEligibility` 是外层 `DownloadRetentionGCPolicy.Lock` 的一个必要组件，不实现完整 policy、`Early`、默认装配或定时运行。调用方显式提供数据库身份、installation 和 evidence root，组件只接受 system/capability_snapshot 的 confidential/sensitive JSON 原始证据。它不请求当前用户会话，不重签 producer grant，不提交事务，不改写 C1 记录，也不触发 provider 删除。

collector 将原锁定准入 receipt 的 manifest SHA、原 evidence 创建时间和原行版本传给组件；创建时间在后续 deleted-envelope 锁定与最终复查中再次比较。不存在的 evidence owner_deadline 列不会被假造：组件比较原 C1 run/history 的写期限，两者必须一致且到期；receipt、history 和全部 reference 各自的保留/保护时间也必须到期。

读取沿用 C1 封闭 SQL 投影和 `DecodeStoredRecord`，逐行核对完整正文、展开列、scope/evidence、严格顺序与基数。先读一个非锁定 history 提示，锁 L3 receipt，再锁 L4 原 run/history，并独立比对提示；随后只重读已经持有的同一 L3 范围，最后锁 L5 reference。复查不读取新提示、不选择新 key，也不使用 RR 的旧一致性快照。run 只能 committed/superseded，receipt 的原 grant/run/epoch/input/observation/target/evidence 必须与 history/run 一致。四类 reference 均验证原始保护时间，缺表、非 InnoDB 基表、损坏/外域/乱序/重复/超量记录拒绝。receipt/run/history/reference 的唯一事实总量不超过 10,000，重复读取不累加同一事实，正文按行处理。

guard 绑定同一事务、完整 scope 与原事实摘要，晚到的新事实即使已过期或仍符合资格，也必须拒绝；失败和倒退时钟会使所有值副本永久失效。独立测试使用实际加密 capability 与 C1 存储编码；联动夹具先调用实际准入/结果服务，再进入原 collector，检查保留 C1 原行，以及写墓碑后 run 版本变化、删结果后过期 reference 插入时整组/墓碑/容量回滚。SQL transport、完整外层 policy 与容量仍为测试模型，尚不构成 InnoDB collector 验收。

该组件仅核对 C1 receipt 中原 immutable version 的合法性和一致性；deleted envelope 没有独立物理版本字段。reference key 与完整 bootstrap/catalog/import/logical 图的交叉保护仍需外层完整 policy；四个表的类型检查也不能替代完整列/索引/权限可见性与 DDL freeze。当前仍须完成真实索引/锁范围、跨参与者并发、专用账号、现场物理容量、生产接线和墓碑后续生命周期，不能据本组件启用生产 GC。

## 授权与删除条件

必须显式提供当前部署的 `DownloadRetentionGCPolicy`，没有默认放行实现。该策略须核对当前 GC 授权/撤权、完整 schema 与元数据可见性，并按 L3/L4/L5 锁住实际 owner、artifact、全部逻辑/FK 引用、hold 和 lease 范围，包括空范围。接口不是生产验收：当前尚无完整的实际部署适配器，已有只读 owner policy 不能自动承担 GC 授权。

collector 绑定独立 mTLS 证书、准确的 running `control_metadata_gc` Operation、claim、schema、row version、lease/deadline、数据库及安装身份。L0/L1 当前配置、L2 原审计 user FK、原 Operation/receipt/result、L5 nonce、L6 实测容量预留、L7 两份审计均在同一个事务复核。保留截止取原持久保留期限与准入时间加当前 control retention 的较大值，不能缩短旧保护。

目标 evidence 必须已经是 `deleted`，没有 provider locator、claim、inline payload 或 chunks，并且 row version 严格晚于原收据；到期及 protected_until 均须满足。collector 锁住并保留 envelope，避免把其他下载组共享同一 evidence 身份误当作必须同时删除的条件。实际策略仍须保护其他组对原 Operation/audit/nonce 的直接引用。

墓碑完整回读 23 个投影，保留原请求、公开摘要 hash、组明细 rolling hash、原时间及准确 GC batch；不写入私有正文、HMAC、proof 或 provider locator。standard 墓碑的到期日从 GC 时间加当前 retention 计算。每次 DELETE 前重新核对准确原行，防止前一次触发器悄悄改写后续审计或收据。所有写入及外部 guard/capacity 回调后，再独立复核 worker/config、保留 envelope、墓碑和六类原键缺失；Operation 同时检查原数字 ID、公开 ID 和原完整幂等键，拒绝后续触发器以新数字 ID 复活任一原唯一键。

任一检查或写入失败回滚整组。Commit 返回错误一律为 `ErrDownloadRetentionGCCommitUnknown`，不重试、不宣称成功，也不另行释放容量。专用授权不包含下载、签发 proof、provider 删除或墓碑二次到期删除。

## 本地证据与剩余工作

### 批次扫描候选（本地准备已接收）

10 月 20 日 r1 原型五根/34 项、producer seed/脱离各 22、Windows/Linux probe/runner、默认 vet 和最终 postcheck/退出 0 已通过；该原型尚无 enum 前置与空范围 worker 检查。最终 r2 为 1,455 输入 SHA `d9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542`，六根/42 项、默认 vet、unit postcheck、seed/22 和 Windows probe 编译通过，但在脱离源码阶段中断，没有最终 postcheck、整体退出码或原自动清理回执。10 月 21 日[独立中断核验与清理](evidence/d-download-gc-batch-r2-interruption-20261021.json)确认工具句柄丢失、匹配进程为空、原 1,455 文件逐字节未变，再删除准确标记的自有源码/二进制目录；原退出状态仍为 unknown，不改写成整轮成功。r3 已对完全相同来源完成四完整包 746/6,167 和完整 probe 收尾，整体 exit 0；六根/42 项准确名称与 r2 完全一致，[独立回执](evidence/d-download-gc-batch-preparation-20261020.json)及[四目录清理](evidence/d-download-gc-batch-cleanup-20261020.json)均已接收。没有重复定向轮来替代完整包，也没有把 r2 的中断说成正常结束。

`SQLDownloadRetentionGC.CollectBatch` 新增一个内部分页入口。`AfterID/ThroughID` 只限定本次数字主键范围；首个 ThroughID=0 时在固定 RR 快照内取当前最大候选 ID，后续页沿用该上界，不追逐新增尾部。候选查询绑定安装和 download Operation 候选类型，按 ID 递增，每页最多 128 项并多读一项判断后续页；不按状态/结果存在性隐藏坏组。正式迁移尚无该候选类型，扫描器先查实际 enum；缺少类型、元数据不可读或异常时明确拒绝，避免把未安装 proposal 误记为正常空批次。这个前置检查不等于完整 schema/grants 评审。重复/越界/无效 ID、查询/扫描/关闭失败均不进入 collector。LIMIT 只限制返回量和内存，实际扫描工作与索引计划仍须另取 MySQL 证据。

扫描事务只执行查询，在处理任何组之前关闭；即使空范围，也先核对准确 running worker 的身份、claim、版本、lease/deadline。该读取不加 worker 行锁，不改变原 `Collect` 的 L0/L1/L2/L3 前置锁序。每项重新调用原 `Collect`，保留独立 RR 事务、当前工作授权/撤权、完整 owner/reference/nonce/audit、原保留期限和实测容量检查。整页额外限制为最多 30 秒，并受调用方更早的 deadline 和原 peer 到期限制；不刷新 Operation claim、原请求、proof、容量或 retention。每项成功后统计 Collected，明确 ErrDenied 统计 Rejected；其他错误立即停止。未知提交单独标记并停止，不能计为成功或自动重试，须先核实该项结果。

统计只表示本页 Examined/Collected/Rejected。EndOfRange 仅为所选范围已扫描，不是完整 GC、所有候选合格或全库清空。Rejected 也不是永久消费；后续调度需显式开启新范围重新判断，尚未提供自动调度或持久 checkpoint。该入口仍要求完整的外部实际 policy、References、物理预留和专用工作证书；没有默认启用、HTTP 路由、provider 删除或墓碑二次回收。本轮只接收本地模型及构建准备，不据此接收实际 InnoDB、计划、权限或生产部署。

新增七个测试根覆盖完整单事务、十二类写入故障、worker/证书边界、23 项墓碑回读、最终 guard/迟到修改、未知提交不重试以及到期等值。测试执行真实 collector 与现有安全容量代码，但 SQL transport、owner/ref policy、物理容量和证书材料仍为模型输入，不能当成实际 InnoDB 或生产授权。

r63 定向七根/69 含子项通过；随后补 worker schema 与 typed-nil guard 后，r64 完整包中的 GC 七根/71 通过，但整轮因原 HTTP/2 成功对照的三秒夹具期限耗尽而失败。r65 的新断言错误地比较 SQL 墙钟截止与本地单调时钟截止，四叶子均失败；改为分别与封存凭据比较后，r66 两个成功对照和 HTTP/2 跨期通过，HTTP/1 的三秒反例仍在原生写之前耗尽。所有失败日志保留。最终夹具让成功对照保留原正常预算，故意跨期反例在准入前选定四秒，为独立五秒结果事务留出一秒；不改变生产期限、原生最终 flush 拒绝或完成结果/准确 claim 释放断言。最终完整包、来源和清理证据以随后独立复核回执为准；未执行远端、未安装依赖。

r67 原生 HTTP/1、HTTP/2 四场景及 root（1/5）通过。r68 对同一来源运行四完整包，security/read/producer 各自通过，evidence 仅 `TestSQLTaskDownloadRealPinnedAdmissionAndPostCommitPolicy` 失败：文件/registry 准备耗时后，原 synthetic capacity report 已老化，post-commit 检查在 7.83 秒时拒绝。修正仅在准入之前采样 synthetic SQL 时间、重新核对同一个已签名 proof，并写入此时的新 capacity observation；不改原签名/材料过期时间，不在准入后刷新报告或返回的截止。r68 exit 1 保留，probe 阶段没有运行。

r69 固定 1,429 来源 SHA `8d772a3c0a6845433e765f52e7e0e39854d162cc1cb323574f06d9327755bdcf`，GC 新唯一键复活反例合计七根/73，与上述 pinned-owner 根共八根/74 全通过，默认 vet、两次 postcheck/退出 0 和快照清理齐全。相对 r68 仅两份 GC 文件和该 owner 测试夹具变化。r70 同来源两完整包通过，后续探针因 Windows 编译器异常退出；r71 同来源补全构建及最终 postcheck，准确终态见页首，不把 r68 或 r70 的整体 exit 1 改为 0。

尚需：实际 owner/ref/hold/当前授权适配器、实际 InnoDB 的 FK/锁等待/触发器回滚验证、经评审的最小权限及元数据可见性、独立物理容量材料、批次入口的实际计划/规模/部署与持久进度统计，以及 standard 墓碑二次回收。原 user 硬删除会令现有审计 FK/严格组校验无法满足，需单独评审关联保留方案；不能退化成匿名审计。证据对象 GC 也须正确处理已过期的完成下载引用，才能进入此 collector 所要求的 deleted 状态。没有安装正式 schema/grants 或启用生产路由/调度，原六项保持未完成。
