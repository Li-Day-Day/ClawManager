# 公共 C：在线适配与正式材料来源核对

2026-10-29，源码核对基线 `b14bf695`，同时读取其前置 `493040af` 的 A 交接。本记录补充 [C 字节合同](system-backup-c-crypto-contract-20261029.md)，不修改 `a7424ce1` 的 public-c-crypto.v1 bundle、原执行授权或 D 共享文件。范围为本地源码与已保存材料；未读取现场秘密、调用 provider、下发授权或复核现场状态。

结论：**在线 adapter 已有；两类所需正式材料在本次核对来源中仍未找到完整、已准入的可用来源。** 不能用 C synthetic 向量、候选 key、公开 JWT trust 或接口构造成功补齐。

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
- A 的 [在线交接](system-backup-a-online-kek-20261029.md)明确列出 registry owner / C 待交材料，公开 JWT trust prepared 文件仅提供认证信任准备，不提供 KEK 注册准入、task permit 或当前操作权限。

| 缺项 | 原责任与交付要求 |
|---|---|
| identity_hash、opaque registry_version、installation、provider key ID/name、独立 numeric version | registry owner / 部署 owner 提供原已准入记录及受控引用、版本、摘要；C 负责与 envelope 完整 binding 对照，不能从候选 key 名生成授权 |
| 当前 generate/unwrap 用途、期限、撤销来源 | 部署 owner 提供精确 policy/role 读回及原 permit/pin；D/B 提供原 Job/执行授权身份和撤销事实；A adapter 执行检查。provider token 撤销与 Job 已停止分别取证 |
| 历史读取映射及保留 | C/D 与恢复 owner 提供完整 retained request/envelope/ref/version/CA 映射、当前独立 recovery grant、引用扫描范围/水位及并发保护；历史 key 存在不是当前 unwrap 授权 |

因此当前没有可直接填入生产 `kms.Config` 并视为已准入的完整材料包。本次不创建、推断或签发这些记录。

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
