# A：C 执行/恢复复审与 task key、安全 provider 交接

日期：2026-10-29。复审基线为 `102928fffd5f704cdb336f54fba9119d0d29e84d`。范围为该基线及 A 增量的源码复审与本地接线；不是现场授权或整链验收。已取得用户回传的 OpenBao 2.6.2 版本与 Kubernetes 公开 JWT 信任材料；未取得正式工作凭据，未操作集群、签发现场 grant、安装依赖或启用备份。已有部署修改保留。

**最新状态：公共 C 的 `public-c-crypto.v1` 已交付，A 已完成原字节/pin 核对。以下早期“等待 C 提供合同”的记录由本节替代，不再作为缺项。** 本地 bundle 16 个文件 SHA 全匹配；A 实际执行 C 的 Node conformance 回归 85/85 通过、exit=0。其状态仍为 candidate，A 字节核对不代替 B/D 业务签收或真实 provider 准入。

## 公共 C 合同接收与授权计划增量

**在线实现最新增量：** 公共 C 已提交 `a7424ce1`。A 已新增在线 `systembackupkms` adapter、受控 provider permit resolver、Job 内调用构造和精确 policy 下发工具。后续已增加原控制通道的有界 `OriginalKeyAuthority` 和 `NewCaptureKeyJob` 构造；最终 writer/cmd 调用、真实 SQL/Pod 验收及正式现场凭据仍未完成，不能将下述早期离线计划或测试当作正式验收。接口、撤销边界、命令、材料与结果分列见 [在线 KEK 交接](system-backup-a-online-kek-20261029.md)。

原交付见 [C 合同](system-backup-c-crypto-contract-20261029.md) 和 `contracts/system-backup/v12/public-c-crypto-v1/bundle-manifest.json`。正式 external-kms capture 固定 `Generator.Generate`，恢复固定 `Unwrapper.Unwrap(expectedRequest,wrapped)`；Secret variants 才使用 AES-256-KW，并限 functional_test/same-cluster-copy。capture Job 不能注入 Unwrapper；不允许 GenerateDataKey 降级为本地随机+encrypt。

签名原字节固定为 JCS protected header 与 JCS unsigned payload 的无 padding base64url，用单个点连接；不追加 domain 前缀、不先 hash 后签。capture/acceptance/catalog 三个 typ 分别为 `clawmanager.system-backup.capture_certificate.v1`、`clawmanager.system-backup.acceptance.v1`、`clawmanager.system-backup.catalog_record.v1`。保留原 acceptance golden 兼容性。现场版本 1 与向量中的 provider 3/registry-r17 分开；向量不是现场映射。

新增 [A 离线 backup Transit 计划生成器](../scripts/system-backup-a-backup-transit-plan.mjs)：

- `backupTransitPlan(mapping,request)` 消费独立准入 mapping（installation、provider key name、完整 key binding）和 C 的原冻结 request。所有字段闭集；错安装/完整 key binding/provider variant/非规范数字版本拒绝。输出只含公开 metadata、请求 body 和分离 policy；不是在线 provider adapter 或授权签发器。
- context 精确为 `base64(UTF8(JCS(KeyContext + kek_binding_sha256)))`；digest 来自完整 `{provider,identity_hash,registry_version,provider_key_id,provider_version}`，不使用 framing AAD 的 hash 替代。两种字节格式分开。
- generate 仅 `transit/datakey/plaintext/<exact-key>` 的 update，要求准确 context、bits 字符串 `256`、key_version 规范数字字符串。unwrap 仅 `transit/decrypt/<exact-key>` 的 update，要求准确 context 与 `vault:v<exact-version>:*` 密文前缀；不会扩大到 sign/encrypt/keys/export/token 权限。
- `backupTransitUnwrapRequest(mapping,expected,wrapped)` 对比完整可信原 request，拒绝错误 algorithm/key/context/version，并限定现有 derived AES-256-GCM profile 的密文形状。只准备公开密文请求，不发网络、不返回 DEK、不授予历史读取权限。
- 独立旧版本 mapping 必须保留，恢复在当前独立 recovery authority 下按原版本实例化计划，不能改成当前写 key。TTL、当前撤销和原 grant 的前后复查由现有执行/恢复授权与待装配 provider resolver 负责，不能从 plan 的存在推导许可。

OpenBao 参数依据：[官方 v2.6.2 datakey 实现](https://raw.githubusercontent.com/openbao/openbao/v2.6.2/builtin/logical/transit/path_datakey.go)包含 key_version、context 与 bits，[官方 Transit API](https://openbao.org/docs/next/api/secret/transit/)说明 datakey/plaintext 与 decrypt 操作。用户回传现场版本为 OpenBao v2.6.2，精确 commit 见在线交接；正式签发前仍需要小范围验证字符串参数 ACL 与准确返回版本，不重跑全量资源盘点。当前签名 wire 同样使用字符串 key_version；不得混用 evidence wrap 的数字参数策略。

A 新定向回归 `node scripts/system-backup-a-backup-transit-plan.test.mjs` 为 18/18 通过、exit=0，覆盖准确 context、分离路径、跨安装/引用/版本/provider、非规范版本、历史 unwrap 换绑、密文版本/形状及路径注入。两项 Node 回归不生成临时产物；未运行向量重建脚本、未修改 C 的 16 个 pinned 文件。

在线 adapter、JWT resolver 和 Job 内 callback 构造已经实现；现在实际待办是原 Job 生产使用/撤销屏障、完整已准入 KeyBinding/KeyContext 和部署 link。policy/凭据仍未创建；不能把本次离线请求计划写成“正式 KEK 已接通”。这些是 A/D/B/C 实现与组合工作，不再要求操作者提供一份尚未创建的凭据。

## 复审及本轮接线

- 复用 [C 的部署构造](../backend/internal/systembackupexecution/deployment_service.go)：`NewDeploymentService` 要求 Linux、独立 recovery grant（仅 `recover`）、forward 三动作 `prepare/capture/issue_worker`；forward 不可用时只能关闭 forward 并继续独立 recovery。恢复权限不由失效的 forward 推导。
- 复用 [SQLRecoveryAuthority](../backend/internal/systembackupcontroller/execution_recovery.go) 的 gate→maintenance→installation→task 锁序、当前 lease/attempt/fence/config 和原恢复 grant；[Pending](../backend/internal/systembackupexecution/public_recovery.go) 从原 intent ledger 恢复，不以当前运行状态替代暂停前状态，不对不确定创建重新发起 create。
- 复用 [SQLExecutionRecords](../backend/internal/systembackupcontroller/sql_execution_records.go) 的加密日记：binding 包含原 task/attempt、installation/phase/kind、config SHA 与正文 digest；SQL 只保存 sealed payload 和 key ref，读按原 ref 解密并检查 digest、复查 authority，写在最终 guard 后唯一 commit。`LoadRecoveryPlan` 使用独立 recovery authority 与原 key ref，不借 forward 过期关闭历史恢复。不另建 `control.Vault`、私有 task 表或另一套执行授权。
- 复用 [WorkloadIdentity](../backend/internal/systembackupexecution/workload_identity.go) 的 mTLS + TokenReview 指定 audience + 当前 Pod/SA UID；随后由 `PublicJobOwner.Authorize` 核对 SPIFFE、原 invocation 字节、Job ledger、WorkerObserver 和当前 SQL guard。仅有证书、Bearer、同名 Pod 或自报 task 不足以授权。
- 本轮新增 `PinnedExecutionIdentity.DeriveTaskCaptureKey(ctx, authority, staging.Binding)`，接入 [worker acquire/complete](../backend/internal/systembackupexecution/public_jobs.go)。校验 backup/capture、原 task、规范十进制 attempt、deadline、完整 binding，调用原 HMAC 派生，保持已保存 staging 的派生字节兼容；每次仍重读同一签名 grant 和 pinned key。补充 issuer 入口的 nil context/tx 拒绝。
- `RecordKeys` 加密执行记录和 worker 身份私钥；`CaptureKeys` 只用于 functional staging；task DEK 不写入 invocation/plan/Git。二者不是正式 backup/evidence KEK，也不能赋予 provider unwrap。`DeriveCaptureKey` 原低层入口保留兼容，新 worker 调用走 typed 入口。
- 当前 [PublicCapture](../backend/internal/systembackupexecution/public_runtime.go) 仅支持 `functional_test`、单 `workspace`。此轮不取消这个门槛。最终 artifact/envelope、正式 KEK 和签名仍必须通过各原合同组合。

复审增量：functional `acquire/complete` 的 staging key 现在于原 Job 行 `FOR UPDATE` 仍持有的授权事务内派生，并在提交前再次复查原执行 authority；提交失败清零密钥，只有提交及 `ValidateCollectors` 通过后才向 `acquire` 返回拷贝。Revoke 更新同一 Job 行，故**准入顺序点**为该事务提交。已先准入的 worker 仍可能在 Revoke 返回前后运行，须由原 `StopJob/Stopped` 的 Pod 停止证明关闭；本改动不声称网络响应与撤销原子，也不替代 provider `key-begin/key-end` 使用协议。D/B 仍需给出真实 SQL 行锁竞争、worker 停止和最终交付回执。

## 给 D/B：执行与 worker 授权构造

1. 直接复用 `NewDeploymentService` → `NewPublicCapture` → `WorkloadIdentity{Next: worker.ControlHandler{Authorizer: owner}}`，不另建宽松 Authorizer。D 提供同一公共 DB 的任务/attempt/claim/fence 和 Job intent/cursor；B 提供准确 invocation、domain part、运行隔离与结果合同。
2. 提供两份**独立签名** grant 的受控绝对路径及原字节 SHA-256，签名公钥由独立部署文件固定。payload 使用 `ExecutionGrant`，envelope 使用 `payload_base64/signature_base64`，签名覆盖原 payload 字节，不重编码。forward 三动作、recovery 单动作；有效窗最多 24h。提供 controller owner、精确 `CURRENT_USER()`、DB/server UUID、installation/config version+SHA、profile SHA、deployment config SHA。
3. 提供 record 当前及历史 ref→32-byte 文件的受控挂载和 SHA；首项是写入版本，历史读必须命中原 envelope 保存的完整 ref，不回退首项。forward/recovery 都要覆盖实际所需历史 record keys。每个 grant 当前最多 8 个 record ref，超限必须先解决部署设计，不能静默裁剪历史。capture ref 单独授权，现实现要求恰好一个；轮换会影响旧 staging，不能用新 root 重新解旧内容。
4. worker issuer 提供证书 DER SHA、CA/私钥受控挂载、trust domain、期限；recovery-only 仍须固定 issuer 公开证书 SHA，不授予 `issue_worker`。提供当前 namespace UID、SA UID、Pod token audience、Job UID/generation、node UID、镜像 digest、卷 UID/content hash、控制端 HTTPS/CA。issuer、TLS、provider signer 是不同角色。
5. 每次 acquire 必须沿原 task/Job/撤销/fence 检查后获取 task key；capture worker 不获得恢复 unwrap 权限。最终正式 provider 调用应在 SQL 锁外准备，回到原事务复查 authority/版本/撤销并提交；不得在 guard 回调内做网络或另开事务。
6. D/B 回交可定位的源码提交/文件+符号、部署镜像 digest、配置及 grant 原字节 pins、测试命令/结果/覆盖范围。至少含：forward 失效仍可独立 recovery；recovery 不可签发 worker/派生 capture；跨 task/attempt/Pod/Job 拒绝；撤销前后及并发 revoke；原 Job 创建不确定后的恢复。未提供项标记 missing，不能用旧 receipt 当作当前现场通过。

## 给公共 C：签名、包装/解包和 provider 授权入口

| 用途 | 复用入口 | C/原部署 authority 必须补交 |
|---|---|---|
| capture/acceptance/catalog 签名 | `systembackupsecurity.NewCredentialTransitSigner`，`TransitSigningCredentials.ResolveSigning`，返回原 grant 的 `Recheck` | 三个独立 purpose：`capture_certificate`、`acceptance_record`、`catalog_record`；registry opaque version 与 provider 数字版本分别固定，key ID/name、公开 Ed25519 key、CA/endpoint、工作身份、ACL/有效期/撤销来源；B/D/C 各交准确 JCS/JWS payload/header/domain 正负向量 |
| evidence KEK wrap/unwrap | `systembackupevidence.NewTransitKeyring` / `NewTransitKeys` / `TransitCredentials.Resolve` | 完整 `KeyRef`→独立 derived AES-256-GCM provider key/name/精确数字版本、CA SHA、installation；按 `evidence_dek_wrap` / `evidence_dek_unwrap` 分权，固定 `EvidenceTransitContext`；原实时 credential resolver 及调用前后撤销检查 |
| backup KEK/task 最终 envelope | 现有 `systembackupbootstrapsecurity/reference.go` 的原 reference 合同；staging 不替代 finalizer | 明确 external KMS generate/unwrap 与 Secret wrap/unwrap 哪一变体、准确 final envelope wire/version/AAD、task/attempt/part 绑定、DEK 产生和清除、幂等与未知调用结果处理；提供可调用生产 adapter，不把 evidence keyring 改名复用 |
| provider 读写删/发现 | 各 bootstrap reference validator 的原 `Prepare` 与事务 `Recheck`；provider proof 仅作观察证据 | artifact/evidence/catalog 分别的 provider/root/scope、最小工作身份、credential immutable version、操作集合；exact object/version/checksum、conditional-create、删除 absence/unknown、snapshot/inventory 的原合同和真实 ACL 回执 |

签名入口已在调用前后 Recheck，固定原最短期限；它不签发 token、不定义 artifact framing、不认证 resolver 自身来源。evidence `TransitCredentials` 接口并没有 signer 式 Recheck 字段，不能给它虚构参数；复用 task/system/download 的授权包装路径，在各原流程里执行当前授权和事务复查。正式 backup adapter 合同未齐，当前没有可宣称已绑定的 production link。

公共 C 可直接消费的系统证据构造是 `NewSystemTransitPreparer(SystemPreparationAuthority, TransitJWTConfig)`，其 authority 必须返回原工作身份的当前权限；历史下载构造是 `NewDownloadTransit(*SQLDownloadAuthority, []DownloadTransitConfig)`，只允许 unwrap 并按完整 KeyRef 路由。这些构造不能接受 Admin 请求指定 endpoint、key path、token 或自填授权。独立原 authority、JWT 签发/撤销来源和受控 provider 映射属于现场必须交付项，不能以 resolver 总返回成功的测试函数替代。

### 给公共 C 的原字节确认单（历史记录，已由上方接收增量更新）

用户已说明本地无公共 C，先交文档。A 不把下列源码事实写成双方确认，不新增第四种签名格式。

1. 基线 `contracts/system-backup/v12/artifact-common.schema.json` 仍为 draft。它固定 EdDSA/Ed25519、三个 purpose，protected header 恰为 `{alg,key_version,kid,purpose,typ}`；`typ=domain_separator`。签名原字节为 ASCII `base64url_no_pad(UTF8(JCS(header))) + "." + base64url_no_pad(UTF8(JCS(unsigned_payload)))`，排除 signature 字段。
2. 基线 `systembackup/signature.go` 的输入则是 `domain + "\n" + JCS({protected,payload})`，purpose 为 artifact/acceptance/catalog；`systembackup/recovery/signature.go` 又有 `system-backup.v1`、manifest/acceptance_record/catalog_record 合同。不能只改 purpose 字符串后交给 v12 signer，也不能将三种验签器互作失败回退。
3. C 按每个用途提交：权威 schema 路径+提交、payload 闭集及 unsigned 原 JSON、protected header 原 JSON/JCS、domain 字面量、两段 base64url、最终 signing-input 文件与 SHA-256、期望 signature 与公钥、registry key ID/version、单独 provider 数字 version。测试私钥仅在临时测试目录生成并销毁，正式 private key/token 不随向量交付。
4. 必须有合法、改 payload 单字节、改 header/purpose/domain、跨安装、错 key/version、过期与撤销向量，并由 B capture / D acceptance / C catalog 各签收原业务正文。`CredentialTransitSigner` 只消费确认后的原字节及可信 binding，不能从请求自填的 purpose/key/version 选 signer。
5. 正式 backup KEK 同时交 final envelope/AAD 的原字节与 generate/wrap/unwrap 操作选择；在此之前只有现有 functional task staging key 接线，**真实最终 artifact DEK/KEK adapter 仍未完成装配**。evidence roundtrip 测试不能关闭 backup KEK 缺项。

## 版本、撤销与历史读取

- config/registry 版本、credential 版本和 provider 数字 key version 分列；禁止从 `v1` 等字符串推断 provider version、使用 latest/default，或同 ref 重绑定另一把 key。
- 新写只使用当前获准版本；历史读取按 envelope/record 固定的完整 ref+version 和 exact object version。历史 material 保留不等于历史调用者仍有权限：使用当前独立读/恢复授权，撤销、到期或未知权限均拒绝，不自动恢复旧 grant。
- 签名历史复用 `NewArtifactSigningKeyHistory` / `ValidateArtifactSigningRetention`；保留全部三用途公钥和 revoked 标记，撤销造成引用 degraded，不能删公钥或清除 revoked 来让历史通过。签名时间与当前撤销按消费方合同检查。
- evidence KEK 复用 `ValidateTransitKeyRetention`；nil 扫描为不可用，非 nil 空扫描才表示已知无引用。C/D 提供可信完整扫描，覆盖 retained、未完成和未知写入，并与新写/GC/配置变更共享锁序和最终复查。仅有 keyring 构造成功不能批准退休。
- record/capture 文件 grant 的撤销通过原文件移除/替换导致 pin 校验失败；缓存快照、`Close()` 和文档中的 revoked 声明不能替代共享撤销。不得删除仍有引用的历史密钥、nonce/签名映射或 tombstone。

## 部署配置样例及现场材料清单

现场状态补充：用户于 2026-10-29 明确确认“记录里没有就是没创建”。据此，新安装五把候选 key 已有历史创建记录，但新用途 policy、工作身份和凭据尚未创建；不再要求用户寻找这些不存在的引用。复用昨日观察以及本次 UID/RV 一致的公共盘点，不重复全量采集。旧 lab `d-kms-*` / `d-sign-*` 引用不替代新用途授权。

准备文件：[用途 policy 计划](../examples/backup-controller/purpose-policy-plan.example.json)。其中三签名 policy 固定独立 key path、update-only 与 provider version 字符串 `1`，匹配当前 signer wire；计划尚未下发。evidence wrap/unwrap 必须先由原注册 authority 给出完整 KeyRef，才能用现有 `EvidenceTransitContext` 得到准确 context，不能根据 provider key 名伪造 identity hash/version。backup KEK 的 generate/wrap 选择与 final envelope/AAD 由公共 C 明确。工作身份、JWT issuer/audience/subject/role、有效期与撤销源由 A/D 部署组合交付；这些缺项留给对应实现 owner，不要求操作者重复盘点。

凭据签发必须匹配现有 loader：evidence JWT adapter 仅接受单一准确 policy/role、无额外 identity policy、不可续租 batch token，lease 为 1..20 秒；不能创建 8 小时静态 token 冒充该入口的正式凭据。签名 resolver 仍需认证原字节与当前用途权限并提供原 grant Recheck。provider policy 限定路径和参数，不验证 payload 的业务用途，不能代替这层授权。下一步先完成上述映射与准确策略，再交给操作者执行受控创建；本次未对现场进行任何写入。

见 [无凭据环境样例](../examples/backup-controller/public-security.env.example) 和 [deployment JSON 模板](../examples/backup-controller/public-deployment.security.example.json)。两者引用现有 loader 字段，含故意不能通过校验的占位符，不能直接启用生产。容量与超时仅为样例，需按真实 profile 审定；writer/卷清单必须完整。`worker_security` 的 SA/卷字段大小写沿原 Go JSON 字段，不改名。生成的 invocation/identity 卷由 C 原 ledger 补入，不预填伪 UID。不要把额外 signer/provider 字段塞入闭集 JSON。正式 resolver 由受审 Go composition 构造，当前没有通用 JSON 自动授权入口。

部署构造示意（所有 `original*` 都是必须另行交付的可信输入，并非本仓库提供的变量或默认许可）：

```go
service, err := execution.NewDeploymentService(ctx, controlDB, kubeClient, dynamicClient,
    originalConfigPath, originalConfigSHA, originalForwardSHA, originalRecoverySHA, enabled)
// err 必须拒绝启动；不要用空 grant/fixture 兜底。
signer, err := security.NewCredentialTransitSigner(originalSigningBinding,
    originalPublicKey, originalCAPEM, originalLiveSigningCredentials)
// 三用途分别构造；上游负责准确 signing input，签名不等于 publication 授权。
keys, err := evidence.NewTransitKeyring(originalInstallation, originalHistoricalMappings,
    originalCurrentWriteKey, originalLiveEvidenceCredentials)
// 历史只读实例传 nil writeKey；不具备 wrap 权限。错误均终止装配。
```

各 owner 只交引用和脱敏回执，不交秘密正文：

| 必需材料 | 责任 | 当前缺项的引用要求 |
|---|---|---|
| 两 grant/信任锚/受审部署文件 | D/部署 owner，A 复审 | 绝对受控路径、独立 SHA、签发者、版本、有效期、撤销位置、DB 与配置绑定；文件内容走受控挂载 |
| worker 与 SQL 原身份 | D/B | namespace/SA/Pod/Job/node UID、证书公开指纹、实际 SQL account/server UUID、权限回执、代码/镜像 digest；不能只给资源名或标签 |
| record/task staging 历史 | D/B | ref/version、文件挂载、摘要、仍引用的 task/envelope 列表与可信扫描/并发保护；禁止贴 32-byte key |
| 两 KEK、三 signer 的正式映射 | 公共 C/部署 owner，A 复审 | purpose、installation、provider/root/scope、registry identity/version、provider key/version、公钥/CA、工作身份/ACL、撤销与历史保留证据 |
| finalizer/provider 原合同 | 公共 C；B capture、D acceptance | 源码位置/提交、schema 版本、逐字节向量、错误/unknown/retry 语义、授权 resolver 构造与当前 Recheck 来源 |
| 历史读取及退休 | C/D | 全引用扫描受控路径+SHA、覆盖范围/水位/锁协议、旧版本读取/撤销拒绝/并发写测试；扫描缺失不批准退休 |

现场候选只能引用 [10 月 28 日材料交接](system-backup-a-d-field-handoff-20261028.md) 与 [签名/KEK 依赖](system-backup-a-signing-kek-dependencies-20261028.md)，须重核身份、期限、原始回执。它们不能证明本轮正式 provider 已交付。本文是给 D/B 和公共 C 的执行清单。按用户后续授权，已向 D 聊天 `01a18571-e20b-79d0-9e0f-314c59c1a33f` 发送共享文件/接口协调消息；公共 C 按用户要求仅交文档，未代签收。

共享文件边界：A 对 `execution_identity.go` 只增加 typed task key 方法、issuer nil guard 与所需 imports；`public_jobs.go` 只改 acquire/complete 两处调用并移除原临时 JSON 变量。D 的 runtime/relay/停止证明修改不在 A 范围。后续生产 provider 接线须先与 D 确认 Authorize/最终交付区域归属，禁止覆盖整份文件。

凭据通过 Secret/受控文件/原 credential resolver 注入；Git 中仅保留模板与公开元数据。不得提交 token、DSN 密码、private key、DEK、Secret data、真实 .env 或生成后的 grant 材料。日志只保留阶段/错误码和脱敏引用。

## 本地验证与现场材料分开报告

本地 Windows/amd64、CGO=0、`GOTOOLCHAIN=local`、`GOWORK=off`、`GOPROXY/GOSUMDB=off`、`-mod=readonly -p=2`。执行两轮 `go test -count=1 -timeout=180s`（默认 vet）：

- 第一轮 regex：`Test(TaskCaptureKeyBindingAndRevocation|WorkloadIdentityRequiresCurrentAPIConfirmedPodAndSA|ForwardCaptureGrantCannotBorrowRecoveryAuthority|DeploymentConfigurationIsPinnedAndClosed)`；包 `systembackupcontroller`、`systembackupexecution` 均输出 `ok`。
- 用户追加拒绝矩阵要求后，补充 task key 与 signer 负例，再执行 regex：`Test(TaskCaptureKeyBindingAndRevocation|CredentialTransitSigner|TransitEvidence|TransitKeyring|TransitKeyRetention)`；包 `systembackupcontroller`、`systembackupsecurity`、`systembackupevidence` 均输出 `ok`。最终 task key 测试以第二轮为准。
- 覆盖合法派生与旧 staging bytes 兼容、跨 task/attempt/安装/config、非规范 attempt、到期/取消、grant 文件撤销、错误 root bytes/缺失 key version、recovery-only 不可 capture；signer 合法调用、错 purpose/安装/key ID/registry version/provider version、到期、调用前后撤销及原字节冻结；evidence 包装/解包 roundtrip、错操作/引用/provider version、拒绝凭据、TLS、轮换后历史读及只读 keyring。
- JSON 模板通过语法解析；占位符未作为有效部署运行。源码 diff whitespace 检查通过。未运行真实 MySQL、集群 worker、生产 provider 或初始化；未以这些测试证明并发 Job 撤销线性化、正式 backup KEK/finalizer 或整链可验收。

测试材料为临时生成的 Ed25519 key、固定 synthetic 32-byte root 和本地 httptest TLS provider，绝不是现场正式 KEK/token/签名身份。现场正式材料状态仍为上表缺项，公共 C 尚未签收原字节合同。验证期间共享 checkout 有 D 的其他改动，结果仅覆盖上述所选测试，不称整个 checkout 通过。

两轮最终进程均退出 0，均返回 `cleanup=True`；各自临时测试材料、Go build 临时文件、隔离编译缓存、telemetry 和测试二进制已由原 runner 清理，未安装依赖。第一轮目录 `.tmp-a-task-key-f87fb77792034794bf10b4a343dbe8c6`，第二轮目录 `.tmp-a-execution-security-20261029`，结束后独立 `Test-Path` 均为 False。期间 D 将共享 HEAD 推进到 `f2f78aefe03a963e88f324c0d1c6d627e99bef0c`，A 未 reset/rebase/覆盖共享文件；此处记录变动，不扩大本轮测试结论。
