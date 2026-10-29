# 公共 C KEK 组合映射与 retained 输入：D 对齐单

状态：`candidate-pending-d-alignment`。基线 `f76c7439`，后续交接至 `3fbb347f`；这是供 A/D 评审的闭集输入提案，不是已签收的生产注册 API。本轮不实现转换函数、SQL scanner 或新的执行授权，先确定原持久化及事务来源。A 后续转述 D 源码核查结论：原配置引用和事务复查接点存在，但生产 KEK 映射存储、专属撤销/重绑定及完整历史引用水位尚未实现；以下不再等待一个已存在的完整 KEK store，而是明确 D 要补的最小事实源。

## 合同文件与版本

- [组合映射](../contracts/system-backup/v12/c-backup-kek-mapping.schema.json)：`public-c-backup-kek-mapping.v1`。
- [retained 完整扫描输入](../contracts/system-backup/v12/c-backup-kek-retained-input.schema.json)：`public-c-backup-kek-retained-input.v1`。
- 两者在原 public-c-crypto.v1 bundle 外；不改变已有 `KeyBinding`、envelope/AAD 或签名字节。当前范围仅 external-kms；Secret functional-test 不能混入此生产映射或作为回退。

## 两用途转换与验证边界

1. `config_ref` 原样承接原安装/配置的 `reference:kek`，`key_binding.identity_hash=config_ref.identity_hash`、`registry_version=config_ref.version`。没有生成身份的函数；缺失原身份/版本即拒绝，不使用 key 名或 profile SHA 派生。
2. `generate_ref` 和 `unwrap_ref` 分别引用原 `secret-ref.schema.json` 的 external_kms_key 两个用途。其操作 identity/version 可以不同，必须由原 registry 关系证明指向同一逻辑 KEK；不能强行取某一个操作 ref 的 identity 覆盖总 `reference:kek`。
3. provider_identity_hash、scope_hash 与原 provider 描述逐项对应；`provider_key_id`、endpoint、key_name、独立 numeric version 均从可信原映射获取，不能拆 registry_version 或从字符串名字推断。
4. 结构转换只能产生**未准入候选值**。A 原 authority 认证来源、检查用途权限/期限/撤销/历史保留并生成 Prepare observation；D 原事务最终 Recheck 成功后，生产组合才能消费为 `kms.Config`。JSON 不提供 `approved`、`healthy` 或 `complete` 布尔许可。
5. source_revision 是原来源版本，必须在 Recheck 中重新核对。相同逻辑 identity+registry version 不允许重绑定另一个 provider key/version/endpoint；更换 provider 要有另外受审的迁移合同。

immutable mapping 与观察分开：`config_sha256`、`source_revision` 和当前权限窗口属于本次观察绑定，不属于不可变 key identity；不同 config 可以继续引用完全相同的原 mapping。禁重绑定不能实现成“config 改变就拒绝复用同一 key”。当前 generate/write 许可、当前独立 unwrap 许可、撤销事实及材料保护/保留期限分别检查；停止新写不意味着删除历史映射，也不自动授予历史读取。

## D 原持久化/事务：已知事实与待确认项

已核对的现有来源：

| 来源 | 可复用事实 | 不能从中推导的事实 |
|---|---|---|
| migration 097 的 `system_backup_v2_configs` | `kek_identity_hash`、`kek_ref_version`、config_sha256、row_version | 未保存两用途完整 typed refs、provider locator/version、授权期限/撤销、完整 retained 水位；不能只凭两列构造完整 Config |
| `ConfigMutationResourceInput.ReferencePair("kek")` | 当前/拟议原 pin，与原安装及 config 快照 | 不产生原 provider registry 事实 |
| `ConfigMutationResourceObservation.Recheck(ctx,*sql.Tx,now)` | 由原 caller 事务执行最后复查，不允许自行 commit 或锁内网络调用 | 尚无已确认的 backup KEK 全量扫描/fence 实现 |
| `BootstrapCandidateAuthoritySession.LockReferences/Recheck` | 原 bootstrap 引用加锁及最终复查接点 | 通用回调不是 KEK 索引/scan source，也不证明原 Original 实现已提供完整集合 |
| migration 125 的 `runtime_resources.key_use_json` | 单个原 Job 的有界 key-use 观察 | 不是 registry，不是完整 retained index，不是任务授权或历史恢复 grant |

D 需确认后才能进入实现的五项决定：

1. 原 registry/配置目录或既有表中，哪个来源保存总 `reference:kek` 到两个操作 ref 和 provider 映射的关系？接口、文件、不可变版本及认证方是什么？若无则明确需要在哪个原持久化边界补字段/记录，由 D 评审，不能默认新增表。
2. 四类 coverage 的权威来源分别是什么：retained artifact、inflight/unknown 写入、hold/catalog、restore/prune？每类如何处理空集合、分页 EOF、已删除但仍需解密和无法解析的 envelope？
3. capture 在 provider 调用/最终 envelope 生成之前在哪里持久保留 planned key 引用？未知写入、接管与失败清理怎样维持引用，不产生扫描盲区？
4. 新引用写入、GC/退休、配置轮换怎样共享原锁序/fence？请给出准确锁对象、隔离级别和水位语义；不能仅使用 MAX(id)、本机时间或一次 RepeatableRead 快照防止并发新引用。
5. bootstrap 与 config mutation 分别在何处读取和最终 Recheck；旧历史恢复读取如何复用 retained mapping 而不继承旧 grant？

上述来源目前尚未取得 D 的针对性确认。A 后续交接表示已直接联系 D 并将转交结果，本聊天无需发送跨聊天消息；本文件先作为可交付的确认单保存。不能把仓库里的通用接口或 A 已发出确认请求当成 D 已签收。

### D 待实现的最小持久化与锁协议字段

以下是逻辑字段及一致性要求，交由 D 在原配置/registry 事实源中实现并给出准确 migration/查询接口；不是 C 自行定义的新表或执行许可。

| 事实集 | 最小逻辑字段 | 不可变与复查要求 |
|---|---|---|
| KEK 映射版本 | installation_id；原 config_ref identity_hash/version；完整 KeyBinding；provider 描述及不可变 ca_source；generate_ref/unwrap_ref 原字节与各自 SHA；记录 row_version。config_sha256/source_revision 在独立观察关系中保存 | 唯一逻辑身份使用原 installation+identity_hash+registry_version；原 provider 绑定和两用途对应关系不可在同版本下覆盖。不同 config 可引用同一 mapping；新版本保留旧版本，不能从当前映射集合推断历史完整 |
| 当前安全事实 | 原 authority/观察来源 ID 与版本、观察有效窗口；分别记录当前 generate/write 许可、独立 recovery unwrap 许可、对应撤销来源/revision、材料保护/保留期限的原来源 | 由 A 原准入认证后持久保存事实或受控引用，不能提供自报 approved/granted=true。变更须递增 source/fence revision；停止写入不删除历史 mapping，不推导恢复权限；这些字段不新增 Job 执行或恢复授权 |
| 引用成员事实 | coverage 分区、原 source_record_id/version、backup/attempt/envelope_id、完整 KEK identity/version 与 binding hash、原生命周期/保护事实引用 | 新生成调用之前登记 planned key；unknown 调用/写入保留成员。release 只能引用原已认证的完成清理/不存在性/解除保护事实，不能依赖单个 SQL deleted 标记 |
| 全局扫描/变更水位 | installation/source_id；覆盖全集的 snapshot_revision、fence_revision；分区计数与集合 hash 可派生 | 水位要覆盖映射变更、planned 引用、新/未知写入、hold、restore/prune 和成员释放；仅有 MAX(id)、时间戳或某一张表 row_version 不足 |

事务协议的最低要求：

1. D 确定一个纳入原锁序的安装/KEK 事实 fence；给出实际锁对象及获取位置，不能由 C 在回调里临时加一个与原任务锁倒序的 mutex。原 bootstrap `LockReferences/Recheck` 与 ConfigMutation `Recheck` 复用同一事实源。
2. 所有会新增引用或改变映射/保护/释放状态的路径，必须在持有该 fence 的原事务中更新事实及 revision。仅 scanner 使用锁、writer 不参加，不能阻止并发漏扫。
3. scanner 在权威 snapshot 中读完整四分区，返回覆盖范围及 revision；最终退休/配置切换事务持有同一 fence，比对原映射、全部分区水位和原 authority 状态。若有任何新变更，原观察失效并重做完整准备；不能把错误水位当作空集合。
4. provider I/O 仍在事务外。正式发起 Generate 前的 planned 引用预留必须先持久成功；结果未知不释放。删除/退休外部动作必须使用 D 原持久意图/未知结果处理，不能在最终 Recheck 后释放锁再无条件删除 key。
5. 初次装配前必须核验全部 writer/GC/restore/prune/轮换入口都参与上述协议；缺路径时 complete-scan capability 不得启用。若完整备份引用索引尚无历史回填/校验，不能用新建空索引证明没有旧引用。

A 已表示会把这些合同和字段转交 D，并由 D 实现生产存储/事务事实源。当前确认的是**缺口存在及归属**；字段落表、source_id 定义、精确锁顺序与查询接口仍待双方评审，不能据此声称合同已经签收或 scanner 已实现。

## retained 输入规则

schema 的四个 coverage 分区是**覆盖分类**，不是新增数据库 status enum。每个分区必须由可信 source 返回 snapshot_revision、fence_revision、计数和精确引用集合 hash；完整性与水位由原来源认证，不由 JSON 自证。没有扫描/分页未结束/缺分区/过期/未知 key binding 时 fail closed；非 nil 空列表只在全部来源经原 fence 证明为空时可用。

每个引用保留原 source record ID/version、backup/attempt/envelope identity 和完整 KeyBinding。`binding_sha256` 单独不足以恢复；新增必填 `mapping_source` 和 `expected_request_source`，分别引用原完整 mapping（包含不可变 CA 来源）和原 plan/envelope 中完整 KeyRequest/context。SourceRecord 闭集为 source_id、record_id、record_version、content_sha256；它是原可信来源中的记录引用，不是可直接打开的任意文件路径/URL。实际取回必须验证原来源与完整字节 hash，不从不可信 wrapped 数据单独重建 expectedRequest，不复制旧 grant 充当当前恢复许可。provider.ca_source 的 PEM 字节还须匹配 ca_pem_sha256。

未知/尚未完成的写入使用原计划已保留的精确 key；不能等到最终 envelope 才纳入扫描。不得只过滤 succeeded、未过期或 SQL 未删除的行。每个分区 hash 与全量 hash 的排序/JCS 算法已写入 schema；hash 只检查集合字节，不能替代原来源完整性。

删除旧 key 前，必须确认全量旧映射未丢失、所有仍引用版本可恢复、当前写入已切换、未知调用仍受保护，并在与新写/GC/配置修改共享的原边界最终复查。A 的安全 adapter 消费这些原事实；C 提供业务引用范围/格式；D 提供 SQL/原持久化与锁协议。暂无正式 scanner，也不提供恒成功 Original。

## 交付与验证范围

本轮仅新增 JSON Schema 提案和对齐文档，JSON 可解析、相对 `$ref` 可解析；没有生产转换/扫描实现或正式准入结论。已有 C crypto 回归不因文档提案重跑，也没有新增构建产物。D 来源与锁协议确认后，再补转换/校验实现和负例：跨安装/配置、两用途错配、同 ref 重绑定、缺/过期扫描、分页缺口、未知写入、并发新引用及历史读/旧 key 禁写。

后续独立交付：[公共 C 纯候选解码 API](system-backup-c-kek-candidate-api-20261029.md) 已实现不依赖来源/SQL 的闭集解码、候选内部关系、immutable mapping 对比与 retained 结构/排序/hash 检查，并通过本地回归。输出始终是 Unadmitted 类型；这只补齐无依赖部分，生产来源认证、scanner 完整性、分页 EOF/共享 fence、原授权与生产 Config 装配仍按本对齐单交由 A/D。
