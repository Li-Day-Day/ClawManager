# 公共 C：在线适配与正式材料来源核对

2026-10-29，源码核对基线 `b14bf695`，同时读取其前置 `493040af` 的 A 交接。本记录补充 [C 字节合同](system-backup-c-crypto-contract-20261029.md)，不修改 `a7424ce1` 的 public-c-crypto.v1 bundle、原执行授权或 D 共享文件。范围为本地源码与已保存材料；未读取现场秘密、调用 provider、下发授权或复核现场状态。

结论：**在线 adapter 已有，但本仓库尚未找到把原 KEK 注册/准入事实转成 C `KeyBinding` / `kms.Config` 的生产实现，属于代码缺口；同时原映射及授权材料尚不完整。三用途业务 `ResolveSigning` 也缺生产实现。** 不能把这两项仅列成要求用户补材料，更不能用 C synthetic 向量、候选 key、公开 JWT trust 或接口构造成功补齐。下文在 `f76c7439` 基线上进一步核对该代码链。

## 已有实现与准确入口

| 接点 | 文件 / 接口 | 实际边界 |
|---|---|---|
| backup generate / unwrap | [transit.go](../backend/internal/systembackupkms/transit.go)：`Config`、`Resolver.Resolve`、`NewCaptureGenerator`、`NewRecoveryUnwrapper` | 实现 C `Generator` / `Unwrapper`，消费已准入 Config 和原授权 resolver；构造函数不是 registry 准入来源 |
| 原 Job provider 许可 | [job_resolver.go](../backend/internal/systembackupkms/job_resolver.go)：`OriginalJobAuthority`、`PermitMount`、`NewPinnedJobResolver`、`NewJobResolver` | 独立 permit/pin 与原 Job authority 共同约束用途、完整 context、期限和实际使用；不创建另一套 execution grant |
| 原 worker 使用 | [key_use.go](../backend/internal/systembackup/worker/key_use.go)：`NewCaptureKeyJob` | 消费原 control client、invocation、kms Config 和 permit；最终 writer/cmd 与冻结 capture context 的真实来源仍待 B 交付 |
| 三用途在线签名 | [transit_signing_credentials.go](../backend/internal/systembackupsecurity/transit_signing_credentials.go)：`TransitSigningBinding`、`TransitSigningCredentials.ResolveSigning`、`NewCredentialTransitSigner` | 绑定安装、purpose、key ID、opaque registry version、独立 provider version 和原 signing-input SHA；SHA 用于授权绑定，签名仍消费 C 原始字节，不新增 prefix/prehash |

A 的完整实现限制、provider JWT 用途隔离、原 Job reserve/begin/end、停止证明及现场待办见 [在线 KEK 交接](system-backup-a-online-kek-20261029.md)。本次只核对入口及来源，不重复宣称 A 的本地测试等于生产并发验收。

## 1. backup KEK 已准入映射：仍缺正式来源

已读取的来源：

- [现场 provider 初选](system-backup-site-provider-choice-20261028.md)记录五把 version 1 **候选测试 key**，明确未完成新用途身份/ACL/准入。名称中的安装 ID、`v1` 和 provider 数字 version 不能推导 registry identity/version。
- [online-kek-job.example.json](../examples/backup-controller/online-kek-job.example.json)中的 identity_hash、registry_version、provider_key_id 仍为 `REPLACE_WITH_ADMITTED_*`；示例 provider_version `1` 不是正式绑定证据。
- A 的 [在线交接](system-backup-a-online-kek-20261029.md)明确列出 registry owner / C 待交材料；后续 `c173fda4` 已补齐操作者回传的 JWT trust 读回，准确来源见下节。该读回不提供 KEK 注册准入、task permit 或当前操作权限。

| 缺项 | 原责任与交付要求 |
|---|---|
| identity_hash、opaque registry_version、installation、provider key ID/name、独立 numeric version | registry owner / 部署 owner 提供原已准入记录及受控引用、版本、摘要；C 负责与 envelope 完整 binding 对照，不能从候选 key 名生成授权 |
| 当前 generate/unwrap 用途、期限、撤销来源 | 部署 owner 提供精确 policy/role 读回及原 permit/pin；D/B 提供原 Job/执行授权身份和撤销事实；A adapter 执行检查。provider token 撤销与 Job 已停止分别取证 |
| 历史读取映射及保留 | C/D 与恢复 owner 提供完整 retained request/envelope/ref/version/CA 映射、当前独立 recovery grant、引用扫描范围/水位及并发保护；历史 key 存在不是当前 unwrap 授权 |

因此当前既缺可直接填入生产 `kms.Config` 并视为已准入的完整材料包，也缺签收并生成该配置的具体生产 adapter。本次不创建、推断或签发这些记录。

### 正式 KEK registry 映射入口：明确的代码缺口（f76c7439）

搜索范围为当前 `backend` 非测试 Go 源码、bootstrap 命令组合与已存在的注册/准入合同。没有找到能够完成“原注册事实 → 用途/版本/期限/撤销/保留检查 → 已准入 C KeyBinding → kms.Config”的生产入口。已有入口的精确能力如下：

| 原合同 / 代码 | 已有能力 | 尚缺的 KEK 接线 |
|---|---|---|
| [secret-ref.schema.json](../contracts/system-backup/v12/secret-ref.schema.json)；[reference.go](../backend/internal/systembackupbootstrapsecurity/reference.go) 的 `DecodeSecurityReference` / `SecurityReference` | 闭集读取 identity_hash、identity_version、provider_identity_hash、scope_hash；external_kms_key 分 generate_data_key 和 unwrap_data_key | 解码要求 identity 已存在，并不产生或认证 identity。`MatchesBootstrapPin` 特意不含 `kek` 映射；单一 ref 不能替代 generate/unwrap/retained-version 集合。缺完整 provider locator/key ID/numeric version 与这些 refs 的原授权映射及集合验证 |
| [config_bootstrap_rules.go](../backend/internal/systembackupsecurity/config_bootstrap_rules.go) 的 `bootstrapReferencePurposes`；[config_bootstrap.go](../backend/internal/systembackupsecurity/config_bootstrap.go) 的 `BootstrapSecretRef` | 已有 `reference:kek` 与独立 `reference:evidence_kek` 槽位；配置保存 purpose/identity_hash/version | 槽位和结构校验不验证 provider/密钥/权限；不得将 evidence_kek 实现改名充当 backup KEK |
| [bootstrap_admission.go](../backend/internal/systembackupsecurity/bootstrap_admission.go) 的 `BootstrapAdmissionSources.References["kek"]`、`BootstrapResourceValidator.Prepare`、`BootstrapResourceCheck.Recheck`、`PrepareBootstrapAdmission` | 原生产准入编排：事务前获取真实资源观察，事务内按原 grant/配置复查，缺 adapter 拒绝 | 应实现并装配 KEK 专属 validator，检查原注册版本、provider 精确映射、generate/unwrap 身份、期限/撤销和完整历史保留；当前没有对应 C→A 具体转换/validator |
| [config_mutation_resolver.go](../backend/internal/systembackupsecurity/config_mutation_resolver.go) 的 `ConfigMutationResolverSources.References["kek"]`、`ConfigMutationResourceValidator`、`NewPinnedConfigMutationResolver` | 原配置修改通道提供 Current/Proposed ref、Risk/ValidUntil、事务内 Recheck | 同一 KEK 映射与历史引用验证必须接入轮换/修改路径，不能只在启动构造时验证一次；缺实际 KEK owner adapter |
| [materials.go](../backend/internal/systembackupbootstrapmaterials/materials.go) 的 `Materials.Owners`；[bootstrap materials 组合](../backend/cmd/system-backup-bootstrap/materials.go) | 实际新增的三项仅为 nonce_hmac、artifact_ca、evidence_ca，其余沿用必需的 base/Original；`NewPinnedBootstrapCandidateAuthority` 同样要求独立 original authority | 这些通用 wrappers 不提供 KEK 注册来源，也不补齐 `reference:kek`；不能给 Original 填恒成功实现 |
| [systembackupkms/transit.go](../backend/internal/systembackupkms/transit.go) 的 `Config`、`NewCaptureGenerator`、`NewRecoveryUnwrapper` | 消费完整已准入映射，执行 TLS/exact version/context 与当前 resolver 检查 | 这是准入后的消费者；不能通过传入手写 Config 或 key profile SHA 完成注册签收 |
| [providerproof_registration.go](../backend/internal/systembackupsecurity/providerproof_registration.go)、[registration_api.go](../backend/internal/systembackupsecurity/registration_api.go) | 原 provider proof/evidence 注册与观察接口 | 请求格式为 target/proof/expected_row_version 等，不是 C KEK mapping 注册 DTO；不得把本次 profile 回执登记成正式 KeyBinding 授权 |

应复用的主链是 **原 typed reference / 配置 pin → 原 BootstrapAdmission 与 ConfigMutation owner 槽位 → 可信已准入映射 → A KMS Config/resolver**。是否需要新增持久记录必须先与 D 原配置/registry 存储合同协调；本核对不凭空发明另一套 registry API 或执行授权。

代码责任按现有边界落实：

- **公共 C**：补齐 backup KEK 组合映射的闭集合同与 adapter，明确原 identity/version、两用途 typed refs 到 `KeyBinding`、provider key/version 的对应；提供 retained artifact/envelope 的完整引用扫描与水位。不能从 key 名、context hash 或 profile SHA 生成正式 identity。
- **A**：沿原安全准入接口实现/复核真实身份、provider/key/version、用途隔离、授权期限/撤销、历史引用与重绑定拒绝；复用已有 KEK transport、原 Job authority 和原 grant。负责安全验证，不替 C 构造业务引用，也不把 typed decoder 当认证。
- **D**：沿 `BootstrapOwnerAdapters.References["kek"]`、原候选/Original 组合与 ConfigMutation 槽位装配，接原配置/registry 持久化及事务内最终复查；不以新 execution grant 弥补映射缺口。
- **部署/registry owner 与恢复 owner**：在上述代码入口存在后提供真实资源身份、受控版本、provider 回执、精确许可及恢复授权。真实材料仍必要，但材料本身不能补上缺失的实现。

实现完成的可评审标准是：生产组合实际消费原准入输出构造 Config；伪造/变更 registry version、provider version、用途、到期/撤销、同 ref 重绑定及不完整 retained 扫描均拒绝；轮换后按完整历史 mapping 读取、禁止旧 key 新写。当前尚未达到该标准。

公共 C 后续已保存 [组合映射与 retained 输入对齐单](system-backup-c-kek-mapping-alignment-20261029.md)，附两个 `candidate-pending-d-alignment` 闭集 schema。它们明确两用途原 typed refs 到既有 KeyBinding 的验证边界、全量扫描四类覆盖和水位输入，尚未实现生产转换/scanner；A 正与 D 确认原持久化、共享 fence 与事务来源。提案不产生正式身份，不改原 crypto bundle，也不把 D 尚未确认的来源写成已存在。

### 后续 backup key profile 读回（f76c7439）

已读取 [a-site-backup-kek-profile-20261029.json](evidence/a-site-backup-kek-profile-20261029.json)，来源为操作者回传。provider version `1`、`profile_matches=true`、`mismatch_fields=[]`；derived AES256-GCM/HKDF-SHA256、export/明文备份/删除禁用，minimum available/decrypt/encrypt 为 `0/1/0`，latest 为 `1`。profile SHA 为 `fd5c182837152d128d00ece72520a90baa924d07cc76311f151f4f2ab05d4e9f`，只标识这次公开观察内容。

回执明确 `registry_admitted=false`、`credentials_created=false`、`task_authorized=false`、`provider_mutated=false`、`temporary_control_pod_removed=true`。它补齐 key 参数观察，不能填造 identity_hash、opaque registry_version 或用途授权，更不能关闭上述代码缺口。A 交接同时转述用户确认 B frozen capture context 与最终 writer 尚未交付；本聊天未新增业务授权或假定其已实现。

### 后续 JWT trust 读回（c173fda4）

已读取 [a-site-kek-jwt-trust-readback-20261029.json](evidence/a-site-kek-jwt-trust-readback-20261029.json)，来源标记为 `operator_returned_stdout`，不是本聊天独立远程采集。回执固定：

- status：`jwt_trust_readback_verified`。
- mount：`sbk-kek-jwt-32cefa6049533b732d3a099f1993330eac961d5bb8960766429647ed9bb757b3`。
- config **readback** SHA-256：`595ab8034b889490a055b56094ffdd1d71ace5a188d10fa77eab19d3deb89244`；不可用名称中的 request SHA 替代。
- `mount_exists=true`、`config_exists=true`、`temporary_control_pod_removed=true`。
- `provider_mutated=false`、`roles_created=false`、`credentials_created=false`、`task_authorized=false`。

据此，JWT trust 的公开读回材料已有准确引用，不再列为缺失。原安装 KEK registry 准入、精确用途 policy/role/permit、当前与历史恢复授权、三用途业务 `ResolveSigning`、B frozen capture context 和最终 writer 的缺项保持不变。未修改原 C bundle。

## 2. 三用途原业务授权与当前 resolver：仍缺生产实现/材料

本次搜索 `backend` 非测试 Go 源码的 `ResolveSigning(`，仅找到接口声明和 `CredentialTransitSigner` 的调用；具体实现命中位于 [transit_signing_credentials_test.go](../backend/internal/systembackupsecurity/transit_signing_credentials_test.go) 的测试 resolver。该结论限定为当前仓库源码，不声称其他仓库或未挂载部署系统不存在实现。

| purpose | 必须提供的原业务事实 | 责任与现有接点 |
|---|---|---|
| capture_certificate | 原安装/task/attempt/fence、完整 capture Job/检查点/staging 集、冻结 context、完成时间和期限，与准确 unsigned payload/input 的关系 | B 提供 capture 来源；D 提供原任务/Job 事实；C 固定 wire；经当前 `ResolveSigning` 授权后由 A signer 执行 |
| acceptance_record | 原 manifest/marker/checksum、同 attempt 清理证据、资格判断与 config version、当前任务允许发布的事实 | D 组合原事务/清理/资格事实，C 提供已冻结 artifact 引用；缺真实业务 resolver，不能凭 payload.local_acceptance 自报放行 |
| catalog_record | registration 的有效 acceptance 与不可变 artifact 引用，或 tombstone 的原 registration/prune/删除证据；原 action identity、当前 append 权限及冲突判等 | C 提供 catalog/provider 事实，D 提供发布/prune 原事务；缺真实业务 resolver，不能凭调用方 purpose/hash 直接签名 |

三用途共同缺项还包括：分别独立的正式 key/public key、opaque registry→provider numeric version 映射、工作身份/权限、签名有效窗口与当前撤销来源、全部仍引用历史版本。复用 A 原 `TransitSigningCredentials` 接口及 signer，不新增执行授权、不替换现有任务 authority。C 向量中的公钥/版本只用于 conformance。

## 核对与后续接线

已检查 A 文档、KMS Config/resolver、worker 构造、签名 resolver 声明/实现命中、部署示例和候选材料说明。仅新增本补充文档，无运行代码变更，不重复运行既有 crypto 测试，也未生成构建产物。原 C bundle 清单仍用于校验 16 个固定文件；本补充是后续来源状态，不进入旧 bundle 或改写其原验收结论。

接线前由上述 owner 交付原受控材料后，再核验完整 binding、业务事实、当前 resolver 和历史引用。B frozen capture context / 最终 writer 未交付期间，不把已有 functional staging 的 config hash、Lease.DEK 或测试 authority 替代为正式来源。
