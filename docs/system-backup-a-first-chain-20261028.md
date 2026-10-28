# A：首条真实备份的安全装配交接（2026-10-28）

本轮收尾增量：B PR `08d15abf` 的 publicadapter 已由 D 导入并接到真实构造路径，A 新 `BindDispatchMessage/RecheckDispatchMessage` 连接 B 消息与原 mTLS/公共 Authority/Job。新增字节 2 根/20 条原生通过、Linux 编译 exit=0/ELF（未运行）、八份关键输入/非实现者源审摘要一致；两轮本轮产物已清理，未装依赖/未重跑 Owners。准确终态见 `evidence/a-relay-message-validation-20261028.json`，唯一接线/脱敏输入清单仍是 [公共安全适配和部署输入](system-backup-a-public-adapters-20261028.md)。正式 cursor/Job ledger/加密 WorkStore、原授权/材料等仍缺，不构成真实初始化、配置启用或公共整链验收，现场关闭仍 0。

PR 最新源码增量已核到 `0a4bdc19`，当前公共 HEAD 为 `d3c5715a`；九份原安全源码输入及四份 A relay 被测字节未变，已复用。精确新增 gate 分类差集与原执行授权边界见 [新 head 安全装配增量](system-backup-a-b-pr1-security-delta-20261028.md)，未将新 PR 文档或旧测试当作现场清槽证据。

最新实现交付见 [公共安全适配和唯一部署输入清单](system-backup-a-public-adapters-20261028.md)：RelayPeerAuthenticator 现新增直接消费 D 公共 Authority/JobBinding 的 BindDispatch/RecheckDispatch，复查全部 claim/fence/Job 字段和原期限；新字节原生 **8 根/70 条**通过、Linux 恢复编译 exit=0/ELF、冻结输入一致且 cleanup=true。准确终态为 `evidence/a-dispatch-relay-validation-20261028.json`，首次 Linux 编译失败日志保留。D/B 仍须接正式 relay 消息/handler、原 SQL 授权及共享撤销/final guard；production link/原 authority/selections/受控材料未齐，现场关闭仍为 0。原三材料入口、Owners 十一项和旧安全/CLI 验证继续复用。

当前仍**不满足真实初始化和配置启用条件**。已有 30 槽闭集保持不变；未提供生产部署 Go link 的实际 CLI 仍缺 27 槽。此次将三材料组合接到了真实 `main` 的调用路径；有独立原 authority、准确 selections 和绑定的部署版本可以经同一入口装配，结构上还缺 24 槽。测试模型装配不计作现场清槽，不能据此创建或启用生产配置。

用户最新更新已接收：三材料入口作为已完成事项，不再重复实现；下一交付集中在部署专属 production link、独立原 authority、准确 selections/受控材料和其余槽位。本轮未用空实现填入 production link。

随后收到 B PR #1 新线索，A 已只读核对固定提交 `14768599f30846e9cfe22c121059ecf698e1b048`，结果见 [B 安全映射接点](system-backup-a-b-pr1-security-mapping-20261028.md)。找到真实 worker/mTLS/Job UID/撤销实现；仍需公共 task/attempt/relay cursor 桥接，内部 Vault/staging、manifest 签名及独立控制面不能直接填 v12 槽位。本次关闭 0 槽，未 merge、未重跑测试、未创建缓存/二进制。D 对前述 A 五份 Go 源码反馈 source-only 非实现者核对未发现绕过，正式准确回执由 D 单独落档。

## 本轮代码与准确接点

- `backend/cmd/system-backup-bootstrap/main.go` 调用 `runLinkedBootstrap(..., deploymentMaterialLink)`。
- `backend/cmd/system-backup-bootstrap/materials.go` 新增 `newBootstrapMaterialLink(base, inputs)`，复用原 `Materials.New/Owners` 和 `NewBootstrapDeploymentCandidates`。部署专属、受控 Go composition 文件在 `init` 中构造后赋给 `deploymentMaterialLink`；缺原 authority、错绑定、缺 selections 或碰撞均拒绝。没有运行时 JSON/环境变量/receipt 注入或跳过 owner 的入口。非空坏 link 不回退 legacy。
- 原 `linkedOwnerAdapters()` 仍保留 RBAC 与两个 issuer registry。base 应包含 B/C/A 的其余真实 validators、cross_resources；maps 复制，candidate selections 深复制。`--requirements` 只作结构报告，不能证明授权、物理材料、TLS 或 SQL 已通过。
- `backend/internal/systembackupsecurity/bootstrap_admission.go` 在原 legacy 路径补齐 typed-nil validator/check 拒绝、nil/已取消 context 拒绝，并在任何受信回调前复制 owner maps，防止原 map 被回调替换而跳过已选 owner。没有修改原锁序、授权或历史分支。

部署 Go composition 的接入形式如下（说明片段，不是可伪填的生产文件）：

```go
// 原部署模块提供真实 owners、独立 current authority、三个 typed bindings
// 和原 C1 精确 selections。它必须认证下节所有关系，不能只解析相同 hash。
func init() {
    link, err := newBootstrapMaterialLink(originalOwners, bootstrapMaterialInputs{
        Original: originalAuthority,
        Nonce: originalNonceBinding,
        ArtifactCA: originalArtifactCABinding,
        EvidenceCA: originalEvidenceCABinding,
        Selections: originalSelections,
    })
    if err != nil { panic("bootstrap deployment composition unavailable") }
    deploymentMaterialLink = link
}
```

标准 `--requirements`、`--check --deployment-file … --deployment-sha256 …`、`--apply …` 参数和退出码不变。部署文件仍沿 `BootstrapDeploymentConfig` 原 schema；未增加授权 JSON。Apply 仍经过 `NewBootstrapCandidateFileAuthority` 的当前 grant/RBAC、原 independent authority、A attempt 和 D 原事务消费。实际生产 link 尚未发现，故本轮没有提交一个空 link 或测试 authority 到运行入口。

## 原可信来源和生命周期要求

准确原接口是 `BootstrapCandidateAuthority.PrepareBootstrapCandidates` 以及其 session 的 `Authorize / LockHosts / LockReferences / Reserve / LockEvidence / Recheck`。`NewPinnedBootstrapCandidateAuthority`、固定文件 authority、三材料 wrapper 都保留此独立来源，不能替它签发许可。

原部署 owner 必须把以下完整关系绑定在同一可信安装和原版本下，并在当前 Authorize 与最终 Recheck 检查撤销/期限；物理准备在锁前，事务回调不得网络、Begin/Commit 或刷新观察期限：

| 关系 | 必须认证的原事实 | 现有检查与剩余边界 |
|---|---|---|
| 安装/config | installation、server UUID/database、canonical ConfigValues、原 grant 用户/matrix/key/原因和期限 | 原 grant + pinned RBAC 已有实现；文件摘要只固定字节，文件的受控来源不能靠文件自填声明 |
| provider/scope/purpose | exact ref identity/version、provider/root、最小操作/工作身份、原 C1 admission/target/policy/channel profile/candidate 关联 | `DecodeSecurityReference/MatchesBootstrapPin` 和 candidate relation 只比较；独立原资源来源仍待交付 |
| nonce | 已支持 exact-version external_secret 文件 profile；准确 32 bytes；所有 persisted config/retained nonce version 的唯一 identity 和 ProtectedUntil | 真实 validator 已有；不会用文件外观冒充 Kubernetes Secret UID/API 授权 |
| artifact/evidence CA | 各自 descriptor/PEM 原版本、provider/scope、原 hostname 与固定允许 IP、期限/撤销 | 真实公开 CA/TLS、原文件复读已有；TLS 成功不证明 provider 操作权限；catalog CA 不自动折叠到 artifact CA |
| 历史保留 | 被 artifact/catalog scan/record/import/proof/promotion 或 retained evidence/nonce 引用的全部旧版本 | 原 v12 第 770 行要求只能 inactive、不得改写/删除；P0 无自动 registry/material GC；identity tombstone 永久保留 |

撤销原 grant/映射后，历史重放仍须当前授权；已提交候选的历史分支不重新占容量、不要求旧物理材料在线，也不允许过期/撤销的当前身份重新获权。材料观察只缩 dependency deadline，不能缩成或替代 identity authority。

## 27 槽关闭表与具体 owner

分类：I=仍缺生产业务实现/adapter，C=仍缺原合同或映射决定，M=仍缺本安装现场事实。C 不能用示例或新别名推断；M 不等于代码已经完整。每行的责任人是首责角色；协作与具体输入同时列出。下表现场关闭数为 0，三材料入口实现的进展单独记录。

| 槽位 | 缺项 | 首责 / 协作 | 必须补齐的输入或决定 |
|---|---|---|---|
| registry:parts | I C M | D 正文；B collector；A/C 各源 | acceptance 六项已由 manifest allOf 固定；仍缺六项实际源 identity/owner/collector/depends_on registry 正文和完整性观察 |
| registry:redis_sources | I C M | C；B | 原 topology/实例/连接 ref、TTL/一致性 profile 与 collector 支持映射 |
| registry:failure_domains | I C M | D；A/B/C | 稳定域 ID、source/target 全关系、append-only 历史、真实隔离 attestation/期限/撤销 |
| registry:disaster_identity_mapping | I C M | A；B/C 恢复 | 原→灾难身份 typed 映射、覆盖/歧义、安装/用途/权限/期限；不能用 redacted_parameters 自由对象 |
| registry:source_writers | I C M | B；A/C 各源 | 全 writer inventory、稳定身份、quiesce/resume/lease/participant 策略及真实差集；check-state clean/hash 不证明完整 |
| registry:secret_allowlist | I C M | A；B/C 使用方 | namespace/name/key、Secret UID/version、purpose/workload 最小授权；JSON registry→broker 字符串转换合同；staging 空表/functional-test 单条不能替代 |
| reference:artifact_write | I M | C；A | 原操作合同保留；缺 artifact exact provider/root/scope/credential version 和 conditional-create/checksum 原 verifier/观察/期限 |
| reference:artifact_read | I M | C；A | 原 exact-read 合同保留；缺 historical object/version/checksum 的只读身份/权限/撤销，不扩大写删权 |
| reference:artifact_delete | I M | C；A | 原精确删除合同保留；缺受限 exact-version/delete-marker 删除和权威 absence/unknown verifier |
| reference:artifact_upload_issuer | I C M | C；A | 原 STS/OIDC issuer/subject/audience/policy/scope、调用身份和短凭据撤销/期限；无单一 SecretRef 别名 |
| reference:artifact_ca | M | C 原 provider/部署 owner；A 验证 | 已有真实 validator，已接通编译装配路径；缺受控 descriptor/PEM/hostname/IP/provider/scope/version/期限及真实 link |
| reference:evidence_store | I C M | A；D channel / C provider | 原 typed store/root、immutable identity/version、隔离/保留/完整性与 C1 evidence channel profile |
| reference:evidence_write | I M | A；C provider | 原操作合同保留；缺独立 write ref/version/scope 和 conditional-create/checksum 能力/期限的真实准入 |
| reference:evidence_read | I M | A；C provider | 原 exact-read 合同保留；缺只读身份、exact locator/object/version/checksum、历史读取与撤销的真实准入 |
| reference:evidence_delete | I M | A；C provider | 原删除合同保留；缺受限身份/exact version/absence/unknown/retention 的真实准入；GC helper 不代替首次准入 |
| reference:evidence_ca | M | A 原部署 owner | 已有真实 validator，已接通编译装配路径；缺独立 evidence CA 原绑定/PEM/hostname/IP/期限及真实 link |
| reference:evidence_kek | I C M | A；C provider | 原生产 wrap/unwrap variant、provider key/version、工作身份权限、全部 retained evidence 映射 |
| reference:kek | I C M | A；B/C 使用方 | backup 原 generate/wrap/unwrap 操作组合及 provider variant、精确 key/version、调用权限和 retained 引用 |
| reference:capture_signing | I C M | A；B payload | capture 专用 ref→key ID/numeric provider version/public key、EdDSA/domain/payload、调用身份和全历史保留 |
| reference:acceptance_signing | I C M | A；D acceptance | acceptance 专用 key/version/domain/JCS、调用授权和历史验签/撤销；不可复用 capture/catalog key |
| reference:catalog_signing | I C M | A；C payload | catalog 专用 key/version/public key、record/domain/调用授权/全历史；不得解析 version 前缀或用 latest |
| reference:catalog_read | I C M | C；A | exact signed record/version/完整性、原 provider/root 与只读发现边界 |
| reference:catalog_append | I C M | C；A | 原 append/conditional-create/conflict/checksum、独立凭据 identity/version/root/权限 |
| reference:catalog_snapshot | I C M | C；A | 原 snapshot_list 或 inventory_read 的明确选择；完整 manifest/version/checksum/覆盖/缺失规则，无失败切换 |
| reference:nonce_hmac | M | A 原部署 owner | 已有真实 validator，已接通编译装配路径；缺受控 exact-version descriptor/32-byte mount、全 retained identity/ProtectedUntil 和真实 link |
| reference:status_relay | I C M | B；D Job cursor / A 身份 | 原 mTLS/workload 与 Job UID/generation/task/attempt 的权威绑定、sequence、期限/撤销/接管；不能 relay 自报 |
| cross_resources | I C M | A 组合；B/C 原事实；D 事务 | 全安装/config 同版本，故障域/灾难身份/allowlist/三用途隔离/独立凭据/历史引用/容量及原 authority 总检查 |

原依据继续使用 `system-backup-a2-bootstrap-registry-contract-coverage-20261027-r2.md`、`system-backup-a2-bootstrap-mapping-decisions-20261027.md` 和各行引用的 v12 正文。本轮没有修改合同、生产 provider enum、用途别名或给 draft 升级状态。B/C 尚未签收的 M2 KEK、M5 relay、M6/M7 catalog discovery/trust、M8 三用途签名和 allowlist 转换，仍须由原 owner 给出准确同版本决定，再由 A 实现业务适配。

## D 创建请求、登录与配置启用

`LoadSystemBackupActionAuthorizer(sessions, pinsPath, pinsSHA256)` 接收与真实 login/refresh 相同的 `*SQLLoginSessions`，不能仅验 JWT。`SystemBackupReadPins` 使用当前 installation/config version/RBAC version+SHA/registry directory。启用写新版本后必须重载 current pins；旧 v1 pin 不可继续使用。

创建服务顺序沿现有 `systembackupapi/submission.go`：Scope 保留原 context → Begin 唯一 tx → AuthorizeAction → 完整业务准入/幂等/容量/task+snapshot+调度/event/audit → 业务最后 guard → RecheckAction → context/clock guard → 唯一 commit。当前授权失败/撤销/配置漂移始终回滚；scope 副本不能换 tx。

v12 分工计划第 236 行已经固定 task tuple 为 `(installation, actor_type, actor_id, operation ID, key)`，业务 DTO 按 schema defaults/明确移除传输字段后 JCS/hash；不是 raw body hash，也不新增身份 domain framing。backup/preflight 的 closed request DTO、默认值/null 等价规则仍未在 OpenAPI 给出，不能默认 `{}`。D 已收到原依据并修正其接口方向。

第 756 行明确 task create 在认证/授权后先命中同 tuple/hash 的保存响应，异 hash 返回 409；第 772 行将开关定义为 new-work kill switch。可按原文解释：仅返回已保存原任务、不预留新容量/新建任务/调度/外部动作的准确重放，可先于 fresh enabled 检查；当前 AuthorizeAction/RecheckAction、session/RBAC/pins 不可省略。第 267/671 行与 compact tombstone x-invariants 固定已清理记录同 hash 返回 410 + 原 public ID/终态摘要，异 hash 409，不重新创建。此解释已交 D 确认，不能借 config mutation 的不同 hash profile 替代任务合同。

原普通 backup/preflight `system_backup.operate`、recent strong auth=none 不变。配置启用必须走 `ConfigMutationService` / `NewConfigMutationHTTP` / `PinnedConfigMutationAuthority` / `PinnedConfigMutationResolver`：比较新旧值及真实 resolver 风险，security-boundary 要 security_configure+近期强认证，protection-reduction 要 destructive+近期强认证+非空 redacted change_reason；回滚同样写新版本和重新解析历史 refs。仅 enabled false→true 不自动创造另一条 MFA 规则，也不能忽略其余同时发生的风险。原 env switch 与 config.enabled 都必须 true。first_enabled_at 由 controller 原 CAS 维护，API 不能重置。

## 脱敏材料清单与验证边界

操作者只提交现有受控位置、来源 owner、immutable ID/version 与可公开的原验证记录；原密钥/token/DSN/Secret data 通过原 mount/loader，禁止贴聊天/日志：

1. 原安装/数据库 UUID/name、当前 config/RBAC pins 及原离线 grant 受控挂载、有效期/撤销来源。
2. 九份 registry 的原正文/版本/字节 pins；六份未定正文必须给准确 owner 合同，不能给自填 approved。
3. 二十用途的 provider/root/scope/purpose/工作身份/权限/精确版本及原授权来源、原能力观察期限。
4. nonce 所有 retained 版本的 descriptor 与 material 受控路径、ProtectedUntil；两个 CA 的公开 PEM/descriptor/hostname/固定允许 IP；不输出密钥。
5. 三签名专用 public key、purpose/domain、provider key ID/numeric version、完整 retained 历史；两 KEK 的生产操作组合与旧引用映射；Secret UID/version/workload 和 relay 当前 Job/attempt 权威事实。
6. 真正登录登记 SQL session 的测试管理员、HTTPS 地址/信任、当前 pins、部署 switch 状态；敏感值沿原 credential files。当前没有以旧远测 schema 的通过记录替代本安装 session/HTTPS 启用验收。

本轮入口 `scripts/system-backup-a-first-chain-validation.ps1` 只用既有 Go/toolchain/module cache、GOPROXY/GOSUMDB=off、readonly modules；冻结 backend/contracts/scripts 及原测试夹具。执行变更相关 security+CLI 完整原生测试、Windows CLI 实际 `--requirements`、Windows/Linux CLI 构建。最后清理本轮唯一 `.tmp-a-first-chain-<id>`，保留源码 pins、原日志和 JSON 终态；Linux binary 只编译。相邻 D 修改单列为 source drift，不据此宣称整 checkout 通过。测试结果在完成后补入本文件。

本轮验证已经结束：[原始终态](evidence/a-first-chain-native-28fa500191154ea4b53891a86dac6a83.json)、[原生日志](evidence/a-first-chain-native-28fa500191154ea4b53891a86dac6a83.native.jsonl)、[机械核对](evidence/a-first-chain-native-28fa500191154ea4b53891a86dac6a83.verified.json)。security 全包 **307 根 / 2,310 条**、CLI **3 根 / 3 条**通过，无失败/跳过；默认 vet 随 go test 执行。Windows/Linux CLI 构建退出 0，Windows 二进制实际 requirements 退出 2/缺 27 项/SQL=false/mutated=false。配置模型的 24 项仍只在明确 synthetic 测试中验证。Linux ELF 只构建不运行。本轮 cache/tmp/telemetry/source/两个平台二进制均已清理，owned 目录独立核对不存在；没有安装依赖。

本次五份 A 新增/修改 Go 源码和 runner 与冻结测试来源逐字节一致。测试期间 D server/API/smoke 七份既有文件变化，另有新增源路径，终态明确 `source_unchanged=false`；这些未测变化不是本轮整 checkout 的通过结论。D 对新源码的非实现者复核另行签收，机械核对不代签。

27 行机器清单在 [a-first-chain-slots-20261028.json](evidence/a-first-chain-slots-20261028.json)，保留旧审计原字节摘要/已有 helper/原始事实，不重新验证旧 Owners。自行搜索的准确范围及来源摘要在 [a-first-chain-existing-sources-20261028.json](evidence/a-first-chain-existing-sources-20261028.json)：已找到旧现场公共引用、原 nonce/CA r2 复审和原材料专项；lab bootstrap admission 是 `candidate_only=true`，旧 KMS/signing token 的 8 小时窗口也不得续造。搜索范围是现有仓库和 A/D 交接，未据此声称当前远端材料不存在。当前现场只读发现由 D 的 observer 统一协调，A 未重复发起远测。

D 最新只读协作快照（对话 `01a18018-d7b7-7ee2-9236-dd28444454b0`）反馈：原脚本目标 `root@10.130.14.23` 的 SSH 公钥认证被拒绝，尚待可用的原受控 SSH alias/key-agent 入口与 B/C 本轮交付位置。此处是 D 的探测反馈，不是 A 自行执行的新远测回执；A 没有因认证失败换身份、索取密码或降低校验。production link、独立原 authority 和真实 selections/materials 因此仍未提供/接通，不将本轮安全修复与本地回归描述成启用完成。

复用旧已接收的 Owners 11 项真实 MySQL 和原 action/materials 接收边界，没有重复启动 Owners、GC 或 provider 远测。新本地模型测试不证明生产 grants、InnoDB ranges、provider ACL 或真实备份成功。现场关闭必须同时满足原 owner 合同、真实 adapter、受控材料和实际回执四者；此完成标志尚未达到。
