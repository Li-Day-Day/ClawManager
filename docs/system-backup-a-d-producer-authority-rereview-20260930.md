# A 对 D producer 授权设计 R1 的复审

日期：2026-09-30。评审方：A。对象：[D 的 R1 修订稿](system-backup-d-producer-authority-revision-20260930.md)，对应 [A 首轮六项意见](system-backup-a-d-producer-authority-review-20260930.md)。

**结论：A 认可 R1 对六项意见的设计回复，本轮未发现新增的设计阻断项。可以据此推进合同和接口细化。六项的实现及运行验收尚未完成，不能标记最终关闭、合同冻结或生产接入通过。**

本结论仅代表 A 对该指纹版本的设计评审，不替代 C 对真实 provider、独立证据通道的签收，也不替代采用 Job 时 B 的宿主接口签收。原提案、首轮评审和 D 的 R1 交付记录保留，本文记录后续状态。受审版本、源码指纹及校验范围见 [复审机器记录](evidence/system-backup-a-d-producer-authority-rereview-20260930.json)。

## 六项意见的处理结果

| 首轮项 | A 的复审判断及依据 | 仍需完成的验收 |
| --- | --- | --- |
| A-D-PROD-01 / P1 | **设计回复认可。** R1 §2 明确无配置、disabled、enabled 三种互斥授权；选择有独立信任来源的外置通道，缺失即拒绝；bootstrap 在共同锁域消费候选证据并关闭旧域 epoch。消除了“先启用才能检查”的循环，也没有扩大 offline bootstrap grant。A 接受此路线，不要求改回 inline。 | C 提供真实通道及无自证循环依据；A 复核部署身份验证与签发用途；D 验证 bootstrap/认领/登记/结果竞争、disabled 检查不能启用配置（V02、V03）。 |
| A-D-PROD-02 / P1 | **设计回复认可，A 接受适配责任。** R1 §5 明确独立 preparer/发布入口、按场景绑定的 STS、提交后私有 claim、Wrap 身份隔离及准确对象操作权限。没有放宽任务授权或借用 config/attempt。 | A 实现系统正文、Wrap、STS 和发布接线；C 验证准确对象条件写/不存在证明及实际 ACL。覆盖各旧用途凭据互换、伪造场景和中途撤权（V01、V04、V10）。 |
| A-D-PROD-03 / P1 | **锁序及事务语义设计认可。** R1 §4 将当前顺序与拟议 L0–L10 分开，明确 operation、授权、引用、容量、审计和 evidence 的先后；指出空索引 gap lock 不是独占互斥；由事务拥有者在回调、审计和最后写入后运行 Guard。提交不明须查回同键，不能靠快照“未找到”重建请求。 | D/A 将层次落实到具体 SQL、索引、FK 与事务接口；验证容量/审计锁等待跨期、空集合竞争、引用/GC 竞争及回滚（V03、V04、V05、V07、V08）。抽象锁序本身不证明真实 MySQL 无反向锁或死锁。 |
| A-D-PROD-04 / P1 | **历史恢复设计认可，A 接受独立恢复适配责任。** R1 §3、§6 区分租约、不可变写截止、原观察和保留期限；保留无配置及配置切换前的历史绑定。恢复有独立身份，等待写截止和旧 claim 失效，仅 Stat/收敛 evidence；404 保持未知，迟到对象不续活旧 producer。 | A/D 补无配置历史读取、扫描、认领及收敛入口；C 提供准确对象证明。验证撤销但写截止未到、bootstrap 后迟到、配置切换、404 后对象出现（V04、V08、V09）。 |
| A-D-PROD-05 / P1 | **幂等及结果竞争设计认可。** R1 §7 固定幂等范围和摘要覆盖项，使用独立目标 run 代次及结果 CAS，锁定 evidence 后检查 owner/type/hash/ref/version/ready/GC。旧授权失效后的历史查询须另行授权，重放不刷新观察或重复收费。 | D 落唯一编码、时间精度、目标键/结果集合、索引和收据接口；A/C 复核 evaluator 资格。验证同键冲突、旧 run 晚到、GC 认领、审计失败和 commit 丢包（V06、V07、V08）。 |
| A-D-PROD-06 / P2 | **续租选择认可。** R1 §3 选择续租增加 grant 版本并使在途快照失效，保留完整前后比较；新调用可以取新快照，已登记证据仍用原 manifest/密文且不延长原写截止或观察期限。该保守选择与现有正文/STS 拒绝边界兼容。 | D 提供版本/代次复查，A 固定调用内快照；验证普通续租、同证书换代、期限缩短和读取/交换中到期，以及原密文重试（V01、V05、V08）。 |

上述状态统一为 `design_response_accepted_pending_implementation`。首轮各项包含运行验收关闭条件，因此本轮最终关闭项为零；这不表示 D 仍未回复，也不要求 D 为同一设计选择重复提交修订。

## 对现有接点的独立核对

1. [ConfigBootstrapService](../backend/internal/systembackupsecurity/config_bootstrap_transaction.go) 仍创建 disabled v1，现有事务没有 producer 授权域失效动作。R1 明确这是待接线的原子变化，不能把现有 bootstrap 测试当作其验收。
2. [SQLRegistry](../backend/internal/systembackupevidence/sql.go) 的 `PersistPending` 在写完 chunks 后直接 commit，`WithLocked` 在回调后直接 commit，均没有拟议最终 Guard；其 `OwnerDeadline` 又在 evidence 加锁后调用。A 确认须调整事务拥有者，并要求该回调只读取预锁历史绑定。
3. [GC registry](../backend/internal/systembackupevidence/gc_registry.go) 当前先 `LockScope` 后锁 operation。A 接受 R1 要求重排入口/复用锁上下文；不能直接把取得 L0–L6 的新 `LockScope` 塞进现有调用位置。引用检查也须读取已锁事实。
4. [RegistrationCapacity](../backend/internal/systembackupsecurity/registration_capacity.go) 当前在 reservation 行锁之前检查报告时间。R1 要求锁等待后及最终 Guard 再校验原报告的五秒新鲜度，确实覆盖了原接点的时间缺口；最终 Guard 不应为了取新报告在事务末增加文件或网络 I/O。
5. [TaskPreparer](../backend/internal/systembackupevidence/task_prepare.go) 绑定 `SQLTaskAuthority`，[Publish](../backend/internal/systembackupevidence/lifecycle.go) 固定 task claim，[STS](../backend/internal/systembackupevidence/s3_sts.go) 要求正数 config 并只支持四种既有用途。A 将实现独立系统接点；仅提供 `ContentAuthority` 仍不足以完成发布链路。
6. [ContentDispatcher](../backend/internal/systembackupevidence/content_dispatch.go) 比较 producer 摘要和整个 policy，STS 比较完整授权。R1 的续租即失效语义无需删除这些检查。适配时每次复查须返回同一次调用的固定快照并核验最新权威状态，不能每次按当前时间重新计算 policy 截止而误伤正常调用。
7. [SQLWriteRecovery](../backend/internal/systembackupevidence/write_recovery.go) 构造器要求正数 config，事务依赖原配置匹配；其现有末次时间检查不等于已有无配置恢复。A 接受单独读取历史绑定的分支，并保留仅收敛存储状态的限制。
8. [角色映射](../contracts/system-backup/v12/a-capability-role-mapping.json) 仍只允许 artifact/catalog/evidence 投影 provider 行；KMS/Secret/signing 经独立 evaluator。R1 没有把 evidence ready 或健康历史行当作 producer 授权。

本轮未将这些尚未实现的接点重复列为新的 R1 设计缺陷。它们是明确的实现清单，后续代码评审必须逐项核对。

## A 确认的接口边界与后续交付

A 接受 R1 §5 的语义接口划分：D 提供不透明授权句柄、固定调用快照及其复查、调用者事务内的准入/结果/Guard 和独立历史读取；A 消费这些接口完成系统正文、Wrap、STS、发布及恢复。以下字段编码、Go 类型及数据库约束仍需在下一份合同交付中具体化，本文不冻结新 API。

- **D：** 按 R1 细化域/grant/run/目标代次/历史绑定/收据的 schema、唯一键、外键、容量成本及引用/GC 范围；提供事务接口、幂等摘要编码和验收向量。准备合同草案可继续，整体冻结仍需对应 owner 签收和新指纹评审；不夹入现行仅补 080 的现场升级包。
- **A：** 以该设计完成独立系统适配设计，并在上述具体接口对齐后实现。保留既有 task/download/gc/recovery 的用途拒绝；恢复读取的历史授权不能转换为 producer 执行权。
- **C：** 提交独立证据通道信任依据及实际 provider profile，证明条件写、准确版本/不存在证明、截止限制和用途 ACL。仅有本地 `S3Stat` 枚举不能证明远端凭据无法读取对象正文，必须验真实限制。
- **B（采用 Job 时）：** 确认工作身份、UID/generation、取消/接管及投射凭据失效；未选定 Job 宿主前，不将此项记为已完成或借用 capture 权限。

运行验收沿用首轮 V01–V10 和 R1 §8；本轮执行数量为零。无需为本次纯设计复审重跑既有 25/25 MySQL 探针，也不能用那批结果替代系统 producer 的新验收。

## 本轮验证及范围

- D R1 机器记录列出的 29 份输入和 2 份交付，共 31 个 SHA-256 校验全部匹配；原提案与首轮评审可追溯。源码核对和指纹校验是不同范围，机器记录分别列出。
- `node scripts/system-backup-contract-check.mjs --check` 退出 0。此为非 strict 一致性检查：仍为 draft，迁移 catalog 为 93 文件，99 个对象，39 项策略待提交、60 项对象交叉评审待完成；缺失的四项 artifact 和 schema hash 门禁仍保留。
- 本轮仅新增 A 的复审报告/机器记录并更新 A 导航。未变更运行代码、公共合同或 `approved_reviewers`，未执行远程操作、Go/MySQL 测试或构建，未安装依赖，未生成测试构建产物。

复审状态：`a_design_accepted_pending_contract_and_runtime_validation`。C/B 及整体验收状态保持待完成，生产批准为否。
