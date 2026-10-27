# D 本地收尾：2026-10-26

【2026-10-27 本轮结束后暂停】清理时钟/原子记录/完整reader的五文件候选与gate四文件候选已在私有1727份来源（fd71b0af）完成本轮验证：Windows清理包14根/60事件、controller155根/284事件、tagged security seed1项均实际通过；Windows真实controller构建及Linux四份编译产物通过，四个actual Go上下文已核对。原串行入口构建中止/失败保留，以新并行构建exit0及同源证据组合，不重写旧回执。来源前后检成功，五binary、c6缓存/源码及D1 7cff owner已删除。本轮未赶上17:00；用户随后要求“做完这轮后暂停”，因此不落地九文件，不开启下一轮。live仍1720/dc79，GC r5/A4原受审入口不因本轮改变；新SQL ledger未安装、真实provider事实和生产装配未获此轮证明。详见[准确终态](evidence/d2-cleanup-gate-round-closeout-20261027.json)。原六项整体仍未完成。

阶段状态：GC 的准确冻结实现和 23 项原生验证义务已完成，测试/构建产物已清理。唯一 tagged 演练修复的[依赖匹配组合](evidence/d-local-current-source-composed-20261026.json)已通过检查，A 的 [owner 本地最终签收](evidence/a-owner-final-local-accepted-20261026.json)和[基线登记](evidence/a-owner-registration-handoff-reviewed-20261026.json)已完成。该阶段绑定原 `2099a08c...` 字节；随后新增的 bootstrap candidate 消费实现不在其背书范围内。本文件不宣布原六项整体目标或生产恢复/GC 完成。

10 月 27 日已完成部署入口的当前普通八阶段、owner/GC 十五阶段，以及 metrics 控制器七阶段和受影响 tagged security 四阶段；各范围的后检与准确产物清理齐全。八文件 metrics 增量经 A1 精确组合接收后已落地，见[落地回执](evidence/d2-metrics-controller-live-promotion-20261027.json)。普通 owner 基线为 1,718 份、`7c428878...`、703 根/5,530 条通过事件，旧 5,190 名独立保留。随后新增两份 PromQL 离线准备/测试脚本；A 已用源码及实际 mock 测试单独接收，当前完整来源为 [1,720 份/6bf973bd...](evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json)，backend/contracts 字节不变，Root 实际重放该审查 exit 0。[基线登记](evidence/a-owner-current-baseline-registered-reviewed-20261027.json)只追加准确一行，25 项 Node、131 项合成 parser 控制和实际 CLI ready 已通过；GC operator r4 已获 [A 正式新来源审查](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json)，original1720/6bf973bd、operator1721/46bcb275，Root 实际重放 exit 0；仅源码批准，没有执行 operator 或 SQL。旧来源回执保持原边界。ae7 失败和未到达的后检保留，原冻结来源的 [d846 Linux 四项补验](evidence/d-bootstrap-entry-linux-d846e3793f0242cd96da1912a39c49de.json)不追认为旧轮后检。准确状态见[实现记录](system-backup-d-bootstrap-consumer-implementation-20261026.md)。原目标“做除了远测的部分”保持进行中。

范围来自用户“做除了远测的部分”。本聊天没有连接 SSH、kubectl 或真实 MySQL，没有安装依赖，没有发放权限或启用生产 freeze。其他验收聊天接收的实际专项各保留原来源和边界。

D2 自有 `.tmp-d-index-cache-212173ee568b4914bc7e6e5905c1de11` 已删除，不能再作为可用缓存或源码来源。此前只读拷入 8,310 条编译缓存并增量补入 1,055 条，[首次交接](evidence/d2-owner-entry-cache-handoff-212173ee568b4914bc7e6e5905c1de11.json)及[增量记录](evidence/d2-owner-entry-cache-update-d38c3030d67c4c27aec6eaca90424d2a.json)保留；该交接阶段尚未启动 D2 的 Go 测试。两轮 Linux 实际出现磁盘空间不足后，仅清理此准确自有 owner，删除前观察文件共 1,697,243,998 字节，未删除其他聊天产物，见[释放记录](evidence/d2-owner-entry-cache-release-212173ee568b4914bc7e6e5905c1de11.json)。当前实际普通窗口另用 `01cb9a3a...`，不复用旧 owner 身份或测试结果。所有新增普通源码的独立验证与明确来源组合完成后，才运行 GC 三项 seed、当前 Linux evidence 编译及原 owner 薄补；不以两份 GC tagged 组件评审豁免并行 API 或 parser 的普通源码变化。

10 月 27 日的准备记录保留在 [r3 接收器准备](evidence/d2-current-local-validation-source-ready-20261027-r3.json)，当时接收器 37 项 Node、PowerShell AST、helper 哈希控制和 compiler-crash/空测试/有效事件 mock 均通过，mock owner 已清理。当前已满足准确 parser 组合落地及原冻结 Linux 补验前置，[r5 启动核对](evidence/d2-current-ordinary-window-start-ready-20261027-r5.json)绑定 1,718 份输入、source SHA `4003f0f0...`，与 A1 r2 目标一致。

普通窗口 `01cb9a3a...` 的[八阶段主回执](evidence/d2-current-ordinary-native-01cb9a3a3e1d48d7b56da8ffa138bc9b.json)现已成功，exec session 30893 原生 exit 0。四种实际 go-list、六包完整回归（974 根、8,256 条通过事件）、Consumer/ConsumerRanges/Entry 三根 seed 和当前 server/bootstrap 两项 Linux 构建全部 exit 0；Windows、seed、末尾源码后检均 true。两个 ELF 均记录 hash/size 并删除，准确 owner/cache/build 已清理，Root [终态重放](evidence/d2-current-ordinary-terminal-replay-20261027.json)独立确认 owner 缺席与完整清单一致，D1/A1 亦已独立接收。首次重放误用了要求活 owner 的 CLI，参数校验拒绝后改用同一导出的 retained-log 校验器；该调用未影响原生验证。

A1 的[准确 scope](evidence/a-owner-pre-thin-scope-reviewed-20261027-r1.json)已正式登记，实际相对 artifact CLI exit 0，仅批准本地十五阶段。Root 首次使用 `350432a6...` 的[启动失败](evidence/d2-owner-entry-supplement-350432a64996420e85b3e9625b8208e0.json)是传入绝对 target/scope 路径，被严格前置拒绝；Go/tests 均 false、零阶段，finally 已删除该 owner 及原 2,163,990,984 字节准备缓存，不能再称可用。失败记录保留，未修改门禁。改用相对 target/scope 后，[十五阶段主回执](evidence/d2-owner-entry-supplement-2d061b75213d45d1af1b29acfda4ee95.json)现已成功，exec session 45743 exit 0、error null、15 阶段齐全；前十三项 exit 0，末两项按指定 leaf/parent 断言 exit 1 并观察到单缺陷不安全提交，均非编译失败。GC 三 seed 为 7/15/33 项本地模型；resources/HTTP/Admin、packaged 与空目录 detached 各十三名、standalone 九根/49 事件及五份 Linux/一份 Windows 二进制均完成准确清单检查。源码冻结 1,718/source `4003f0f0...` 的后检和原 scope 终检成功，六 binary 及准确 `2d061b75...` owner 已清理，A1/D1 已各自独立接收终态。另有[只读缓存接续](evidence/d2-metrics-cache-after-owner-20261027.json)已为后续 metrics 增量保存 2,123 条完整 CAS、162,886,007 字节于自有 `e08fbb1a...`，核对冻结字节、无 Go/结果复用，其 owner 在该增量结束后删除。此处保存原4003阶段；后续 metrics 增量已完成，最新完整来源登记见本文开头。

## GC 实现与同事务边界

A1 随后核对 API A 旧 Linux `442` 记录，确认它的 `source_unchanged` 实际比较 live 保护集合前后，未覆盖冻结副本末检，`source_paths_unchanged` 也为 false。普通 security 的[独立 Linux test-compile](evidence/a-security-linux-compile-reviewed-20261027-r1.json)已补齐，准确 frozen 1,718 pre/post、17,324,591 字节 ELF 和自有 `bac9b1ac...` 清理全部通过，Root 重放 reviewer exit 0；不能追认旧轮后检。materials/CA/nonce 的其他 Linux 部分保留 b53 的准确组合范围。

10 月 27 日还发现两类独立的 D 本地缺口。GC operator 同时传互斥开关，已仅删除冗余 `-ConfigProofOnly`，新版候选为 [r2](evidence/d-gc-full-lifecycle-review-request-20261027-r2.json)，安全参数前缀预演通过；原 r1 及其拒绝记录保留，这不是远测通过。A2 的[指标安全源码评审](system-backup-a2-metrics-security-source-review-20261027.md)指出四类带标签拒绝告警共八式缺总量聚合。Root 另查到 signature 告警使用 `metric_result="failed"`，与原计划 `failure` 闭集不符；A2 完整核对 95 条 PromQL 的 9 组 selector/10 个 matcher，仅此一处越闭集，合法 task `status="failed"` 保留。合并九式的[精确候选](evidence/a2-metrics-security-source-ready-20261027-r2.json)已完成私有生成一致性检查和清理，Root 重放源码/selector/fixture 三项检查均 exit 0；待十五阶段后单独接收，不热改冻结输入。另备[59 组/117 项原始时序夹具](system-backup-a2-metrics-promtool-fixture-20261027.md)，既有 YAML 结构检查通过，但环境无 promtool、未安装依赖，所有预期仍待真实 evaluator 验证。当时签名分支的去重 carrier 也未闭合；后续已按既有标签拆为两条规则，仍不能据源码候选或模型宣布 PromQL、missing-series、生产加载或指标整体验收。

Root 又在私有 Node 镜像补了[原计划闭集回归](evidence/d2-metrics-security-private-node-20261027.json)：旧版两项通过、一项因 `metric_result=failed` 断言失败，九式候选三项全通过且两生成一致性检查 exit 0；私有源码后检成功、准确 Node 子目录已删除。A2 的[全部非空去重 carrier 审计](evidence/a2-metrics-dedupe-carriers-reviewed-20261027.json)进一步发现 cleanup-overdue 也要求未由指标输出提供的 `cleanup_status`。D 原 [r1 draft](evidence/d2-metrics-dedupe-proposal-20261027-r1.json)提出 global dedupe 及签名/校验 OR 拆分；[r2 限定修订](evidence/d2-metrics-dedupe-proposal-20261027-r2.json)纠正 r1 的“98 行完全不变”误写为 97 行，并保留全局 cleanup 阈值无法恢复逐 owner 冻结 deadline 的未闭合结论。r1 未落地，也没有被追认为完整语义修复。

[有界完整检查](evidence/a2-metrics-immutable-threshold-scope-reviewed-20261027.json)确认两条混合 owner 的 critical（cleanup 与 residual volume）都不能从全局 age/current deadline 正确推导；16 条 queue ratio 保留逐 owner 归一化，4 条 singleton gate/hold 只有在 collector 投影同一活动 gate 的冻结值时有效，实际投影仍未证明。新 [r3 registry](evidence/d2-metrics-controller-registry-candidate-20261027-r3.json)因此为 210 指标/100 告警/94 PromQL/6 controller；签名拆分使用既有标签，两条 cleanup critical 改为 controller_state、0 for、immutable threshold 与 unknown missing-source 策略。Go 候选要求完整且同 clock 的集合、逐 owner 非负 age/正 deadline、显式残留卷事实（nil 拒绝），先验证全部行再按 strict `>` 聚合；已确认完整空集才健康。原四规则逻辑保留，未新增 metric、SQL 列或生产 caller。实际 collector、自动 cleanup 起点、跨 origin/type/target 绑定仍需原 D/B authority，不能从 Complete bool 得到生产资格。

准确八文件候选已由 A1/A2 源码复核；三项 rules 与五项受影响 contract Node 测试、两项生成一致性检查通过。首个 `e08f...` Go 窗口因空输出日志未创建而失败，只保留四 list 和 Windows 完整 controller 的 147 根/237 事件；Linux 与完整文件集合未被追认，owner 已删除。严格 [r2 七阶段](evidence/d2-metrics-controller-candidate-6eb295fa53fa4b299fc506a66bc76960-20261027-r2.json)随后成功：四 actual list、完整 controller、Linux ordinary/tagged 编译全 exit 0，1,718 来源加原计划一个附加输入共 1,719 完整文件集合及字节前后检成功，两 ELF 的 header/hash 留档，准确 owner 已删除，A1/D1 独立接收。

[实际逐 root 依赖影响](evidence/d2-metrics-controller-selected-impact-20261027.json)另确认普通十一包编译输入不变，只有两平台 tagged security 依赖新增 controller 代码。独立 [tagged security 四阶段](evidence/d2-metrics-tagged-security-candidate-73d13ff796d44907bc4079ef728c983e-20261027.json)已全部 exit 0：两 actual list、Admin seed 一根及 Linux tagged security 编译，完整来源/文件集合前后检 true，准确 owner 和 ELF 已删除。A1 的[八文件最终组合接收](evidence/a-metrics-current-candidate-composed-reviewed-20261027-r1.json)经 Root 实际重放 exit 0 后才落地；[落地回执](evidence/d2-metrics-controller-live-promotion-20261027.json)逐份核对原 1,718 输入、准确八处替换和其余 1,710 份不变，A2/D1 又独立复核。全部六个 Root 测试/缓存 owner 已缺席。没有重跑原六包/五包或十五阶段，也没有执行 Linux 测试程序。

collector 和自动 cleanup 起点仍未实现为生产事实；[有界交接](evidence/d2-cleanup-collector-handoff-20261027.json)明确同一 DB clock、完整集合、逐 owner 冻结 deadline、原 origin/type/target 绑定、显式残留卷分类和四条 gate/hold 冻结投影要求。`Complete` 不授予 SQL 权限或 readiness。PromQL 已备两份共 97 组/231 项夹具与[用户执行命令](system-backup-a2-metrics-promtool-fixture-20261027.md)，本聊天未运行 evaluator/SSH，不能计作 231 项通过。

[最后合同预检](evidence/d2-final-contract-preflight-20261027.json)实际结果：schema 与 contract 普通 `--check` 均为 0，两项 `--strict` 均为 1。仍缺 catalog imports/records/scan_states 三张计划控制表、recovery_catalog_records/restore_target/status_relay/catalog_scan_record 四份合同；另有 40 项 policy、60 项 cross-review、34 份 draft artifacts 及现场 schema hash。没有改门禁或补造这些原始决策。

- 真正的受保护删除工作成功后，才签发私有 `downloadGCWorkFinalizer`。它绑定原 context、原事务、collector 和 operation；副本共享 atomic 消耗状态，失败也消耗，拒绝跨事务、替换 context、复用和并发重复消费。
- 完整动态值的 `reflect.Value.Comparable()` 检查拒绝接口字段藏有 slice/map 的 context，避免相等比较 panic。值/指针格式化采用常量，JSON 序列化拒绝，不输出原授权事实。
- 固定内部候选按 work → 最后 ticket → 原事实 finalizer → 唯一 commit 的顺序执行。捕获最后一次成功 SQL 时钟和原 until；不延长授权或 reservation，不新开事务，不在 finalizer 内提交、解锁或重试。
- 最后阶段先执行原 guard/reservation/early/direct，再独立复查 worker/lease/deadline、config、保留 envelope、tombstone 和原 absent keys，最后检查 SQL 时间及原 context。删除后不调用要求旧组仍存在的 `g.Recheck`。
- 原公开 `Collect` 仍拥有原连接和唯一事务结束，没有接入生产 freeze。真实 grants、完整 metadata/Policy、全局锁顺序、物理容量与实际接管证明保持待验。

实现位于 `backend/internal/systembackupevidence/download_retention_gc*.go`。准确九文件及 F1–F10 请求见 [新请求](evidence/d-gc-finalizer-review-request-20261026.json)，旧 fixed-SHA 请求生成器保持历史检查，不继承为新增代码批准。

## 已完成的准确原生范围

[冻结范围接收](evidence/d-gc-finalizer-native-frozen-reviewed-20261026.json)及其检查器 [native-review](evidence/d-gc-finalizer-native-review-20261026.mjs)绑定 1,629 份输入，原 Node 排序摘要为 `41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16`。

| 验证范围 | 已确认结果 |
| --- | --- |
| 完整 evidence / producer / resources / read / security / server | 902 个根测试、7,815 条通过事件，无失败或跳过；默认 vet，`-count=1`，没有用定向测试代替完整包 |
| 原 owner 覆盖 | 旧 5,138 项及上一版本 5,148 项逐名保留；当前 security/evidence 为 647 根、5,190 条通过事件 |
| 当前 finalizer 模型 | 正常删除和时钟前进成功；ticket 后权限、引用、预留台账、worker/fence、config、envelope、tombstone、absent key 变化及原时限等值拒绝并共同回滚 |
| 时钟反例 | 仅推进 work 末次样本 +2µs，再在 ticket 后回退 1µs，证明中间值回退也被拒绝；原 physical sample/until 不续期 |
| owner seed | packaged 和空目录 detached 各 13 项；原异常参数调用不计通过 |
| standalone 边界 | 明确五份标准库 Go 源码，9 根/49 条通过事件和 Linux 编译；仅协议/primitive，不代替 concrete collector 包 |
| 二进制 | Linux owner、resources、HTTP、Admin SQL、migration、server、standalone 共七份；另有 Windows owner seed 二进制，摘要保留，文件已删除 |
| 单缺陷 overlay | 删除 finalizer 调用、丢弃 work 最后时钟各造成指定 leaf 和 parent 的原生断言失败（exit 1），并观察到不安全提交；不是编译失败，也不声称执行了未冻结的历史中间版本 |

实际运行分两段。原轮 `a9b3f627...` 六包及资源/演练/owner seed 的有效阶段保留；它的 Admin seed 错指 db 包，返回零测试，detached 裸点参数实际 exit 2，两者明确排除。补充轮 `1c44af32...` 用正确 security 包和参数数组完成相应阶段及其后全部构建/反例。两份冻结 manifest 的集合与每份字节完全相同，原段 source checkpoint 与补充段最终 source postcheck 均成功；没有重跑六个普通包。

旧 r4 的 server vet 崩溃和缺失终端回执保持失败历史。旧 owner `53f39288...`、本轮 `a9b3f627...`、补充 `1c44af32...` 均已删除。只读复制的编译缓存也随本轮准确 owner 删除，没有复用测试结果。交付日志、源码摘要及回执保留。

## 当前工作树增量

并行的演练实际验收发现跨安装夹具在插入子记录后修改复合 FK 父键。修复将 foreign installation 从插入时保持一致，并新增本地 seed 回归；没有修改 GC 或普通包生产代码。

相对原 23 项冻结验证，当前只有 `backend/cmd/server/system_backup_read_drill_history_mysql_test.go` 从 `04ff3f72...` / 15,250 字节变为 `e8df47f2...` / 20,190 字节。它受 `systembackup_mysql` build tag 约束，普通六包、GC、owner、resources/security 探针及 migration 的受测输入不变；旧演练 seed/HTTP 二进制不能背书新增字节。

新修复来源为 `evidence/d-drill-http-repair-local-20261026.json`。其 PowerShell 排序摘要为 `b267397adc7696879a17a32a39f2637ebaf046f00a92c285a3b92ed2ea9c6348`；按原 Node ordinal 顺序计算同一组字节为 `2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0`。两个 manifest 须按 path/size/hash 比较，不能把排序差异误判为全部输入变化，也不能把摘要不同直接略过。

`--check-frozen` 明确接收原 23 项冻结义务并报告当前 delta 未接收；普通 `--write` 仍拒绝当前字节差异。修复后的演练 seed、Linux SQL/HTTP probe、迁移工具、源码后检和准确清理已按[当前增量回执](evidence/d-drill-http-current-increment-received-20261026.json)接收，并经 A2 独立重放。新增 foreign fixture、其 nested HTTP 检查均有实际本地 PASS，实际 MySQL 仍为零。当前组合明确替换原第 8 项 seed 和第 15 项 Linux HTTP 构建，其他 21 项保留相同受测依赖；没有声称单次重新运行当前全树。

[D 独立 F1–F10 复核](evidence/d-gc-finalizer-independent-reviewed-20261026.json)已接收准确私有 GC 冻结范围；[A2 F4 复核](evidence/a2-gc-finalizer-f4-reviewed-20261026.json)关闭准确本地时钟修订，[A2 tagged 增量复核](evidence/a2-drill-current-increment-reviewed-20261026.json)确认当前来源匹配。上述签收保留各自当时的整体范围限制，不由 D 代签 A 的 owner baseline。

## 接收器、保留结果与后续边界

当前四套接收器 [163 项证明](evidence/d-readiness-receivers-current-20261026.json)为 64/58/27/14，原生退出均为 0，输入前后稳定。旧 157 项回执保留原范围；新增的六项演练接收器回归没有覆盖旧日志。

前端原 333 份来源及其 286 项 Node、两项类型检查和构建记录保留历史范围，见 [保留结果核对](evidence/d-retained-local-evidence-current-20261026.json)。10 月 27 日新增 task service 经 Root 真实 TS 回归发现 malformed 202 和非法 kind 的边界缺口，已窄补并复用原完整 task 校验；[当前增量](evidence/d2-task-submit-increment-current-20261027.json)核对 335 份输入、306 项 Node、两项类型检查及构建全部通过，字节及文件集匹配，准确产物已清理。原读规则仅增加公开 typeguard 包装，逆变换可恢复旧字节；生产 writer/details 和真实链没有因此接通。nonce/CA 的准确 r2 复审可重放，未批准原材料或部署装配。

readback 十二项、writer 九项及后来另一路接收的真实 FK 十项各保留隔离合成专项范围，不要求重跑。演练原十九项失败回执继续保留；另一路已接收[修复后实际十九项](evidence/d-drill-http-actual-accepted-20261026-c5f6a4a2.json)，原生退出、源码后检及该轮准确清理均已核对。该接收只覆盖其隔离合成 HTTP/MySQL 专项，不覆盖新 bootstrap consumer。本聊天未执行这些远测。

正式 strict inventory/contract 仍各 exit 1，原三张 catalog 计划表、四份合同、40 项 Policy、60 项交叉签收及现场 schema hash 不因本地验证而完成。完整恢复/GC、B/C 真实领域和 provider/catalog 交付、共同权限/锁协议、物理容量/接管、真实部署整链仍需各负责人和操作者补齐。

后续复现入口为 `evidence/d-gc-finalizer-current-validation-20261026.ps1`，已做 AST/参数预检；本轮真实结果来自上述两段，不能把该修正后的整份包装器称为另一次已执行的全量运行。
