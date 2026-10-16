# A：canonical 维护的 grant/source 组合校验

2026-10-16 后续：[八项具体组合层 MySQL 专项](system-backup-a-maintenance-authority-mysql-handoff-20261015.md)已取得操作者完整回执并[限定接收](evidence/a-maintenance-authority-mysql-accepted-sbk-mig-261016011333-1fdd.json)。实际私有 authority/apply/observe、六项暂存后漂移/到期回滚、独立当前观察和 installation_state 不变均通过，准确 namespace/UID 及两端清理齐全；不再请求重跑该专项。认证来源仍为合成，真实 holder/grant/archive/target/capacity、原文件及生产门禁保持待交付；下方 r2/本地准备记录按各自历史范围保留。

本增量为 [完整回填事务候选](system-backup-a-config-backfill-service-handoff-20261015.md)的私有 `configMaintenanceAuthority` 实现增加 `pinnedConfigMaintenanceAuthority`。它把五个必须存在的部署来源组合起来：当前安装目标/schema/catalog/ledger 校验、新写 grant 验证、独立当前观察 grant 验证、原归档认证，以及物理 metadata reservation。构造缺任一来源或准确 target/installation/actor/schema/catalog/migration pin 均拒绝；没有生产默认适配、路由或实际运行授权。

这里的私有 Go facts 不是 grant 文件、签名、issuer 或来源 wire profile。具体 authenticator 必须独立验证真实原始文件/签名、稳定主体、issuer/purpose、当前撤销、不可变 grant 版本及全部授权绑定。回显请求字段、填充格式正确的摘要或使用本地测试 closure 都不能替代认证。原 A 机器合同和 digest/profile 字节未改。

actor issuer/principal 必须来自当前调用者的独立身份认证，并与受审 grant 的 holder/subject 约束一致；仅验证授权文档签名后复制其中声称的主体，不符合这里的 verified-facts 约定。具体身份通道和 holder 证明仍须另行评审和交付。

verifier 还须用受审 registry/外部原始字节 pin 保证同一 grant 身份/版本跨请求不可变，不能采用首次见到即信任的缓存。本层固定并比较本次 admission 内的事实；它没有建立全局 grant 注册表，也不把原签收维护收据改写为 grant 历史库。

除 `ReserveMetadata` 在原事务中预留容量以外，其他四个来源须只读，不得顺带写入使用计数、缓存行或新审计。它们持有原 sql.Tx，因此这是需要逐项验收的适配器约束；不能以事务尚未提交为由让独立观察产生写副作用。现有测试替身遵守该约束，真实适配仍待交付。

## 独立匹配的事实

部署构造固定 server UUID/database、installation、稳定维护 actor 摘要和三种正式评审 pin，不能由请求选择。已认证 grant facts 返回独立的稳定 actor issuer/principal、grant issuer/logical ID/version、准确原始 grant 字节 SHA、当前撤销代次、用途、完整原请求绑定、key/request SHA 和有效期。

`CurrentTarget` 另行返回当前受审安装/实际 schema/catalog/ledger 事实；它不接收请求 scope，也不能从有效 grant 中复制 pin 代替实际环境检查。owner 须在原 sql.Tx 中维持所需的控制行/metadata 锁并核对当前实际状态。grant/archive 回调前后及容量返回/最终复查都必须继续匹配构造时的部署 pin；当前事实不符返回 unavailable，不把“签名有效但绑定旧安装状态”当作准入。

校验层使用已有 A actor/grant 摘要函数重新派生身份；写 grant 的逻辑身份和版本须与原写请求匹配。独立 grant 中的完整 target/config/hash/size/row/provenance/schema/catalog/migration 事实须与请求逐项相等，key 和 canonical 请求 SHA 另行匹配。原请求 SHA 绑定原因，稳定 actor/key 作用域不随 grant/key/session 轮换重开。

原归档适配独立返回已认证 `ConfigBackfillProvenanceFacts` 和当前验证代次/有效期。校验层重新计算既有 provenance profile，核对准确目标/version、原文 hash/size、source issuer/record/version 和已认证 manifest 原字节 SHA。传入原文还须自身为严格 canonical ConfigValues。校验层不会从原文反推 SQL row facts；真正的 138 列原行与 row fingerprint 仍由同一写事务独立核对。

grant 失败时不进入 archive verifier；所有验证器只得到私有字节副本。验证前后均采样准确 target/数据库 UTC，并检查 grant 和 source admission 的原有效期。最终 admission 截止取二者较早值，不续期。

## 最终复查与观察权限

返回的私有 admission 绑定准确 sql.Tx、原始 scope/原文、全部首次认证事实和截止。Recheck 重新调用同用途的独立 grant verifier 与 archive verifier，随后比较原 grant 字节、身份/版本/撤销代次/完整绑定/有效期以及原来源全部事实/验证代次/有效期。仍有效但已与原快照不同的事实返回 unavailable，包括原合同规定的同 grant 身份/版本下原始字节变化；当前认证拒绝、撤销或过期保持 permission。不会因为重查得到更晚截止就延长原 admission。

观察 grant 是独立的当前认证结果，其 logical ID/version/原始字节可以不同于原写 grant，但授权绑定仍指向原写请求和原永久 key。旧写 grant 已撤销时，当前观察可以合法工作；写用途 grant 不能直接复用为观察用途。候选按原作用域的稳定维护主体匹配身份，不创建未经评审的跨主体委托规则。

容量来源收到准确 payload 预算，仍须独立核算实际物理 row/index/既有分配/并发 reservation 和 installation 生命周期保留。包装后的 reservation 固定原 sql.Tx 和首次截止，源回调返回后再查当前数据库时钟；跨事务、回调到期或源对象自行延长 ValidUntil 都不能放行。该包装不制造容量报告或运行授予。

## 验证与边界

[A 测试](../backend/internal/systembackupsecurity/config_maintenance_authority_a_test.go)使用独立预置的合成认证事实，覆盖缺失来源/部署 pins、逐项 grant/source 错绑、原事实漂移、错误用途、不同当前观察 grant、回调字节隔离、原截止不续期、容量事务绑定，以及该组件与实际 apply/observe SQL transport 的组合。完整组合验证一次 canonical/双审计/收据提交和零写的原字节观察；来源验证代次在最终复查变更必须回滚已暂存的全部结果。这些 closure 不认证真实 grant 或归档，不作为生产适配。

[冻结门禁](../scripts/system-backup-a-config-maintenance-authority-validation.ps1)先跑定向用例，用两个临时 Go overlay 分别去掉原事实快照比较、独立 grant tuple 比较，要求各自四个准确断言失败，随后对未修改冻结源码执行完整 security/config 回归及默认 vet。编译/工具错误、其他失败或未执行指定用例都不算有效反例。结束清理本轮源码/cache/tmp/telemetry、overlay 和测试产物，保留证据日志/清单，不安装依赖或执行 SSH。

首轮冻结早于 unavailable/permission 分类对齐及独立 CurrentTarget 依赖补强；最终接收必须使用包含这些修订的新清单，不将首轮通过扩大成当前实现已通过。实际 grant/issuer/原归档/安装环境认证协议及适配、真实材料、物理容量和保留策略、正式 081/082 与生产部署仍未交付。

## r2 冻结接收结果

[最终日志](evidence/a-config-maintenance-authority-local-20261015-r2.txt)与[限定回执](evidence/a-config-maintenance-authority-review-20261015.json)固定 1,261 项输入，摘要 `4214e648d04bdf99d749b56de12940da38be3b874d38a84fd56c43c57843b0d1`。定向 11 主测试/80 子用例通过；完整 security/config 两包 250 主测试/1,638 子用例，共 1,888 项检查通过，定向重复覆盖不相加。两个 overlay 各检出四个指定断言失败、exit 1；正常门禁默认 vet、exit 0，r2 没有工具或断言重试。

源码副本、cache/tmp/telemetry、overlay 及二进制均清理，准确 owner `.tmp-a-evidence-cccd34fc626b49f8906cf2c6a2777484`、`.tmp-d-index-cache-e6fdedb60e1042cc9ac29205a965533a` 和 92 个不同 fixture 路径独立确认不存在。12 项重点 pin 匹配，归档时全部 1,261 项已有输入无漂移、无新增遗漏。原 A 写入合同、维护摘要合同和正式 066 原字节不变。未安装依赖、构建 tagged Linux 探针、执行 SSH、签发真实 grant 或执行历史回填。

[首轮替代记录](evidence/a-config-maintenance-authority-superseded-20261015.json)保留原冻结 `6b061a2d…1538`：最终成功尝试的定向 9/69、完整 248/1,627（1,875 项）和八项反例通过。两次定向、一次完整门禁的已知 Windows asm/vet 工具故障按相同命令重试，没有重试断言失败；早先失败尝试中的重复 PASS 不计入通过项。两处 owner 和 184 个不同 fixture 路径已确认删除。该轮不覆盖 CurrentTarget 和错误分类的后续修订。

完整事务的旧远测已 [确认在 SSH 阶段未启动](evidence/a-canonical-backfill-mysql-not-started-20261015.json)；16:33 的新时间戳尝试在 17:23:39 以“管道已被停止”结束，见[中断核对](evidence/a-canonical-backfill-mysql-interrupted-20261015.json)。本地构建和 67 个 fixture 已确认删除，但实际 SQL/namespace、远端成功及清理没有证据，不能接收为通过，也不能推断远端目录未创建。此前已接收的 writer 14 项、纯维护收据 7 组/9 项约束均不重跑。

后续新增[八项独立 MySQL 组合探针及操作者命令](system-backup-a-maintenance-authority-mysql-handoff-20261015.md)，直接装配本私有 authority 与实际 apply/observe。新[本地准备回执](evidence/a-maintenance-authority-mysql-local-review-20261015.json)冻结 1,265 项输入，完整 security 230/1,525、三个 seed 3/22 的三种运行方式、默认 vet、Linux 探针及 migration runner 编译均通过；正常 exit 0、无重试、67 个 fixture 与两层准确自有目录独立确认删除。八项实际 MySQL 尚未执行；合成认证来源不升级为真实 holder/grant/archive/target/capacity 适配，不扩大前述 r2 历史验收范围。
