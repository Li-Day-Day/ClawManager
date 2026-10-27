# D bootstrap candidate 消费实现进度

原目标“做除了远测的部分”仍进行中。本文记录已经落盘的实现和准确本地证据，不替代原部署授权、生产装配或完整验收。

## 当前入口增量（2026-10-26，尚待完整验收）

D 的显式 Go 候选装配、`BootstrapDeployment.Apply` 路由及旧 inline 入口域门禁已经落盘。旧入口从 owner 准备到 SQL/唯一提交复用同一个有界 context；候选入口先准备原授权/材料，再读取凭据和打开数据库。已有 C1 存储时禁止旧入口首次初始化；只有八张固定表逐一返回 typed MySQL 1146 才允许原缺表兼容路径，零 metadata 行或权限错误都不代表表不存在。历史读取仍检查当前 grant/RBAC、准确配置和域事实。

准确来源分别为 [D2 r2](evidence/d2-bootstrap-entry-source-ready-20261026-r2.json)、[A1 r2](evidence/a-bootstrap-entry-source-ready-20261026-r2.json)和 [D1 r2](evidence/d-bootstrap-entry-source-ready-20261026-r2.json)。这些是源码准备记录。上一轮 7582937f 因测试查找不存在的 fixture ID 而失败；修复只改为原向量中已有的 `positive/disabled_artifact`，失败历史不覆盖。ae7af383 联合验证已形成失败终态：三个定向包和 21 个必需根已通过；完整十包 8,546 条通过事件、无失败或跳过，四项本地 seed 亦有完整 package PASS；首项 Linux server 编译因磁盘空间不足失败，四项 Linux 构建无成功记录，最终源码后检未到达。准确 owner 已清理，[原始回执](evidence/d-bootstrap-entry-native-ae7af3833e1f424f946638b88c7f68d8.json)保留 `status=failed`，部分通过不等于整轮已签收。空的构建日志不能作为构建通过证据。

原冻结输入的 Linux 缺口已由 [d846 独立补验](evidence/d-bootstrap-entry-linux-d846e3793f0242cd96da1912a39c49de.json)补齐：准确重建原 1,741 份输入与四份恢复件，server、bootstrap、migration、tagged evidence 四项均原生退出 0，二进制 SHA/大小保留，补验前后来源一致，二进制和准确 owner 已删除。[A1 独立接收](evidence/a-bootstrap-entry-linux-independent-reviewed-20261027-d846.json)与 [D1 独立接收](evidence/d1-bootstrap-entry-linux-reviewed-20261027-d846.json)各自重放通过，范围仅此冻结 Linux 四项。旧 Windows 的 1,006 根/8,546 条事件与四 seed 仍是已观察阶段，原末尾后检没有追认，ae7 失败回执不改写。后加 API、parser 与 GC 字节的当前完整来源及 owner 基线仍由后续准确窗口证明。

CLI 的 30 个 owner 槽仍只链接三项，剩余 27 项须按[当前逐项矩阵](system-backup-a2-bootstrap-27-slot-matrix-20261027.md)提供真实 validator、原受控映射和显式组合；本地材料组合不会自动清槽。入口基础接点实现不代表这些授权材料或生产装配完成。旧 GC/owner 的 2099 基线也不能背书新入口；完整入口通过后仍须补 owner seed/脱离目录运行、其余构建和两个单缺陷反例，再交 A 独立接收当前基线。

下文旧轮次的结果按各自冻结来源保留；“待验证”不扩大为当前版本已通过。

后续 API 接线新增了 server/main、read_live、tasks_live、systembackupapi/tasks，以及 security/action_scope、其测试和 read_scope。它们不在 ae7af383 冻结版本中。API D 的 f0e 三阶段已经结束并清理，[A1 准确 Go 范围接收](evidence/a-d-api-native-scope-reviewed-20261027-r1.json)覆盖 API 完整五根与 server 选定四根，不扩大为完整 server 或当前 Linux 构建。当前 owner 补验仍须独立覆盖这些普通 Go 增量；本入口没有回滚 API 源码。

A 的 API 材料轮另已形成准确 Linux 补证：`4428875c0b734a4ea952580fb2c71680` 四包 Linux 编译退出 0，来源依赖后检与清理完成；D2 的[机械重放观察](evidence/d2-a-api-mechanical-replay-observed-20261027.json)核对原 47 个定向根、342 个完整根及 401 份依赖输入。原 `148b2d...` 回执仍失败且原测试段源码后检为 null；后来新增/修改的 CLI、server、API 和 smoke 文件明确未覆盖。此机械重放没有代签安全范围，也没有把补证扩为当前 owner 基线完成。

A2 发现 `evidence_read_write` 描述符能力集合比原 schema 多接受 `exact_delete`、`append_record`、`snapshot_list`、`inventory_read`。原静态阶段的一行收紧及 schema 驱动回归保留在 `evidence/a2-reference-capability-parity-*-20261026.go.txt`；D2 的[静态导入核对](evidence/d2-reference-capability-import-scope-20261026.json)当时只区分运行依赖和 tagged 测试依赖，不代替实际构建依赖与原生验证。后续准确补证与落地见下文。

A2 后续 `9c2f727f...` 已真实取得四种 go-list、原实现四个预期反例、修复后的九条通过事件，以及五个实际普通调用包的 347 条通过事件，原生冻结源码与准备输入后检均成功、owner 已清理。但 tagged seed 编译因新增 full lifecycle 与原 owner lifecycle 的 `dGCLifecyclePool`、`dGCLifecycleReleased` 重声明失败，Linux 阶段未执行，整轮仍为 failed；D2 的[独立阶段观察](evidence/d2-a2-parity-failed-observed-20261027.json)保留该边界。GC D 已接手在新增 full lifecycle 文件中仅重命名私有 helper，保留旧 owner 文件和断言；准确新组件复审与后续 tagged/Linux 原生补证另行接收，不把本轮普通包通过改写为整轮通过。

上述冲突已仅在新增 lifecycle 中重命名两项私有 helper，并经 A1 r2 组件复审。A2 的 [b53 补证组合](evidence/a2-reference-capability-supplement-b53eccbdc25449d1947e7bf90b179b92.composed.json)实际接收旧轮已后检的普通五包，以及新四种 go-list、OriginalMaterials 一根 seed 和六项 Linux 测试程序编译；两次源码/输入后检与 owner 清理均通过，Linux 程序未执行。经 D1/A1 独立复核后，[准确两文件落地](evidence/a2-reference-capability-supplement-b53eccbdc25449d1947e7bf90b179b92.promoted.json)已经完成：live parser 为 `bf76dcb...`，新回归为 `6c7e3e...`。9c2f 失败历史保留，不签当前全树或生产授权。

D2 的当前普通窗口 `01cb9a3a...` [八阶段已实际通过](evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b.json)，exec session 30893 exit 0；准确冻结 1,718 份输入，source SHA `4003f0f0...` 与 A1 r2 目标一致。四种实际依赖清单、完整六包 974 根/8,256 条通过事件、另外三根本地 bootstrap seed、当前 server/bootstrap 两项 Linux ELF 构建全通过；Windows/seed/最后源码后检成功，ELF 与准确 owner 已清理。[Root 终态重放](evidence/d2-current-ordinary-terminal-replay-20261027.json)核对原始清单和 owner 缺席。A1 已独立组合接收并登记准确 scope；随后[十五阶段](evidence/d2-owner-entry-supplement-2d061b75213d45d1af1b29acfda4ee95.json)亦实际完成，包含末两项指定断言反例，原生总退出 0、来源后检成功、准确 owner 和六 binary 已清理。十五阶段已由 A1/D1 独立接收。随后 metrics 八文件按 controller 七阶段、受影响 tagged security 四阶段及 A1 最终组合接收落地，见[落地回执](evidence/d2-metrics-controller-live-promotion-20261027.json)；准确来源为1718/7c428878，全部六个 Root 测试 owner 已清理。后增两份 PromQL 离线支持/测试脚本已经 A 独立源码及实际 mock 接收，完整来源为1720/6bf973bd，backend/contracts不变；[基线登记](evidence/a-owner-current-baseline-registered-reviewed-20261027.json)保留703/5530普通清单和旧5190，25项Node与131项合成parser控制通过。GC r4已获[A正式来源审查](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json)，Root实际重放0，operator1721/46bcb275；旧回执不扩展，没有执行operator/SQL。生产 owner 材料和原六项总体尚未完成。

10 月 27 日 D2 从原补丁数据恢复了 ae7af383 的四份历史文件，大小与 SHA-256 全部吻合原 manifest；恢复当时其他 1,737 份输入亦逐份吻合，见[来源恢复记录](evidence/d2-entry-parent-recovery-20261027.json)。四份恢复文本保存在报告指定目录，API 源码没有回滚，临时候选目录已[准确清理](evidence/d2-entry-parent-recovery-cleanup-20261027.json)。该记录描述恢复时的输入，不宣称 parser 落地后的 live 目录仍等于旧轮。d846 已在独立原 1,741 份集合中完成前后核对、构建及清理；这些新证据仍不追认旧轮未执行的后检，也不批准当前全树。

## 已落盘的接点

- `backend/internal/systembackupproducer/bootstrap_consume_contract.go`：具体 A/D 类型与受信环境阶段接口，所有权威 SQL 时间使用同一个 `SampleTime`。
- `bootstrap_consume.go`：完整用途关联幂等摘要、固定构造期 authority、私有一次性 prepared、原 context/service 绑定及新消费与历史成功分支。
- `bootstrap_consume_records.go`：批次 union 的 receipt/grant/run/history/target/ref 锁、准确 committed 事实、disabled-v1 工作和 domain epoch/row-version CAS。首次消费与历史成功两条分支都在 Work 末关闭公开写能力，再以私有只读视图复核原受控文件及已锁 SQL；全部回调结束后才进入固定 SQL 最终读回。
- `bootstrap_consume_snapshot.go`：对已锁 evidence/chunks、config/installation、operation 和新写两条 audit 的全列/全行捕获与独立比较，补足小投影不覆盖的晚期字段篡改。
- `transaction.go`：`GuardInTx` 及候选 A/D 回调共用原事务时间 floor，失败锁存，关闭工作能力后仍由内部执行最后采样。原 `Run` 的事务所有权不变。
- `transaction.go` / `record_sql.go`：factory 绑定原 `Transaction` 实例，拒绝复制出的独立 `open`/mutex/fault；副本失败锁存在原 guard，最后回调后再复查。`bootstrap_transaction_copy_test.go` 覆盖两种事务所有权下的18条值副本路径，包括忽略返回错误时仍须共同回滚。该组件在362c冻结 targeted 阶段通过；整轮因另一组 integration 失败而未通过，单缺陷反例仍待验证。
- `backend/internal/systembackupsecurity/bootstrap_candidate_capacity.go`：锁前捕获原 `RegistrationCapacity` 报告，L6 使用原费用、预算和五秒 inclusive 边界增加 reservation；复查原 sample、预留金额下界及同一 guarded transaction。`SameBootstrapTransaction` 识别原写能力和私有只读能力，既不暴露 SQL 事务也不签发权限。三根容量组件测试在362c冻结 targeted 阶段通过；首轮57输入不覆盖它，当前原文件组合仍须重新验证。

容量的 `PrepareAttempt` 将缺失/损坏的物理报告保存为私有失败，返回 nil `CapacityObservedAt`，只在新消费拒绝。当前 grant、RBAC、原可信映射仍必需；历史成功读取不会仅因资源报告缺失而在 L3 之前被挡住。非 RBAC registry 的同类材料边界见[A 的原授权决定](system-backup-a-bootstrap-retry-materials-20261026.md)。

原合同禁止 FinalGuard 之后的新文件/网络/回调，不禁止它之前对原受控路径的有界本地复核。`finishCallbacks` 的准确顺序为：关闭公开写能力 → 原事务共享时间及原 plan/context 检查 → 私有只读 `Session.Recheck` 一次 → 关闭私有视图并检查被忽略的 SQL 错误 → 再检查共享时间及原 plan/context → `callbacksComplete` → generic guard 的固定 SQL 读回及最后时间检查。provider/TLS/network 留在锁外；文件变化或撤销不能用旧内存快照掩盖。保留的写能力在文件复核期间也不能写入。

新增 `bootstrap_callback_phase_test.go` 的八种模式检查正常原文件、删除、替换、保留写能力、吞掉非法只读 SQL、回调前过期、回调期间超时，以及回调 panic 时私有视图仍被关闭。最后一项同时检查保留的采样、查询、单行查询及 transaction identity 均已失效；实现以 defer 保证异常清理，正常路径仍立即关闭。该新文件与阶段调整的限定原生结果见下文，不属于88b2冻结范围，仍未取得完整验收；跨包 integration 与额外 retained-view/replay 用例仍由新 D 的单一文件所有者维护。

私有只读视图也防护整值复制：`bootstrapReadView` 仅保存共享私有 state 指针，所有反射副本共用 mutex/open/read/原 transaction。每条已到达回调的用例都保留一个反射副本，并在 guard 返回、唯一 commit 之前检查原视图与副本的采样/查询/单行查询/identity 均关闭且没有 driver dispatch；panic 路径也共用关闭状态。仅把类型设为 private 不能阻止反射整值复制，原先将 open/mutex 直接放在 view 内不足以保证所有副本失效。该补强的完整源码回归仍待完成，未借用88b2证据。

6c6519 新快照已实际执行上述八种模式，八个 leaf 与 parent 共九条 PASS，producer 定向包通过，十个 D2 输入与本轮 manifest 完全匹配；见 [root phase observation](evidence/d-bootstrap-core-phase-native-observed-20261026-6c6519.json)。整轮 targeted 仍 exit 1：nonce 新文件的 `hash` import 与原 `nonce_test.go` 包级函数重名，导致该包编译失败。完整九包、identity overlay、Linux 构建及最终 source postcheck 均未到达，不能把组件通过改写为整轮验收。准确临时 owner 已清理；失败日志保持原样，A2 负责修复名称冲突后重新冻结。

A1 负责 `systembackupsecurity/config_bootstrap_candidates.go` 及原 service 的候选分支。A2 负责 `systembackupbootstrapsecurity/producer_candidate_binding.go` 的原用途/配置/receipt 纯关系，数据匹配不能授权。原 inline grant-only 幂等身份保留。

首次消费保留原 receipt/history 和 candidate/receipt/hold 三类引用及其保护期；原 observation、当前 bootstrap/domain/dependency 授权和保留期仍必须有效。仅旧执行 lease/authorization/owner-write 预算经过不构成对合法 committed observation 的自动拒绝。历史成功重试在 L3 区分，只读返回原结果，不重消耗、重收费、递增 epoch 或续 observation。

## 首轮准确证据

[首轮回执](evidence/d-bootstrap-consumer-native-6a67be850e894df08be5f9f7ba51264a.json)和[原生日志](evidence/d-bootstrap-consumer-native-6a67be850e894df08be5f9f7ba51264a.jsonl)覆盖 producer 全包及四份合同 fixture，共57份输入。`go test -json -count=1 ./internal/systembackupproducer` 原生 exit 0，82个根测试、810条通过事件，无失败或跳过，其中新增7个消费根测试。默认 vet；关闭依赖下载，未安装依赖。

冻结副本测试前后字节一致，准确临时 owner、缓存和构建产物已经删除。`current_source_matches_snapshot=false` 如实保留：后续 typed-nil context、operation/audit 全列保护和必需列检查等新字节没有被此轮背书。遥测文件权限信息保留在原始日志；最终测试退出码为0。

原 GC/owner 的2099阶段证据也只保持原冻结范围，不能用来批准新增 consumer。

后续31ed联合快照已完成：1690份输入，七包8074条通过事件、无跳过，Linux server 与 bootstrap 二进制构建通过，临时 owner 已清理；其 `current_source_matches_snapshot=false`。362c阶段的容量及事务副本组件共四根测试、37条通过事件已单独记录在 [limited observation](evidence/d-bootstrap-capacity-copy-native-observed-20261026.json)，不能把整轮 exit 1 改写为成功。

88b2联合快照也已取得准确终态：1706份输入，targeted/full 原生退出均为0，七包8246条通过事件、无跳过，两个 Linux 构建通过，snapshot verified/unchanged 为 true，exact owner 已不存在；见 [terminal observation](evidence/d-bootstrap-consumer-88b2-terminal-observed-20261026.json)。其 `current_source_matches_snapshot=false` 如实保留。冻结之后的全局 L1/统一 context、Work 末原文件复核、nonce/CA 新适配与后续完整 GC 增量必须进入下一轮准确来源，不能借用本轮结果。

D2 的十个自有文件已按 [root source ready](evidence/d-bootstrap-consumer-root-core-source-ready-20261026.json) 固定交接，gofmt 检查无输出；这是下一轮的源码准备记录，不是新的 native 签收。联合复制窗口还须与正在补原 report 锁前准备的 GC owner 协调，不能复制跨包半成品。

## 尚待完成

1. 当前源码联合原生回归和完整包/构建门禁；范围为原九包加 bootstrap CLI 共十包，新 nonce/CA 适配必须明确计入同一冻结来源，不能仅运行原七包。
2. 跨包模型已经从 `ConfigBootstrapService.Bootstrap(Candidates)` 进入 D `GuardInTx`、A 具体写入和唯一提交，并接入真实容量 helper；须在当前原文件复核阶段与全局 L1/统一 context 修改后重新冻结验证首次、历史重试、最终失败共同回滚及未知提交同 key 读回。旧 snapshot-only 组件通过不代表当前原文件授权链闭合。
3. D1 按准确实现和原生结果完成 BC1–BC12 独立签收；原真实部署 authority 的生产装配仍须由原独立来源提供，synthetic 测试不能代替。
4. A2 的原 grant/RBAC/registry 具体文件包装器与 nonce/CA 窄接口及测试已落盘，尚待原生回归和真实 API 组合验证。nonce 保留完整全局 config 与固定原 cutoff retained 集合、共同 L5 前缀；CA 保留原锁外 TLS 和锁内 Work 末受控文件复核。不能仅凭 helper 单测把原授权整链列为完成。
5. D1 的26项消费探针、三项全局范围专项及接收器已分别完成准确本地准备；新增原材料真实 API 组合 BM1–BM10 仍在准备，见 `evidence/d-bootstrap-original-material-integration-requirements-20261026.json`。实际 MySQL/远测不由本聊天执行，旧 owner 十一项不能替代该新路径。
6. 入口显式候选装配、旧路径域门禁及统一 context 已实现，仍须当前准确来源的完整原生验证和独立入口签收。CLI 尚缺 27 项 owner adapter，必须保留原 grant/RBAC/独立映射及准备先于 DSN/openDatabase 的边界，不能用 JSON 字段、no-op factory 或 approved 布尔补槽。原缺口事实与后续实现分开记录于 [entry gap review](evidence/d-bootstrap-entry-composition-gap-20261026.json)。

联合验证由用户新开的 bootstrap D 聊天维护独立快照和清理；原 D2 保持上述核心文件单一写入者。完整 GC 新接线由用户另开的 GC D 聊天负责，双方共享短复制窗口，避免边改边冻结。
