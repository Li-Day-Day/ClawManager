# A：已提交 bootstrap candidate 的授权关联与时间合同意见

2026-10-26。A 本地设计意见，提交 D2/D1 和 A2 核对后才能作为共同实现合同。它不是新增 grant、wire/schema 决议、资源准入或生产批准。owner 来源 `2099...13b0` 的本轮门禁已经独立收口；本合同及后续实现不继承该运行覆盖。

## 消费对象与授权来源

沿用 C1 persistence 的 `result_projection.unconfigured` 与 transactions 的 bootstrap entry 方向：消费已提交的 `bootstrap_candidate` receipt/evidence，创建 disabled-v1 并原子关闭原 domain epoch。不得使用提交前 CallSnapshot 代替 receipt，不能放宽 executionPolicy 的 committed 拒绝，也不能把历史 receipt 可读转换为当前消费许可。

现有 `OfflineBootstrapGrant` 绑定 DB UUID/database/installation、用户、matrix、完整 canonical config、原幂等键与原因；`BootstrapGrantFile` 的原文件摘要还绑定 not_before/expires_at。当前类型没有 DeploymentAdmissionID、registry/ref 集合摘要算法、policy/profile 或 producer target。`UnconfiguredAdmission` 有这些字段，却只是数据 union。因此现有结构之间没有可直接声称已认证的转换。

实现必须从原受信部署授权边界取得完整关联，至少同时固定：

- 当前原 offline grant 全部语义、原 grant 文件摘要及有效窗口；准确禁用配置 canonical 字节与摘要。
- 原 domain 开立时经独立部署验证器认证的 admission、issuer、scope、epoch，以及 DeploymentAdmissionID/Candidate/RegistrySet/RefSet/Policy/Profile 的完整原值。
- 消费的完整 ResultRequest/receipt key/request hash/result version、grant/run/history、target/generation、evidence 与 candidate/receipt/hold 引用；资源 role/purpose/ref/version/scope 与原 registry/config 的精确关系。
- 当前独立 bootstrap 主体权限与原资源观察的来源、期限及撤销事实；外部证据通道的独立信任依据不由待验证资源自证。

哈希一致是必要的输入绑定，不是签发权证明。不能把 DeploymentAdmissionID 猜成 idempotency key，不能默认 CandidateHash 等于 config hash，也不能自行发明 registry/ref 集合摘要。可复用已有明确算法或原可信部署映射；缺准确规则则拒绝。新添一个可由调用者填值的 DTO、approved 布尔、任意 Policy 或空回调，不会补齐这个来源。

原 C1/R1 方案把独立部署身份验证器及其准入关联作为强制集成。当前实现接口和测试模型并不能证明现场或仓库已有可直接装配的具体权威实现。D 的消费接口必须明确承接这一既有边界，A adapter 则解析/比较真实资源与完整关联，不能通过 constructor 把“匹配数据”封装成无来源的授权。部署输入完整性、受控读取权限和当前撤销检查分别成立，文件摘要不冒充签名。

## A 提议的 committed 消费时间语义

R1 已区分租约、不可变 owner 写截止、原观察截止与保留截止，并明确 bootstrap 使用独立 admission 消费候选。A2 的时间模型是这一提议的可执行反例，尚不是原生 SQL 或当前授权证明。

| 时间/状态 | 新消费时的要求 |
| --- | --- |
| 原结果提交合法性 | 原 receipt/history/run/target/证据精确一致，原提交当时满足受审 producer 授权与写入时限；历史字段不改写。 |
| 原 producer lease、执行 authorization 截止、owner write cutoff | 已提交结果的这些执行窗口单独到期，不作为新的消费截止，也不因消费续期。新消费不调用 probe/content/Wrap/STS/PUT 或发放 execution handle。 |
| 原 producer 显式撤销/代次/target | 当前 revoked/superseded、epoch/generation/current-run/result-version 变化仍拒绝；执行窗口到期不能掩盖明确撤销或替换。 |
| 原 domain admission、独立 bootstrap/offline 主体授权、资源 dependency、原 observation | 均须按各自原值当前有效；now 等于截止即拒绝。offline not_before 也必须满足，不从本次 Prepare 或重试重新计算 observation。 |
| evidence/history/receipt/reference 保留 | 保留保护必须覆盖准确消费过程及约定后续保护；长期保留不替代 observation 有效。不得删除 producer_receipt/hold 历史。 |
| SQL 时钟/context | observed_at 不得未来；最终 SQL 样本不早于最后已验证样本，不只比较最早入场时间；取消拒绝。最终检查后由 bootstrap 唯一 Commit。 |

特别的合法对照是：原 producer 已合法提交，执行 lease/authorization/write cutoff 已过，但原 observation、当前 domain admission、独立 bootstrap 授权与依赖仍有效，且没有显式撤销/替换。该对照不能仅因旧执行窗口过期而拒绝，也不能据此为它恢复任何 producer 执行权。D 若认为既有某份原授权把消费也限定在这些窗口内，须指出准确原合同并修订共同决定，不能暗自继承 executionPolicy 或选择任意更小的 min。

原 bootstrap 成功重试须重新验证当前 offline/RBAC 与原请求绑定，然后按约定历史规则返回原结果；它不再次消费、不增加 epoch、不重新收费、不刷新观察。commit unknown 沿原 operation/key 锁定查回，不从普通 snapshot absence 推导回滚，也不重开已关闭域。

批次幂等必须绑定完整的“用途/ref identity/version/mapping/scope → receipt key/request hash/result version”关系和原 offline grant 语义，而非只绑定无序候选摘要集合。[D1 的设计反例](evidence/d-bootstrap-candidate-idempotency-model-reviewed-20261026.json)证明：两个结构合法并重算摘要的候选交换用途关联后，摘要集合不变。完整关系排序可保持相同项目重排的稳定性，同时拒绝交换、重复、缺项和增项。该模型没有选择生产 request_hash 编码；实际方案须明确既有 Bootstrap request_hash 兼容性，不静默改写历史收据。

## 同事务接线与验收条件

先在锁外完成真实资源、TLS/权限/能力观察和完整候选集合选择；同一事务按 C1 L0–L10 的 union prefix 取得所有 installation/config/domain、admin/撤销、operation/receipt、grant/run/history/host、target/ref/nonce 等范围及缺行锁。当前 bootstrap 在 admin/operation 后才检查 config absence，与 C1 全前缀有位置差异，必须明确调整，不能在 resource.Recheck 中首次调用完整 GuardInTx。

D2 定义保留原 candidate 身份的具体消费接点及前缀/阶段；A2 实现适用资源的 Prepare/Recheck 关联。引用处置、disabled-v1/config/installation/operation/audits 与 domain epoch CAS 同事务提交；保留历史 receipt/hold，禁止隐式 live projection、无界 child-grant 更新或单独调用自管 DomainRevoker。所有回调/写入完成后独立检查预期关闭后的状态与原时限，再由 bootstrap 唯一提交。

验收包括合法过期执行窗口对照、观察/当前授权到期等值、显式撤销/代次替换、重算摘要后仍拒绝的错关联、缺行/锁序、晚回调改事实、逐写失败回滚、最终写等待/中间时钟回退、精确重试及 unknown commit。复用 [D 的 BC1–BC12](evidence/d-bootstrap-candidate-independent-requirements-20261026.json)逐项检查实际实现和当前原生结果；模型、接口提案或已有 owner 门禁均不能替代。

本轮分工：D2 producer consumer/共同前缀，A2 A 侧 adapter/拒绝模型，A1 权威关联与时间边界核对，D1 独立验收协调。当前合同待共同核对，真实 consumer 尚未实现；27 项资源总范围未减少。
