# D producer 历史 owner 下载专项

【2026-10-21 后续 GC task 本地失败已修正】producer 十八项实际 SQL 的下方接收保持有效，不重跑。用户 10:03 轮 GC task 尚未到远端，唯一两个失败叶子来自 D 新增 C1 负例夹具的编码误用，见[失败独立复核](evidence/d-download-gc-task-local-failure-20261021-100302.json)。修正只涉及该轮源码中的一个测试文件；新 1,457 来源四完整包 754/6,242、默认 vet/无失败跳过、producer seed/脱离各 22、跨平台 probe/runner、最终 postcheck/退出 0 已由[本地回执](evidence/d-download-gc-producer-preparation-20261021.json)接收，六个自有目录及构建产物清理，无依赖安装或远端执行。下一步仍按 GC task 专项以新时间戳执行十八项实际 SQL，不把新本地 GC 组件准备扩大为生产验收。

【2026-10-21 当前结论：十八项实际 MySQL 已接收】[独立回执](evidence/d-download-producer-actual-accepted-20261021.json)与[可复核入口](evidence/d-download-producer-actual-review-20261021.mjs)核对用户 09:18 轮完整原始日志：MySQL 8.4.8、具体 `SQLDownloadOwners`、18 个叶子/一个 root 全通过，90.81 秒；run/history 行锁与 receipt/hold 空区间四组均有准确 holder/writer 连接记录。十八个不同 `amfa_` 子库逐案报告清理，95 文件正式 migration、binary `a3ef9e36...e337f`、v2 胶囊和 migration runner 双端 pin 一致。namespace `sbk-mig-261021015533-01f1` / UID `73689a41-d102-4274-b8a8-067a36ab3fe5`、远端 scratch、本地 build cache 均报告清理，本地 `.tmp-d-index-cache-547c3def54324c6e9fc8a913bd586f12` 另确认不存在；frozen postcheck、默认 vet、未安装依赖与最终 `download_producer_exit=0` 齐全。四条 SSH socket 警告原样保留，后续成功和清理证据完整，不需要据此重跑。

该轮冻结 1,455 输入 SHA `d9500684fb57a6cf658830a236f9f7e9ef8268e36aea3e156e50cb0c452f2542` 与已接收 batch r3 逐项相同；本地两个完整包 596 主/4,864 含子项、三 seed/22、脱离/22 亦核对全目录。当前三个既有文件变化与两个新 GC producer 文件单列，不由历史冻结背书。此接收仅覆盖独立 producer owner 专项，provider transport/issuer/容量仍为隔离输入，不证明生产启用、人员 MFA 或完整 GC。下一步为 [GC task 独立十八项](system-backup-d-download-gc-task-eligibility-20261020.md)，本专项和已接收四任务十二项不重跑。下方原失败、准备、重试命令与“尚待”说明均保留为历史，不覆盖此结论。

【2026-10-21 GC 批次兼容及当前普通门禁】[新批次本地回执](evidence/d-download-gc-batch-preparation-20261020.json)通过同一 1,455 输入的四完整包 **746/6,167**、默认 vet、producer seed/脱离各 22、跨平台 probe/runner、两次 postcheck/整体退出 0；四个自有目录和构建产物清理，接收时输入集合与字节匹配。新增页只组合原完整 GC 事务，worker 原锁定读取的查询不变；没有修改 producer 胶囊或正式 migration、安装依赖、连接服务器或接收 producer 实际十八项。r2 原中断和 unknown 退出另行保留，r3 完整同源通过独立接收。下面 producer 远测命令保持先检查实际调度容量，再以新时间戳运行；原四任务十二项不重跑，完整 GC/真实部署及原六项继续未完成。

【2026-10-20 16:25 轮已进入远端，阻塞在 Pod 数量上限】[失败复核回执](evidence/d-download-producer-scheduling-failure-20261020-162523.json)核对原 1,446 输入 SHA `04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df` 与 r4 逐项相同：本地两完整包 **587 主/4,811 含子项**、三 seed/22、脱离/22 与 probe/runner 编译通过。四个 `µs` 测试名在操作者控制台呈现为 `碌s`，仅按四个准确一一对应名称核对，原始字节不改写。远端 namespace `sbk-mig-261020085946-3817` / UID `bd6cf195-a269-4ff4-bef0-d7f02de7fad0` 已创建；MySQL Pending，PodScheduled=False/Unschedulable，调度事件为一个节点 Too many pods、另一个不匹配 affinity/selector。目标迁移及 producer 十八项均未开始，原 exit 1 与没有最终 frozen postcheck 的事实保留。原 UID namespace、远端 scratch、本地 cache 报告清理，原本地 source 目录另确认不存在；D 未重新连接服务器核实远端状态。

新增[只读容量诊断本地准备](evidence/d-node-pod-capacity-preparation-20261020.json)：Bash 八组及原启动五组共 13 项、PowerShell 5/7 各两组派发、两版本无远端参数的容量入口与原启动打包入口均通过，三个自有目录确认清理；没有安装依赖、运行 Go、连接服务器或写集群。操作者可从仓库根目录运行：

```powershell
& pwsh -NoProfile -File .\scripts\system-backup-mysql-startup-diagnostic.ps1 -NodeCapacityOnly -Remote
```

该档只读 node1 的 allocatable pods 与绑定 Pod 的 phase，按 Running/Pending/终态/未知计数；查询失败不会被记成零占用，不输出 Pod 名称或私密内容，也不生成 namespace/Pod、执行 SQL 或自动清理。输出明确 `scheduler_fit=not_verified`，不能据计数认定可调度。用户随后提供的列表中 node1 上限 110、Running 110，另有 57 条显示终态/错误的记录；其中 `clawmanager-zhanghui08-system` 的四个都是 Running，无可直接认定闲置对象。没有清理后的新快照，不能假定容量已恢复。先由操作者核实并停用不用的工作负载，再按本页新时间戳命令重试 producer；四任务十二项不重跑。以下各“当前来源”是对应历史回执接收时的范围，不把本次新增脚本算作已完成新整轮 Go 门禁。

【2026-10-20 新 GC 档位兼容复核】当前增加独立 `-DownloadGCTaskOnly`，与本 producer 档位互斥。两种 PowerShell 的原 producer 二进制/phase/三 seed/远端 argv 绑定及其他七组派发均已[复核](evidence/d-download-gc-task-mysql-preparation-accepted-20261020.json)；现有 producer Go、胶囊、正式 catalog 和普通测试输入字节未变。新 GC 的十八项只验证任务资格组件，尚无实际 SQL 回执；本页 producer 十八项仍保持先执行/接收，四任务十二项不重跑。下面 1,446 输入四包回执是原来源；当前 1,449 输入的新增 tagged 专项/档位另有自己的准备证据，不扩成新整轮四包执行。

【2026-10-20 15:21 用户再次失败已修正，单并发整轮复验通过】[独立复核回执](evidence/d-download-gc-dependencies-accepted-20261020.json)保留原日志 `evidence/d-download-producer-remote-20261020-152115.txt`：1,445 输入 SHA `b9e29a7d5dc749665d391381ef349f7693d804abb7296b1ca05ee8932e763252`，唯一失败为 `TestProducerDownloadActualAdmissionProviderAndRevokedResult`，对象 Stat 在 5.46 秒返回 permission_denied。599.731 秒是完整 evidence 包耗时，不能据此判断测试超时。远端十八项尚未开始，原 exit 1、本地 source/cache 清理记录保留。

修正只让该成功夹具在已知提交之后，按实际 SQL 时间查询推进模拟 SQL 时钟；准入前完成 provider 文件准备并重新核对同一个已签名 proof。新增明确等待六秒的成功对照，保留原 proof、请求、claim、材料/容量与保留期限，并检查它们没有刷新；生产五秒时钟偏差限制不变。定向一根/三项及新来源 `GOMAXPROCS=1/-p=1` 的单次完整四包 **737 主/6,114 含子项**全通过，无失败/跳过、默认 vet。producer 三 seed/22、脱离源码/22、Windows/Linux probe、Linux migration runner、普通/最终源码 postcheck 和整体 exit 0 齐全。新冻结 1,446 输入 SHA `04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df` 接收时集合/字节一致；相对用户旧轮只有 producer 测试、三份 GC 依赖来源与本地原生脚本的可选并发参数变化，正式 migration/catalog 和 producer 胶囊未变。[五快照和一个自有缓存](evidence/d-download-gc-dependencies-cleanup-20261020.json)及全部构建产物已清理，无依赖安装或远端执行。可按本页命令使用新时间戳重新运行；十八项实际 SQL 仍待该轮操作者回执，四任务十二项不重跑。

【2026-10-20 13:35 用户本地失败修正与完整复验】[独立回执](evidence/d-download-producer-local-failure-20261020-133524.json)核对原 1,445 输入 SHA `4c7d1c7664dc8c84498883f315b470310b7c979b8451c0560e1b54a7773309d6`、17 个失败叶子、原 exit 1、远端未开始与原目录清理。GC 的旧 SQL 模型把正则字面量中的两个问号当成参数；其修正、公开列类型对照和新鲜 GC 夹具已在 r87 中接收。本次另外修正任务授权表驱动测试提前采样时间的问题：在每个夹具准备好后生成时间，新增反向偏差并断言两种偏差都到达最终 SQL 时钟检查，不改变生产五秒限制。

新冻结 1,445 输入 SHA `b9e29a7d5dc749665d391381ef349f7693d804abb7296b1ca05ee8932e763252` 的定向 **26/350**、单次完整 security/evidence 两包 **579/4,623** 全通过，无失败/跳过、默认 vet；producer 三 seed/22、脱离源码/22、Windows/Linux probe 和 Linux migration runner、普通/最终 postcheck 与整体 exit 0 齐全。相对 r87 只有任务测试和已有并发 A 验证脚本变化；后者仅增加两包 `-timeout=900s` 及三行说明，反向恢复后字节摘要匹配旧版，本次原生门禁使用相同包预算，不延长请求/SQL/provider 期限。当前输入集合与字节匹配，[三个自有目录](evidence/d-download-producer-local-repair-cleanup-20261020.json)及全部构建产物已清理，没有安装依赖或执行远端。下方用户命令可以重新运行；十八项实际 SQL 仍须自己的操作者回执，旧失败不改写。

【r87 本地准备收尾，按用户要求暂停】[独立复核](evidence/d-download-gc-direct-20261020-r87-review.json)接收 1,445 输入 SHA `9b06627f12efd485430da3c44fa4b41724d071ed22b8aa1ac70f46f43dfdd878` 的当前 GC/独立 A 25/312，以及生产输入相同、未变测试和当前受影响测试组成的分轮四包集合 729/5,925；不称为单次完整四包或当前 evidence 整包通过，原失败保留。producer 三 seed/22、脱离源码/22、Windows/Linux probe/runner、默认 vet、普通/最终 postcheck/退出 0 均通过，v2 胶囊与正式 95 文件 catalog 未变，十个自有目录及全部二进制已清理，无依赖安装或实际 SQL/SSH。十八项实际回执仍待用户按下方命令执行后回传；本轮结束后暂停，原六项保持未完成。

【r78 当前本地准备】[独立复核](evidence/d-download-gc-task-20261020-r78-review.json)接收新增任务 GC 资格组件后的完整本地来源：1,442 输入 SHA `0ce20792189a9d2b75b8c70b20f51f78b2fda136b7288b3367c3e5d078826078`，四完整包 722/5,855、同源 producer 三 seed/脱离各 22、Windows/Linux probe/runner、最终 postcheck/退出 0，六自有目录清理，未安装依赖。r77 后续 Linux vet 异常保留为整体失败，r78 只补准确同源构建，不重复四包。v2 胶囊和正式 95 文件 catalog 不变；本轮未执行实际 SQL，producer 十八项仍待下方用户命令的同轮实际回执。

【r73 当前本地增量准备】[GC 前置守卫完整回归](evidence/d-download-gc-early-20261020-r73-review.json)对当前 1,437 输入 SHA `8bab0c41906a653a7e243e5dbdfdd71e5f9048ef9b26bd51543997acbf9dc5dc` 通过四完整包 716/5,738、准确 producer 三 seed/22 和脱离源码/22、Windows/Linux probe、Linux runner、冻结 postcheck/退出 0，接收时当前零漂移；三自有目录和七份暂存草稿已清理，没有安装依赖或执行远端。原 v2 胶囊及正式 95 文件 catalog 未改变，下面用户命令仍适用。它不把 GC 模型授权变成实际 GC 证明，也不把本地 seed 记为 producer 实际十八项成功；A 并发 registration/部署脚本仍需自身验证。

【2026-10-20 10:41 轮本地失败已修正，远端未开始】用户新日志 `d-download-producer-remote-20261020-104149.txt` 的来源为 1,429 输入 SHA `23d31811cc484e61ea3ccbb61f7f9305f17cbae8f9645ad25aec59f65fa09544`，与 D r64 完全一致。唯一失败叶子为 `TestADownloadNativeBufferedOutputKeepsOriginalDeadline/http2/before_deadline`，旧三秒成功对照在忙碌主机上耗尽，原 HTTP/2 流被 deadline 中止；不是 producer 十八项实际 SQL 失败。原日志与 exit 1 保留，准确固定副本已清理。修正后的本地门禁已由下面 r70/r71 独立复核接收，可重新运行本页命令；不重跑已接收的四任务十二项。

[本地失败独立复核](evidence/d-download-producer-local-failure-20261020-104149.json)核对完整原始字节、来源 ordered digest 与 r64 文件逐项相同、唯一失败叶子、远端未启动、最终 exit 1 和准确 owner 缺席。[修正后接收](evidence/d-download-retention-gc-20261020-r71-review.json)确认 r70 同一新来源的 security/evidence 两完整包 **561/4,383**，默认 vet、无失败/跳过，普通包 postcheck 通过。r70 Linux 编译器异常及整体 exit 1 保留；r71 使用同一 **1,429 来源** SHA `8d772a3c0a6845433e765f52e7e0e39854d162cc1cb323574f06d9327755bdcf`、同一自有缓存补全 producer 三 seed/22、tagged seed/22、脱离源码/22、Windows/Linux probe、Linux runner、最终 postcheck/退出 0。当前来源零漂移与十个准确目录清理均确认，未安装依赖、未执行远端。它是十八项远测的本地准备，不登记实际十八项成功。

【2026-10-20 共用本地门禁修正】[新交接与冻结入口](system-backup-d-download-journal-windows-20261020.md)保留 09:08 轮因 D 移走 GC 草稿而发生的本地编译竞态，该轮没有启动远端。r61 原冻结五完整包 709/5,624 含新增 journal/application；r62 实际验证新的四任务冻结入口，Go/SQL/两种胶囊仍与 r61 一致。producer 的新 profile 已分别通过 PowerShell 5/7 的冻结派发/互斥检查，其独立十八项和 v2 胶囊准备范围仍以本页原 r59 为准；没有把四任务 seed 冒充 producer 三 seed/22 项。本轮四个自有目录已清理；registration 主入口三份当前差异不由冻结背书。下面 producer 命令会重新冻结并执行自己的完整本地门禁后，再由用户进入远测。

【r59 原冻结本地准备接收】[独立回执](evidence/d-download-producer-packages-20261020-r59-review.json)接收五完整包 **700 主/5,569 含子项**、默认 vet、无失败/跳过，三根 seed/脱离源码目录各 **22 项**，Windows/Linux probe、Linux runner、普通包后和最终来源 postcheck/退出 0。原冻结为 1,415 输入，SHA `c2bef333a0894fb0806070a70b47d276ad25aacf427c2650c390738bd4cd54c9`。[清理回执](evidence/d-download-producer-cleanup-20261020.json)核对五轮准确自有快照及外部缓存共六目录均不存在，二进制/临时产物已删除；未安装依赖或执行远端。

复核时共享目录并发新增 `download_failure_journal.go`、`download_runtime_journal.go`、`download_failure_journal_test.go`，并修改 authority/runtime/recovery journal 四份现有来源。复核以 exit 1 明确单列七份差异，`current_sources_match=false`，不把原冻结回执扩大为当前 journal 接线的验收；producer 探针、v2 胶囊、生成器和派发输入仍匹配。下面命令会在 SSH 前重新对当前共享目录运行完整本地门禁，日志来源以新操作者冻结为准。

承接[四任务下载链十二项](system-backup-d-download-task-chain-mysql-20261019.md)，本专项准备 `TestDProducerDownloadOwnersMySQL` 的 **18 个独立 InnoDB 叶子**。实际 SQL 尚待用户执行及 D 接收；D 不执行 SSH。它使用具体 `SQLDownloadOwners`、C1 完整投影和实际 A/D 准入、提交后 SQL 策略、HTTP 与独立结果事务。

## 输入与隔离

当前独立胶囊 `download_producer_probe_inputs.json` 使用 `d_download_producer_probe_inputs.v2`，为 73,117 字节，完整 SHA `a881d2290a05b3239f9df583bfc61542907083becd0ff11ad53eb7645a841bc0`。它包含原准入胶囊的准确原文、C1 候选八表 DDL、四个原记录向量及 A 的准确 capability 示例；全部运行时输入随二进制嵌入，脱离源码目录也不读仓库相对文件。它独立于已接收的原九项/二十四项输入。

- 原准入胶囊 SHA 保持 `c76f218ff8e440707249ec829401514da1def8305a8778fe22a89ea499b54b0f`；正式 catalog 仍为 95 文件。
- C1 候选 DDL SHA 为 `26e64e491ca677fbd0e53e1d619cb905733adcfb8f0567b7ad47a22ae0a84d1c`。只在原 namespace UID/server UUID/完整 ledger 检查通过的 `amfa_` 加 32 位随机十六进制子库内执行，逐条受封闭八表目录限制；不进入正式 migration，也不禁用实际用例的 FK/CHECK。
- Domain/Grant/Run/History/Receipt/Reference 全部通过 C1 `EncodeStoredRecord` 生成完整 SQL 投影，scope 使用实际子库/server UUID/installation。历史证据绑定来自此次实际加密对象的完整 manifest；四种引用按实际 ENUM 顺序建行。
- 原 synthetic owner 表在组合前 DROP；重新装配具体 owner、准入环境、提交后 policy 与结果服务。保留原 synthetic issuer 的 nonce/认证/过期时间，只重签新对象的准确请求绑定，不增加人员 OTP 步骤或延长期限。

## 十八项范围

| 组 | 实际叶子 | 核对事实 |
| --- | --- | --- |
| 完整链三项 | `http_result`、`expired_owner_write_read`、`superseded_run` | 小于 8192 字节的真实加密 capability 正文、完整 HTTP/审计/结果关联；原写期限已过或 run 已 superseded、grant/domain 已撤销仍可按当前用户读取保留证据，不续原执行 lease |
| 损坏/缺失七项 | `wrong_root`、`run_projection`、`history_manifest`、`receipt_manifest`、`receipt_version`、`partial_schema`、`missing_history` | 根路径明确配置，完整记录与 SQL 展开列及原 manifest/准确对象版本独立匹配；即使重算被替换 receipt 的 hash 仍须拒绝；准入写入全部为零 |
| scope/锁五项 | `foreign_reference`、`original_run_lock`、`original_history_lock`、`empty_receipt_range`、`empty_hold_range` | 拒绝同 evidence 的外库 scope 引用；实际 run/history 行锁及 L3 receipt/L5 hold 空区间阻止准确另一连接写入；释放后写事务完成并回滚 |
| 撤权/回滚三项 | `revoked_result`、`result_link_rollback`、`late_history_rollback` | 撤权后停止 provider 授权而结果仍可独立记录；关联失败回滚结果/claim/新增预算；intent INSERT 后实际 trigger 改历史投影，最终复查拒绝并恢复全部原行 |

两个行锁和两个空区间案例使用已有准确 connection-ID 的 `performance_schema` 关联检查；不将 sleep/超时当成锁证据。阳性与回滚场景还独立 SELECT 所有原 C1 行，按实际 SQL 投影解码并逐个比对原记录，同时核对 receipt/ref 原基数，避免下载路径改写历史记录。

本地 seed 检查独立胶囊拒绝、封闭八条 DDL、实际形状 scope 的六类全投影 encode/decode、完整 INSERT 投影及真实小 capability 解密。其根含 10 项，与原两个基础 seed 合计三根/22 项；本地 seed 不连接 SQL。

## 验证记录

r55 原冻结首轮在 INSERT 测试辅助函数拒绝 `record_sha256` 的数字时失败，原断言/退出 1 保留；已将字段名检查修为受限的字母开头、数字/下划线后续，不减少投影。r55 源码快照已自动清理。

r56 编译器和 vet 在 Windows 上以 `0xc000026b` 异常退出，没有运行测试；后续进程中断，日志无最终 postcheck/清理成功。[补充清理](evidence/d-download-producer-interrupted-r56-cleanup-20261020.json)在确认原工具句柄丢失、原 PID 不存在后核对残留 511 项字节 pin、记录另 904 项已缺失，再删除准确自有目录；不据此声称原完整冻结 postcheck 通过。失败轮不覆盖。

r57 四包通过，但 server 的依赖 `k8s.io/client-go/listers/node/v1beta1` 在 vet 时以 Windows `0xc0000043` 退出，没有测试断言失败；原完整冻结 postcheck 与快照清理通过，该轮整体退出 1，不能接收为五包通过。

r58 使用相同 1,415 项原冻结/缓存及原参数，五包、checkout 内三根/22 项与 Windows probe 通过；脱离源码目录的 producer seed 因复用 helper 读取 `../../../contracts/.../a-owned-redacted-examples.json` 失败。原 v1 胶囊 SHA `a700f894...6e8d4b6`、原失败和清理均保留，未执行远端；不据此接收完整 probe 或最终源码 postcheck。

当前 v2 将准确示例放进独立胶囊，在内存中规范化并生成真实小 capability。r59 已验证原冻结五包、三 seed/脱离各 22 项及 Windows/Linux probe/runner；包含 A 的新容量测量代码，接收范围及并发 journal 差异见页首。初始化器另外在普通包终态后立即核对冻结来源，之后仍做最终 probe postcheck，避免后续 probe 失败丢失普通包来源复核。自有外部 Go cache 已随六目录清理，不保留测试构建产物；未安装依赖。

## 用户执行命令

原冻结本地准备已通过。从仓库根目录运行，入口会先重验当前共享目录：

```powershell
$producerRun = ".\docs\evidence\d-download-producer-remote-$(Get-Date -Format yyyyMMdd-HHmmss)"
$producerLog = "$producerRun.txt"
& pwsh -NoProfile -File .\scripts\system-backup-d-config-writer-validation.ps1 -DownloadProducerOnly -BuildParallelism 1 -SourceManifestPath "$producerRun-source.json" -Remote *>&1 | Tee-Object -FilePath $producerLog
$producerExit = $LASTEXITCODE
"download_producer_exit=$producerExit" | Tee-Object -FilePath $producerLog -Append
```

该命令改用 D 的冻结包装入口，先稳定复制当前来源和保存 manifest，再从固定副本执行本地完整包、准确三 seed、脱离源码运行、Linux probe、迁移 runner 和打包。10 月 20 日原直接 A 入口因 D 移走 GC 草稿遇到源码竞态，停在本地编译，没有启动远端；原失败保留，详见[journal 与冻结入口交接](system-backup-d-download-journal-windows-20261020.md)。载荷仍使用原独立 v2 胶囊。远端只选 producer 新十八项，原四任务十一项/十二项及已接收的 MFA 九项、准入/结果二十四项均不混跑。

回传 `$producerLog` 的完整原文及其来源 manifest 路径；接收需逐项核对十八叶子/root、完整来源、准确 binary/胶囊/runner、95 文件、原 namespace UID、十八个不同子库 guarded DROP/缺席、两端清理与最终实际退出码。

任务/producer 数据、issuer、容量报告、provider transport 和密钥服务仍为隔离测试输入。本专项不证明生产 provider/最小权限/完整元数据可见性、现场卷/物理预算、所有生产参与者锁序、人员 MFA、完整 GC/墓碑或生产启用；[原六项](system-backup-d-six-scope-readiness-20261015.md)继续未完成。
