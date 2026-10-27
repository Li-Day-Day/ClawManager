# A 系统 producer 安全适配设计草案

日期：2026-09-30。作者 A；交接对象 D、C，采用 Job 时包括 B。承接 [D R1](system-backup-d-producer-authority-revision-20260930.md) 与 [A 设计复审](system-backup-a-d-producer-authority-rereview-20260930.md)。本稿明确 A 的实现边界、调用顺序和验收责任，供 D 细化事务接口。它保留当时的设计与交接清单；最新实现、验收与剩余接点见 [A 当前步骤](system-backup-restore-a-role-steps.md)。本稿本身不是机器合同冻结或生产批准。

## 实现范围和接点

A 拟新增独立系统准备、发布和历史恢复入口，复用已存在的正文校验、分块加密及准确对象访问组件。系统授权不通过 task/attempt 或正数 config 占位模拟。下列名称是内部职责标签，不先发布 Go API 或 wire 字段。

| 接点 | 当前限制 | A 拟交付 |
| --- | --- | --- |
| `content_dispatch.go` | 前后比较完整 producer 摘要和 policy；已有 capability 正文校验 | 系统 ContentAuthority，以固定调用快照返回同一 policy，同时向 D 复查当前权威状态 |
| `task_prepare.go` | 固定 SQLTaskAuthority 与任务正文 | 独立系统 preparer；复用 Prepare 加密流程，绑定系统身份、正文及 encrypt-only KEK resolver |
| `s3_sts.go` | 既有用途闭集、正数 config 约束 | 独立系统授权分支与构造入口；只复用协议编码/响应校验，保留旧用途拒绝规则 |
| `lifecycle.go` | Publish 使用私有 task claim | 独立系统发布入口，消费已提交 pending 及服务端 publication claim |
| `sql.go` | PersistPending/WithLocked 在回调后直接 commit | 与 D 增加事务锁上下文、审计和必执行的最终 Guard；不采用可缺省的成功回调 |
| `write_recovery.go` | 依赖正数 config 和原配置匹配 | 独立系统历史读取/扫描/认领/收敛入口；使用原历史绑定和当前恢复授权 |
| `gc_registry.go` | LockScope 在 GC operation 之前 | 与 D 调整共享锁前缀；引用和保留检查读取已锁事实，防止反向取锁 |

系统分支缺少受信适配器时构造失败，不回退到任务授权、静态 S3 key、普通 404 或旧 producer 句柄。现有下载、任务、GC、恢复接口继续维持各自权限边界。

## 授权数据的边界

D 签发不透明句柄；A 只将它作为权威服务的内部引用。句柄、调用快照、锁上下文和 publication claim 不提供 JSON 解码入口，也不能通过普通 context 键或 HTTP body 创建。认证主体、签发者及部署输入须分别验证；候选配置摘要只证明输入绑定。

场景在 D 创建句柄时确定，并由 A 每次使用时复查：

| 场景 | 必须固定的授权依据 | 拒绝条件 |
| --- | --- | --- |
| 无配置 | DB UUID/库名、installation、部署授权域/epoch、候选配置及全部 registry/ref/policy 摘要 | 任意配置行出现、bootstrap 关闭域、部署撤销或依赖变化 |
| disabled | 当前 config version/hash、disabled 状态、专项授权域/epoch | 配置切换、启用、撤销；不得借用无配置授权 |
| enabled | 当前 config version/hash、enabled 状态、检查授权域/epoch | 禁用、配置切换、撤销；不得转成 disabled 授权 |

三个场景均绑定主体、不可复用授权代次、grant 版本、run、六类角色中的准确角色、用途及 provider/ref/version/scope。A 不在本稿选定字段编码；D 应以闭集判别联合和正反向向量交付，不以 config=0 作通配符。

一次 Prepare、Wrap 或 STS 调用由 D 的 BeginCall 生成固定快照。调用截止取租约、身份、部署、依赖、原观察期限和调用预算的最小值；登记后的写调用再受不可变 owner 写截止与 claim 截止限制。RecheckCall 读取最新状态，但返回并验证本次原快照，不能每次用当前时间重算截止而导致正常调用前后不一致。

续租增加 grant 版本，因此旧调用拒绝继续；新调用可使用新快照。已登记证据的 manifest、原密文、Wrap 结果、观察时间和 owner 写截止不随续租变化。接管产生新授权代次及独立 run/evidence；不把旧记录重新加密后冒充重试。

## 准备和发布顺序

1. **准备。** 认证真实工作主体，通过 BeginCall 取得系统正文快照；ContentDispatcher 验证 owner=system/installation、capability 正文闭集、角色、provider、run 和原观察期限。正文读取前后均复查，不接受调用者自行赋予的能力结论。
2. **Wrap 和暂存。** 专用 audience/role 交换短期 encrypt-only Transit 凭据。Wrap 前后及密文暂存结束均复查同一快照。只使用通道准入固定的 evidence KEK 引用；历史 Unwrap、签名、管理和其他角色不共用凭据。失败时不返回可用 Prepared；DEK 擦除，确定未登记的临时密文按 run 清理。
3. **pending 登记。** 调用者事务内由 D 锁 L0–L6，验证 manifest、不可变历史绑定和容量；A 在 L8 写 evidence/chunks，与历史绑定、容量、审计原子提交。登记失败才允许清理未登记暂存；提交不明时保留原密文并查原键，不能重新生成 evidence ID。
4. **发布认领。** 重新认证并认领已提交的 pending。只有 claim 事务确认提交后，A 才构造私有 publication 上下文。外部输入的 row version 或 claim 不能成为授权依据。
5. **外部操作。** 在事务外按准确对象交换 STS、核对条件写 profile，并在发送前复查。仅当既有发布协议要求的准确不存在证明由 C 验证通过时发送条件 PUT。已有准确匹配对象可进入结果收敛；404、失败或不确定提交不授权盲目重发。每次重试保留原 manifest/密文及写截止。
6. **存储结果。** 新事务复查域、身份、grant/claim、manifest 及准确对象证明；依次写 ready/unknown、审计、最终 Guard。撤权后不得由旧 producer 登记 ready；无法登记 unknown 时原 pending 仍由独立扫描覆盖。
7. **能力结果。** ready 只是存储事实。D 的 CommitResult 另锁目标代次、引用和 evidence，绑定完整幂等摘要、原观察时间和资格判断。C 评估 artifact/catalog/evidence，A 独立评估 KMS/Secret/signing；结果/引用/收据/审计原子提交。

密文暂存宿主尚未确定。选 Job 时由 B 给出 UID/generation、取消/接管及凭据投射失效接口；A 负责加密及授权检查，不能把 Prepare 的 writer 当作已交付的生产暂存生命周期。

## 最小远端权限与真实证明

| 身份 | 允许 | 必须拒绝 |
| --- | --- | --- |
| 系统发布 | 准确对象条件 PUT、协议所需准确 Stat | List、Range/正文读取、Delete、Unwrap、跨对象/安装/用途操作 |
| 系统 Wrap | 准确 evidence KEK 版本的 encrypt/wrap | decrypt/unwrap、旧版本写、签名和管理 |
| 独立系统恢复 | 原绑定对象 Stat 和当前恢复授权内的数据库收敛 | PUT、Range、Delete、Wrap、能力结果提交 |
| 历史收据读取 | 精确已提交收据和原时间 | producer 执行、刷新观察期、延长租约 |

C 须提交实际 provider profile：准确版本、条件写、权威不存在证明、截止执行和用途 ACL。共享 S3 Get 权限不证明 Stat 与 Range 已隔离；若远端无法满足限制，需经审阅的限制通道，否则阻断。STS 签发后的凭据不保证即时撤销；A/D 的提交拒绝不能冒充取消在途 PUT 的证明。

无配置的 store/KEK/STS/TLS/恢复身份与保留容量必须有独立信任依据。通道或信任根不能依赖本 run 正在证明的候选对象；缺少 C 的依据就拒绝，不自动降级 inline。

## 事务拥有者与最终 Guard

统一使用 D R1 的 L0–L10 顺序。A 不能只添加 SQLPolicy 实现而保留现有直接 commit：事务拥有者必须持有服务端锁上下文，在全部 callback、chunks、状态写入及结果审计之后执行 FinalGuard，再提交。没有完整 Guard 的适配器不得启用系统路径。

OwnerDeadline 只读取 L4 已锁历史绑定；Admit/Authorize/Deletable 不反向取得 grant、operation、引用或容量锁。GC 先锁 operation 再进入后层，系统恢复复用前缀上下文而不重新运行任意 LockScope。引用集合为空时同样锁对应键域；所有引用写入方共享顺序。

FinalGuard 取得新鲜数据库 UTC，检查授权域/配置、主体、grant 代次及版本、claim、各截止和本次容量报告的五秒新鲜度。只读取已锁事实，不执行网络、文件或新增审计。最后条件 CAS 必须精确符合预期；若该写入等待，返回后再检查 UTC，失败整笔回滚。保留死锁同键重试，不能声称锁序消除所有 InnoDB 等待。

commit 返回失败属于结果不明：新连接确认 DB 身份、重新认证并通过原幂等键的锁/唯一约束查回，不能凭快照未找到另开 run。commit 返回后期限已过，不返回可继续执行的句柄；独立历史读取仍可确认原提交事实。

## 历史恢复和清理

D 在 pending 事务保存准确 store/ref/version、原 KEK/write 版本、manifest/密文摘要和大小、run/授权代次、场景、原观察时间、不可变 owner 写截止及保留/恢复 profile。bootstrap、撤销和配置切换必须保留它们。

A 的新系统恢复扫描按 DB/installation、历史 profile 及有界游标取候选。每条重新授权并认领：数据库时间达到 owner 写截止、旧 evidence claim 已释放/过期、当前独立恢复身份有效。原配置是否仍 active 不是前提；当前协调锁与撤销检查仍必需。producer 撤销不能提前写截止。

Stat 返回匹配原 manifest 的准确对象，才可在最终 Guard 后收敛 evidence ready；404/网络失败保留未知并记录退避，摘要/大小/版本冲突登记完整性失败。恢复不得改变 capability/dependency 成功状态或原观察期，也不重新 Wrap/PUT。未知记录不能仅因保留到期被丢弃；GC 须另验写入终止、引用和保留事实。

## D 下一份接口交付所需内容

| D 交付 | A 验收重点 |
| --- | --- |
| 场景/句柄/固定快照/私有 claim 的 Go 类型及唯一摘要编码 | 不可由外部构造；身份、用途、代次、原 policy 完整绑定；时间精度明确 |
| LockAdmission、AdmitPending、FinalGuard 与事务锁上下文 | 同一 caller tx；前缀锁复用；所有提交路径强制 Guard；无反向锁 |
| ClaimPublication/FinishPublication 与提交不明收据 | claim 仅提交后生效；原密文重试；同键锁定查回 |
| LoadHistoricalBinding、扫描、ClaimRecovery/FinishRecovery | 无配置及配置切换后仍可按原引用 Stat；独立撤销；只收敛 evidence |
| CommitResult、ReadReceipt、引用/GC schema 与向量 | 目标 run CAS、资格、审计原子性、历史查询不续权、不重复收费 |
| schema、索引/FK、容量成本与迁移方案 | 锁序及保留依赖明确；不夹入旧的仅补 080 升级包 |

2026-10-09 状态更新：A 的准备、pending、发布、结果和历史原行只读适配已与 D 服务完成隔离测试，相关真实 MySQL 门禁按 [A 当前步骤](system-backup-restore-a-role-steps.md)限定范围接收。D 已有历史结果/命令收据只读接口；v12 所需的独立 `LoadHistoricalBinding`、`ClaimRecovery`、`FinishRecovery` 事务及最终 Guard 尚未落地，不能以收据读取或旧配置绑定恢复入口替代。A 还须创建绑定当前部署/身份/撤销/准确对象/Stat 用途及截止的独立 `HistoricalAuthority`，再在 D 授权事务内接入历史原行和 evidence-only 收敛；C 仍须交付对原 ref 的受限 Stat 证明与真实 provider profile。正式生产接线及 V01–V10 端到端验收继续保留。

## 验收映射

| 范围 | A 必须提供的证据 |
| --- | --- |
| V01/V02 | 三场景及六角色互换拒绝；假 config/attempt、候选通道自证、旧用途凭据拒绝 |
| V04/V05 | 正文/Wrap/STS/PUT/登记逐阶段撤销；正常续租使在途调用失效；容量/审计等待跨期整体回滚 |
| V06/V07 | 同键重放不刷新观察、不重复收费；结果/GC 引用竞争与审计失败原子性，由 D MySQL 验证共同支撑 |
| V08/V09 | PUT/commit 丢包、bootstrap 后迟到、配置切换、404 后出现；保留原字节与截止，仅历史恢复收敛 |
| V10 | 真实 STS/Transit/provider 权限、截止及撤销边界；Job 方案的身份/取消证据由 B 交付 |

本稿未执行 V01–V10，既有 25/25 和 15/15 MySQL 结果不覆盖新系统分支。当前迁移基线为合并后的 94 文件；旧 93 文件现场回执仍保留原范围。合同、schema 指纹及正式升级须按 D 后续交付重新评审。
