# A 签名与 KEK 接线依赖（2026-10-28）

## 本轮签名调用入口增量

新增 `systembackupsecurity.NewCredentialTransitSigner(binding, key, caPEM, credentials)`，实现现有 `ProofSigner`；复用原 Transit HTTP wire、固定公钥验签与禁止重定向的 transport。旧静态 token 构造入口保留兼容。本入口不创建 provider token、不定义签名 payload/framing，也未注册 production link。

`TransitSigningBinding` 明确区分原 registry `KeyVersion` 与 provider 规范数字 `ProviderVersion`，同时固定 installation、三个 artifact purpose 之一、key ID、endpoint 和 provider key 名。每次 `Sign` 在调用 resolver 前复制输入并计算 SHA-256；`ResolveSigning` 必须认证原工作身份、用途、资源、该次输入及当前权限，而不是仅比较这些字段。它返回原请求、独占 token 字节、原 not-before/expiry 和针对原 grant 的 `Recheck`，不得刷新授权或以新 grant 接续一次旧调用。resolver 和两次 Recheck 使用同一个最多 15 秒的有界 context；provider 调用还受原 credential 与 key 的最短到期时间约束。

签名前后执行当前授权复查并检查取消、期限与单调时钟下界，过期或撤销后不交付已生成的签名。token 仅进入调用内的 transport 副本，返回时清除独占字节 buffer；Go 的不可变 HTTP header 字符串不能保证即时物理擦除，本入口不作此承诺。resolver 错误统一脱敏。原始授权来源和 token 签发仍由独立部署 owner 提供；这项调用适配不实现 bootstrap Original、后台 ExecutionAuthorization 或 provider ACL。

定向验证入口：`scripts/system-backup-a-signing-credentials-validation.ps1`。冻结输入、原生测试、Linux 编译与清理的最终状态见本轮原始回执，不以本段文档代替通过证据。

本次沿用 v12 合同；现有签名历史、Transit signer 和 evidence Transit keyring 均不认证其输入来源或构造调用授权。新增 `ValidateTransitKeyRetention` 只比较 evidence 路由与完整引用扫描，尚未接入事务或 bootstrap，因此不代表生产就绪。

| 接点 | 精确缺项与责任 |
| --- | --- |
| capture | B 提供 capture_certificate 的原始 unsigned payload、JCS/domain/protected header、版本与调用身份；PR manifest purpose 不是 capture_certificate。A 需要 deployment authority 提供专用 signer ref 到 provider key/数字版本/公钥的可信绑定及签名权限、撤销和历史引用。 |
| acceptance | D 提供业务判定及 v12 acceptance payload；A 需要独立 signer、精确版本、公钥、调用权限和完整历史验签/撤销来源。验签不代替业务判定。 |
| catalog | C 提供 v12 catalog_record unsigned payload、JCS/domain/protected header 和调用范围；A 需要独立 signer 的可信映射、权限和完整历史引用。PR 的签名 framing 和 v12 JWS 不兼容。 |
| backup KEK | B/C 提供数据路径明确使用 generate、wrap、unwrap 的操作组合、envelope/ref/version 和 retained 引用扫描；部署方提供独立 provider、精确 key/version、工作身份、操作权限与撤销事实。不能把单个 SecretRef 或 evidence keyring 当作该组合。 |
| evidence KEK | C/D 提供完整 retained evidence KeyRef 扫描和事务内复查接点；部署方提供独立 provider/ref 到 Transit key/数字版本映射、wrap/unwrap 身份、权限及撤销。现有 keyring 消费已准入映射；新保留检查必须与可信扫描、配置变更事务绑定才能生效。 |

所有历史扫描须覆盖仍保留的记录并与变更事务建立并发保护；nil 代表扫描不可用。证据 KEK 的前后快照也须明确提供：nil 是不可用，非 nil 空切片才表示已知为空。相同 KeyRef 的 endpoint、provider key 名和数字版本变更按重绑定拒绝；这项保守规则不验证远端材料或 CA 的真实性，provider 迁移需另有受审合同。不得以 healthy、fixture、构造成功或 Secret KEK functional-test 权限代替生产授权，不使用 latest/default 回退。三用途公钥隔离与历史保留继续使用 `NewArtifactSigningKeyHistory` 和 `ValidateArtifactSigningRetention`。实际 provider 权限、材料及 B/C 合同未提供前不装配或声称通过准入。

证据表已有 `kek_identity_hash/kek_version`，但 [证据删除路径](../backend/internal/systembackupevidence/sql.go) 将状态改为 `deleted` 时不清除这两个字段；不能把所有非空引用等同于仍需解密的对象，也不能仅凭到期时间排除受保护、未完成或未知写入的引用。任务授权在 [task_authority_sql.go](../backend/internal/systembackupevidence/task_authority_sql.go) 锁定 installation/config 并核对当前 evidence KEK，但这不是全量历史扫描或与退休操作的并发保护。C/D 需给出覆盖范围、状态判定和锁顺序，使扫描与写入、GC 和配置变更共享同一权威事务边界。

## 接收合同的核对点

- 复核本地 `refs/remotes/origin/pr-1` 当前提交 `0a4bdc19a1ab8b979523d4c2161c9b08074a4f26`：相对先前核对的 `14768599f30846e9cfe22c121059ecf698e1b048`，`backend/internal/systembackup/recovery` 没有差异；`recovery/signature.go` 的 blob 均为 `08a1e4cc6309371e673d916c19887d7ed28bdbc5`，v12 `artifact-common.schema.json` 的 blob 均为 `ffd8e3ca04f0d1d332c9cf1632509d1cb7e73303`。因此先前发现的 framing/purpose 差异仍存在；此结论只针对本地 ref，不代表远程最新状态。
- [artifact-common](../contracts/system-backup/v12/artifact-common.schema.json) 当前仍是 draft：签名输入为 JCS protected header 与 JCS payload 的 JWS framing，三个用途固定。B/C 需逐字节提供样例及正负向量，并说明 header 的 `typ` 与原 domain 如何绑定；不能复用 PR 的 canonical 数组签名。
- [合同清单](../contracts/system-backup/v12/contract-manifest.json) 中 `recovery_catalog_records` 和 `catalog_scan_record` 均为 missing。C 须交付 registration/tombstone 的闭合正文、不可变引用及完整扫描语义，才能确定 catalog 历史签名引用来源。
- [SecretRef 解码](../backend/internal/systembackupbootstrapsecurity/reference.go) 把外部 KMS 的 `generate_data_key` 与 `unwrap_data_key` 分为两条 purpose，Secret 的 wrap/unwrap 是另一变体；B/C 需指定各操作与 envelope 的对应关系，部署方需分别给出受限授权，不能以一条引用覆盖全部操作。
- [evidence Transit](../backend/internal/systembackupevidence/transit.go) 明确要求独立 derived AES-256-GCM key、精确数字版本和按 operation 解析的短期授权。部署方需提供其真实映射和撤销来源；构造器不会证明 provider 权限或材料身份。
- 仓库已有具体下载路径：[download_deployment.go](../backend/cmd/system-backup-registration/download_deployment.go) 从受控部署文件组装历史 Transit 映射，[NewDownloadTransit](../backend/internal/systembackupevidence/download_transit.go) 使用按完整 KeyRef 路由、只允许 unwrap 的 keyring，借 SQL 下载授权及短期 JWT 在调用前后复查。该路径的存在不能证明部署文件含全部保留引用，亦不执行 `ValidateTransitKeyRetention` 或证明密钥退休安全；写入路径仍有独立的 task/system Transit 准备器及各自权限约束。
- 配置变更已有 [ConfigMutationResourceValidator](../backend/internal/systembackupsecurity/config_mutation_resolver.go)：各 reference 槽先在事务外 Prepare，随后在同一调用方事务内 Recheck，输入可取得当前与拟议 reference。五个安全槽应在各自权威实现中接到这些槽位；但通用接口没有给出完整历史扫描、受控 provider 映射或跨写入/GC 的锁协议，不能单靠调用本地保留函数补成权威检查。bootstrap 另有 [BootstrapCandidateAuthoritySession](../backend/internal/systembackupsecurity/config_bootstrap_candidates.go) 的 `LockReferences`/`Recheck` 接点，其具体原始 authority 也不能用健康 receipt 代替。
- 当前检出中，默认 [linkedOwnerAdapters](../backend/cmd/system-backup-bootstrap/main.go) 只注册 RBAC 和两个 issuer registry，并未注册五个签名/KEK reference；`NewPinnedConfigMutationResolver` 的调用目前仅见测试。不要把这两个通用装配入口当作五槽的已运行实现。部署专用 Go link 仍需接入经过认证的具体 owner 与完整 authority。
