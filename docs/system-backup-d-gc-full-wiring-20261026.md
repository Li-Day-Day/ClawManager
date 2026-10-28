# D：完整 GC owner 调用链接线候选

2026-10-27 17:01 核对：当前为 **D r5／A r4**，原始 `dc79d81f...` / 1,720 → operator `f3ed3894...` / 1,721；A r4 只读重放退出 0。A 在 16:31 已实际验证同一 binary 下的 source GC3 与真正空 cwd GC3 全部通过，临时产物已删除。最新正式回执、失败修复和带来源检查的重试命令见 [standalone 修复交接](system-backup-d-gc-detached-seed-fix-20261027.md)。实际 GC 15 项 SQL 尚未执行，真实 catalog 域材料仍缺，完整 GC 未验收。下文 r4／A r3 及更早来源均为历史。

当前交付准确来源已更新到 [A r3 正式源码复审](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json)：original 1,720 / `6bf973bd...` → operator 1,721 / `46bcb275...`，对应 D 候选 r4。D-GC 已读回并重放当前 checker `--check`，退出 0；旧 4003／7c4288 回执只保留历史。operator 尚未启动，本轮 SQL／PromQL 均为零，source review 不代表真实域或生产 GC 接收。完整材料与当前 `ReviewedSourcePath` 见 [当前复审记录](system-backup-d-gc-operator-source-preparation-20261027.md)。

当前交付里程碑：GC 三根 seed、当前 Linux tagged 编译、准确 ordinary／十五阶段补验完成后，A 已正式接收 [4003 原始／44a3 overlay 的 operator 源码](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json)，D-GC 重放检查退出 0。此接收不调度运行、不代表实际 SQL 或真实域 authority 已完成；Root 独占 Go 窗口期间不启动 operator，后续 metrics 八文件进入 live 必须新候选／新 review。旧 candidate 状态和下文阶段性“待审”描述按原记录保留，不覆盖这一准确源码复审结果。

当前本地准备结果：1,718 / `4003...` 准确来源的 Root 十五阶段已完成，GC Full Collect／Lifecycle／Profile 三根 seed 全部通过，当前 Linux tagged evidence 编译成功、后检和清理完成。D-GC 已重放 [D1 准确 native 复核](evidence/d1-current-fifteen-stage-reviewed-20261027-2d061.json) 的 `--check`，退出 0；Linux evidence 为 `-vet=off` 仅编译，实际 SQL 仍为零。[20261027-r2 材料](system-backup-d-gc-operator-source-preparation-20261027.md)已修正互斥参数，并获得上述准确来源的 A 正式源码复审；它不调度执行。下文保留早期“待补验”的历史，不用于否定上述准确结果或扩大为完整生产 GC 接收。

2026-10-27 更新：A2 9c2f 的真实 tagged 编译暴露新增生命周期 helper 与旧 owner 测试重名。已仅在新 Full lifecycle 文件内纯重命名两 helper 及引用，14 个标识符逆变换准确恢复旧字节；当前 life 为 `c0571470...` / 32,957，旧 owner 与 cold 源未动。[新 source-ready 与静态证明](evidence/d-gc-full-lifecycle-helper-rename-source-ready-20261027-r1.json) 已交 A，[r2 组件复核](evidence/a-gc-tagged-component-reviewed-20261027-r2.json) 已实际创建并由 D 重放检查通过；旧失败保留。d846 的原 1,741 来源四项 Linux 补验已独立完成并清理，不能替新 GC 签收。当前 GC 新源补验由 A2 优先与 Root 协调，尚未据此登记为通过；详见 [生命周期交接](system-backup-d-gc-lifecycle-preparation-20261026.md)。下段 `cac6...` 组件回执为修复前历史。

当前后续增量：新增独立 15 项 Full public owner 生命周期 tagged 探针及 `docs/evidence/d-gc-full-lifecycle-*` phase／接收器／冻结适配器；cold tagged fixture 的 schema pin 仅排除真正外层 AUTO_INCREMENT 分配计数，未知注释、嵌套和重复格式拒绝。A 已实际创建 [两组件限定复审](evidence/a-gc-tagged-component-reviewed-20261026-r1.json)，准确绑定 cold `e9806c48...` / 23,173 与 life `cac6c2bc...` / 32,901；D 读回并逐项核对 hash。独立纯解析测试 34 项与 AST／Bash 语法检查已通过，新的 Go seed／Linux 补编和真实 MySQL 尚未执行。全树另有并行 API 等普通代码变化，该组件复审不代表全树 ready。下方 A 回执只对应原 1,679 来源，保留不覆写；其“11 份当前字节匹配”属于该回执创建时的历史状态。父入口完成、普通增量准确复核并明确交接后，由 Root 统一执行窄补和其余 owner 复核。详见 [生命周期交接](system-backup-d-gc-lifecycle-preparation-20261026.md)。

## 最新限定接收：容量固定与 Full GC 准备

A 已实际执行独立检查器的默认只读检查、排他创建和再次 `--check`，出具 [新版限定接收](evidence/a-gc-prepared-full-reviewed-20261026.json)，状态为 `accepted_exact_frozen_local_models_and_probe_preparation_only`。这项接收固定 `aeb5bd66f14a8e081c177eb0d63ae77a0a4d32f8ae7e5f0a131e0d9b1c3966c3` / 1,679 输入，并逐项匹配 11 份当前 GC Go/schema 字节。

公开 Full owner、报告在 connector/锁/Begin 前唯一固定、原 context/source/cost 单次使用、原 ObservedAt+5s 严格上界、精确预留表 INSERT，以及 capacity SQLFloor 到最后 owner clock 的传递均已纳入本地接收；legacy Early / Reserve 和 bootstrap candidate capacity 未借此扩大。

完整 evidence 补跑为 399 根 / 3,228 通过事件，metadata 为 13 根 / 281 事件，三个本地 seed 均通过，全部零失败／跳过。五项 Linux 构建成功并记录各自 SHA 后删除二进制；冻结后检通过，run `2775832f44dc48d28bc8c68c88c74d4b` 与暂存 `c174311d5a3b46d1aba3f9e7bbae7a99` 均已删除且独立确认缺席。未安装依赖，也未执行真实 MySQL／SSH／kubectl。

本轮采用 a2e7 原冻结普通源码，其余八个完整包的通过结果来自该来源；a2e7 的整体失败和未完成最终后检如实保留，其超时包的零散通过事件不用于补足新完整包。evidence 单包在相同普通源码上以更长的测试框架预算重跑，生产五秒边界及业务时限均未放宽。唯一 backend 增量是明确的 D1 original-materials tagged 测试 19b1/25,537 字节；并行的新 bootstrap entry 不在本次接收范围。历史 093f 的全部 3,493 个通过名称由完整结果保留。

[D 正式请求](evidence/d-gc-capacity-full-review-request-20261026.json) SHA 为 `c363223c195c7fb236ed89e23571f12b65452aa67853a7f17e52d98db19afa49`；[补证回执](evidence/d-gc-full-supplement-2775832f44dc48d28bc8c68c88c74d4b.json) SHA 为 `483fe863b3330ea60290a0dcd606e9e2347e4e93a0093556feecc163d5940dc2`。已交付 JSON 保持不变，不覆写历史 093f/a35a 接收。

**完整 GC 仍未验收完成。**33 项 Full profile 与 7 项公开冷组场景是本地已编译的准备，实际 SQL 执行数仍为零；冷组域授权、容量报告和候选 evidence CHECK 均明确为测试范围。真实 catalog/import 域策略、剩余 kill／takeover／multi-holder／session-state 等协议场景、十二组实际 MySQL 和真实物理容量仍待完成。原材料齐备后的真实 adapter / Policy 接线和验证仍由 D 实施，不能自动签成完成。详见[原始域材料清单](evidence/d-gc-catalog-authority-materials-request-20261026.json)。

以下保留各历史阶段的实现与验证记录；其旧来源不能替代本节的准确限定接收，也不能替当前 live entry 或生产启用背书。

2026-10-26。用户要求 D 主导接通完整 GC 并交 A 复审。本轮补公开 `Collect` 的显式 freeze 调用链与批次释放不明处理。**这是待复审候选，生产完整 GC 尚未验收。**实际完整域 Policy、当前权限来源、程序 DDL 冻结语义和十二组 MySQL 事实不能由本地合成测试补签。

## 当前增量状态（容量固定与真实冷组候选，待新门禁）

旧 093f 和 a35a 回执只证明各自冻结版本。当前已修正 Full-only 精确 INSERT 预留表权限，并新增 security/config_mutation_capacity_prepared.go：在 connector / backup lock / Begin 前固定容量报告；原 ctx/source/cost 单次使用、原报告严格五秒边界、事务内只有 SQL，失败副本不可复活；owner 时钟还受 capacity 最后 SQL 样本约束。legacy Reserve 与 bootstrap candidate capacity 源码未修改。当前 GC8 已变化，不应再宣称匹配旧回执。

新增 Full profile 33 项（含缺 INSERT 与真实预留 SQL）和公开 Collect 冷组七项故障 probe 源码，使用 UID 隔离库、候选 evidence CHECK、合成已发布 task 域授权及合成物理报告。它们尚未实际执行 MySQL，也未替代生产域授权。新的离线 gate 为 scripts/system-backup-d-gc-capacity-full-validation.ps1，完成后另交新来源给 A，历史请求不得覆盖。

## 历史本轮代码

`DownloadRetentionGCConfig.Freeze` 是部署端显式输入。旧 Policy 未提供时保留历史路径及其原验收范围；full authority 遗漏 Freeze，或提供但错误时拒绝构造，不回退历史路径。配置只在构造时取私有值副本，不保留 caller 的可替换配置指针。准入 scope 还固定原 config 版本/摘要、worker row version、peer 证书摘要及原 authority expiry。公开结果不输出账号、claim、locator 或内部错误。

原 mandatory `DownloadRetentionGCPolicy` 还必须实现 `DownloadGCFullFreezeAuthority.AdmitFreezeSession`。仓库没有默认实现。该方法必须核验当前实际协议批准、权限及完整 metadata 语义，覆盖原空集合新增程序、DDL 等待与提交窗口、撤权、取消和接管；仅实现旧 Policy、填写摘要或取得 BACKUP_ADMIN 都不自动获准。原域 Early/Lock/Recheck 的当前 worker 授权、全部逻辑引用及保留条件仍强制执行。

固定运行顺序：

1. 保留原 mTLS context/peer，最多压缩为三十秒，不延长上游截止时间。
2. 用专用 connector 建立独占会话，核验准确 server/database/account/NONE role/UTC/session/MySQL 版本及完整原 SHOW GRANTS。锁前准确 ticket 必须为零，再调用只读协议准入。
3. 有界等待 `LOCK INSTANCE FOR BACKUP`，观察本会话一个准确 BACKUP LOCK，再复核当前权限及已持锁阶段准入。
4. 使用不同账号的 `systembackupgcmetadata.Source` 读取完整 triggers/routines/parameters/events/views/SHOW CREATE VIEW，核对准确 combined pin；随后再次复核 worker 会话、权限、协议准入及原 ticket。观察发生于持锁后、Begin 前。
5. 同连接 Begin 唯一 RR，执行真实 `collectProtectedWork`，保留原 L0→L1→L2→L3→owner/nonce/reference→capacity/audit/evidence 顺序。固定包装层在原域 Early/Recheck 外独立检查全 worker grants、准确 ticket 与结构 pin。
6. 原 work 成功后，最后 ticket → 原 completion finalizer → 唯一 commit。completion 仍绑定原 context/tx/collector/operation，保留原 SQL 样本、until、reservation 和删除后独立守卫。finalizer 不调用独立 observer、不重新开启事务。
7. 事务已知结束后在同连接显式解锁，观察原 ticket 为零，最后请求物理 discard。未知提交不重试或声称回滚；未知回滚不声称已结束；取消时不换连接/换 context 补解锁。

## 独立权限 profile

旧 Early 白名单和角色回执不变。新增 full worker profile 要求额外三条精确授权：global BACKUP_ADMIN、`performance_schema.metadata_locks` SELECT、`performance_schema.threads` SELECT。新解析器只剥离这三条供旧安全形状检查，完整原语句集合仍须匹配新的受审 grants pin；另用 `gcFullReadTables` 固定 core/direct/task/producer 已发布读取闭集。额外动态权限、角色、GRANT OPTION、通配权限、重复、缺失、转义/其他 recipient 和跨库授权都拒绝；重新填写摘要也不能放行未知 system 表。不执行 GRANT。

observer 继续采用既有独立 privileged profile，构造时绑定相同 server/database、不同 account、精确版本和 grants。结构 pin 与 program pin 只表达预期字节；内容的实际语义和完整域引用审批仍由 mandatory authority/Policy 提供。

## 结果与批次

新增 `ErrDownloadRetentionGCReleaseUnknown` 和 `DownloadRetentionGCBatchResult.ReleaseUnknown`。提交不明、回滚不明、释放不明可以共同存在；逐项保留 flags，停止后续候选，不推进该候选游标、不计 collected/rejected、不自动重试。已知 commit 但解锁不明也必须停止，由现场按原 holder/session 处置。

## 本地验证与 A 复审

新入口 `scripts/system-backup-d-gc-full-local-validation.ps1` 只使用现有 Go/Node 和离线模块。独立 Node snapshot 检查原文件、复制文件和复制后来源一致；测试只消费冻结副本。默认 vet、`-count=1`，先验证公开 full Collect，再运行完整 evidence/metadata 和 Linux tagged 编译；准确 owner 的副本、缓存和二进制在结束后删除，日志与来源摘要保留。

最终冻结来源为 `093f6b84d87d70bafc2819b351d1d36874dea32cd35e89420461f218e8eb8def` / 1,644 输入。[完整终端回执](evidence/d-gc-full-local-0f34460abce44e279a1f2c92d19bb11c.json)确认：

| 范围 | 结果 |
| --- | --- |
| 公开 Full Collect 定向 | 4 个根测试、33 条通过事件；无失败或跳过 |
| 完整 evidence + metadata | 409 个根测试、3,493 条通过事件；两个包均原生终端 PASS，无失败或跳过；evidence 368.111 秒 |
| system producer | 从公开 Collect 完整执行真实 admission/result 重构、concrete producer guard、full profile/observer、末次 finalizer、唯一提交及释放；晚 run authority 变化和 live hold 均共同回滚 |
| 权限与协议 | 旧 Policy 拒绝构造、full authority 缺 Freeze 拒绝、协议未验证/持锁后撤权在 observer/Begin 前拒绝；混合额外权限、跨库、转义 recipient、通配和重 pin 未知表拒绝 |
| Linux tagged | `systembackup_mysql` evidence 测试二进制编译退出 0；没有执行真实 MySQL |
| 来源及清理 | 冻结副本全部输入后检成功；本轮五个准确 owner 均不存在；所有本轮测试/构建副本、缓存、二进制已删除，未安装依赖 |

首两个 PowerShell 串行复制轮检测到源码漂移，未启动测试，owner 均已清理。首个成功冻结 `15ff...` 的定向通过，但完整包在 suite 600 秒总时限处中断：3,119 条通过事件、没有 leaf 断言失败，package 失败；不计完整通过，产物已清理。中间 `c561...` 的完整两包 408 根/3,483 通过、Linux 构建及后检均成功，仅背书该中间版本。最终 `093f...` 另外完成全部步骤，不继承旧轮通过；生产 peer/worker/SQL/容量时限未放宽。

[可执行复审请求](evidence/d-gc-full-review-request-20261026.mjs)默认或 `--check` 只读核验最终来源、八份准确代码/脚本、原生事件和五个 owner 缺席；只有 `--write 新文件` 可以用排他创建生成新回执，拒绝覆盖已交付文件。[固定机器交接](evidence/d-gc-full-review-request-20261026.json)当前 SHA 为 `0c1ff055817ef0e1499ecfc4b377a7922bff8aa78e8b579a72ffb2a17e4fa840`。

首次交接生成点 live 与全部冻结输入匹配；在 A 要求冻结交付文件之前的一次再次检查曾覆盖请求，准确记录并行 bootstrap 已变化的 producer/security 源和新增 capacity 文件，`whole_live_tree_ready=false`。现已固定上述请求字节，后续只读检查另报当前漂移，绝不写回历史 live 字段。历史交接时 GC 八份源码/脚本匹配原冻结摘要；当前容量增量已使其变化；bootstrap 的实际 import 依赖增量须后续 joint 新门禁，不能继承 `093f...` 为当前全树通过。

A 已出具[独立限定接收](evidence/a-gc-full-owner-reviewed-20261026.json)：`accepted_exact_frozen_full_owner_call_chain_not_production_gc`。其[只读检查器](evidence/a-gc-full-owner-review-20261026.mjs)独立核验 `093f...` / 1,644 输入、GC 八份当前字节、完整 409 根/3,493 事件、公链 4 根/33 事件、system producer 三分支，以及旧 evidence 3,179 个通过名称逐项保留；来源后检、Linux tagged 编译退出 0 和五个准确 owner 缺席均已确认。没有重跑 Go，Linux 未留存二进制摘要，因此不扩大为现场二进制批准。

A 接收限准确冻结的本地 owner 调用链，未批准当前整树、真实域 Policy/协议 authority、十二组实际 MySQL、物理容量或接管；`goal_complete=false`、`production_approved=false` 保持明确。旧 native41b/current2099 只保留历史来源，新的 bootstrap 普通源依赖仍待后续 joint 门禁。

## 继续拒绝的现场缺项

原十二组验收定义见 `evidence/d-gc-backup-lock-protocol-requirements-20261021.json`。其中 privilege、DDL/foreign FK、routine、trigger/event/view（含空集合新增）、account/DML、holder lifecycle、pool reuse、multiple holders、temporary/session、scale/wait 和 full Collect 都需要准确部署实例结果。旧角色十项与前置/生命周期四十二项不重测，也不扩大为这十二组已通过。

新 authority 没有生产实现，不存在“程序摘要匹配就默认运行”的路径。B/C catalog/import 等域、准确实际授权来源、全局等待图、物理容量和释放接管证据未齐时，应由实际 Policy/authority 拒绝。当前没有配置现场账号、启动 scheduler、连接远端或授予权限。

MySQL 官方文档说明 backup lock 允许 DML、要求 BACKUP_ADMIN，且会话终止释放锁；这些类别说明不能代替完整程序 DDL 的实际等待证明：[LOCK INSTANCE FOR BACKUP](https://dev.mysql.com/doc/refman/8.4/en/lock-instance-for-backup.html)。

三类 catalog/import 原始材料已拆成可交 A 转交的[准确输入清单](evidence/d-gc-catalog-authority-materials-request-20261026.json)：正式 schema/迁移与存在规则、原 owner/write deadline、生命周期、完整引用图、范围锁与实际正反例。该清单是缺项请求，不是新 schema 或审批。收到原件后仍由 D 完成真实域 adapter / Policy 集成与完整冷组实际验证，不能把这项本地实现责任写成材料已齐后的自动完成。
