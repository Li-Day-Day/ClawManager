# A bootstrap 安全引用的 typed 接入规则

2026-10-22，状态：现有草案合同的解码实现与映射提案；真实资源准入未完成。使用现有 `contracts/system-backup/v12/secret-ref.schema.json`，没有新造授权文件格式，也没有改变该合同的 draft 状态。

本地限定验收已完成：[独立回执](evidence/a-bootstrap-reference-typed-accepted-20261022.json)核对三个完整包全部通过、现有 29 项 SecretRef 合同向量及新增负例通过、默认 vet、Linux 命令构建与 374 份选定当前输入匹配。原验证回执报告产物已清理；运行期间观察到的准确 owner 也独立确认不存在，原回执没有记录该 owner 字符串，此限制保留。没有联系实际 provider/MySQL，也未装配/批准任何新资源。历史复核使用 `node docs/evidence/a-bootstrap-reference-typed-review-20261022.mjs --check`，相关选定输入再变化时应拒绝，不覆盖新字节。

新增 `backend/internal/systembackupbootstrapsecurity/reference.go` 提供 `DecodeSecurityReference` 和不可变 `SecurityReference`。输入为受控解析器取得的原文件字节及**完整文件 SHA256**，不是 identity_hash、Secret 值摘要或 registry 投影摘要。解码只接受闭集 variant 的唯一字符串字段；验证八类 ref、每类 required/额外字段、准确版本、用途/角色/能力组合，以及签名算法/domain 字段的草案约束。重复键（含转义后的重复）、未知字段、嵌套凭据、NULL、尾随 JSON、坏 UTF-8、过大输入或摘要不符一律返回固定错误。无原始错误/标签输出，默认格式化和 JSON 序列化不会输出输入正文。

该实现不实现 `BootstrapResourceValidator`，也不写入 linkedOwnerAdapters。结构通过不能证明 description_redacted 真的已脱敏，更不能证明安装、ACL、TLS、资源存在或能力。调用方不得把解码后的原输入当公共日志；没有原始材料时保持缺项。

## ConfigValues 二十种 reference 的对应要求

`MatchesBootstrapPin` 只比对配置 identity_hash/version 和下表单一用途的元数据对应。这是供 owner 审核、资源 adapter 复用的候选规则，不是批准的安装映射，也不完成 Prepare/Recheck。它不从 ref 内容推导 identity_hash，不接受 HTTP 任意 locator，不生成凭据或 provider capability row。

| bootstrap purpose | 现有 SecretRef 的对应或仍缺的组合 |
| --- | --- |
| artifact_write | artifact_credential / artifact_write；exact_write 或 conditional_create 仍需 C 证明完整写入能力 |
| artifact_read | artifact_credential / artifact_read；exact_read 或 range_read，准确对象/版本由 C 认证 |
| artifact_delete | artifact_credential / artifact_delete / exact_delete，单独删除身份和 owner 业务门禁 |
| artifact_upload_issuer | 现有 SecretRef 没有 issuer 元数据/STS envelope 合同；单一 credential 不匹配 |
| artifact_ca | ca_bundle / artifact_ca；还需原 CA bytes/链/主机名/允许目标的真实检查 |
| evidence_store | store/root 是逻辑存储身份；现有 SecretRef 不能代替，单一 credential 不匹配 |
| evidence_write | evidence_credential / evidence_write；不能用 legacy evidence_read_write 代替 |
| evidence_read | evidence_credential / evidence_read，不能授予写删 |
| evidence_delete | evidence_credential / evidence_delete / exact_delete，不能由读写引用推断 |
| evidence_ca | ca_bundle / evidence_ca，与 artifact/catalog 的用途分开 |
| evidence_kek | 需 evidence 专用 KEK variant、wrap/unwrap 操作集合、历史版本与调用身份；单个 kek_unwrap 引用不能覆盖 |
| kek | 同上，backup 数据密钥用途另行绑定；external_kms_key data_key_generation 与 unwrap 并不自动证明 wrap 权限；Secret KEK 的 wrap/unwrap 仍按现有合同限制为 functional-test |
| capture_signing | signing_key / capture_certificate；domain/payload、真实签名与来源真实性由专用 adapter 验证 |
| acceptance_signing | signing_key / acceptance_record；不能复用 capture/catalog/issuer key |
| catalog_signing | signing_key / catalog_record，须 C 的准确 record/domain 及历史验证来源 |
| catalog_read | catalog_credential / catalog_read / exact_read |
| catalog_append | catalog_credential / catalog_append / append_record，追加不可变性仍需真实证明 |
| catalog_snapshot | catalog_credential / catalog_discovery；snapshot_list 与 inventory_read 不互相代替，必须绑定 C 选定模式和 manifest/version/checksum |
| nonce_hmac | external_secret 或 kubernetes_secret / strong_auth_nonce_hmac；准确安装/用途、32 字节原材料和全部保留历史版本仍须独立验证 |
| status_relay | 缺 relay 工作身份、mTLS、Job/attempt/replay 合同对应；不能拿 ca_bundle 或一个 Secret 代替 |

上述 15 个单用途对应会返回元数据匹配；其余 5 个（两种 KEK、store、upload issuer、relay）必须返回不匹配，等待完整组合/专用合同，不删掉这些原要求。nonce_hmac 等名称转换在此显式提出，非实现 owner 交叉评审和安装受控映射仍待接收。`MatchesBootstrapPin` 这个 bool 不得填入准入表冒充真实检查。

## 后续实际 adapter 的强制边界

解析器从部署受控、版本固定的映射读取精确资源；绑定 installation、provider、scope、namespace UID/Secret UID/resourceVersion/key/work identity。Prepare 在 SQL 锁之前执行真实读取、权限/TLS/SSRF/能力验证，捕获不可变且有期限的观察；Recheck 只用同一观察、本地可信撤销事实及调用方事务，不发网络请求、不提交事务。签名和 KEK 使用专用目的/版本，保留历史引用所需材料，不能用当前引用存在推断历史覆盖。

通用 broker 的 namespace/name:key 字符串 allowlist 和功能测试 JSON 缺这些身份/版本/用途事实，因此没有直接接入本轮实现。现场材料由用户确认为“未准备”；B/C 生产适配器仍未交付。当前 27 个缺项不由本次格式解码减少，正式资源批准、生产 main、真实 HTTP/MFA/provider 和完整恢复整链仍待完成。

## 本地验证

复用 `scripts/system-backup-a-bootstrap-security-validation.ps1`：冻结安全相关完整输入和新增文件集合，关闭依赖下载，运行 security/bootstrapsecurity/bootstrap 命令完整测试与默认 vet，再构建 Linux 命令，finally 清理本轮源码副本、缓存和二进制。新测试直接读取现有 `a-secret-ref-vectors.json`，并增加 wire 歧义、权限混淆、身份/版本漂移、不可变投影和输出保护。结果以本轮原始日志、准确源码清单、退出码及清理回执为准；此处不预填通过数。
