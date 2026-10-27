# A：nonce 服务端接受时间与 SQL 时钟回退修复

A 在继续核对 MFA/正式 schema 的前置条件时，发现已发布 [nonce ledger 合同](../contracts/system-backup/v12/strong-auth-nonce-ledger.schema.json)与两个现有消费入口不一致。`authenticated_at` 明确定义为 **服务端接受 proof 的时间**；原 provider registration 和 config mutation 都把签名内的 `auth_time` 写入该列，并把它作为 SQL 消费时间的下界。

这产生三种可以通过实际 Ed25519 签名和 SQL transport 模型复现的问题：正常过去的认证时间被误记为本机接受时刻；允许时钟偏差内的未来 `auth_time` 被消费 SQL 误拒绝；SQL 消费时钟回退至验证前、但仍晚于旧 `auth_time` 时，下界检查会失效，两个入口的旧模型均可提交效果。

## 修订

- [provider registration](../backend/internal/systembackupsecurity/providerproof_transaction.go) 使用原事务的 SQL 验证采样 `now` 作为 `authenticated_at` 和消费时间下界。
- [config mutation](../backend/internal/systembackupsecurity/config_mutation_transaction.go) 使用写事务的原 `v.now`，不使用准备阶段/本机时间，也不在后续 callback 中刷新该时间。
- 原始签名的 `auth_time + max_age + skew` 仍限制消费年龄，原签名 expiry/retention 不变；最大年龄与偏差分开相加。已允许的未来认证时间继续经过原 verifier 的准确 skew 检查，越界仍在 nonce INSERT 之前拒绝。
- [下载 proof 的只读 `ProofAcceptedAt`](../backend/internal/systembackupsecurity/sensitive_download_deadline.go) 返回原验证时刻，供 D 未来 nonce 存储使用。零验证返回零时间；该字段不授予当前权限、不消费 nonce，也不是已提交能力。

没有更改已发布 075、nonce wire/DDL 或审批状态。原始 auth_time 仍参与验签和期限检查，不被篡改成服务器时间；ledger 的接受时间与 issuer 声明时间各按既有合同语义使用。

## 验证

[独立回归](../backend/internal/systembackupsecurity/nonce_acceptance_time_a_test.go)借用已有事务模型，只替换 SQL transport：读取实际 INSERT 参数，执行其中三个时间谓词及原 ledger 时间排序检查，保留原事务、原签名和所有写入/回滚断言。它不是实际 MySQL，也不声称证明 InnoDB/FK/driver 时间精度或本人 MFA。

修复前的 [冻结源码](evidence/a-nonce-time-baseline-source-20261019.json)及[原日志](evidence/a-nonce-time-baseline-20261019.txt)已复现两个入口各三个失败反例，exit 1；过偏差、原 expiry 和最大年龄到期的六个拒绝控制仍通过，原失败保持失败。该轮源码 postcheck 和两条准确自有路径清理通过。

修复后的[最终原日志](evidence/a-nonce-time-final-20261019.txt)、[最终输入](evidence/a-nonce-time-final-source-20261019.json)和[独立回执](evidence/a-nonce-acceptance-time-review-20261019.json)已核对通过。1,342 份冻结输入，source `0299074e4aeb018f678c1250b997a8c7b0e42f8f1e053a99fc6d818eec57f8e3`；完整 security 包 246 主/1,657 子（**1,903 项不同检查**），无跳过。新增三主/14 子（17 项）包含在总数内，覆盖两个入口的正常/未来/过偏差/回退/expiry/age 和下载结果原接受时间不可刷新。

44 项独立核对通过：原六个失败反例及拒绝控制、当前五份重点输入、未改的 075/nonce 合同/registry 批准/manifest、两轮 frozen postcheck、默认 vet、实际 Go/包装退出码和四条准确目录独立缺席齐全。未安装依赖、访问远端、关闭 vet 或重跑既有真实 SQL 专项。该结论限冻结的本地组件，不扩大为 D 后续新增存储或当前整个工作树的端到端接收。

## 仍未完成的目标

新增消费语义的[八项真实 MySQL 增量](system-backup-a-nonce-time-mysql-handoff-20261019.md)已完成，[40 项独立回执](evidence/a-nonce-time-mysql-accepted-sbk-mig-261019020511-4e94.json)固定操作者 09:45–10:06 新轮的 1,355 输入，八叶子/两组/root、95 文件迁移、实际载荷 pin、fixture/namespace/两端清理、postcheck 与 exit 0 齐全；121 份重点输入匹配，另两份 D 并行变动排除。该专项关闭，无需重跑，实际 SQL 时钟回退仍未注入。既有 provider、writer、proof 等成功专项保持其原冻结范围；A 没有发起 SSH、连接现场数据库或安装依赖。

下载 MFA 签发仍缺准确同事务的当前目标加载/授权来源。现有 config/provider 专用签发入口不能直接套给下载，当前未新增接受任意 Manifest/request hash 的签名 API。D 完整前置锁、原子 operation/receipt/nonce/claim 与真实容量、受审运行材料/旧 canonical、正式迁移和部署/E2E 均保留。

[当前 strict 审计](evidence/a-current-strict-gate-20261019.json)为 100 对象、60 个已记录策略、40 项策略待交付、60 项交叉评审待完成，四项公共 artifact missing，现场 schema hash 仍 pending，exit 1。该审计没有改 registry、替其他 owner 批准或晋升正式 schema。修复 nonce 实现并不关闭这些全局门禁。
