# D：系统 capability producer 授权设计修订 R1

日期：2026-09-30。状态：D 已回复，待 A/C 复审；采用 Job 时需 B。本文替代原提案中尚未决定的设计段落，原 [受审提案](system-backup-d-producer-authority-design-20260930.md) 保留原字节，供 [A 首轮评审](system-backup-a-d-producer-authority-review-20260930.md) 的指纹追溯。本文不是已冻结合同、可执行迁移或生产授权；以下类型、锁层和接口名均是待评审的内部设计标签。

本轮交付是六项回复、当前源码锁序、拟议事务接口和验收映射。没有新增表、Go 接口、公共 enum、生产 grant 或 capability 批准。A 的六项 finding 仍由 A 在复审及验收后关闭，不能用 D 的回复代签。

## 1. 逐项回复

| A finding | D 的决定与交付 | 后续 owner / 关闭证据 |
| --- | --- | --- |
| A-D-PROD-01 / P1 | 明确无配置、disabled、enabled 三种互斥授权场景；本轮选择独立可信外置证据通道，缺通道即阻断，无自动 inline 降级。bootstrap 原子关闭无配置授权域。见第 2 节。 | A/C 复审信任来源及 provider profile；D 实现后执行 V02、V03。 |
| A-D-PROD-02 / P1 | 给出独立系统准备/发布、带场景的 STS 绑定、提交后私有 claim 与 Wrap 接口输入。现有 task 路径不扩权。见第 5 节。 | A 设计并实现适配，C 证明条件写/准确对象能力；V01、V04。 |
| A-D-PROD-03 / P1 | 分列当前 SQL 顺序与统一后的拟议顺序；要求 registry 事务拥有者补最终时钟检查，不能只实现 SQLPolicy 回调。见第 4 节。 | D/A 复审后接线；真实 MySQL V03、V04、V05、V07，含空集合及容量/审计等待。 |
| A-D-PROD-04 / P1 | 独立保存历史写入绑定；恢复只 Stat/收敛 evidence，等待不可变 owner 写截止及原 evidence claim 失效，不要求原配置仍活动。见第 6 节。 | A/D 接线，C 提供准确对象证明；V04、V08、V09。 |
| A-D-PROD-05 / P1 | 定义结果幂等范围、完整请求摘要、独立历史收据读取权限和目标运行代次 CAS。见第 7 节。 | D 结果事务，A/C 复审；V06、V07、V08。 |
| A-D-PROD-06 / P2 | 选择保守语义：正常续租也使在途调用快照失效；每次调用固定上限，前后比较不放宽，登记后的重试使用原密文。见第 3 节。 | A 实现调用内快照，D 提供代次/版本复查；V01、V05。 |

## 2. 三个授权场景与信任来源

| 场景 | 权威准入来源 / 绑定 | 允许操作 | 失效与退出 |
| --- | --- | --- | --- |
| 无配置 | 独立部署准入验证真实工作主体及授权签发者，绑定 DB UUID/库名、installation、候选配置摘要、全部 registry/ref/policy 摘要及部署授权期限；在控制库中持久化可撤销授权域，不创建 installation/config 行。 | 仅指定 run 的六类 capability 探针、受审 evidence 准备/登记/发布和对应结果登记；结果是候选准入材料，不启用安装。 | 部署撤销、到期、身份/ref 变化或 bootstrap 提交使该域失效；孤立 config 行也使无配置路径拒绝。 |
| 已有 disabled 配置 | 新签发的专项检查授权，精确绑定当前配置 version/hash、disabled 状态、授权 epoch、身份及 run。已存在配置不是授予权限的充分条件。 | 仅该配置的准入检查及其 evidence/结果；不能执行备份、恢复、普通任务写入、配置修改或启用。 | enabled 状态变化、配置切换、撤销、到期、身份/ref 变化均失效。无配置授权不得继承。 |
| 已有 enabled 配置 | 新签发的正常检查授权，绑定当前配置 version/hash、enabled 状态、授权 epoch、身份及 run。 | 仅授权范围内的 capability/dependency 检查及其证据；该授权本身不授予业务任务执行权。 | 禁用、切换、撤销、到期、身份/ref 变化失效；不得自动变成 disabled 检查授权。 |

签发者与工作主体分离。部署准入须由独立受信的部署身份验证器认证签发者、签发权限及工作身份；配置文件摘要只是输入完整性，不是签发权限。部署文件不能由 probe 写入。安装尚未初始化时，可撤销状态存放在独立授权域；其 installation 值仅为绑定键，不通过外键迫使提前插入 installation 行。具体身份验证器、部署输入格式及签名用途由 A/C 复审，未交付时拒绝启动。

本轮选择**独立可信外置证据通道**作为无配置场景的实现路线：继续适用加密和准确 manifest 流程，避免把现有 provider-proof inline 登记误用为 capability inline。该通道的 store/write/KEK、恢复 read 身份、保留/容量、TLS/STS 与条件写 profile 由部署准入独立固定，准入依据不能来自本次候选 store 的成功结果。C 须证明依赖关系无自证循环；若该通道或其信任根正是本次待验证对象且无独立依据，该 run 拒绝。disabled/enabled 也不得以本次输出重新建立通道的信任。当前未声称现场已有这样的通道。

不提供自动 inline fallback。若 A/C 选择 inline，须另审正文大小、分类、加密、持久化及独立认证规则并更新本节；不能截断、降低分类或只把摘要作为完整证据。

bootstrap 在第 4 节的同一协调事务中锁无配置授权域和需消费的候选证据，检查证据身份、摘要、原观察期限及准入范围，随后关闭该域、创建 disabled v1 和收据/审计。一并提交或一并回滚。既有候选收据只可由独立 bootstrap admission 检查，不转换为新 producer 权限。关闭的是授权域 epoch，子 grant 无需无界批量更新；每个后续授权读取必须复查域。旧请求可能在远端完成，但不能登记新的 producer 成功。两个 bootstrap、bootstrap 与 acquire/register/commit 的竞争都需要真实 MySQL 验证。

## 3. 持久化绑定、四类时间和续租

拟议持久化对象职责为：部署/配置授权域及 epoch；producer grant 与 run；按目标键排序的当前 run 代次；不可变 evidence 写入绑定；结果幂等收据及引用。表名、索引、外键和字段编码待合同/schema 决议，不借用现有 operation enum 或 dependency health 结果行充当租约。六角色共用机制，不共用凭据；仅 artifact/catalog/evidence 可映射 provider capability，KMS/Secret/signing 仍由 A 的独立 evaluator 决定结论。

每个 grant 绑定认证主体、场景、DB/installation、域 epoch、不可复用授权代次、run、用途、精确 provider/ref/version/scope、输入摘要、evidence ID 与 owner=system/installation。首次持久化前可预分配 evidence ID，但 ID 不能授权；grant 更新采用当前读与 owner/代次/row version CAS。

| 时间 | 定义与限制 |
| --- | --- |
| producer 租约截止 | 可在未到期且原主体/owner/代次仍有效时 CAS 续租，受部署、身份与依赖授权上限约束。已到期不能续活。撤销后不能续租。 |
| owner 写入截止 | 在形成待登记 manifest 前确定，并在 pending 登记时与原 run/manifest 原子固定。不得超过初始受审写入授权上限；登记后续租、接管和新配置均不能延长。它不是当前租约到期值。 |
| 原观察截止 | 来自经认证探针的原观察时间、受审最大年龄及依赖期限，结合数据库时钟验证；未来时间超界拒绝。重试、续租、收据读取均不得刷新。 |
| evidence 保留截止 | 用于保留/GC，与能力有效期及写入截止独立；合法 hold 可延长保留，不恢复写权限或观察新鲜度。 |

一次正文读取、Wrap 或 STS 交换开始时，由服务端固定调用快照：认证主体摘要、授权域 epoch、授权代次、grant CAS 版本、run、用途、policy hash、资源绑定及本次截止。截止取数据库当前租约、部署/身份/依赖授权、原观察截止、调用预算的最小值；写调用另取 owner 写截止及 evidence claim 截止。快照不可由 HTTP 正文、普通 context 字段或客户端输入构造。

**选定续租语义：续租增加 grant 版本，旧调用快照拒绝继续。** 主体不变不代表授权快照不变；`ProducerIdentityHash` 包含域/代次/grant 版本和固定 policy，STS 的 LeaseHash 同样绑定快照及已登记 claim。每次前后复查均读取最新权威状态；版本变化、缩短期限、撤销、换代或配置变化一律拒绝，不删掉现有完整比较。普通续租可以开始新的调用，不能延长已开始调用的上限。实现应在调用间续租，减少无谓重试。

Prepare 尚未登记且确定登记失败时，可清理本 run 临时密文后重新开始；登记提交结果不明则先查原 evidence/收据，保留原始密文。已经登记的 evidence 不得重新 Wrap/加密，不得用变更后的 policy 覆盖原 manifest；仍有效的同 run 可在新调用快照下使用原字节及原绑定重试发布。缩短期限后没有剩余授权时间就转独立恢复。接管产生新授权代次，旧 run 不再获准 PUT/结果提交；旧 evidence 只走历史恢复，新探针的 run/evidence 明确独立，不冒充旧请求重试。

撤销用于关闭授权，不要求被撤销租约尚未到期；它要求撤销者有当前管理权限且目标代次/CAS 匹配。过期对象可以幂等标记撤销。接管须证明旧租约已过期或已有受审终止决定，并 CAS 当前目标代次；不能以新进程启动替代接管授权。

## 4. 当前 SQL 锁序与拟议统一顺序

### 4.1 当前实现的事实

下表中的钩子表示调用点，不表示已有完整生产 SQL 实现；本次扫描没有找到非测试的完整 `SQLPolicy` 实现。不可把接口注释推断成所有引用行都已锁定。

| 路径 / 源码 | 当前顺序 | R1 所需改变 |
| --- | --- | --- |
| [Bootstrap](../backend/internal/systembackupsecurity/config_bootstrap_transaction.go) | 全 installation 索引锁 → users → Admission.Authorize → operation 幂等查询；新请求再检查 installation/config 空集合 → ValidateAndReserve → intent audit → config/state/operation 插入 → result audit → commit。重放分支在 operation 后查 config。 | 将配置/空集合和授权域检查提前，明确域失效、候选引用锁及最终时钟检查。现有 Authorize 时刻的 now 不能覆盖所有后续等待。 |
| [Provider Register](../backend/internal/systembackupsecurity/providerproof_transaction.go) | 全 installation → config → users/Authority.Authorize → operation 幂等行 → Authority.Load → nonce 候选锁 → ReserveCapacity → intent audit → evidence/operation → nonce 插入（含 SQL 时间谓词）→ result audit → commit。 | Authority.Load 的目标锁纳入统一层；nonce 最后写入后的审计仍可能等待，需补事务末检查。不要把此路径复用为 producer 签发。 |
| [PersistPending](../backend/internal/systembackupevidence/sql.go) | begin/DB 身份与时间 → LockScope → 再取 UTC → OwnerDeadline → Admit → evidence INSERT → chunks INSERT → commit。 | LockScope 提前取得授权/引用/容量等锁；Admit 使用锁内事实；补审计和最终 Guard，不能仅依靠开始时 now。 |
| [WithLocked/load](../backend/internal/systembackupevidence/sql.go) | owner 非锁提示 → LockScope → evidence FOR UPDATE → OwnerDeadline → chunks 按 index FOR UPDATE → UTC → 回调/Save → commit。 | OwnerDeadline 只能从已锁历史绑定读取；回调不能反向锁 grant/容量/引用。最终 Guard 必须在回调完成后运行。 |
| [SQLTaskAuthority](../backend/internal/systembackupevidence/task_authority_sql.go) | 全 installation → config → task → attempts → Job → 可选 evidence。 | 保留任务语义；与系统路径共享的配置/证据/引用锁必须兼容，不能在系统分支伪造 task/attempt。 |
| [WriteRecovery](../backend/internal/systembackupevidence/write_recovery.go) | lockConfig（全 installation → 当前 config）→ owner 提示 → LockScope → evidence/chunks → UTC → claim/审计/保存 → 再取 UTC → commit。 | 新系统恢复分支改读独立历史绑定及恢复授权，不能依赖原 active config。保留事务末时间复查。 |
| [GC registry](../backend/internal/systembackupevidence/gc_registry.go) | lockConfig → owner 提示/LockScope → GC operation → evidence/chunks → 回调中 Deletable/Audit/Save → 再取 UTC → commit。 | 当前 LockScope 在 operation 之前，不能在该钩子随意取得拟议更后层的锁；需重排入口或提前锁 operation。Deletable 改为已锁引用复查。 |
| [容量](../backend/internal/systembackupsecurity/registration_capacity.go) | 报告读取/DB 时间校验 → INSERT IGNORE reservation id=1 → SELECT FOR UPDATE → UPDATE reserved_bytes。 | 显式拆分取得容量锁与预留；等待锁后及最终 Guard 重新判报告≤5秒、身份、空间和预算，不复用等待前的时间。 |

### 4.2 拟议顺序（待 A/C/B 复审与实测）

所有涉及共享控制面状态的路径以同一事务、同一 DB 身份和 RepeatableRead 当前读运行，先取现有 `SELECT origin_installation_id FROM system_backup_installation_state ORDER BY origin_installation_id FOR UPDATE`。空索引的 gap lock 可能相容并导致后续插入死锁，不能称它天然是独占互斥；失败者回滚并以原请求重试。拟议授权域行在该前缀之后按唯一 installation 键创建/锁定，不能单独先锁域再回头锁 installation。

| 层 | 锁对象与固定顺序 |
| --- | --- |
| L0 | 全 installation 索引前缀，包括空集合。 |
| L1 | 指定 installation 状态及 config 版本/空集合 → 独立部署/配置授权域；bootstrap 不预建 installation。 |
| L2 | 如涉及管理员：users → 会话/撤销记录；工作主体：独立身份撤销记录。身份变更路径须与此顺序兼容。 |
| L3 | 既有 operation 或新设计的幂等收据键/空键范围；不向现有 operation enum 塞入 producer 操作。 |
| L4 | grant → run/历史写入绑定 → 如采用 Job 则宿主/Job 身份；普通任务路径在本层保持 task → attempts → Job。多对象按固定类型再按稳定 ID 排序。 |
| L5 | 目标 run 代次、capability/dependency 结果槽和全部引用/hold/保留索引范围；nonce 候选（仅管理员路径，按固定键序）；证据引用的新建/删除也必须先取此层。 |
| L6 | `system_backup_metadata_reservations` 的共享 id=1；无新增占用的路径可跳过，但不得在更后层首次获取。 |
| L7 | intent audit 追加；所有可能涉及的 actor/FK 行必须已锁，不通过 audit 回调读取前层新对象。 |
| L8 | evidence 按 public_id 排序 → chunks 按 evidence/index；之后仅更新此前已锁的结果/引用/收据/授权行。新行插入须在之前锁住对应键域。 |
| L9 | result audit 追加；审计失败使全部本地变更回滚。 |
| L10 | 最终 Guard 与条件 CAS，随后 commit；只访问已锁行，不再获得新业务锁、不调用网络/文件/审计。 |

此表定义业务行及索引访问顺序，不声称可消除 InnoDB 唯一键、外键、gap 或 AUTO_INCREMENT 导致的全部等待。所有新增表的外键/索引和 audit 写入也须在真实 MySQL 验证；死锁按原请求重试。跨 owner 钩子发现新锁对象时必须纳入表并重新评审，不能留作任意回调。

### 4.3 各路径如何使用锁层

| 路径 | 事务顺序与关键动作 |
| --- | --- |
| 首次 bootstrap / 配置切换或禁用 | L0–L3 → L4 按序锁本次消费的候选绑定 → L5 引用 → L6 容量 → L7 → L8 证据（若消费）→ 更新已锁域 epoch、config/state 与收据 → L9–L10；不删除旧恢复元数据。 |
| Acquire / Renew / Revoke / Takeover | L0–L4 → L5 目标代次（认领/接管时 CAS）→ L6（新记录收费时）→ L7 → 修改已锁 grant/run/收据 → L9–L10。续租不改目标观察时间；撤销不锁 evidence。 |
| pending 登记 | L0–L6 → L7 → L8 插入准确 manifest/chunks，同时固定写入绑定与容量记账 → L9–L10。同键重放核对原 manifest，不重复收费。 |
| publish claim / ready 或 unknown 登记 | 每个阶段独立执行 L0–L5 → L6（有新占用时）→ L7 → L8 → CAS claim/evidence → L9–L10；外部调用位于两次事务之间。 |
| capability/health 结果提交 | L0–L7 → L8 验证 evidence → CAS 已锁目标/引用/收据 → L9–L10。结果槽在 evidence 前锁，绝不在 evidence 回调反向取得。 |
| 独立历史恢复 | L0–L1 仅取得协调域/当前状态，不要求历史 config 仍活动 → L2 独立恢复身份 → L3 恢复幂等/claim → L4 历史绑定 → L5 引用 → L6（需要时）→ L7–L10；Stat 在事务外，返回后全流程复查。 |
| GC 引用检查 / 删除结果 | L0–L4（包含 GC operation 及 owner 历史绑定）→ L5 全部引用与保留范围 → L6（需要时）→ L7 → L8 → 再查已锁引用与 retention → L9–L10；远端 Delete 仍只由独立 GC 身份执行。 |

引用插入者和 GC 必须共用 L5 的目标/引用键域和 L8 的 evidence 锁。即使引用集合为空也锁范围；任何新引用检查 evidence 尚可引用，deleting/deleted 一律拒绝。未知 owner/reference 映射直接阻断 GC，不通过只查某几张已知表宣称无引用。

### 4.4 SQLPolicy 映射、时间与提交不明

`LockAdmission` 拆成事务内锁计划与检查，不是直接塞进 `Admit`：`LockScope` 在 evidence 之前完成 L0–L6 所需锁和权威读取；`OwnerDeadline` 从 L4 已锁且不可变的历史绑定返回；`Admit` 核对准确 manifest、容量收费及保留，不新取更前层锁；`Authorize/Deletable` 只复查预锁状态；`Audit` 在规定阶段写同一事务。GC/恢复入口如已持有部分前缀，使用事务内锁上下文复用，禁止再次运行可能引入新前层锁的通用钩子。

**现有 SQLPolicy 不足以承载最终 Guard。** D/A 需共同修订事务拥有者的内部接口，使 PersistPending/WithLocked 在所有回调、写入及审计后执行 Guard，并只在其成功后提交。不能在 D 的 policy 内另开事务补检查，也不能在提前执行的 `Admit` 中冒充 commit 前复查。

取得所有可能等待的锁后重新查询 `UTC_TIMESTAMP(6)`；最终 Guard 再取一次数据库时间，复核主体、域/配置、grant 代次/版本、claim、各截止以及参与本次容量判断的报告新鲜度。最后的条件写入使用数据库 UTC 谓词和 CAS，RowsAffected 必须精确符合预期。若最后写入本身发生等待，返回后再次查询 UTC 并复核，过期则整笔回滚；其后不执行其它可能等待的业务写入。

事务的授权线性化点定义为上述最后一次新鲜 UTC 复核成功、且所有授权/撤销/结果行锁仍持有的时刻；只有 commit 成功才对外可见。与之竞争的撤销/切换若先取得锁，提交被拒；若后取得锁则排在已线性化事务之后。不能承诺 MySQL commit 的磁盘完成时间必定早于租约截止：commit 返回时若本地期限检查已失败，不再发放可用句柄或可继续操作的成功响应，原收据可独立查询且不刷新期限。

死锁确定回滚时可同键重试。commit 断连/超时属于结果不明，先在新连接验证 DB 身份、重新认证并查原幂等键/evidence；不得新建 run/evidence 或再次收费。查询缺失但原事务可能仍在提交时，须通过同键锁/唯一约束等待其结束再决定重试，不能用普通快照读的“未找到”判断失败。原请求已撤销则仅允许独立历史查询/恢复。

## 5. D → A/C 的事务接口与系统发布接点

以下是待冻结的语义签名；事务内函数接收调用者 `*sql.Tx` 和服务端创建的锁上下文，不自行 begin/commit。任何客户端结构都不能反序列化为授权句柄、调用快照或 evidence claim。

| 内部能力 | D 的输入/输出及原子保证 | 消费者 |
| --- | --- | --- |
| Acquire / Renew / Revoke / Takeover | 已认证主体、部署/配置准入引用、原请求键及预期 CAS；返回不透明句柄和期限/收据，提交成功前不发布句柄。 | probe 宿主；Job 方案需 B 提交 UID/generation 等映射。 |
| BeginCall / RecheckCall | 句柄、用途、准确 evidence/ref、原 policy；短事务生成固定快照，每次复查最新状态和版本。远端工作在事务外。 | A 的 ContentAuthority、Wrap resolver、STS authority。 |
| LockAdmission / AdmitPending | 调用者事务、服务端句柄、已准备 manifest；锁 L0–L6，核对所有绑定，在同事务登记 pending/chunks、历史写入绑定、容量及审计。 | A 的系统 preparer / registry。 |
| ClaimPublication / FinishPublication | 从已提交 pending 取得新的私有 claim；完成时在新事务验证原 claim/version、grant、manifest 和准确对象证明。撤权不能登记 ready。 | A 的独立系统发布入口。 |
| CommitResult | 调用者事务、认证快照、完整结果请求及幂等键；同事务绑定 grant/evidence/目标 CAS、引用、收据、容量与审计。 | C 三类 provider evaluator；A 三类 dependency evaluator。 |
| LoadHistoricalBinding / ClaimRecovery / FinishRecovery | 独立恢复身份及已登记 evidence；返回受限历史上下文/准确 Stat 引用，只收敛 evidence。 | A 的系统恢复入口。 |
| ReadReceipt | 重新认证的主体及独立历史读取授权、精确收据键；只返回已提交收据，不恢复执行权限。 | 操作者或受审恢复协调器。 |
| FinalGuard | 调用者事务及锁上下文，复查最终数据库时间、CAS 和容量报告；失败使整笔回滚。 | D/A 的所有系统事务拥有者。 |

A 的适配清单：

1. 系统 preparer 使用独立 ContentAuthority 与只准 Wrap 的 evidence KEK resolver；不能调用 TaskPreparer 并伪造 task。六种探针身份与 Wrap 身份隔离，三类签名用途继续分离。
2. 新系统发布入口替代硬编码 `withEvidenceAccess(ctx, "task", r)` 的调用。只有 pending 和 publication claim 已确认提交后才能构造私有 claim；提交不明时先查回并重新授权。外部不能提供 claim/row version。
3. STS 内部授权采用明确的场景绑定：无配置绑定部署域/epoch 和候选摘要；已有配置绑定 version/hash/状态/epoch。不能用 config=0 通配所有场景，也不能伪造正数 config/attempt。具体 Go 类型/编码由 A/D 复审后定，不改现有 task/download/gc/recovery 接受规则。
4. 系统发布权限只含准确对象条件 PUT 与所需 Stat；Absent 必须是 C 受审准确对象证明，不开放 List。Range、Delete、Unwrap 和管理动作使用独立授权。系统恢复仅 Stat。服务端限制和 provider 实际 ACL 均须负测，不能以共享 S3 Get 权限宣称已区分 Range/Stat。
5. `Prepare → PersistPending → ClaimPublication → 条件写/Stat → ready → CommitResult` 各阶段分开复查。缺少 C 的条件写或准确不存在证明时禁止发送 PUT；普通 404 不构成重发依据。结果事务失败可留下 ready evidence，但不能生成 capability/dependency 成功。

STS 返回的远端凭据在签发后未必能瞬时撤销；A/C 必须验证用途限制、短窗口及 provider 的截止执行能力。D 的事务复查能阻止旧授权登记成功，不能据此声称已取消在途外部请求。没有满足 profile 的实际 provider 就不通过上线验收。

## 6. 初始化前残留与独立恢复

pending 登记同事务保留原 DB/installation、场景/域及其 epoch、run/grant 代次、evidence ID、owner/type/classification、manifest 与密文摘要/长度、准确 store/ref/key、原 KEK/write 版本、不可变 owner 写截止、原观察时间/截止、保留策略和恢复 profile 摘要。保存的是引用/摘要和受控原密文，不保存可复用的明文凭据。

bootstrap、配置切换、撤销及接管保留这些历史绑定。恢复身份需单独部署准入、当前认证及可撤销权限；它可查匹配的历史绑定，不要求原 config 活动或 enabled，也不需要伪造 installation/config。旧 read 凭据已撤销时，须经独立恢复准入提供可访问原准确对象的新读取身份，不能替换对象 ref/manifest。缺权限就保持未知和告警。

恢复认领必须同时满足数据库 now ≥ 固定 owner 写截止、旧 evidence claim 已释放/过期、恢复身份有效。producer 租约先到期/撤销不提前 owner 写截止；截止前只做调度/保留，不赋予恢复 PUT。旧 producer 自撤销/失去 claim 起禁止再发 PUT；截止前已在途请求仍可能迟到。

| 情况 | 行为 |
| --- | --- |
| 无配置 PUT 回包丢失 | 尽可能在原授权有效时写 write_unknown；若授权已无效或数据库写失败，原 pending、准确引用及原密文保留，独立扫描同样覆盖 pending。 |
| bootstrap/配置切换后旧响应到达 | 原 producer 事务因域/配置失效而拒绝；历史恢复在上面的等待条件满足后 Stat 原对象。 |
| producer 撤销但 owner 截止未到 | 保留记录并等待，不续活、不接管为可写 run、不提前把未知状态判失败。 |
| Stat 404 或网络失败 | 维持 write_unknown 和所有绑定，记录受限失败码、受审退避，之后继续查。404 不证明迟到对象不会出现。 |
| 迟到对象与原 manifest 完全匹配 | 恢复 claim/授权最终复查通过后可使 evidence ready；不能提交 capability/health 结果或刷新原观察。 |
| 对象摘要/大小/版本不匹配 | 记录完整性失败并保留原引用供处置；不重新加密、覆盖对象或用未知版本删除。 |

恢复最多改变 evidence 的存储状态/该对象观察，不改变 provider capability 或 dependency health 的成功状态。没有原始密文也不能重新加密同 evidence ID；Stat 仍可用原 manifest 判断对象。pending/write_unknown 不能仅因保留期限到了就丢弃；需要独立 GC/人工处置确认不存在在途写入及引用，未知状态继续保留。旧记录的保留和容量需计入运行预算。

## 7. 结果收据、旧 run 与引用竞争

结果幂等键的逻辑范围固定为 DB UUID/库名、installation、授权代次、run、用途、目标键和客户端请求键。目标键由受审 evaluator 域、角色、provider identity/ref/version/scope 组成，不能由 caller 自报内容决定。请求摘要以待冻结的唯一编码覆盖上述绑定，以及场景/配置或部署摘要、evidence ID/正文与密文摘要/准确对象版本、结果完整内容、原观察时间/截止及预期目标 CAS。编码、时间精度及字段闭集必须落机器合同，当前不先发私有 wire JSON。

认领/接管时在 L5 CAS 目标的当前 run 代次，获得独占提交资格；同目标的新 run 被接受后，旧 run 即使晚到也不能覆盖。目标的健康结果 row version 与 run 代次均需匹配，不以 evidence ready 替代二者。run 代次需要独立持久化，dependency health 现有结果行没有租约字段的问题不通过添加假 claim 解决。

CommitResult 在 L8 锁定 evidence，验证 system/installation owner、capability_snapshot type、正文/密文/manifest 摘要、ref/version、ready 状态、预期 evidence row version、保留和无冲突 GC claim；同时复核 grant/run、原观察有效期与 evaluator 的角色资格。结果、引用、不可变收据和审计同事务提交；任何 CAS/容量/审计失败都回滚，既有 ready/pending/unknown evidence 留在原状态。被 GC 认领、deleting/deleted 或未知归属的 evidence 不能新挂引用。

同键异摘要拒绝；同键同摘要只返回已提交收据，不再预留容量或更新 checked_at/expires_at/结果行。返回前仍认证调用者：活跃 producer 可查询自己授权范围内的收据；旧 grant 到期/撤销/配置失效后必须使用独立的历史收据读取授权，旧句柄或同一证书不够。读取返回的是原提交事实及原时间，不代表当前 capability 仍有效，不授予再次提交权限。

结果 commit 回包丢失按同键查回；如果授权随后失效，独立历史查询可确认已提交事实，不能让原 producer 通过重放获得新的执行成功。没有查到时按第 4.4 节锁定幂等键确认，不用新 run 抹平不确定性。KMS/Secret/signing 结果仍必须经 A 的独立 evaluator，不能从对象上传成功推导 healthy。

## 8. 验收、合同落盘和交接顺序

| 验收 | 本修订的具体断言 | 执行方 |
| --- | --- | --- |
| V01 / V02 | 六角色跨安装/用途/ref/run 互换拒绝；同证书换代拒绝；候选 store 自证、借用 bootstrap grant、伪造场景/config/attempt 拒绝。 | A/C/D，宿主涉及 Job 时 B。 |
| V03 | 两个空库 bootstrap 竞争；bootstrap 与 acquire/pending/result 竞争；disabled 不启用配置；场景切换原子失效。 | D 真实 MySQL，A/C 复核。 |
| V04 | 正文、Wrap、STS、PUT、pending/ready、结果各阶段撤销/接管，不能登记旧授权成功；外部迟到允许存在但被隔离。 | A/D/C。 |
| V05 | 人为占住容量行或审计相关锁直到租约/5秒报告过期；最终回滚；正常续租使在途快照失败，缩短期限/到期失败。 | D MySQL，A 调用适配。 |
| V06 | 同键原收据、异摘要冲突、撤销后旧句柄拒绝、独立历史读取成功且期限不变；旧 run 晚到不能覆盖新 run。 | D，A/C。 |
| V07 | evidence owner/hash/ref/version 错配、结果 CAS 冲突、GC 新引用竞争、容量不足和审计失败全部原子回滚。 | D/A/C。 |
| V08 / V09 | PUT/commit 丢包、bootstrap 后迟到、配置切换、撤销而 owner 截止未到、404 后对象出现；保留原 run/原密文，恢复只收敛 evidence。 | A/D/C。 |
| V10 | 真实部署/工作/恢复身份与 STS/Transit/provider ACL、撤销、若采用 Job 则取消/凭据失效；记录 run 指纹与清理。 | 各实现 owner，D 汇总。 |

本轮未执行上表运行验收，不复用既有 25/25 MySQL、93 文件重放或 080 历史兼容结果宣称通过。文档一致性检查不能关闭 finding。

下一步 A/C 复审本次三个场景、独立证据通道、锁层、结果收据和续租选择；A 确认系统 preparer/STS/registry 最终 Guard/恢复接点。C 提供实际 provider profile 与精确不存在证明；如果运行在 Job，B 确认真实 UID/generation、终止/接管及投射凭据失效接口。未确认 Job 方案前，不假设已有可复用 capture 宿主权限。

形成一致决定后，D 才同步主计划、同版本机器合同及 schema inventory：落授权域/run/历史绑定/幂等收据对象、索引/FK/排除策略、调用与错误语义、角色映射、引用/GC 范围、Go/TS parity 和验收向量，重新生成 catalog/schema 指纹并交叉评审。现行仅补 080 的现场历史升级包不夹带这些新对象。实现按 D 事务边界 → A 系统适配 → C/B 实际输入 → 上表验收推进。

本轮交付指纹与验证结果见 [R1 机器记录](evidence/system-backup-d-producer-authority-revision-20260930.json)。A 首轮意见与原稿未改，approved_reviewers 不增加；未安装依赖、未执行远程动作或构建。
