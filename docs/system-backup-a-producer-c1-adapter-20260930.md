# A producer C1 适配与评审

日期：2026-09-30。作者 A，交接对象 D/C，采用 Job 时包括 B。承接 [C1 合同](system-backup-d-producer-authority-contract-20260930.md)、[Go 事务基础](system-backup-d-producer-go-foundation-20260930.md)及 [A 适配设计](system-backup-a-system-producer-adaptation-20260930.md)。本轮落实小正文加密准备与 A manifest 到 C1 的字段绑定，生产授权和完整发布链仍待接线。没有批准生产启用，也没有代填合同的 approved_reviewers。

## 已实现的 A 接点

[PrepareSystemCapability](../backend/internal/systembackupevidence/system_prepare.go) 独立接收 system/installation 的 capability_snapshot JSON，允许非空且不超过 64 KiB 的真实正文，包括 8 KiB 以下正文。调用受信 ContentAuthority，固定 producer 摘要、完整内容 policy 摘要和原截止；正文读取前后、加密暂存完成后复查。权限撤销、grant 换版摘要变化、延长或缩短截止、policy 替换均不返回可用 Prepared。失败的 writer 可能留有密文，宿主必须清理未登记暂存。它没有实现生产主体认证或 Transit resolver；注入的测试 authority/Keys 不能用于生产。

共用加密、manifest 校验、准确范围读取和对象 key 派生支持上述小正文，保持原 envelope/AAD、分块索引、hash 和原字节不变，不填充、不 inline 降级。普通 Prepare、任务 authority、日志正文与 STS 用途规则保留原限制。旧 SQLRegistry.PersistPending 明确拒绝小正文，以免从没有 producer 最终 Guard 的旧入口登记新路径。65 号现有表只约束正文上限，并没有大于 8192 的 SQL CHECK；本次没有修改迁移。此源码核对不等于小正文已通过真实 MySQL/生产登记。

[PendingProducerBinding](../backend/internal/systembackupevidence/producer_binding.go) 仅从 Prepared 内部 manifest 派生 manifest/content/object/key/KEK 字段，不能传入自报 manifest 摘要。通道准入提供 store、write、恢复 profile 和 root；相对对象 key 按现有身份与正文 hash 规则派生，pending 的 immutable_version 固定为 null。manifest_hash 继续使用既有 canonical(Manifest) 的 SHA-256，C1 typed frame 不参与重编码 A 的加密元数据。

`MatchProducerBinding` 对受信已锁定 Record 和通道重新计算并比较全部 C1 EvidenceBinding 字段。ready 必须携带准确登记版本；pending/write_unknown/write_failed 必须保持 null。完整 manifest、任意字段、相对 key、通道或版本大小写不一致均拒绝。它不读取数据库、不认证调用者、不验证 provider 证明；D 必须在同一事务加载受信记录/通道并执行最终 Guard。HTTP body 反序列化得到的 Record 不能作为该函数的可信来源。

## A 对 C1 新细化项的判断

| 项目 | A 判断与实现要求 |
| --- | --- |
| 逻辑目标键不含 profile，完整授权包含 profile/槽 | 接受该方向：profile 换版不能重开不受旧 fence 约束的目标。D 仍须锁定复核 profile，禁止旧 run 提交。 |
| legacy 结果槽唯一目标映射 | 接受显式映射和未映射仅候选的选择；映射必须来自受信配置，缺失时拒绝活动投影，不从结果正文推断。 |
| 小正文独立外置通道 | A 接受并完成本地 framing/内容入口；C 的独立通道信任、实际权限与 provider 证明仍未验收。 |
| 四种截止及一次 observation CAS | 接受。初次 probe 与后续正文/写入阶段有不同必备事实；BindObservation、续租使旧快照失效仍由生产 D 服务验证。 |
| manifest 摘要与 pending 历史版本 | 已提供 A 桥接。历史 binding 保持 null；ready 的版本须由已验证的精确对象观测入库，不能回写历史 manifest。 |
| uint64、UTF-8 与旧存储类型 | C1 范围不等于旧 SQL/适配器可表示范围。A 输出大小来自有界 int64，以规范十进制编码。对象 key 使用既有 ASCII 安全相对 key；准确版本按现有 ASCII 列限制拒绝不可表示值，不截断、归一化或转换大小写。provider observed version 的 A 正文适配仍采用既有 128 字符 token profile；更宽的 C1 输入不能静默转换。 |
| 新增容量与收据保留 | 接受保守收费、原报告五秒新鲜度及精确重放零收费方向。实际收费/释放与审计原子性、容量不足时独立紧急撤销通道尚未验证。 |
| typed-frame 和八表 canonical record | 接受与 A manifest 编码分离，索引投影必须逐项与完整记录核对；生产 Policy、正式 migration 和真实锁行为尚未交付验收。 |
| Secret evaluator 槽 | 接受由准入固定完整 dependency 集；正文通过或 evidence ready 不能自动生成 healthy。A evaluator 的输入绑定和资格判定仍待实现。 |

这些是 A 对明确细化选择的意见及部分实现，不是完整 C1 签收。部署 issuer/principal、历史恢复权限、紧急撤销、生产 SQL Policy 和跨 owner 运行证据缺失，因此保留 draft 和 V01–V10 未验收状态。R1 六项 finding 的设计回复继续有效，运行关闭条件没有被本轮本地测试替代。

## 下一步接线要求

1. D 提供真实 BeginCall/RecheckCall、事务内历史/通道读取和 pending/chunk 写入入口；A 的 ContentAuthority 适配须绑定完整固定快照，不能用这个包内的测试 fake。Go Transactions 基础已经存在，无需再等待最初的数据类型交付。
2. A 继续实现专用 encrypt-only Wrap 身份交换、系统 STS、提交后 publication claim、发布与独立历史恢复。Keys 必须自己验证 Wrap 前后的实时权限；当前通用注入接口不证明远端 KEK 权限或凭据隔离。
3. D/A 将 chunks、历史绑定、容量、审计与结果放入同一受 Guard 约束的事务；重排 GC operation 锁并复用前缀。旧 SQLRegistry 的直接 commit 不能用作系统路径。
4. C 提供实际 channel/profile、准确对象版本与不存在证明、Stat 和正文读取隔离、截止/撤销证据；如选 Job，再接 B 的身份、暂存清理与取消接口。

## 验证

入口：[本地适配验证脚本](../scripts/system-backup-a-producer-adapter-validation.ps1)。仅运行 evidence/producer 两包本地测试及 vet，并交叉编译 Linux evidence 测试二进制；GOPROXY/GOSUMDB 关闭，不安装依赖。Go cache/tmp/telemetry/二进制均在本次专属目录，finally 校验路径后清理。

新增用例使用未填充 capability JSON 做完整加密/解密和范围读，注入密文篡改、二次读取漂移、固定授权变化；验证旧入口拒绝小正文、零 Prepared 拒绝、全部 EvidenceBinding 字段篡改拒绝，并将 A 实际绑定嵌入 D 的 HistoricalBindingRecord 交给严格 C1 decoder 验证。生产 SQL、HTTP、真实 LDAP、Transit/STS/provider、V01–V10 都不属于这批本地测试结论。最终结果见 [机器记录](evidence/system-backup-a-producer-adapter-local-20260930.json)。

本轮两包测试及默认 vet 通过：114 个顶层测试、含子用例共 1073 个具名通过项，新增部分为 59 项；Linux 测试二进制交叉编译通过但未执行。专属 cache/tmp/telemetry/二进制已清理。最初记录的 122 份 Go 输入均未改变；最终文件集合核对发现 D 在编译期间新增 `systembackupproducer/lifecycle.go`，该并行新增不在最初快照中，本次不为它或更新后的整个工作树背书。后续需先核对 D 新接口与配套测试，再做集成验证。
