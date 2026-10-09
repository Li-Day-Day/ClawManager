# A 外置 evidence 组件交付（2026-09-28）

2026-09-29 写入装配增量：[TaskRuntime](system-backup-a-evidence-task-runtime-20260929.md) 接准备、登记与发布，并增加任务不存在证明授权、事务内发布审计和失败信号。正式任务宿主、SQLPolicy/审计/Failure 与 C 的权威证明仍待交付。

2026-09-29 写入增量：[任务正文准备与短期 Transit 写入凭据](system-backup-a-evidence-task-prepare-20260929.md) 将实时任务/mTLS、正文校验及 encrypt-only 交换接成 TaskPreparer，并在同一配置事务核对 evidence_kek。任务宿主、真实角色/ACL、Registry/审计和暂存生命周期仍待完成。

2026-09-29 下载装配增量：[DownloadRuntime 与 Transit 短期凭据](system-backup-a-evidence-download-runtime-20260929.md) 将下载 Handler、SQL authority、S3 STS 和专用 JWT 解包接成可挂载入口。真实 SQLPolicy/TLS 宿主、provider 角色/ACL 与现场验证仍待完成，未挂生产路由。

2026-09-29 批次增量：[扫描与批次恢复](system-backup-a-evidence-recovery-batch-20260929.md) 接通有界候选与逐条只读确认，并在取得 claim 时强制复查重试时间；生产 worker 宿主、SQLPolicy、身份及真实并发验收仍待完成。

2026-09-29 观测增量：[只读恢复的健康与重试登记](system-backup-a-evidence-recovery-observation-20260929.md) 将健康、检查时间、重试时间与结果 CAS/审计原子提交；claim/授权保留旧观测。调度扫描与完整生命周期健康接线仍待完成。

2026-09-29 恢复增量：[到期写入的只读恢复](system-backup-a-evidence-write-recovery-20260929.md) 已增加独立身份、证据 claim、精确 Stat 与事务结果登记；普通 404/失败保留未知记录，未改 owner 终态。真实 worker、D policy、provider 凭据与现场验证仍待完成。

2026-09-29 GC 增量：[独立工作身份、操作租约与精确版本删除授权](system-backup-a-evidence-gc-authority-20260929.md) 已实现；清除 Ref/chunks 前新增保留与引用复查。未启用真实 GC，正式 owner/reference policy、worker 接线、provider 不存在证明及到期写入恢复仍待交付。

2026-09-29 会话增量：[登录、刷新与退出登记](system-backup-a-evidence-login-sessions-20260929.md) 将普通管理员登录接到下载所需的数据库会话，默认关闭；刷新检查并消费原会话，登录更新避免覆盖并发改密/禁用。完整服务构建受缺失依赖限制，不能将受限源码测试视为生产接线验收。

2026-09-29 下载授权增量：[SQLDownloadAuthority 与 DownloadKeys](system-backup-a-evidence-download-authority-20260929.md) 已新增会话/RBAC/claim 与 STS/解包共用检查，Handler 带认证 context 并在发送前再次鉴权；真实 SQLPolicy/运行装配和 MySQL/provider 验收仍待交付，不把组件测试扩展为生产准入。

2026-09-29 授权增量：新增 [SQLTaskAuthority 与 claim 传递](system-backup-a-evidence-task-authority-20260929.md)，接通任务日志 ContentAuthority 和 S3WebIdentityAuthority 的共用查询实现；生产装配、下载/GC/system producer 授权和真实 MySQL/provider 验收仍待完成。本文历史“无实现”及“本次未构建”指此前核对轮次，本轮结果以新文档为准。

本轮新增 `backend/internal/systembackupevidence`：外置证据加密 framing、登记与写入收敛、下载处理器、保留校验和有界 GC。操作者 run `sbk-mig-260928090803-518e` 的隔离真实 MySQL 验证已通过并由 A 限定范围接收，见 [接收记录](evidence/system-backup-a-external-evidence-sbk-mig-260928090803-518e.json)。当前仍是待正式接线组件：真实 provider/KMS、控制面权限/引用策略、HTTP 路由及定时扫描尚未接入，不能据此批准 capability 或配置激活。无需重跑本次成功套件；原有失败与成功记录均保留。

本 run 使用 MySQL 8.4.8，93 文件迁移（001..080）及 5/5 evidence 子用例通过，探针耗时 0.36 秒；本地 6 个主测试与 9 个下载子用例通过，wrapper 退出 0。A 核对 13 项组件/runner 和 93 项 migration 源码摘要，重算 probe DDL 摘要，与回传的 probe/migration 二进制及 catalog 摘要对应。测试库、namespace UID、远程 scratch 与本地 cache 均报告清理。原始输出中的 4 条 SSH pending-socket close 提示予以保留；后续执行与清理完成，不据此声称已经诊断其根因。A 没有独立连接远程复查。

## 实现与边界

2026-09-29 增量：已增加固定 endpoint/CA、明确 key version 和按操作实时解析凭据的 Transit HTTPS KEK 客户端，见 [适配器与验证边界](system-backup-a-evidence-transit-20260928.md)。生产凭据 resolver、独立 evidence key/ACL 和远程验收仍待完成；上述 MySQL 回传只覆盖当时的组件版本，不作为新适配器的验收证据。

同日继续增加 [S3 HTTP 适配器](system-backup-a-evidence-s3-20260929.md)：签名绑定写入 checksum/长度/截止时间、条件创建、精确版本读取/删除，以及有新鲜 challenge 的不存在证明接点。真实 STS resolver、C 的 proof verifier 和版本化 provider profile 仍待接线，旧静态身份 spike 与旧 MySQL 结果均不替代这些验收。

随后补上 [内容校验增量](system-backup-a-evidence-content-20260929.md)：核心执行 v12 type/owner 矩阵，`CapabilityRedactor` 严格校验已认证 probe 的 capability snapshot；未知字段、重复字段、身份/期限等不符时在 KEK 调用和 staging 写入前拒绝。它不覆盖其余类型的正文，其他 validator 与生产分派仍待完成。

| 部分 | 已实现 | 接线要求 |
| --- | --- | --- |
| Prepare | 仅接受大于 8 KiB、至多 1 GiB；先验证完整源，再加密并重验源 hash，拒绝两遍之间的内容漂移；每份随机 256-bit DEK、专用 evidence KEK、1 MiB AES-GCM 分块，最后块可短 | A 接真实独立 KEK adapter、按 evidence type 的完整 redaction/schema validator；源必须是任务专属加密 staging 的读取视图，不能传原始 Job stdout |
| 登记/发布 | pending 行和 chunks 同事务；固定 key 路径；登记提交后才能 exact-key conditional PUT；精确 Stat 收敛 write_unknown；DB 时间、30 秒 claim、row-version CAS、单次外部操作上下文 20 秒 | 真实 provider 必须验证 SHA-256/长度/到期和不可变版本；Store.Absent 只能接受权威证明，普通 404 不足；未知写入不允许无限重发 |
| 下载 | TLS、sev ID、classification 权限和 owner 可见性接点；精确版本读取；1 个标准 Range，正文至多 8 MiB；完整验证所有涉及块后再次鉴权再发送；敏感数据 intent/result 审计 | D 挂载路由并提供受信 session Authenticator；SQLPolicy.Authorize 必须同时检查实时会话、RBAC 和 owner 可见性；失败健康信号要持久化 |
| 保留 | `Retention.Check` 检查快照 evidence/artifact/control 跨字段限制；日志独立到期、单块最大 1 MiB、禁止 correctness 引用；GC 同事务检查 expires/protected/引用并排除活动 claim | D 的 Admit 必须调用保留检查并核对真实 config、容量和任务所有权；实际引用加入路径必须和 GC 使用同一锁顺序 |
| GC | 每批最多 100 个；intent+claim 提交后才删除；校验对象 hash/长度/version，精确删除并确认该版本权威不存在后写 deleted；未知结果保留 delete_failed 与全部 refs/chunks；事务内清理 chunks 并留下最小登记 | 只收敛 ready/deleting/delete_failed；pending/write_unknown/write_failed 留在登记中，由 reconcile/人工核验处理，绝不凭过期或普通 404 丢弃；D 提供有界候选扫描和指标 |

`public/internal` 在此实现中也加密，这是 v12 允许的较严格选项。此包不处理 inline evidence；provider-proof 既有 inline 登记路径保持原样。日志行数/redaction 验证仍属于 producer validator，不能用单块大小检查代替。GC 不删除最小登记、不自动清理历史 KEK/ref；control metadata 清理须另行证明截止时间与所有引用条件。

Publish 不更新 owner 成功状态；截止时间之后不再发 PUT，即使后续读到对象也不能由调用者恢复已终结 owner。确定失败对 owner 的 `evidence_incomplete/checksum_mismatch` 映射、报告/promotion health 和指标由 D 编排接入；本组件的 error/Failure 回调不能被忽略。

## framing 草案

这是供 A/C/D 复审的具体字节 profile，尚未冻结。对象为 `SBEV0001`（8 字节）+ header 长度（4 字节无符号大端）+ canonical JSON header + 顺序 frames。Header 上限 8192 字节，字段为 schema_version、identity、key、wrapped_dek_base64；identity 包含安装、evidence/owner、类型、媒体类型、classification、content checksum/size。header hash 为 envelope_hash。

每帧为 nonce（12 字节）+ AES-256-GCM ciphertext + tag（16 字节）。每份新 DEK 下 nonce 是随机 4 字节前缀加 8 字节大端块序号，单份内不重复。AAD 为 canonical JSON 的 schema_version、identity、envelope_hash、chunk_index、plaintext_offset、plaintext_length。ciphertext_sha256 覆盖整帧（包括 nonce/tag）；chunk_list_root 为按 chunk_index 排序的完整 Chunk 数组 canonical JSON 的 SHA-256。canonical 仅用于此包封闭的 ASCII 字段和整数，不能当作通用 JCS 实现。

content checksum 始终指明文，object checksum 覆盖对象全部字节。非完整 Range 依赖受信 provider Stat 的完整对象 SHA-256，并自行验证整个 chunk list/header 以及所有涉及帧；不能用 S3 ETag 冒充 SHA-256。不会返回外部 URI 或 redirect。响应设置 no-store/nosniff/安全 attachment，ETag 为明文 checksum。

## SQL 接线和迁移冲突

`SQLRegistry` 直接操作现有 evidence/chunks 表，强制指定 DB/server UUID/installation 和 `SQLPolicy`，缺失时关闭。每次事务校验服务器身份及 UTC，按 policy 锁 owner/config 后锁 evidence，再刷新 DB 时间，CAS 更新。不可修改已绑定的对象版本、manifest 或缩短保留。

SQLPolicy 是必须实现的控制面接点：

- LockScope：验证 installation/owner，按统一顺序锁 config、owner 与引用准入；禁止把调用者参数当作授权。
- Admit：验证 owner deadline、配置/历史 typed refs、staging 绑定、类型/classification、redaction 结果、容量；调用 Retention.Check。
- Authorize：实时 session/角色/owner 可见性，敏感下载发送前再查一次。
- Deletable：owner 已终结，artifact/import/promotion/retry/report/health/hold/read lease 等引用全部解除；日志不能挂 correctness 引用。
- Audit：同事务写有界脱敏审计；OwnerDeadline：读取真实 immutable owner deadline，不能延长。

现有 `065` 的 storage/ready_object CHECK 强制 deleted 保留 typed ref 和 chunks，与最小 GC 登记冲突。[SQL 提案](../contracts/system-backup/v12/a-evidence-gc-migration-proposal.sql)仅调整这两个约束；验证脚本只在随机命名的探针库中执行。没有修改 embedded migrations、catalog、controller hash 或冻结 schema。D 需要为它分配正式升级迁移，并同步 evidence schema 的 deleted 条件、inventory/catalog 和升级测试；在此之前，旧约束会拒绝 GC 的最终事务，不能把它视为删除完成。

## 验证入口

本地验收已通过：6 个 Go 顶层测试、9 个下载子用例，包耗时 1.760 秒；Linux/MySQL 探针与当前 migration runner 编译成功，runner 退出 0。Bash/PowerShell 语法及 Go 格式检查通过，隔离二进制/cache 已清理，未安装依赖、未执行远程测试。首轮因编译期间新增源文件造成 `undefined: Retention`，固定源码后的完整重跑通过；该失败记录保留在机器记录中。

操作者随后执行远程入口时，在本地阶段遇到 `net/http/internal/httpcommon` 的 `vet.exe: exit status 0xc0000043`。虽然 6 个主测试和 9 个下载子用例通过（1.494 秒），整个 Go 命令仍为 FAIL，wrapper 退出 1；本地 cache 已清理，尚未执行远程步骤。该次结果不能登记为远程通过。

2026-09-28 的验证入口修订使用 `system-backup-a-evidence-go-step.ps1`：保持原 `go test -count=1 -v` 和 vet 检查，仅对此精确 vet 进程退出码最多尝试 3 次，重试期间复用本轮隔离缓存。普通 vet 诊断、断言失败、panic 和其他进程错误不会自动重试；最终仍非零则终止，finally 清理照常执行。没有安装依赖、修改系统设置或添加跳过 vet 的开关。当时的 10 项策略/原生 stderr 测试已在当前 PowerShell 与 Windows PowerShell 5.1 通过；8 个 Go 文件与原验收摘要一致，因此当时未重复完整 Go 构建。见 [操作者失败与 runner 修订记录](evidence/system-backup-a-external-evidence-vet-retry-20260928.json)。旧验收记录的 runner 指纹保留为历史，不改写为新版本。

2026-09-29 的 Transit 本地验证又遇到 Linux 交叉编译时 `asm.exe: exit status 0xc0000043`。当前 runner 将同样的最多 3 次重试扩展到这一精确退出码和两个本地构建步骤；成功仍要求原命令最终退出 0，不重试任何远程操作。新增构建参数边界、恢复与连续失败测试后，共 14 项策略用例在当前 PowerShell 与 Windows PowerShell 5.1 通过；本轮完整 Go 测试/编译结果另见 Transit 增量记录。

后续内容校验运行观察到相同退出码的 `compile.exe` 失败，runner 再纳入该精确工具退出码；并以 run-owned off mode 取代无效的 `GOTELEMETRY` 环境设置，实际核验隔离目录。当前共 19 项 helper 用例，两种 PowerShell 均通过。版本变化和完整构建结果见内容校验增量记录；不回写旧 runner 指纹或旧测试计数。

本地验证（仅本机 TLS 模拟请求，无远程操作或依赖安装）：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& .\scripts\system-backup-a-evidence-validation.ps1 -BuildParallelism 1
```

脚本执行 Go 单元测试、交叉编译 Linux/MySQL 探针与当前 migration runner。GOPROXY/GOSUMDB 关闭、mod readonly；只使用已有依赖。临时目录 `.tmp-a-evidence-<随机ID>` 的编译产物/cache 会在 finally 校验路径后删除。不会清理其他任务的 `.tmp-*`。

以下保留完整复现命令，本次成功 run 无需重复执行。后续发生相关变更而需要远程验证时，仍按操作者要求暂停，不由 A 连接服务器。命令通过密码交互连接已有测试服务器，在新的 run-owned namespace/emptyDir MySQL 中运行当前迁移，再在随机探针数据库执行原始 065 evidence DDL 和 GC 提案。既有业务库不会导入提案，正式配置不会激活：

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
    $aEvidenceExit = 1
    try {
        & .\scripts\system-backup-a-evidence-validation.ps1 -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
        if (-not $?) { throw 'A external evidence validation failed' }
        $aEvidenceExit = 0
    } finally {
        "a_evidence_exit=$aEvidenceExit"
    }
}
```

已通过的远程 `TestAEvidenceMySQL` 5 个子用例覆盖登记/chunks 原子性与重复拒绝、发布/读取、保留及引用拦截、审计失败回滚、未知删除保留/确认后清理。Provider/KMS/owner policy 是明确标注的合成输入；它只证明本探针覆盖的真实 MySQL 持久化和约束行为，不证明完整生产引用图、真实 MinIO/OpenBao、生产 grant、本人 MFA 或已部署 HTTP 下载。

后续复测仍需回传完整脱敏输出与 `a_evidence_exit`。要求见到 `PASS a-evidence-mysql`、`CLEANED evidence run-owned database`、namespace/scratch 清理及本地 build-cache 清理。任一 `CLEANUP_PENDING` 或非零退出均不通过；保留对应 run/UID 进行定点恢复，不可删除共享 lab 或其他 namespace。

本地执行结果和当时源码摘要见 [本地验收记录](evidence/system-backup-a-external-evidence-local-20260928.json)；本次 [远程原始输出](evidence/system-backup-a-external-evidence-sbk-mig-260928090803-518e.txt)和 [接收记录](evidence/system-backup-a-external-evidence-sbk-mig-260928090803-518e.json)单独归档，不覆盖历史 run 或其指纹。

下一步：D 为 GC 约束提案分配正式迁移，同步 schema/inventory/catalog 并验证升级；A 继续接真实 evidence provider、独立 KEK 与 redaction，和 C 对齐精确版本/不存在证明；D 接 authoritative SQLPolicy、session/RBAC、HTTP 路由及 reconcile/GC 调度。完成这些接线后再做真实授权下的端到端验证。

## 生产接线核对与交接（2026-09-29）

当前组件可以进入接线阶段，但不是配置几个 endpoint 即可部署。源码核对发现，生产代码尚未在包外引用 `systembackupevidence`；`S3Credentials` 已补 [STS 交换组件](system-backup-a-evidence-sts-20260929.md)，但缺真实受信 authority/运行时接线；`TransitCredentials`、`S3AbsenceVerifier`、`SQLPolicy` 仍没有生产实现。现有 [RegistrationAPI](../backend/internal/systembackupsecurity/registration_api.go) 支持 provider 登记、观察和本人 MFA 接口，不包含 evidence 下载路径；[运行时装配](../backend/internal/systembackupsecurity/registration_runtime.go)也没有创建 evidence Service。此前登记 HTTP 的通过记录不覆盖这些缺项。

以下是按现有接口拆出的交付清单，不变更 v12 合同或替其他 owner 作批准：

| 接点 | 下一步负责人及交付 | 验收条件 |
| --- | --- | --- |
| 正式 GC 迁移 | D 为现有 SQL 提案分配升级迁移，同步 schema/inventory/catalog | 从旧库升级及空库迁移都通过；最终 tombstone 可清除 payload ref/chunks，未知删除继续保留 |
| `SQLPolicy` | D 实现锁顺序、真实 owner/config/ref 准入、session/RBAC、引用及保留、审计和 owner deadline | 真实引用阻止 GC；撤销或期限变化阻止下载/写入；审计失败回滚；不采用测试中的合成 policy |
| `S3Credentials.Resolve` | A 已实现 STS HTTPS 交换及受限 session policy；A/D 待交付真实 `S3WebIdentityAuthority` 与 OIDC/role 准入，受信 registry 将 Ref 关联到 owner、attempt、claim/session 和配置版本 | 每次 Resolve 交换前后检查授权和期限，准确绑定操作、对象版本、checksum/长度及 Range；实际服务端策略执行、撤销和 task scope 须现场验证；不得用静态 key 或测试 authority 替代 |
| `TransitCredentials.Resolve` | A 接独立 evidence KEK 的 wrap/unwrap 身份及不可变映射，交付当前和历史 ref 的路由 | 固定 context/版本、用途隔离、到期与撤销拒绝；轮换后旧 evidence 仍可按旧 ref 解包；不复用 capture key |
| `S3AbsenceVerifier.VerifyAbsent` | C 交付真实观察与证明，A 接 issuer 验证和 evidence 对象绑定 | 准确 key/version、challenge、安装/provider/位置与有效期一致；错误 issuer/版本/权限及普通 404 均拒绝；未发布 intent 的整 key 不存在语义明确 |
| producer 与正文 | A 已补 [日志脱敏及 capability/job-log 分派组件](system-backup-a-evidence-log-content-20260929.md)；A/D 待接真实 ContentAuthority，B/C 待交付正文合同、受信 producer 和样例，B/D 待接 observer/诊断持久化 | 错误正文在 KEK/持久化前拒绝；日志失败行丢弃并输出脱敏诊断；日志上限/保留与正确性证据分离；组件模拟不替代 producer 认证和索引事务 |
| HTTP 与后台任务 | D 装配 `Handler`、真实 Auth、Service.Failure 持久化、发布恢复和有界 GC 调度 | 实际 TLS 下载、Range、发送前撤销、审计失败、丢失 PUT/DELETE 响应、重启恢复均能端到端验证 |

有两个不能由现有配置推导的绑定需要在接线时落实：

- S3 grant 输入只有 Ref/操作等范围，不能把“能读这个 bucket”的身份当作 owner 授权。Resolver 必须从受信登记恢复并核验 owner/attempt/claim；前端参数不是授权来源。
- Transit resolver 输入只有 KeyRef/操作，没有 actor/evidence/attempt。其生产实现还需要绑定已经授权的调用范围；不能仅凭这两个输入向任意调用者签发解包身份。具体调用范围传递应与 D 的下载及任务上下文一起设计，当前接口本身不证明 task-scoped 授权已实现。

现有 [provider-proof 目标合同](../backend/internal/systembackupsecurity/providerproof.go)只登记 `external_action`、`backup_staging`、`restore_resource`。其中的存在证明及现有 S3 观察器不能直接认作外置 evidence 的不存在证明。C/D 需要明确采用受控 external action 关联 evidence 的映射，还是经合同评审扩展目标；在确定前，不能伪造 target 或忽略签名绑定来接通 GC。

建议交付顺序：D 先推进正式迁移及 SQLPolicy，A/C 同步完成凭据与证明接点；具备真实策略后装配 HTTP/调度，最后做隔离环境端到端验证。部署、管理员本人 MFA 和配置激活仍由 D 的流程负责，但它们不能替代 evidence 接线的验收。A 的日志及其他正文校验仍有独立工作，不以等待 D 为由宣称完成。

本次仅核对源码并补充交接说明，未运行新的构建或远程测试、未安装依赖、未生成测试产物，也未更新历史验收记录。后续需要远程验证时，仍先按操作者要求暂停并交付完整命令，不由 A 自动连接服务器。
