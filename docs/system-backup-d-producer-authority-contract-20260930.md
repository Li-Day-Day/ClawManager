# D：producer 授权 C1 合同交付

日期：2026-09-30。状态：**合同细化草案已交付，待 A/C 评审；采用 Job 时需 B。** 本轮范围是上一轮约定的 schema、事务接口、持久化键/容量/引用范围、幂等编码和验收向量。不是已接线的生产 producer、正式迁移或远端升级。

[A 对 R1 的复审](system-backup-a-d-producer-authority-rereview-20260930.md)已认可六项设计回复。原 R1、A 评审和原机器回执均保留；C1 是后续交付，不修改旧指纹或代 A 关闭 finding。C1 的额外细化选择也须重审，不把 R1 认可转写为 C1 批准。

## 1. 可审查产物

| 产物 | 内容 |
| --- | --- |
| [schema](../contracts/system-backup/v12/producer-authority.schema.json) | 三场景 tagged union；六角色 target；8 类控制记录；完整 ResultRequest/CommandRequest；全部对象字段闭集；uint64 用十进制字符串，UTC 时间精确至微秒。 |
| [事务接口](../contracts/system-backup/v12/producer-authority-transactions.json) | 17 个方法的输入、返回、事务归属、L0–L10 锁序、私有句柄/快照/claim、错误语义、现有源码改造接点及域分离摘要。它是接口规范，不是已实现的 Go 类型。 |
| [持久化字典](../contracts/system-backup/v12/producer-authority-persistence.json) | 8 张拟议表的字段存储、主键/唯一键/索引/FK、CHECK/应用不变量、扫描索引、生命周期、容量及引用/GC 边界。未分配 migration 编号。 |
| [验收向量](../contracts/system-backup/v12/producer-authority-vectors.json) | 18 个三场景×六角色结果样例、4 个生命周期命令、8 个记录样例、35 个拒绝向量、固定编码/hash 向量，以及未执行的 V01–V10 运行矩阵。全部 synthetic。 |
| [参考编码/检查器](../scripts/system-backup-producer-contract.mjs)及[测试](../scripts/system-backup-producer-contract.test.mjs) | 无依赖 typed-frame 编码、完整请求/幂等键摘要、结构与静态跨字段约束、容量上界计算。不认证身份，不连接数据库或 provider，不产生句柄。 |

`contract-manifest.json` 新增 `producer_authority=draft`，交叉评审请求已登记；主计划和 D/流程导航已同步。内部 C1 记录不进入 Admin Go/TypeScript DTO：没有增加 HTTP 路由、现有 DTO 字段或公共 operation enum，当前公共 DTO parity 不变。运行实现时须从这些定义落 Go 强类型并另测 SQL/授权转换，不能把 schema 校验结果当权限。

## 2. 六项 finding 的实现输入

| finding | C1 交付 | 尚需执行 |
| --- | --- | --- |
| PROD-01 | `Admission` 无配置/disabled/enabled 互斥；域独立于 installation/config；候选结果只落 target/receipt/reference；bootstrap 原子关闭旧域。 | C 独立证据通道；A 部署签发/工作身份校验；D 域 provisioning、bootstrap 事务与真实空集合竞争。 |
| PROD-02 | 私有 ExecutionHandle/CallSnapshot/PublicationClaim；独立系统 prepare/publish/recovery；每方法明确 owned/caller transaction，保留旧 task/STS 用途拒绝。 | A 实现正文/Wrap/STS/发布接线；C 精确对象 ACL、条件写与不存在证明。 |
| PROD-03 | 数据字典索引/FK；L0–L10；FinalGuard 必须由事务拥有者在回调/审计/最后写后执行；锁等待后重取 UTC。 | D/A 实际 SQL、完整 migration、容量/审计锁等待跨期及 deadlock/commit 不明测试。 |
| PROD-04 | 历史绑定独立保存原 admission/run/ref/key/密文与观察摘要、固定写截止；恢复只 Stat，旧配置无需活动。 | A 历史扫描/claim/恢复，C 准确版本证明；404 后迟到、撤权但写截止未到的运行测试。 |
| PROD-05 | 完整请求编码、独立命令/结果收据、目标代次与结果版本双 CAS、引用范围、重复请求零收费。 | D 结果事务、projection alias 映射、实际唯一约束/GC 竞争/审计回滚。 |
| PROD-06 | Renew 增加 grant row version；固定快照失效；旧 evidence 用原密文重试；新 takeover 使用新 grant/run/evidence。 | A 调用内复查，D 版本/代次查询；真实普通续租/缩短截止/在途撤权验收。 |

上述 finding 仍为设计回复已接受、实现待验，不记为最终关闭。

## 3. 本次细化选择

**目标及结果。** 逻辑 target key 固定 evaluator owner、role、identity、ref version 和 scope hash。profile/结果槽属于完整授权及请求摘要，但不进入逻辑 key；这样 profile 换版不会新开一条可被旧 run 绕过的目标 fence。结果槽按 ASCII 排序，重复、缺项、任意追加均拒绝。C 的三角色必须提交当前 mapping 的完整 capability 集；KMS/signing 由 A 分别评估 kek/signing，Secret 必须由 A 准入明确 dependency 集，不能默认“上传成功即 healthy”。所有 negative/unknown 结果也保留原观察时间与已登记 evidence。

**projection 冲突。** 现有 provider/dependency 唯一键没有 probe scope/profile；不同 target 可能映射同一老结果槽。C1 规定由当前配置准入固定每个槽的唯一目标映射，并在 L1/L5 锁定复查；其他 scope 只能产生候选收据。无配置结果也只作为候选，绝不向活动 capability/health 表写入成功。该映射规则是新增评审项，运行适配缺失时拒绝投影。

**持久化。** 数据字典采用类型化索引列和有上限的 canonical record bytes；完整记录保留所有 schema 字段，加载时必须解码验证，并与每个索引列及记录 hash 精确比较。不能只验证 JSON 后信任未经核对的 SQL 投影。域没有 installation/config FK，历史没有 active-config FK；部分引用采用同事务逻辑约束，以避免插入循环或反向 evidence FK 锁。字典已逐项说明，仍须在正式 DDL 阶段评审并实测，不声称这些限制已由数据库执行。

**四类时间。** grant lease、固定 owner write cutoff、原 observation expiry 和 retention 分开；claim 截止也是调用上限之一。Run acquire 时可预留 evidence ID，但 observation 两字段都为 null；在 authenticated probe 完成、登记 pending 前由 BindObservation 单独 CAS 固定；初次 probe 使用部署/身份/租约/预算上限，后续正文和发布调用才额外要求原观察截止。重试不得重新绑定观察时间。历史 binding 永久保留 pending 时的 immutable_version=null，最终对象版本在 evidence/结果收据中绑定，不改写原 pending manifest。合法 hold 只延长保留，不延长写入或观察。

**摘要。** C1 typed-frame 是自定义域分离的长度前缀编码，不冒称 JCS。对象键按 UTF-8 字节排序，数组顺序保留，字符串不作 Unicode/换行归一化；计数用规范十进制字符串，拒绝数字 JSON、无效 Unicode 和溢出。请求摘要覆盖所有字段，幂等键仅使用规范指定的 scope/grant/run/purpose/target/request key。A 的 `Manifest` 摘要继续使用现有 `systembackupevidence.canonical(Manifest)` 字节的 SHA-256，不改变 envelope/AAD；A 适配须返回经验证的摘要，D 比较登记记录，不能接收 caller 自报摘要作为证据。

**容量与保留。** 每笔新事务固定预留 64 KiB，每个新增保留行预留 64 KiB 加记录上限向 4 KiB 取整，再加原有 evidence/chunk/audit/projection 成本一次。此为保守准入量，不是精确 InnoDB 占用测量。精确收据重放不收费、不刷新时间。报告身份与五秒新鲜度在等待后及最终 Guard 重验；未知状态、旧历史和 receipt 全部继续计费。自动扣减及 receipt tombstone 清理尚未定义运行实现，C1 默认保留，容量不足拒绝新工作；不会借新采样抹掉预留。

## 4. A 接线合同和现有代码差异

1. `SQLRegistry.PersistPending/WithLocked` 目前没有最终 Guard，不能只替换 SQLPolicy 就宣称完成。建议先在事务拥有者提供显式的 `LockAdmission → callback → FinalGuard → Commit` 接口，再接入系统实现；每个回调只用服务端持有的同一事务锁上下文。
2. `gc_registry.go` 现在 LockScope 早于 operation 锁；不能将取得 L0–L6 的新 LockScope 原样塞进去。必须把 operation 放到 L3，引用空范围放到 L5，再锁 evidence。
3. `registration_capacity.go` 当前报告检查发生在 reservation 锁之前；C1 要分离读取固定报告、取得容量锁和收费，并在事务末检查同一报告。禁止为了通过末检查临时读取新文件。
4. `TaskPreparer`/Publish/STS 保持原用途；新系统入口不能用 config=0 通配或伪造 task/attempt。PublicationClaim 在两次已确认提交后才生成；commit 不明先重新认证并锁同键查回。
5. `types.go` 的现有 `Identity.valid()` 要求 content size **大于 8192**。R1 选择独立外置通道，但真实 capability 正文可能更小。A 需要评审系统路径对小正文的精确加密/分块支持，或明确拒绝该输入；不能填充正文、放宽普通任务权限或自动 inline 降级。C1 的字节字段允许非零小值，是待适配的新系统合同，不代表当前 A runtime 已支持。
6. C1 的 evidence ref version 和 installation 格式已收紧到现有 A 类型接受的形式，provider ref/observed version 也保持既有 128 字符上限。Go/SQL 转换仍须显式检查有符号 int64 等可表示范围与精确字节，禁止静默截断、大小写转换或把宽类型强转成负数；C1 参考校验不代替 A runtime 校验。
7. 域建立、重签和紧急撤销需独立部署管理授权，不是 Acquire 的副作用。Acquire 只消费已存在且仍有效的域。容量不足时仍须能经独立身份撤销通道失效授权；该通道/预留管理容量由 A/D 在部署准入实现中验证，未具备则不准入 runtime。

## 5. 下一轮 Owner 评审输入

| Owner | 需要签收的具体内容 |
| --- | --- |
| A | 三场景部署 issuer/principal；固定调用快照和 renew 失效；小正文外置证据；独立 prepare/Wrap/STS/publish/recovery/receipt-read；Manifest 摘要桥接；SQLPolicy 最终 Guard；Secret evaluator 槽；紧急撤销不受新分配阻断。 |
| C | 独立通道及无自证循环依据；实际条件写、准确对象版本/不存在证明、Stat 与正文权限隔离、截止/撤销限制；完整 capability 集与 legacy projection 唯一映射。 |
| B（选择 Job 才需要） | workload/namespace/Job UID/generation、取消/接管、投射凭据失效，以及宿主接口；当前没有默认使用 capture 权限。 |
| D | 按评审后的数据字典落正式 migration/Go 类型/SQL；同步 catalog/controller/inventory；测试完整锁序、FK、容量/审计等待、幂等及 GC；再组织 V01–V10。 |

仅在仓库中登记交接请求，没有发送消息或代填 reviewer。当前 94 文件 catalog 及新用户名迁移后的升级边界保持独立；本合同的八表不进入现行 only-080 包。不能沿用旧 93 文件现场回执来验收新表。

## 6. 验证记录

本地检查与文件指纹见 [C1 机器记录](evidence/system-backup-d-producer-authority-contract-20260930.json)。目前已完成：

- 新参考校验测试 74/74，通过手写独立 frame 字节、固定摘要、三场景六角色、命令、字段拒绝/字节/时间/整数边界、幂等变化、FK/索引字典及容量算术。
- 既有合同 artifact 测试 70/70、合同门禁测试 6/6；非 strict 合同一致性检查退出 0，94 文件 catalog hash 仍为 `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93`，99 对象、39 项 owner 策略待提交、60 项交叉评审待完成。新测试已加入原 CI 合同测试入口。
- Windows sandbox 下 `node --test ...` 首次因子进程 `spawn EPERM` 未执行用例；随后直接 `node scripts/system-backup-producer-contract.test.mjs` 使用同一 Node test 模块在当前进程执行通过，没有安装依赖或扩大权限。

以上仅证明本次草案的结构/编码与既有静态合同一致性；不证明正式 SQL 锁、认证、provider 或生产准入。V01–V10 全为 `not_run`，evidence=null。未运行 Go/MySQL 构建、未访问远端，未生成编译产物；一次性 fixture 生成脚本在交付前删除，固定 synthetic 向量属于交付源码。
