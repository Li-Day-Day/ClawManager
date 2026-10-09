# A 合同返工交付（2026-09-23）

状态：**D 已完成复审，原 D-A-01～06 在本地合同/校验边界关闭；新增 R1/R2 的第二轮修订待复核，v12 保持 draft。** 本文保留对 [D→A 原评审](system-backup-d-a-contract-review-2026-09-23.md)的首轮返工说明；最新情况见 [D 复审](system-backup-d-a-contract-rereview-2026-09-23.md)与 [A 第二轮修订](system-backup-a-rereview-revision-2026-09-23.md)。不改写原评审快照，也不代替其他 owner 签收。

## 1. 六项返工与验收

| 编号 | 本次交付 | 本地证据与后续边界 |
| --- | --- | --- |
| D-A-01 | `CanonicalPayload` 对固定 ASCII 字段名及 string/null/string-array payload 实现受限 JCS 编码。控制字符按 JCS 转义，`<>&`、U+2028/U+2029 和合法 Unicode 保持原字节；拒绝无效 UTF-8。 | 三份 Node 生成、Go 验证的字节和真实 Ed25519/JWS 签名向量覆盖特殊字符、字面反斜杠、控制字符及 Unicode。篡改 payload/header/signature/key/version/purpose 均拒绝。不是任意数值/对象的通用 JCS 库。 |
| D-A-02 | `VerifyConfig.RequiredNonceHMACKeyVersions` 独立于已解析 material map；缺失、空值、重复或额外版本均拒绝，不返回部分候选。增加 trusted issuer method/ACR/AMR allowlist 校验。 | D 必须从持久化 config history 与 retention 内 ledger 版本的并集构造完整清单，含 active version；在 mutation/audit/nonce 同一事务中锁定或重验该快照并逐候选查重。A 无法从一个已被调用者删减的清单推断遗漏版本；真实 registry/ledger 接入仍由 D 完成。 |
| D-A-03 | Provider proof 要求 `expires_at > now` 且 `expires_at <= issued_at + maxAge`。clock skew 只容忍签发时刻轻微超前，不延长有效期。Strong-auth expiry 同样不再被 skew 延长。 | 已过期但在 skew 内、expiry 恰等于 now、lifetime 超上限均拒绝；恰等于 maxAge 允许。D 登记事务必须使用数据库时间再次核验。 |
| D-A-04 | `ProviderProofError` 只返回 `validation_failed/signature_invalid/checksum_mismatch/version_conflict`；复制可信类型码，丢弃原始 adapter error 及 unwrap 链，未知错误映射为签名失败。 | 包装的合成私有错误及未知类型码不会出现在返回文本/原因链。Schema/issuer/expiry 为 validation，密码学失败为 signature，已验签绑定不符为 checksum，权威 row version 漂移为 version。后两类的事实比较依赖真实 adapter/D 事务。 |
| D-A-05 | Schema 与 Go 同时使用既有公共 ID 的 lowercase prefix+UUID 规则；identity/version 上限按 Unicode 字符计数；闭合 target/proof/state 组合、external-action 的非空 action hash、base64 形状及 decoded size。 | 50 份共同 fixture 覆盖 27 种组合、长度、ID、时间和 8 KiB 边界。Schema 的 `contentEncoding` 只是注解，时间关系及 decoded byte 限制由 runtime 强制；fixture 明确区分 schema/runtime 结果。Go 入口接收 typed struct；HTTP 层仍须拒绝未知/缺少 JSON 字段，不能直接把普通 `json.Unmarshal` 当作完整 wire schema 验证。 |
| D-A-06 | `external_secret/kubernetes_secret` 新增明确的 `strong_auth_nonce_hmac` 用途及 exact-version 语义；补 Secret KEK、CA、catalog read/discovery、独立 delete ref。 | `a-secret-ref-vectors.json` 提供正负例及 forbidden-field 注入测试。nonce HMAC 固定 HMAC-SHA256；Secret KEK 仅 functional-test。版本 resolver 不能用 latest/default/current 回退；实际读取权限、历史保留和撤销待远程证明。 |

`Ed25519JWSVerifier` 是本地公钥 adapter，闭合 protected header 的 `alg/key_version/kid/purpose/typ`，并绑定 trusted key ID/version/purpose。当前只实现 EdDSA/JWS 这一 profile；ES256、COSE、真实发行方及其 key rotation 仍需各自经过评审的 adapter，不能用总是成功的 stub 冒充。签名向量只保存合成 payload、公开验签 key 和签名，临时生成的私钥没有落盘。

Provider issuer adapter 负责可信 issuer/installation audience、完整 signed target/envelope 与权威 identity/version/checksum/length 的一致性；不得从调用者字段直接决定信任哪个 issuer。D 在登记事务中核验 expected row version、DB time、nonce/audit 与不可变 evidence 登记。A 本地 envelope 校验不会自行登记 `sev_` 或改变 action/resource 结论。

## 2. Ref 与 capability 的交接映射

| 用途 | 合同分支 / 限制 |
| --- | --- |
| nonce-HMAC | `ExternalSecretRef` 或 `KubernetesSecretRef`，purpose=`strong_auth_nonce_hmac`；不可变版本，保留到最后引用 nonce 过 control retention。 |
| Secret KEK | 同上，purpose=`kek_wrap/kek_unwrap`；AES-256-KW，functional-test only。External KMS 的 generate/unwrap purpose 必须与 capability 一致。 |
| CA trust bootstrap | `CATrustRef`，purpose=`artifact_ca/catalog_ca/evidence_ca`；仅定位版本化公有 trust bundle。 |
| Catalog read / discovery | `catalog_credential` + `catalog_read/exact_read` 或 `catalog_discovery/snapshot_list|inventory_read`。 |
| 独立删除 | `artifact_delete` 或 `evidence_delete` + `exact_delete`；普通 read/write 与历史 `evidence_read_write` 不授予删除。 |

每个 credential ref 只表达一项 capability。D config 的历史引用必须指向这些 exact-version typed ref，C adapter 仍要证明实际 IAM 与声明一致。以上新增分支等待 B/C/D 复审。

`a-capability-role-mapping.json` 与 `capability.go` 规定：

- artifact/catalog/evidence 的 code 与 D 的三种 `ProviderCapabilityRecord` 完全同名；`reason_code` 映射到 `capability_reason_code`，保留原 `checked_at/expires_at`，接收时不得延长有效期。
- kms/secret/signing 是独立 spike 类别，不投影为上述 provider row，也不凭单项 supported 自动生成 healthy dependency。
- Schema 按 role 限定 code，并拒绝重复 code（即使其余字段不同）。Go 还校验身份/版本/scope、probe 时间、cleanup、有效期和状态/原因组合。
- `CapabilityPolicy.ValidUntil` 来自可信 credential/provider 有效期上限，`MaxValidity` 来自可信配置；每项 expiry 必须早于两者约束，过期或缺失不能视为 supported。调用方必须认证 probe 来源，D 用数据库时间复验、绑定真实 evidence 和 CAS/lease 后持久化。

## 3. 15 个对象 fixture

`a-owned-object-fixtures.json` 现有 45 份可执行向量，配套 `a-owned-object-fixture-policies.json` 与 `system-backup-a-object-fixture-model.mjs`：

- 每表空行、合成历史行及异常/失效化场景，附 normalizer/verifier ID、输入字段边界、明确预期行和 SHA-256。
- 引用重映射、quota 上限、角色/目标 scope、Secret ref 版本、内容脱敏、会话/挑战/alias 失效、Decimal 记账精度均有断言。
- 字段名按现有 migration 核对；未知字段、缺字段、超长值及缺少映射均拒绝。

这些是 **draft 合同的合成 projected-row 向量**，不是完整 SQL 行或真实 collector 输出。TEXT 的 fixture 上限仅限制测试样本；真实字段全覆盖、dump/restore adapter、业务约束和审计 cutoff 集成仍在 P0a。参考 evaluator 不读写数据库，不授权或执行恢复。目标 fixture 采用只读 scope/禁用凭据策略，真实安装必须提供自己的受审 target policy 和映射。

## 4. 本地验证

可复核的当前源文件指纹与本地结果保存在 [本地验收摘要](evidence/system-backup-a-local-revision-20260923.json)。这是 A 自测记录，非签名远程 evidence 或独立 owner 批准。

```powershell
powershell -NoProfile -File scripts/system-backup-a-local-validation.ps1
node scripts/system-backup-a-identity-readonly-probe.test.mjs
node scripts/system-backup-contract-check.mjs --check --strict
```

- A 本地验收脚本退出 **0**：16 个 A Go 顶层测试加 5 个未修改的 D 验收探针全部通过；Node 安全 4 项、对象 fixture 3 项、合同 artifact 70 项、合同 gate 6 项通过；inventory 和非 strict check 通过。
- 远程只读预检脚本的 Bash 语法与 7 个 kubectl mock 场景通过（2 个 Node 顶层测试）。Windows 沙箱内曾遇 `spawn EPERM` / Bash signal pipe error，随后通过批准的沙箱外**本地模拟测试**完成，未连接远程。
- `--check --strict` 退出 **1**，为真实冻结阻断：4 份公共合同、3 张 catalog 控制表 inventory、B/C 策略、交叉评审和已登记 schema evidence 仍未补齐。
- 没有安装依赖。Go 用 `GOPROXY=off/GOSUMDB=off/GOTOOLCHAIN=local/GO111MODULE=off` 的隔离目录运行，finally 确认 `A validation scratch removed: True`；无测试二进制或 cache 残留。上述向量、脚本和审阅摘要是交付源文件，不是测试构建产物。

测试中的 schema evaluator 仅支持 A 合同用到的关键词，遇到未支持的断言关键词即失败；它是无依赖测试工具，不作为完整 JSON Schema 库或生产 API admission validator。

后续 SSH transport 修正：针对操作者回传的 PASS 后尾部 CR/退出 127，停用 PowerShell 字符串管道，新增 Node UTF-8/LF 字节传输。5 项 transport 单元测试和 3 项 Bash mock 回归通过；详见 [补充验证记录](evidence/system-backup-a-identity-transport-validation-20260923.json)。08:11 的远程尝试保持失败历史；08:24 的重跑已退出 0，见 [成功预检记录](evidence/system-backup-a-identity-preflight-20260923T082454Z.json)。只关闭当前身份/active config 预检，不改变原本地验收快照或历史 candidate 的批准状态。

## 5. 下一步与暂停点

A 已完成 [D schema candidate 的本地安全审阅](system-backup-a-schema-candidate-review-2026-09-23.md)，结论仍是未批准候选。[远程验证手册第 0.1 节](system-backup-a-remote-validation.md) 的只读身份/active config 预检已经由操作者完成，退出 0；当前没有配置行/active installation。现在等待下述平台 provider 输入，不重复预检或主动启用配置；目标继续暂停，拿到输入后才能制定实际能力测试命令。

后续由 D/C/B 复审本次新版本；由平台提供 KMS provider 与版本化 ref、三类 signer 的独立版本化 ref、task-scoped 身份及专用 evidence bucket/prefix/TLS 和已有工具信息。不得提交密钥、token 或凭据值。没有这些输入，无法给出真实 provider 的可执行 capability 命令，更不能以本地 fixture 或业务 MinIO 代替。
