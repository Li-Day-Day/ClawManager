# A2：bootstrap 消费 producer 观察的当前接点复审

2026-10-26。范围是后续安全资源适配的接口决策，不是生产准入、资源批准或已实现的新 adapter。本轮未改 backend/contracts/scripts，未运行 Go、访问 provider 或数据库。

## 已有能力须按当前代码复用

当前 `systembackupproducer/types.go` 已有 `UnconfiguredAdmission` 与 configured 路径；`validate.go` 区分 artifact/catalog/evidence 的 provider capability 和 kms/secret/signing 的独立 dependency check。`systembackupevidence.NewSystemExecutionPreparer` 已使用具体 D Execution、原 handle 与 opaque call snapshots，不能继续仅凭 9 月交接文档推断这些本地接口仍不存在。它们仍不自动提供真实部署映射、生产 Environment 或 resource-owner 批准。

`ResultsService` 在 candidate 模式保留 `bootstrap_candidate` 引用而不写 live projection。该引用与历史 receipt 能作为待绑定的原证据，但不能自行产生 bootstrap 当前授权。

## A-BOOT-CONSUME-01：现有入口尚不能直接替代同事务复查

已核对的 `Execution.RecheckCall(ctx, snapshot)` 会经 `s.run` 取得自己的事务；它不接收 bootstrap 已持有的 `*sql.Tx`。`HistoricalReceiptReader.ReadResultReceipt` 的明确语义是历史不可变 receipt 读取，不咨询当前 domain/grant/run/evidence/provider 状态，也自管读取事务。因此：

- 历史 receipt 读取成功不等于当前资源、原调用身份、未撤销授权或观察仍有效。
- 不能在 `BootstrapResourceCheck.Recheck(ctx, tx, now)` 中调用另一个自管事务的 RecheckCall 冒充原事务权威复查。
- 不能从调用者提交的 result 正文、哈希、布尔 supported/approved 或新签发的 handle 重建原观察授权。

bootstrap 当前要求 Prepare 在锁前完成真实资源/权限/TLS/能力观察；Recheck 只用本地不可变观察与调用者原事务，不联网、不 Begin/Commit、不延长原期限。已读入口与此边界之间需要明确的消费合同。这里不声称整个仓库或外部已有系统不存在其他等价入口；若已有受审实现，应先提供准确路径、符号与版本，而非新建重复机制。

## 增量发现：复用现有事务守卫，仍须原 snapshot 消费边界

进一步检查发现 `systembackupproducer/transaction.go::Transactions.GuardInTx` 已接受调用方 `*sql.Tx`，执行数据库身份、Policy 的 LockAndAuthorize、工作阶段、原期限及 FinalGuard，不 Begin/Commit/Rollback。`recovery.go::HistoricalRecovery.FinishRecoveryInTx` 已有具体复用实例，但它的语义是原历史 publication 的 CAS、audit 和 finish，不能借来批准 bootstrap 资源。`recovery_tx_test.go::TestCallerOwnedFinalGuardDoesNotCommit` 是既有模型回归，本次只读核对，没有另跑或扩称实际 SQL。

因此缺口并非“producer 完全没有 borrowed-tx 能力”。应优先由 D 判断能否在原 `Execution` 内部复用此守卫，使其保留 `snapshot.issuer`、原 handle、binding、facts 和 `until`，经现有私有 executionPolicy 的 `prior` 比较完成当前权威复查。外部 A adapter 不能自行取得私有 policy，也不能用新实现的通用 Policy 或空 work 回调冒充该原身份合同。这只是现有实现的复用线索，尚未定义或批准新的导出 API。

锁序必须另行核对：`ConfigBootstrapService.Bootstrap` 先锁全部 installation-state 范围、原 local admin，再锁幂等 operation、installation/config 存在或缺失范围，之后才进入 `ValidateAndReserve`；检查槽位又按 registry、reference、cross-resource 的既有顺序调用 Recheck。producer executionPolicy 则从 installation、domain、原身份、grant/run、host/target、references 到 evidence 建立其前缀。因此，简单在某个后置 resource Recheck 中加入完整 producer LockAndAuthorize，不能据此证明共同锁序成立。需要明确两套前缀的准确表/范围、缺行锁和相互等待，并决定原入口是否已有等价安排；不能仅以两者均为 RR 或持有同一个 tx 宣布顺序兼容。

## 增量发现：已提交 candidate 与原执行 snapshot 不能混用

`result.go::resultPolicy.write` 在结果登记时把原 run 改成 `committed` 并递增版本；candidate 模式同样执行此转换，只是不写 live projection。`execution_policy.go::LockAndAuthorize` 则拒绝 `superseded` 与 `committed`，并要求 prior 的 binding/facts 与当前精确相等。其 `prepareCall` 又把 probe 限为尚未观察的 acquired，把 content_read/wrap 限为 acquired，把 sts/publish 限为 pending。因此，前述 `Execution` 内部借用 GuardInTx 的线索，并不是已提交 `bootstrap_candidate` 的现成消费者。不能为使它通过而放宽 committed 拒绝、复活执行 handle，或把原调用 snapshot 换成新快照。

实现之前须决定消费阶段及对应的既有权威事实：

| 可能消费的阶段 | 当前代码能证明的范围 | 仍须确定的合同 |
| --- | --- | --- |
| producer 尚未提交结果时的原观察/call | 原 CallSnapshot 绑定服务实例、handle、binding、facts、原 until，现有 executionPolicy 限定运行状态 | 是否允许该阶段作为 bootstrap 资源输入、尚未持久化的完整观察/证明如何可靠绑定，以及与 bootstrap 共同提交或失败的关系。不能推断已经有结果 receipt。 |
| 已提交的 candidate 结果 | ResultRequest/Receipt、原 run、目标结果版本、bootstrap_candidate 与 producer_receipt 引用、历史绑定和 ready evidence 有实际登记路径；原观察期限仍是原值 | 准确的当前 bootstrap 消费授权、原 candidate/registry/ref/policy/profile 与安装/config/offline grant 的关系、撤销和 target/run 变化策略，以及同事务早锁/晚查。历史结果可读不能补这些授权。 |

`UnconfiguredAdmission` 的现有字段是 Scenario、DeploymentAdmissionID、CandidateHash、RegistrySetHash、RefSetHash、PolicyHash、ChannelProfileHash；它是数据 union，不是授权 handle。`OfflineBootstrapGrant` 的字段与这些字段不是同一个类型，现有文件中没有据此批准一个自动转换。本次不猜两者摘要相等、不新增 grant/enum，也不把某个 producer result 的 supported 结果转成 bootstrap approve 布尔值。

这项阶段决定属于 A/D 本地接口合同工作；实际 provider 能力和 B/C 本域语义另按各资源交付。先把这一决定写清再实现，避免实现出能在同一事务运行、却消费了错误生命周期证据的 adapter。

## 现有 C1 草案已给出的消费方向与原子关闭要求

继续查到的 `contracts/system-backup/v12/producer-authority-persistence.json` 的 `result_projection.unconfigured` 已描述：先把 candidate 结果提交到 producer target/result receipt/references；bootstrap 读取准确受审 candidate receipt/evidence、复查原观察，并关闭 domain，不隐式转换权限。`producer-authority-transactions.json::existing_entry_changes` 针对 `config_bootstrap_transaction.go` 同样要求按共同前缀锁 domain、candidate history/references，与 disabled-v1 config/receipt 一同消费 candidate 并原子关闭 epoch，不逐一更新无界 child grants。

这些文件仍是 C1 draft，`approved_reviewers` 为空；本文不把它们升级为生产批准。但对于既有 C1 方案，消费已提交 candidate 已是明确的拟定方向，不能继续把它描述成完全没有来源的新产品选择，或以提交前 call 替代它。上表两阶段的区别用于防止接口混用；若要偏离此 C1 方向，须明确修订方案及对应 owner 的评审。

由此下一份本地合同应具体回答四件事，而不再重建通用 runner：

1. D 提供保留原 result/receipt/history/reference 绑定的 candidate 消费边界；A 提供从原 offline grant、完整 config、registry/ref 与独立资源观察到该边界的可信关联。不要假定数据 union 本身就是授权。
2. A/D 在 bootstrap 事务前部取得同一 installation、producer domain 与 candidate 前缀，明确已有 admin/operation/config/nonce 范围的位置；锁后检查只读已锁范围。
3. 在同一原事务中完成原观察/期限和当前撤销事实复查、disabled-v1 初始化、candidate 所需引用处置以及 epoch 关闭/递增；最后检查后才由 bootstrap 唯一 Commit。不能另调自管事务的 DomainRevoker 造成两次提交。
4. 精确区分 committed retry 的历史读取与再次消费：原幂等成功可以按原授权读取原结果，不重开旧 producer epoch，不刷新观察、签发执行 handle 或第二次激活配置；未知提交沿原目标/幂等键处置。

当前 `ConfigBootstrapService` 尚无此 producer 消费与 epoch 关闭接线；`DomainRevoker.RevokeDomain` 自管事务，其独立管理撤销语义不能直接充当上述原子 bootstrap 关闭。该差距是拟定 C1 消费集成仍待完成，不是已有生产路径已启用或受攻击的声明。

## A 侧首个具体消费关系及可执行拒绝模型

A2 认领 A 安全资源的消费关系层，第一条具体关系为 `capture_signing` → 现有 SecretRef 的 `capture_certificate` → C1 `Target.Role=signing`、`EvaluatorOwner=A`、dependency 结果槽 `signing`。这是先把一条完整关系及拒绝条件写清，不减少原 27 槽或其他安全资源的交付。`acceptance_signing`、`catalog_signing` 必须各自保留专用密钥、domain/payload 和 profile；`evidence_kek`/`kek` 另需完整操作集合与历史材料，不能由单一 `kek` healthy 槽自动匹配。nonce/CA 沿现有独立候选，不强制走 producer。artifact/catalog/evidence 的 provider 事实继续由相应资源 owner 提供，不由本模型替代。

[可执行关系模型](evidence/a2-bootstrap-capture-binding-model-20261026.mjs)使用仓库已有 `unconfigured_signing` 合同向量和原 C1 schema/摘要工具；另固定模型内的独立用途/profile 对应，未新造 wire/grant/Policy。它检查原 scope、unconfigured admission、target/evaluator/profile、原 producer 标识、完整 evidence、原观察和 signing dependency 状态。41 项反例全部先通过现有 C1 结构校验并重新计算摘要，再因错安装/配置/集合/profile/用途/版本/原观察/结果等关系而拒绝。这证明摘要自洽不能替代用途与原输入关系；唯一关系正例明确返回“仅关系一致，无授权”。

模型故意让 bootstrap ref identity 与 producer target identity 不同，固定对应来自模型内的部署关系，而不是把两个 hash 强行设为同一字段；生产时这项关系必须由可信映射提供。它没有导出接口、接受 CLI 资源输入、实现 BootstrapResourceValidator 或减少 `--requirements` 缺项；[运行记录](evidence/a2-bootstrap-capture-binding-model-reviewed-20261026.json)保留这些边界。没有执行 Go、SQL、provider I/O 或产生构建/临时目录。

| 不可从现有结果推断的准确输入/接点 | 负责方及下一交付 |
| --- | --- |
| 原 OfflineBootstrapGrant/config canonical hash 与 DeploymentAdmissionID/CandidateHash 的受信对应；RegistrySetHash/RefSetHash 的编码、版本与完整集合 | A/D：固定现有授权来源、摘要域和映射规则；不能假设跨结构 SHA 恰好相等。 |
| capture signer 原 descriptor 的 purpose、key/provider identity/version、签名 domain/payload、原验证公钥/证书与历史保留及撤销观察 | A：从现有受控解析与真实 signer 路径取得；C1 signing healthy 本身没有这些逐用途语义，不能自证。 |
| 已提交 receipt/request、domain/grant/run/target 版本、candidate/receipt/hold 引用、history、ready evidence 原 bytes/object/manifest/retention 的服务内不可伪造消费能力 | D：提供具体可信消费入口及 query-only 后置复查；现有历史 receipt 读取或 mutable view 不能代替。 |
| bootstrap 前部共享 installation/domain/candidate 范围及与 admin/operation/config/nonce/资源范围的共同锁序、缺行锁、取消预算和最小权限 | A/D：提交准确表/键/顺序和冲突模型，前部建锁后末次只重查原范围；不得后插完整前缀。 |
| disabled-v1 初始化、原 candidate 消费引用及 epoch 关闭在同一 tx 中的 CAS、审计、容量、最终时间检查、幂等/unknown 处理 | D 提供其权威/CAS能力，A 对接 bootstrap 唯一事务；不得另起 revoke 事务或用自造 caller Policy 实现。 |

上述缺失使当前不能安全实现一个返回成功的生产消费 adapter；这不是只有泛化 TODO：阶段、首个 purpose、逐字段关系、41 个可执行拒绝条件和明确 owner 均已给出。D 的具体 sealed 消费与共同锁序合同到位后，A2 再把本关系接入真实 Prepare/Recheck，并对原受保护状态做完整正负回归；关系模型本身不能作为准入成功路径。

## 提交 A/D 核对的最小合同问题

| 决定 | 必须保持的约束 |
| --- | --- |
| 原观察与候选选择 | 先确定提交前观察或已提交 candidate 结果的阶段，再明确使用哪个已有可信入口取得具体 producer/candidate、原完整 result/manifest 摘要、installation/database、资源 role/purpose/ref/version/scope、原调用身份和授权来源。不能由 HTTP DTO 选择新身份或由 receipt 自证授权。 |
| bootstrap 绑定 | 明确原 offline grant、候选 config hash、registry/ref 集合与观察的关系；不借用 active-config 授权覆盖首次安装，也不允许候选模式写 live capability/health。 |
| 同事务当前复查 | 明确如何在 bootstrap 已有 tx 中验证原 domain/grant/run/ref/epoch/撤销/观察期限及证据保留。原 opaque handle 的有效性不能被替代成 caller-supplied view；不扩大原接口用途或制造新 grant。 |
| 锁顺序与权限 | 给出 bootstrap admin/config/nonce 与 producer authority/reference/evidence 各范围的共同顺序、缺行锁定、最小 SQL 权限和额外权限拒绝。不得在已取得后层锁后补早层锁；不扩大旧角色回执。 |
| 生命周期与验收 | 明确撤权、观察过期、版本/用途冲突、历史材料保留、重放/重启和 commit unknown 的行为。先给真实模型反例与准确源码/完整门禁，再做非实现者复审及受审装配。 |

此表是接口核对问题，不预定新的表、operation enum、wire JSON 或 default-allow callback。A2 后续可以承担安全消费 adapter 的实现与拒绝回归；D 提供或确认其原权威/事务接点，并优先核对上述 GuardInTx 复用途径。当前 finalizer 冻结门禁期间只核对设计资料，不改变正在受测的源码。

CA 与 nonce 现有本地候选仍保留各自准确版本范围；本次没有把所有资源强制改走 producer，也没有减少入口的 27 个缺项。证据存储/凭据、KEK、签名和跨资源关系须逐项确认真实合同及适用路径，不能用本接点讨论宣布整组资源已准入。
