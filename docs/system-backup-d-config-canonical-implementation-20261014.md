# D：A canonical 写入评审接收与实现增量

【2026-10-15 r29 实际私有回填服务探针已备好】已对齐正式 TIMESTAMP(0) 审计精度，并以恢复旧表达式的三个精确反例证明回归有效；新独立 root 直接调用私有 apply/observe，覆盖七组真实 SQL 场景及完整 installation_state 不变性。[最终本地回执](evidence/system-backup-d-canonical-backfill-service-local-20261015-r29.json)接收安全包 219 / 1,445、三种 seed 共 3 / 21、实际胶囊和 Linux 编译，正常 exit 0，1,258 输入及文件集合当前匹配，68 路径删除，无依赖安装。r28 漏声明编译失败已保留并修正；一次已知 Windows 工具崩溃仅重试同命令。已接收的存储远测不重复，新服务使用 [BackfillServiceOnly 完整命令](system-backup-d-config-maintenance-receipt-review-20261015.md)。真实服务 MySQL、运行授权/旧原文、正式迁移及生产接线仍待完成。


【2026-10-15 维护收据真实 MySQL 已接收】[限定验收回执](evidence/system-backup-d-maintenance-receipt-mysql-accepted-20261015.json)核对 15:25:47 run 的 1,254 文件冻结清单：七组存储场景与九项约束检查、实际配置行锁等待、94 个正式 migration 全部通过。namespace 精确 UID、七个 owned fixture 及两端 scratch/cache 报告清理，日志内本地临时路径独立确认不存在。该回执只覆盖当轮 frozen storage/test-only caller；当前 SQL 组件新增负观察/最终复查的时钟下界，新摘要已单列，不能据旧 run 接收该增量或完整私有服务。旧 storage 专项无需重复，实际服务使用下文 -BackfillServiceOnly 的独立入口；production_approval=no。


【2026-10-15 r27 维护收据 MySQL 探针已备好】[独立收据远测入口与完整命令](system-backup-d-config-maintenance-receipt-review-20261015.md)已覆盖七个实际 SQL 场景，单独选择 -MaintenanceReceiptsOnly，不重复旧 writer/index 远测。[本地冻结回执](evidence/system-backup-d-maintenance-receipt-probe-local-20261015-r27.json)接收安全包 207 / 1,395、三种 seed 共 3 / 21、实际胶囊独立验证与 Linux 探针/迁移 runner 编译，native exit 0、无重试；1,251 输入终态及当前匹配，68 个生成路径确认删除。A 的原始审计时间绑定修复和回归已纳入冻结版本；真实 082 MySQL、实际来源/运行授权、正式 migration 和生产接线仍待验收，production_approval=no。


【2026-10-15 writer 真实 MySQL 已接收】[本轮验收回执](evidence/system-backup-d-config-writer-mysql-accepted-20261015.json)核对 14:28:59 的完整日志与 1,243 文件冻结清单：8 项 writer 与 A 的 6 项安全子用例全部 PASS，94 个正式 migration 精确重放通过。writer 二进制 `70492dc3…3570`、输入 `8d60cc48…cd2f` 与本轮 marker 一致；namespace 精确 UID、远端 scratch、本地缓存报告清理，68 个日志内本地临时路径独立确认不存在。首轮 1364 失败证据保留，本轮关闭其 writer 重跑待办，不重复旧远测。当前四份 backfill 输入已变更，此回执只接收当轮冻结 writer 候选；readiness/capacity 仍为 synthetic，production_approval=no，不能关闭旧原文/运行授权、实际回填、正式 081/082 或生产接线门禁。


【2026-10-15 r26 维护收据存储增量】[私有 SQL 存储候选](system-backup-d-config-maintenance-receipt-review-20261015.md)已补暂存/原样重载、永久 key、27 列及双审计锚点、完整配置行和最终 target/UTC 复查；[冻结本地回执](evidence/system-backup-d-maintenance-receipt-local-20261015-r26.json)为 229 / 1,521 PASS，其中新增收据 9 / 86 已计入，1,246 输入终态及当前匹配，94 个生成路径确认删除，无依赖安装或 SSH。这是后续维护事务的存储组件；完整授权/来源/容量/commit 编排与真实 082 MySQL 尚未完成，运行 grant 和旧原文仍暂无。已接收的 writer 远测不覆盖本次新增文件。

> 2026-10-15 最新 r25：writer 首次真实 MySQL 在共享 fixture 的 installation-state 插入阶段因漏填两个无默认值字段报 1364，未进入 HTTP writer。已修夹具并为正式 065 必填列增加普通/独立 seed 检查；[r25 冻结回执](evidence/system-backup-d-config-writer-fixture-fix-local-20261015-r25.json)接收 195 / 1,293 安全包、两种 seed、两项守卫反例、独立 Node 4 项及 Linux 编译，1,243 输入终态一致、69 个输出路径删除，无依赖安装。新[事务内旧行扫描](system-backup-d-config-backfill-locked-row-20261015.md)按完整 138 列、准确 unsigned ID/nullable 元数据和最终 target/UTC 核对，并采用 A 修订 2 与正式 066 的 UTF-8 **字节** CHECK；旧字符预算/空非 NULL 原因假设已撤回。真实 writer 仍待[新 run](system-backup-d-config-writer-mysql-candidate-20261015.md)，完整维护事务、来源/运行授权、正式迁移和生产接线仍未完成。

> 2026-10-15 r21 writer MySQL 专项准备：已补[八项隔离 SQL 探针与执行入口](system-backup-d-config-writer-mysql-candidate-20261015.md)，覆盖实际配置变更、rollback 追加及历史不可改、原始收据、故障回滚/nonce FK、并发幂等/CAS、丢失提交回复后的只读观察、撤销及损坏收据。真实 MySQL 尚未执行；[本地冻结回执](evidence/system-backup-d-config-writer-probe-local-20261015-r21.json)为安全包 184 / 1,094、两次各 1 / 7 的 seed、Linux 探针及 migration runner 编译通过，exit 0，全部 1,235 输入终态无漂移，69 个生成路径已删除，无依赖安装。正式 066 不变，081 仍为独立隔离候选，合成资源/容量等材料不授予生产写入或历史回填权限。

> 2026-10-15 公开响应纠正：既有 OpenAPI 的 update/rollback 200 为完整 Operation。r8–r16 的 ConfigResource/diagnostic 编排只保留为历史内部实验，不能作为公开 writer/HTTP 验收，也不应继续把 diagnostic 发布 owner 当作公开成功体的依赖。writer/收据/重放和未挂载的 HTTP 候选已切换到 A `a-config-operation-response.v1`，[r18 本地回执](evidence/system-backup-d-config-operation-wire-local-20261015-r18.json)为 199 主测试/1,020 子测试及独立 Node 3 项通过，详见文末。原始旧配置、正式运行材料和真实 MySQL 门禁仍保留。

2026-10-14。已接收 [A 交接](system-backup-a-config-canonical-write-handoff-20261014.md)，合同 `a-config-canonical-write-security.v1` 的 SHA-256 为 `58b48404e34fea5d6c754ecf91297d70084417696dfd6397d2cee642858c0f1d`。接收时 13 项输入指纹均与当前仓库匹配；既有“暂无”材料审计保留原时间点，新交付补上 A 实现合同，运行授权与旧配置原文仍暂无。

## 已实现的业务输入边界

`DecodeConfigValues` 允许 enabled 的两个值，沿用完整 9 registry / 20 typed ref、数值/跨字段规则、严格大小写、重复/缺失/null/未知字段、Unicode 和 JCS 校验。immutable ConfigValues 与 BootstrapConfig 为不同类型，bootstrap 入口仍拒绝 enabled=true。完整展开列、hash/size 与 canonical 插入值来自同一个对象；此辅助函数不执行写事务。

`DecodeConfigMutationRequest` 接收严格 PUT 或 rollback 请求，保留 nullable reason、规范化合法整数/两位小数、拒绝正文 proof/session 等额外字段。固定的 A 摘要 profile 绑定 installation、actor type/id、endpoint/method 与正文，保留数组顺序；proof、key、request ID、session 不进入正文摘要。当前身份与权限必须由后续 writer 独立核对，不能以此解析结果代替授权。bootstrap 文件只增加共享 decoder 入口，禁用 bootstrap 的原有语义保持；实现源文件的新指纹由 D 本地回执记录，不改写 A 已签收输入指纹。

## 正式迁移提案

仓库当前编号止于 080。[081 提案](system-backup-d-config-canonical-081-proposal-20261014.sql) 单独增加 nullable canonical 字节列，保留 066 的准确字节，不填充旧行、不改 active pointer。081 是本次评审建议编号，须与安装 ledger 和其他分支核对后锁定；提案尚未进入 migration runner、inventory/catalog，未运行 MySQL。CHECK 只提供长度与 JSON 有效性约束，准确 JCS/hash/全部展开列仍由同事务 writer 校验。

迁移提升时须同时核对 schema fingerprint/catalog 和多部署矩阵，审查 runner 的 exclusion/capture gates，再接线新写入服务。不能以 A 安全合同签收直接标记 SQL 执行验收。

## 离线维护收据的独立设计

回填不借用 `config_update`。建议后续独立迁移（暂候选 082）创建 D 控制元数据维护收据，固定 action=`config_canonical_backfill`。它属于 schema-only 控制面，不能作为业务备份数据恢复；提升前需要补 ownership/inventory/catalog 评审。

| 范围 | 必须持久化/约束的内容 |
| --- | --- |
| 唯一作用域 | server UUID/database、installation、独立认证的 maintenance actor、固定 action、idempotency key 的组合唯一约束；另有准确 receipt ID。 |
| 请求身份 | A 合同 profile 下的 request hash、grant identity/version、source provenance digest、原 canonical hash/size、config version、locked row/materialized fingerprint、schema/catalog/migration pin、原因。只保存审核所需脱敏事实，不存完整 canonical/proof/凭据。 |
| 准确结果 | target version/hash/size、wrote=true/false、真实 audit intent/result ID、不可变 redacted response/status/hash/size。相同已有字节只能给 no-change；事务回滚不留成功收据。 |
| 完整性 | 目标 config installation/version 外键；两个真实 audit ID 外键；严格类型/大小/摘要/时间检查。唯一冲突在当前授权下观察已有收据，不盲重写。 |
| 保留 | 收据与幂等唯一防重复记录的保留方案先评审；不能通过删收据让旧 key 再次执行。仅 tombstone 的重放规则也必须明确。 |

事务顺序应沿冻结的 D 锁顺序：预先完成来源/外部解析 → tx 内核对 target/UTC/当前独立授权 → 幂等收据查找 → 锁定原 row 并重新验证所有原始字节和展开列 → 容量、真实 intent ID → 唯一 NULL→bytes 写入或准确 no-change → 维护收据与 result audit → final guard 检查撤销/截止/来源/目标 → caller-owned commit。已提交重放同样要求当前授权；unknown commit 通过独立同 target/key/hash 观察核对。

这部分目前是设计，尚无持久化表、backfill writer 或新 HTTP 入口。源原文和准确安装运行写授权未交付时继续拒绝真实回填。

## 验证与下一步

[本地验证入口](../scripts/system-backup-d-config-mutation-local-validation.ps1) 使用已有 Go 与只读 module，网络取依赖关闭，隔离 cache/tmp/telemetry，默认 vet；结束删除本次目录。验证包括 A 两项向量 parity、enabled/disabled、同源展开值、不可变拷贝、strict request、nullable/Unicode reason、数值规范化、作用域与数组顺序，以及 security 包既有回归。结果以 [原始输出](evidence/system-backup-d-config-mutation-local-20261014.txt) 和最终机器回执为准。

最终 [机器回执](evidence/system-backup-d-config-mutation-local-20261014.json)：security 包 91 个主测试、405 个子测试全部 PASS，其中新增 mutation 5 个主测试及 A 两项向量 parity 通过，默认 vet 开启，包运行 46.424 秒，最终退出 0，无工具崩溃重试。准确本轮 `.tmp-a-evidence-dd55691820a34ffd870de1d6ae4e3c6c`、cache/tmp/telemetry 已删除并独立确认不存在。没有安装依赖或执行远端/真实 MySQL；保留的 transcript/JSON 是验收证据，不是测试二进制或缓存。

后续仍需完成 update/rollback writer、A 当前 RBAC/MFA/nonce/audit 适配与最终 guard、持久化维护收据/离线 writer，以及 MySQL 并发、失败回滚、撤权和未知提交验收。这轮不代表上述事务链、生产服务或历史回填已完成。

## 2026-10-15 事务实现中的状态

候选 `ConfigMutationService.Mutate` 已实现两阶段编排：当前授权/收据和旧行原文核对 → 释放锁准备完整资源/响应 → 同一 repeatable-read 事务追加新版本、active pointer CAS、response evidence、operation、适用 nonce、intent/result 和最终复查。回滚读取准确历史版本并追加；不重置 first-enabled/监控历史。重放按原 audit intent 绑定的风险检查当前额外权限，返回完整旧响应；`ObserveCommitted` 只有读流程，不盲目重复写。全部边界要求显式可信适配，尚无生产 Authority/Resolver/Responses，未接 HTTP。

[首次测试](evidence/system-backup-d-config-transaction-local-20261015.txt)只有 `final-expiry` 负测失败：测试推进 1 小时小于默认 2 小时 deadline，未构成预期故障；其余回归通过。已将注入改为 24 小时，首次隔离目录 `.tmp-a-evidence-464da50b71d04cdea8dba16aa38b2879` 删除并独立确认。新 [复验输出](evidence/system-backup-d-config-transaction-local-20261015-r2.txt)尚待终态，不把本节写为完整通过。模型驱动只验证事务编排和失败回滚，不能证明真实 InnoDB 锁、约束、并发和生产适配。

后续 A 新增的 [合同负测复现](evidence/a-config-mutation-final-guard-repro-20261015.txt)确认另一组真实实现缺口：最终 authority/strong-auth 回调推进数据库时钟后，原代码仍可用旧时间提交或重放；最终 nonce 验证结果也未绑定已消费的 HMAC。7 个负测失败、2 个有效对照通过。A 于 08:40 修订提交时钟/session/proof-age 检查和 active/既有历史 nonce 绑定，新修订仍以对应验收证据为准，不能用此前 decoder 或旧事务回归覆盖。

本地配置验证入口现已同样冻结 backend/contracts/scripts 和所需固定 fixture，复制前后与测试后核对 SHA-256，禁用 workspace/Git 元数据与路径影响，结束删除源码快照和 cache/tmp。可显式归档新清单：

```powershell
& .\scripts\system-backup-d-config-mutation-local-validation.ps1 -BuildParallelism 1 `
  -SourceManifestPath '.\docs\evidence\<new-config-source-snapshot>.json'
```

清单必须是仓库 docs/evidence 内不存在的新文件；复制期间源码变化会在 Go 启动前拒绝。旧 r2 在工作区上运行且与 A 修订并发，保留其结果与范围，不把它标为冻结源码验收。后续冻结 gate 同时包含 A 的新增负测。

离线维护收据已形成 [082 SQL 与评审提案](system-backup-d-config-maintenance-receipt-review-20261015.md)：独立作用域唯一约束、config/audit 外键、准确结果和生命周期保留策略；仍未进入正式迁移或执行回填。

## 冻结 r3 接收与 RBAC 适配增量

[r3 回执](evidence/system-backup-d-config-transaction-local-20261015-r3.json)接收冻结摘要 `6c118a58af971e9dab5cfb50cabb07105db9f280833a2eecc5d72d3a339d5993`，共 1,153 个输入。security 包 101 主测试、440 子测试 PASS，默认 vet，包运行 19.346 秒，exit 0；包括 A 的回滚 fresh-proof 与新 nonce 版本兼容用例。原文 source manifest 和完整输出均绑定摘要，cache/tmp/telemetry 与源码快照两个拥有目录已删除并独立核对。此结论覆盖该冻结事务版本的本地模型回归，仍不证明真实 MySQL 并发或生产接线。

随后新增 `VerifyConfigMutationRBAC` 与 `PinnedConfigMutationAuthority`，按 A 现有 `system-backup-registration-rbac.draft.v1` profile 校验准确 registry 字节、installation/version/hash、绑定唯一性、角色闭集和当前 actor/subject。比较实际绑定内容，忽略纯数组重排和 registry 版本元数据变化；拒绝自授 security/destructive、同时改 subject 的自提权、删除最后一个 security_admin 或修改内置角色集合。保留其他 security_admin 的合法自降权可继续。

适配器固定 installation，构造时要求全部 session、registry、strong-auth、capacity、redaction 来源，无默认放行。它用当前 RBAC 检查权限，且发现实际风险比 resolver 报告更强时拒绝，而不是让有权限的调用者跳过 MFA/nonce。两份 registry 字节在后续来源回调前分别复制，避免复用缓冲区改变已固定输入。

这些是服务端 policy/边界接线代码，不是部署授权，也没有注册 HTTP。[r4 回执](evidence/system-backup-d-config-authority-local-20261015-r4.json)接收冻结摘要 `2c3435787797a18afce926051bdea98dde334bf5d662f4c8bad3d1acea21372c` 的 1,157 个输入：108 主测试、468 子测试，最终包运行 29.328 秒，默认 vet、exit 0。首次命令遇到 Windows `syscall` 的 `vet.exe 0xc0000043`，按现有规则使用同一冻结源码和本轮 cache 重试一次；统计只计最终成功轮，未把两轮重复用例相加。源码快照和 cache/tmp/telemetry 两个拥有目录均删除并独立确认。

## SQL 会话适配增量

新增 `SQLLoginSessions.CheckConfigMutationSession`，可直接赋给 `ConfigMutationAuthoritySources.CheckSession`。调用者必须先用独立的 access-token authenticator 得到 actor，传入自己拥有的同一事务；本方法不创建、刷新或提交会话。它固定 recorder 的 installation 和数据库身份，校验 user/subject/session digest、token iat/exp，然后锁当前 admin/password 与 credential-bound session，检查准确 installation/user 的撤销时间，最后重新读取数据库 UTC 时钟。SQL 错误只返回统一 unavailable。

数据库会话截止时间必须覆盖已认证 JWT 的截止时间；已缩短但当前尚未到期的数据库会话也拒绝配置写入，避免核心最后一次 token 时间检查跨越更短的 SQL 有效期。会话与撤销行锁保留到调用者事务结束；其他回调之后仍由事务主体执行最终时钟检查。此来源只验证当前身份，不授予配置权限或 MFA。

同时按 A 新增 RBAC 合同负测修正 subject 字节边界：当前 actor 和全部候选绑定均须合法 UTF-8 且不超过 executor 的 256 字节上限；不把无法由 executor 表示的 security_admin 计作最后一名可用管理员，256 字节合法边界继续允许。

[r5 回执](evidence/system-backup-d-config-session-local-20261015-r5.json)已接收上述会话实现、RBAC 边界修订及 A 新增用例：完整 security 包 113 主测试、506 子测试 PASS，默认 vet，运行 16.722 秒、exit 0，无工具崩溃重试。输入 1,160 项，摘要 `265c7e633afe5410737ccc1549df40bd3363d0eb50cfbead4d3e198c70eff449`；新会话文件、RBAC 实现/两份测试的 live 指纹均独立匹配冻结清单。准确 `.tmp-a-evidence-4d2c7549886d43fc9aefecab361354a8` 和 `.tmp-d-index-cache-3693215109ff4ebd9a0cb16793532199` 及其 cache/tmp/telemetry/源码副本均已删除，回执再次确认不存在。没有安装依赖或发起远端。

本轮是 SQL 会话来源的本地模型验收，实际 A 强认证材料、容量、脱敏、完整 Resolver/Responses 仍未装配，也没有生产 HTTP 或真实 MySQL 写入验收。分组远测由操作者继续执行，与本地增量分别接收。

## MFA／nonce 材料与容量适配增量

`ConfigMutationSecurityFiles` 固定 installation、数据库身份及部署拥有的 registry/nonce 绝对目录。其 `StrongAuth` 来源直接读取当前 ConfigValues 的准确 provider-proof/strong-auth registry hash/version，以现有 A Ed25519 JWS、issuer policy 和 key validity verifier 构造验证材料；拒绝和任意历史/已撤销 provider key 复用公钥、重复 issuer/key version、同 issuer 的有效 policy 不一致，以及无可用 signer。nonce 所需版本独立重读配置历史和仍在保留期的全局 ledger，再用现有 `RegistrationFiles.NonceKeys` 从准确 identity/version 路径读 32 字节材料；不以成功读到的子集替代完整历史集合。来源临时密钥副本用后擦除，返回独立副本，不记录正文或密钥。

`ConfigMutationCapacity` 接收部署提供的固定数据库身份、只读 collector report 绝对路径和已评审 large-smoke 的实测控制元数据占用量。缺少有效实测值不能用零替代。它按完整 canonical/响应及调用者已计入的 index/audit/nonce 开销预留，拒绝旧注册接口的 8 KiB 限额。准入要求新软预算严格覆盖已分配量、单调历史预留、本次写入量与 `max(64 MiB,ceil(capacity/20))` 安全余量，并至少达到 large-smoke 占用的两倍；物理可用空间严格覆盖新旧预算较高者及其余量和全部预留。

容量调高可以修复旧软预算耗尽，不强制新写入仍装入旧预算；调低须适合新预算，过渡期间物理准入仍使用较高预算。这是保守的转换策略：物理空间不足以覆盖旧较高预算时，即使调低后的预算可容纳，也会拒绝该次写入。新 report 不自动刷新/清空旧 reservation baseline，只在相同行锁中按准确 sample/reserved CAS 累加。

`Reserve` 现在返回必需的事务绑定 reservation，具有固定 `ValidUntil` 和无网络 I/O 的 `Recheck`。服务在全部最终 authority/nonce 检查之后，重核同一容量行、预留下限、预算和数据库身份/UTC，再在最后一次数据库时钟观测上纯比较已冻结的截止时间。采样以 5 秒为半开有效窗口；行锁等待或后续回调跨过截止时间都整笔回滚，不重采样后偷偷清零、不重复预留，也不在已提交收据重放中重新扣容量。

本轮新增文件和接口变化不属于 r5 的验收范围。[r6 回执](evidence/system-backup-d-config-materials-capacity-local-20261015-r6.json)已接收 1,166 项冻结输入，摘要 `6e4c65560152c60b6a3a3c658fbf9849c31cdcc6e621ee592e77f637b6ea092a`：最终成功轮 123 主测试、563 子测试 PASS，默认 vet，包运行 48.560 秒、exit 0。首轮测试断言通过，但 `math/bits` 的 Windows `vet.exe 0xc0000043` 使命令失败；按既有规则使用同一冻结源码/cache 重试一次，vet 保持开启，统计不重复相加。新材料/容量及改动的 authority/事务共九份源码 live 指纹均匹配冻结输入。

准确 `.tmp-a-evidence-bd8f8c8fcb204af887151258297135bf` 与 `.tmp-d-index-cache-2e1de3a9cfbe40a68af46294c6452045` 及 cache/tmp/telemetry/源码副本均已删除并独立确认不存在。材料测试使用真实 Ed25519 签名与临时输入文件，SQL 为模型驱动，并包含 A 新增的真实 authenticator→pinned authority→SQL session→mutation/replay 组合用例；不作为实际 InnoDB 验收。没有安装依赖、创建运行 registry/nonce/collector 或 large-smoke 实测值，没有装配生产 authority 或执行远端。现有 TOTP proof HTTP 流程仍只处理 provider registration；配置更新/回滚的 proof 签发与 HTTP 接线、脱敏、Resolver/完整响应和实际 MySQL 专项仍待后续实现。

## 完整配置 Resolver 编排与最终观察时效

`PinnedConfigMutationResolver` 已实现完整 current/proposed 准备编排。构造要求九类 registry validator、二十类 typed ref validator、一个 cross-resource validator、准确本地 registry 字节来源和独立 deployment-switch observation 全部存在；拒绝未知种类、多余表项、普通/typed nil，不在 owner 缺失时开始 provider 工作。它复制适配表，避免调用者后续增删替换已验证的来源。

Prepare 先固定两套 registry 全部准确 hash/version 字节，各次读取后立即复制，拒绝摘要不符、重复 JSON 字段和非法 Unicode。给 owner 的 opaque view 同时包含准确 current/proposed ConfigValues、全部 registry/ref 配对、已认证 actor 和固定 installation，字节 getter 返回副本；不接收 OfflineBootstrapGrant/read scope，也不把 enabled=true 强制改成 bootstrap 的 false。

Resolver 内建 RBAC 内容分类，不把纯版本/hash 或数组顺序变化直接判作 security change。这里仅解析内容并推导风险；当前权限、自提权、最后安全管理员等授权规则仍由同一事务中的 Authority 执行，避免把应返回 permission_denied 的情况提前折成 not_ready。其他 registry/ref 的真实能力、TLS/SSRF、环境解析、Secret allowlist、purpose 隔离、历史保留、灾难映射和跨资源语义由各 owner observation 证明，未以通用 JSON 有效或测试布尔值代替。

每个 observation 都必须提供固定风险、明确 ValidUntil 及无网络/不提交事务的 Recheck。Resolver 复查数据库身份、两套 registry 原文字节和全部 30 个 resource observation/deployment observation，最终再次核对风险、有效期与 switch 未被任何回调改动。`ConfigMutationReadiness.ValidUntil` 是全部资源与 deployment 的最早固定截止时间；writer 在响应准备前保存该值，在第二阶段复查前和最后一次数据库时钟观测上检查，拒绝后续 authority/provider 回调跨越有效期。有效期不允许在重查时悄悄延长。

新 [r7 回执](evidence/system-backup-d-config-resolver-local-20261015-r7.json)已接收 1,170 项冻结输入，摘要 `0743d76a5a2cad71afad0748058a3a2f8061bf66bf80f35e4f482b0f31770acf`：完整 security 包 135 主测试、651 子测试 PASS，默认 vet，运行 26.430 秒、exit 0，无工具崩溃重试。新增 Resolver 为 6 主测试/58 子测试，包括完整 current/proposed 编排与事务组合、缺失/未知来源、共享缓冲区隔离、风险/字节/switch/有效期漂移和最后回调越期。owner validator 与 SQL 为显式模型替身，不作为实际 provider 或 InnoDB 验收。四份 Resolver/事务改动源码 live 指纹均匹配冻结清单。

该快照也接收到 A 新增的配置 TOTP/proof 库和 HTTP 候选：6 主测试/30 子测试 PASS，覆盖 update/rollback 准确请求绑定、当前 SQL 会话和密码、TOTP step 一次消费、签名/最终时效失败、实际 JWT 与严格 HTTP 输入、超过旧正文上限及旧 provider/enrollment 兼容。五份相关 A 源码在 10:15 独立比对仍与 r7 匹配。上述计数已包含在 135/651 中，不另重复相加；这不是生产写授权或完整 writer HTTP 装配。

准确 `.tmp-a-evidence-a5d72dcfbf424745831ad5fc970f35dc` 与 `.tmp-d-index-cache-9da2323e0281472e98a7c772de99ae6f` 及全部 cache/tmp/telemetry/源码副本均已删除并独立确认不存在。没有安装依赖、发起远端、执行正式迁移或创建现场 owner 运行材料。

运行 owner 实现和部署材料仍须实际提供，生产构造不会自动补空。完整不可变响应存储、其余部署装配、正式迁移、真实并发/提交丢失和 canonical 原文回填继续保留原门禁。现有 external evidence 的内容 dispatcher 仅实现 capability_snapshot/job_log_chunk，不能把配置响应冒充这两类或截成 8 KiB；完整响应仍须正确的内容验证、加密存储及事务内注册/重放适配。

## 完整响应正文、加密和事务绑定增量

A 随后新增了 `ConfigMutationResponseContentPolicy` / `CanonicalConfigMutationResponse` 及 evidence `ConfigResponseContentPolicy` / `ConfigResponseRedactor`，以 diagnostic/application-json 的独立内容 profile 支持大响应，保留 live ContentAuthority 前后授权。D 复用该 profile，没有冒充 capability_snapshot 或 job_log_chunk。此前“dispatcher 尚无此内容 profile”的记录只描述 r7 前的状态。

writer 现在向 Responses.Prepare 传递独立的 `ConfigMutationResponsePreparation`，而不是只有一份 JSON 正文。它固定实际数据库、已认证 actor、current ConfigValues、proposed ConfigValues、准确新版本、脱敏 reason、创建时间和 deployment switch，通过 A canonical builder 生成完整正文，并校验 max(current/proposed control-retention)。payload 和 reason getter 返回副本，不能由 untrusted response JSON 自行提取/构造期望策略。公开构造函数是服务端数据构造器，不是运行写授权。

跨 security/evidence 的装配放在独立 `backend/internal/systembackupconfig`，保持依赖单向。`PrepareConfigMutationResponseContent` 从独立 writer 输入构造 system-owned diagnostic/internal 内容，绑定 CURRENT 的精确 evidence_store 与 evidence_kek identity/version。大正文的 Encrypt 必须提供 A 的 live ContentAuthority、准确 KEK 与 caller-owned staging；使用 A dispatcher 和 SBEV0001 framing，固定 producer/policy/authority deadline，拒绝其间撤权、变更或延长。它只准备密文，不做 provider PUT；失败时 caller 须丢弃部分密文。

inline 分支仅处理 <=8 KiB 的完整正文，在调用者事务内按准确字节/hash/size、retention 和有效窗口插入，返回真实 id，不提交。大正文 `BindPublished` 只绑定已经由合法 owner 发布并持久化为 ready/healthy 的原始对象：同时核对完整 evidence/typed-ref/不可变版本/KEK/envelope/object hash 与大小，以及唯一 chunk 的 frame/nonce/tag/hash。pending/write_unknown、错误 owner/provider role/保留期限或任何 metadata 漂移均拒绝；该方法不制造 ready/healthy、不重复 PUT。

`PreparePublishedConfigMutationResponse` 另要求明确的、无网络的 publication guard，不接受仅一份 Ref 或 JSON 成功标记。inline 与 published prepared 对象各自只可 Stage 一次，并绑定同一个调用者事务复查；`PreparedConfigMutationResponse.ValidUntil` 在 writer 的最后数据库时钟上再次检查，包含“最后 capacity 回调跨过响应有效期”的整笔回滚用例。

完整外部读取使用 A `VerifyDetachedEvidence` 与 `OpenRange`：按部署信任的历史 root/store/KEK、准确不可变版本验证整个对象与所有帧，完整解密后核对原始 ConfigResource 与创建 actor，最后再次 Stat；不从 current config 重建旧响应，不重新改写旧 reason。调用者仍须在 provider I/O 之后复查准确 SQL 收据与当前权限，才能返回 HTTP。该读取本身不是 SQL/provider/KEK 授权。

新 [r8 回执](evidence/system-backup-d-config-response-local-20261015-r8.json)已接收 1,188 项冻结输入，摘要 `5f1019203093972f5486de905da367f274d5c5394c39bfd5348e6bfe46126925`：完整 security、新 composition 包及 A 的 `TestConfigResponse*` 合计 152 主测试/744 子测试 PASS，默认 vet、exit 0，无重试。两个拥有目录及 cache/tmp/源码副本已删除并独立确认。新增测试使用合法最大版本字段形成 >8 KiB ConfigResource，无填充/截断；真实 AES-GCM KEK wrap 和 SBEV 往返，SQL/publication authority 为显式测试替身。

复查随后发现，原绑定只查询 chunk 0，不能据此证明数据库恰好只有一行。现改为在调用者事务中锁定完整 chunk 集合，核对第一行后要求没有第二行，并拒绝读取/关闭错误；新增 extra-chunk 拒绝用例。[r9 冻结回执](evidence/system-backup-d-config-response-local-20261015-r9.json)已接收该修正：1,188 项输入，摘要 `b161bab950fa7570fe62029b4d0595f5c63c4cf0f157a712aed2d1140078cd9c`，152 主测试/745 子测试 PASS，默认 vet、exit 0，无重试。security 141/689、composition 7/33、A 响应内容 4/23 已计入总数。13 份本轮改动源码指纹与冻结副本匹配；两个准确拥有目录及 cache/tmp/源码副本均已删除并独立确认。未安装依赖或运行远端/真实 MySQL。r8 保留为修正前的历史通过记录。

尚未完成完整 `ConfigMutationResponses` 运行装配：仍须实际合法 producer 的 durable pending/publication 协议、精确公共请求/幂等作用域绑定、历史 typed-provider/KEK 解析、SQL 收据/evidence 快照读取和最终重放授权；不能以直接 PUT、裸 Manifest/Ref 或测试 guard 代替。现有这些组件不会启动 provider 写、创建现场凭据、提升正式迁移或启用 writer HTTP。

## 成功收据的 SQL 重放增量

此前 Read 仅接收 installation/evidence-id/hash，无法携带准确 actor、公共操作或结果版本。现在改为独立 `ConfigMutationResponseReplayPreparation`，由 writer 完成当前授权和锁定收据查询后构造，固定数据库、installation、actor/session、operation、endpoint、idempotency key、request hash、响应 evidence-id/hash、结果版本和授权时效。构造器校验事实与边界，不签发读权限；禁止序列化该内部 preparation。

新 `SQLConfigMutationResponseReader` 在自己的事务内按准确幂等作用域锁定原操作和 evidence；完整保存 SQL NULL 形状、行版本、owner/type/classification、状态/健康、正文或所有外部元数据、完整 chunk 集合和原操作时间/行版本。inline 要求完整原字节/大小/摘要、零 chunk 和全部外部字段为 NULL；external 要求 ready/healthy、准确 immutable ref/KEK/envelope 和恰好一个 chunk。公共版本、创建 actor 和响应创建时间均从历史正文核对独立 SQL 事实；创建时间必须等于原操作 started_at，而不是取 current config 重建正文。

快照事务先回滚释放，再调用必需的 `ConfigMutationResponseReplayAuthority.Prepare`，解析部署保留的精确历史 evidence_store/KEK 和当前读权限。该接口必须返回无网络、只使用调用者事务的 live read/session/revocation guard。即使 inline 也没有匿名或默认许可；SQL Location 和 Manifest 都不是 grant。authority 看到的 chunk accessor 为副本。随后在新事务复查同一快照/读权限，释放锁后才允许 provider Stat/Range/解密。

Read 返回完整原始正文的副本和 `PreparedConfigMutationResponseRead`。writer 在最终 replay 事务再次检查准确收据和整个 evidence/chunk 快照，执行 read guard 后再检查当前 Authority，并在所有回调之后用新鲜数据库时钟检查固定 read deadline 与 JWT 有效期。拒绝最后回调期间越期、延长 grant 或撤销 configure；成功重放不写配置/新审计、不重新准备发布、不消耗新 proof/nonce。

[r10 历史回执](evidence/system-backup-d-config-replay-local-20261015-r10.json)接收第一版读取器及接口：156 主测试/774 子测试 PASS，默认 vet、exit 0、无重试，两个拥有目录均删除并独立确认。随后补充原操作 started_at/row_version 绑定、读取后的最终当前授权、provider 回调期间实际漂移用例。[r11 冻结回执](evidence/system-backup-d-config-replay-local-20261015-r11.json)接收最终候选：1,196 项输入，摘要 `3c4b7ff525cc9784fbf05c2433de14c05c7e1aa1fb5aebd5ac42bf9ee41095e4`，156 主测试/778 子测试 PASS，默认 vet、进程 exit 0，无重试。security 142/694、composition 10/61、A 响应内容 4/23 已计入总数。17 份本轮源码指纹与冻结清单匹配；两个准确拥有目录及 cache/tmp/源码副本已删除并独立确认。未安装依赖、未发起远端。本地范围仍是完整 security、composition 和 A 的 `TestConfigResponse*`；快照接收 A 新增的带标签 MySQL probe/脚本，不表示执行过它们。

SQL/read-authority 仍为明确测试替身，真实 AES-GCM/SBEV 验证不替代 InnoDB 并发/撤权验收。实际历史 provider/KEK 读适配和 live owner authority、完整 Responses 装配、合法 producer 的 durable publication 与准确公共请求/幂等作用域，以及部署/HTTP/迁移/原文回填仍待后续；没有发起外部写或自建现场授权。

## 当前读授权与历史 purpose 映射增量

`SQLConfigMutationReplayAuthorizer` 已复用实际 D SQL 会话、完整配置与 RBAC 实现。构造时固定 database/installation、匹配的 `SQLLoginSessions` 和绝对路径的只读 registry 目录。每次在调用者事务内按 installation/config/user/receipt 顺序锁定，校验 current canonical 与全部 materialized 列；实际检查 admin/password/session credential/撤销/SQL 会话期限，再从 current config 固定的版本/摘要读取文件 RBAC。先要求 configure，再按精确原收据和唯一 audit intent 的原始风险要求今天的 security_configure/destructive，不从响应正文、HTTP 标记或旧角色重建权限。最后再次读取数据库时间；不刷新会话、不消费 proof、不写审计或自行提交。

`PinnedConfigMutationResponseReplayAuthority` 将上述当前授权与部署明确提供的历史映射组合。映射按精确 `evidence_store` 与 `evidence_kek` identity/version 成对固定，另固定 root 和真实 owner authority；用途错误、重复 pair、缺失 owner/当前授权、typed nil 或不安全 root 拒绝构造。输入集合被复制，旧 pair 缺失时不查找 latest/current，不把 artifact/bootstrap/read 授权改作本用途。inline 仍须当前 SQL 授权，但不虚构外部 provider/KEK 来源。

外部 owner 必须真实准备并复查本条历史读/unwrap 授权，映射本身不是 grant。它返回的 root/store/KEK 要与部署项及原始不可变对象一致；固定 owner 有效期，拒绝期间替换或延长。执行 owner 回调前后各查当前 SQL 授权。只有复查成功才开放资源，失败立即撤销本地 admission，先前取得的 wrapper 也不能继续使用。

对外仅暴露单个 immutable ref 的 Stat/有界 Range，以及单个历史 evidence KEK 的 Unwrap；Wrap 永久拒绝。Unwrap 还按 A 的 envelope canonical profile 绑定 identity/key/wrapped-DEK 与原 SQL envelope hash，不能用同一 key 作其他对象的解密 oracle。打开的流继续检查原 context/admission/deadline；撤权、取消或错误后不返回已读字节或未清理的 DEK。底层真实 owner 仍须自行提供当前、精确范围的 provider/KMS ACL；这些 wrapper 不签发凭据。

[r12 历史回执](evidence/system-backup-d-config-replay-authority-local-20261015-r12.json)接收 1,200 项输入，摘要 `1db712fa128555007564291978a677916d0187f56b3f2dbe0b3101b4255f69f8`：163 主测试/825 子测试 PASS，默认 vet、exit 0，无重试，专用源码/构建目录均已删除并独立确认。新 security 测试组合真实 JWT、SQL 会话助手、canonical config 和临时文件 RBAC；覆盖当前角色/registry/provider 引用轮换、原始风险、密码/撤销/期限、配置/文件漂移和收据不匹配。composition 测试继续使用明确 SQL/current/owner 协议替身与真实 AES-GCM/SBEV，覆盖精确历史映射、无 fallback、独立 admission、只读/单对象/单 envelope、回调撤权和取消。

复查发现 Go 的 json.Unmarshal(null, *bool) 会保留 false，重复字段也可能覆盖旧值。现在原收据审计解析先拒绝重复 key/非法 Unicode，并要求两个原始风险字段是明确 true/false，不能把缺失/null 当作低风险；新增 null-security/null-destructive/duplicate-risk 用例。另增加 provider 回调内部取消时缓冲区/DEK 必须清零的实际测试，临时 RBAC 目录输出路径供终态后独立检查。[r13 冻结回执](evidence/system-backup-d-config-replay-authority-local-20261015-r13.json)已接收这些修正：1,202 项输入，摘要 `3456422229b9d2090df4a1a70054279a10b65a7237311b7f45543351ba671f1d`，164 主测试/830 子测试 PASS，默认 vet、进程 exit 0，无重试。security 145/723、composition 15/84、A 响应内容 4/23 已计入总数。21 份本轮源码 live 指纹匹配冻结清单；11:54 对全部 1,202 项输入的独立核对无漂移。两个专用源码/构建目录和 26 个 RBAC TempDir 均确认不存在。未安装依赖、发起远端或执行真实 MySQL；快照中的 A 新 MySQL probe 和回填边界测试不在本轮执行范围。r12 保留为后续修正前的历史通过记录。

候选已实现当前 SQL 授权和历史 purpose 选择/限制。部署实际映射材料与 owner 读/unwrap grant、完整 Responses 装配和合法 durable publication/公共幂等作用域、真实 MySQL/HTTP/生产激活、迁移及历史 canonical 原文仍待后续；本轮不创建现场材料、升级授权、安装依赖或发起远端。

## 完整 Responses 编排和发布绑定增量

writer 现在在首次 SQL 读快照之后、Responses.Prepare 之前调用 `BindRequest`，固定实际 endpoint/method、公开幂等 key、A request hash、request-id、operation-public-id、expected/current-row/installation-row/highest-version 以及 rollback source。输入必须与拟写入 ConfigValues/新版本一致，缺失、重绑或不合法 SQL 版本拒绝。绑定是不可序列化的服务端数据，不是 write grant；A 已评审的公开请求摘要没有改变。

最终候选的 `ScopeSHA256` 使用 `d-config-response-idempotency-slot.v1`，只标识 installation/admin actor/endpoint/method/key，不包含正文 hash；同 key 不同正文必须命中同一槽位，再比较独立 RequestHash。`AttemptSHA256` 另绑定 RequestHash、operation/request-id、session 的单向摘要及 token 时效、固定数据库、两套 config/hash/size、首次 SQL 行版本、结果版本、完整响应/hash/size 与保留/有效时间。原始 JWT、proof、未脱敏 reason 不写入该绑定。

`ConfigMutationResponses` 已实现 security 要求的 Prepare/Read 接口。构造要求固定 SQL replay reader 与明确 publication factory，不提供缺失源默认值；Read 只委托已完成的 SQL/当前授权/历史精确读取器。Prepare 拒绝未绑定事实。小正文直接在调用者事务内登记完整 inline evidence，不调用发布 factory；大正文要求真实 owner 提供准确 current evidence-store root、current evidence-KEK、live ConfigResponse 内容授权、专有密文 staging 和发布器。

大正文依次固定所有有效期和 producer/policy 身份，调用 A 的 diagnostic redactor/SBEV 加密，Seal 原始密文 staging，再独立完整读取并校验 object hash/size/EOF/Close。任何损坏、截短、关闭失败、取消或撤权均在交接前拒绝；交接前归 D 的 staging 用独立 cleanup context 清理。只有全部通过，才把**原始**密文及 staging 独占 custody 交给 publisher。publisher 必须在任何 PUT 之前持久化本次准确 pending/intent；进入 Publish 后，无论成功还是 unknown/error，保留/恢复/清理责任归 owner，D 不重新加密、重试 PUT 或删除可能仍被引用的原始对象。

发布返回的 plain Ref 不是成功授权。D 同时要求固定过期时间的 scoped publication guard，每次在调用者事务内检查完整 public slot/request/attempt、实际 provenance/retention/immutable ref；只接受准确 current store、预期 key 和可存储的 immutable version。原始 Prepared/manifest 由 D 保留，不接受发布器替换另一份密文。最终仍调用准确 ready/healthy evidence/chunk 绑定，且 writer 最后时间 guard 覆盖内容授权、factory 及 publication guard 的最早期限。测试使用实际临时文件 Sync 和真实 AES-GCM/SBEV 往返；SQL/publication owner 是明确替身，没有声称生产 crash durability。

已核对可复用的 C API：SystemPublication/producer binding 目前仅接受 capability_snapshot，不能重命名 diagnostic 来使用；通用 Evidence.Register/Publish 虽能处理大 diagnostic 的 pending/claim，但普通 SQL Save 不自动更新 observed_health，也需单独的发布审计/实际 owner 准入，不能以 PUT/Stat 成功替代这里的 ready/healthy 签收。实际 diagnostic publisher/provenance 与部署授权仍待 owner 接线，不能用本层接口或测试 factory 自签。

[r14 历史回执](evidence/system-backup-d-config-responses-local-20261015-r14.json)为 176 主测试/913 子测试 PASS；归档时发现 A 的共享注册 helper 后续改变了缺失 proof 的分类。[r15 历史回执](evidence/system-backup-d-config-responses-local-20261015-r15.json)接收该时点 181/934 PASS。两轮默认 vet、exit 0、无重试，均确认两个专用目录、26 个 RBAC TempDir 和 25 个密文 TempDir 删除。后续复查修正 publication slot 摘要不应包含 RequestHash 的细节，并新增同 key/不同正文的回归；r14/r15 不覆盖这一修正。

[r16 冻结回执](evidence/system-backup-d-config-responses-local-20261015-r16.json)接收最终编排候选：1,211 项输入，摘要 `4af32f8c16d1a2a7b3efad6102af96266812264afd4b002ec69a28d842eb5834`，182 主测试/934 子测试 PASS，默认 vet、进程 exit 0，无重试。security 158/798、composition 20/113、A 响应内容 4/23 已计入总数；当轮 A 的注册错误/缺失 proof 测试随 security 默认构建约束执行，没有重复相加。26 份 D 本轮源码匹配冻结清单，终态后对全部 1,211 项输入核对无漂移。两个专用源码/构建目录、26 个 RBAC TempDir、25 个密文 TempDir 均已独立确认不存在。没有安装依赖、运行远端或执行真实 MySQL。

当前已完成 D 侧完整响应编排候选和请求/尝试绑定；实际 diagnostic owner 的持久化准入、原始密文恢复、provenance/健康与审计，以及整个 writer 的真实 MySQL、HTTP、生产材料/迁移仍是未完成项。没有启用生产 writer、安装依赖、运行远端或更改 066。

## 公开 Operation 响应、收据和 HTTP 纠正

依据 [A Operation 编码交付](system-backup-a-config-operation-response-20261015.md)和现有 OpenAPI，原候选保存 ConfigResource 作为 PUT/rollback 成功体的做法与公开契约不符。现将公开 `ConfigMutationResponses` 接口改为只接收 `ConfigMutationOperationPreparation` 和最终 `ConfigOperationResponsePolicy`；旧 ConfigResource 辅助类已改名 `ConfigResourceDiagnosticResponses`，只满足独立 diagnostic 接口，类型上不能再接入公开 writer。旧冻结回执仅证明其当时覆盖的内部测试，不能关闭 A-CONFIG-WIRE-01。

锁外 preparation 现在只固定已认证 actor、installation、endpoint/key/A request hash、operation ID、current/proposed config 派生版本、创建/截止及保留预算，没有最终 response 字节。容量预留采用 A 已验证的完整 Operation 8 KiB 上界；大配置的完整 canonical 字节继续单独写入配置行。配置 INSERT 和 active CAS 后重新采样数据库 UTC，再由 A codec 生成完整终态 Operation，finished_at/updated_at 均采用该时刻，created/started/deadline/row_version/result-version 与同一 SQL INSERT 显式值一致，不依赖 updated_at 默认值猜测终态。

新 `SQLOperationResponses` 将准确原文/hash/size、真实 evidence ID 与终态操作、nonce、intent/result 审计放在同一调用者事务；响应只用 inline，没有 provider/KEK/外部发布阶段。SQL 最终复查逐项匹配完整 Operation、准确原字节、evidence schema/owner/type/状态/健康/保留时间/行版本，要求外部字段全为 SQL NULL 且不存在 chunk。重放仍先检查当前 SQL 会话/credential/password/revocation、current file RBAC 和原审计风险；读取原 Operation 后逐项匹配独立锁定 SQL 事实，再检查当前权限与最后时效，不查询当前配置来重建“原响应”。

`ConfigMutationHTTP` 是显式候选 transport，尚未注册生产路由。使用现有 access-JWT authenticator 与 `X-Strong-Auth-Proof` 表示解码；固定两个公开路径和方法、HTTPS、256 KiB 请求上限、单一 Idempotency-Key/Content-Type/proof 头，拒绝 query/编码/额外 body 字段等。缺失 proof 交由事务风险判断，已提交重放无需新 proof。成功必须是完整 canonical Operation，匹配 installation/actor/operation/endpoint/key/request-hash/版本后原样写出。错误闭集映射不会透出 adapter/SQL 原文；未知提交只做一次同 target/key/hash 的当前授权观察，绝不再次 Mutate。

[r17 失败回执](evidence/system-backup-d-config-operation-wire-local-20261015-r17.json)保留首轮两项失败：session-capped response deadline 抢先变成 generic unavailable，以及测试 SQL 单收据模型未区分 endpoint/key。A 并行补了最终会话优先分类和 response-buffer 隔离，D 保留并追加终态编码前会话检查、模型作用域修正。该轮失败未重试，准确拥有目录及 64 个输出的 fixture 目录均确认删除。新增大配置完整 SQL/有界 Operation、携带旧 proof 的真实 HTTP 重放和最终 SQL/权限漂移用例后，[r18 冻结回执](evidence/system-backup-d-config-operation-wire-local-20261015-r18.json)接收 1,223 项输入，摘要 `b5d03436985fd754f9d071eeaad5cdbcafb87f6a539155c47069ecf3884f98ac`：199 主测试/1,020 子测试 PASS，默认 vet、进程 exit 0，无工具崩溃重试。security 175/884、历史 diagnostic composition 20/113、A diagnostic 内容 4/23 已包含总数；不把后两包当作公开 Operation 接线。

31 份本轮 D 源码与冻结清单匹配，终态后对全部 1,223 项输入核对无漂移。两个专用源码/构建目录、17 个 Operation RBAC、26 个原 RBAC 和 25 个 diagnostic 测试目录（共 70）均已独立确认不存在。独立 Node OpenAPI/完整闭集字段/JCS/SHA 三项通过；首轮因 child-process spawn EPERM 未执行断言，保留[原记录](evidence/system-backup-d-config-operation-contract-local-20261015-r18.txt)，改用本机 Node `--test-isolation=none` 后[三项通过](evidence/system-backup-d-config-operation-contract-local-20261015-r18-r2.txt)，未安装依赖。

验收使用真实 TLS/HTTP、JWT、D SQL 适配/文件 RBAC/编码器；SQL 驱动与引用 readiness 仍是明确模型，不冒充真实 MySQL或实际 owner。该纠正没有扩大公开 schema、运行迁移、启用生产路由、创建历史原文/运行授权或安装依赖。公开 inline Operation 不以 diagnostic 发布接入为门禁；实际配置引用/部署来源、真实 writer MySQL 与生产材料仍待后续。
