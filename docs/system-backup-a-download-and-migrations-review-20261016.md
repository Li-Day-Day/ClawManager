# A：敏感下载与 081/082 的独立评审

本页是 A 的具体候选与评审意见，不代签 D 的公共合同/正式迁移审批。用户已明确远测由操作者执行。未改正式迁移、未注册新下载路由、未提供可成功消费下载 nonce 的生产适配。

后续 [D 合同决定](system-backup-d-sensitive-download-admission-contract-20261016.md)已确认单阶段 GET、`evidence_download_admission`/`evidence`、同事务间接 claim 绑定、真实 audit ID、前置锁能力及一次准入重试语义。下文“D 需决定”的方案选择以该决定为准；正式共享 schema 评审和运行实现仍待完成。

本轮[机器评审记录](evidence/a-download-and-migrations-review-20261016.json)固定 11 份相关输入、正式 95 文件 catalog、ownership/schema 检查及现存 strict 阻断；运行材料的[仓库检索结果](evidence/a-maintenance-materials-audit-20261016.json)为暂无可用维护授权/原文交付。

后续 [D 已确认敏感下载语义](system-backup-d-sensitive-download-admission-contract-20261016.md)，A 已交付[共享 canonical 与非消费 proof 校验候选](system-backup-a-sensitive-download-candidate-20261016.md)，3,185 项本地检查通过。“待 D 选择”由该决议取代；原机器候选及其指纹保留为历史来源。生产所需锁前缀、实际 MFA/会话装配、审计 ID/收据与原子 nonce、共享迁移和交叉评审仍待完成。

## 敏感下载：解决 claim 的时序

当前 `http.go` 在 GET 的 registry 锁定事务内新建随机 claim，写 audit intent、claim CAS 后调用 `AuthorizeSensitiveDownload`。因此 proof 在前一请求签发时不知道此 claim。旧交接要求“签名前请求 hash 包含 claim”不能直接照搬实施；不能让客户端填写 claim，也不能先消费 nonce 再补绑定。

[机器候选](evidence/a-sensitive-download-admission-candidate-20261016.json)给出 A 建议：签名前 request hash 绑定当前认证主体/会话、installation、准确 evidence/不可变 manifest 和规范化 Range；GET 中生成的 claim 通过同事务不可变 admission receipt、其 operation ID 及 nonce 外键再绑定。签名请求不包含无法提前得知的 claim。若 D 要求 claim 必须直接在签名字节中，则需要先评审独立两阶段协议，当前 GET 适配不能冒充已满足。

A 建议采用新 `evidence_download_admission` operation、`evidence` target 与 `sev_` 目标约束。成功只表示 nonce、审计 intent、claim 和结果锚点原子准入；GET 的 200/206 和后续发送失败属于另一层结果。同 key 已准入后不重新发送；不同 hash 冲突，失败重试使用新的 proof/key 并重新通过当前权限。提交不明时不读取 provider、不返回明文，也不自动重发。

当前 `SQLPolicy.Audit` 没有返回实际审计 INSERT ID，066 的 operation/target 枚举与同步结果约束也不支持此类型。D 需落实准确审计 ID API、不可变原响应、所有历史 HMAC 版本下的唯一性、同安装目标关联及保留/物理容量。此候选不复用 config_update、maintenance receipt 或失败 response_sha256 来伪装下载准入。

除摘要中的 Range 起止外，必须绑定 `range_present`：无 Range 与显式完整 Range 虽字节相同，HTTP 状态分别可能为 200/206。实际 manifest、主体、session 和安装均由服务端加载；客户端不得声称 owner/ref/URI、manifest hash 或 request hash。签发和消费必须调用相同严格解析器，重复 Range 头保持拒绝。

## 081/082：A 接受候选边界，正式化仍待审批与安装证据

后续 [D 接收与正式化边界](system-backup-d-a-migration-review-20261016.md)已核对 A 固定的 11 份来源，并给出 ownership/备份策略/保留的对象决议候选；未登记正式批准。当前机器决议中既有 `system_backup_configs` 要求 A、B、C 交叉评审，批准列表为空。A/D 独立候选工作不能替代共享 schema 的 B/C 审批；D 的本次接收也未批准敏感下载新 operation。

本次复核的准确候选为：

| 对象 | 当前候选 | A 评审结论 |
| --- | --- | --- |
| 081 canonical 原文列 | `docs/system-backup-d-config-canonical-081-proposal-20261014.sql` | 可空 MEDIUMBLOB、准确长度/JSON CHECK，不回填旧行、不改发布的 066。SQL CHECK 不证明 JCS/hash/原文来源；实际 writer 全行/授权/来源验证仍必需。 |
| 082 维护收据 | `docs/system-backup-d-config-maintenance-082-proposal-20261015.sql` | 目标/主体/action/key 唯一作用域、config 与两个真实 audit 外键、原始脱敏响应/摘要及 installation 生命周期保留符合现有私有事务候选。仍不提供运行 grant 或维护授权历史库。 |

两份提案与 D 已接收七项服务的 22 份重点输入一致。纯收据存储、A 八项授权组合和 D 七项服务分别保留原冻结真实 MySQL 回执，不重复成功套件，也不把三个范围拼成统一运行成功。旧中断轮远端 scratch 未获证明，不由新轮清理替代。

当前 `--check` 的正式 catalog 已为 **95 文件**，摘要 `2e8c5a26d09b69cd4007f86c99d25aa386bd00e7c0c54e422af59a711cade237`；原成功服务轮为 94 文件。现有 `081/082` 只是 docs 提案，未进入 runner/catalog；A 未直接提升或改写其编号。对象盘点为 100 个对象、99 个迁移对象，仍缺三张计划 catalog 表；60 项策略已登记、40 项待交付、60 项交叉评审待完成。普通 check 通过不等于 strict 发布门禁关闭。

D 正式化须完成以下具体交付：

1. 对当前完整 catalog 与实际已安装 ledger 重新确认编号、文件集合和历史升级路径；不改旧 hash 或删除 ledger，不把只有 filename/applied_at 的 ledger 当已执行 SQL 原字节证明。
2. 将新列/收据表登记到 D 控制对象 ownership/inventory/schema-only 策略、schema registry 和交叉评审；新的真实 schema 证据必须对应正式对象集合。
3. 评审 installation 生命周期防重放记录和完整原响应/audit 的保留。082 的 RESTRICT 可阻止删除锚点，但不能单独证明审计正文不可变；实际运行账号、写权限、GC 与容量/备份恢复边界仍须确认。
4. 明确物理 row/index/audit 开销、现有分配和并发 reservation，接真实受审来源；payload 长度和测试容量替身不构成物理预留。
5. 使用正式文件与当轮源码做针对新增对象/升级路径的独立验收。旧 94 文件加候选 DDL 的通过回执不批准当前 95 文件安装升级，也不批准生产激活。

## 独立运行材料缺口

A 已补私有真实 JWT/SQL session holder 候选，校验 grant 回调前后的当前身份；它不替代独立签发和外部固定原字节 pin。下一步仍需确定可信 grant/holder 通道及不可变版本、当前撤销来源，提供准确旧 canonical 与经认证归档记录、安装实际 schema pin 和容量来源。缺少这些材料时保持无生产构造入口；不以填充合法 hash、初见即信任缓存或复制 grant 自称的主体作为认证。
