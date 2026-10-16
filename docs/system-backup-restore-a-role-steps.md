# A 角色开发步骤：users 与 AI Gateway 系统备份/恢复

> 本文是 A 的执行导航，不重新定义公共合同。公共范围、状态机、字段语义、错误映射、验收标准以 [多部署形态下的系统备份/恢复四人分工计划](./system-backup-restore-division-plan.md) 的 v12 版本为准；机器合同以 `contracts/system-backup/v12/` 为准。
>
> A 的业务域：`users`、`ai_gateway`。A 的跨域职责：Admin audit/redaction、strong-auth/nonce、权限配置 API、Secret bundle、KEK、三类签名 key、evidence store adapter/registry/GC、provider-proof，以及 evidence/download 安全。

## 当前下一步（2026-10-09，系统 producer 生产接线）

【2026-10-16 维护授权组合八项真实 MySQL 已接收】操作者 [08:58:02 原日志](evidence/a-maintenance-authority-remote-20261016-085802-222.txt)的八项指定用例、MySQL 8.4.8 完整 94 文件迁移重放及远测 exit 0 全部核对通过，见[限定接收](evidence/a-maintenance-authority-mysql-accepted-sbk-mig-261016011333-1fdd.json)。namespace `sbk-mig-261016011333-1fdd` / UID `f48845de-1f0a-4130-b347-c7e44927b7bc` 与远端 scratch 报告清理，八份 owned 数据清理通过，准确本地两层目录及 67 个 fixture 共 69 路径独立确认不存在。1,265 项输入与当前一致；和旧本地清单内容相同、排列不同，总摘要分别保留。该专项待办关闭，不重跑；五类认证/容量来源仍为合成，不交付真实运行 grant 或旧 canonical 原文，不代替 D 独立七项服务回执、正式迁移和生产接线验收。下方“八项尚未远测”为 10 月 15 日历史状态，以本条为准。

【2026-10-15 维护授权组合八项 MySQL 专项已本地备好】[独立入口与完整命令](system-backup-a-maintenance-authority-mysql-handoff-20261015.md)直接组合私有 authority/apply/observe，覆盖 grant 错绑、独立观察、原认证事实漂移及真实暂存后的 grant/source/capacity 到期回滚。新[限定回执](evidence/a-maintenance-authority-mysql-local-review-20261015.json)冻结 1,265 项输入，完整 security 230/1,525、三个 seed 3/22 的 checkout/空 CWD/实际胶囊三种执行、默认 vet、Linux 探针和迁移 runner 编译均通过，exit 0、无重试；全量及 12 项重点输入匹配，两层准确自有目录和 67 个 fixture 独立确认删除，未安装依赖或执行 SSH。八项实际 SQL 尚未执行，五类来源仍为合成适配。另 D 16:33 服务远测在 17:23:39 以“管道已被停止”结束，[中断核对](evidence/a-canonical-backfill-mysql-interrupted-20261015.json)确认本地产物已删除，但实际 SQL/远端成功与清理未证明，不能记作 PASS。旧 writer/storage/index/business 专项不重跑，真实材料、正式迁移与生产接线仍待完成。

【2026-10-15 维护 grant/source 组合校验已本地接收】[A 新交接](system-backup-a-config-maintenance-authority-handoff-20261015.md)补必须存在的 CurrentTarget、独立写/观察 grant、原归档和物理容量五类来源接口；重新派生稳定 actor/grant 身份、逐项匹配认证事实及 provenance，在原 sql.Tx 最终复查中拒绝原字节/版本/撤销代次/有效期或来源漂移，不续期。与实际 apply/observe 模型组合验证一次写入、原字节观察和最终来源变化后的整笔回滚。r2 冻结 1,261 项输入，定向 11/80、八项有效反例、完整 security/config 250/1,638（1,888 项）通过，默认 vet、exit 0、无重试；全部输入当前匹配，准确 owner 与 92 个 fixture 已独立确认删除，见[限定接收](evidence/a-config-maintenance-authority-review-20261015.json)。这不提供真实 holder/grant/归档/环境/容量适配或新签名协议。完整服务首轮远测因 SSH 不可用未启动，新时间戳回执待核对；旧成功专项不重跑，正式 081/082 和生产接线仍待完成。

【2026-10-15 完整 canonical 回填事务候选已本地接收】[A 编排交接](system-backup-a-config-backfill-service-handoff-20261015.md)串起独立写授权、全行核对、永久 key、容量、真实 intent/result INSERT ID、NULL-only 单列 CAS、no-change、维护收据和最终 guard；独立 observe 使用当前观察授权，提交不明不自动重写或泄露推测成功。补成功/缺席 SQL 最新时钟贯穿、固定原截止和回调字节所有权，保留 D 同期审计 TIMESTAMP 秒精度修订。r2 冻结 1,258 项输入，定向 11/50、六项有效撤保护反例、完整 security/config 239/1,558（1,797 项）通过，默认 vet、exit 0、无重试；12 项重点 pin 匹配，准确 owner 和 92 个 fixture 均独立确认删除，见[最终限定回执](evidence/a-config-backfill-service-review-20261015.json)。首轮 1,782 项通过仅作被替代历史。D 后续维护收据 MySQL 文件漂移另验；本事务实际 MySQL、真实主体/grant/归档/容量适配、081/082 正式迁移与生产接线仍待完成。

【2026-10-15 维护收据存储真实 MySQL 已接收】A 核对操作者 [15:25:47 新日志](evidence/d-maintenance-receipt-remote-20261015152547.txt)：7 个顶层场景、9 个约束子项全部 PASS，准确配置行 InnoDB 等待已观察，完整 94 个 migration 通过；准确 namespace/UID、远端 scratch 和本地构建 cache 均报告清理，7 份 owned installation 行清理及 67 个 fixture 路径不存在，见[A 限定接收](evidence/a-maintenance-receipt-mysql-accepted-sbk-mig-261015074138-2f70.json)。纯存储 SQL 待办关闭，无需重跑；[完整维护事务 apply/observe 候选](system-backup-a-config-backfill-service-handoff-20261015.md)、后续时钟/审计精度、真实授权/原归档和正式 081/082 仍须独立验收。

【2026-10-15 维护收据审计锚点绑定已补强】[A 复查与边界](system-backup-a-maintenance-receipt-review-20261015.md)发现原组件只复验 audit 时间顺序，未固定原 intent/result 时间；同事务内合法时间替换可能通过。修订固定两个原始 SQL 时间，并在暂存重载/最终复查逐一比较，兼容等价 UTC location 和 MySQL JSON 空白。1,250 项冻结输入下，定向 14/121、八项有效撤保护反例、完整 security/config 227/1,508（1,735 项）通过，默认 vet、exit 0、无重试；九项重点 pin 匹配，准确 owner 与 92 个临时路径独立确认删除，见[限定回执](evidence/a-config-maintenance-receipt-review-20261015.json)。D 后续 MySQL 探针/派发四处漂移及新增 phase 不在接收范围。具体运行授权/旧原文、完整维护事务、082 真实 MySQL 和正式 081/082 仍待完成。

【2026-10-15 writer 真实 MySQL 14 项已通过】A 已核对操作者 14:28:59 的[原始日志](evidence/d-config-writer-remote-20261015142859.txt)、冻结清单和[D 验收记录](evidence/system-backup-d-config-writer-mysql-accepted-20261015.json)：原 8 项 writer 与 A 新增 6 项安全场景全部 PASS，完整 94 文件迁移重放通过；准确 namespace/UID、远端 scratch 和本地 cache 均报告清理，68 个本地生成路径独立确认不存在。此回执关闭下方旧“本地准备/需重跑”的待办，不重跑已接收套件。仅接收本轮冻结 writer 候选；后续 maintenance receipt、完整回填授权/来源/容量/commit 编排、081/082 正式化与生产接线仍待完成，合成 readiness/capacity 不升级为生产能力。

【2026-10-15 writer MySQL 安全专项已本地准备】[六项新增场景与完整操作者命令](system-backup-a-config-writer-security-mysql-handoff-20261015.md)补真实 session 行锁撤销/到期、CAS 后 session/proof 到期、锁外准备撤权和 rollback 降保留期的实际 MFA/重放；新增 -SecurityOnly 可跳过原八项。r3 固定 1,243 项输入，完整 security 195/1,293、tagged seed 2/16、空 CWD 独立 seed、默认 vet、Linux probe/runner 构建通过，进程 exit 0；两次已知工具故障重试保留，准确 owner 与 67 个 fixture 已删除并独立确认，见[本地回执](evidence/a-config-writer-security-review-20261015.json)。六项真实 MySQL 已编译、执行 0 项。已观察操作者旧远测因共享夹具漏 065 必填字段而在首项初始化失败，D 已补字段和 DDL/seed 对照；需用新命令验证原八项加新六项，不把此前迁移 PASS 算作 writer 已通过。

【2026-10-15 行指纹 SQL/DECIMAL 更正已接收】A-BACKFILL-SCHEMA-01 在 r4 冻结范围内修复：按 066 CHECK 验证 created_by 1..128 / 非 NULL reason 1..512 UTF-8 字节，拒绝空非 NULL 原因；从整数百分位推导准确 DECIMAL(4,2) 文本，支持 1.00/1.50/2.00，不用 float64 或 trim 实际 SQL。见[合同修订 2](evidence/a-config-backfill-identity-contract-20261015-r2.json)与[r4 接收](evidence/a-config-backfill-identity-review-20261015-r4.json)。七向量/四项 Node、定向 9/192、正常 security/config 216/1,412（1,628 项）及两个有效撤保护反例通过，默认 vet、exit 0、无工具重试；1,243 项已有输入匹配，准确拥有目录和 92 个 fixture 已删除并独立确认。旧字符预算/空原因 SQL 有效性结论撤回，旧合同/回执原字节保留；D 新增三份 maintenance receipt 实现/测试另审，不据本轮接收最新整个工作树。实际授权/来源原文和真实回填仍待交付。

【历史初版：回填行指纹与来源摘要，SQL 字符预算结论已撤回】[A → D 交接](system-backup-a-config-backfill-identity-handoff-20261015.md)补 `expected_row_sha256` / `source_provenance_sha256` 的两个 domain/profile 和纯 Go 实现：独立锁定 SQL 的全部 126 个展开列与准确原文逐项一致，指纹绑定完整不可变元数据；来源绑定准确 target/version/原文与独立认证的 archive record/manifest。保留 NULL/空值、完整 unsigned ID、原 UTC 微秒和 SQL Unicode 字符预算；不从原文伪造 SQL 事实。四项 Node/Go 向量、三项 Node 检查、两个有效字符预算反例与 1,235 项冻结输入下的完整 security/config 204/1,207（1,411 项）通过，默认 vet、exit 0、无重试；全部 live 输入匹配，准确目录及 92 个 fixture 均删除并独立确认，见[接收记录](evidence/a-config-backfill-identity-review-20261015.json)。原合同/066 不改。实际来源认证与原文件、purpose-specific 运行写/观察授权、独立 writer/维护收据和 081/082 仍待完成，不能凭摘要直接回填。

【2026-10-15 Operation writer/存储/重放/HTTP 候选已由 A 独立接收】[绑定评审](system-backup-a-config-operation-binding-review-20261015.md)补实际 SQL INSERT 事实与公开 Operation 的独立比较，以及真实 SQL response adapter/会话/file RBAC 下的原文、hash、其他主体、证据替换和撤权检查；SQL transport/资源仍为模型。A 修复响应借用 buffer 和最终会话错误优先级，D 后续修正测试收据的 endpoint/key 作用域，前两轮失败完整保留。1,224 项固定输入下，定向 6/37、两个有效撤保护反例、完整 security/config 两包 197/1,025（1,222 项）通过，默认 vet、exit 0、无工具重试；全部 live 输入匹配，准确拥有目录和 117 个 fixture 均已删除并独立确认，见[接收记录](evidence/a-config-operation-binding-review-20261015.json)。A-CONFIG-WIRE-01 在该冻结候选实现内修复；公开响应走 inline，不再等待旧 diagnostic 发布器。真实 MySQL mutation、生产材料/路由、正式 081/082、独立回填 writer 及历史原文/具体运行授权仍待完成。下方“writer 接线待完成/open”描述保留各自历史时点，不代表本轮之后状态。

【2026-10-15 公开配置 Operation codec 已交付，writer 接线仍待完成】[Operation 响应交接](system-backup-a-config-operation-response-20261015.md)新增准确公开成功体的 canonical encoder/strict decoder，包含完整闭集 Operation 字段，拒绝 ConfigResource、额外/重复/缺失字段、非 canonical 数字/时间和越界事实；完成/更新时间须来自实际事务，不能提前伪造。独立 Node 向量和三项 schema/JCS/SHA 检查通过，最大字段成功体 1,232 字节，小于 8 KiB；不解除其他 owner/权限/容量门禁。1,216 项固定输入下，定向 5/41、完整 security/config 两包 183/952（1,135 项）、默认 vet、退出 0，无工具重试，准确产物已删除并独立确认，见[接收记录](evidence/a-config-operation-response-review-20261015.json)。原 writer/存储/重放仍需统一为同一 Operation 原始字节，A-CONFIG-WIRE-01 保持 open；未打开 HTTP、执行远测或签发运行授权。

【2026-10-15 公开错误合同已对齐，配置成功体仍有阻断】[合同增量](system-backup-a-registration-contract-alignment-20261015.md)纠正此前保留的候选状态码：强认证 required/invalid/issuer/expired/replayed 全部按 v12 返回 401，provider 签名/checksum/version 冲突为 409，malformed proof 为 400 validation；新请求缺 proof 不占 key，已提交重放仍不要求新 proof。机器 JSON parity 与真实 HTTP 场景已补，draft error profile 仅补缺失成员、未改冻结标志。1,211 项固定输入下，定向 8/59、完整 security/config 两包 177/911（1,088 项）、tagged seed 1/6、默认 vet 全部通过，70 项 Node 合同检查有完整 r3 落盘，退出 0，无 Go 工具重试，准确产物已删除并独立确认，见[接收记录](evidence/a-registration-contract-review-20261015.json)。另[发现 A-CONFIG-WIRE-01](evidence/a-config-success-wire-audit-20261015.json)：OpenAPI 成功体为 Operation，现候选为 ConfigResource；须统一 canonical response、evidence/receipt hash 和准确重放后再接 HTTP。该项仍 open，不以此前 ConfigResource 内容回归代替公共响应合同验收。

【2026-10-15 共用错误边界已本地收敛】[错误边界增量](system-backup-a-registration-error-boundary-20261015.md)只保留四种合同内强认证失败码，未知/私有代码收敛为 unavailable；typed nil VerificationError 的标准遍历和 auth/provider HTTP 映射不再解引用空指针。17 项内部及 17 项真实 HTTP/service 故障场景保持零提交、无私有原因和准确状态码，另有 error traversal 用例。1,204 项固定输入下，定向 3/34、完整 security/config 两包 163/841（1,004 项）、默认 vet 全部通过，退出 0、无工具重试；准确产物目录已删除并独立确认，见[接收记录](evidence/a-registration-error-boundary-review-20261015.json)。三项后续 D preparation/事务漂移不据本轮签收，原 A 合同/旧签收保留历史范围；未安装依赖、未远测或授予生产权限。

【2026-10-15 旧 canonical 原文验证边界已本地收敛】[原文验证增量](system-backup-a-config-backfill-source-boundary-20261015.md)将 `VerifyConfigBackfillSource` 的原文复制提前至全部验证及 SQL/权限回调之前，防止中途借用 buffer 改动让回执与已核对 hash 不一致；只读提交后取消同样返回空回执。新增五个回调字节隔离及六个取消用例。1,202 项冻结输入下，定向 4/11、完整读取包 52/217（269 项）及默认 vet 全部通过，退出 0、无重试；准确源码/缓存/产物目录已删除并独立确认，见[接收记录](evidence/a-config-backfill-source-boundary-review-20261015.json)。四项并行 D 重放/事务漂移不据本轮接收。未安装依赖、未远测、未回填；原文材料、具体写授权、独立 writer/收据继续待交付。

【2026-10-15 配置 proof 独立 MySQL 入口已本地收尾，待操作者远测】[专项交接与完整命令](system-backup-a-config-proof-mysql-handoff-20261015.md)新增完整正式 schema 上的 15 项 proof 用例，覆盖 HTTPS/JWT/TOTP、真实并发/行锁等待撤权、审计回滚及真实提交后合成回执丢失；仅签发 proof，不运行配置 writer 或旧行回填。1,196 项固定输入下，定向与 seed 共 43 项不同 Go 检查、空目录编译 seed、默认 vet、11 项派发、三份 Shell 语法检查、Linux 探针及 pinned migration runner 编译均通过，退出 0，无工具重试；全部已有输入仍匹配，准确源码/产物目录已删除并独立确认，见[本地验收](evidence/a-config-proof-mysql-local-review-20261015.json)。未安装依赖、未远测；真实 MySQL 结果待用户执行新专项，已通过十五表和管理读取套件无需重跑。

【2026-10-15 完整响应内容 profile 与维护摘要 Go parity 已本地接收】[内容交接](system-backup-a-d-config-mutation-review-20261015.md)新增独立 canonical builder 与 system-owned diagnostic ConfigResource profile，按受信 typed facts 验证全部 JCS 字节，支持真实约 10.5 KiB 的完整响应加密往返，读前/读后检查当前生产者及固定原因/配置/截止策略；不截断或冒充 capability/log。另完成[维护 actor/grant/request 摘要 Go 实现](system-backup-a-canonical-maintenance-digest-handoff-20261015.md)，六项原签收向量通过。1,183 项固定输入下，定向 9/58、完整 security/evidence/producer 三包 396/2,526（2,922 项）、默认 vet、退出 0；拥有目录已删除并独立确认，见[验收记录](evidence/a-config-response-content-review-20261015.json)。首轮并行同名文件/循环依赖失败已保留，A 独立命名、D 独立组合层已解除反向导入；13 项 A 输入仍匹配，后续七项 D 漂移不据旧副本接收。自由文本原因清洗器、生产 content authority/发布/SQL 装配、真实 MySQL、维护 writer/原文/运行 grant 继续待完成。

【2026-10-15 配置 update/rollback proof 签发已本地验证】[签发交接](system-backup-a-d-config-mutation-review-20261015.md)新增 `VerifyConfigMutationAndIssue` 和现有 `/strong-auth/proof` 的严格配置分支：服务端计算完整请求摘要，绑定实际用户/会话/安装/接口/幂等键，要求已确认 TOTP 与当前权限，不登记/刷新登录会话，签名后最终重查权限/会话/数据库时效。固定 1,170 项输入下，完整 security 包 134/643（777 项）、默认 vet、退出 0；新增 proof 为其中 6/30，准确产物已删除，见[验收记录](evidence/a-config-proof-issuance-review-20261015.json)。首轮夹具漏填 Verify 上下文的四项正向失败保留，修订只补齐测试上下文。实际密码/JWT/AES-GCM/TOTP/Ed25519 链已验证，SQL/授权仍是模型；生产材料、完整配置写入口与 owner 资源/响应装配、真实 MySQL、维护 writer/原文/实际写 grant 继续待交付。

【2026-10-15 会话与配置事务组合已本地接收】[组合评审](system-backup-a-d-config-mutation-review-20261015.md)将实际 JWT authenticator、SQL 会话来源、Pinned authority 与 mutation/replay service 贯通；改密、撤销、会话缩短、准备/最终阶段撤权均拒绝并回滚，撤权后不读取旧响应。固定 1,165 项输入，完整 security 包 120/548（668 项）、默认 vet、退出 0，拥有目录已删除并独立确认，见[接收记录](evidence/a-config-session-composed-review-20261015.json)。SQL/容量/资源及响应仍为模型，非真实 MySQL 或生产授权；并行材料/容量改动不据此签收。配置 proof 签发、HTTP/Resolver/完整响应装配、正式迁移/独立 backfill writer 与原文/具体运行 grant 仍待完成。

【2026-10-15 RBAC 比较增量与维护摘要交付】[A RBAC 评审](system-backup-a-config-rbac-review-20261015.md)已关闭此前未纳入副本的比较规则待办，并复现 subject 超出执行器 256 字节范围仍被计为管理员的问题；保留并审查并行 D 的主体预算/UTF-8 修订。固定最终 985 项输入下，RBAC 定向 6/26、security/read 全包 163/712（875 项）与默认 vet 全部通过，准确临时目录已删除，见[接收记录](evidence/a-config-rbac-local-review-20261015.json)。这只接收比较候选，实际 session/principal、风险传递、MFA/nonce/审计和 MySQL 仍须生产适配验收。另交付 [维护 actor/grant/request 摘要格式与六项合成向量](system-backup-a-canonical-maintenance-digest-handoff-20261015.md)，用于 D 082 后续实现，未验证 Go/runtime parity，不签发运行 grant，不替代原文或批准迁移/回填。

【2026-10-15 A 对 D canonical mutation 增量评审与修复】[评审交接](system-backup-a-d-config-mutation-review-20261015.md)已复现并关闭两个候选阻断：最终时间早于耗时适配器工作，过期的 deadline/session/proof/MFA 仍可能提交；最终 Verify 的 nonce 事实未绑定较早实际消费的结果。已补提交前新数据库时间和纯本地时效检查、重放会话时效，以及 active/既有历史 HMAC 绑定比较，允许新版本候选加入。固定 978 份输入下，A 定向 5/10、完整 security/read 两包 151/646（797 项）与默认 vet 全部通过，准确临时目录已删除并独立确认，见[接收记录](evidence/a-config-mutation-final-guard-local-20261015.json)。复现轮的 vet 工具故障保留；最终门禁无重试。新增 RBAC helper 不在本轮副本，需另审；A 原合同内容不变、旧签收保留，`strongauth.go` 新指纹由本轮增量评审覆盖。生产适配、正式迁移/真实 MySQL、独立回填收据及原文/运行授权仍未接收，不能放行真实写入或回填。

【2026-10-14 最新十五表远测已接收】操作者的 [15:58 transcript](evidence/a-business-restore-mysql-remote-20261014-155831.txt)运行 `sbk-mig-261014083514-40ca` 全部通过，最终退出 0。完整列回读/回滚、FK/唯一性、SELECT-only 权限与最终 proof 回滚、NULL/精确金额以及 users/quotas 各 1001 行的有界批次均 PASS；账号、随机库、准确 UID namespace、远端 scratch 和本地缓存清理记录齐全。探针/runner 与 r4 相同，94 文件 catalog 和 45 项当前 A 输入摘要匹配，见[限定接收记录](evidence/a-business-restore-mysql-accepted-sbk-mig-261014083514-40ca.json)与[完整交接](system-backup-a-business-verify-handoff-20261013.md)。本专项和三表无需重跑；[A/D 管理读取 v2-r2](system-backup-d-admin-read-index-v2-r2-remote-20261014.md)也已通过。B 真实证明/事务 writer、D 生产恢复编排、registry 冻结和整体验收仍待完成。下方失败和待回执描述保留历史范围，以本条为当前状态。

【2026-10-14 canonical 写入合同交付 D】A 已接收实现层的权限、强认证/nonce、幂等和事务审计要求，见[canonical 写入/回填交接](system-backup-a-config-canonical-write-handoff-20261014.md)及[A 评审记录](evidence/a-config-canonical-write-signoff-20261014.json)。D 可据此实现 update/rollback 和独立离线 backfill 收据；当前仓库暂无受审的旧版本原始 canonical 文件或具体安装的写授权实例，不能执行真实回填。缺原文旧行保持 NULL/读取 503；本地 A 角色评审不构成人工/部署签名或公共合同整体冻结。

【2026-10-14 A 正文准备边界修订已本地验证】[准备链交接](system-backup-a-evidence-prepare-boundary-20261014.md)关闭已复现的取消后继续调用/返回成功、第二遍 reader Close 失败被忽略、Wrap 改写 DEK 和错误附带 reader 泄漏；无效 context/typed nil 暂存 writer 在任务/系统授权前拒绝。13 个取消时点及两遍 reader、借用 DEK 擦除/隔离回归通过。973 份固定源码/合同输入下，定向 9 个主测试/37 个子用例和完整 evidence/producer 两包 252 个主测试/1817 个子用例均通过，默认 vet 与退出 0、准确 scratch 删除及独立缺席确认见[接收记录](evidence/a-evidence-prepare-boundary-local-20261014.json)。已有输入零漂移，但并行新增的 D 配置 mutation 文件不在该副本内，不作新 writer 或当前整个工作树的验收。未安装依赖或执行远测；B/C 生产权限、D 发布事务与 committed artifact 接线仍待完成。

【远程测试执行约定】按用户要求，本地开发和验证继续；当下一步需要远程测试时暂停目标，提供完整可复制命令、日志路径和验收标准，由用户执行。已验收的远程套件不重复运行。

【2026-10-14 下午十五表远测失败，已修复夹具打包并补门禁】`sbk-mig-261014055505-7480` 的 94 份迁移及 pinned runner 均通过，但测试二进制读取仓库相对路径的 registry 夹具失败，尚未运行十五表写入/回读与权限用例。随机库、准确 UID namespace、远端 scratch、本地 cache 均有清理标记，退出 1，见[失败归档](evidence/a-business-restore-mysql-failed-sbk-mig-261014055505-7480.json)。A 已将 registry 快照仅嵌入测试二进制，并增加正式文件原字节 parity 检查、编译后从空目录运行 seed 的本地门禁，以及 Pod 内先 seed 后 SQL 的顺序；[r3 本地验证](evidence/a-business-restore-local-20261014-r3.json)已全部通过，包含从无仓库文件的空目录运行编译后 seed、正式 registry 原字节 parity、完整 A 包回归/默认 vet、Linux 探针及迁移 CLI 编译；44 份 Go 源码和一份嵌入资产前后摘要一致，产物已清理。一次已知 Windows 编译器崩溃经同命令重试通过，未安装依赖。真实十五表 SQL 仍待新一轮远测，不能用 r2 的仓库内通过代替独立运行证明。生产 normalizer、registry draft 状态和严格 scope 检查未修改。后续仍由操作者使用[完整十五表命令](system-backup-a-business-verify-handoff-20261013.md)复测，不执行三表重复专项。

【2026-10-14 A 业务恢复当前状态】十五表统一规范化与只读校验候选已交付；[D 组合接口评审](system-backup-d-a-business-batch-review-20261014.md)接收了候选控制流和 B 初次/最终 proof 接口，A 已核对 8 份指纹一致。该项候选评审已关闭，真实 B dump/目标证明及事务写入、D 生产编排、registry 冻结仍待各自完成。上午三表/十五表远测均因 PowerShell 命令拼接丢失 `KUBE_CONTEXT` 而在 harness 启动前失败，原日志保留；本地已修复并新增 5 项派发回归，另修正探针对 `users.local_username_key` 正式生成列的处理。按用户安排约 14:00 后由用户执行一次新的十五表专项，三表档位无需重复；[完整命令、日志捕获和验收标准](system-backup-a-business-verify-handoff-20261013.md)集中维护，本轮不自动发起远测。

修订后[r2 本地验收](evidence/a-business-restore-local-20261014-r2.json)已通过完整 A 包回归/默认 vet、tagged seed（222 可写列/223 回读列及生成列负测）、Linux 探针和迁移 CLI 编译，退出 0；44 份 A 包 Go 源码摘要前后匹配，本轮缓存和二进制已清理，未安装依赖。另有 5 项命令派发及 21 项工具/日志回归通过，见[派发修复记录](evidence/a-business-dispatch-fix-local-20261014.json)。这轮没有 SSH 或真实 MySQL，上午失败不记为 SQL 通过。

【2026-10-12 ABootstrap、ARevoke 增量 MySQL 限定接收】用户先执行两个尚未远测的 A profile。[增量远测记录](system-backup-a-bootstrap-revoke-mysql-remote-20261012.md)核对了两次 94 文件 fresh migration、真实 MySQL 定向测试及各自的数据库、namespace、远端 scratch、本地 cache 清理。`ABootstrap` 有落盘 transcript；`ARevoke` 的完整输出来自用户粘贴文本，仓库原 transcript 未覆盖第二项。首次 Windows Go 编译临时目录故障未触及远端，保留为失败历史。该结果只关闭两个隔离 MySQL 候选验证，不代表生产入口或最终统一远测完成。

【2026-10-12 AManager 组合增量 MySQL 已限定接收】[续跑记录](system-backup-a-recovery-manager-authority-handoff-20261010.md)核对 `PinnedDecision`、原管理授权及 `Combined` 三项真实 MySQL 测试、94 文件迁移、同轮探针/DDL/runner 指纹，以及数据库、namespace、远端 scratch、本地 cache 清理。随后 `ARead` 也再次通过。该组合专项不证明生产提议和审计容量已接线；此前已验收的 `ARead` 不再安排重复运行。

【2026-10-10 A 部署授权增量 MySQL 已接收】[接收记录](system-backup-a-historical-deployment-authority-handoff-20261010.md)中的新探针已在隔离 MySQL 8.4.8 通过，包含 `SystemDeploymentBoundHistoricalAuthority` 的当前 L1a 准入和 FinalGuard 读回；完整日志、同轮指纹和资源清理齐全。仅关闭该适配的隔离数据库范围，D 生产委托 authority、C Stat 与正式迁移仍待完成。

【2026-10-10 AManager、ARead MySQL 已限定接收】[AManager 回执](system-backup-a-recovery-manager-authority-handoff-20261010.md)覆盖管理 mTLS、L1b 当前两项写权限与 FinalGuard。[ARead 回执](system-backup-a-recovery-authority-read-handoff-20261010.md)第二轮覆盖独立 `read_fence` 接 D 当前状态观察，94 文件 fresh migration、真实 MySQL 定向测试、退出 0 与清理齐全；第一次夹具 scope 错误的失败日志保留。该只读观察不证明旧 COMMIT 来源，也不代表生产管理策略已完备。

【A/D 服务 MySQL 22/22 已验收】修正数据库身份与取消回滚测试时序后，隔离远程 22 个子用例全部通过，运行指纹、逐项数据库清理、namespace/UID、远端 scratch 和本地 cache 清理均已核对；见 [A 交付记录](system-backup-a-producer-service-handoff-20261008.md)。这项不重复运行；生产身份、真实 STS/provider、C 独立证明和完整 V01–V10 仍待验收。

【A 发布调用 L8 与真实 D 服务贯通】新增 [SystemPublicationCallEnvironment](../backend/internal/systembackupevidence/system_publication_call.go)，让 D 的 sts/publish 两个原调用在事务 L8 锁定 A 的实际 registry/chunks，核对完整原始证据、claim 和历史 run/观察字段，最终 Guard 再读回；身份、部署、引用、容量和审计继续由独立 D/生产 authority 负责。[跨包用例](../backend/internal/systembackupevidence/system_publication_call_integration_test.go)已用 D 真正签发的 claim/快照贯通本地 TLS STS、签名 S3 条件 PUT、A Finish 和 D CommitResult。冻结 241 文件快照的两包测试 186 个主项、1571 个子项、默认 vet 和 Linux 编译通过，快照零漂移、产物已清理；见 [完整日志](evidence/system-backup-a-publication-call-local-20261008-r2.txt)与[快照](evidence/system-backup-a-producer-snapshot-20261008-064425-98645ce2.json)。测试的身份、C 证明及 S3 接收端为隔离夹具，生产 authority/C 限制通道、真实 provider、历史恢复仍未完成。

【A 发布调用提前绑定检查】`sts/publish` 在调用底层 D 环境前，现从已冻结的历史/evidence 绑定核对 kind、scope/run、grant、准确 Write/Store 引用、policy 与 claim 的 evidence/manifest；错误输入不得先触发底层授权准备。[新用例](../backend/internal/systembackupevidence/system_publication_call_integration_test.go)覆盖两种准确调用及 10 种拒绝输入。[本地日志](evidence/a-publication-call-preflight-local-20261008.txt)和[864 文件冻结快照](evidence/system-backup-a-producer-snapshot-20261008-085729-00e72d96.json)记录测试、默认 vet、MySQL tag 离线 seed、Linux 探针与迁移编译通过，退出 0 且构建缓存清理。Windows `asm.exe 0xc0000043` 在同快照编译重试后通过；验证期间其他输入出现 3 处 live drift，`snapshot-passed=True` 仅证明冻结副本。此新增改动未做真实 MySQL 远程复测，不纳入上方既有 24/24 回执。

【A 准备调用 L8 与真实 D 服务贯通】新增 [SystemPreparationCallEnvironment](../backend/internal/systembackupevidence/system_preparation_call.go)：`content_read/wrap` 在 D 事务内按唯一 public ID 锁定 A evidence 缺席，再由最终 Guard 复查。现存行、查询失败或 Guard 前新行都会拒绝；只从已锁缺席推导 reserved CallEvidence，不接受调用者声明。[跨包用例](../backend/internal/systembackupevidence/system_preparation_call_integration_test.go)使用真实 D Lifecycle/Execution 快照和本地 TLS JWT/Transit 完成小正文加密，并验证现存行与 Guard 竞态。最终 [日志](evidence/system-backup-a-preparation-call-local-20261008-r2.txt)及 [243 文件快照](evidence/system-backup-a-producer-snapshot-20261008-071911-4fa7023b.json)记录两包 187 个主项、1571 个子项、默认 vet、Linux 编译通过，零漂移且本轮产物已清理。真实 MySQL gap lock/跨进程竞争已由下方隔离套件验收；生产 authority 尚待接入。

【准备调用真实 MySQL 24/24 已验收，无需重跑】已增加隔离 InnoDB 缺席范围锁竞争用例：原 D 事务持锁至最终 Guard，另一连接插入同一 evidence public ID 必须等待；原事务释放后同一条 INSERT 成功，之后的新准备调用拒绝。首次 [远程日志](evidence/a-preparation-call-mysql-remote-20261008-154330.txt)中 23/24 子项通过，新增用例因客户端超时后重复 INSERT 报 1062；已修正测试竞态，首次结果仍为失败。[最终本地日志](evidence/a-preparation-gap-lock-final-local-20261008.txt)及 [861 文件快照](evidence/system-backup-a-producer-snapshot-20261008-080606-a325d8a3.json)记录两包 188 个主项、1573 个子项、额外 100 次取消回滚、默认 vet、带 MySQL tag 的离线 seed、Linux 探针和迁移编译通过，零漂移及产物清理。修正版 [远程日志](evidence/a-preparation-call-mysql-remote-20261008-161704.txt)的 24/24 子项、24 个专属数据库清理、namespace/UID、远端 scratch、本地缓存清理、摘要、零漂移及退出 0 已核对，见 [限定范围接收记录](evidence/a-preparation-call-mysql-remote-sbk-mig-261008082403-4cba.json)。成功套件无需重跑；旧 22/22 结果不覆盖新增用例。

【A 历史 evidence 原行只读重建，真实 MySQL 26/26 已验收】[实现、边界和后续命令](system-backup-a-historical-record-loader-20261008.md)：在 D 当前授权事务内锁定 A 原 registry/chunks，并核对 D 历史绑定与完整 A 原字节，仅返回 `Record`，不产生新的 Wrap/PUT 执行权。[远端日志](evidence/a-historical-record-mysql-remote-20261009-083920.txt)与[限定范围接收记录](evidence/a-historical-record-mysql-remote-sbk-mig-261009005351-5dea.json)证明 D MySQL 26/26，包括原历史读取持锁时并发 UPDATE 等待、释放后落库；26 个专属数据库及远端/本地资源清理、退出 0。该次冻结快照通过，但活树出现 2 处后续改动，因此不覆盖下面的新扫描筛选；D MySQL 套件无需重跑。

【A 旧恢复入口隔离及扫描筛选，真实 MySQL 已验收】旧版写恢复入口拒绝 `system/capability_snapshot`，普通 `system/diagnostic` 仍可恢复；扫描器只排除前者。[A evidence 冻结模式本地日志](evidence/a-evidence-mysql-frozen-local-20261009.txt)与[867 文件快照](evidence/system-backup-a-producer-snapshot-20261009-010042-7ed3e5cc.json)记录本地测试、vet、Linux 编译和清理，退出 0。[远端日志](evidence/a-evidence-recovery-scan-mysql-remote-20261009-091741.txt)与[限定范围接收记录](evidence/a-evidence-recovery-scan-mysql-remote-sbk-mig-261009012930-5373.json)证明 A evidence MySQL 九个顶层子用例通过，包括扫描器筛选、专属数据库及远端/本地资源清理、退出 0。`live-drift-files=3` 属于随后改动的 D producer MySQL/domain-open 文件，不影响这次冻结 A 扫描器的接收；这些 D 改动另验。D 的独立历史授权/恢复入口和 C 的受限 Stat 仍待生产接线。

【最新 A/D 跨包本地兼容检查】[本地日志](evidence/a-d-producer-current-integration-local-20261009.txt)与[251 文件快照](evidence/system-backup-a-producer-snapshot-20261009-013518-f4df542c.json)覆盖最新 A 适配器与 D producer 的两包测试，包括 A 历史原行重建及 D 新增 domain-open 用例；Linux evidence 测试编译通过，零漂移、构建缓存清理、退出 0。该检查不运行真实 MySQL，也不替代 D domain-open 的独立远端验收。

【下一步】历史恢复身份已选后台恢复工作负载。A 已将请求绑定的 mTLS 身份固定到准确 evidence、scope 与 Stat 用途，作为后续授权事务的比对输入；具体缺口见[历史授权接线清单](system-backup-a-historical-authority-gap-20261009.md)。A 仍须按 v12 合同实现与原执行句柄隔离、绑定当前部署/撤销/截止的 `HistoricalAuthority`；D 提供独立历史读取、认领和最终 Guard 事务入口，A 在该授权事务内接原 A registry/chunks 和 evidence-only 收敛。在 D 的当前部署/身份/撤销/host/ref/容量/审计环境中装配其余 A 证据适配，接独立 evaluator 与完整结果投影；C 提供真实 provider profile、准确对象不存在/结果证明和 Stat 限制通道。之后做真实 provider 与部署验收。现有本地模拟证明不得作为启用生产路径的依据。

【2026-10-10 A 当前授权输入】A 已按[D 新候选](system-backup-d-historical-authority-freeze-20261010.md)给出[逐项复审](system-backup-a-d-historical-authority-review-20261010.md)：`SystemPeerFacts` 提供受信 subject 摘要与 CA/证书 pin，历史请求的 v2 绑定包含它们；另设独立请求绑定的管理 mTLS 身份，不授予任何管理权限。A 对缺少撤销代次或身份/部署过期的历史授权失败关闭。本地定向用例通过；当前部署/管理行的生产 SQL、同事务轮转、C 受限 Stat 证明和正式迁移仍待签收，不能开启入口。新增 A 请求绑定须单独做隔离 MySQL 增量验收，成功旧回执不覆盖新源码；远程执行由操作者按完整命令进行。

【A 系统对象发布编排】[SystemPublisher](system-backup-a-system-publisher-20261008.md) 已接原 claim/STS、准确 Stat、独立不存在证明、原密文校验、单次条件 PUT、独立结果证明和 D FinishPublication；不存在证明截止同时限制暂存和实际签名上传。原修订轮 180 个主测试、1826 项含子测试检查、默认 vet/Linux 编译通过，新增发布 47 项；一次 Windows vet 工具故障重试已记录，源码无变化，产物已清理。后续 A/D 真实服务贯通见上方新回执；生产环境、C 证明和真实 provider 验收仍待完成。

【A 系统 STS 接线】[SystemSTSCredentials](system-backup-a-system-sts-20261008.md) 从具体 D 服务和私有 claim 获取 sts/publish 两个原快照，绑定准确对象与截止，并要求独立 provider profile 验证；任务 STS 保留原授权检查。修订轮 176 个主测试、1779 项含子测试检查、默认 vet 和 Linux 编译通过，STS 新增 54 项；一次 Windows 工具进程故障重试已记录，产物清理完成。同期 D 的实际 A 适配集成 17 项通过，使用模拟数据库和授权环境；真实 C ACL/限制通道、条件 PUT 编排和生产联调待完成。

【A 结果提交证据适配】[SystemResultEnvironment](system-backup-a-system-result-20261008.md) 接 D CommitResult 的实际 ready registry/chunks 加载和最终 Guard 回读，绑定完整结果请求及原 Prepared；独立收据重放不查询 evidence 或改写时间。新增 50 项检查、两包 168 个主测试及默认 vet/Linux 交叉编译通过，产物已清理；生产 evaluator/投影/authority、完整生命周期联调及历史恢复仍待完成。

【A claim 与发布结果适配】[SystemClaimEnvironment / SystemFinishEnvironment](system-backup-a-system-publication-20261008.md) 为 D 提供实际 registry/chunks 的精确加载和最终 current read；新 claim、显式读回及 ready/write_unknown 只允许原协议字段变化，禁止顺带更新正文、保留期或 health。生产 authority、STS/PUT、完整生命周期联调与历史恢复仍待完成。

【2026-10-08 A pending 实际 SQL 适配】[SystemPendingEnvironment](system-backup-a-system-pending-20261008.md) 已把原 Prepared 对应的 registry/chunks 加入 D 拥有的事务：锁定原行或缺席、完整逐字段重放比较、逐行 CAS 插入、最终 Guard 回读，不调用旧的自行提交入口。生产授权/引用/容量/审计环境及真实 MySQL 联调仍未完成，系统发布和恢复仍待接入。

【登录状态 MySQL 22/22 已验收，无需重跑】修正版运行 `sbk-mig-260930075123-5f56` 全部通过，6 次真实锁等待、2 次零 changed rows 重查、94 文件迁移、二进制/输入/结构摘要及 678 项当前源码绑定已核对；数据库、namespace、远程 scratch、本地 cache 全部清理，wrapper 退出 0。见 [独立验收记录](evidence/a-login-state-mysql-remote-sbk-mig-260930075123-5f56.json)。此项关闭 repository `UpdateLoginState` 的限定 MySQL 验证；HTTP、真实 LDAP/目录撤销与系统 producer 仍待完成。首次 `sbk-mig-260930070728-6476` 的 21/22 和探针 panic 保留为失败历史，修正及完整交接见 [登录状态探针](system-backup-a-login-state-mysql-20260930.md)。

【系统 producer 已进入本地实现】D 已交付 C1 数据合同和事务/存储基础。A 在 [适配与评审记录](system-backup-a-producer-c1-adapter-20260930.md)中实现独立小正文准备、固定调用检查及 manifest 到 C1 的全字段绑定；完整边界仍按 [适配设计](system-backup-a-system-producer-adaptation-20260930.md)。下一步接真实主体/Wrap/STS、D 生产 Policy、发布/恢复事务与 C 实际 profile；采用 Job 时仍需 B 宿主输入。该实现不构成接口冻结、生产批准或 V01–V10 通过。

【系统专用 Wrap 本地接线】[SystemTransitPreparer](system-backup-a-system-transit-20260930.md) 已将系统小正文接到独立 JWT/Transit encrypt 路径，固定准确 profile、KEK 版本及本次授权，交换/Wrap/暂存前后复查，拒绝凭据复用与 Unwrap。生产 SystemPreparationAuthority、真实 JWT/角色 ACL、系统 STS、SQL 发布及历史恢复仍待接入。验证脚本已改用逐字节冻结快照并单列并行源码变化，避免混用 D 正在变更的版本。

【系统 mTLS 主体证明已实现】[SystemPeerAuthenticator](system-backup-a-system-peer-20260930.md) 重新验证真实 client-auth 证书链及准确证书指纹，输出绑定原请求的私有证明；Check 在本机/数据库时间下重验证书和原截止，拒绝跨 scope、跨实例及已结束请求复用。D 仍须接当前部署/撤销/host/角色与最终 Guard；本组件不单独授予管理、evaluator、Wrap 或发布权限。

【D 调用快照已接入 A 准备链】[NewSystemExecutionPreparer](system-backup-a-system-execution-20260930.md) 从具体 D Execution/ExecutionHandle 获取 content_read/wrap 两个原快照，核对同一 run/授权事实、准确正文与 KEK 策略，在正文/JWT/Wrap/暂存边界复查原快照，不借续租替换或延长。生产环境仍须独立核准策略和 workload 映射；pending/claim、系统 STS/发布/恢复尚待完成，本地模拟适配不代表真实 SQL/provider 联调通过。

【初版本地准备历史】[UpdateLoginState MySQL 探针与完整命令](system-backup-a-login-state-mysql-20260930.md)提供独立 `-LoginStateOnly` 模式，从当前完整 fresh 迁移后的 users 表复制结构。初版 repository 10 项、离线 seed 1 项、执行器 16 项及远程阶段模拟 7 项通过；后续故障注入修正及真实 22/22 结果以上方接收记录为准。不重跑已成功的会话 15/15 与 evidence 25/25。合并后 catalog 已为 94 文件，以下旧 93 文件记录保留原范围。

【2026-09-30 认证边界源码验证通过】[LDAP 登录拒绝路径及后续验收清单](system-backup-a-auth-boundary-20260930.md)已交付独立离线源码验证入口；48 个主测试、43 个子用例及 8 项执行器回归通过，180 项输入摘要稳定，测试构建产物已清理。HTTP/server 全包依赖缺口、repository 条件更新的真实 MySQL 行为和目录撤销事件分别列明，不计作已由会话 MySQL 15/15 关闭。

【2026-09-30 登录会话 MySQL 15/15 已接收】[登录会话探针](system-backup-a-login-sessions-mysql-20260930.md)在操作者运行 `sbk-mig-260930024748-02c7` 中全部通过，真实锁等待、二进制/DDL 摘要、数据库/namespace/scratch/cache 清理及退出 0 已核对；见 [远程接收记录](evidence/a-login-sessions-mysql-remote-sbk-mig-260930024748-02c7.json)。此成功套件无需重跑。HTTP 登录链、repository 条件更新和 LDAP 撤销事件仍待补齐。

【2026-09-30 系统 producer R1 复审完成，A 认可设计回复】A 已逐项核对 [D R1](system-backup-d-producer-authority-revision-20260930.md) 和现有接点，形成 [A 复审报告及后续接口清单](system-backup-a-d-producer-authority-rereview-20260930.md)。六项设计回复均认可，本轮无新增设计阻断；实现和 V01–V10 运行验收尚未完成，六项不作最终关闭。D 可推进合同/接口细化，A 接受系统正文、Wrap、STS、发布、最终 Guard 及历史恢复的协同适配责任；C 提供独立通道/provider profile，采用 Job 时 B 确认宿主接口。当前不构成整体合同冻结或生产批准；[首轮 changes_requested](system-backup-a-d-producer-authority-review-20260930.md) 保留为历史记录。下述“保持暂停”保留原 MySQL 验收轮次状态。

【最新：2026-09-30 授权／并发探针验收通过，保持暂停】修正后远程运行 `sbk-mig-260930011620-0f52` 已通过原 8 项＋新增 17 项，共 25/25；93 文件迁移、探针及 DDL 摘要、55 项当前准备源码绑定、全部清理标记和退出 0 已核对。见 [验收记录](evidence/a-authority-mysql-remote-sbk-mig-260930011620-0f52.json)。此成功范围无需重跑；真实 provider、正式 SQLPolicy／完整控制表及端到端备份恢复仍待后续验收。下面记录保留失败与修正历史，不表示本轮仍失败。

【2026-09-30 远程失败修正】`sbk-mig-260930003602-2567` 的原 8 项及恢复类 6 项通过，11 个 GC 用例在测试种子发布阶段失败，原因是模拟存储漏设权威不存在标志；全部清理标记齐全。修正及本地回归门禁见 [GC／恢复探针交接](system-backup-a-authority-mysql-20260929.md)，GC 授权／并发仍须修正后远程重测，不能记为通过。

【本轮新增探针，待操作者远程验证】用户随后授权“补第一项”。新增 [GC／恢复授权与并发 MySQL 探针和完整命令](system-backup-a-authority-mysql-20260929.md)，覆盖 17 个新的授权、抢占、撤权、引用竞态、退避和行锁等待用例；交付后暂停。本轮新增用例尚未远程通过，下面的 8/8 接收记录仅对应上一轮。

【远程范围验收通过，按用户要求保持暂停】操作者的 `sbk-mig-260929090519-4483` 已通过 8/8 MySQL 子用例，wrapper 退出 0，数据库/namespace/远程 scratch/本地构建缓存清理输出齐全。A 核对探针、DDL、migration 摘要及 111 项当前源码绑定一致，见 [限定范围接收记录](evidence/system-backup-a-evidence-remote-sbk-mig-260929090519-4483.json)。PowerShell transcript 缺少远程 stdout，操作者控制台补充已单独归档；此成功套件无需重跑。真实 provider/运行授权/并发/部署与完整备份恢复仍未验收，等待恢复指令，不继续下一轮开发。

新增 [GC 观测和持久化重试](system-backup-a-evidence-gc-observation-20260929.md)：删除结果、检查时间和重试时间与状态 CAS/审计同事务；领取前在行锁内检查到期时间，直接调用也不能绕过退避。正式扫描/worker、整轮 last-success 指标和现场验收仍待接入。

新增 [GC 运行入口与事务授权](system-backup-a-evidence-gc-runtime-20260929.md)：同一 runtime 接精确版本删除和 C verifier，系统 operation 租约覆盖领取/结果 CAS 与审计事务，提交前复查数据库时间；tombstone 重试也须实时授权。正式迁移、SQLPolicy/审计/Failure、expiry scanner/worker 和真实 provider 证明仍待接入。

新增 [只读恢复运行装配](system-backup-a-evidence-recovery-runtime-20260929.md)：同一 runtime 绑定 SQL 恢复/批次扫描与 STS/S3 HEAD，404 保留未知状态并登记重试，配置撤销后拒绝提交成功。正式 worker 调度、SQLPolicy/审计/Failure、真实 OIDC/provider 和 MySQL 并发验证仍待接入。

系统 producer 的下一项输入已具体化为 [capability producer 准入交接要求](system-backup-a-capability-producer-admission-request-20260929.md)：现有六类正文角色、三类 provider claim 和初始化前后两条路径尚不能形成统一的实时生产授权。需要 D/C/B/A 对齐租约、运行身份和登记顺序；不把任务日志权限扩展成系统权限，不新增未经确认的私有 grant。

新增 [任务写入运行装配](system-backup-a-evidence-task-runtime-20260929.md)：同一 runtime 接准备、登记和条件发布；任务不存在证明前后复查授权，发布 intent/result 审计与 claim/结果 CAS 同事务，丢响应可用原对象 Stat 收敛。正式 SQLPolicy/审计/Failure、C 证明及任务暂存宿主仍待接入。

新增 [任务正文准备与短期 Transit 写入凭据](system-backup-a-evidence-task-prepare-20260929.md)：TaskPreparer 接实时任务/mTLS 授权、正文校验和专用 encrypt-only JWT 交换；同一配置事务绑定 evidence_kek 引用，并在加密与暂存后复查授权。真实任务宿主、role/ACL、Registry/审计和暂存生命周期仍待接入。

新增 [下载运行装配与 Transit 短期凭据](system-backup-a-evidence-download-runtime-20260929.md)：单一 runtime 绑定 SQL 下载授权、S3 STS、只读对象访问和专用 JWT/Transit 解包，历史引用不回退。生产 SQLPolicy/TLS 挂载、真实角色/ACL 仍待交付；短 TTL batch profile 不等于 provider token 即时撤销。

新增 [扫描与批次恢复](system-backup-a-evidence-recovery-batch-20260929.md)：`ReconcileBatch` 按精确 store/installation 和数据库时间取得有界候选，提交扫描后逐条重新授权，提供可继续的游标。取得 claim 时强制复查 next reconcile。生产 worker 宿主、SQLPolicy、真实身份/凭据和现场并发验收仍待接入。

新增 [恢复观测与重试登记](system-backup-a-evidence-recovery-observation-20260929.md)：只读恢复的 health、last checked、next reconcile 与结果 CAS/审计同事务；重试采用锁定配置的上限间隔，claim/授权不冒充成功检查。实际扫描、worker、其他生命周期健康和生产验证仍待完成。

新增 [到期写入只读恢复](system-backup-a-evidence-write-recovery-20260929.md)：`SQLWriteRecovery` 以独立 mTLS 身份与证据 claim 确认 pending/write_unknown 的精确对象；匹配时只更新 evidence，普通 404/失败保留未知记录，不重发 PUT、不更新 owner 终态。正式 worker/扫描、D policy/审计/健康及真实 provider 接线仍待交付。

新增 [GC 独立授权](system-backup-a-evidence-gc-authority-20260929.md)：`SQLGCAuthority` 绑定 mTLS、系统 evidence_gc 操作租约和已提交证据 claim，只授予精确版本 Stat/Delete；不存在证明前后复查授权，清除数据库引用前复查保留和 Deletable。正式 D policy/扫描与 worker 装配、真实 provider 证明及到期写入恢复授权仍待完成。

新增 [登录和刷新会话登记](system-backup-a-evidence-login-sessions-20260929.md)：显式开关连接普通管理员登录、单次 refresh 轮换和退出撤销；JWT 增加随机 session ID，登录写入核对原凭据/身份以防覆盖并发改密。默认未启用。完整服务构建受本机缺失依赖限制；受限源码验证、现场 MySQL 并发与生产接线的边界见交付记录。

新增 [管理员下载授权](system-backup-a-evidence-download-authority-20260929.md)：`SQLDownloadAuthority` 绑定 JWT/数据库 session、分类 RBAC、owner policy、证据 claim 与 STS 只读范围，`DownloadKeys` 绑定 envelope 后解包并在撤销时擦除 DEK。D 的真实 owner policy/运行装配、Transit 实时 unwrap 凭据、MySQL/provider 验收及 GC/到期恢复授权仍待完成。

新增 [任务日志正文与 STS 共用授权](system-backup-a-evidence-task-authority-20260929.md)：`SQLTaskAuthority` 接 mTLS 身份及 task/config/attempt/Job/claim 查询，Publish/下载/GC 已传递事务提交后的私有 claim。当前实现 task job-log 的正文和对象发布授权；system capability、download/GC authority、生产装配和真实 MySQL/provider 验收仍待完成，后文此前“无 authority 实现”的描述以此增量为准。

新增 [STS 临时凭据交换组件](system-backup-a-evidence-sts-20260929.md)：`S3STSCredentials` 可供现有 S3 adapter 使用，按精确对象/IAM action/版本生成 session policy，并在交换前后复核授权。真实 OIDC/role、provider 策略支持证明和 `S3WebIdentityAuthority` 的任务/claim/session 接线仍待交付；不能把模拟 STS 或现有静态 S3 keys 算作生产授权完成。

最新增量：[日志逐行脱敏与正文分派](system-backup-a-evidence-log-content-20260929.md)已增加受审字段策略、失败行丢弃/结构化诊断、有界 chunk 与累计任务预算，以及 capability/job-log 的授权绑定分派。其余正文类型保持拒绝。真实 ContentAuthority、JobObserver/诊断持久化、B/C 正文合同与生产凭据仍需交付；组件实现不代表生产日志已接入。

A 已实现 `systembackupevidence` 组件：分块加密、事务登记/写入收敛、下载二次鉴权/审计、保留校验及有界 GC。隔离 run `sbk-mig-260928090803-518e` 在 MySQL 8.4.8 上完成 93 文件迁移和 5/5 evidence 子用例，wrapper 退出 0，测试库/namespace/scratch/cache 均报告清理；A 核对 13+93 项源码绑定与 DDL 摘要后限定范围接收，见 [接收记录](evidence/system-backup-a-external-evidence-sbk-mig-260928090803-518e.json)。本次成功套件无需重跑。交付范围、framing 草案和 GC 约束提案见 [本轮组件交付](system-backup-a-external-evidence-20260928.md)。下一步是 D 落正式迁移及控制面/HTTP/调度接线，A 接真实 provider/KEK/redaction 并和 C 对齐证明语义；合成 provider/owner policy 的隔离测试不代表正式 capability、本人 MFA 或配置激活。

A 已继续增加 [Transit HTTPS KEK 适配器](system-backup-a-evidence-transit-20260928.md)，明确版本及 wrap/unwrap 凭据绑定，先在本机 TLS 模拟服务验证。独立远程 evidence key、分离 ACL、实时凭据 resolver 和真实 provider 验收仍未完成；此前 MySQL 成功记录不扩展为这些能力的批准。

随后增加 [S3 HTTP 适配器](system-backup-a-evidence-s3-20260929.md)，接现有 Publish/Range/GC，并要求真实 STS resolver 和独立权威不存在证明 verifier。下一步需补这两个受信实现及版本化 bucket 准入，不能只配置静态 access key 或把 404 当作已删除。

最新 [内容校验增量](system-backup-a-evidence-content-20260929.md)落实全部 type/owner 组合，增加 capability snapshot 的闭集 schema、受信 run/provider 绑定及有效期检查。其他正文类型、日志逐行 redaction 和真实 producer 认证/分派仍待完成；这不替代 capability 现场证据或 D 的事务内准入。

生产接线核对已整理在 [外置 evidence 交付文档的生产接线清单](system-backup-a-external-evidence-20260928.md#生产接线核对与交接2026-09-29)：当前 D 服务未挂载 evidence 下载，四个策略/凭据/证明接口仍无生产实现。D 可先推进正式 GC 迁移和 SQLPolicy；A/C 继续完成独立 KEK、STS、权威不存在证明及正文校验。现有登记/MFA 服务通过，不等于 evidence 已部署。

操作者已确认 B/C 暂未接入。日志正文/JobObserver 与 evidence 不存在证明的生产接点继续标记待交付；不把本机模拟 provider 算作 B/C 已接入。A 已增加 Transit 历史密钥路由快照，使轮换后的旧 evidence 按原 KeyRef 读取，新写入仅用当前引用；部署时仍须接真实历史 registry、实时授权及旧写权限撤销，见 [KEK 交付说明](system-backup-a-evidence-transit-20260928.md)。

最新进度见 [A 对 D 登记、HTTP/MFA 与首次初始化复审](system-backup-a-d-activation-review-20260928.md)。A 已独立复验上一轮原始反例，A-D-REG-01/02 在本地组件范围关闭；D 的登记事务与隔离 HTTP/MySQL 接线已经交付，不再等待其首次接线。新增 A 负测和当前版本验证以该报告及机器记录为准。

【远程增量已接收】`sbk-mig-260928075523-63e2` 已通过 `001..080` / 93 文件迁移、9 项主用例和 3 项 bootstrap 子用例，操作者 wrapper 退出 0，测试数据库/namespace/scratch 清理齐全。A 核对四个摘要及 60+163 项源码绑定通过，见 [A 接收记录](evidence/system-backup-a-runtime-migration-sbk-mig-260928075523-63e2.json)。无需重跑该成功套件。下一步为真实 admission/registry/ref、安全运行身份与部署接线的交付评审；部署/本人 MFA、外置 evidence 与新 schema evidence 继续待完成，v12 保持 draft。需要后续远程测试时仍按用户要求暂停目标并提供完整命令。

## 历史进度（2026-09-24，已收到 D 实际 provider 环境交接）

- 【远程已通过】08:24 UTC Node 字节传输重跑退出 0，当前认证主体/TLS/namespace 身份和 config 计数检查通过；config_rows=0、active_installations=0，无临时产物。完整输出通过本地 validator，见 [成功预检记录](evidence/system-backup-a-identity-preflight-20260923T082454Z.json)。旧退出 127 记录保留为失败历史，当前无需重复预检。
- 【D 复审已完成，仍需修订】D-A-01～06 在本地边界关闭；新增 R1 签名 metadata Unicode 长度与 R2 capability 状态/原因约束问题，已作 [第二轮修订](system-backup-a-rereview-revision-2026-09-23.md)，待 D/C 按新指纹复核。D 同时确认 15 对象的 45 份合成投影 fixture 补齐原交付缺口，但不代表完整 SQL restore 或冻结签收。
- 【第二轮本地验收通过】A runner 的 23 个、D revision runner 的 25 个 Go 顶层测试通过；Node 安全 6、对象 3、SSH transport 5、artifact 70、gate 6、D schema 2 项通过。D Go 首次编译器异常退出已如实记录，降低编译并发后重跑成功。无依赖安装，全部隔离测试产物已清理。见 [验收证据](evidence/system-backup-a-rereview-revision-20260923.json)，不代替 D/C 签收。
- 【审阅完成，未批准】D 的 live schema-hash 已采集且与当前仓库绑定一致；A 的 [candidate 安全审阅](system-backup-a-schema-candidate-review-2026-09-23.md)指出安装/来源认证与真实 evidence 登记仍缺失。历史“待采集/本轮跳过”描述不再代表最新状态。
- 【环境接收、Evidence 与 KMS/signing 限定范围测试通过】Evidence run `a-ev-7b1a56dbc722a6e70b0dc4f0` 的 18 项检查与对象/Pod 清理通过，退出 0，见 [Evidence 归档](evidence/system-backup-a-evidence-spike-7b1a56dbc722a6e70b0dc4f0.json)；首次失败记录继续保留。KMS/signing run `a-ks-fb61b8d528bd3b052b5ecbdc` 的 18 项检查、三类独立验签和 Pod 清理通过，退出 0，见 [KMS/signing 归档](evidence/system-backup-a-kms-signing-spike-fb61b8d528bd3b052b5ecbdc.json)。该次回传摘要不含公共签名，归档时未重做密码学验证。
- 【D 生命周期交付已由 A 限定范围签收】run `d-lc-387dab09ff2a1367ca4b5b56` 覆盖五类身份撤销/自然过期及 old/new named-ref 切换；A 重验六份签名，核对 194 条调用、388 条审计及清理记录，本地复核和 42 项测试通过。见 [A 签收与下一步](system-backup-a-lifecycle-acceptance-20260924.md)。不再等待 D 生命周期输入或重跑；下一步是 A 的 provider-proof/evidence adapter 与正式登记接入。生产授权、同名 key 内部版本轮换、源集群外恢复及整体 capability 批准仍未完成，保留 D 环境及 draft 门禁。
- 【A provider-proof/inline 登记组件本地完成，待跨 owner 接线】已实现严格有界 JSON、受信 Ed25519 验签、安装/audience/目标/全部 proof 字段绑定、历史 key/revocation/expiry 规则、请求幂等指纹及调用者事务内的真实 SQL INSERT。36 项 Go 与 9 项 Node 测试通过，隔离产物清理完成；见 [组件交付与 D 接线清单](system-backup-a-provider-proof-adapter-20260924.md)。当前下一步是 D 把 Prepare/Stage 接入同一权限/nonce/idempotency/audit operation 事务，C/D 复审 wire profile 并交付真实 issuer registry，之后进行 MySQL 并发/重放集成验证。未开启 Admin 路由、未声称端到端登记完成，未产生远程动作或正式 evidence。

## Secret broker cutover 复审状态（2026-09-23）

- 【已完成】D 侧预切换实现、业务 smoke 和脱敏证据登记；已登记的 `419852166e49be4f6aa4f66bf26b8b9980cb5cff77e5f4cb98722a213eb4b991` 是 A 退回前的历史快照，不是有效 cutover 批准。
- 【已完成】A 侧安全签收。2026-09-23，A 复核确认三项原修正、standalone `+` 修复、五套 post-cutover manifest 指纹、两个 live init completed/exit0/restarts0、app/broker 2/2、migration=true、HTTPS 门禁及标签所有权负测均与 v3 evidence 一致。签收 evidence 为 `docs/evidence/secret-broker-cutover-zhanghui08-20260923T011625Z.txt`，SHA-256 `fd8588ed96a93c30c7ac1ac96d9d9f77d78fb2c9388d9f344d986ca355d136c5`；v2 与更早 evidence 继续作废。
- 【已完成正式 RBAC 去权】操作者于2026-09-23显式批准并使用 reviewed cutover 脚本绑定上述 v3 evidence；脚本返回0，删除前后 app/runtime/sync、collector 和 broker gate 均通过。目标 `clawmanager-zhanghui08-app-cluster-admin` 终态为 `NotFound`，app SA 的 Secret list 为 `no`、Deployment get 为 `yes`。
- 【继续保护】`clawmanager-app-cluster-admin` 仍精确绑定另一 namespace `clawmanager-system/clawmanager-app`，任何阶段均不得删除。脱敏终态记录见 [`secret-broker-rbac-cutover-zhanghui08-20260923.txt`](evidence/secret-broker-rbac-cutover-zhanghui08-20260923.txt)；该结果只关闭 app RBAC 去权工作项，不代表 P0-0b 整体通过。
- 【已完成】functional-test Secret collector 的独立 ServiceAccount、空 Secret allowlist、精确 `resourceNames=get` Role/RoleBinding 和远程正负测已随正式去权完成；这是 RBAC 能力证明，不代表真实 Secret bundle 捕获 Job 已接入。复测使用只读脚本 `scripts/system-backup-a-rbac-readonly-probe.sh`，详细命令见 [A 远程验证手册](./system-backup-a-remote-validation.md)。
- 【已完成】2026-09-23 对齐 A 执行导航与现有 cutover evidence，新增只读 RBAC 复测脚本和远程 K8s/KMS/evidence 命令手册；本地验证通过：RBAC 脚本 Bash 语法、A security Go 单元测试、70 项合同 artifact 测试、6 项合同门禁测试。隔离 Go cache 已清理。本机 `kubectl` 无 current context，未直接执行远程测试；v12 strict freeze 仍为 `draft`。
- 【已完成】只读 RBAC 复测脚本修正：`kubectl auth can-i` 对拒绝返回 `no`/退出码 1 时按预期拒绝处理，真实 API 错误继续失败关闭；本地回归覆盖 yes、no、期望不符和 API 错误。旧脚本在未登记 Secret 处的失败为误判，修正版已由操作者远程重跑并通过。
- 【已完成】操作者提供修正版只读复测完整输出：21 项访问断言均为 `PASS`，最终 `PASS: A functional-test collector RBAC and app post-cutover denial`；namespace UID 与 allowlist SHA-256 精确匹配。脱敏摘要登记在 [`system-backup-a-rbac-readonly-zhanghui08-20260923.txt`](evidence/system-backup-a-rbac-readonly-zhanghui08-20260923.txt)，SHA-256 `34a1288fece2632b4be7df74db9c120f53b0afcfeb6d2c5b336a1b656ff5e766`。此项仅关闭 functional-test RBAC 复测，不代表真实 Secret bundle、KMS、签名、evidence 或 P0-0a/P0-0b 整体通过。
- 【已完成】操作者提供本 namespace 的 Deployment/Job/ServiceAccount 只读盘点：MinIO Deployment 和独立 functional-test secret-capture ServiceAccount 存在，清单中没有真实 Secret 捕获 Job 或 KMS/签名 workload。脱敏摘要见 [`system-backup-a-provider-inventory-zhanghui08-20260923.txt`](evidence/system-backup-a-provider-inventory-zhanghui08-20260923.txt)，SHA-256 `7b42e0ff73f691d35f22e160130b4712615d909f4b788042e56d6c82a045a124`。现有 app MinIO 配置面向 `clawmanager-skills/skills`，不能据此认定系统备份 evidence provider 已就绪；外部 KMS/签名 provider 也不能凭本 namespace 清单判定为不存在。
- 【已完成】操作者按只读 SQL 核对当前安装：`system_backup_configs=0`、有 active config 的 installation 行 `=0`。结果见 [`system-backup-a-active-config-inventory-zhanghui08-20260923.txt`](evidence/system-backup-a-active-config-inventory-zhanghui08-20260923.txt)，SHA-256 `246daac8ce4e809c222396a5bfc5e75b32a409e32278e3344cfcff9d046b48fd`。本安装暂不能运行依赖 active config 的集成测试；P0-0a 独立 provider capability spike 仍可在平台提供版本化 ref、task-scoped 身份和专用测试资源后进行。仓库的 enabled-controller SQL fixture 明确禁止导入 live 安装。

> 本轮已完成：A-owned 15 个对象的 registry 策略、A-owned runtime DDL migration 收敛、strong-auth proof/nonce、provider-proof registration、Secret/ref typed union、capability evidence 的 v12 合同草案，以及脱敏 fixture。合同仍保持 `draft`，远程 KMS/Secret/Kubernetes/provider 能力和非实现 owner 评审尚未完成。
>
> 本地新增：`backend/internal/systembackupsecurity/` 已提供 strong-auth payload canonicalization、请求绑定/时间窗口/签名 adapter 校验、历史 nonce-HMAC 候选生成，以及 provider-proof 注册 envelope/target/state/time/大小校验。数据库 nonce 消费、audit intent 事务接入和真实 issuer/provider adapter 仍待 D/基础设施接入；这些本地单元测试不能替代远程能力证据。

## 1. A 先要交付什么

A 的最终交付不是一个单独的备份 Job，而是一组可被 B/C/D 编排和验证的安全能力：

1. users 与 AI Gateway 对象的 registry、备份/恢复策略、脱敏规则和 verifier 输入。
2. 强认证、nonce、幂等和审计接入点，使敏感 Admin mutation 能够 fail closed。
3. Secret bundle 捕获与版本漂移保护；按合同区分 `external-kms`、`external-secret`、`k8s-secret`。
4. KEK/DEK 相关能力和三类独立签名用途：`capture_certificate`、`acceptance_record`、`catalog_record`。
5. 加密 evidence 的写入、读取、分块、保留、GC 和敏感下载控制。
6. provider-proof 的验签、注册和安全下载验证。
7. P0b 的只读 evidence 验证，以及 P0c 的依赖健康、安全告警、审计闭环。

A 不负责重复实现 B 的 capture/restore runner、C 的 artifact/catalog/provider、D 的 controller/API/Console 编排。A 提供冻结接口、适配器、fixture、权限证明和故障接管证据。

## 2. 开工前检查

- 【已完成】阅读并锁定主计划版本：确认实现输入为 v12，不使用 v11 或更早草案。
- 【已完成】阅读 `contracts/system-backup/v12/contract-manifest.json` 和对应 schema，记录与 A 相关的 draft/missing 项。
- 【已完成】盘点当前 users/AI Gateway migration、repository 运行时 DDL、Secret/ref 使用点和现有 audit/auth 实现。
- 【已完成】建立 A 的对象清单，至少覆盖：
  - users：`users`、`user_quotas`、`enterprise_auth_settings`、`northbound_auth_challenges`、`northbound_sessions`、`northbound_caller_policies`；
  - AI Gateway：`llm_models`、`model_invocations`、`audit_events`、`cost_records`、`risk_rules`、`risk_hits`、`chat_sessions`、`chat_messages`、`instance_gateway_token_aliases`。
- 【已完成】为每个对象登记 owner、classification、backup strategy、restore strategy、normalization、verifier、跨域引用和 redaction 规则。
- 【已完成】在本文第 9 节登记每项交付的负责人、依赖方、交叉评审人和验收证据位置。
- [ ] 若真实项目看板位于外部系统，按第 9 节草案同步负责人、依赖方、交叉评审人和证据位置。
- 【已完成】本地测试前确认 `frontend/dist`、`e2e/playwright-report`、`e2e/test-results` 均不存在；隔离 Go cache 已按 run ID 清理。
- 【已完成】远程 capability probe 前已记录目标 context、namespace UID、现有 Deployment、ServiceAccount 绑定和镜像基线；本轮未创建远程资源。
- 【已完成】使用不会退出交互 shell 的续跑命令补齐 ServiceAccount、Pod、ClusterRoleBinding 与 `auth can-i` 基线；本轮只读、未创建或清理远程资源。
- 【已完成】只使用仓库已有依赖；本轮未安装依赖，无法运行的远程能力测试仍记录为环境阻塞。

## 3. 按阶段执行

### 阶段一：P0-0a——完成能力摸底和合同冻结

目标：让 A 的安全能力成为机器合同的一部分，之后其他 owner 才能稳定接入。

#### 3.1 完成 users/AI Gateway 对象策略

- 【已完成】为上述每张表填写 registry 条目，并确保没有 `unassigned` 对象。
- 【已完成】明确哪些字段是 secret、confidential 或 internal；不因字段关联 `user_id`、`team_id`、`instance_id` 改变表的唯一 owner。
- 【已完成】对认证挑战、会话、调用者策略和 gateway token alias 明确“可备份但不可恢复为可继续执行的活动凭据”的策略。
- 【已完成】对模型、调用、成本、风险、聊天和 AI 专用审计登记 snapshot 边界、恢复后的 normalization 和 verifier 输入。
- 【已完成】为业务 Secret/ref 设计 typed union；只允许 hash、immutable version、closed purpose 和 redacted label 进入合同，不得在 manifest、error、event、audit 或 evidence 中写入 Secret 明文。
- 【已完成】提交 A-owned 对象的 redacted/空数据/异常 fixture 清单；各对象的真实 collector/verifier fixture 仍需在 P0a 接入时补充。
- 【已完成】修正 `enterprise_auth_settings` 合成恢复向量：`ldap_bind_password_ciphertext` 必须写入非 NULL 的空字符串，才能明确清除 LDAP 绑定密码；SQL `NULL` 会继承目标环境的 `LDAP_BIND_PASSWORD`。A 只读恢复校验已拒绝 NULL/非空密文；B 的真实 Secret/ref 版本认证、SQL 写入及 D 交叉评审仍待完成。
- 【候选实现】迁移 050 的企业认证完整行规范化器已保留非密文配置列、映射 `updated_by`，并以 B proof 接口要求认证来源 SQL 密码状态、真实 dump 与准确 Secret/ref 版本；空表同样要求证明。真实 B proof、隔离目标 SQL 写入和 D 评审未完成。
- 【候选实现】迁移 045/056 的 `llm_models` 完整行规范化器已将直接 `api_key` 与 `api_key_secret_ref` 两条凭据路径同时清空并禁用模型，价格保持精确 `DECIMAL(18,8)` 字符串；来源两列分别要求 B 认证 SQL 状态和准确 Secret/ref 版本。A 只读校验现同时拒绝两列残留。B 的真实 proof/写入和 D 评审未完成。
- 【候选实现】迁移 038 的 `instance_gateway_token_aliases` 完整行规范化器已要求 B 的实例映射及目标数据库时间 proof，将过期时间落到目标整秒之前。B 还须清除其 `instances.access_token` 并证明该事实，因为运行时会先查直连 token、再查别名；真实 B proof、目标 SQL 写入和 D 交叉评审未完成。
- 【候选实现】迁移 079 的 `risk_rules` 完整行规范化器已强制全部目标规则停用，要求 B 认证 dump、规则 ID 映射和目标应用启动隔离。当前仓库构造风险规则 repository 时会补种启用的内置规则，而无启用规则时检测服务返回 allow；隔离恢复目标在 A 校验及 D 明确放行前不得启动应用或接收用户流量。B 的真实启动门禁/SQL 写入和 D 评审未完成。
- 【候选实现】迁移 028 的 `risk_hits` 完整行规范化器把 `match_summary` 固定脱敏、`trace_id` 重映射，保留其余历史审计列和 SQL NULL；规则、用户、实例、运行 Pod、模型调用、会话及 gateway 归属均要求闭合映射和 B 独立 proof。真实 dump 认证、目标 SQL 写入及 D 评审未完成。
- 【候选实现】迁移 079 的 `chat_sessions` 完整行规范化器重映射会话 ID、清空 `last_trace_id`，保留历史标题/时间及可空用户和实例映射。运行时仍可按会话 ID 回查模型调用 trace，故 B 须认证跨表 ID 映射和目标占用，D 须联审模型调用内容脱敏与流量放行；真实目标写入尚无回执。
- 【候选实现】迁移 079 的 `chat_messages` 完整行规范化器把 LONGTEXT 内容固定脱敏，重映射会话和 trace，保留 role、请求 ID、序号、时间和可空归属。B 须认证与会话、模型调用等表一致的跨表映射及真实 dump/目标写入；D 尚未交叉评审。

#### 3.2 完成能力 spike

- [ ] 验证外部 KMS 的 GenerateDataKey、身份范围、撤销和版本保留能力。
- [ ] 验证 secret 型 KEK 的精确 resource/version 读取、AES-256-KW 包装、resourceVersion 漂移检测；该能力只能服务 functional-test 边界。
- 【已完成】RBAC functional-test：独立 collector ServiceAccount 和空 Secret allowlist 已部署，`resourceNames=get`、未登记 Secret 拒绝、list/watch/write 拒绝，以及 app Secret 权限拒绝在正式 RBAC 去权前后通过；见顶部 2026-09-23 证据。真实 Secret bundle 捕获 Job、业务 allowlist materialization 和 UID/resourceVersion 漂移验证仍待完成。
- [ ] 验证三类 signing key 使用不同 key ref、不同实际 key material、不同 IAM/audit policy，并能保留历史验证 key。
- [ ] 验证 evidence store 的写、读、删除、Range、大小上限、checksum、CA/TLS 和 provider-proof 能力。
- [ ] 验证灾备环境只凭版本化 bootstrap/ref 能完成 evidence 读取和签名验签，不依赖源控制库。
- [ ] 每项 spike 固化能力结果、provider 版本、配置版本、失败映射和 redacted fixture。

#### 3.3 冻结合同并交叉评审

- 【已完成】将 A 负责的 strong-auth proof/nonce、provider-proof registration、capability evidence、签名 canonicalization 和 redaction 约束落入 v12 合同包；evidence envelope/chunk 与完整 API 资源 schema仍待后续切片。
- 【已完成】本地 runtime parity/负测已覆盖 canonical payload、签名 envelope 排除、domain separator、key version、过期、请求 hash 篡改、WebAuthn method 绑定和历史 nonce-HMAC key；测试位于 `backend/internal/systembackupsecurity/`。
- [ ] 远程补充三类 signing key 的不同实际 key material/IAM/audit policy、并发 nonce 消费和真实 issuer rotation 证明。
- 【已完成】本地已覆盖 Secret/ref 禁止字段、provider-proof target/state/time/size 和 strong-auth 负测。
- [ ] 远程补充 evidence URI、下载范围、二次鉴权、Secret collector RBAC、真实 provider-proof issuer 和 evidence-store 权限负测。
- [ ] 请至少一名非实现 owner（B/C/D）交叉评审；接口缺口回到合同修订，不用私有字段临时填补。
- [ ] 只有合同、registry、fixture、parity test、能力证据和评审记录全部入库后，才将 P0-0a 标记为通过。

**阶段交接给 D：** 合同版本、A 对象 registry、redacted fixture、capability evidence、错误映射和权限负测结果。

### 阶段二：P0-0b——接入安全基础和可接管控制面

目标：让安全操作可审计、可幂等、可接管，并与 D 的 controller/CAS 对接。

#### 3.4 接入 Admin audit、redaction、strong-auth

2026-10-12 A 新增[正式只读授权适配](system-backup-a-admin-read-scope-20261012.md)：从已启用的 `SQLLoginSessions` 与部署侧 SHA-256 固定文件加载 `SystemBackupReadAuthorizer`，每个 GET 请求从 access token 构造独立 `SystemBackupReadScope`，在 D 的查询事务内核对当前安装/config、会话和 hash-pinned RBAC，并在返回前复查。定向本地测试覆盖撤权、跨安装、配置漂移和错误构造输入；新增独立 `-AdminReadOnly` 隔离 MySQL 专项，本地测试、seed、Linux 探针和迁移工具编译通过且缓存清理，远端命令与限定验收判据已交接，由操作者运行。生产 HTTP 仍由 D 接线，完整任务读源及查询/索引另行验收。

2026-10-13 读授权错误分类补强：会话行缺失继续拒绝，用户/会话 SQL 查询故障保留存储不可用原因供 D HTTP 区分；新增跨包定向负测。A 的 `-IncludeSecurity -BuildParallelism 1` 本地门禁通过安全包与 evidence 包测试、离线 MySQL seed 和 Linux 编译，缓存已清理；真实 MySQL 未运行。当前 `-AdminReadOnly` 远端 phase 已同时包含 A 授权锁探针和 D 完整 schema 读取探针，两项分别验收；见[读授权交接](system-backup-a-admin-read-scope-20261012.md)。

- [ ] 在敏感 Admin mutation 前持久化 redacted audit intent；intent 写失败时 fail closed。
- [ ] 将 request ID、actor scope、endpoint、idempotency key、request hash 和合同版本绑定到 audit/nonce/task 或 operation。
- 【已完成】实现 A-owned strong-auth proof canonicalization、请求绑定、issuer/key version、时间窗口和历史 nonce-HMAC 候选校验；入口为 `systembackupsecurity.Verify`。
- [ ] 接入 D-owned nonce ledger 查重与消费；nonce 消费必须与目标 mutation、audit intent 在同一事务完成。
- [ ] 远程/事务集成覆盖 nonce 并发消费、旧 key version、错误签名和真实重放；本地核心已覆盖过期、错误 issuer、错误 request hash、domain separator 和 method 绑定。
- [ ] 对配置 PUT/rollback 强制校验当前 `expected_version`、当前环境和幂等键；rollback 创建新版本，不原地激活历史行。
- [ ] 对降低 retention、关闭 required domain、切换 production/development、修改 Secret/KMS/signing ref 等高风险配置要求 strong-auth 和 reason，并加入负测。
- [ ] 对 response、event、log、manifest、audit、evidence 和 error 统一执行 redaction；redaction 失败不得回退返回原文。

2026-10-13 操作者[远端回执摘录](evidence/system-backup-d-admin-read-mysql-user-receipt-20261013.md)显示同轮 A 授权锁与 D 完整 066/067/080 schema 读取 MySQL 测试均通过，94 文件迁移和资源清理有输出；完整 transcript 与最终进程退出码缺失，A 正式证据门禁仍未闭环。该结果只接收功能测试的限定范围，真实 HTTP 和查询计划另验，见[读授权交接](system-backup-a-admin-read-scope-20261012.md)。

2026-10-13 后续[第二轮完整远端 transcript](evidence/d-admin-read-live-http-mysql-remote-20261013-r2.txt)已补齐闭环：94 文件 fresh migration、A 授权锁、D 完整 schema 与真实 HTTP 三项 MySQL 测试均 PASS；准确 namespace、远端 scratch、本地缓存均清理，无 `CLEANUP_PENDING`，最终 A/D 退出标记均为 0。A 正式读授权对 D 当前 live 列表/operation 读路径的专项门禁通过；总览、配置、完整详情、events/logs、manifest 和索引计划仍各按自身未就绪/待验边界处理。指纹与范围见[读授权交接](system-backup-a-admin-read-scope-20261012.md)。

#### 3.5 交付 Secret bundle、KEK 和签名适配器

2026-10-12 A 本地收口：bootstrap 配置解析现拒绝 `capture_signing`、`acceptance_signing`、`catalog_signing` 三类引用之间，以及它们与任何其他用途复用同一 `identity_hash`；脱敏示例已改为不同身份摘要。`-IncludeSecurity` 本地门禁退出码 0，安全包/evidence 包测试、离线 MySQL seed、Linux 探针和迁移工具编译通过，`CLEANED local-registration-build-cache=True`，真实 MySQL 未运行。这只证明配置引用身份不复用；不同实际 key material、独立 IAM/audit policy、rotation 与历史验签仍需真实 provider 和跨 owner 证据。

2026-10-12 A key history 候选：新增 `ArtifactSigningKeyHistory`，要求三类 artifact signing purpose 均存在，拒绝重复 purpose/key ID/version 及任意两个版本复用相同 Ed25519 公钥；输入和输出公钥均复制，历史已过期或已撤销版本保留供精确验签时拒绝。`TestArtifactSigningKeyHistorySeparationAndCopies` 与 acceptance 候选验签定向测试通过，隔离 Go 缓存已清理。该快照尚无生产 registry 来源认证、私钥实际分离证明、IAM/audit policy 或引用感知的 key retirement；不得据此关闭签名适配器清单。

同日 A 算法选择：v12 artifact `Signature.algorithm` 已从占位改为 `EdDSA`（Ed25519 对 `protected_header + "." + base64url(JCS(payload))` 签名），`SigningKeyRef` 对三类 artifact purpose 施加同一条件约束；provider-proof/strong-auth issuer 的算法范围未随之改写。`publication-redacted-examples.json` 的 `_ACCEPTANCE` 使用合成 Ed25519 真签名，公钥、payload SHA-256 和签名输入 SHA-256 记于 `a-artifact-signature-vectors.json`；Node 合同测试 70/70 与 Go `TestAcceptanceCandidateNodeVector` 通过，隔离 Go 缓存已清理。此为 A 的算法选择和跨语言证据，合同仍为 draft，B/C/D 对 JWS profile 的合同评审与生产接线待完成。

同日 rotation 边界增量：`ValidateArtifactSigningRetention` 以旧/新受信公钥快照和已完成的 artifact/catalog 引用清单为输入，拒绝丢弃仍被引用的旧版本、原身份换公钥、撤销状态回退以及未知引用清单；没有引用必须显式传入非 nil 空清单。确认被撤销的受影响引用以去重的 `DegradedReferences` 返回，供后续 health 写入与人工恢复路径使用，调用方不得把该结果记为 healthy。三项相关定向 Go 测试通过，隔离缓存已清理。真实完整引用扫描、health 同事务写入与签名 provider 接线仍待完成。

后续复查补上历史签名有效时间窗的保留约束：相同 purpose/key ID/version 的新快照不能把 `NotBefore` 向后移或把 `NotAfter` 向前移；时间窗扩展仍允许。缩短时间窗会让既有签名在其原决策时间失去验证资格，即使公钥字节未变。

同日来源安装边界：`ArtifactSigningKeyHistory` 构造要求每个公钥条目的 installation ID 与受信来源 installation 一致；`VerifyAcceptanceCandidate` 的外部绑定及快照入口同样要求该来源匹配。此绑定必须由已认证的 manifest/catalog 与灾备 bootstrap 提供，不得从 `_ACCEPTANCE` 自身推断。配置 `references` 只有 identity hash/version，没有算法字段；EdDSA 算法约束须由解析实际 `SigningKeyRef` 的受信资源适配器执行，不能在 `DecodeBootstrapConfig` 中伪造已检查的结果。跨安装负测已加入定向 Go 测试；生产解析适配器仍待接入。

同轮合同跟进：v12 `ConfigValues.x-invariants` 已登记签名引用身份隔离，后端固定 schema SHA-256 更新为 `6d1c88a46406bc4488b6c7f35545ffc4dfd286e3b020cea916e1980f07e1a865`；Go 固定摘要测试与 Node 配置专项均通过，隔离 Go 缓存已清理。随后修正当前 TypeScript `SystemBackupTask` 六个 schema 必需字段误设为可选的问题；列表读取边界现在拒绝缺字段响应，合同测试 70/70、前端备份读取测试 32/32 通过。未安装前端依赖，故未运行 TypeScript 构建。历史部署 bootstrap 候选仍记录旧 schema 摘要，不追溯改写其来源证据；使用当前 schema 前须重新生成并审核部署侧 pin。

- [ ] 普通 capture Job 不读取业务 Secret；需要时由独立 secret-capture Job 使用最小权限身份完成 bundle 捕获。
- [ ] 捕获前后校验 Secret UID/resourceVersion；发生漂移时返回 `secret_bundle_failed`，不得静默读取新值。
- [ ] 每个 part 使用独立 DEK，只保存 wrapped DEK；禁止跨 Pod 传递明文 DEK/KEK，禁止 controller 复制业务 Secret 明文。
- [ ] 对三种 KEK variant 实现精确出口、短期身份、到期和撤销证明；未使用的 endpoint 必须被拒绝。远程验证命令见 8.5。
- [ ] 为 `capture_certificate`、`acceptance_record`、`catalog_record` 建立完全分离的 signer/verifier 配置和 key history。
- [ ] 确认签名 key rotation 不影响仍被 artifact/catalog 引用的历史验签；key compromise 只能进入 degraded/人工恢复路径。
- [ ] 将 external action 的完整 canonical payload、checksum、content-length、action key 和 deadline 在发送前持久化，禁止发送后再脱敏改写。

#### 3.6 完成 evidence store 基础

2026-10-12 敏感下载边界复查：现有 SQL 下载授权已复查当前 JWT/会话、RBAC、owner、claim、Range 与结果审计。`confidential`/`sensitive` 下载现要求在 claim 所在的 `Registry.WithLocked` 事务内执行 `SensitiveDownloadAuthenticator`；缺失或拒绝时 claim 与 intent 一起回滚，provider 不读取。`SQLDownloadAuthority` 仅向适配器提供该已锁定的 `*sql.Tx`，要求在同一事务消费绑定 actor、evidence ID、claim、byte range 的新 proof nonce；提交后、provider 读取前和返回明文前仍复查当前授权。本次 `TestDownload|TestEvidenceHTTP` 定向测试退出码 0；随后 `-IncludeSecurity -BuildParallelism 1` 全量本地门禁退出码 0，安全包/evidence 包、离线 MySQL seed、Linux MySQL probe 和迁移工具编译通过，`CLEANED local-registration-build-cache=True`；Linux probe SHA-256 为 `067bd8f24267f5258332bac96cc763d8a0b3590601808031fdbc27d57a4f6a8e`，真实 MySQL 未运行。[v12 下载操作、nonce 结果锚点及 audit ID 合同缺口](system-backup-a-sensitive-download-contract-gap-20261012.md)已单列供 D 评审。**真实 proof verifier、nonce ledger 和审计事务适配器尚未接线；当前不能将敏感下载标为可用或完成。**

- [ ] 建立 evidence registry、typed ref、inline/envelope、chunk metadata 和 owner/lease 模型。
- [ ] evidence 写入使用 envelope encryption；保存 content checksum、object checksum、size、chunk-list root、KEK identity/version 和 protected-until。
- [ ] 只允许通过 `sev_` evidence ID 读取；拒绝调用者直接提供的 URI，防止 SSRF、越权和跨租户读取。当前仍待 evidence adapter/API 接入。
- [ ] 敏感 evidence 下载必须二次鉴权、按 Range 重新校验 owner/size/redaction，并写审计 result。
- [ ] provider 不确定时记录 `write_unknown`，不得伪造 ready；写入和删除都必须可由 controller 接管。
- [ ] 预留 evidence GC 的引用保护：仍被 task、artifact、import、promotion、retry 或 audit 引用的 evidence 不得清理。

**阶段交接给 D：** A 的 audit/redaction/strong-auth 接入点、Secret/KEK/signing/evidence adapter、数据库事务边界、权限矩阵、故障注入结果和可接管记录。

### 阶段三：P0a——接入备份闭环

目标：A 的安全能力可被 D 编排，且不把技术执行结论和灾备资格结论混在一起。

2026-10-13 A 业务域增量：新增 [`systembackupbusinessa`](../backend/internal/systembackupbusinessa/capture.go) 的 15 表闭集门禁、只读 RepeatableRead 来源计数快照与[proof 依赖的对比器](../backend/internal/systembackupbusinessa/verifier.go)。覆盖 `users` 六表、`ai_gateway` 九表及各自 `secret`/`confidential`/`internal` 分类；全局 v12 registry、实测 schema hash、对象策略和交叉评审须全部冻结，否则在触碰 SQL 前拒绝。计数与验证只接受由独立部署 SHA-256 pin 构造的不可变 scope；source/dump 证据输入也必须绑定该 registry 与 schema 摘要。pin 不能来自请求或待验证 JSON 自身。计数器逐表检查 InnoDB，任一查询或提交失败不返回部分结果；对比器只在 B 的 capture proof 认证 source/dump 同一 checkpoint 后输出脱敏计数与 evidence ref，任何 checkpoint、上下文或计数差异同时返回失败 check 与完整性错误。[v12 verifier 合同](../contracts/system-backup/v12/verifier-contract.schema.json)已有 A 的 `users` 8 项与 `ai_gateway` 11 项 check ID、闭集 expected/actual 及失败映射 **draft**，仍需非实现 owner 交叉评审；共享合同测试直接执行 70/70 通过。初版 Go 定向测试通过，临时 Go 缓存与遥测目录已清理；未安装依赖。当前 registry 仍为 draft，且没有运行时 schema hash 复核、已接线的 B proof、dump 行验证、规范化器或生产编排，因此此增量不构成 P0a 完成或备份可用性证明。

本轮追加的 Go 跨文件测试逐项比对 A 运行时代码生成的 8/11 个 check ID 与 v12 合同闭集，并核对 v12 Check 必需字段。首次 `go test ./internal/systembackupbusinessa -count=1 -p=1` 输出包测试 `ok`，但 Windows `vet.exe` 异常退出 `0xc0000043`，整体退出 1；相同命令重试后整体退出 0，`CLEANED a-businessa-contract-retry=True`。两轮均未安装依赖，临时缓存和遥测目录已清理。

后续 A 元数据投影 `VerifyBusinessMetadata` 在 B proof 和全部检查通过后，才返回 `users`/`ai_gateway` 分别 6/9 个对象的行数汇总、两个已认证 evidence ID 及 registry/schema/checkpoint/capture-context 摘要。来源或 dump 计数溢出、完整性差异或 proof 失败都不返回部分元数据。返回类型没有 `PartResult.status`、staging 字节或 eligibility；D 必须另外取得 B 的 sealed staging、Job 身份和 certificate 事实才能组装正式 part。本地 `go test ./internal/systembackupbusinessa -count=1 -p=1` 退出 0，`CLEANED a-businessa-metadata-test=True`，未安装依赖。

[A 业务校验交接](system-backup-a-business-verify-handoff-20261013.md)明确 pin、同 checkpoint 证明、A/B/D 数据边界及待补的生产 `PartResult` 输入。新增的 A 错误分类只映射可确定的统计/绑定无效与证据缺失；B proof 的签名、provider、权限或超时原因保留原类型。

同日增加 `users` 的非凭据恢复投影及纯规范化入口：按独立目标映射生成禁用的用户行，替换历史密码为不可认证且满足 `NOT NULL` 的占位值，清空 LDAP 外部身份、登录别名与上次登录；源投影不承载原密码。此路径尚未读取 B 的认证 dump 或写入隔离目标库，且目标身份唯一性与映射来源仍由恢复编排证明。详见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

2026-10-13 A 业务恢复后续增量：15 张 A-owned 表均已有候选完整行规范化入口，最后补齐 `model_invocations`、`audit_events`、`cost_records`；同时增加网关历史跨表映射校验与六表组合入口，要求 B 的整批同源证明和各表 proof 全部通过才返回任何候选行。完整 A 业务包 Go 测试离线退出 0，测试缓存已清理，未安装依赖。真实 B dump/certificate、同一 checkpoint、隔离目标 SQL 写入、大数据量及 D 交叉评审尚未完成，不构成 P0a 或恢复验收。详见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

2026-10-14 A 业务恢复统一接线候选：新增 `NormalizeBusinessForRestore`，用一份固定输入组合 users 六表和 AI Gateway 九表，绑定封存 dump 的完整 15 表计数、registry/schema/checkpoint/capture-context/evidence 与隔离目标身份/数据库时间，闭合 users/models/rules 和 B instances 映射。整批 B 来源证明、原各表证明、全部转换和最终当前授权复查均成功后才返回候选行；任何失败或取消返回零部分结果。证明器只能取得独立输入副本。B 的真实 dump/目标权威适配与 SQL 写入、D 公共合同冻结及生产编排仍待完成，registry 保持 draft；组合接口的 D 候选评审已于同日接收，见上方当前状态。接口和验收边界见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

同轮[最终本地记录](evidence/a-business-restore-local-20261014.json)已覆盖完整 A 业务包回归/默认 vet、该轮源码 Linux tagged 探针与迁移 CLI 编译，退出 0；共享合同 70/70、对象向量 3/3。43 份 A 包 Go 源码摘要在该轮最终验证前后无漂移，缓存和二进制均已清理，未安装依赖。初始重叠源码修改的 profile 和一次错误负测失败分别保留；该记录早于新增十五表 MySQL 探针，不作为其通过证明。真实 B 证明/写入器、15 表 FK/NULL/唯一性/大数据量仍待完成。同日首份 D 六边界评审未覆盖组合入口，后续[D 组合接口评审](system-backup-d-a-business-batch-review-20261014.md)已单独接收候选控制流，A 核对其 8 份指纹一致；不等于 registry 冻结或生产放行。

后续增量增加 users 批量映射闭集与 `user_quotas` 规范化：拒绝缺失/重复映射及孤儿配额，对每个目标用户以独立容量作上限校验，CPU 使用准确的两位十进制字符串；失败不返回部分结果。隔离目标身份、容量来源和 restore-write 权限尚未由 B/D 认证，故仍不写目标库，也不宣称业务恢复通过。见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

同日追加 `northbound_auth_challenges` 完整 SQL 行的纯规范化与批量映射：旧 nonce hash 按草案策略保留，但状态、过期时间和使用时间强制失活，来源 IP 不进入目标行。生产状态 `processing` 已纳入草案来源闭集。B 的 dump、目标时钟/身份、唯一性与写入证明仍待接线，见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

同链路追加 `northbound_sessions` 完整行纯规范化：通过已闭合的用户映射重建 FK，校验历史 token hash/JSON/scope 后强制撤销、过期及目标时间复查；批量 ID、session ID 和当前 hash 冲突不返回部分结果。B 的认证 dump、目标身份/时钟和写权限仍待接线，D 的策略交叉评审仍未完成，见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

随后补齐 `northbound_caller_policies` 完整行纯规范化：主键用户与可空更新者都通过用户映射，scope 只接受生产闭集，所有恢复策略禁用；重复用户或未知权限不返回部分结果。真实目标占用、B dump/写入权限和 D 交叉评审仍待完成，见[业务校验交接](system-backup-a-business-verify-handoff-20261013.md)。

同日新增 A 的[只读恢复目标校验器](../backend/internal/systembackupbusinessa/restore_verify.go)：在 B 的目标读证明前后复查之间，以只读 RepeatableRead 事务核对 15 张业务表的 InnoDB/行数及 9 项恢复失活规则；v12 草案合同封闭 users 11 项、AI Gateway 13 项 check。共享合同测试 70/70 通过。B 的真实目标证明、隔离 MySQL 恢复验收、逐行业务值与 Secret/ref 校验仍未接入；当前代码不执行写恢复。

- [ ] 对接 B 的 capture certificate、checkpoint、staging resource 和 job identity；A 只验证冻结合同，不重新实现 runner。
- [ ] 对接 C 的 artifact/finalizer/external-action/catalog fixture；只允许使用已持久化且精确绑定的 action payload。
- [ ] 为用户/AI Gateway 业务 part 生成 redacted snapshot、统计结果、verifier check 和 evidence ref。
- [ ] 验证 audit snapshot cutoff、系统备份自身审计例外和最大纳入 audit ID，避免 gate 内新增审计被错误纳入 artifact。
- [ ] 验证 Secret bundle、KEK、签名和 evidence 失败时的精确 failure category；必选 part、完整性、redaction 或 staging cleanup 失败必须阻断成功。
- [ ] 验证 `_ACCEPTANCE` 的技术前置条件与 `artifact_registered` 的资格线性化点分离；A 不在 manifest 中伪造最终 eligibility。
- [ ] 注入 controller 重启、leader/claim 切换、capture certificate 过期、credential revoke、provider 响应丢失、签名写入重复和 payload conflict，证明可接管且不盲重放。
- [ ] 使用固定基础 smoke 和 `large-smoke.v1` 相关 fixture 验证数据量、证据容量、deadline、日志和清理边界。

**阶段完成判据：** A 的 part、Secret/KEK、signing、evidence、audit 结果可独立验证；失败边界明确；D 能在不复制 A 实现的情况下完成固定备份闭环。

### 阶段四：P0b——恢复侧只读证据验证

目标：新安装或隔离演练可以验证证据，却不依赖源控制库，也不引入生产恢复执行。

2026-10-14 A 独立本地收口：[只读验证输入/取消/reader 边界](system-backup-a-evidence-read-boundary-20261014.md)为 `VerifyDetachedEvidence` 与 `OpenRange` 固定有界 manifest chunk 快照；provider 回调不能破坏有效输入或修正一份最初错误的 hash 来获得成功。最终 Stat、成功 Unwrap 和返回明文前复查取消；typed nil reader 拒绝，错误附带 reader 关闭，取消时 DEK 擦除且不继续读 frame。完整 evidence 包 169 主项/1240 子项及默认 vet 一次通过，退出 0，六份限定源码摘要一致；准确缓存/二进制目录已清理，未安装依赖、执行 SSH 或读取待通知的十五表远测结果。该项只关闭 A 本地组件安全边界，不关闭下面的 committed artifact、签名/灾备来源及 B/C/D 生产接线清单。

2026-10-12 A 本地增量：新增 `VerifyDetachedEvidence`，以已认证的 `Manifest` 与 immutable `Ref`、受信灾备 bootstrap scope 为输入，只经只读 `Stat/Range` 和 `Keys.Unwrap` 分块校验完整对象、每块密文与明文 checksum、envelope 和固定对象版本；读取前要求 installation、store identity/version、KEK identity/version 和服务端派生对象键均与 scope 一致，不返回明文，也不连接源安装数据库。测试使用超过 HTTP `MaxResponse` 的对象，覆盖分块篡改、provider 摘要/大小/版本漂移、缺失 provider、KEK 失败、manifest 篡改和 scope 错配。随后修正共用 `readExact` 对 provider `Close` 错误的忽略：延迟报告的读取失败现在返回 unavailable，读取缓冲区被擦除；detached verifier 和 `OpenRange` 均拒绝 typed nil 适配器。`TestVerifyDetachedEvidence|TestEnvelopeChunkRangesAndTampering|TestDownload` 定向 Go 测试退出码 0，隔离缓存已清理。`artifact-common.schema.json` 的 `Signature.algorithm` 已由 A 选为 EdDSA，跨方签名 profile 仍待评审；现有 provider/strong-auth JCS 实现都是受限 payload 编码器，不能拿来代替 artifact 的嵌套 JCS 验签。**当前 Manifest/Ref 和 scope 来自 A 本地夹具；committed artifact 的签名、来源、read grant 和灾备安装真实 provider 仍未接入，P0b 不据此标为完成。**

2026-10-12 A 验签候选增量：新增 `VerifyAcceptanceCandidate`，严格解码 v12 `_ACCEPTANCE` 的固定字段，按 JWS 风格的 `protected_header + "." + base64url(JCS(payload))` 候选 Ed25519 profile 核对签名、purpose/key ID/version/header、历史 key 在 `decision_at` 的有效期与当前撤销状态，并对调用方提供的 backup/attempt/manifest/marker 精确绑定；重复历史 key 身份直接拒绝。reason code 的排序、闭集和 JCS hash 也先于验签检查。`TestVerifyAcceptanceCandidate` 在低并发隔离 Go 缓存中通过，临时缓存已清理；早期尝试曾被本机 Go 工具 `0xc0000043` 中断，不计为测试结论。该实现仍是 **A 本地候选**：A 已选择 EdDSA/JWS 输入，但该 profile 的跨方评审尚未完成，实际 catalog/manifest 来源与 production key registry 未接线，不作为完整灾备验签或 P0b 接收证据。

同轮新版 `-IncludeSecurity -BuildParallelism 1` 全量本地门禁退出码 0：安全包/evidence 包、离线 MySQL seed、Linux MySQL probe 和迁移工具编译通过，Linux probe SHA-256=`8ab2f968176737f61ef18212682ac412439d0d2a1aebaaead3b313dc14b47a84`，`CLEANED local-registration-build-cache=True`。真实 MySQL 和 committed artifact 端到端验证未运行。

- [ ] 为 committed artifact fixture 提供只读 evidence adapter/verifier；真实 artifact 集成等待 P0a 交付。
- [ ] 在 catalog import、artifact full verify、drill、preflight 中验证 manifest/index/marker/acceptance/catalog 的签名、checksum、版本和有效期。
- [ ] 验证灾备安装 bootstrap 缺失、CA 缺失、KEK 不可用、evidence store 不可用、任一签名 key 缺失或签名无效时的精确失败映射。
- [ ] 验证 control-evidence sidecar 只读、redacted，且恢复副本不包含 `system_backup_*`、lease、gate、participant 等控制表数据行。
- [ ] 对 production-readonly preflight 只提供证据验证和报告失效判断，不提供 restore execute。
- [ ] 验证 evidence health 的 `healthy/degraded/unknown` 和过期派生规则，区分历史 eligibility 与当前 artifact/evidence 可用性。
- [ ] 交付只读访问权限负测：普通 artifact reader 不能写、删、读越权 evidence，也不能取得 KMS unwrap/decrypt 或 catalog append 能力。

**阶段交接给 D：** committed artifact 验证 fixture、灾备 bootstrap 矩阵、只读 verifier 结果、evidence health 规则、redacted sidecar 和权限负测。

### 阶段五：P0c——安全告警、审计闭环和 GC

目标：让长期运行中的安全依赖、证据保留和异常状态可监控、可恢复、可审计。

- [ ] 接入 dependency health：artifact credential、CA、KEK、signing、catalog、evidence、attestation；按 immutable identity/version 持久化，不依赖进程缓存。
- [ ] 接入安全告警：checksum/signature/catalog conflict 立即 critical；Secret/KEK/signing/evidence 不可用、provider-proof 无法验证、敏感下载异常和 evidence GC 失败按机器 alert registry 触发。
- [ ] 持久化告警连续失败、last eligible success、first/last observed 和 recovery 条件；controller 重启不能清零连续计数。
- [ ] 实现 evidence GC 的引用扫描、分批删除、接管和失败重试；外置 evidence 删除必须先于 registry envelope，pending/write_unknown/write_failed/delete_failed 不能丢登记。
- [ ] 验证 active promotion hold、artifact/import/retry 引用和 protected-until 会延长 evidence 保留；control metadata 达到容量门槛时保留安全余量。
- [ ] 汇总四种真实部署矩阵中的 A 证据：权限负测、灾后解密、历史 key rotation、redaction、敏感下载、GC 和清理证明。
- [ ] 生成只含 redacted 摘要、命令、资源标识、结果和清理状态的 release evidence，不保留明文 Secret、DEK、KEK、原始日志或临时 staging。

## 4. A 与其他角色的交接边界

| 对接方 | A 提供 | A 接收并检查 |
| --- | --- | --- |
| B | Secret-capture 身份/接口、capture certificate 验证、redacted evidence 写入和错误映射 | Job identity、checkpoint/certificate、staging 生命周期、status-relay 结果和权限证明 |
| C | acceptance/catalog 签名验证、provider-proof、evidence 读写/删除边界 | artifact/finalizer/external-action/catalog 的冻结 schema、provider capability 和 action fixture |
| D | audit/redaction/strong-auth、Secret/KEK/signing/evidence adapter、health/alert/GC 输入 | controller claim/CAS、task/operation/resource 生命周期、feature gate、API/Console 编排和验收报告 |

每次交付都必须按以下顺序验收：合同版本 → schema/fixture → 权限证明 → 故障接管测试 → 非实现 owner 签收。任何缺口回到合同或对应 owner 修复，不能默认由 D 兜底。

## 5. 最小验收清单

- [ ] A 对象全部进入 registry，strategy/classification/verifier/redaction 完整，`unassigned` 为空。
- [ ] v12 合同、Go/TypeScript DTO parity、redacted fixture、错误映射和跨 owner 评审完成。
- [ ] Strong-auth proof、nonce、幂等、audit intent/result 在并发、重放、轮换和重启下正确。
- [ ] 普通 capture、secret-capture、controller、publish、drill/preflight Job 的 Secret/KMS/evidence 权限完成正负测。
- [ ] 三类签名用途使用独立 key material，并覆盖 rotation、撤销、过期、错误用途和历史验签。
- [ ] evidence 的 redaction、envelope、chunk、checksum、Range、download audit、GC 和 provider unknown 状态可验证。
- [ ] controller 重启、leader 切换、DB claim 丢失、provider 响应丢失和 credential revoke 后不盲重放、不丢 evidence、不伪造成功。
- [ ] 灾备安装在源数据库、源 Kubernetes API、源 Secret 和源网络不可用时仍可按合同验签、解密和验证 evidence。
- [ ] 安全告警连续状态、dependency health、first-enabled 和 evidence GC 状态持久化，重启不重置。
- [ ] 测试结束后只清理本次 run 创建且 ownership 可证明的产物；工作树无明文 Secret/DEK/KEK、临时 staging 和测试构建产物。

## 6. 明确不做的事情

- 不实现 P1 的 backup-agent 配置、token、任务回调、schedule 或生产 restore execute。
- 不实现 B 的 workload quiesce、capture/restore runner、status-relay 或 normalizer。
- 不实现 C 的 artifact provider、catalog scan/import 主流程和 prune provider。
- 不由 A 私自新增或修改公共状态、错误、字段、指标 label；所有公共语义先回到 v12 合同。
- 不把 Secret 明文、KEK、DEK、原始日志、外部 URI 或未经 redaction 的 provider 响应写入仓库、数据库、manifest、evidence 或测试报告。

## 7. 推荐提交顺序

1. A 对象盘点、registry 草案、redacted fixture 和能力缺口清单。
2. v12 安全合同、parity test、权限负测和交叉评审记录。
3. audit/redaction/strong-auth/nonce 与配置版本接入。
4. Secret bundle、KEK、三类 signer/verifier 和权限证明。
5. evidence adapter/registry/chunk/download/GC 与 provider-proof。
6. P0a 备份闭环 fixture、故障接管测试和 D 交接。
7. P0b 只读 verifier、灾备 bootstrap 验证和 evidence health。
8. P0c 安全告警、GC 接管、四矩阵证据和最终签收。

## 8. 远程测试命令

以下命令必须在**包含本轮代码且已构建/发布对应 immutable app image** 的远程 Linux/Kubernetes 运维环境执行。命令不把 Secret 写入参数；`EXPECTED_APP_DIGEST` 必须替换为该代码版本镜像的 digest。脚本成功后只保留脱敏摘要，并按 run ID 删除临时 namespace。

### 8.1 全新库 migration replay【已完成】

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
KUBE_CONTEXT='kubernetes-admin@kubernetes'
SOURCE_NAMESPACE='clawmanager-zhanghui08-system'
TEST_NODE='node1'
EXPECTED_APP_DIGEST='REPLACE_WITH_THE_SHA256_DIGEST_OF_THIS_COMMIT_IMAGE'
test -n "$EXPECTED_APP_DIGEST"
kubectl --context="$KUBE_CONTEXT" config current-context
kubectl --context="$KUBE_CONTEXT" --namespace="$SOURCE_NAMESPACE" get pod -l app=clawmanager-app -o wide
KUBE_CONTEXT="$KUBE_CONTEXT" \
SOURCE_NAMESPACE="$SOURCE_NAMESPACE" \
TEST_NODE="$TEST_NODE" \
EXPECTED_APP_DIGEST="$EXPECTED_APP_DIGEST" \
bash scripts/system-backup-fresh-migration-smoke.sh
```

实测结果（2026-09-20）：`PASS fresh-migration-replay=001..079 applied=92 exact_filenames=yes`，app image digest 为 `sha256:3bac934ba4be4bdf83855537751f39fa3608c85d406a2693e39237595420c49a`，MySQL 为 `8.4.8`，临时 namespace `sbk-mig-260920065627-2ae8` 已按 UID 清理完成。若镜像尚未包含本轮 migration，脚本应因 digest 或 migration catalog 不一致失败，不要绕过检查。

### 8.2 已有安装只读核对 A-owned migration/schema【已完成】

```bash
set +e
(
set -euo pipefail
KUBE_CONTEXT='kubernetes-admin@kubernetes'
NAMESPACE='clawmanager-zhanghui08-system'
DATABASE='clawmanager'
kubectl --context="$KUBE_CONTEXT" --namespace="$NAMESPACE" rollout status deployment/mysql --timeout=180s
kubectl --context="$KUBE_CONTEXT" --namespace="$NAMESPACE" exec deploy/mysql -- sh -c 'set -eu; MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database="$1" --batch --raw --skip-column-names --execute="SELECT filename FROM schema_migrations WHERE filename = '\''079_add_a_owned_chat_and_risk_tables.sql'\''; SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('\''chat_sessions'\'', '\''chat_messages'\'', '\''risk_rules'\'') ORDER BY TABLE_NAME; SELECT TABLE_NAME, COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('\''chat_sessions'\'', '\''chat_messages'\'', '\''risk_rules'\'') GROUP BY TABLE_NAME ORDER BY TABLE_NAME;"' mysql "$DATABASE"
)
READ_ONLY_STATUS=$?
echo "read-only schema check status=$READ_ONLY_STATUS; interactive shell remains open"
```

实测结果（2026-09-20）：migration `079_add_a_owned_chat_and_risk_tables.sql` 已登记；`chat_messages`、`chat_sessions`、`risk_rules` 均为 `InnoDB`；三张表的统计结果均为 1。该命令只读，未创建远程资源。

### 8.3 live schema-hash candidate（仅在远程只读账号/Pod 已准备后）

当前状态：按本轮决策跳过。远程 `k8s-master` 环境没有 Node.js；按“不安装依赖”约束暂不在远程安装。应改在已具备 Node.js 且能访问同一 Kubernetes context 的运维机执行，或由平台提供临时 Node.js 工具容器后再执行。该 candidate 仍不能标记为 reviewed 或打开 `schema_hash_evidence_present`。

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
KUBE_CONTEXT='kubernetes-admin@kubernetes'
NAMESPACE='clawmanager-zhanghui08-system'
DATABASE='clawmanager'
NAMESPACE_UID="$(kubectl --context="$KUBE_CONTEXT" get namespace "$NAMESPACE" -o jsonpath='{.metadata.uid}')"
test -n "$NAMESPACE_UID"
INSTALLATION_IDENTITY_HASH="$(node -e 'const {createHash}=require("node:crypto");process.stdout.write(createHash("sha256").update("k8s-namespace-uid-v1\0"+process.argv[1]).digest("hex"))' "$NAMESPACE_UID")"
node scripts/system-backup-schema-hash-capture.mjs \
  --kubectl-context "$KUBE_CONTEXT" \
  --namespace "$NAMESPACE" \
  --database "$DATABASE" \
  --installation-identity-hash "$INSTALLATION_IDENTITY_HASH" \
  --installation-identity-version 'k8s-namespace-uid-v1' \
  > /tmp/system-backup-schema-hash-candidate.json
test -s /tmp/system-backup-schema-hash-candidate.json
node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync("/tmp/system-backup-schema-hash-candidate.json","utf8")); if(x.status!=="candidate"||x.records_cleanup?.verified_absent!==true) process.exit(1); console.log(JSON.stringify({status:x.status,schema_hash:x.result?.hash,records_cleanup:x.records_cleanup},null,2))'
rm -f -- /tmp/system-backup-schema-hash-candidate.json
test ! -e /tmp/system-backup-schema-hash-candidate.json
```

即使 candidate 生成成功，也不能标记为 reviewed 或打开 `schema_hash_evidence_present`；A/B/C 批准、证据登记和合同 gate 仍需后续完成。

### 8.4 A-owned runtime/contract 回归【已完成】

以下命令只使用仓库已有的 Node.js、Go 和缓存，不安装依赖。适用于已经 checkout 本轮代码、且远程运维机预装 Node.js/Go 的环境；不会创建 Kubernetes、数据库或 provider 资源。

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
RUN_ID="a-local-strong-auth-$(date -u +%Y%m%dT%H%M%SZ)"
OWNER_MARKER="A:system-backup-security"
GOCACHE_DIR="/tmp/${RUN_ID}-gocache"
mkdir -p "$GOCACHE_DIR"
cleanup() { rm -rf -- "$GOCACHE_DIR"; }
trap cleanup EXIT

test -n "$RUN_ID"
test -n "$OWNER_MARKER"
test -f backend/internal/systembackupsecurity/strongauth.go
test -f backend/internal/systembackupsecurity/providerproof.go
(cd backend && GOCACHE="$GOCACHE_DIR" go test ./internal/systembackupsecurity)
node scripts/system-backup-contract-artifacts.test.mjs
node scripts/system-backup-contract-check.test.mjs
node scripts/system-backup-contract-check.mjs --check
cleanup
trap - EXIT
test ! -e "$GOCACHE_DIR"
```

### 8.5 Kubernetes Secret collector RBAC 负测【已完成】functional-test；可只读复测

2026-09-23 的正式去权结果已证明 functional-test collector 和 app 权限矩阵通过。下面保留的是 2026-09-20 的历史发现/失败基线，不再代表当前状态；不要重跑会 `apply` 或删除 binding 的 cutover 脚本。当前只读复测运行 `scripts/system-backup-a-rbac-readonly-probe.sh`，见 [A 远程验证手册](./system-backup-a-remote-validation.md)。

这组命令只做 SubjectAccessReview，不读取 Secret data，不创建或删除资源。将四个变量替换为**已经存在**的 namespace、普通 app ServiceAccount、独立 secret-capture ServiceAccount、合同登记的 Secret 名称，以及一个未登记的 Secret 名称；不要把 Secret 值写入命令行。

历史前置说明（2026-09-20）：当时尚无独立 `secret-capture` ServiceAccount 或 functional-test allowlist。现在仓库有 `deployments/k8s/system-backup-secret-capture-functional-test.yaml`，正式去权时已部署并通过远程权限验证。业务 Secret allowlist 的 materialization 和真实捕获链路仍未完成，不能将空 functional-test Secret 当作业务 Secret。

先运行只读发现命令：

```bash
set +e
set -uo pipefail
KUBE_CONTEXT='kubernetes-admin@kubernetes'

retry_read() {
  local attempt=1 output rc
  while [ "$attempt" -le 4 ]; do
    output="$("$@" 2>&1)"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      printf '%s\n' "$output"
      return 0
    fi
    if printf '%s' "$output" | grep -Eqi 'timed out|deadline exceeded|temporarily unavailable|connection reset'; then
      printf 'RETRY %s/4: %s\n' "$attempt" "$output" >&2
      attempt=$((attempt + 1))
      sleep 2
      continue
    fi
    printf '%s\n' "$output" >&2
    return "$rc"
  done
  printf 'INCONCLUSIVE: kubectl request failed after retries: %s\n' "$output" >&2
  return 75
}

retry_read kubectl --request-timeout=30s --context="$KUBE_CONTEXT" config current-context
retry_read kubectl --request-timeout=30s --context="$KUBE_CONTEXT" get deploy -A -l app=clawmanager-app \
  -o custom-columns='NAMESPACE:.metadata.namespace,DEPLOYMENT:.metadata.name,APP_SA:.spec.template.spec.serviceAccountName'
retry_read kubectl --request-timeout=30s --context="$KUBE_CONTEXT" get deploy -A -l app=clawmanager-system-backup-controller \
  -o custom-columns='NAMESPACE:.metadata.namespace,DEPLOYMENT:.metadata.name,CONTROLLER_SA:.spec.template.spec.serviceAccountName'
retry_read kubectl --request-timeout=30s --context="$KUBE_CONTEXT" get sa -A \
  -o custom-columns='NAMESPACE:.metadata.namespace,SERVICE_ACCOUNT:.metadata.name' | \
  awk 'NR == 1 || tolower($0) ~ /secret|capture|backup|clawmanager-app/'
retry_read kubectl --request-timeout=30s --context="$KUBE_CONTEXT" get pods -A \
  -o custom-columns='NAMESPACE:.metadata.namespace,POD:.metadata.name,SERVICE_ACCOUNT:.spec.serviceAccountName' | \
  awk 'NR == 1 || tolower($0) ~ /secret|capture|backup|clawmanager-app/'

echo 'DONE: discovery finished; RETRY/INCONCLUSIVE lines remain unverified and must not be marked complete'
```

通常可以从第一条 deployment 输出得到 `NAMESPACE` 和 `APP_SERVICE_ACCOUNT`。若没有独立 collector deployment/job/pod，`COLLECTOR_SERVICE_ACCOUNT` 没有合法值，8.5 不能执行；这不是命令填写问题，而是远程部署缺少 P0 所需安全边界。合同登记的 Secret 名称也不能通过 `kubectl get secret` 随便挑选，必须来自 active system-backup config 的 `secret_allowlist` 展开结果；当前代码尚未 materialize 该 registry，需由平台提供对应的 functional-test 名称和 registry hash。

远程发现结果（2026-09-20，`clawmanager-zhanghui08-system`）：`APP_SERVICE_ACCOUNT=clawmanager-app`；namespace 内只有 `clawmanager-app` 和 `default` 两个 ServiceAccount；当前没有独立 secret-capture collector。`default` 被 Redis 等普通 Pod 使用，不能作为 collector；因此 8.5 的 collector 正向 `get` 证明目前阻塞，不能用其他 Pod 或其他 namespace 的身份替代。进一步的只读 `kubectl auth can-i` 结果显示 app SA 对 Secret 的 `get/list/watch/create/update/patch/delete` 全部为 `ALLOW`，普通 app 权限负测失败；已发现 `clawmanager-app-cluster-admin`、`clawmanager-zhanghui08-app-cluster-admin` 两个 `cluster-admin` ClusterRoleBinding 候选，必须先核对 subject namespace 后移除目标 app 的宽权限绑定。

远程基线复核（2026-09-20）【已完成】：context 为 `kubernetes-admin@kubernetes`，namespace UID 为 `337cfe30-2c17-4b8e-b32a-760778b8098e`；`clawmanager-app` Deployment 使用 ServiceAccount `clawmanager-app`，镜像为 `10.130.14.23:5000/clawmanager:backup-test-zh-fix9`。同 namespace 还观察到 `clawmanager-team-redis`、`hermes-runtime`、`minio`、`mysql`、`openclaw-runtime`、`skill-scanner`、`workspace-store`。随后列举 ServiceAccount 时返回 `etcdserver: request timed out`，会话停止，因此该次运行没有形成新的 ServiceAccount、Pod、ClusterRoleBinding 或 `auth can-i` 结论，也没有创建或清理远程资源。

远程 RBAC 续跑（2026-09-20）【已完成】：`clawmanager-app` ServiceAccount 存在，两个 app Pod 均以该身份运行；预期的 `clawmanager-system-backup-secret-capture` ServiceAccount 返回 NotFound。`clawmanager-app-cluster-admin` 绑定指向另一 namespace `clawmanager-system`，不得作为本安装删除目标；`clawmanager-zhanghui08-app-cluster-admin` 精确绑定当前 namespace 的 `clawmanager-app` 到 `cluster-admin`。以该 app 身份执行 SubjectAccessReview 时，Secret 的 `get/list/watch/create/update/patch/delete` 全部返回 `yes`。因此“普通 app 不得读取或修改 Secret”的负测已执行但结果为 **FAIL**；collector 精确 `resourceNames=get` 正向证明因专用 ServiceAccount 和 functional-test allowlist 均缺失保持 **BLOCKED**。在补齐显式 runtime/sync 最小权限前，不得直接删除 live binding，以免中断现有实例管理能力。

```bash
set +e
(
set -euo pipefail
KUBE_CONTEXT='kubernetes-admin@kubernetes'
NAMESPACE='clawmanager-zhanghui08-system'
APP_SERVICE_ACCOUNT='clawmanager-app'
COLLECTOR_SERVICE_ACCOUNT='clawmanager-system-backup-secret-capture'
REGISTERED_SECRET_NAME='REPLACE_WITH_REGISTERED_SECRET_NAME'
UNREGISTERED_SECRET_NAME='REPLACE_WITH_UNREGISTERED_SECRET_NAME'

test "$REGISTERED_SECRET_NAME" != 'REPLACE_WITH_REGISTERED_SECRET_NAME'
test "$UNREGISTERED_SECRET_NAME" != 'REPLACE_WITH_UNREGISTERED_SECRET_NAME'
test "$REGISTERED_SECRET_NAME" != "$UNREGISTERED_SECRET_NAME"
kubectl --context="$KUBE_CONTEXT" --namespace="$NAMESPACE" get serviceaccount "$APP_SERVICE_ACCOUNT" >/dev/null
kubectl --context="$KUBE_CONTEXT" --namespace="$NAMESPACE" get serviceaccount "$COLLECTOR_SERVICE_ACCOUNT" >/dev/null
kubectl --context="$KUBE_CONTEXT" --namespace="$NAMESPACE" get secret "$REGISTERED_SECRET_NAME" >/dev/null

APP_AS="system:serviceaccount:${NAMESPACE}:${APP_SERVICE_ACCOUNT}"
COLLECTOR_AS="system:serviceaccount:${NAMESPACE}:${COLLECTOR_SERVICE_ACCOUNT}"

expect_yes() {
  if ! kubectl --context="$KUBE_CONTEXT" auth can-i --quiet --as="$COLLECTOR_AS" --namespace="$NAMESPACE" "$1" secret --resource-name="$REGISTERED_SECRET_NAME"; then
    echo "FAIL: collector must be allowed: $1 registered Secret" >&2
    exit 1
  fi
}
expect_no() {
  local result
  if [ "$#" -eq 4 ]; then
    result="$(kubectl --context="$KUBE_CONTEXT" auth can-i --quiet --as="$1" --namespace="$NAMESPACE" "$2" "$3" --resource-name="$4" && echo allowed || true)"
  else
    result="$(kubectl --context="$KUBE_CONTEXT" auth can-i --quiet --as="$1" --namespace="$NAMESPACE" "$2" "$3" && echo allowed || true)"
  fi
  if [ "$result" = allowed ]; then
    echo "FAIL: access must be denied: subject=$1 verb=$2 resource=$3 name=${4:-<none>}" >&2
    exit 1
  fi
}

expect_yes get
expect_no "$COLLECTOR_AS" get secret "$UNREGISTERED_SECRET_NAME"
expect_no "$COLLECTOR_AS" list secrets
expect_no "$COLLECTOR_AS" watch secrets
expect_no "$COLLECTOR_AS" create secrets
expect_no "$COLLECTOR_AS" update secrets
expect_no "$COLLECTOR_AS" patch secrets
expect_no "$COLLECTOR_AS" delete secrets
expect_no "$APP_AS" get secret "$REGISTERED_SECRET_NAME"
expect_no "$APP_AS" list secrets
expect_no "$APP_AS" watch secrets

echo "PASS: collector exact resourceNames=get only; app Secret access/list/watch denied"
)
RBAC_STATUS=$?
if [ "$RBAC_STATUS" -ne 0 ]; then
  echo "INCOMPLETE: RBAC probe failed or was blocked (status=$RBAC_STATUS); interactive shell remains open"
else
  echo 'DONE: RBAC probe passed; interactive shell remains open'
fi
```

预期结果：collector 只能对登记的 `REGISTERED_SECRET_NAME` 执行 `get`；不能读取未登记 Secret、`list/watch/create/update/patch/delete`；普通 app ServiceAccount 不能 `get/list/watch` Secret。失败时保留命令输出和 `kubectl auth can-i` 结果，但不要导出 Secret data。

### 8.6 AWS KMS GenerateDataKey 能力探针【待远程执行，仅适用于 AWS KMS】

如果实际环境不是 AWS KMS，不要运行本节；由平台按同一输入/输出字段提供等价 provider probe。命令要求远程机器已有 `aws` CLI 和已配置的短期身份，不安装 CLI，不打印明文 `Plaintext` 字段，不撤销或修改生产 key。

```bash
set -euo pipefail
RUN_ID="a-kms-$(date -u +%Y%m%dT%H%M%SZ)"
OWNER_MARKER="A:system-backup-capability"
AWS_REGION='REPLACE_WITH_AWS_REGION'
KMS_KEY_ID='REPLACE_WITH_VERSIONED_KMS_KEY_ID_OR_ARN'
TASK_ID='sbt_capability_probe_20260920'
OUT="/tmp/${RUN_ID}-kms.json"
trap 'rm -f -- "$OUT"' EXIT

test "$AWS_REGION" != 'REPLACE_WITH_AWS_REGION'
test "$KMS_KEY_ID" != 'REPLACE_WITH_VERSIONED_KMS_KEY_ID_OR_ARN'
aws sts get-caller-identity --query '{account:Account,arn:Arn,user_id:UserId}' --output json
aws kms describe-key --region "$AWS_REGION" --key-id "$KMS_KEY_ID" \
  --query '{key_id:KeyMetadata.KeyId,arn:KeyMetadata.Arn,version:KeyMetadata.KeyState,origin:KeyMetadata.Origin}' --output json

# Plaintext is returned by the API but is deliberately discarded by --query.
CIPHERTEXT_PRESENT="$(aws kms generate-data-key --region "$AWS_REGION" --key-id "$KMS_KEY_ID" --key-spec AES_256 \
  --encryption-context "system_backup_task=${TASK_ID},purpose=data_key_generation" \
  --query 'CiphertextBlob != `null`' --output text)"
test "$CIPHERTEXT_PRESENT" = 'True'
printf '{"status":"supported","run_id":"%s","owner_marker":"%s","plaintext_output_suppressed":true}\n' "$RUN_ID" "$OWNER_MARKER" | tee "$OUT"
test -s "$OUT"
```

该探针只证明当前身份可以 GenerateDataKey；还需要平台用同一 task-scoped identity 另行证明撤销、到期、版本保留和 `unwrap/decrypt/admin` 均被拒绝，并把 provider 版本、配置版本、失败映射和脱敏结果写入 `capability-evidence.schema.json`。不得把 AWS response、凭据、明文 key 或原始日志提交到仓库。

### 8.7 MinIO/S3 evidence store 基础探针【待远程执行，仅适用于已配置 mc alias】

如果 evidence store 使用 MinIO/S3 且远程机已有预配置、最小权限的 `mc` alias，执行以下命令；alias、bucket、prefix 只使用测试租户和本次 run 的唯一前缀。不要把 access key/secret key 写入参数或输出。

```bash
set -euo pipefail
RUN_ID="a-evidence-$(date -u +%Y%m%dT%H%M%SZ)"
OWNER_MARKER="A:system-backup-capability"
MC_ALIAS='REPLACE_WITH_PRECONFIGURED_MC_ALIAS'
EVIDENCE_BUCKET='REPLACE_WITH_TEST_EVIDENCE_BUCKET'
EVIDENCE_PREFIX='REPLACE_WITH_TEST_EVIDENCE_PREFIX'
KEY="${EVIDENCE_PREFIX%/}/${RUN_ID}/sev_probe_object"
PAYLOAD="/tmp/${RUN_ID}-evidence-payload"
STAT="/tmp/${RUN_ID}-stat.json"
trap 'rm -f -- "$PAYLOAD" "$STAT"' EXIT

test "$MC_ALIAS" != 'REPLACE_WITH_PRECONFIGURED_MC_ALIAS'
test "$EVIDENCE_BUCKET" != 'REPLACE_WITH_TEST_EVIDENCE_BUCKET'
test "$EVIDENCE_PREFIX" != 'REPLACE_WITH_TEST_EVIDENCE_PREFIX'
test -n "${EVIDENCE_PREFIX%/}"
printf 'system-backup-capability-probe:%s\n' "$RUN_ID" > "$PAYLOAD"
mc cp --quiet "$PAYLOAD" "${MC_ALIAS}/${EVIDENCE_BUCKET}/${KEY}"
mc stat --json "${MC_ALIAS}/${EVIDENCE_BUCKET}/${KEY}" > "$STAT"
mc cat --quiet "${MC_ALIAS}/${EVIDENCE_BUCKET}/${KEY}" | cmp -s - "$PAYLOAD"
mc rm --quiet "${MC_ALIAS}/${EVIDENCE_BUCKET}/${KEY}"
if mc stat --json "${MC_ALIAS}/${EVIDENCE_BUCKET}/${KEY}" >/dev/null 2>&1; then
  echo 'FAIL: evidence object remains after delete' >&2
  exit 1
fi
rm -f -- "$PAYLOAD"
test ! -e "$PAYLOAD"
echo "PASS: evidence write/read/delete probe run_id=${RUN_ID} owner_marker=${OWNER_MARKER}"
```

Range、checksum、TLS/CA、1 GiB 上限、`write_unknown` 接管和 provider-proof issuer 仍需使用平台提供的 evidence adapter/probe image 验证；当前仓库没有可直接调用的真实 KMS/evidence/provider 客户端，不能用本地 fake 测试代替这些证据。

## 9. 本地看板登记草案与交叉评审包

| 交付项 | 负责人 | 依赖方 | 交叉评审人 | 证据位置 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| A-owned users/AI Gateway registry 与 fixture | A | D inventory/check 脚本 | B、C、D | `contracts/system-backup/v12/schema-registry*.json`、`a-owned-object-fixtures.json` | draft，等待非实现 owner review |
| Strong-auth proof/nonce wire contract | A | D nonce ledger、Admin operation policy | D | `strong-auth-proof-nonce.schema.json`、`strong-auth-nonce-ledger.schema.json`、`a-owned-redacted-examples.json`、`backend/internal/systembackupsecurity/` | draft，本地 runtime verifier 已完成；事务消费与 D 接入待完成 |
| Secret/ref typed union | A | B secret-capture、C provider adapter、D config/control API | B、C、D | `secret-ref.schema.json`、`a-owned-redacted-examples.json` | draft，本地合同测试已覆盖 forbidden fields |
| Provider-proof registration | A | C artifact/provider proof、D destructive API | C、D | `provider-proof-registration.schema.json`、`a-owned-redacted-examples.json`、`backend/internal/systembackupsecurity/providerproof.go` | draft，本地 envelope verifier 已完成；真实 issuer/proof probe 待远程能力证据 |
| Capability evidence | A | B job/capture identity、C provider capability、D dependency health | B、C、D | `capability-evidence.schema.json`、`a-owned-redacted-examples.json` | draft，远程 KMS/Secret/K8s/provider spike 待执行 |
| Live schema-hash evidence | A/B/C | D canonicalizer 与只读 capture SQL | A、B、C | `schema-hash-live-evidence.schema.json`、`docs/system-backup-a-schema-candidate-review-2026-09-23.md` | 已采集 candidate、A 本地绑定审阅通过；来源认证/登记/批准待补，`schema_hash_evidence_present=false` |

本轮本地验证命令：

```bash
node scripts/system-backup-contract-artifacts.test.mjs
node scripts/system-backup-contract-check.test.mjs
node scripts/system-backup-contract-check.mjs --check
```

当前已验证：A security Go 单元测试、上述三个合同命令和 migration 脚本语法检查通过；隔离 Go cache 已删除，仓库内未生成测试构建产物。strict freeze 仍因缺少 live schema-hash、B/C policy、cross review 和四个 missing artifact 保持阻塞。本机 `kubectl` 未配置 current context，不能据此生成远程 capability evidence。

