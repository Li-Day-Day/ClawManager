# A 对 D 事务组件与 issuer 候选输入的复审

> 后续状态（2026-09-28）：A 已独立复验原反例，A-D-REG-01/02 在当前本地组件范围关闭；新增 HTTP/MFA、bootstrap 与迁移边界见 [新版 A 复审](system-backup-a-d-activation-review-20260928.md)。下文保留 09-24 当时结论及失败证据，不表示当前仍复现。

2026-09-24，结论：**接收组件交付和候选输入；本轮复审要求修正，暂不批准 registry 解码器及完整登记链路验收。** 发现两项 P2，独立负测已复现。D 所述“事务组件已实现，真实 issuer 密钥、公钥及候选 registry 已准备”作为阶段性交付描述有依据，不能解释为 issuer 服务或 Admin API 已可用。

审阅对象：[D 交接](system-backup-d-provider-registration-20260924.md)、事务/registry 实现、issuer 准备脚本及归档结果。机器记录：[本轮复审证据](evidence/system-backup-a-d-registration-rereview-20260924.json)。本轮不修改生产实现、原始 D 证据或远程配置；下列复现使用合成畸形 registry，不改写真实候选文件。

## 需要 D 修正

### A-D-REG-01 / P2：大小写别名覆盖安全字段

位置：`backend/internal/systembackupsecurity/providerproof_registry.go:107`。

`decodePinnedRegistry` 的精确重复 key 检查与 `DisallowUnknownFields` 组合仍允许 Go 结构体字段的大小写别名。独立测试中，`"revoked":true,"Revoked":false` 被接受，最终撤销状态为 false；RBAC 中 `"role":"viewer","Role":"security_admin"` 也被接受，`PinnedRegistrationAuthority.Authorize` 返回成功。

触发前提是包含这些畸形字段的文件已通过配置 hash 固定；这不是普通请求能够任意替换 pinned registry 的证明，也没有证明当前候选文件被篡改。但 hash 只认证字节，不解决审核方与运行时对同一文件的不同解释，不能替代闭合字段校验。

D 应在结构体解码前，对三个 registry profile 的每层对象执行大小写敏感的精确字段集合校验；拒绝大小写别名、语义重复和未知字段。回归需覆盖 provider/strong-auth/RBAC，不能只测试完全相同的重复 key。

### A-D-REG-02 / P2：缺失或 null 的 revoked 被解释为未撤销

位置：`backend/internal/systembackupsecurity/providerproof_registry.go:31`，同类字段也存在于第 52 行。

撤销字段使用普通 bool，解码器没有检查必填性和 null。独立测试删除 provider key 的 `revoked`，或改为 `"revoked":null`，均被解码为 false 并通过 `DecodeProviderIssuerRegistry`。因此配置缺失撤销状态时仍会把 key 作为未撤销条目交给 verifier。这一缺陷独立于大小写别名，修正别名后仍需处理。

D 应为 provider/strong-auth key 强制显式、非 null 的布尔撤销状态，并为所有 profile 定义必填字段；可用 RawMessage 存在性/类型检查或明确的中间 DTO。只在校验完成后转换到运行时 bool。本轮动态复现覆盖 provider profile；strong-auth 的相同风险来自共享解码器和同形 bool 字段的源码检查。

## 接收的通过项与边界

| 项目 | A 结论 |
| --- | --- |
| 事务组件 | 已有真实 database/sql 事务边界：权限复查、已提交幂等重试、DB UTC 时间、历史 nonce 查重、A Prepare/Stage、operation/nonce/两条 audit 同事务写入；五个写点故障回滚及 commit unknown 处理的本地回归通过。未发现需要另列的新事务原子性缺陷；不等于生产适配器验收。 |
| 原有回归 | 独立复跑 41 个 Go 顶层测试（含此前 D→A 探针）和 18 个 Node 测试，全部通过。Node 多文件 `--test` 首次因 sandbox spawn EPERM 未启动测试，随后逐文件直接运行全部通过。 |
| issuer 候选输入 | 实际结果与当前四份准备脚本的规范化 SHA-256、既有 handoff、安装范围、key ref/version、公钥及清理标志一致；registry 原始字节与结果中的 registry_json 完全一致。实际候选还通过 Go 解码器正向测试；时间参数固定在候选信任窗口内，只检验格式兼容性。 |
| registry 固定值 | version=`d-issuer-d7f0a14ec84d78927620d25f`；SHA-256=`c1b76a352d37cee763235c645cf82ded5e4193cb66fb12614a83c4cb950ed4a8`；scope=`installation_sbk_provider_zh_7474d6e0b052`。候选保持 draft，未批准为 active config。 |
| 真实密钥准备 | 接受操作者退出 0、结果文件中 OpenBao key 创建/保留报告及公钥元数据。A 未重新连接远端、读取私钥或调用真实 issuer 签名；公钥文件存在不等于持钥签名服务已通过验收。snapshot fingerprint 是远程元数据指纹，不是公钥裸字节 hash。 |
| MySQL 5/5 | 接收 D 归档的 MySQL 8.4.8 隔离探针操作者结果，未独立重跑。当前三张真实表的 DDL 重建 hash 与归档 `1c1698e71f781d4f6e66589cc29565625a5e28d683e42da0da9a26c36ba0245e` 一致。远程退出码仍为 null；config/target/session/capacity 为 synthetic，不扩展为真实 HTTP 鉴权验收。 |
| 新增独立负测 | 1 个实际候选正向测试通过；2 个负测顶层测试失败，共 4 个违规接受场景：大小写撤销覆盖、null 撤销、缺失撤销和 RBAC 大小写角色覆盖。退出 1 是发现的复现结果，不计作验收通过。 |
| 清理 | 两个本地 Go runner 均报告专用源副本、cache 和临时构建目录已删除。未安装依赖、未新建远程测试资源；新增测试源码与复审报告是交付文件。 |

## 后续验收顺序

1. D 修正 A-D-REG-01/02，补齐三个 registry profile 的严格字段/必填/null 测试，然后交 A 复验。本轮负测应全部转为通过。
2. D 接通 HTTP、认证会话/目标可见性、可信目标映射、历史 nonce Secret 解析、共享容量、错误映射和失败请求审计；A/C/D 完成 draft profile 与目标映射评审。
3. 实现真实 provider 观察到固定签名 profile 的 issuer 服务，以及独立强认证 issuer；使用已交接 key 做签名互验。无需重复 create 当前 key，也不能把旧 lifecycle 证据补签后作为新观察。
4. 在授权的隔离环境验证真实 MySQL commit 断连、跨安装 HMAC 轮换并发及完整 API 链路，随后再评审配置激活和正式 evidence 登记。

本轮保持 `active_config_updated=false`、`attestation_service_ready=false`、`provider_capability_approved=false`。整体 capability 和发布门禁不变。

## 复现

在仓库根目录执行：

```powershell
& .\scripts\system-backup-a-d-registration-review.ps1
$LASTEXITCODE
```

入口仅复制源文件到随机专用目录，使用已有 Go、禁用模块下载，finally 校验路径后清理。当前预期退出 1；正确修正后预期退出 0。测试源在 `scripts/system-backup-a-d-registration-review/review_test.go`，不会加入 backend 默认测试集合。
