# A：真实链路剩余 bootstrap 准入交接清单

2026-10-22 本地源码核对：`linkedOwnerAdapters()` 仅接入 `registry:rbac_bindings`、`registry:strong_auth_issuers`、`registry:provider_proof_issuers`。仍缺下列 27 个检查槽位：6 个 registry、20 个 reference、1 个跨资源检查。它们是检查数量，同一服务可能支撑多项，不代表必须建设 27 个服务。本清单没有补入适配器、批准资源或改变现场配置。

责任范围依据[主计划第 16 节](system-backup-restore-division-plan.md#16-四人分工和开发门禁)及[D bootstrap 交接](system-backup-d-bootstrap-entry-20260928.md)。表内“协调范围”用于寻找现有交付，不替代项目分配或非实现 owner 交叉评审；组合项的分项内容须由相应 owner 给出，不能把未分配部分默认归 D。本次没有向其他对话发送消息。

## 每项都要交付的内容

每个槽位先提供**已有文档、代码或受控材料的路径及准确版本**。无需重新建服务，也不要把密码、token、DSN、私钥、nonce material 或 MFA seed 粘贴进公共交接文件。

1. 合同：适用 schema/版本、字段语义及评审来源；未冻结或没有合同的项目明确列为待定，不用相似 JSON 代替。`ConfigValues` 只给出 registry 的 kind/version/SHA 与 reference 的 purpose/identity_hash/version，本身不证明真实资源存在或有权使用。
2. 可信解析：实际实现路径/符号，如何从部署受控映射解析到准确 installation、provider/集群/namespace、不可变资源身份及版本、工作身份和用途。公共文件只保留所需引用及摘要；受限 locator 与凭据沿既有受控渠道解析。identity_hash 的计算规则须有来源，不能直接对 Secret 值求 hash 充当身份。
3. 授权与观察：适用的 ACL/角色/issuer/lease、TLS CA/主机名/SSRF 策略、所需能力、观察来源、原始有效期、撤销及版本变化规则。仅填写 supported/approved 或“同一个 endpoint 可访问”不能建立信任。
4. 实现：真实 `BootstrapResourceValidator.Prepare` 和返回的 `BootstrapResourceCheck.Recheck`，或现有等价实现与这两个接口的明确接法。Prepare 在 SQL 锁之前完成外部资源检查；Recheck 只用本地不可变观察和调用方事务内权威状态，拒绝到期、撤销、漂移，不访问网络、不锁外部资源、不提交事务。
5. 验收：准确源码/输入摘要、正负用例和真实环境公共回执路径。至少覆盖错安装、错身份/版本/用途、权限不足、撤销/过期、Prepare 后变化、取消与失败不产生初始化结果；网络资源还需不可信 CA/错主机名/禁止目标的拒绝。历史兼容范围按具体资源合同补充。

部署组合位置是 `backend/cmd/system-backup-bootstrap/main.go::linkedOwnerAdapters()`：registry 放入 `Registries[kind]`，reference 放入 `References[purpose]`，跨资源检查放入 `CrossResources`。各 owner 的实际包/文件位置由实现决定，本清单不预先创建空实现。当前已接入的两个 issuer 槽位只校验公钥信任配置，不证明真实 signer、provider 或本人 MFA 已通过。

## 六个 registry

以下每行均适用上述五项交付要求；材料列强调本行的额外语义。

| 槽位 | 协调范围 | 必需材料 | 关键验收条件 |
| --- | --- | --- | --- |
| `registry:parts` | A/B/C 分项内容；D 合同/组合 | 完整备份 parts、各分项 owner、源资源与 collector/runner 对应关系，适用矩阵及必选项规则 | 拒绝未知/遗漏必选 part、错误源身份或无实现的 collector；不能拿 SQL schema registry 自动当 parts registry |
| `registry:redis_sources` | C；B 提供关联 workload | 准确 Redis topology/源身份、受控连接引用、TTL/一致性策略及 collector 能力来源 | 拒绝错实例/版本、权限不足或不受支持的采集/TTL 策略；不能用一次连通代验 |
| `registry:failure_domains` | A/B/C 依资源提供事实；D 合同 | 稳定故障域 ID、append-only 历史、源与目标关系、管理员 attestation 及全部绑定/期限 | 校验同源排斥；绑定变化或 attestation 过期即拒绝；不同显示名或不同 Kubernetes 引用不自动证明物理隔离 |
| `registry:disaster_identity_mapping` | A 安全映射；B/C 资源恢复语义 | 原身份至灾难恢复身份的版本化 typed 映射、适用资源/安装、外部身份的可用性与权限来源 | 拒绝未覆盖、歧义、错安装/用途及依赖失效；不能从 Secret 名称猜测恢复身份 |
| `registry:source_writers` | B；A/C 各自提供源 writer | MySQL/Redis/object/workspace/runtime 的完整 writer 清单、真实 inventory 和 quiesce/恢复策略 | 差集、未知 writer、身份或策略漂移不能判 clean；静态清单不能代替真实 writer 覆盖 |
| `registry:secret_allowlist` | A；B/C 提供实际使用方 | 当前安装的 namespace/Secret 不可变身份/准确版本/用途/工作身份映射、broker 输入转换与最小权限 | 拒绝未列项、UID/版本变化、用途越界；零项 staging 或 functional-test 示例不是当前安装授权 |

## 二十个 reference

能力名称以[现有 capability 校验代码](../backend/internal/systembackupsecurity/capability.go)及对应合同为线索，不能因名称存在便认定合同冻结或能力已批准。尤其 KMS/Secret/signing 采用独立评估路径，不自动生成 artifact/catalog/evidence provider row。

| 槽位 | 协调范围 | 必需材料 | 关键验收条件 |
| --- | --- | --- | --- |
| `reference:artifact_write` | C provider；A 凭据安全 | artifact provider/root 不可变身份、限定写 scope、写凭据版本、条件创建/校验和能力的原授权观察 | 仅能写受审 scope；错 checksum、越界、失效凭据或不支持条件创建均拒绝 |
| `reference:artifact_read` | C；A 安全复审 | 精确目标/历史对象版本对应的只读凭据和读取范围 | 读取原版本/校验和，不能获写删权限或悄然读 latest |
| `reference:artifact_delete` | C；A 安全复审 | 精确删除 scope/版本、受限删除凭据、version/delete-marker 与缺失证明语义 | 不扩大到整桶/其他版本；provider 准入不替代 owner、hold、retention、lease 等删除业务门禁 |
| `reference:artifact_upload_issuer` | C issuer；A 身份/短凭据策略 | issuer 的真实身份、STS/OIDC 或采用机制、受众/subject/policy、凭据 scope/原期限及撤销路径 | 拒绝错 issuer/audience/scope、宽权限或过期 envelope；旧静态 lab 账号不自动等价 |
| `reference:artifact_ca` | C 传输；A 信任复审 | 原始 CA bundle 摘要、链/有效期、准确主机名与目标 allowlist、版本映射 | 真实 TLS 校验；拒绝过期/不可信链、错主机名及未允许目标，不关闭验证 |
| `reference:evidence_store` | A | 独立 typed store/root、installation/provider 身份、对象版本/完整性与保留语义 | 拒绝错安装/root、可变 locator；独立命名不代替故障域/权限隔离证明 |
| `reference:evidence_write` | A | 限定 evidence 写 scope/凭据、条件创建和 checksum 语义、失败/unknown 处理 | 越界、无权限、内容不匹配均拒绝；不能以下载只读身份发布 evidence |
| `reference:evidence_read` | A | 精确 evidence 对象/版本与只读身份、checksum 和历史读取策略 | 不用请求提供的任意 URI；撤权/错版本失败，不扩大写删权限 |
| `reference:evidence_delete` | A | 受限删除身份、精确版本、删除与缺失证明能力来源 | 精确对象删除且可追证；实际 GC 另须原 owner/引用/retention 等门禁，不在本清单重做 |
| `reference:evidence_ca` | A | evidence endpoint 的受控解析、原 CA bundle/链/主机名/版本 | 不可信链、过期、主机名及允许目标不匹配均拒绝 |
| `reference:evidence_kek` | A | installation 绑定的 evidence KEK ref/version、wrap/unwrap 身份及全部仍被保留 evidence 引用的历史映射 | 准确 key routing、历史可解封、撤销与新写策略；构造 keyring 成功不等于通过准入 |
| `reference:kek` | A；B/C 提供使用路径 | backup 数据密钥对应的 KEK variant/provider/ref/version、生成/解封或包裹能力、精确权限与历史保留 | variant 与调用权限一致；拒绝错 key/version/用途，历史读取所需材料不能提前撤除 |
| `reference:capture_signing` | A；B capture 输入 | capture 专用 signer/key/version/public key、签名 domain/payload 合同、调用身份与历史验证来源 | 密钥与 acceptance/catalog 及其他用途隔离；真实签名可验证，错 purpose/domain/payload 拒绝 |
| `reference:acceptance_signing` | A；D acceptance 组合 | acceptance 专用 signer/key/version、payload/domain、授权调用方与历史验证策略 | 不复用其他用途密钥；不以 signer 准入替代 acceptance 业务判定 |
| `reference:catalog_signing` | A；C catalog 内容 | catalog 专用 signer/key/version、record/domain/历史验证及调用范围 | 不复用 capture/acceptance 或 issuer key；错 record/用途/版本拒绝 |
| `reference:catalog_read` | C；A 身份安全 | catalog provider/root、精确 record/version 的只读身份、完整性和发现边界 | 只读及签名/校验和验证；错 scope/version 拒绝，不扩大 append 权限 |
| `reference:catalog_append` | C；A 身份安全 | append 身份/版本、不可覆盖 record key、条件创建与校验和能力 | 仅能追加受审记录；冲突不能覆盖、换身份或改 checksum 冒充成功 |
| `reference:catalog_snapshot` | C；A 来源复审 | 选用的 snapshot/inventory discovery 模式、精确 manifest/version/checksum、覆盖范围与来源 | 不混用发现模式；缺失/过期/版本冲突不能推断对象不存在或扫描完整 |
| `reference:nonce_hmac` | A | 原受控解析路径、准确身份/版本、用途和安装绑定、所有 control retention 内历史 key 的可用性/撤销策略 | 当前材料长度恰为 32 只是必要条件；还须身份/用途/权限正确及历史查重，不把 secret hash 当身份 |
| `reference:status_relay` | B；A 工作身份安全 | 真实 relay 服务身份/版本、mTLS 信任/客户端身份、Job UID/generation/task/attempt 绑定与撤销 | 错 Job/attempt/身份、重放或过期拒绝；relay 自报不能替代 Kubernetes/源 checkpoint 权威核对 |

## 跨资源检查

| 槽位 | 协调范围 | 必需材料 | 关键验收条件 |
| --- | --- | --- | --- |
| `cross_resources` | A 安全策略；B/C 分项事实；D 组合接入 | 同一 installation/config/grant 下全部 registry/ref 的可信观察、故障域/灾难身份映射、Secret allowlist、凭据/签名用途隔离和保留关系 | 拒绝单项各自合法但组合错安装/版本/用途、源依赖、隔离不成立或历史材料过早失效；不得用单项结果的布尔 AND 代替关系校验 |

## 已有代码能复用到哪里

- `BootstrapConfig` 已做结构/数值/闭集及部分签名用途身份冲突检查；仍须真实资源解析和跨资源权威观察。
- `NewTransitSigner` 提供 signer 客户端，不能以构造成功证明 bootstrap 资源已准入。`NewTransitKeyring` 的注释明确输入必须已经完成 admission；不能倒过来用它证明 admission。
- 通用 `services.SecretRefService.ResolveString` 接受 literal value、默认 namespace 并返回 Secret 值，没有 backup typed 身份/版本/用途绑定，不能直接填入上述槽位。
- [Secret 材料核对](evidence/a-live-chain-secret-admission-gaps-20261021.json)指出现有 draft SecretRef purpose 与 bootstrap purpose 并非同一闭集；例如 `nonce_hmac`/`strong_auth_nonce_hmac`、`capture_signing`/`capture_certificate` 只能作为待明确的映射问题，本文没有批准转换。
- registry 文件自身的投影摘要与 bootstrap `RegistryBytes` 要求的**完整原始文件字节 SHA**保持区分。文件通过 SHA/JSON 检查不等于其业务 schema、授权或能力检查通过。
- [系统 capability producer 交接](system-backup-a-capability-producer-admission-request-20260929.md)已有初始化前可信来源、可撤销运行授权与结果登记的设计要求。引用它时应逐项核实现状；不能只凭结果正文自报的 identity/supported 来批准首次 bootstrap，也不能由本文新造 grant/SQL enum 解锁。

## 接收顺序与本地边界

先收已有材料路径和版本，再补合同/typed 映射的缺失决定；资源 owner 提供真实 Prepare/Recheck 与对应测试，非实现 owner 交叉评审后才显式装配。每项同时保留“材料来源”“实现/接线”“本地验证”“现场观察”“交叉签收”状态，不能用一个 completed 布尔值覆盖这些阶段。

所有槽位齐备前，`--requirements` 继续报告缺项，不以 no-op 填空。槽位齐备后也只证明实现存在：仍需绑定真实安装/数据库/配置及有效原授权，完整 Prepare/Recheck 后成功 apply 也仅初始化 **disabled v1**，不是启用备份、登录 MFA、证据下载或审计链路验收。Commit unknown 使用原目标与幂等键处置。

本对话的安全验证入口继续使用完整冻结输入、默认 vet、Linux 编译和新增源码集合检查；不借此改写另一 A 的 owner/角色来源基线。真实 HTTP/审计仍使用[既有 live-chain 入口](system-backup-a-live-chain-20261021.md)，待实际条件齐备再运行。

## 现场命令复用，避免重复建设

另一 A 已交付[统一现场采集](system-backup-a-field-evidence-handoff-20261021.md)，覆盖真实 SQL 身份与表/列/索引/CHECK/FK/trigger/routine、CA 原字节/DER/有效期以及 data/report/journal 挂载等。本文不再新建 DDL/证书/卷扫描器，也不重跑已接收的角色专项。

若需要确认 10 月 21 日之后是否换过部署，在**既有可 SSH 的 PowerShell 会话**执行现成的公共引用盘点即可：

```powershell
Set-Location -LiteralPath 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
.\scripts\system-backup-a-field-inventory.ps1
```

回传末尾 `Public inventory receipt:` 的完整路径。此入口仅取公共 Kubernetes 引用，不查询 Secret 内容、不 exec 容器、不查询 SQL；固定旧 namespace UID，发生替换会停止而非自动接受新 UID。这里保留命令供现场需要时使用，本次没有启动 SSH，也不要求为完成本清单重复盘点。

取得新引用、真实材料和受审部署后，再按统一采集文档完成 plan 和 CheckOnly，避免拿旧 app Pod 冒充下载 runtime。其完整采集已有物理 DDL 元数据；迁移账本文件名不同应与这些事实核对，不直接重跑迁移。CA 包有效期采集仍不代替完整 TLS 链/主机名、OIDC/ACL 和真实能力检查。若真实材料尚缺，保留对应缺项，不构造 apply 包。

本轮交付的[源码/清单核对记录](evidence/a-bootstrap-resource-handoff-review-20261022.json)固定依赖摘要、已接三项与剩余 27 项及本清单内容。它只证明本地交接范围与源码一致，不表示任何资源交叉签收或现场准入通过。
