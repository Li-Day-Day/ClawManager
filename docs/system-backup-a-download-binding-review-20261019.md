# A：下载内容绑定与原始期限的独立评审

本项承接 [D r60/r61 事务绑定交接](system-backup-d-download-admission-binding-20261016.md)。A 重新审查当前实现，并新增独立回归；旧 r60 包装脚本 exit 1 及 r61 独立来源复查的历史结论保持原样。整包结果只覆盖本轮冻结输入，不自动覆盖并行 D 后续新增的 schema、nonce 或运行时接线。

## 审查范围与结论

| 要求 | 当前实现与 A 结论 | 仍由外层事务保证的事实 |
| --- | --- | --- |
| 准确请求 | 用完整、已验证 Manifest 重新计算摘要，并比较 subject/session、installation/evidence、Range 及其存在位和原请求 canonical/hash；未接受客户端自报摘要 | 当前认证主体、证据归属、RBAC/owner 与 key 历史来源 |
| 原始审计锚点 | 绑定原 `*sql.Tx`、实际 INSERT ID、原 intent 正文和时间；构造和最终重查均读取同一原审计行 | 前置锁顺序、真实审计正文不可变权限和同安装关系 |
| 私有/公共内容 | claim/subject/session 只按闭集摘要投影，私有 receipt 与完整公共 Operation 分别编码；返回字节为副本 | 实际持久化、公共 SELECT 投影、原始字节/长度/摘要的提交前回读 |
| 最短原始期限 | 同时取 authority、session、claim、proof 签名、auth-time/max-age/skew、适用日志到期的最小值；SQL 微秒限制向下截断 | 配置/材料/容量原期限的真实来源和最终复查，不得以该 helper 自身充当权限 |
| 读取后时钟 | 审计读取后再次采样 SQL UTC；拒绝时钟回退、非 UTC、到期，以及失败后的对象复用 | 所有其余 callback/写入之后的最终 guard 和唯一提交点 |
| 事务生命周期 | 不 Begin/Commit、不写 nonce/operation/receipt、不访问 provider；取消、结束或跨事务使用失败关闭 | D 的完整 L0–L10、claim CAS、实际物理预留和全部效果原子回滚 |

本次静态审查未发现需要修改这两个候选组件生产逻辑的缺陷。结论仅限表示和绑定组件，不能把它们作为已提交准入能力。公开 Operation 的准入时刻取构造内容时的 SQL 采样；未来事务所有者仍须明确最终内容写入时点、持久回读与后续最终 guard，不能用早期构造对象替代最终提交编排。

## 新增 A 回归

- [security 独立期限测试](../backend/internal/systembackupsecurity/sensitive_download_deadline_a_test.go)：实际 Ed25519 签名入口，分别验证签名/认证年龄先到期、正偏差、允许的未来认证时刻、亚微秒边界及外部配置变化不能刷新原结果。
- [evidence 独立绑定测试](../backend/internal/systembackupevidence/download_admission_binding_a_test.go)：取消与审计回调内取消、nil/回滚事务、SQL 错误/缺行、会话/签名/authority 到期、失败后不可恢复；另用独立签名的日志请求验证日志原始保留期、缩短/延长及不合法时间。

共四个主测试、27 个子用例（31 项不同检查）。这些测试用实际签名和 scripted SQL transport；不证明 InnoDB 锁、FK、跨版本并发或本人 MFA。

## 当前验证记录

本轮 [完整原日志](evidence/a-download-binding-local-20261019-081645-26d3edaa.txt)与[冻结输入](evidence/a-download-binding-source-20261019-081645-26d3edaa.json)已由[机器评审记录](evidence/a-download-binding-review-20261019.json)独立核对：1,334 份输入，source `d2b98720f2c1c7c22578cb28ea9ef6c20c23e6fa4e96f55c72e9edcef0a89270`；security 242 主/1,637 子、evidence 208 主/1,363 子，共 **3,450 项不同检查通过**，无跳过。新增 A 四主/27 子（31 项）包含在总数中，不另加总。

默认 vet、离线/模块只读、隔离 telemetry、冻结源码及 D 原决议 postcheck、Go 与包装 exit 0 均通过。39 项独立核对通过，首轮/最终轮及 helper 测试的五条准确自有目录独立确认不存在。未再次执行已接收远程专项。

归档时 1,334 份旧输入中三份因并行工作改变：`download_admission_audit_test.go` 的 SQL transport 扩展、`sensitive_download_nonce_scope.go` 的后续修订、`sensitive_download_request.go` 的新增只读 accessors。准确漂移与原/current pin 单列在回执中；其余十二份重点输入仍匹配。新增 key-lock/SQL 和后续存储也不属于此冻结门禁。只接收上述原绑定/期限组件与明确测试范围，不将这次整包结果扩大为当前整个工作树或完整下载授权。

首轮 [08:15 源码捕获](evidence/a-download-binding-local-20261019-081536-548907d3.txt)发现并行修改，exit 1，未进入 Go；两条准确自有路径已报告删除。A 的现有下载门禁入口改为复用已有 `New-AConfigProofSourceSnapshot`，仅在构建前对准确源码漂移最多捕获三次，逐次删除不完整副本；不重试 Go 断言、源码 postcheck、SSH 或 SQL。[既有 helper 八项回归](evidence/a-download-binding-source-helper-20261019.txt)通过，只有捕获/下游替身，无实际构建或远测。

## 仍需交付

A 当前已有可复用的真实 SQL/文件适配入口：`JWTRegistrationAuthenticator.Authenticate` 从原始 HTTPS 请求取得 actor；`SQLLoginSessions.CheckConfigMutationSession` 在借用事务中核对 DB identity、当前 admin/credential、已登记 session、撤销和新的 SQL UTC（它本身不授予 config 或 download 权限）；`RegistrationFiles.RegistryBytes` 与 `AuthorizeEvidencePermissions` 使用锁定 config 的准确 RBAC pin；`RegistrationFiles.NonceKeys` 必须接本事务完整的持久历史版本集合，缺少任一历史身份/材料就拒绝。后续 D 可直接装配这些边界，不再复制一个只看 JWT 到期的弱 session checker。

MFA 签发仍需单独的准确下载签发入口与当前目标授权。现有 `VerifyConfigMutationAndIssue` 只能签 config 请求；provider 专用 `VerifyAndIssue` 的会话登记行为不能直接套给下载。不能让 HTTP 客户端提交任意 request/Manifest hash，也不能以当前非消费 proof verifier 或一个泛化签名方法冒充已完成签发接线。

1. D 提供准确事务的完整前置锁、当前授权和真实物理容量，以及 claim CAS、operation/私有 receipt/公共快照/nonce 的原子写入和最终 guard。新 nonce scope 即使通过本地检查，也只代表其声明的部分锁能力。
2. A 接真实 MFA 签发、当前 SQL 会话/凭据/撤销、受信 issuer/holder/grant 与材料历史；维护/历史原文继续按仓库原材料审计的缺口处理，不拼装合成授权。
3. D 追加 schema 完成同 installation 归属/FK、不可变权限、完整保留组及实际旧 ledger 升级评审；A 做安全交叉评审，保留既有 A/B/C 正式批准规则。任何新 docs SQL 提案都不继承本轮 Go 验收或正式迁移资格。
4. 取得真实输入后再安排新增范围的 MySQL 原子回滚、跨历史 HMAC 并发、未知提交、保留/容量与真实部署 E2E。远测由操作者执行，A 提供完整命令和验收标准；已通过旧专项不重复运行。

未安装依赖、未执行远程命令、未修改正式迁移/公共批准、未启用生产下载。构建缓存与源码副本在本轮结束后清理，日志/清单作为评审证据保留。

## 并行新增 schema 的单独检查

A 另检查了 D 本轮新增的 [下载 schema 提案](system-backup-d-download-admission-schema-proposal-20261019.sql)。其第 39 行 evidence 目标的正则缺少 `$'` 结尾，导致字符串未闭合；已只修正该行。原文件 SHA、原始缺陷行及修订后 SHA 见[独立静态回执](evidence/a-download-schema-review-20261019.json)。核对可从修订后内容重建原始字节；六个 ASCII ID 向量与单行字符串闭合检查通过，不是完整 SQL parser 或实际 MySQL 验证。

提案增加的 evidence installation 可空列、operation/evidence 与 nonce/operation 的同 installation 复合 FK 方向可继续评审；旧 NULL 行不得由收据自报归属或未经认证回填。不可变 receipt/audit 的真实权限、有效角色继承、实际保留组与 GC/物理容量、真实旧 ledger 上的 DDL/并发/回滚和正式 ownership/inventory/跨 owner 批准仍未完成。本轮不把该 SQL 提案加入正式迁移，也不从 Go 结果推导其执行成功。
