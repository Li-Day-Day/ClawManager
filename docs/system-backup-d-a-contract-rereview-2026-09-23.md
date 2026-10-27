# D 对 A 修订的复审（2026-09-23）

结论：**原 D-A-01～06 在本地合同/校验边界已解决；本轮仍为 changes_requested，v12 保持 draft。** 新增两项 P2 问题见下表，不能用 A 自测通过代替完整签收。

本次基于 [A 返工交付](system-backup-a-contract-revision-2026-09-23.md)独立检查当前源码、合同、向量和测试；保留[首轮报告](system-backup-d-a-contract-review-2026-09-23.md)与其 evidence 为历史快照。当前文件指纹和实际运行结果见[复审快照](evidence/system-backup-d-a-contract-rereview-20260923.json)。没有连接远程环境、安装依赖或修改 A 实现。

## 1. 本轮仍需修正

| 编号 | 级别 | 位置与已复现问题 | 修正及验收要求 |
| --- | --- | --- | --- |
| D-A-R1 | P2 | `strongauth.go:356–358` 对签名 `key_id/key_version` 使用 Go `len` 字节数，而公开 schema 的 `maxLength` 按 Unicode 字符数。100 个“界”的 key ID（300 bytes、100 characters）和50个“界”的版本（150 bytes、50 characters）均在 schema 上限内；真实 Ed25519 adapter 验签成功，外层 `Verify` 却返回 `strong_auth_invalid: strong-auth signature metadata is invalid`。合法 issuer 因命名字符集不同而无法完成强认证。 | A 对齐 schema/runtime 的字符集、UTF-8 与长度语义；若限定 ASCII，必须同时修改公开 schema/profile 并评审兼容性，不能只靠 Go 隐式拒绝。补有效 Unicode 边界、超过上限、无效 UTF-8 的完整验签路径测试。 |
| D-A-R2 | P2 | `capability.go:94–97` 和 `capability-evidence.schema.json:173–204` 只要求 supported↔none，仍接受 `unsupported + provider_unavailable/credential_unavailable/permission_denied/response_invalid`。主计划第9.1节（第447行）规定暂时 provider/credential/响应问题为 degraded，只有确定 API/版本不支持才为 unsupported；A 映射按原 status 交给 D，会把临时故障表达为确定不支持。 | A/C 明确合法 status/reason 组合并在 schema、Go、fixture 同步拒绝矛盾组合；D 的 `dependency-provider-capability.schema.json:124` 也存在相同宽松约束，需联动修订，不能只退给 A 或宣称 D 投影已兜底。两种状态都不能通过创建准入，因此本项不宣称存在 fail-open 或已发生生产误报。 |

R1 的 Node 探针只确认 wire schema 允许该 metadata，不冒充签名验证；Go 探针临时生成确定性的合成 Ed25519 key，先验证 adapter 成功，再验证外层入口应成功，私钥不落盘。R2 的 Go 探针先确认同一 observation 的 degraded 形式通过，再确认 unsupported 形式应被拒绝，排除因其他字段无效而产生的假失败。

## 2. 原六项返工逐项结论

| 原问题 | D 复审结果 | 保留的集成边界 |
| --- | --- | --- |
| D-A-01 JCS | 已解决。受限 string/null/string-array JCS 与 Node 字节向量一致，真实 Ed25519/JWS 正负测通过。 | 不是通用 JCS；新增 R1 是签名 metadata 的长度问题，不是原 payload 转义问题复发。 |
| D-A-02 历史 nonce key | 已解决。独立 required-version 清单与 material map 精确匹配，空/缺失/重复/额外版本拒绝且不返回部分候选；issuer method/ACR/AMR policy 已补。 | D 从持久化 config history 与 retention 内 ledger 构建包含 active 的完整清单，在 mutation/audit/nonce 同一事务锁定或重验、逐版本查重；本次不证明真实防重放事务已接入。 |
| D-A-03 proof 时间 | 已解决。过期或 expiry==now 拒绝，lifetime 不允许超过 maxAge；skew 不再延长 expiry 或最大 lifetime。 | D 登记事务仍须用 DB time 重验；本地 verifier 成功不等于提交时有效。 |
| D-A-04 adapter 错误 | 已解决。稳定四类失败码、包装错误复制为脱敏新类型，原文本与 unwrap 链不外泄。 | 真实 adapter 要认证 issuer/audience、signed target/envelope 和权威事实；本次 stub 只验证边界，不证明远程密码学与资源绑定。 |
| D-A-05 provider parity | 已解决原反例。public ID、256字符边界、target/proof/state 组合、action hash 与 base64/8 KiB 约束有50份共同向量。 | HTTP admission 仍需拒绝未知/缺少字段；typed Go struct 不是完整 wire validator。 |
| D-A-06 nonce typed ref | 已解决。external_secret/kubernetes_secret 均可表达 nonce-HMAC；29份 Secret ref 向量覆盖用途与负例，CA、catalog read/discovery、独立 delete 映射已提供。 | resolver 必须 exact-version、不能别名回退；历史保留、实际 IAM、B/C 交叉评审与真实 provider 能力仍待完成。 |

## 3. 对象 fixture 与 capability 交接

- A 的15个对象已补45份可执行 projected-row fixture、输入边界、normalizer/verifier ID、引用映射、规范化预期和 SHA-256。D 本地重跑通过，首轮“只有描述、没有可执行输入/预期”的缺口已解决。
- 此结论仅覆盖声明的合成投影。全 SQL 字段、真实 collector/dump/restore、审计 cutoff、业务约束与真实 target policy 留待 P0a；不能据此给15张表的完整实现或所有 cross-review 自动签收。
- capability role/code 映射已与 D 三种 provider row 对齐，重复 code、错误 role、身份/version/scope、时间、cleanup、TTL/可信有效期上限的已有负测通过；kms/secret/signing 未被自动投影为 provider row 或 healthy dependency。状态/原因闭集仍需 R2 修订。
- nonce-HMAC 历史快照、provider 登记的 CAS/DB time/nonce/audit、probe 来源认证及 evidence 注册属于 D 后续接入责任。真实 KMS、三类独立 signer、专用 evidence 资源尚未配置，不能用本地向量或业务 MinIO 关闭能力门禁。

## 4. 可复核命令与结果

运行位置：仓库根目录、本机 PowerShell。所有 Go 构建在唯一 scratch 中，关闭 module/proxy/sumdb/toolchain 下载，finally 校验目录归属后删除源码副本、Go cache 和测试产物。

```powershell
powershell -NoProfile -File scripts/system-backup-a-local-validation.ps1
powershell -NoProfile -File scripts/system-backup-d-a-revision-review.ps1
node scripts/system-backup-d-a-revision-schema.test.mjs
node scripts/system-backup-contract-check.mjs --check --strict
```

- A 原验收退出0：16个 A Go 顶层测试及5个原 D 探针通过；Node 安全4项、对象3项、SSH transport 5项、artifact 70项、gate 6项通过；inventory 与非 strict check 通过，`A validation scratch removed: True`。
- D 扩展 Go 验收退出1；最终使用 `-TestPattern '^TestDRevision'` 聚焦复核，2个顶层测试、6个叶级反例失败，均已通过各自正向对照。schema 探针1通过、1失败，退出1。`D review scratch removed: True`。首次 R1 探针继承了 ES256 标记导致正向对照失败，修正为 EdDSA 后重新验证；该首次失败不作为 R1 证据。要求 A 修正后全部退出0，不能把预期失败计为验收通过。
- strict check 退出1：仍有4份缺失合同、3张 catalog 控制表 inventory 缺口、39项策略待交、56项交叉评审待完成和 schema evidence 未注册；这些是独立冻结阻断，不是本轮新问题导致。

本轮不修改 `approved_reviewers`、`approved_cross_reviewers` 或冻结 gate；旧报告、A 自测与本次 D 复审各自保持独立。下一步先由 A 修 R1、A/C/D 协同闭合 R2，再按变更后的指纹复审；平台准备真实能力测试资源可独立推进。
