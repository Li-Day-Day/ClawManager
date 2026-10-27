# A 剩余工作执行记录

【2026-10-26 drill 终态增补】修复后 drill 十九项实际回执已由唯一 D 接收并经 A1 准确离线重放退出零，见 [限定复核](evidence/a-drill-actual-limited-reviewed-20261026-c5f6a4a2.json)。不再重跑 drill。当前仅 owner 十一项原专项实际待验；新的 bootstrap consumer 普通源码会另做适用来源/门禁，既有 2099/actual19 只保留原准确范围。A2 负责关系 helper，不新增重复的 A1 config hash 导出；D2 producer 消费/单调采样，A1 service 事务接线，D1 独立核验。

【2026-10-26 当前状态】当前 owner 本地 647 根/5,190 条原生事件、23 项依赖匹配门禁、两个位置各 13 seed、当前 tagged drill 独立增量及准确清理已正式接收，基线登记与鲜枚举原预检 ready2099 完成；15 项注册和 67 项实际 parser 回归通过，A2 已独立复核。FK 十项实际 MySQL 已接收，不再列远测。当前实际回执仅余 owner 十一项及 D 已启动的修复后 drill 十九项，勿重复启动。`A-BOOT-CONSUME-01` 是明确本地合同/实现缺口：原 offline grant 到已提交 candidate 的可信关联、共同早锁、原观察及期限、同事务 config/epoch 关闭仍须完成，不能把 27 槽位一概视为外部等待，也不能宣称全本地工作已完成。完整现状与命令见 [最新交接](system-backup-a-local-completion-20261023.md)。下方旧状态保留历史含义。

【2026-10-23 当前状态入口】下方保留各轮历史范围，不能将旧 ready、暂停或运行中说明作为当前结论。准确现状统一见 [本地收尾与远测交接](system-backup-a-local-completion-20261023.md) 和 [本轮机器进度](evidence/a-all-local-work-progress-20261023.json)。readback 十二项及 writer 九项实际回执已接收，不重复远测；待远测为 owner 十一项、FK 十项和 drill HTTP 十九项。当前 owner 新完整包通过后仍需补齐原种子/探针、独立接收和基线登记；全部当前门禁完成前不宣布 ready。nonce/CA R2 的九根/63 条本地事件及准确非实现者复审已完成，生产资源、共同 GC 和 B/C 事实保持独立待验。

【2026-10-23 writer 外键本地修复完成】[修复记录](system-backup-a-writer-fk-repair-20261023.md)将旧任务父行删除延后到保留子行改挂之后；保存旧 Go 源码的四个反例失败，修复后完整普通包 71 根/843 条通过事件，旧 826 条逐名保留，新增三根/17 条，十个失败分支均回滚。43 份输入的冻结/当前集合及字节、默认 vet、退出 0 和准确 owner 删除已独立核对，未安装依赖。仅修复两条声明的 scan job FK；实际 MySQL、通用 FK/UNIQUE、B/C 规则和物理容量的父行重叠仍待验证。当前 owner 来源预检因新/并行普通代码变化返回 not_ready；旧 ready 仅保留历史范围，不改写基线、不启动远端。


【2026-10-23 本地独立复审继续】本轮新增本地工作已交付：[事务 writer 增量复审](system-backup-a-resources-writer-review-20261023.md)核对 68 根/826 条通过事件及 39 份来源，并用内存模型发现保留子记录改挂父记录时的 FK 级联边界；需要明确 Candidate 策略或修订排程，再补真实 FK 回归。[GC 复审](system-backup-a-gc-freeze-review-20261023.md)已补权限 profile、全局锁位置、唯一事务、未知提交/释放及原时限约束。下一项本地优先工作是关闭该 writer 边界并复审同版本修订；GC 共同方案、B/C 规则和现场实际验收仍待交付。


【2026-10-23 11:52 门禁收尾，用户暂时仅本地】新增 GC 后的原完整 owner 门禁已[独立接收](evidence/a-owner-gc-full-accepted-20261023.json)：636 根/5,138 条通过事件、原 5,105 条逐名保留、两位置各 13 项 seed、Linux 探针/迁移构建、默认 vet、来源后检、退出 0 和准确清理齐全。Windows/Linux tagged owner 与 migration 的依赖图均排除 resources；[r3 来源组合](evidence/a-owner-gc-dependency-accepted-20261023-r3.json)仅登记准确非依赖变化，不批准 resources。两新来源已登记，当前预检 ready；接收器 13 项回归全部通过，包括新 GC 字节变化拒绝、旧基线保留和两版完整本地日志不得写成实际 SQL 验收。未安装依赖。用户选择“暂时只推进本地工作”，不再启动远端步骤；[最新本地回执](evidence/a-download-live-readiness-20261023-r2.json)保留 owner 十一项、生产身份、真实登录/MFA/provider/下载/审计未验，以及十类现场输入缺项。下面旧“仍需新 GC 门禁”的描述保留历史含义，以本段为准。

【2026-10-23 当前状态更正】最新完整 owner 本地门禁已[独立接收](evidence/a-owner-current-full-accepted-20261023.json)：632 根/5,105 条通过事件，原 5,102 条逐名保留，两位置各 13 项 seed、Linux 探针/迁移构建、默认 vet、冻结后检、退出 0 和准确产物清理齐全。下载时钟夹具修复已验证，生产期限未改。后来新增的 GC freeze 普通代码/测试属于 owner 依赖，当前源预检仍准确拒绝，不能借 resources 元数据适配绕过。空连接器边界正在定向验证；新 GC 输入仍需完整门禁覆盖，owner 十一项实际 SQL 尚未接收。

[只读 readback 组合复审](system-backup-a-resources-readback-review-20261023.md)已完成，限原冻结版本 63 根/678 条合成通过事件；不认证新五表组合或真实 MySQL、B/C proof。现场材料按用户“不知道”记为尚未核实，十类本地计划缺项与 27 项真实资源准入继续保留。下文旧“运行中”“未准备”及暂停描述仅为历史记录，以本段和机器进度为准。


【2026-10-23 egress/北向离线候选复审完成】A [egress 接收](evidence/a-resources-egress-reviewed-20261023.json)核对 169 请求/27 冻结输入、49 根/453 条通过事件及旧 421 条保留；A [北向接收](evidence/a-resources-northbound-reviewed-20261023.json)核对 181 请求/31 冻结输入、57 根/602 条通过事件及旧 489 条保留，23 项范围与当前服务/SQL 上限相交，准确 owner 清理均匹配。A 当前四张表（双审计、egress、北向）具备已审离线候选；B 的镜像领域不由 A 代签，扫描配置/任务及 report 仍需 C 领域输入。北向 api_enabled=0 或空候选均不证明真实启动安全，当前 runtime fallback 可启用 API，B/D 仍须完成持久门禁和缺行/旧缓存/nil provider/失败/环境/重启验收。所有接收限对应冻结字节与合成测试，不改写正式 registry 或生产批准。

【2026-10-23 09:40 两轮退出/清理已独立核对，最新完整门禁继续】[分范围接收](evidence/a-owner-local-preparation-reviewed-20261023.json)确认原 owner `085715` 完整 security/evidence 包保留旧 5,019 条逐名用例，两位置各 13 项 seed、Linux 探针及 pinned migration runner、冻结后检、退出 0 与准确 outer owner 缺席均齐全；它不覆盖后来 runtime/result 夹具修订。最新 `092528` 诊断三根/24 条通过事件、六个 runtime 叶子、冻结字节后检和准确 owner 缺席均通过，四份当前候选字节已封存；未检查整个冻结文件集合，不把诊断当作当前完整 baseline。两个旧失败仍保持失败。

已另用最新源码启动原 DownloadOwnersOnly 完整本地门禁（准确日志与来源路径见机器进度记录的 current_full_gate），未带 Remote；结束后必须独立核对完整用例、seed、Linux 构建、来源/退出和清理，再决定是否登记新 baseline。当前不以两轮拼接代替新完整运行。A 也已 [接收 egress 离线候选](evidence/a-resources-egress-reviewed-20261023.json)：169 份请求/27 份冻结输入、49 根/453 条通过事件、旧 421 条保留与准确清理匹配；目标网络策略真实性、B 评审和启用仍未接收。

【2026-10-23 runtime 首次对照失败保留，独立 result 容量观察候选待验】`a-owner-eof-20261023-091215` 已退出 1 并准确清理，[失败接收记录](evidence/a-runtime-diagnostic-failure-reviewed-20261023.json)保留 fresh/provider-wait 的 result/claim/nonce 断言失败；stale SQL 拒绝及正常 TLS/Transit 下载对照已运行，但该轮不能认定修复成功。原候选文件只记录摘要，未存原字节胶囊，限制保留。推进 SQL 时间后，初始化时的独立 result 容量报告超过原五秒有效期；最新候选通过显式 sampler 在 result 操作前提供新的合成容量观察，不刷新已获得的 reservation 或 admission/material/proof 期限。新增 stale-capacity/provider-wait 对照要求继续拒绝旧报告并进入失败 sink。最新 runtime/共享 result 夹具修订已另启 RuntimeDiagnosticOnly 冻结验证，结果待验；更早原 owner 门禁继续原冻结范围，security 包已通过，不能将其结果继承给最新夹具。

【2026-10-23 新完整包失败已独立保留，runtime 时钟候选继续】`a-owner-eof-20261023-084028` 已实际退出 1：[独立失败回执](evidence/a-runtime-full-failure-reviewed-20261023.json)核对 EOF 两根/15 叶子通过、producer 784 条通过事件及父包通过，evidence 3,089 条通过事件但 atomic runtime 的 success 叶子/根/父包失败；准确 owner 已独立确认删除。原 script 未提供冻结后检，此限制保留，不接收新 baseline。该叶子耗时 6.38 秒，返回 503、provider 请求 4 次、Transit login/decrypt 为 0；旧 legacy runtime 夹具会推进 SQL 时间，atomic 夹具仍固定初始时间，SQL 新鲜度是单列待验证机制，不改判历史失败。

当前 `download_runtime_test.go` 候选仅在 admission 已提交之后推进模拟 SQL 时间，并在请求入场前验证同一原 proof；不刷新签名、材料或 owner/保留期限。新增 provider 等待跨过五秒后的 stale/fresh 对照，明确旧时钟须拒绝、实时样本须走原 TLS 链；等待时间使用原子值传递，检查 proof/期限不变。`a-owner-eof-20261023-091215.txt` 的诊断源在这次 commit guard/原子值细化前已经冻结，即使通过也不能给最新工作树背书；最新细化仍待新验证。原 owner 门禁 `a-owner-full-local-20261023-085715` 同样仍运行在更早冻结来源，未启动远测，来源边界不得混同。

双审计表的新 [A 独立接收](evidence/a-resources-audit-validated-20261023.json)已核对 158 份请求来源、25 份冻结输入、完整包 46 根/421 条通过事件、29 审计失败路径、旧 388 条逐名保留和准确清理；仅接收离线候选及合成测试，不接收真实 B/C proof、SQL 写入或生产整链。原静态意见中的“验证待回执”保留历史含义。

【2026-10-23 原 owner 门禁与双审计表静态复审】原 `system-backup-d-config-writer-validation.ps1 -DownloadOwnersOnly` 已以独立来源启动，日志 `evidence/a-owner-full-local-20261023-085715.txt`，来源 `evidence/a-owner-full-local-20261023-085715-source.json`；稳定冻结/派发检查通过，未带 Remote，实际包测试、seed、Linux 构建、后检/退出与清理仍须等待完整回执。它与此前 EOF 的 evidence/producer 两包记录分开，不借窄包记录替代 security/evidence 原门禁。A 对 [双审计表候选的静态复审](system-backup-a-resources-audit-review-20261023.md)绑定 D 的 158 份来源完成；完整 resources 新轮测试退出和清理尚未独立接收。B/C proof、九表完整候选和实际 SQL/整链未因此通过。进程活性以原工具 session 检查为准，不根据本段或日志存在推断。

【2026-10-23 SQL reader 增量复审】A 已 [独立接收](system-backup-a-resources-sql-review-20261023.md) D 原 153 份请求来源、23 份冻结输入与准确 owner 清理；原完整 resources 包 42 根/388 条通过事件、16 个 SQL 失败路径及 111 列变异匹配。范围仅私有事务 reader 候选及合成 driver，不认证真实 SQL schema/身份、一致视图、B/C proof 或装配；后来新增审计 normalizer 不继承本轮。原 reader 接收器对完整当前文件集合的拒绝继续保留。owner EOF 本轮 evidence/producer 两包验证不是完整 owner 门禁：后者仍须 security/evidence 原两包、原 seed/脱离 checkout 对照、Linux 探针/迁移构建、冻结后检及清理，不能用 producer 包替代 security 包或直接新增 owner baseline。

【2026-10-23 用户恢复】继续原完整范围。A 已按新的 142 份固定输入完成 [v2 六表及 report 正文复审](system-backup-a-resources-v2-review-20261023.md)，仅接收安全约束，不批准完整 normalizer/writer 或 B/C 领域事实。旧 v2 请求因 D 新增逐字段文件被准确拒绝，原意见不改写。历史详情十六项及 GC 前置/连接生命周期四十二项已由 [A 离线复核](evidence/a-d-actual-receipts-reviewed-20261023.json)：历史详情仅本轮 EOF 测试文件需从 Git 找回原摘要对应字节，全部原断言与原准确 owner 缺席检查保留，历史副本已清理；不能扩展为当前整树通过。两项不再要求重复远测，完整 GC/freeze 和恢复整链仍待完成。此前暂停/待验描述保留历史含义。

owner EOF 夹具正在验证：入场前重新采样模拟 SQL 时间，保持同一签名 proof 和原期限；增加无需 sleep 的 stale/fresh 对照以检验原生产五秒检查。以本轮实际日志/退出/清理为准，在验证结束前不宣称根因已关闭或新 owner baseline 已接收。27 项资源准入和现场真实材料继续待完成。

用户本轮对现场材料答复“**不知道**”，不再将旧“未准备”当作当前确定事实。原计划的 [2026-10-23 本地预检](evidence/a-field-plan-preflight-20261023.json)实际返回 PLAN_INCOMPLETE / exit 2，仍缺十类输入，cluster_contacted/database_contacted 均 false；它证明仓库计划不完整，不证明现场没有材料。复用原统一采集入口，在有权限操作者确认实际受控引用、受审镜像和连接后才能补全计划；不猜测身份或创建代用授权。

【2026-10-23 08:46 定向验证通过，完整包继续】[新原始日志](evidence/a-owner-eof-20261023-084028.txt)中两个定向根测试、15 个叶子通过：原 13 个 body 场景全部保留，新增 stale/fresh 分别 403/206，原 proof/期限不变。首轮新增 stale 断言错误地要求 admission 未发生，实际 admission 后 authority 拒绝 provider 读取；该失败和准确清理保留在 `a-owner-eof-20261023-083200.*`，修订断言后新轮通过。同一冻结来源的 evidence/producer 两完整包仍运行，结束后由 finally 清理自有源码/缓存/构建目录；不从本进度文字推断进程状态，不提前接收 owner baseline。D 后来新增 SQL reader 两文件，A 的原 142 份来源均未变，当前包集合检查准确拒绝，见 [漂移记录](evidence/a-resources-v2-current-drift-20261023.json)；新 reader 未继承 A 旧评审。

目标：执行本对话列出的全部剩余工作，保持原验收范围。对应机器进度为 `docs/evidence/a-remaining-work-execution-20261022.json`。进度记录不是批准或测试结果，完成须逐项查验原始证据。

本轮已收尾，按用户“做完这轮后先暂停”暂停后续工作，原范围保持。[收尾记录](evidence/a-round-pause-reviewed-20261022.json)核对 CA 候选本包测试、Linux 构建回执与准确 owner 缺席；未接生产、未代替非实现 owner 评审，27 个资源缺项保持。owner 2700 秒门禁以真实断言失败结束：EOF 场景预期 206、实际 403，evidence 包 735.025 秒后失败，未进入远程 SQL，准确 outer owner 已清理。固定夹具 SQL 时钟与生产五秒新鲜度检查可能有关，但尚未确定根因或修复；恢复后先诊断，不以重试或放宽生产期限关闭失败。

typed 引用层已按三个完整包、29 项现有向量、Linux 构建、374 份输入和清理完成限定接收；真实资源仍未准入。owner 15:33 本地轮的 900 秒框架超时仍保留[原失败独立回执](evidence/a-owner-local-timeout-reviewed-20261022.json)。仅 owner 专项框架预算改为 2700 秒，原全部测试/default vet/生产期限保留，派发回归在 PowerShell 7/5.1 均通过；后续真实断言失败不能归为同一次框架超时。

D 已以独立接收材料确认收到 A 六表“需修改”意见，没有改写原 request 或批准字段。D 后续 typed-nil 修复也已 [由 A 独立复核](evidence/a-d-resources-proof-presence-accepted-20261022.json)：十个旧失败叶子、十二项对照、修复后完整 resources 包 27 根/139 条通过事件、十八份当前输入/文件集合和准确清理均匹配；两份旧运行文件可由单条件反向恢复并匹配原 SHA。该结果仅签收缺失 proof 的拒绝，不改变六表策略结论、不认证真实 B proof 或恢复写入。

历史详情构建修复也已 [独立接收](evidence/a-verification-detail-build-repair-accepted-20261022.json)：原 1,569 份冻结来源、普通/游标测试、SQL seed、Linux 管理/HTTP 探针和迁移程序构建、冻结 postcheck、child exit 0 及准确 outer/观察到的 inner owner 缺席均核对。后来 owner-only 总预算改动可反向恢复并精确匹配原 harness SHA，没有扩大为当前整树通过。实际十六项仍待新远测回执；目录中新增远测日志在未出现完整结束/退出与清理材料前不接收，也不凭空文件判断进程已停止。

六表意见完成后，D 并行修改了 `control_exclusion.go` 和 `verifier.go`，旧来源检查准确拒绝。已从本轮仍持有的准确冻结源码找回原 SHA 对应字节，与其余来源组成 [31 文件历史胶囊](evidence/a-resources-normalization-source-capsule-20261022.json)；原方案、原意见和原回执均不改写。[漂移记录](evidence/a-resources-normalization-current-drift-20261022.json)单列新字节，尚未批准。`node docs/evidence/a-resources-normalization-review-20261022.mjs --check` 检查原评审；加 `--check-current` 才要求当前源码仍完全匹配，当前应拒绝。历史“需修改”不变成新运行代码的通过结论。

| 项目 | 本轮推进 | 尚须完成的原要求 |
| --- | --- | --- |
| D 六表的 A 安全评审 | [逐表意见](system-backup-a-resources-normalization-review-20261022.md)与[源码绑定回执](evidence/a-resources-normalization-review-20261022.json)已交付，六表均为“需修改” | D 修订实现后重新核对；B/C 各自的真实性、映射、能力和意见不由 A 代签 |
| bootstrap 安全资源 | [typed 解码与十五种单用途对应提案](system-backup-a-bootstrap-reference-binding-20261022.md)限定验证已通过；原合同仍为 draft；CA 候选本包及 Linux 构建通过、准确 owner 清理完成 | 具体解析/真实权限/能力、历史保留及跨资源校验；非实现 owner 评审；显式装配。当前 27 个缺项不因格式解码或候选代码减少 |
| owner 十一项实际 SQL | 新完整本地门禁真实断言失败，原日志保留，未进入远程 SQL | 先定位并修复 EOF 返回 403；再取得新完整来源基线独立接收、实际十一项、锁观察、同轮来源/二进制与 namespace UID/两端清理回执 |
| 历史详情十六项 | 查明用户 15:02 轮缺少游标实现；补齐普通/游标测试和 tagged 历史探针构建列表，原冻结门禁/构建及清理已独立接收 | 操作者用新时间戳完整实际运行、独立接收十六项；新来源不继承原冻结整树通过。原失败日志不能改成通过 |
| GC 四十二项 | [A 独立复核](evidence/a-d-gc-lifecycle-repair-reviewed-20261022.json)已确认原实际 41/42、整体退出 1；D 取消观察修复的两完整包 5,091 条通过事件、seed、跨平台构建与准确 owner 清理证据匹配 | 修复后的新完整 42 项实际运行及独立接收；freeze adapter 和完整 GC 仍未完成。原自定义 PASS 不算父测试成功 |
| 现场部署与真实整链 | 既有模板/采集入口继续复用；用户本轮确认安装受控材料“未准备” | 当前 config/原 grant/registry-ref 映射、受审镜像与连接、正式 SQL 身份/grants、data/report/journal 物理证据/容量/隔离、TLS、真实人登录/MFA/provider、HTTP 和恢复整链实际验收 |

D 的 GC 扫描结束修复也已运行既有两份离线复核：旧实现十二个准确失败叶子、修复后 26 条事件、完整 evidence 包 374 根/3,080 条通过事件及 owner 缺席均匹配。原整包包装器因 tagged 输入并发变化退出 1，保留该事实，只接收剔除未参与 tagged 文件后普通输入一致的范围，不拿此记录证明当前整树或新的 42 项 SQL。

不重复已接收的隔离审计十七项、角色十项、GC 任务资格十八项、原 freeze 前置三十四项和成本五项。新 42 项 profile 内保留原三十四项是完整专项的必需组成，不是把旧回执拼接成新成功。

现场缺材料时不生成假 apply 包、不创建代用授权、不拿功能测试 allowlist 当生产许可。需要原始凭据的 SSH 步骤由已有有权限操作者在原 PowerShell 会话输入，公共交接只保存受控路径和脱敏回执。此目标按用户要求暂停，没有登记整体完成；恢复时从上述真实失败和未完成项接续。
