# D 六项原始范围的当前验收审计

【2026-10-16 r61 本轮收尾，按用户要求随后暂停】[完整交接](system-backup-d-round-closeout-20261016-r61.md)记录 r57 两包 439/3,327 和清理 exit 0；r60 绑定相关 19/190 测试通过、原 wrapper 源码枚举 exit 1 保留，r61 同 1,330 来源独立 source-only postcheck/清理 exit 0；r54 完整旧 server 基线 6/12 与 Linux 构建/清理 exit 0，仅覆盖旧来源，当前漂移/新增未获整包接收。5 个专属容器、6 个专属目录均确认不存在。本轮不再有运行中的验证；完整 nonce 原子准入与六项原始范围仍未完成。

【2026-10-16 r56/r57 收据内容推进】[私有 receipt/公共 Operation 内容组件](system-backup-d-download-admission-content-20261016.md)已实现严格闭集 JCS、独立摘要/长度/事实比对；新增 4 主/80 含子项通过。r56 完整门禁因既有发布夹具的陈旧 SQL 时钟失败，exit 1 并清理，未接收为整包通过；仅修复测试夹具在新 claim 前的采样时刻并增加六秒慢设置回归，r57 正在复验。原 server r54 仍执行；完整预锁、持久 receipt/operation/nonce 原子准入及原六项范围继续未完成。

【2026-10-16 r55 审计远测已接收】[D 限定复核](evidence/system-backup-d-download-audit-remote-review-20261016-r55.json)重算 A 原回执和日志/来源摘要，17 项核对通过：四项实际审计 SQL 及 root、95 文件 replay、1,314 来源、准确载荷 pin、四份 user/audit 与原 namespace UID/两端清理、exit 0 齐全。D 另只读确认准确本地 owner/container 已不存在。本专项无需重跑，下方“审计四项待远测”仅为历史状态；完整前置锁、operation/receipt/nonce 原子提交、生产 grants 和正式评审仍未完成。原 server r54 完整复验仍在编译，本次不计为通过。

【2026-10-16 r50/r51/r53 当前状态】[D 审计 ID/原行锚点候选](system-backup-d-download-admission-audit-20261016.md)已通过 434 主/3,246 含子项的两个完整包，以及 seed/专属 Linux 探针编译；新四项真实 SQL 尚待操作者。前端现有依赖已到位，D 的 [240 来源完整 TypeScript/Vite 构建](evidence/system-backup-d-frontend-build-20261016-r51.json)和产物清理通过；[接收复核](evidence/system-backup-d-frontend-receipt-review-20261016-r53.json)另记录已有 53 项隔离组件浏览器回执、其中 20 项保存 DOM、五语言/桌面/375px 图片及准确临时路径缺席，未把 53 项记作 D 本次独立重跑或真实业务联调。下方旧“缺前端依赖/完整构建未过”不再是当前阻塞。六项整体仍未完成，真实授权/容量/卷、历史输入和正式共享评审继续待完成。

【2026-10-16 r46】[健康七项实际 MySQL 已由 D 接收](system-backup-d-control-health-mysql-handoff-20261016.md)：1,302 来源、214 重点 pin、95 文件 replay、七项/root、准确 UID 与两端清理、exit 0 均已核对，关闭这一专项待测。下方旧记录不再代表健康 SQL 当前状态；生产 schema/grants/main、真实授权/容量/审计卷、历史升级及前端完整验收仍未被此夹具专项覆盖，六项整体未完成。

【2026-10-16 r42】[A 配置 proof 十五项实际 MySQL 已由 D 接收](system-backup-d-a-config-proof-review-20261016.md)，是当前 95 文件 fresh-catalog 原冻结轮，非 D 新健康七项、writer、081/082 或生产回填。原六项继续未完成；健康 SQL/现场身份与容量/审计卷/历史输入/前端依赖及正式 A/B/C 评审缺口均未因这份回执消失。

【2026-10-16 r41】[D 健康控制循环/SQL 探针交接](system-backup-d-control-health-mysql-handoff-20261016.md)的本地冻结、198/483 完整检查、两种 seed、Linux 编译及清理已通过；新七项真实 MySQL 未执行，main/schema 未启用。A 081/082 的 11 份输入已[限定接收](system-backup-d-a-migration-review-20261016.md)，现有 config 的正式策略要求 A/B/C，正式共享 schema 晋升仍有 B/C 依赖；不把 A/D 候选完成视为整体批准。原六项及真实 A/部署/历史/前端材料缺口继续保留。

【2026-10-16 r40 不依赖 B/C 的增量】[推进记录](system-backup-d-independent-work-20261016.md)补 Operation 独立列表/详情、严格 HTTP query 解析、D 自有健康存储/同事务读取候选和审计管理 UID/GID 预检；Linux 初始化器八项全部通过，新增健康 schema 尚未安装/生产启用。A 八项实际 MySQL 已由 [D 独立复核](evidence/system-backup-d-a-authority-review-20261016-r40.json)按原冻结轮接收，不再列为待执行。当前合并目录已为 95 文件/100 inventory 对象，inventory exit 0；strict 合同 exit 1，40 policy/60 交叉评审及原四份 missing/现场 schema 仍缺。下文 r36/r39 的 94 文件、39 policy 和“八项待测”只作历史快照；新候选不由旧回执背书。完整前端构建因本地缺 tsc 未通过，真实授权/原文/独立物理审计卷、历史输入和生产接线仍待完成。

【2026-10-16 r39 更新】[七项私有服务实际 MySQL](evidence/system-backup-d-canonical-backfill-service-mysql-accepted-20261016.json)已按同轮来源、逐项结果及清理限定接收，授权/容量仍为 synthetic，A 八项具体组合层及生产输入仍缺。用户[中文桌面示例截图](evidence/system-backup-d-preview-screenshot-review-20261016.json)验证主要布局；按钮间距已修正，完整构建、改后渲染和真实端到端尚未验证。下文旧回执保持历史范围，不能据这些新增子项关闭六项整体目标。

【r37 后续修复】[独立记录视图](system-backup-d-live-records-review-20261015.md)已解除本审计发现的 overview-first 前端阻断：总览未就绪时，配置及列表按实际可用性显示。180 项 Node 检查通过；未执行完整前端构建/浏览器验收。下文 r36 为当时快照，完整总览/详情/活动的后台 Owner 来源及六项整体缺口继续保留。

本页继续保留最初六项工作，不将近期配置、授权或页面子项作为整体完成。[r36 机器审计](evidence/system-backup-d-goal-readiness-audit-20261015-r36.json)仅记录当时代码及门禁；当前以本页最新接收和下列原始日志为准。D 本轮使用已有依赖完成前端构建，没有安装依赖、执行 SSH 或改写 registry/正式 migration。

## 当前门禁

- r53 `system-backup-schema-inventory.mjs --check` native exit 0：100 个现有对象，99 个 migration 对象，无未归属、runtime CREATE/ALTER 或缺迁移。计划的三张 C catalog 表仍不在清单，不能证明完整 schema。
- r53 `system-backup-contract-check.mjs --check --strict` native exit 1：40 项 policy、60 项交叉评审未完成，34 draft/4 missing，现场 schema evidence 未就绪。四份 missing 仍是 recovery_catalog_records、restore_target、status_relay、catalog_scan_record。未写入任何批准状态。
- 正式 catalog 为 95 文件，SHA `2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237`。r36/r39 的 94 文件仅作原冻结历史范围，不能替代当前 catalog 评审。

当前原始输出见 [inventory](evidence/system-backup-d-inventory-current-20261016-r53.txt)、[strict contract](evidence/system-backup-d-contract-current-20261016-r53.txt)与[退出码/来源摘要](evidence/system-backup-d-static-gates-20261016-r53.json)。包装命令正常结束不改变 strict 的实际 exit 1。

## 六项范围逐项结论

| 原始范围 | 当前已有的限定证据 | 仍未完成/未证明 | 后续动作 |
| --- | --- | --- | --- |
| canonical 正式迁移与索引取舍 | writer、收据存储、六轮 synthetic 索引、七项私有服务、A 八项 authority 和十五项 proof 的实际 MySQL 均有各自限定回执 | 原 canonical 文件、安装写/观察授权、真实 target/物理容量/保留适配、受审正式 081/082、代表性生产负载/索引决定 | 已接收专项不重跑；按真实材料完成生产装配与正式 A/B/C 评审 |
| 完整总览与四类详情 | SQL 配置、四类列表、Operation 独立入口与若干控制/执行/promotion 组件；D 健康七项真实 MySQL 已接收 | 当前 Owner 健康、writer/backlog/domain 权威与完整公共组合；生产 health schema/grants/main 尚未启用；总览/详情/活动仍有 unavailable | 按真实 Owner 组合完整读源；已接线记录保持独立，不能用内部健康候选或示例数据填完整总览 |
| A 规范化与 D 恢复编排 | A 十五表隔离 MySQL 已通过，详见下节 | B 真实 dump/target/clock/fence/事务 writer，D 生产调用、live schema freeze 和集成大冒烟 | 旧 BusinessRestoreOnly 不再请求；需要实际 B proof/writer 后接入 D 原事务 |
| 恢复管理生产入口/审计存储 | 既有限定 authority/journal、PVC/PV 预检候选 | 真实管理 mTLS/上级授权、独立物理审计卷和预留容量、单写者接管及 I/O 故障证据 | 使用受审部署/卷/容量和认证适配；不将本地预检或内存容量当现场证明 |
| 实际历史升级与激活 | 当前 95 文件 fresh replay、synthetic history 及历史只读结果；旧 94 文件专项维持其原范围 | 实际旧 SQL/ledger、新 catalog review、现场升级/部署、本人 MFA 与激活事务证据 | 保留旧 review pin；fresh replay 不替代实际历史，不能只换 hash 扩大旧批准 |
| 前端与真实端到端 | r51 完整 TypeScript/Vite 构建、240 来源 postcheck 和清理；已有 53 项本地隔离组件浏览器回执及五语言/桌面/375px 图片 | 接收的 53 项未由 D 本次全部独立重跑，其中 20 项有 DOM；真实业务读取与 B→A→C→D、四矩阵/大数据仍未证明 | 构建缺依赖已解除，不重复安装；复用限定组件回执，继续验证真实 backend/授权与完整部署矩阵 |

## 校正 A 十五表的旧待办

[A 十五表隔离 MySQL 回执](evidence/a-business-restore-mysql-accepted-sbk-mig-261014083514-40ca.json)已经存在。本轮重新核对其原日志 SHA，45 项 A 来源当前无漂移。它覆盖完整列 roundtrip/rollback、正式 FK/collation 拒绝、SELECT-only/NULL mismatch/最终 proof 回滚、NULL/decimal 保留及 users=1001、quotas=1001 的有界量场景。准确 namespace/UID 和两端清理在该回执中报告。

这些 source/target proof 和 writer 仍是 synthetic test fixtures，不是 B 的生产实现。当前非测试 backend 搜索只找到 `NormalizeBusinessForRestore` 的声明，以及 Batch proof 的接口/内部调用，没有找到 D 生产调用或 B 的这两个具体 proof 方法。因此原六项表中的“跑 BusinessRestoreOnly”旧建议已经过期；真实生产接线缺口仍保留。本轮没有重新执行该远测。

## 当前真实页面的具体限制

`backend/cmd/server/system_backup_read_live.go` 已接入 active config、配置历史/单版本、四类任务列表与 Operation 列表/详情；总览、四类详情、任务 events/logs 和 catalog/prune/promotion 仍直接注册为 `503 not_ready`。

前端已分离总览与已接线记录：总览 503 时仍可读取当前配置、版本历史、四类列表和 Operation，独立资源按实际可用性显示。这一 r37/r40 修复和 r51 完整构建解除旧 overview-first/缺 tsc 阻断；仍缺 Owner 的总览、详情/活动来源继续显式 unavailable。示例模式及本地 API 夹具都不能证明当前安装的数据、授权或生产后端已经就绪。

已接线记录继续保持当前配置/安装、分页、取消与迟到结果核对；内部健康候选不自动变成公共 overview。新审计 ID 候选可继续服务完整 nonce 准入，但前置锁、原子 operation/receipt/nonce、真实容量、受审 schema/grants 和 A 运行材料尚未齐全。

## 历史：r38 授权探针的原等待范围

本节是历史快照；A 八项 authority 已于 r40、十五项 proof 已于 r42 接收实际 MySQL，健康七项已于 r46 接收，不再等待或重跑这些旧 root。新待测是 r50 准备的独立审计四项及其后完整准入/真实部署的相应范围。

【r38 更新】A 的最终本地准备回执已交付，[D 独立接收](system-backup-d-a-authority-preparation-review-20261015.md)逐项核对 1,265 文件及完整输入集合无漂移、原日志/清单摘要、230 主测试/1,525 子测试、三次各 3/22 seed，以及 69 本地路径当前不存在。D 的前置拒绝日志修正已进入 tagged 编译。只接收本地准备，八项实际 MySQL 执行仍为 0；未重跑 Go 或发消息给其他对话。

这不是实际 MySQL，也不是旧 generic admission 七组的替代回执。操作者 16:33 服务日志已于 17:23:39 中断，没有实际 SQL root、namespace 或远端退出/清理证明；本地 69 路径不存在，远端候选 scratch 状态未知。不将日志终止当作远端清理，也不继续按活进程等待。未执行 SSH 或自动重启。六项整体目标继续 active、未完成。
