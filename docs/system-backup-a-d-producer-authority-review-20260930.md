# A 对系统 capability producer 授权设计的评审

日期：2026-09-30。评审方 A；交接方 D、C，采用 Job 时包括 B。

**结论：设计方向可接受，当前版本需修订后复审，尚不具备冻结和生产接入条件。** 本文逐项核对 [D 授权提案](system-backup-d-producer-authority-design-20260930.md) 与当前工作树，回应 [A 的准入要求](system-backup-a-capability-producer-admission-request-20260929.md)。以下六项是设计和集成阻断项，不是已证实的生产漏洞；没有替 D/C/B 作出签收，也没有新增授权表、公共枚举或生产权限。

本次交付为 A 的评审意见、接口要求及验收矩阵。审阅源码及提案的 SHA-256 见 [机器记录](evidence/system-backup-a-d-producer-authority-review-20260930.json)。后续实现须先完成对应设计决定与合同修订，不能把本文建议当作已冻结 API。

## 可接受的设计原则

1. 使用独立、持久化、可撤销的 producer 授权域，绑定数据库、installation、实际认证身份、用途、run、授权代次和准确资源版本。正文校验、历史健康行与调用者自报字段都不能签发授权。
2. 六类正文角色共用授权机制；只有 artifact/catalog/evidence 映射 provider capability 行。KMS、Secret、signing 保留独立评估及用途隔离，不能直接投影为 healthy。依据为 [角色映射](../contracts/system-backup/v12/a-capability-role-mapping.json)。
3. 保留 Prepare → 登记 pending 与容量预留 → 条件写 → ready → 结果事务的阶段顺序。登记前须有准确密文 manifest；登记后只使用原始密文、原 evidence ID 和准确引用重试。
4. 网络认证、KMS、STS、对象操作在数据库事务外执行，返回事务后重新检查授权；到期、撤销、接管不能产生新的成功结果。有效期不得超过原探针观察及依赖期限，重复提交不能刷新观察时间。
5. 独立恢复只确认原对象，不能复活 producer 的旧授权；新增对象必须走 D 的 migration、inventory、合同和新指纹评审流程，不能沿用既有 93 文件范围的验收。

## 需要修订的事项

### A D PROD 01 明确初始化与未启用配置的授权路径

**优先级 P1；D 负责修订，A/C 复审。** 提案的“初始化前后两条路径”仍将已有配置中的 disabled 状态留待决定。现有 [ConfigBootstrapService.Bootstrap](../backend/internal/systembackupsecurity/config_bootstrap_transaction.go) 创建的是 disabled v1，且拒绝既有 installation/config；[SQLTaskAuthority.authorizeKey](../backend/internal/systembackupevidence/task_authority_sql.go) 则要求配置已启用。把后者直接用于准入检查会出现“启用前必须有能力证据，而检查又要求已启用”的循环。

**A 的建议，待 D/C 确认：** 明确三个授权场景：无配置的部署准入、已有 disabled 配置的专项准入检查、enabled 配置的正常检查。disabled 场景必须重新签发绑定配置版本/hash 和独立授权代次的受限检查授权；不允许借此执行备份、恢复、普通任务写入或配置启用。正常授权在禁用时失效，不能自动转成 disabled 场景授权。

初始化前优先考虑经独立身份验证、用途与摘要绑定的受审 inline 证据路径；这只是设计建议，当前 provider-proof 的 inline 登记不等于已有 capability inline 准入实现。若正文大小、分类或加密要求不适合 inline，应使用独立可信证据通道。D/C 需明确选择、准入实现及验证来源；不能降低分类、截断正文，或以候选 evidence store 的自测成功建立对它自身的信任。独立通道的 store/write/KEK、容量和保留输入必须从部署准入获得。

**关闭条件：** 给出三个场景的准入来源、允许操作及退出条件；明确 bootstrap 提交时如何在同一锁域使旧授权失效。真实 MySQL 覆盖两个首次初始化者、首次初始化与 producer 认领/提交竞争；disabled 检查不能启用配置，旧授权不能跨场景沿用。

### A D PROD 02 补齐发布和 STS 的系统接点

**优先级 P1；A 负责适配，D/C 提供受审输入。** [Service.Publish](../backend/internal/systembackupevidence/lifecycle.go) 当前固定调用 `withEvidenceAccess(ctx, "task", r)`；[S3STSCredentials.validGrant](../backend/internal/systembackupevidence/s3_sts.go) 只接受 task/download/gc/recovery，要求 `ConfigVersion > 0`，task 还要求正数 attempt。[TaskPreparer](../backend/internal/systembackupevidence/task_prepare.go) 也绑定具体的 SQLTaskAuthority。仅实现新的 `ContentAuthority` 无法接通系统 producer，更不能覆盖无配置场景。

**修订要求：** 列明需要调整的内部授权类型、发布入口、claim 传递、STS 校验和 Wrap resolver；系统授权须与任务授权分离。新访问类型与无配置绑定表示法待接口评审，不在本文指定公共 enum。只有登记事务提交后的 lifecycle 能附加私有 evidence claim；外部请求不得自行填写 claim/row version 冒充持有者。系统发布只允许准确对象的条件写和必要 Stat；Range、Delete、Unwrap、管理操作分别由独立用途授权。

**关闭条件：** 普通 task、download、gc、recovery 凭据不能转换为 producer 凭据；伪造正数 config/attempt 不能通过。无配置路径能以真实受审部署授权工作；系统和任务路径的原有拒绝边界都有独立负测。不能通过放宽 `SQLTaskAuthority.accepts` 完成适配。

### A D PROD 03 冻结完整锁序和事务内复查位置

**优先级 P1；D 负责，A 配合 registry 接口复审。** 提案承认容量/审计锁位待定。[SQLRegistry.PersistPending](../backend/internal/systembackupevidence/sql.go) 的实际顺序是 `LockScope → OwnerDeadline → Admit → evidence/chunks 写入`；`WithLocked` 先调用 `LockScope` 再锁 evidence。现有 [provider 登记](../backend/internal/systembackupsecurity/providerproof_transaction.go) 还涉及配置、用户、operation、nonce、容量和审计；[容量预留](../backend/internal/systembackupsecurity/registration_capacity.go) 锁定共享 reservation 行。仅列出 installation、grant、evidence、result 不足以证明全局锁序一致。

**修订要求：** D 提供按调用路径列出的真实 SQL 锁顺序，覆盖首次初始化、认领/续租/撤销/接管、pending 登记、发布 claim/结果、capability/health 提交、恢复及 GC 引用检查。明确提案的 `LockAdmission` 如何映射现有 `LockScope/Admit/OwnerDeadline/Audit`，哪些检查在 evidence 行锁前完成，哪些在行锁后复核；不得在已经持有 evidence 锁的回调中反向获取更早的锁。容量、结果引用和审计必须使用调用者同一事务并随失败回滚。

同时明确锁等待后的数据库 UTC 取样及最后写入的期限条件。`SQLRegistry.WithLocked` 会在 evidence 锁后取时，但不能据此推定后续容量/审计等待也已被覆盖。每次可返回成功的授权变更或结果写入都需在最后有效性检查中使用新鲜数据库时间；D 要明确该检查与提交的线性化点及 commit 结果不明的处理。

**关闭条件：** 交付锁序表、事务接口与真实 MySQL 并发证据，覆盖空集合锁、容量行竞争、撤销/接管竞争、等待跨过期限、审计失败回滚。数据库死锁或提交断连按同一幂等请求恢复，不另建 run/evidence。

### A D PROD 04 为初始化前残留证据提供独立恢复路径

**优先级 P1；A/D 负责，C 提供准确对象证明。** [SQLWriteRecovery.locked](../backend/internal/systembackupevidence/write_recovery.go) 先调用 [lockConfig](../backend/internal/systembackupevidence/recovery_scan.go)，要求 installation 存在并匹配配置版本/hash；构造器也要求正数 ConfigVersion。它并未直接检查 enabled，但无法覆盖无配置或切换到不匹配配置后的旧记录。仅声明“独立恢复身份由 A 适配”还不足以处理 bootstrap 前的 pending/write_unknown。

**修订要求：** 在初始化前授权撤销、bootstrap 成功、配置切换和 producer 接管之后，保留原 run/evidence、准确对象 ref、密文 manifest 及原始写入截止时间的可验证记录。另行授权恢复身份读取这些历史绑定，限定为准确对象 Stat 和 evidence 收敛，不获准 Wrap、PUT、capability/health 成功提交或重新签发 producer 授权。旧授权的失效不能销毁恢复所需的元数据，也不能迫使恢复创建虚假 installation/config。

必须区分 producer 租约期限、不可变 owner 写入截止时间、观察有效期和 evidence 保留期。当前恢复要求 owner deadline 已到期，而服务写入以它作为截止时间；租约到期、撤销或更换 owner 后何时允许恢复、何时禁止重发 PUT，需要单独定义，不能简单把可续租期限作为 `OwnerDeadline`。旧外部请求可能仍在途，404 不能证明它以后不会完成。任何无法提交的 unknown 更新仍须保留已有 pending 和原始密文，待独立恢复重新核对。

**关闭条件：** 覆盖无配置时丢失 PUT 回包、bootstrap 后旧结果返回、配置切换后旧对象检查、原 producer 被撤销但 owner deadline 未到、404 后迟到对象出现。恢复成功最多使 evidence ready；原观察过期或授权代次已失效时，capability/health 不得据此变为成功。

### A D PROD 05 明确结果收据与重复提交的认证规则

**优先级 P1；D 负责结果事务，A/C 复审。** 提案要求重复提交返回原收据，但尚未定义幂等范围、撤权后的查询权限，以及旧 run 迟到结果如何与新 run 竞争。[角色映射](../contracts/system-backup/v12/a-capability-role-mapping.json) 要求数据库时间、lease/CAS 和登记 evidence 共同绑定，不能以 evidence ready 直接生成能力结论。

**修订要求：** 固定结果幂等键及请求摘要，覆盖 installation、授权代次、run、用途、provider ref/version/scope、evidence ID/摘要、结果内容和原观察时间。同键不同输入拒绝；同键相同输入仅返回已提交收据，不能重做状态转换、刷新 checked_at/expires_at 或再次预留容量。返回收据前仍验证调用者及读取权限；旧 producer 授权被撤销后不得仅凭句柄取得成功响应，需要明确独立的历史收据查询权限。

结果事务须同时校验当前 grant/run、目标 capability/health 的 CAS 条件和锁定 evidence 的 owner/type/hash/版本/状态，并防止已撤销代次或旧观察覆盖新的结果。KMS/Secret/signing 仍由独立 evaluator 决定健康状态。准确对象存储成功与能力检查成功是两种不同结果。

**关闭条件：** 覆盖同键冲突、同键重放、旧 run 晚于新 run 返回、结果行 CAS 冲突、证据被 GC 认领、审计失败和 commit 回包丢失。失败不产生 healthy、不丢 pending/unknown/ready evidence；查回原收据不改变原观察期限。

### A D PROD 06 明确续租时授权快照的稳定性

**优先级 P2；D 定义代次，A 定义调用内快照。** [ContentDispatcher.Validate](../backend/internal/systembackupevidence/content_dispatch.go) 在正文读取前后要求 `ProducerIdentityHash` 和整个正文 policy hash 相同；[STS Resolve](../backend/internal/systembackupevidence/s3_sts.go) 在交换前后比较完整的 `S3Authorization`。policy 中含 `ValidUntil`，授权结构中含 `ExpiresAt/LeaseHash`。若正常续租会改变这些字段，在途读取或 STS 交换会被安全拒绝；提案目前未说明这种行为是否符合预期。

**A 的建议，待 D 确认：** 区分认证主体、不可复用的授权代次、CAS 行版本以及本次调用固定的 policy/deadline。本次调用的上限不能随续租延长；每次检查仍读取最新权威状态以发现撤销、缩短期限、接管和配置变化。D 可以选择续租即使在途调用失效，但须明确重试语义并保留已登记的原始密文，不能为成功重试重新加密同一 evidence ID。不能为了容忍续租而删掉现有前后比较。

**关闭条件：** 覆盖同证书但换代、普通续租、期限缩短和读取/交换期间到期；验证正常续租的成功或拒绝符合冻结语义，同时原始探针有效期从不延长。

## 交付接口与责任

下表描述语义及现有接点，不定义新的 Go 签名或 wire 字段。

| 交付 | 负责方 | A 所需输入与检查 |
| --- | --- | --- |
| 授权认领与生命周期 | D | 真实认证主体、部署/配置场景、run、代次、期限、CAS、撤销及接管收据；客户端不能构造权威句柄。 |
| 正文授权与准备 | A，D 提供读取权威状态接口 | `ContentAuthority` 返回准确 Identity、代次绑定摘要、受审 CapabilityContentPolicy 和固定上限；Wrap 使用独立 evidence KEK 身份，只准 encrypt/wrap。 |
| 登记与发布 | D 提供事务 policy，A 提供系统发布适配 | 登记前形成准确 manifest；同事务验证授权/容量/保留并写 pending；提交后私有 claim 才可进入 STS，系统路径与 task 分离。 |
| 运行身份和三类签名材料 | A，采用 Job 时 B 配合 | 分离 KMS/Secret/signing 探针身份、evidence Wrap/读/删除身份，以及 strong-auth、provider-proof、artifact 签名用途；六角色共用租约不等于共用凭据。 |
| provider 输入及证明 | C，A/D 复审 | 固定 provider/ref/version/scope、所需 capability 集合、真实不存在证明与条件写 profile；B 提供实际 Job UID/generation、取消、接管及投射凭据失效接口。 |
| 结果提交与收据 | D，A/C 复审 | 调用者事务内的 grant/evidence/result CAS、审计、原观察有效期和幂等认证；三类 dependency 由独立 evaluator 处理。 |
| 历史恢复与保留 | A/D，C 提供证明 | 初始化前后均可独立授权读取原精确引用，固定 owner deadline 和保留规则；只收敛 evidence，不能代 producer 提交成功。 |

## 验收矩阵

下列均为后续必需验收，**本轮未执行**。它们逐项覆盖 A 原请求的八条行为要求，不能用本轮静态核对或既有 25/25 探针结果替代。

| 编号 | 原请求项 | 场景与必须证明的结果 | 关联修订 |
| --- | --- | --- | --- |
| V01 | 1、4 | 六角色跨 installation/用途/ref/run 凭据互换全部拒绝；同证书换代旧句柄也拒绝。 | 02、06 |
| V02 | 2、4 | 无配置授权有独立信任来源；候选 store 自证、伪造 grant、借用 offline bootstrap grant 均不能授予 producer 权限。 | 01 |
| V03 | 2、3 | bootstrap 与认领/登记/结果提交竞争；disabled 检查不启用配置，配置切换及禁用使旧授权失效。 | 01、03 |
| V04 | 3 | 正文读取、Wrap、STS、条件写、pending/ready 登记及结果事务期间逐段撤权/到期/接管，不能产生未经授权的成功。 | 02、03、04 |
| V05 | 3、5 | 锁等待跨过期限；续租/缩短期限/同证书换代；数据库时间与原观察期限限制全部保持。 | 03、06 |
| V06 | 5、6 | 同键同输入返回原收据；同键异输入拒绝；过期或撤销不刷新观察，旧 run 不覆盖新结果。 | 05 |
| V07 | 6 | 错误 evidence owner/hash/ref/版本、结果 CAS 冲突、GC 引用竞态、容量不足及审计失败全部原子回滚。 | 03、05 |
| V08 | 6、7 | PUT/数据库 commit 回包丢失；用原 run 和原密文查回或恢复，404 不推断永久不存在，恢复不提交过期 capability。 | 04、05 |
| V09 | 3、7 | 初始化前残留、配置切换、原 producer 撤销后的独立恢复；禁止重新加密、换 key、换 run 或重新赋予 PUT 权限。 | 04 |
| V10 | 8 | 真实工作身份、STS/Transit/provider ACL 与撤销、Job 接管（若采用）、真实 MySQL 并发和资源清理；记录每个 run 的来源与指纹。 | 全部 |

## 本轮验证与下一步

本轮完成提案和 24 份输入文件的静态审阅及指纹绑定；执行 `node scripts/system-backup-contract-check.mjs --check`，退出 0。该命令是非 strict 合同一致性检查：当前仍为 draft，93 文件迁移、99 个对象、60 项策略已登记、39 项策略待提交、60 项对象交叉评审待完成，且四项合同缺失。它不证明 producer 实现或冻结门禁通过。

本轮只增加评审报告/机器记录并更新 A/D 角色导航，未运行 Go 构建、远程测试或新增 provider 探针，未安装依赖，未生成测试构建产物。既有 [25/25 MySQL 验收](system-backup-a-authority-mysql-20260929.md) 的限定结论保留，无需重跑。

下一步由 D 逐项回复 01、03、05、06 并给出事务接口，A/C 确认 01 的信任路径；A 依据这些输入完成 02、04 的适配设计，B 在确定使用 Job 后补宿主接口。形成一致修订后，D 同步主计划、机器合同、schema inventory 和新指纹，A 再实施系统 producer 正文、Wrap、STS、发布与恢复适配并按矩阵验收。本次评审状态为 `changes_requested`；合同 `approved_reviewers` 与 capability 批准状态均未变更。
