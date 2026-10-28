# A 本地收尾与远测交接

2026-10-27 16:54 最新收尾：owner 新轮 `160458-2bce7205` 的 MySQL 8.4.8 十一项全部通过，161 个门禁及 96 份迁移已正式接收，见[正式回执](evidence/a-download-owners-mysql-accepted-sbk-mig-261027083544-2360.json)和[A2 独立复核](evidence/a2-owner11-successful-terminal-reviewed-20261027-2bce7205.json)。最初顶层接收因 PowerShell 7 中文页脚格式拒绝；原退出记录保留，接收器仅新增完整末尾块识别，136 个控制通过并离线重新接收，未改原日志、未重跑 SQL、旧失败继续拒绝。原 owner 及本轮 GC 复制二进制/临时目录都已删除。GC 同 binary 源目录三 seed、真正空目录三 seed 与同源 Linux evidence 编译均已接收；真实 GC 十五项未运行。清理新包 14 根/60 条、controller 完整包 155 根/284 条 Windows 原生已限定接收，正式命令和 Linux 构建仍由 D 收尾，不能据此称 A 整体或生产链已全部完成。当前完整命令见[交接文件](system-backup-a-current-test-handoff-20261027.md)；Owners 无需重跑。

2026-10-27 17:00 截止收尾更新：上一轮 owner `145649-489723bd` 已终态退出 1，MySQL 8.4.8 中 10 项通过、`missing_reference_column` 因错误 1845 失败；全部本轮数据库、namespace、临时目录已清理，原失败保留。A1 已修为 owned 负例库内分三条重建同名 RESTRICT 外键，不关闭 FK 校验；[准确源码审查](evidence/a-owner-copy-fixture-source-reviewed-20261027.json)和 A2 独立复核完成，原来源预检为 ready。A2 正协调操作者优先用原 Owners 完整流水线重跑，尚无本次修复后实际通过回执。普通 owner 703 根/5530 条来源未变。后续 GC tagged 冷组修复另需新完整来源冻结，不能继续使用旧 r4/A r3 源码审核。清理 ledger 的 GC 三份 overlay/八个反例和 gate 四候选/七根源码复核已交付；native、正式迁移与生产接线仍未因此通过。最新可用命令及状态以[交接文件](system-backup-a-current-test-handoff-20261027.md)为准，不安装依赖、不代填缺失映射。

2026-10-27 原文定位补充：按用户“自己找，没有就没有”，A 已核对本地合同/迁移/部署候选、相关 API 对话、邻接工作区相关文件及本地 Git 历史，见[原来源搜索](evidence/a-original-input-source-search-20261027.json)。原计划 6.1、12.2 已有自动 drill、显式 operation/retry 与不可变预算语义；D 可以自行实现首次时间持久化及 collector，四个 gate/hold 的冻结字段与安装 matrix 映射也已找到，不再等用户设计或找合同。真实 bootstrap 受控映射仍未找到可用完整来源；旧 lab 候选明确不可激活，broker allowlist 为空。另已确认新 owner 流程 `145649-489723bd` 的 Go 进程与测试输出在推进，1,720 份来源按原排序摘要 `ead92189…`、按当前 ASCII 排序摘要 `6bf973bd…`，完整 tuple 一致；尚未接收其终态或 SQL。A 不重复长测、不改这轮冻结输入。

当前可用命令、准确范围与尚缺输入见[测试交接](system-backup-a-current-test-handoff-20261027.md)。owner 基线及 GC 新源码门禁通过；本对话未运行 SSH/实际 SQL/真实 PromQL，全部 A 目标尚未完成。

2026-10-27 最终基线更新：指标准确八文件已按[组合复核](evidence/a-metrics-current-candidate-composed-reviewed-20261027-r1.json)落地；控制器七阶段与受影响 tagged security 四阶段均由 A 独立接收，未重跑旧完整包。owner 当前[本地接收](evidence/a-owner-current-local-accepted-20261027.json)为 703 个测试根 / 5,530 条原生通过事件，原 5,190 个名称全保留；[基线登记复核](evidence/a-owner-current-baseline-registered-reviewed-20261027.json)确认仅追加准确新定义、原历史定义和 parser 字节保留，25 项 Node 和 131 项合成接收器控制通过，原 CLI 及真实工作树枚举均返回 ready。基线普通 backend/contracts 来源为 `7c428878…`。随后两份 PromQL 准备脚本使完整来源成为 1,720 份 / `6bf973bd…`，已通过[显式支持增量复核](evidence/a-owner-current-full-source-composed-reviewed-20261027-r2.json)和实际本地 mock 测试；不修改选择器、不删除他人文件、不声称真实 PromQL 通过。旧 1,718 份来源、旧 GC 审核和它们之后的漂移拒绝均保留，GC 新 r4 已由 [A 当前正式源码审核](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json)接收，checker write/check 均退出 0；原始 1,720 份 / 运行 1,721 份，来源 `46bcb275…`。此 ready 仅允许进入原 owner 快照/远测门禁；owner 十一项、GC 新实际 SQL、97 组 / 231 项真实 PromQL、真实 collector/自动清理时钟/四个 gate 投影、bootstrap 27 槽及其原 authority 仍未完成。A1 未安装依赖、未 SSH、未执行实际 SQL。

2026-10-27 最新收口：A1 已正式登记 1718 文件 / 84 差分 / `4003f0f0…` 的独立 scope，严格 CLI 退出 0；旧段落“登记为空、十五阶段未允许、普通六包运行中”为历史状态。当前普通八阶段已成功并清理；A1 新 Linux security 单项编译实际退出 0，具有自己的冻结后检及清理，旧 442 回执缺少冻结最终后检的事实保留。[当前入口补证](evidence/a-current-entry-repair-native-reviewed-20261027-r1.json)保留原 8,546 条测试名。[十五阶段 A 独立接收](evidence/a-current-fifteen-stage-reviewed-20261027-r1.json)已 write/check 均退出 0：13 阶段成功、2 阶段为预期断言失败，GC 三 seed、两位置各 13 owner 事件、standalone 九根 / 49 条及准确清理均核对；Linux evidence 编译保留 `-vet=off` 边界。另 [GC 正式源码审核](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json)仅接收准确 4003 原始来源与七处 runner 替换、新生命周期 phase；不调度执行，不代表 SQL 或生产通过。Root 指标控制器八文件修改仍在私有来源验证，live 尚未替换；后续若落地，GC 候选和 A 审核须按新来源重做。当前完整 baseline、27 个生产槽位、指标真实采集和 PromQL、GC 新 SQL 及 owner 十一项远测仍未完成。

2026-10-27 A2 窄修现已准确落地，A1 已重放其全 1765 来源 promotion 检查退出 0。新 [目标 r2](evidence/a-owner-pre-thin-target-20261027-r2.json)固定 1718 文件/84 差分、来源摘要 `4003f0f0…`，捕获与 byte check 均退出 0；它仍是待独立 scope 复核的候选，不允许十五阶段。A1 新 [A2 原生范围](evidence/a-a2-promoted-native-scope-reviewed-20261027-r1.json)及 [四 context 依赖闭包](evidence/a-a2-promoted-dependency-closure-reviewed-20261027-r1.json)已 write/check 均退出 0：573 输入、普通五包 42 根/347 条、固定后 Schema 九条、OriginalMaterials seed 与六项 Linux 编译准确组合，失败历史、来源后检和清理保留。另 [迁移 Linux 重用](evidence/a-entry-migration-linux-reuse-reviewed-20261027-r1.json)核对 106 个 production 构建依赖与原 Linux、当前 r2 和新 Go-list 来源全同，不重复迁移编译。Root 当前普通窗口已冻结相同 r2，四个实际 Go-list 和来源后检已完成，正执行六包全量测试；producer 包通过已观察，其余阶段和整轮终态尚未接收。旧段落“候选待落地”等为当时记录。27 生产槽位、十五阶段、当前基线、实际 SQL 和远测仍未通过。

2026-10-27 本轮继续收口：原 1741 字节来源的 [Linux 四项独立接收](evidence/a-bootstrap-entry-linux-independent-reviewed-20261027-d846.json)与 [A1 阶段组合](evidence/a-bootstrap-entry-observed-composed-20261027-r1.json)均重放退出 0；新轮 pre/post 和清理齐备，原 Windows 最终后检仍未执行，不追认旧整轮。A1 也已逐字节/完整文件集合及原始日志独立复核 [前端增量 335 输入、306 项 Node、两项类型检查与构建](evidence/a-task-submit-frontend-reviewed-20261027-r1.json)，确认旧 20 项中的 11 个断言失败由新 20 项全通过替换、共享规则可逆还原且 owner 缺席，未重复功能测试。另 [51 项选择器差异](evidence/a-owner-selector-omissions-reviewed-20261027-r1.json)已证实 live 原字节全部未变；这不是物理删除，也不是部署/Python 功能验收。A2 b53 补证已终态成功，A1 以原 Windows 绝对路径对 r2 receiver 重放退出 0；候选精确落地和 Root 当前六包/三 seed/两份 Linux 仍须实际接收。新增 [当前补证逐名 inventory](evidence/a-bootstrap-current-repair-inventory-20261027.mjs)的三项反例测试通过，要求保留原全部根及子用例、闭合四 seed，当前尚未产出通过回执。当前基线、27 槽及实际 SQL/远测不因此通过。

2026-10-27 A1 已独立接收 [D API 的准确本地范围](evidence/a-d-api-native-scope-reviewed-20261027-r1.json)：f0e 原始日志的 API 完整五根与 server 选定组合层四根逐项闭合 RUN/PASS，四份实际 Go-list 的选定依赖并集共 587 文件，字节同时匹配 D 成功来源、Go-list 冻结来源及当前源码，所涉包的完整 Go 文件集合也一致。接收器五项回归及实际 write/check 均退出 0；这避免重复 API Go，不覆盖 server 全回归、变更依赖后的 CLI、Linux 二进制或真实 SQL。主 D 已另交 [前端窄修增量](evidence/d2-task-submit-increment-current-20261027.json)，其新 service/helper 字节替换旧 API D 前端 pin；A1 未重复 Node/类型检查。独立 scope 登记仍为空，当前基线和远测启动条件仍未通过；继续等准确 Linux/A2 补证终态并收口剩余当前源码验证。

2026-10-27 A1 已交付[严格 scope CLI 与补测接口](system-backup-a-pre-thin-target-interface-20261026.md)，源码准备 r3 包含十七项 target/scope 接收器回归（全退出 0）及实际草稿 CLI 拒绝（退出 1）。独立 scope 登记表仍为空，尚未允许十五阶段或当前基线。原 ae7 的[独立阶段观察](evidence/a-bootstrap-entry-phase-observed-20261027-ae7af383.json)核对十包 1,006 根/8,546 条、原定向和四 seed，保留 failed 和原末后检未执行事实；新 Linux 回执只能证明新轮自己的准确 pre/post 区间。A2 本轮发现新增 Full GC helper 与旧 owner 测试重名导致 tagged 编译失败，GC 已只改两个私有名字；[A1 组件 r2](evidence/a-gc-tagged-component-reviewed-20261027-r2.json)独立证实 14 处逆变换精确还原旧 pin，旧 owner/cold 文件不变，新 lifecycle 为 c0571470…/32957，Go/实际 SQL 仍待准确补验。当前本地推进安排为 A2 精确修复调用范围、原 1741 Linux 补证及 D 六个剩余普通包/三根 seed/当前 server 与 bootstrap Linux；只接各自真实终态和清理，不将局部观察升级整轮，不重复已被同源严格证据关闭的范围。

2026-10-27 A API/材料补证收尾：新增 action scope、nonce/artifact CA/evidence CA 原 authority 组合及无网络输入检查，详见 [A API readiness 接点](system-backup-a-api-readiness-20261026.md)。148b 六包定向 47 根/276 条、五包完整回归 342 根/2,637 条均通过，无失败/跳过；原轮 Linux 磁盘失败和 finally 清理记录保留。单独 4428875c 四包 Linux ELF 编译退出 0，401 项测试依赖与原生来源/编译冻结来源/当前字节相同，后检和准确 owner 清理完成；[限定机械接收](evidence/a-api-readiness-native-148b2d3547074f7ca4c4a046f19be373.reviewed.json) write/check 均退出 0。中断的 7435d248 owner 已按 marker 恢复清理，失败记录保留。D server/API/smoke 与新增 CLI/TLS 源码不在本次接收范围，不登记整个当前 checkout 或 baseline 通过。当前默认 CLI 仍缺 27 槽，显式三材料组合仍缺 24 且无生产清槽；真实授权映射/其余 owner/业务 writer/details/实际 SQL-provider 回执及非实现者安全签收仍待完成。下方“修正轮进行中”等仅保留历史观察。

2026-10-26 补测前接口已交付：[目标/独立复核接口](system-backup-a-pre-thin-target-interface-20261026.md)、schema 和六项通过的 Node 拒绝回归。CreateNew 候选 `a-owner-pre-thin-target-20261026-r1.json` 固定 1,716 输入/81 差分，capture 与只读 check-bytes 均退出 0；它只有字节核对，`native_start_authorized=false`，尚无允许十五阶段的独立 scope review。相对父清单有原 thin 选择器排除 Makefile/Dockerfile/CSV 等的集合差异，不代表 live 文件被删除。ae7 最新实际 receipt 已终态 **failed/cleaned**：targeted/full/seeds 退出 0，Linux server 失败，不能把部分通过登记整轮。A API 修正轮 148b 同样 **failed/cleanup**：targeted/full 退出 0，Linux security 失败。失败及缺失的最终冻结后检必须真实补证，不能以现在 live 字节代称原轮后检；新 API D 任务事务、A2 窄修及调用闭包仍需各自准确证明。下方早期“Linux 进行中”等文字保留为当时观察，不再代表最新终态。

2026-10-26 首条 API 增量见 [A API readiness 接点](system-backup-a-api-readiness-20261026.md)：新增复用登录 session/pin/RBAC 的 create backup/preflight 事务内授权 scope，以及独立 nonce/artifact CA/evidence CA 材料组合和无网络输入检查。未修改 D server/CLI，原当前 CLI 仍缺 27 槽；显式装配三材料且原 mapping 成立后才可结构上减至 24，不能据此登记生产清槽。新六包定向已观察通过，五包普通回归首轮因隔离脚本漏带旧 docs 夹具失败，准确日志与清理保留；修正轮进行中，未接收新整轮。旧 ae7af 的[重新观察](evidence/a-api-readiness-prior-entry-observation-20261026.json)已核对十包 1,006 根/8,546 条及四本地 seed，无失败/跳过；该观察时仍未见完整 terminal receipt/清理，且旧 read_scope 字节与当前不同。历史结果不得覆盖新增源码。

最新入口定向观察：`7582937f...` 因三根 D domain helper 用了不存在的 `configured_artifact` 而失败；A1 r2 九根/21 条和 CLI 两根在同轮通过，仅保留[准确观察](evidence/a-bootstrap-entry-r2-targeted-observed-20261026-7582937f.json)，不接受整轮。D2/D1 已分别修为原 `positive` 组的 `disabled_artifact`，三方 immutable r2 清单均已交付。A1 新增[向量引用检查](evidence/a-bootstrap-entry-vector-reference-review-20261026.mjs)，六项 Node 回归通过；首次 checker 将 record Definition 当 ID 的失败日志保留。`ae7af...` 新定向原生日志已见三包 33 根/164 条通过、无失败或跳过；完整十包/四 seed/Linux/后检/清理尚未接收。

原 owner 的[当前冻结门禁复审](evidence/a-owner-frozen-gate-current-reviewed-20261026-r1.json)也已完成：当前 wrapper 因 Full GC 等增量变为 `ae4385be...`，旧整文件 pin 的 checker 正确拒绝；随后 A1 原 14 项隔离 mock 实际退出 0、输入稳定、准确 owner 缺席，独立 `--write/--check` 均退出 0。此复审执行真实 baseline parser，但没有 Go/SSH/SQL；当前 owner 源码基线仍需完整入口和独立补测接收后登记。

当前补证已限定接收：[Full GC prepared capacity 与探针准备复审](evidence/a-gc-prepared-full-reviewed-20261026.json)。准确补证来源 `aeb5bd66...` / 1,679 输入，evidence 399 根/3,228 通过事件、metadata 13 根/281 条、三根本地 seed、五份 Linux 二进制摘要、来源后检与三个准确 owner 缺席均已独立核对；旧 093f 的 3,493 个通过名称保留。A1 检查器 `--write` 和 `--check` 实际退出 0。原 a2e7 整轮失败及其未完成后检事实不改写；实际 Full33/冷组7、完整域/十二组协议与物理生产授权仍未接收。

A1 入口源码已交 [r2 七份准确摘要](evidence/a-bootstrap-entry-source-ready-20261026-r2.json)，九根新增测试尚待原生运行。r2 补齐初始历史读取与最终检查中的 installation `matrix_key`，晚变更必须回滚。入口第一次捕获 `87e37e...` 因来源在复制期间变化被门禁拒绝，`tests_started=false` 且已清理，不能算 Go 失败或通过。A2 的 [27 槽矩阵](system-backup-a2-bootstrap-27-slot-matrix-20261026.md)已由 A1 只读重放退出 0：三项材料真实 validator 已有但未装配，另十七项有运行/元数据 helper、六项 registry 业务 validator 待补、一项跨资源只有局部检查；本轮清槽零。

2026-10-26 当前优先顺序：先收口 A1/D2 的实际 bootstrap 部署入口，再做准确新来源验证和独立复审。候选入口在读取凭据/打开数据库前完成原 authority/resource Prepare，使用同一个一次性时限；旧入口补 C1 全缺表证明及完整 schema/domain 门禁，拒绝 C1 已部署时的 grant-only 首次初始化，原精确历史分支仍须当前 grant/RBAC 和最终 SQL 复查。A1 已提供保持准备 context 身份的 `bootstrapLegacyPrepared` 私有 core，新增上下文身份与无期限拒绝用例；目前只完成 gofmt/差异检查，尚无新入口原生通过回执。

最新 `a2e7...1f49` 已终态失败并清理：五包定向 393 条通过，完整九包中的 evidence 在默认十分钟包预算超时；不得登记整轮通过。D 正按其冻结普通来源补 evidence、tagged seed 与 Linux 编译，补测不覆盖冻结后新增的部署入口。其后 A 继续逐项收口 27 个资源槽位及 Full GC 新 prepared capacity/33 项权限 profile/七项公开 Collect 冷组准备；这些实际 SQL 均未因本地准备而通过。最后才能更新来源基线并交付远测命令，原 owner 十一项仍未执行成功。

2026-10-26 最新状态：联合普通源码冻结 `88b2cfd9f32b454183e60d9f0f1259ec` 已终态，七包 956 根/8,246 条通过事件、无失败/跳过，runner 记录两项 Linux 构建成功、冻结后检和 owner 清理；见 [A2 限定复核](evidence/a2-bootstrap-88b2-frozen-reviewed-20261026.json)。A1 另核对原 owner 的 5,190 条测试名全部保留。该接收仅属准确冻结来源，不含下一阶段新源码，也不登记当前 baseline。A1 的全局配置 L1、唯一 attempt 时限及对应新测试已落，A2 的原文件授权、nonce/CA 六文件及十二根测试也已就绪；下一轮须五包定向、九包普通回归及两个材料包的 Linux test 编译。具体边界见 [A 合同](system-backup-a-bootstrap-global-prefix-20261026.md)。owner `103443/4904e85a` 已以退出 1 终止：SSH unavailable，实际 SQL 未启动；见 [D 限定终态](evidence/d-owner-remote-startup-rejected-20261026-4904e85a.json)。旧本地通过不覆盖此失败。

新 Full GC 31 项 profile 探针仅完成 [本地 seed/编译/dispatch 准备复审](evidence/a-gc-full-profile-preparation-reviewed-20261026.json)，实际通过项为零。随后冷组准备发现原容量 helper 还需 metadata reservation 单表 INSERT 权限，并须将报告读取拆到 connector/全局锁/事务之前；D 已确认共同 C1 的原报告边界，正在补独立 prepared capacity 和 Full 接线。修复后需新来源接收，原 `093f`/`3bdf` 保持准确历史范围。公开 Collect 冷组、完整域 authority、故障与接管的本地准备仍未完成。

A1 已只读重放 [三项全局范围对抗的本地准备](evidence/d-bootstrap-config-ranges-mysql-local-reviewed-20261026.json)，退出 0：准确 `2452011f` 来源包含 `feac` 桥接，两个 seed 和两份 Linux 构建、22 项接收器回归及清理齐备。夹具用三个 anchor 分开旧目标 absence gap 和直接写者的 gap，INSERT VALUES 不先锁来源行，实际运行必须核对 `data_lock_waits` 的准确会话/配置索引。三个真实 SQL 用例尚未执行；这也不替代 A1 新 stage 测试或材料整链。

最新增量：A/D 正在实现 bootstrap candidate 的具体同事务消费。A service/强制 authority 来源、完整早锁与审计、共享时钟、独立全配置复查及跨包成功/重试/回滚/提交不明测试已落，联合当前来源验证尚未完成；grant/RBAC/registry 复用和容量窄 SQL 适配继续补齐。当前新源码预检应为 [not_ready](evidence/a-bootstrap-consumer-preflight-rejected-20261026.json)，旧 2099 ready 只保留准确历史范围，不可直接背书新源码远测。捕获重试可能跨过早期 ready 的竞态已由 [冻结后门禁](evidence/a-owner-frozen-baseline-gate-reviewed-20261026.json)修复并独立复核。

Full GC opt-in 公开 owner 链也已完成 [A 限定本地接收](system-backup-a-gc-full-review-20261026.md)：093f 冻结、两包 409 根/3,493 通过事件、公链四根/33 条、Linux compile 和准确清理；真实领域/协议 authority、十二组实际协议、容量与接管仍未批准。它不覆盖后续 bootstrap 新依赖，也不把旧前置角色回执扩大为完整生产 GC。

2026-10-26 更新。当前 owner 本地准备已正式接收并登记基线；bootstrap 的 committed candidate 消费仍有本地集成缺口，不能宣称 A 全部本地工作完成。机器进度见 [本轮记录](evidence/a-all-local-work-progress-20261023.json)。本轮没有安装依赖，没有由 A 执行远端 SSH。

## 上一轮 2099 owner 基线已收口（准确历史范围）

[正式接收](evidence/a-owner-final-local-accepted-20261026.json)包含 security/evidence 两包 647 个测试根、5,190 条原生通过事件；旧 5,138 条及上一候选的 5,148 条逐名保留。原两位置各 13 项 seed、Windows owner probe、Linux owner/resources/Admin/HTTP probe、migration/server、五份标准库源 standalone 测试及 Linux 编译均有原生记录。两个单语义回退 overlay 分别触发 worker_claim 和中间 SQL 时钟回退的预期失败，不能称作旧生产版本的完整测试。

原完整 native 来源为 `41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16`。上一轮已接收的 [组合来源](evidence/a-owner-final-source-20261026.json)为 `2099a08cb03ebf57e9c9411765ff166ac189e097dedb153971fb46b72f8133b0`，共 1,629 份文件；唯一差异是带 `systembackup_mysql` 标签的 drill HTTP 测试。该增量已独立跑 seed、编译当前 Linux HTTP probe并完成后检/清理，替代原 stage 8/15；普通包和 owner 的依赖字节不变。两来源排序与摘要格式有明确归属，不把来源组合说成新跑了一次整树测试。

基线注册保留全部历史定义及原 parser 前缀。15 项注册回归与 67 项实际回执 parser 回归通过；新 finalizer 字节漂移仍在测试或 SSH 前被拒绝。本次真实枚举 backend/contracts 字节后经原预检 CLI 返回 [ready_for_original_snapshot_gate](evidence/a-owner-final-preflight-ready-20261026.json)，`actual_sql=false`、`tests_started=false`。ready 只允许进入原远测流程。A2 [独立复核](evidence/a2-owner-final-current-reviewed-20261026.json)已核对当前三份输出、完整来源、stage 替换、库存及实际 baseline 选择。

旧 r4 的 server vet 失败、原 primary 的错误 Admin 包零测试、detached 参数失败均保留，未算成覆盖；准确同源补测修复缺项。旧 owner 144309 的叶项失败/超时及旧 FK 全局后检失败也未改写为成功。已结束轮次的准确 owner、缓存和二进制均已清理；其他聊天新启动的 owner 不由本轮清理。

GC 私有 finalizer 的 F1–F10 本地算法与运行门禁在上述准确来源接收，详见 [审查](system-backup-a-gc-finalizer-review-20261026.md)。生产 Collect 尚未接入该候选；准确 worker/observer grants、联合锁协议、物理容量和十二组真实协议仍须各自原事实及验收。

## 已接收的其他范围

- writer FK 修复的完整 resources 普通包为 71 根/843 条事件，旧 826 条逐名保留；三个 seed、Linux probe/migration 和实际依赖范围已独立接收。
- FK 十项真实 MySQL 现已接收：[D 原回执](evidence/d-resources-writer-fk-actual-accepted-20261026.json)、[独立复核](evidence/a2-writer-fk-actual-reviewed-20261026.json)。A1 重放核对十项、两条声明 FK、18 份证据摘要及当前仅一份不相关 drill 来源差异；未重新执行远测。不扩大为通用 FK/UNIQUE、B/C 领域规则或生产批准。
- writer 九项、readback 十二项、角色十项、历史详情十六项和原 GC 前置/生命周期四十二项实际回执已接收，不重复远测。
- nonce/CA R2 九根/63 条本地事件与准确版本非实现者复审完成，见 [R2 接收](evidence/a-nonce-ca-r2-local-accepted-20261023.json)。它们不自动填齐 27 个 bootstrap 资源槽位。

## 接下来 A 要完成的本地工作

`A-BOOT-CONSUME-01`：按既有 C1 方向消费已提交的 `bootstrap_candidate` receipt/evidence，复查原观察，与 disabled-v1 config/receipt 在同一事务关闭 domain epoch。当前 ConfigBootstrapService 尚未接线。历史 receipt 读取、Execution.RecheckCall 的自管事务，以及拒绝 committed run 的原 CallSnapshot 都不能代替该消费合同。

A2 负责 A 侧资源关联、adapter 方案和拒绝模型；D2 负责 producer 具体消费接点与共同早锁前缀，D1 协调 D 的实现。A1 核对原 OfflineBootstrapGrant 到 admission/candidate/registry/ref/policy/profile 的可信绑定、消费期限与集成边界。先完成准确合同，再实现和验证；不得猜摘要等价、复活执行 handle、新建代用授权或在后层锁中补取前层锁。详见 [接点复审](system-backup-a2-bootstrap-producer-consumption-review-20261026.md)。新普通源码变化须重新通过适用门禁，不能继承本轮字节覆盖。

27 个资源槽位仍须逐项分清本地实现、原受控映射与对应 owner 签收。现场统一计划缺十类输入只证明仓库计划不完整，不证明现场没有材料；实际 provider、B/C 同版本领域事实、grants、TLS/人类 MFA、物理容量和恢复整链仍需原部署事实。

## 尚需实际回执的命令

修复后 drill HTTP 十九项已正式接收，A1 已离线重放实际 intake：native exit 0、1,629 份准确来源与完整用例、namespace/UID、同轮 binary、后检及准确 owner 清理一致，见 [A 限定复核](evidence/a-drill-actual-limited-reviewed-20261026-c5f6a4a2.json)。旧十八项成功/一项失败记录保留。该专项不再要求重跑；它不认证 B 目标、生产资源、物理清理或完整恢复/GC。

当前原专项实际回执只剩 owner 十一项。命令必须匹配已受审的普通依赖；后续 consumer 普通源码增量要先完成新的适用门禁，不能借历史 2099 ready 绕过来源预检。

由有原 SSH 权限的操作者执行；来源预检拒绝即停止，保留脚本打印的本轮来源、原生日志、结果及清理记录。

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'

& .\docs\evidence\a-download-owner-role-retest-20261021.ps1 -Mode Owners
```

远测通过后仍须绑定同轮 source/binary、namespace UID、完整用例与两端清理，并由实际接收器核对；本地 parser 测试或脚本启动成功不能代替实际回执。
