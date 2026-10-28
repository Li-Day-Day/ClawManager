# A：B PR 接公共链的可调用适配和部署输入

本文件是本轮唯一装配/输入清单，接续已完成的三材料 main 入口与 PR 映射审计。新增了真实可调用的 relay 证书/信任适配，以及直接消费 D 公共 Authority/JobBinding 的安全桥接。B WorkerGrant/正式 relay handler 及原公共 SQL 授权仍须由 B/D 装配；独立原 bootstrap authority、真实 C1 selections 和全部受控材料仍未接收，故没有伪填 production link，现场关闭仍为 0。默认缺 27 槽，真实三材料装配后的结构缺项仍为 24。

此前 PR 增量曾核到 `0a4bdc19`、公共 HEAD `d3c5715a`，记录见 `system-backup-a-b-pr1-security-delta-20261028.md`：九份原身份/凭据/签名输入字节未变，原审计继续复用。后续当前 PR `08d15abf` 的 publicadapter 等 110 份文件已由 D 导入，实际 main 已串起 NewLinuxProfile→NewPublicRunner→BindTaskRunner；不能再称 publicadapter 没有源码。限定原授权/恢复边界复核见 `evidence/a-d-public-runner-authority-review-20261028.json`。真实加密 WorkStore、原后台/恢复授权、Job intent/cursor 账本及原材料仍未齐，production link 仍未绑定。八项 gate 分类不自动新增豁免；现场前提继续复用 `system-backup-a-d-field-handoff-20261028.md`。

## 可调用的 relay 安全适配

### B RelayMessage 身份绑定增量

新增 `backend/internal/systembackupevidence/relay_message.go`，直接消费当前 B `publicadapter.RelayMessage`。先逐项比较消息的安装、task/type/attempt/phase、unit、namespace/name/UID/generation、relay ref/version 与 D 已授权锁定的原 Authority/Job，数字字符串必须精确匹配原规范十进制；错配消费本次 proof，不能修补字段后重用。绑定成功后深拷贝完整 typed 消息，最终复查检测 sequence/status/结果引用等任何变化，副本共享失败锁存；期限/同 context/同 tx/撤销边界沿原 DispatchRelayCheck。

该方法不校验或批准正式 wire/cursor/progress 语义。message 必须来自 B 闭合 decoder，原 raw bytes/hash 由 D 独立保留，不重编码、不从消息自报生成原 Job 事实。准确调用点是待实现的 D RelayAcceptor：

```go
proof, err := auth.AuthenticateRequest(request)
// 必须先从 proof.Context() 派生有界 ctx，再 BeginTx；保留原 HTTP 取消链。
check, facts, err := auth.BindDispatchMessage(ctx, tx, proof, checkedScope,
    lockedAuthority, lockedJob, decodedBMessage, dbNow)
// B 正式闭集、RelaySequence/RelayProgress + D cursor CAS/result/audit；
// 原 resource/revocation/claim/fence 授权在同事务，原 message/raw bytes/hash 不变。
facts, err = check.RecheckDispatchMessage(ctx, tx, checkedScope,
    currentAuthorityAgain, currentJobAgain, originalBMessage, finalDBNow)
// D 固定 SQL final guard + 单调最终 SQL 时钟严格早于 facts.ValidUntil，唯一 commit。
```

此片段省略错误处理，只描述接点，全部错误须 rollback。当前物理 observation 缺 namespace/name/认证 result 引用，必须先由 D 原 Job intent/ledger 提供，不接受 relay JSON 补成原事实。

本增量已收尾：`evidence/a-relay-message-validation-20261028.json` 记录真实 native exit=0、**2 根/20 条**通过、0 fail/skip，Linux 编译 exit=0/ELF 摘要（未执行 Linux 二进制），八份当前 A/消息/ABI 边界源码与 frozen input 一致，D 非实现者复核两份源码摘要也一致。原始终态为 `a-relay-message-native-123e09588521409191676ff54581f1b2.json`；首轮 `ab6b...` 因 snapshot 变化未启动测试，失败记录保留且两轮 owner 目录实际均不存在。cache/tmp/telemetry/source/二进制均已清理，未安装依赖、未重跑 Owners 十一项或旧 8/70。共享工作区另外三项 D 文件变化与路径集合变化在回执单列，不声称当前完整 checkout 回归。

只读复核脚本 `scripts/system-backup-a-relay-message-review.ps1` 已实际运行；D 独立源码复核记录是 `evidence/d-a-relay-message-source-review-20261028.json`，结论只覆盖该安全边界。D 可消费本节 API，仍不得把它变成 WorkerGrant、消息进度许可或结果证据认证。生产 Original/准确 selections/材料、完整恢复/Job intent/cursor/加密 plan WorkStore、三用途签名/两 KEK 与 C provider 接线仍按本清单由原 owner 交付，default 27 / 三材料结构 24 / 现场关闭 0 不变。

### 公共 dispatch ABI 接线增量

本轮新增 `backend/internal/systembackupevidence/relay_dispatch.go`，直接消费 D 当前 `systembackupdispatch.Authority/JobBinding`，不用调用方重新手写全部 relay 字段。`BindDispatch` 保留 Scope/config/task/attempt/phase、Job/cursor 映射；`RecheckDispatch` 在原 mTLS/同 context/同 tx 检查之外，对原 Authority/Job 全字段逐项复查，包含 claim owner/row-version、maintenance owner/fence、request ID、namespace/name 和 deadline。计数转换先拒绝 uint64→SQL BIGINT 溢出，ValidUntil 只能缩至原 task deadline，不能续期。错误在 guard 副本间共享锁存；无效首次映射会消费本次 proof，不得修补字段后重用。

准确生产调用点是 B/D 的公共 relay 接收/Job observation 事务（尚待正式 B wire 与 D handler 装配），不是 B 独立 WorkerAuthorizer/SQLStore。原独立信任准入仍先构造 `NewRelayPeerAuthenticator`；调用方在公共锁/授权完成后改为：

```go
check, facts, err := auth.BindDispatch(ctx, tx, proof, checkedDatabaseScope,
    lockedDispatchAuthority, lockedDispatchJob, dbNow)
// 同事务：正式 message/cursor CAS、审计、原 authority/revocation/fence 检查。
facts, err = check.RecheckDispatch(ctx, tx, checkedDatabaseScope,
    lockedDispatchAuthorityAgain, lockedDispatchJobAgain, finalDBNow)
// 原固定 SQL final guard / 时钟 / 唯一 commit。
```

Authority/Job 是 D 原记录观察，不是新的 grant；A 不调用无事务参数的 Ports.Check 来替代原锁内授权，不读取另一数据库。原 namespace/name 来自 D 真实 Job 账本，不能由消息正文提供。该桥接没有定义 relay enum/sequence，也未把任何原 authority、Job dispatch 或 HTTP 路由设为默认成功。适配代码不决定共享 API listener 的 TLS 策略：当前 API 必须实际协商并验证 client certificate 才能产生 proof，B/D 须按正式 relay transport 合同装配；不得在普通管理员 API 上盲目启用全局必需 client-cert，从而阻断 SQL login/查询/取消。

同轮修复 relay Context 检查的 typed-nil 拒绝，并把 wrong-EKU 负例改为匹配新 leaf pin 后单独验证 EKU 错误。旧 5/50 回执只覆盖原字节；新增 dispatch/Context/EKU 字节由本轮新的 `system-backup-a-relay-peer-validation.ps1` 精确冻结后补测，不借旧回执放行。

本轮终态见 `evidence/a-dispatch-relay-validation-20261028.json`：原生实际 exit=0，**8 根 / 70 条**测试通过，无 fail/skip。首次 Linux compile 启动编译器失败（exit=1），原日志保留；会话最终退出未保存，不补造。`system-backup-a-dispatch-relay-recovery.ps1` 在同一冻结输入上补编译，真实 exit=0/ELF（未执行 Linux 二进制），冻结输入与原 run pins 逐项一致、完整 source 后检通过。四份 A Go 源码当前 SHA 与被测字节一致；cache/tmp/telemetry/source/二进制已精确清理，owner 目录不存在。共享工作区其余变化单列在回执，不声称测试覆盖当前完整 checkout。未安装依赖，未重跑 Owners/旧安全 CLI，也未执行真实 SQL/初始化/配置启用。

准确复核脚本为 `scripts/system-backup-a-dispatch-relay-review.ps1`，只读日志、原冻结 pins 和当前 A 源码，生成终态摘要，不运行测试或授予权限。D 已收到 API 接线说明，正式 B/D handler 仍待装配；非实现者源码回执见下一段。签名/两 KEK 的独立增量沿 `system-backup-a-signing-kek-dependencies-20261028.md` 由专门 A 任务交付，不借本轮 relay 测试批准。

D 随后已逐行复核四份 relay Go 文件、测试和原回执，反馈没有发现阻止该 ABI 消费的新增源码问题。该非实现者复核已接收并记录在 `evidence/a-relay-dispatch-independent-review-20261028.json`，当前四份源码重新核对仍与原 8/70 被测字节一致，不重跑。由此关闭本适配的 source review 待办；正式 relay SQL/cursor 事务、原授权/撤销来源、部署材料和现场验收仍缺，不关闭 `status_relay` 或其他 bootstrap 槽。

实现：`backend/internal/systembackupevidence/relay_peer.go`，测试同目录 `relay_peer_test.go`。复用已有 `SystemPeerAuthenticator` 的精确 CA/certificate、client-auth EKU、原期限、本地/SQL 时钟核对。新入口要求 TLS 1.3（与 B `NewControlClient` 一致），从实际 DER 解析唯一且精确的 SPIFFE URI，不相信可变 Certificate.URIs、CN、转发头或 relay 自报。CA 只允许公开 CERTIFICATE 块和合法 CA，不接受夹带私钥/junk。

部署构造：

```go
auth, err := systembackupevidence.NewRelayPeerAuthenticator(
    systembackupevidence.RelayPeerConfig{
        Peer: originalAdmittedSystemPeerConfig, // Subject=原精确 SPIFFE；公开 CA、cert pin、issuer identity、原 expiry
        Binding: originalPublicJobBinding,     // 原配置/已准入公共 Job cursor 投影
    })
```

`RelayJobBinding` 只投影现有字段：Scope（DB UUID/database/installation）、config version/SHA、target type/public ID、attempt、phase/job-unit、Job UID/generation、relay ref/version/bound_at/expires_at。没有发明 claim/fence 字段或 B 消息 schema。构造成功只表明输入一致，不能证明构造者拥有原授权。

公共 relay handler 的实际接入顺序：

```go
proof, err := auth.AuthenticateRequest(request)
ctx, cancel := context.WithTimeout(proof.Context(), originalOperationBudget)
defer cancel()
tx, err := db.BeginTx(ctx, originalTxOptions)
defer tx.Rollback()
// B/D 原锁序：检查当前公共 installation/config/task/attempt/claim/fence、
// 真实工作身份/共享撤销，再读取锁定的 current Job cursor 和 SQL UTC(6)。
check, facts, err := auth.Bind(ctx, tx, proof, lockedCurrentBinding, dbNow)
// B/D：校验正式 B message schema，执行 sequence/body hash、progress/command CAS，
// 同事务 event/audit。facts 是观察 DATA，不能作为 WorkerGrant 或独立许可。
facts, err = check.Recheck(ctx, tx, lockedCurrentBindingAgain, freshDBNow)
// B/D：原 claim/fence/current revocation 最后复查、固定 SQL final guard、
// 原时钟必须严格早于 facts.ValidUntil；唯一 commit。
```

所有错误必须沿原 HTTP 脱敏 envelope 返回并 rollback；片段省略错误分支，仅说明调用点，不是可忽略错误的生产代码。Authenticate/Bind/Recheck 不发网络、不查询 SQL、不 Claim/Begin/Commit，`*sql.Tx` 只绑定本次唯一事务身份。调用方提供的 current 和 DB time 必须来自已锁公共事实，不能解析请求来填。

proof 必须使用自身 Context 的有界子 context；Bind 后 Recheck 必须是同一个 context/tx。proof 单次使用，副本共享使用状态；guard 副本共享失败锁存。原 tuple/版本/绑定期限变化、时钟回退/偏差、证书或绑定过期、请求结束、Close、跨事务/更换 context 都拒绝，不刷新原 deadline。Close 只是此实例的即时本地撤销，D/B 仍负责当前共享授权/撤销及真实 Job/凭据终止。该适配没有成为 bootstrap `status_relay` 完整 owner，也未挂 HTTP 路由。

## 实现交接、原授权来源和首责

| 项目 | 可复用组件 / 本轮可调用交付 | 原授权来源和下一准确输入 | 首责 |
|---|---|---|---|
| 工作身份 | B worker.ControlHandler/NewControlClient、WorkerAuthorizer、Job UID 核对/RevokeWorkers；A 新 RelayPeerAuthenticator/Check | 真实 CA/cert/issuer/version/SPIFFE 与公共安装/config/Job 的原受控映射；共享当前撤销。不可从 URI 名字推导权限 | A 信任/证书/期限；B/D 可信桥接 |
| 公共任务桥接 | D SQLTaskClaimStore.AcquireWithReceipt；B ProfileDriver/Execution/worker/kube | task/attempt/claim/fence→WorkerGrant/Job/cursor 的原事务适配和正式 relay 消息/sequence。B SQLStore/cm_backup_control 不启用 | B/D；A 复核身份边界 |
| 三用途签名 | A TransitSigner、ArtifactSigningKeyHistory、ValidateArtifactSigningRetention、原 acceptance candidate 验签 | 见下表，B/C/D 必须先签收唯一 wire/payload/domain；原 signer 调用 ACL/身份/版本来自独立部署来源 | B capture，C catalog/payload，D acceptance 组合，A signer/trust |
| KEK | A evidence TransitKeys/TransitKeyring 和独立 wrap/unwrap live resolver；B staging 只消费任务 DEK | backup/evidence 各自原 variant/provider/key/version/操作 ACL/保留历史；B Vault/Wrapping maps 不是原来源 | A；B/C 数据/原 provider |
| artifact/evidence/catalog | 原 owner 的 provider verifier、A S3/STS/evidence runtime、C 精确 reader/finalizer | 独立根/provider/scope/三精确 evidence credential、CA/hostname/IP、catalog discovery 选择及能力/期限 | C provider/catalog；A evidence/凭据安全 |
| production link | 原 `main→runLinkedBootstrap→newBootstrapMaterialLink` 已完成，继续复用 | 独立 Original authority 的全阶段真实实现、准确 selections、三 typed bindings 和其余全部真实 owners/cross_resources | A/D composition；原资源 owner 提供授权/材料 |
| 公共登录/启用 | A SQLLoginSessions、ActionScope、ConfigMutation 原服务，D SQLApplication | 实际 RecordPair 的同一 sessions；当前 HTTPS/config/RBAC pins；AuthorizeAction→业务→RecheckAction→commit；启用新版本后重载 pins | D 装配；A 复核 |
| 后台 execution 授权 | D SQLExecutionAuthority / SQLBackupStartStore 和 ExecutionAuthorization 接点；A relay dispatch 守卫可叠加 | 时钟发现已修复；锁形状后补最后 40/98 模型回归/清理已接收，原 grant 矩阵未变，四项权限候选仍需正式审查和真实正反 grant 验证；没有可扩大为 runner 工作授权的 A scope。精确边界见 `system-backup-a-execution-authorization-20261028.md`，缺 owner 仍拒绝注册 | A 授权/安全；D 公共事务；原部署/资源 owner 提供来源 |

## 签名兼容性必须固定的决定

`artifact-common.schema.json#/$defs/Signature` 已指定 EdDSA、JCS protected `{alg,key_version,kid,purpose,typ}` 和 JWS 输入 `protected_header + '.' + base64url(JCS(payload))`，同时明确 cross-owner review pending。本轮不改这些字节语义。

| 用途 | 现有依据 / 已知不兼容 | B/C/D 必须给出的决定 |
|---|---|---|
| capture_certificate | 公共 purpose 固定；B recovery 的 manifest purpose 和 slash-domain framing 是另一协议 | B 的 unsigned capture payload/完整 schema、canonicalization、准确 domain 与 key identity/version；manifest 不作别名 |
| acceptance_record | 公共 A draft domain=`clawmanager.system-backup.acceptance.v1`、VerifyAcceptanceCandidate；B 保护头/签名输入不同 | D/C/B 固定唯一 unsigned payload/JCS/保护头/domain/签名对象 checksum、有效时间与重复判等；不重新编码后保留旧签名 |
| catalog_record | 公共 purpose 固定；catalog 正文正式合同仍缺 | C 固定 registration/tombstone unsigned payload、完整 record/schema、JCS/domain/精确 key/version/调用范围和历史验签 |

三用途调用权限都必须由原资源来源认证，不能仅凭公钥存在或一次 Sign 成功。映射须明确 SecretRef 的不透明 identity_version 到 Transit 的规范正整数 version；不得剥前缀、用 latest、复用其他用途 key。A 的完整历史隔离/retention helper 保留旧被引用版本，不能从当前 active key 集合推断历史完整。

## 两个 KEK 的边界

- backup：既有 typed refs 区分 `data_key_generation/generate_data_key`、`kek_wrap`、`kek_unwrap`；KMS variant 与 Secret AES-256-KW functional-test profile 不得混为一项或升为生产。B/C 与 A 仍需给出本安装采用的生产操作组合和原 provider，不因 B 本地 key map 选择变体。
- evidence：现有 `envelope.go` 用 crypto/rand 生成 32-byte DEK，Transit adapter 使用 `evidence_dek_wrap/evidence_dek_unwrap`、精确 key/version 和安装/ref/version 绑定的 EvidenceTransitContext；不是远端 generate-data-key 授权。TaskPreparer 的 encrypt-only 身份不提供 unwrap；历史读取使用原 admission-validated keyring，无 latest/fallback。部署仍须证明真实 ACL、wrap/unwrap 工作身份和全部 retained evidence refs。
- 所有旧 key/ref 映射的扫描必须完整且经原来源认证；缺扫描不是空集合。保留 history 不自动许可新写，inactive/撤销/期限与当前原授权都要复核。

## 统一现场输入清单（D 组织，敏感值走原 mount/loader）

已有现场结果直接复用：`d-first-chain-field-20261028.log` 和 `d-first-chain-sql-pins-20261028.log`。D 反馈 SQL-pins exit=0/TEMP_CLEANED，数据库 clawmanager / UUID f1f5f76a-95f5-11f1-b08e-366835b4a029；**installation_state 查询无行**。SQL 观察身份 root@localhost 不能当独立运行/observer 身份。公共 env references/env_from 为空只表示本次公开观察，没有证明进程环境/任意文件不存在。

| 顺序 | 必需受控输入 | 当前状态 / 验证接点 |
|---|---|---|
| 1 | 原 installation ID、初始化用户、matrix、完整 config 和 grant 的原批准来源/原 not_before/expires/revocation | 尚无原 installation/config；不能拿旧 lab ID 补。D/操作者给原受控部署来源 |
| 2 | nine registry 的绝对受控目录/完整正文/schema/version/精确字节；六未决 registry 的 owner 决定 | 原三 registry 与候选包只作历史参考；其余正文/当前来源仍缺 |
| 3 | 全 20 用途的 immutable identity/version、provider/root/scope/purpose、工作身份/操作/期限与撤销 | owner 逐项提供；旧 27 槽矩阵继续有效，hash/receipt/approved 不能自证授权 |
| 4 | nonce exact descriptor/material 绝对路径、32 bytes、所有 retained identity/version/ProtectedUntil；两个 CA descriptor/公开 PEM/hostname/固定 IP/期限 | 当前受控位置未提供；原 `nonce.Binding`/`ca.Binding` 和真实材料 validators 校验，不输出 key bytes |
| 5 | relay CA/public cert pins、issuer identity/原信任版本、精确 SPIFFE、Job/cursor 原投影和绑定期限/撤销 | `NewRelayPeerAuthenticator→AuthenticateRequest→BindDispatch→RecheckDispatch`；A 公共 ABI 桥接已交付，B/D handler/原 SQL guard、正式消息及真实材料仍待装配 |
| 6 | 三用途 signing key/public key/provider numeric version/ACL/全历史；两 KEK 操作组合及 retained 引用 | 前两节列明合同/映射决定，原 owner 提供，A 适配 |
| 7 | artifact/evidence/catalog 独立凭据 refs、root/trust/能力和 catalog snapshot_list 或 inventory_read 选择 | C/原 provider 验证；不从普通 List 或连通成功推导完整发现/写删权限 |
| 8 | API HTTPS 信任、真实 SQL login/session、当前 pins；独立 DSN 受控文件、最小 grants、容量和运行卷 | D 原现场预检/SQL-pins与 runtime inspector；现有应用 TLS mount 不能自动成为 backup trust；容量 PVC 存在不等于已挂载/有余量 |
| 9 | production Go link 的全 owners + Original + selections + 三 bindings | 所有来源和 owner 都齐后，沿原真实入口 `--requirements`→`--check`→`--apply`（只创建 disabled v1）；缺项不执行 Apply |
| 10 | 配置启用 PUT 的真实风险/适用 MFA/原因、旧 refs 保留、新版本 pins 重载 | 沿原 ConfigMutationService/PinnedResolver/Authority；effective_enabled=env AND config，之后再由 D 组织真实公共链冒烟 |

本地新代码的可执行验证入口是 `pwsh -NoProfile -File scripts/system-backup-a-relay-peer-validation.ps1`；本轮已跑的原生日志不要求操作者复跑。现场发现继续由 D 统一给命令/接收回执，A 不再次 SSH、更换身份或创建账号。上述第 9 步在缺第 1–8 项时不存在可安全复制执行的完整 Apply 命令。

## 本轮验证和交付边界

新增五组 relay 测试的原始日志为 `evidence/a-relay-peer-native-e1659ffde3e4406a81979396272bcf16.native.jsonl`，有完整 package pass 与 run/pass；真实 loopback TLS、SQL transaction identity 使用合成对象，不证明真实 SQL/provider/部署。验证会话中断后原 terminal/进程退出码未保存；不补造原 exit=0。`scripts/system-backup-a-relay-peer-recovery.ps1` 用原 frozen source/cache 补 Linux 编译和精确清理，独立恢复记录另存，结果以其真实终态为准。未重跑旧安全/CLI 或 Owners 十一项。

恢复已完成：`evidence/a-relay-peer-recovery-e1659ffde3e4406a81979396272bcf16.json` 记录 **5 根 / 50 条**原生通过事件、无 fail/skip、Linux 编译实际 exit=0/ELF 摘要、完整 frozen 输入后检与 cleanup=true。两个新 Go 源码当前字节与原测试 snapshot 一致，owner 目录独立核对不存在。本轮 cache/tmp/telemetry/frozen source/二进制均已清理；原进程退出码仍明确 unknown。Linux 二进制未执行，原生只运行新 relay 测试，不宣传完整 evidence 或当前全 checkout 回归。新增 API 尚待 B/D 原桥接与非实现者复核，不计现场槽关闭。

附带独立源码复核：当前 migration catalog 是 136/dba576ad…；40 份新增之外还有 001/046 两份既有迁移被改写。`a-current-catalog-source-review-20261028.json` 只复核 deterministic 当前字节/count，不批准既有 DB 升级、schema/权限或 strict 残余缺项，也不改写旧 96 文件验收。初次 Node spawnSync git EPERM 保留为阻断记录，随后用原生 shell Git 元数据与纯文件 Node 计算完成；未运行 SQL/构建。
