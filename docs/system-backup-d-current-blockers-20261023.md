# D 当前依赖交接与完整范围审计

16:59 D1自有Windows轮已完成最终1,727份来源后检并准确删除`7cff4860…`源码／tmp／binary／telemetry，原生清理exit0，见`evidence/d1-joint-windows-cleaned-20261027.json`。Root另有c6自有收尾窗口，其状态和清理由Root回执单独确认；本记录没有触碰该目录或把其未完成阶段记通过。

【2026-10-27 16:54 当前状态，优先于下方历史记录】用户 GC 尝试 `5c1c5145…` 在 standalone FullCollect seed 因 checkout canonical vectors 缺失而失败，远测未启动，receiver 拒绝正确；原失败保持。只改 tagged cold fixture 后，同一 Windows binary 在源码目录与真正空目录执行三个 seed，3＋3 全通过，未补 docs、未放宽接收器，独立产物已清理。准确证据及有来源前置检查的重试命令见 [GC standalone 修复与重试](system-backup-d-gc-detached-seed-fix-20261027.md)。当前 GC 候选 r5 绑定 original1,720／`dc79d81f…`、operator1,721／`f3ed3894…`，正式参数为 `evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r4.json`；下方 `6bf973bd…`／A r3 均为历史版本，不可用于修复后的重试。若新的联合候选随后落地，须重新准确复审后再运行。

D1 已从原安装配置、锁表原始起点及冻结预算实现 gate 四指标 SQL 投影与正式 controller 入口装配候选；Root 补齐 durable cleanup 时钟／reader／recorder 候选。联合私有来源为1,727份／`fd71b0af…`。实际 Windows 完整回归 controller155根／284条 PASS、cleanup14根／60条 PASS，无失败或跳过，来源后检通过；独立记录见 `evidence/d1-joint-windows-reviewed-20261027.json`。16:54 Linux及正式入口编译由Root继续，尚不能记通过，候选也不等于 live promotion 或生产 schema／grants 已完成。不得再把这些已实现的本地工作全部归给外部依赖。

人类 Owners 本轮 `a-download-owners-mysql-remote-20261027-160458-2bce7205.txt` 已实际11项通过并终态清理，A负责准确接收；上一轮10／11及MySQL1845失败保留。新的原材料22、入口22、GC33／7／15实际SQL与PromQL231仍待各自原始证据，完整D六项及B/C／现场要求未关闭。不安装依赖，只删除已经终态的准确自有测试／构建目录。

## 历史冻结记录（来源与结论只适用于原轮）

【此前GC正式版本】A 的 `evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r3.json` 曾接收 r4 待审包，绑定 original1,720／`6bf973bd…` 与 operator1,721／`46bcb275…`，见 `evidence/d1-gc-operator-current-formal-replay-20261027-r3.json`。该版本现已由顶部D r5／A r4取代，不再用作当前重试参数。下方旧来源、计数、待审／通过均保留历史范围。

【当前完整输入1720】metrics 八文件已准确落地，D1 独立核对普通 1,718 份 `7c428878…`，另两份用户请求的 PromQL 工具准备/测试脚本经 A 独立 source/mock 复审后，完整输入固定为 1,720 份 `6bf973bd…`。D1 实际重放支持源码复审及 owner 基线登记均 exit 0，并独立生成/重放 `evidence/d1-current-final-source-reviewed-20261027.json`：完整 path/size/hash 一致，普通 owner 703 根／5,530 条、旧5,190条记录保留，25项Node及131项合成接收器检查的范围准确，original snapshot preflight ready。原1718当前匹配失败及GC r3漂移拒绝保留在 `evidence/d1-final-source-drift-observed-20261027.json`，不改绿。GC r4 source-only 精确核对已 exit 0，original1720／`6bf973bd…`、operator1721／`46bcb275…`；待 A 新正式 operator source 回执完成最后核对。真实 SQL、PromQL、可信 collector/自动清理起点、27 bootstrap槽、B/C及现场缺口均未据此关闭。下方较早“八文件候选未落地/1718为完整当前源”的记录保持历史范围。

【当前准确 GC source 复审】A 正式文件 `evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r1.json` 已接受 original `4003…`／operator `44a3…`，D1 实际只读重放 exit 0，见 `evidence/d1-gc-operator-formal-replay-20261027.json`；operator/Go/SSH/SQL 均未启动。Root 私有 metrics 候选仍在验证，落地后须刷新 GC source candidate 及 A review。该准确 source 批准不批准未来字节，也不替代完整 metrics/collector/现场或实际 SQL。下段 formal review pending 是此前状态。

【2026-10-27 十五阶段终态】Root `2d061b75…` 已完成并清理，D1 独立 reviewer 实际生成及 `--check` 均 exit 0，见 `evidence/d1-current-fifteen-stage-reviewed-20261027-2d061.json`。当前 1,718 份／`4003f0f0…` 与普通八阶段字节及集合一致；十五项准确命令、原生日志及单次 attempt 已核对，十三项 exit 0，最后两个反例仅以指定 unsafe-commit 断言 exit 1 接收。GC 三 seed、资源/HTTP/admin/owner seed、空目录执行、standalone 和 Linux 编译均在限定范围内通过，来源后检及准确 owner/binary 缺席已核对；已删除二进制不声称事后重读，Linux evidence 的 `-vet=off` 保留。原 ae7 失败不改，也不补其缺失末检。整体仍待 metrics 九处表达式及签名告警去重本地修复、准确增量验证和 A 的 GC r2 operator 正式复审；不能将这些 A/D 本地缺口归给 B/C。真实新 SQL 及 B/C/现场缺口仍独立待验。下段十五阶段“运行中”为此前观察。

【2026-10-27 当前终态与剩余门禁】d846的准确旧1,741份来源、Linux四项、前后检及清理已独立接收，原ae7失败保留，未补写其原末次后检。A2 b53的真实材料seed/TLS2、Linux六项、Windows五包347条通过事件组合及两文件promotion均已完成。Root01cb当前1,718份输入／`4003f0f0…` 的普通八阶段现已全部原生exit 0：六个完整包974根／8,256条通过事件、三个准确bootstrap seed、两个Linux ELF程序、阶段及最终来源后检、产物清理均齐全，原owner独立缺席。D1独立生成及 `--check` 均exit 0，见 `evidence/d1-current-ordinary-eight-stage-reviewed-20261027-01cb.json`。A的严格source scope登记及独立CLI重放已完成；Root十五阶段新轮2d061b75…实际运行，首GC三seed仍在编译。原350轮因artifact路径参数格式在Go前拒绝，0stage/0Go且owner已清理，失败保留。新十五阶段未完成，不能将八阶段接收提升为当前整树基线或实际SQL通过。GC r2 operator仅完成互斥参数前缀修正和源码核对，正式operator/native/global复核仍待闭合；剩余B/C、实际SQL和现场缺口继续独立待验。此前Linux/parser具体回执见 `evidence/d1-bootstrap-entry-linux-reviewed-20261027-d846.json`、`evidence/d1-a2-reference-capability-composed-reviewed-20261027-b53.json`、`evidence/d1-parser-promotion-observed-20261027-b53.json`。

【2026-10-27 原生复核】inventory / contract strict 重新执行均 exit 1，结果分别见 `evidence/d-local-final-schema-inventory-20261027.json` 与 `evidence/d-local-final-contract-check-20261027.json`。仍缺三张 catalog 表、四份合同、40 项 Policy、60 项交叉签收及现场 schema hash。新bootstrap联合轮ae7的十包/四seed已观察通过，但Linux server因磁盘不足失败、原最终source postcheck未执行，原产物已清理，不能登记原轮整体通过；独立失败回执见 `evidence/d-bootstrap-entry-native-rejected-20261027-ae7.json`，后续准确Linux补验按上段另行接收。消费26和范围锁3已在 `4a5f56e4…` 准确冻结来源实际通过，D1 今日重新核对原回执、全部原 artifact 哈希、操作者原日志/用户附件、迁移及清理均一致，见 `evidence/d1-bootstrap-actual-frozen-resume-verified-20261027.json`，这29项不因新联合轮失败而重跑。原材料22/入口22、GC33+7及新增生命周期15仍是各自实际SQL待验范围；历史29项不批准随后entry/API/parser新源码，也不表示完整生产GC/恢复完成。

【2026-10-26 当前入口】准确 GC 实现、23项冻结原生验证、演练 tagged 修复及 A owner 本地最终签收已完成，原测试/构建产物已清理；修复后实际演练十九项由另一路限定接收。阶段来源为原2099，随后新增的 bootstrap candidate 消费代码仍须完成接线、测试和独立复核。准确边界见 [10月26日本地收尾](system-backup-d-local-closeout-20261026.md)。以下原轮次记录保持历史含义。

【readback 当前状态更正】[协调回执](evidence/d-readback-coordination-20261023.json)已正式限定接收[原十二项实际 readback](evidence/d-resources-readback-actual-accepted-20261023.json)，含同源 71 根/843 条本地补证；无需为下方历史“待跑”文字重跑远测。本聊天没有执行该远测；接收范围仍是隔离库/合成 proof，不含 FK、完整恢复或生产批准。当前资源/演练独立交接见[限定交接](system-backup-d-resources-drill-handoff-20261023.md)，不要与本轮新 GC/六包门禁混为一次验收。

【排除远测的本地收尾】最新范围与同版本回执入口见[本地收尾](system-backup-d-local-closeout-20261023.md)，GC 工作已拆成使用调用者事务的私有阶段，具体装配提案见[GC 交接](system-backup-d-gc-work-handoff-20261023.md)。下文历史计数、旧来源评审和实际专项状态保留原轮次含义；新增实现的本地结果以新机器汇总为准，不据此批准 freeze 生产接线或把远测记为完成。

最终独立交付收尾：[演练十九项 HTTP/MySQL 准备](system-backup-d-drill-detail-20261023.md)已通过本地 read/auth/HTTP/seed、Linux 探针和迁移 runner，七项模拟调度及精确清理已核对，实际十九项未运行。新[完整目标依赖审计](evidence/d-remaining-scope-dependencies-20261023.json)重新执行 native strict inventory/contract，均 exit 1，继续缺三张 catalog 计划表、四份合同、40 policy、60 交叉评审和现场 hash。用户已确认 B/C 未交付；现有九表 writer 与 freeze 均仍是受审前候选，不能从本地准备导出生产接线或整体完成。后续需要 B/C 同版本交付、共同评审及操作者实际 SQL/现场材料；不能用空行/default、私有允许回调或历史接收替代。

后续增量：用户再次确认 B/C 尚未交付并要求继续 D 独立部分。现已补齐[九表共同事务写入候选及实际 MySQL 九项准备](system-backup-d-resources-writer-20261023.md)，以及[演练历史详情真实读取路由与前端](system-backup-d-drill-detail-20261023.md)。演练历史 DTO 按机器合同只展示保存的目标 hash、清理汇总和证据引用，不要求用当前 provider 事实替代历史；该新增入口已完成本地读取/server/前端及 Linux 构建门禁，但实际 HTTP/MySQL 与增量评审未完成。下方原审计中的“其余三类详情”现应区分为已接线、待实际验收的演练历史详情，以及仍缺当前事实的 backup/preflight；logs/manifest/catalog/prune/promotion、完整恢复与 GC 的依赖继续保留。原冻结审计和历史实际回执不扩大背书这些新增源码。

【后续四项独立准备已交接】[独立交付与新远测命令](system-backup-d-independent-work-20261023.md)覆盖五表组合、九表 readback 专项、GC 私有协议和前端浏览器；[限定复核](evidence/d-independent-work-reviewed-20261023.json)保留实际本地用例、同轮来源和清理。默认新十二项 SQL 尚待操作者运行，旧十六/四十二项不重跑。本文下方仍是原完整恢复/GC/六项范围的依赖审计，不表示 D 没有独立准备工作，也不把局部交付提升为整体完成。

2026-10-23。原目标保持：九表规范化及复审、真实恢复/GC 接线与原六项验收，不把局部离线候选改成整体完成。用户已明确 B/C 仍未交付；该依赖在连续多轮交接中保留，本轮再次按现有代码、回执和原生门禁核对。当前下一阶段需要实际 Owner 交付，未代替 B/C 实现其 runner/provider/catalog 或代签批准。

## 已完成的限定交付

- 九表 111 列离线比对、事务内 SQL reader、五表完整列候选（两张审计、egress、image、northbound）及九表/35 控制表单事务只读验收候选已写入。最新完整 resources 包为 63 主/678 条通过事件、default vet，无失败或跳过；准确自有目录及 887 份产物已清理。它们都不是 B/C 生产 proof 或整个恢复资格。
- A 已按准确冻结来源接收旧 reader、双审计、egress、northbound 候选/合成测试的相应边界；最新 northbound 原复核 exit 0。Image 的 B 领域评审及新增 readback 的 A/B 评审仍未齐；正式 registry 批准未写入。
- 历史详情十六项与 GC 前置/连接生命周期四十二项实际 MySQL 已按原来源接收；不重跑，也不将它们拼接成完整恢复或完整 GC 已通过。

## 本轮原生门禁

[机器审计](evidence/d-current-scope-audit-20261023.json)及[复核程序](evidence/d-current-scope-audit-20261023.mjs)绑定 1,588 份输入，原生命令前后集合与字节一致。未构建、测试、安装依赖或连接远端。首个 Node 子进程派发被环境 EPERM 拒绝，原失败另存；改用工具原生调用相同只读命令后完成，并保存各命令的真实退出码，外层脚本 exit 0 不覆盖原生 strict exit 1。

| 命令 | 原生退出 | 结论 |
| --- | --- | --- |
| inventory --check | 0 | 100 个现有对象、99 个 migration 对象、当前已登记对象无缺 migration/归属/runtime DDL；不证明完整计划 schema。 |
| inventory --check --strict | 1 | system_backup_catalog_imports、system_backup_catalog_records、system_backup_catalog_scan_states 三张计划表仍缺。 |
| contract --check --strict | 1 | 40 项 policy、60 项交叉评审、34 draft、4 missing 及现场 schema-hash 未完成；catalog 96 份。 |
| 最新 D readback 回执 --check | 0 | 仅接收原 63 主/678 条合成 driver/proof 及来源/准确清理。 |
| A northbound 原回执 --check | 0 | 原 57 主/602 条及私有关闭候选接收，非 B target facts/启动门禁/生产批准。 |

四份缺失合同为 recovery_catalog_records、restore_target、status_relay、catalog_scan_record。普通 inventory 通过不替代 strict；A 对局部候选的意见也不自动改写上述正式 policy/cross-review。

## 必须取得的下一批交付

| 负责人 | 必须交付的准确内容 | D 收到后的动作 |
| --- | --- | --- |
| B | 同版本逐表意见；九表来源/目标 proof、dump/checkpoint/schema/cutoff、typed 映射/目标占用、时钟/fence、同事务 writer、实际 SELECT-only 身份及写凭据销毁、完整 schema/DDL freeze；镜像逻辑等价性/非敏感名称/可用镜像、北向端口/规格/类型/SQL JSON 投影/准确版本、网络完整允许/禁止策略与持久启动门禁。 | 逐项认证合同/原始证据、实现受审适配桥接，再运行实际写入/回滚/CAS/读回/启动故障实验。 |
| C | security_scan_configs/jobs/job_items/reports 的同版本领域决定：空配置/基数、analyzer/timeout/当前能力、父子状态/统计/时间、中断转换、skill/result/版本/风险/缓存语义、非敏感名称及闭集脱敏 report schema；provider/catalog/当前 freshness 与四份缺失合同中的本域交付。 | 按 C 确定规则完成余四表，组合九表完整候选和实际 artifact/read/preflight 链，不能自行猜 schema 或用历史 valid 替代当前事实。 |
| A/B 与 D 共同评审 | 新 readback 三 proof 的实际绑定/最后权限/事务结束合同；GC 精确权限、BACKUP_ADMIN 的准入与 lock order、完整 metadata/freeze 协议、物理容量和失败接管/清理。 | 对准确版本增量评审；批准方案和实际适配到齐后接 wire、执行完整 GC，保留旧专项范围。 |
| 有权限操作者 | 受审安装/历史 canonical SQL 与 ledger、实际管理 mTLS/上级授权/本人 MFA、原 grants、独立物理审计卷/容量/单写者与故障证据、四套真实部署。 | 在真实配置与权限下按原六项逐项验收，保留同轮源码/二进制/日志/退出与准确清理；不把模板或合成 allowlist 当作许可。 |

当前 GC grants 实现在 `download_retention_gc_early.go` 对全局权限只接受 REFERENCES，明确拒绝其他全局权限；BACKUP_ADMIN 只出现在合成前置实验的临时账户。连接 owner 已存在并通过实际生命周期实验，但尚无获批 freeze adapter/完整 Policy，不能仅把 LOCK SQL 塞入现有 Early 就形成可用生产协议。还需解决 acquisition 与已存在锁前缀的顺序、metadata observation 开始前的冻结、准确权限/实际可见性、完整 Collect 与容量/引用守卫的同轮证明。

## 原六项保持未完成

| 原始范围 | 当前不能完成的必要条件 |
| --- | --- |
| canonical 迁移与索引 | 受审实际历史/schema/grants、真实数据量/物理容量和生产负载证据。 |
| 完整总览与四类详情 | B/C 当前权威事实、其余三类详情/总览与 logs/manifest/catalog/prune/promotion 实际读源及部署。十六项历史详情已接收，旧表格“待跑”不得重复执行。 |
| A 规范化与 D 恢复编排 | 四张 C 扫描表规则、九表真实 proof/共同 writer/读回/DDL freeze/启动验收及完整大冒烟。 |
| 恢复管理与审计存储 | 真实 mTLS/上级授权、物理审计卷/容量和单写者/I/O 故障现场证明。 |
| 历史升级与激活 | 原始 ledger/SQL、受审安装授权、本人 MFA 与激活事务。 |
| 真实前端 E2E/四矩阵 | 真实 backend/Owner/授权装配、B→A→C→D 整链和四部署/规模测量。 |

下一阶段等待以上实际交付；目标未完成。恢复时先重新核对本审计与新交付的来源版本，不能沿用旧私有组件接收批准新代码。没有向其他聊天发送消息，也没有创建定时监控或代用授权。
