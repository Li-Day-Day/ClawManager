# A → D：canonical 配置写入与回填合同交接

日期：2026-10-14。A 已完成写入权限、strong-auth/nonce、幂等和审计要求的本地角色评审，状态为 `accepted_for_d_implementation`。D 可依据本交付实现和验证写入服务。评审者是本聊天的 Codex A 角色；本记录不是人工签名、具体安装的运行写授权或部署批准，公共 v12 合同仍为 draft。

2026-10-15 后续：[A 对 D mutation 候选的增量评审](system-backup-a-d-config-mutation-review-20261015.md)修订并验证了提交时效和 nonce 最终绑定两个阻断。合同内容未变，原签收指纹保留历史；其中 `strongauth.go` 的后续源码指纹由[新评审记录](evidence/a-config-mutation-final-guard-local-20261015.json)覆盖。该增量只接收固定副本的本地候选实现，不补发运行写授权、原文或正式迁移批准。

同日后续交付：[RBAC 比较候选评审](system-backup-a-config-rbac-review-20261015.md)与[维护主体/grant/request 摘要格式](system-backup-a-canonical-maintenance-digest-handoff-20261015.md)。后者补充 082 的派生规则及合成向量，仅批准格式供实现；原文、实际 grant、row/provenance 算法、真实数据库和迁移提升门禁均未由此关闭。

| 材料 | 当前交付 |
| --- | --- |
| A 写入/回填安全合同 | [机器合同](evidence/a-config-canonical-write-contract-20261014.json)，合同 ID `a-config-canonical-write-security.v1` |
| A 实现要求签收与输入指纹 | [评审记录](evidence/a-config-canonical-write-signoff-20261014.json)，13 项输入 pin |
| update/rollback 请求摘要样例 | [两项合成向量](evidence/a-config-canonical-request-vectors-20261014.json)，未验证 Go/runtime parity，不能用作历史原文 |
| 具体安装、版本和目标绑定的运行写授权 | 当前核对的仓库暂无，签发数量 0 |
| 旧配置原始 canonical 文件 | 当前核对的仓库暂无，已接收原文文件数量 0 |

合同 SHA-256：`58b48404e34fea5d6c754ecf91297d70084417696dfd6397d2cee642858c0f1d`。签收仅覆盖该指纹和记录中的输入版本；后续语义修改需重新评审。既有 [D 材料审计](evidence/system-backup-d-canonical-materials-audit-20261014.json)保留核对时的历史状态，本交付补上 A 实现合同，不补造原文或运行授权。

## 配置更新与回滚

普通写入要求 `system_backup.configure`；安全边界变更另外要求 `security_configure` 和有效 fresh MFA，降低保护另外要求 `destructive`、fresh MFA 和非空原因。服务端比较锁定的当前配置、拟写入配置及当前解析的 registry，不能信任客户端分类。RBAC、会话和撤销事实在写事务内及最终提交前重查，成功收据重放也要检查当前身份权限。

新 PUT 必须比较当前 active version，再追加版本；回滚重解析历史引用、执行相同安全检查，并追加带 `copied_from_version` 的新版本。准确 canonical 字节、hash、size 和所有展开列必须来自同一个已验证 ConfigValues 对象。不得直接激活历史行，或重置 first-enabled/监控历史。当前 `DecodeBootstrapConfig` 只允许 disabled bootstrap，D 需要完整 mutation decoder。

幂等作用域为 installation、actor type/id、endpoint 和 key。当前授权通过后先查已提交收据，同 hash 返回原始响应；不同 hash 返回 409。成功重放不重复消费 nonce、不重新执行旧 expected_version、不写新审计。摘要 profile、纳入/排除字段和两项示例见机器合同及向量；proof、session、request ID 和 key 不进入正文摘要，分别按合同绑定。提交结果未知时独立观测原 target/key/hash，不能盲目重写。

需要 strong-auth 的新操作使用现有 A Verify 和历史 nonce-HMAC key 集合。配置行、active CAS、容量、nonce、真实操作收据、审计 intent/result 在调用者拥有的同一事务内提交或回滚。审计 intent 返回真实插入 ID 供 nonce FK 使用，禁止 `MAX(id)`；脱敏审计不得包含完整 canonical、proof 或凭据。

## 旧行离线回填

回填必须有独立认证、purpose=`config_canonical_backfill` 的授权，绑定 server UUID/database、installation、准确 config version、原 hash/size、锁定行及展开列 fingerprint、原始文件来源、schema/catalog/migration pin、当前撤销/有效期、原因及 key。读取 scope、bootstrap admission 和 `VerifiedConfigBackfillSource` 的只读核对回执均不授予写权限。

真实写事务锁定原行，重新核对原始文件准确字节、canonical 形式、hash/size 和每个展开列；最终 guard 再检查授权、截止、来源 pin 和目标。只能把 `canonical_config_json` 从 NULL 写为准确原文，不改变旧 hash/size、版本、row_version、作者/时间/原因、启用状态或 active pointer。已有不同字节拒绝；相同字节可以在重新授权和核对后记录准确的 no-change 收据。

当前 migration 066 的 `config_update` 成功结果表示新配置版本，不能借用它标记旧行 backfill。D 须先评审和实现独立、持久化的维护收据及唯一约束，再实现回填。回填 intent/result、维护收据、容量和唯一一次写入同事务；审计或收据失败必须回滚。这份合同没有批准新 HTTP 回填入口。

原始文件交付至少需要可验证的来源登记：原文件准确字节、来源路径/对象版本及摘要、installation/config version、存量 canonical hash/size、展开列指纹、目标 server/database、审核的 schema/catalog pin，以及受信来源/审核记录。登记不能由示例、server fixture、候选 lab 包或展开列重建代替。2026-09-23 的零配置行盘点不证明当前环境没有旧行；本轮未查询现场。

## D 可以继续完成的工作

1. 分配并评审独立 canonical 正式迁移；保留已发布 066 字节，缺原文旧行保持 NULL，读取继续 503。
2. 实现完整 ConfigValues decoder、update/rollback 事务 writer 和 A 权限/MFA/nonce/审计适配，按合同接入当前撤销与最终 guard。
3. 设计并评审离线维护收据及 backfill writer；运行写授权和原文缺失时拒绝真实执行。
4. 验证合同列明的 10 类权限、并发幂等、nonce、回滚、来源漂移、撤权、审计失败和未知提交场景；合成向量需要实际实现 parity。

本轮仅核对文档、公共 policy/schema 与输入指纹；没有安装依赖、编译、SSH 或写入数据库，未产生测试构建产物。canonical 正式迁移、生产服务和真实历史回填仍未验收。
