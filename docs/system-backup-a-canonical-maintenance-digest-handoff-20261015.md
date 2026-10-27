# A → D：离线 canonical 维护主体与请求摘要

日期：2026-10-15。补充 [A 写入/回填合同](system-backup-a-config-canonical-write-handoff-20261014.md)和 [D 082 维护收据提案](system-backup-d-config-maintenance-receipt-review-20261015.md)中尚未细化的摘要格式。A 接收范围为 `accepted_format_for_d_implementation`：只确定摘要表示和幂等身份，不批准运行 grant/issuer、原文来源、row fingerprint 算法、SQL 提升或真实回填。

规范以[机器合同](evidence/a-config-canonical-maintenance-digest-contract-20261015.json)为准；[六项合成向量](evidence/a-config-canonical-maintenance-digest-vectors-20261015.json)包含准确 JCS 字符串与预期 SHA-256。初次格式交付时未运行 Go；下方实现增量现已通过六项 Go parity。它们始终不含真实原文或授权，也不能作为运行权限边界使用。

后续[行指纹与来源摘要交付](system-backup-a-config-backfill-identity-handoff-20261015.md)已补两个独立算法及 Go 实现。完整 DDL 审查纠正了先前错误的“SQL 字符预算”结论：066 实际要求 UTF-8 字节上界并拒绝非 NULL 空原因；另补 DECIMAL(4,2) 的准确固定小数位。[合同修订 2](evidence/a-config-backfill-identity-contract-20261015-r2.json)与[r4 限定接收](evidence/a-config-backfill-identity-review-20261015-r4.json)确认七项独立 Node/Go 向量、四项 Node 检查、字节溢出反例及冻结 security/config 216/1,412（1,628 项）检查通过，准确产物清理。本页原合同/六项向量及原错误回执不改写，旧 SQL 有效性结论撤回；实际来源认证协议、原文、维护运行授权、writer/收据及正式迁移继续分别验收。

## 三种摘要与作用域

统一算法为准确 UTF-8 JCS 的小写 SHA-256。对象使用固定 ASCII 字段名；不做大小写、URI、空白或 Unicode 归一化；无效 UTF-8、未配对 surrogate、未知/缺失字段和非安全整数必须拒绝。

| 摘要 | 输入 | 约束 |
| --- | --- | --- |
| maintenance actor | domain + 独立认证的稳定 logical issuer/subject | 不使用显示名、角色、session、证书/key 指纹或版本；轮换不能开出新 actor/key 作用域 |
| grant identity | domain + 受审 grant issuer + 稳定 issuer-assigned grant_id | grant version 单独进入请求摘要；同 identity/version 只对应一份不可变、完整认证的 grant |
| backfill request | domain + target + installation + actor digest + action + grant identity/version + version/hash/size + row/provenance/schema/catalog/migration digests + reason | 绑定的是完整原请求事实，不能用 transport/session 更新改写旧请求身份 |

三个 domain 分别为：

- `clawmanager.system-backup.config-canonical-maintenance-actor.v1`
- `clawmanager.system-backup.config-canonical-maintenance-grant.v1`
- `clawmanager.system-backup.config-canonical-backfill-request.v1`

issuer 是经过认证映射的稳定逻辑 authority ID，不能直接用会随轮换变化的 signing key 或 CA 证书指纹。subject 必须是稳定、不可重新分配给另一人的 principal ID，不是共享角色名或可变显示名。Actor 摘要不带 target/action/key，因为这些另行组成唯一作用域；请求摘要仍重复绑定准确 target、installation、actor 和固定 action。

请求摘要的 idempotency key 不进入正文哈希，必须由授权与唯一作用域单独绑定。唯一作用域保持 D 提案中的 server UUID/database、installation、actor digest、action、key；不能加入 grant version 或 session 来让同一 key 再次执行。更新 grant identity/version 会改变请求摘要，同 scope/key 因而应冲突。重放/未知提交观察保留原请求事实，并要求独立的当前观察授权；本交付没有批准观察 grant 或结果读取的 wire profile。

actor v1 派生方式必须随 installation 生命周期的防重放记录保持稳定。未来更改 issuer/principal 映射、摘要 domain 或 schema/profile 时，须评审迁移并保留既有作用域与 key，不能重新哈希成一个空命名空间。receipt schema v1 必须明确选择本 v1 规则，不能用后续算法重新解释已存 hash。

## D 可以据此实现的内容

1. 为三种摘要实现严格的、无授权副作用的计算器，逐字节匹配六项向量；摘要仅是标识，不生成 VerifiedGrant 或可执行权限。
2. 写入 actor digest 前，从独立认证结果取 issuer/subject；写入 grant digest/version 前，验证完整不可变 grant、purpose、target、actor、key、时间和当前撤销状态。不得信任客户端提交的 digest。
3. 将原文、完整锁定 row fingerprint、provenance 与 schema/catalog/migration pins 分别独立核准，再把已核准值纳入请求摘要。64 位十六进制形状不证明这些事实。
4. 对同 key/grant 更新冲突、session/key 轮换不重开作用域、跨 target/installation/actor/action、缺失/未知字段和旧 profile 重放做实际实现 parity/负测。

082 的 digest/唯一键字段可承载此格式，但本轮不批准该表正式化。installation 生命周期保留完整 receipt/audit 锚点会影响现有 audit GC 和容量，仍须审查；ownership/schema-only inventory/catalog、约束/并发/回滚/未知提交的真实 MySQL 也仍待完成。

上述初次格式交付未编译或执行 SSH/SQL；下方 Go 增量也未安装依赖、执行远端/SQL、签发运行写授权或交付旧 canonical 原文。缺少实际 grant、原文或经评审的 writer 时继续拒绝真实回填，旧行保持 NULL/读取 503。

## Go 实现增量（本地格式 parity 已通过）

新增 [canonical_maintenance_hash.go](../backend/internal/systembackupsecurity/canonical_maintenance_hash.go)：`ConfigMaintenanceActorSHA256`、`ConfigMaintenanceGrantIdentitySHA256` 和 `CanonicalConfigMaintenanceRequest` 实现上述 v1 格式，不生成 grant 或写入数据库。请求仅接收准确 17 个字段，保留字符串原字节语义、规范化合法整数为 JCS；拒绝未知/缺失/重复字段、非法 UTF-8/surrogate、摘要大小写、目标/版本格式、超预算文本和非安全整数。沿用已有带长度/指数工作量边界的数值 parser，避免为未受信数字分配无界大整数。

[Go 回归](../backend/internal/systembackupsecurity/canonical_maintenance_hash_a_test.go)逐项比对原六项合成向量，并覆盖 Unicode/字节预算、稳定身份不被 trim、额外 proof/key、目标格式、数值和重复字段负测。共用[配置响应 r2 固定输入](evidence/a-config-response-content-source-20261015-r2.json)及[原始输出](evidence/a-config-response-content-local-20261015-r2.txt)：摘要定向 3 主测试/25 子用例通过，已包含在合计定向 9/58 与完整 security/evidence/producer 三包 396/2,526（2,922 项）中，不另重复累计。默认 vet、退出 0，无工具重试，准确源码和缓存目录已删除并独立确认，见[验收记录](evidence/a-config-response-content-review-20261015.json)。

原格式合同、六项向量及原写入合同 SHA 均与初签匹配，066 原字节也已核对不变。原向量中的 `runtime_parity=false` 保留其格式交付时的历史状态，新的 Go parity 结论由本增量记录承接。运行授权、原文/provenance/row fingerprint 审核、独立 writer/收据及正式 082 提升仍未交付；本轮没有取得真实回填权限。

## 只读原文验证边界补强

最新 [A 完整回填事务候选](system-backup-a-config-backfill-service-handoff-20261015.md)已完成授权/容量/审计/NULL-only CAS/收据/final guard 与独立观察的本地编排验证：r2 完整 1,797 项检查和六项有效撤保护反例通过，准确产物已清理。另 [纯收据存储真实 MySQL](evidence/a-maintenance-receipt-mysql-accepted-sbk-mig-261015074138-2f70.json)的 7 个场景/9 个约束子项已接收，无需重跑。两者范围不同：新事务实际 SQL、具体维护主体及运行 grant/原归档/物理容量适配、正式 081/082 和生产启用仍待完成。

后续 [A 维护收据复查](system-backup-a-maintenance-receipt-review-20261015.md)已接收 D 私有存储组件的审计时间绑定修订：首次 intent/result 的 SQL 时间固定在快照中，暂存后重载与最终 recheck 拒绝仍保持合法顺序的时间替换。完整 security/config 1,735 项检查与八项撤保护反例通过，准确产物已清理；这是存储组件的限定接收，完整回填事务、真实 082 MySQL、运行授权和原 canonical 材料仍未完成。

[后续原文验证增量](system-backup-a-config-backfill-source-boundary-20261015.md)已把调用方原文字节在全部验证/回调之前冻结，并拒绝只读 COMMIT 回调期间取消后释放回执。1,202 项固定输入下，新增 2/11 及完整读取包 52/217（269 项）通过，默认 vet、退出 0、准确产物清理已独立确认。该项补足原文匹配 helper 的内存/取消边界，不验证 provenance、row fingerprint 或实际维护授权，也不执行 writer/回填。
