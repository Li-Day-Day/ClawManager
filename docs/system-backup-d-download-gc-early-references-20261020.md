# D 下载组 GC 的 L1 审计引用与权限前置守卫

【r73 最终本地接收】[独立回执](evidence/d-download-gc-early-20261020-r73-review.json)核对 r72 定向 **12 根/125 项**、r73 security/evidence/read/producer 四完整包 **716 主/5,738 含子项**、默认 vet、无失败/跳过，producer 三 seed/22、脱离源码/22、Windows/Linux probe、Linux runner、两次来源 postcheck/最终退出 0。r73 固定 **1,437 输入** SHA `8bab0c41906a653a7e243e5dbdfdd71e5f9048ef9b26bd51543997acbf9dc5dc`，接收时当前完整输入集合与字节零漂移。[清理](evidence/d-download-gc-early-cleanup-20261020.json)确认两个准确自有快照及测试缓存三目录均不存在，另七份暂存草稿已移除，全部二进制清理；未安装依赖或执行远端。r72→r73 包含 D 的接口注释澄清及 A 并发 deployment 脚本变化，逐文件差异在回执列出；本轮不代替 A registration 主入口或 Node 部署脚本的独立验证/审批。全部新 GC 证据仍为模型 SQL/grants/catalog，实际受限 MySQL 角色与生产启用均未验收。

原 collector 在 L3 重建保留组之后才调用 owner/ref policy。候选 082 的 `system_backup_config_maintenance_receipts` 有两条指向 `audit_logs` 的 FK；A 的 `loadConfigMaintenanceReceipt` 明确维持 config → receipt 的锁定顺序。本候选增加单独的前置阶段，将这类引用安排在 L1 当前配置之后、L2 原 user FK 与 L3 原组/worker 之前；文中的“L1 引用”是本候选的阶段划分，不代表已有中央 registry 为 082 单独批准了该层级或已经证明全链无死锁。新 `DownloadRetentionGCPolicy.Early` 未提供、返回 nil/typed-nil 或核对失败均拒绝，不回落到旧单一 `Lock`。完整跨 owner 锁序还需要实际并发证明。

## 提示与原事实

collector 先用有界非锁定 JOIN 取得原 Operation 数字 ID、actor、intent/result audit ID。提示只选择早期引用范围，不构成删除权限；必须是不同的正审计 ID。取得 L3 原组后，重新核对 Operation、actor 和两条审计的全部提示值，任一变化回滚。原 user 仍须在 L2 存在；撤权不等于删除原审计关联。

`SQLDownloadGCEarlyReferences` 对两列各按审计 ID 升序锁两个准确范围，共四次 `SELECT ... FOR UPDATE`。任何收据引用任一审计就拒绝，查询不按 installation、配置版本或维护状态缩小，否则会漏掉外域或历史引用。空范围也锁住。墓碑和组删除前后重复同一已持锁范围的 current locking read，不改成较早 RR 快照的普通读；后续引用、grant 或结构变化令整组回滚，guard 的值复制也不能恢复已失败状态。

082 并未进入正式 95 文件 catalog，现有下载胶囊也不包含它。本组件要求部署显式固定 `MaintenanceReceipts=absent|installed`，没有自动默认。结构指纹必须与该状态一致，存在时还必须有对应 SELECT；缺表/权限不能当成空引用。此状态和所有 pin 来自受审部署，不能由 HTTP 请求提供。

## 专用权限候选

每次前置锁定与后续复核都在借入的同一个事务/连接读取 server/database、`CURRENT_USER()`、`CURRENT_ROLE()` 和不带 FOR 的 `SHOW GRANTS`，匹配准确账号与受审的已排序语句集合 hash。当前角色必须为 NONE，role/proxy/GRANT OPTION、额外数据库、全局业务数据权限和未知写权限拒绝。`SHOW GRANTS` 不带 FOR 会包含 mandatory roles；不应改为会省略它们的 `SHOW GRANTS FOR CURRENT_USER`。[MySQL 8.4 SHOW GRANTS](https://dev.mysql.com/doc/refman/8.4/en/show-grants.html)

写权限上限仅允许五张原组表的 DELETE（audit、Operation、nonce、准入和结果收据）、墓碑 INSERT、容量计账 UPDATE，以及相应 SELECT；不允许给只读 owner 添加 UPDATE，不允许 UPDATE/INSERT 原审计，不允许删除墓碑。原 user 只接受列级 `SELECT(id)`。哈希 pin 还必须收紧为现场实际所需集合，形状上限不等于最终最小角色已获批准。组件不生成或执行 GRANT，不创建用户、DDL 或连接，不提交事务。

当前候选显式要求数据库级 LOCK TABLES，以满足只读来源上现有 FOR UPDATE 的权限条件；它不执行 LOCK TABLES 语句，也不擅自改成另一种锁模式。MySQL 8.4 要求 SELECT 加 DELETE、LOCK TABLES 或 UPDATE 之一来执行 FOR UPDATE，最终角色仍需独立评审和实际受限账号正负验证。[MySQL 8.4 locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)

元数据按权限过滤，因此仅能看到已授予 SELECT 的几张表不足以证明没有其他入站引用。本候选要求全局 REFERENCES 作为跨库 FK 元数据可见性的前提，不授予 CREATE/ALTER。由“一对象的某项权限可提供对应元数据可见性”推导出的这套具体角色仍待真实账号验证，不能据此在生产授予全局权限；受审的独立元数据观察/DDL-freeze 方案也可在完整 policy 中解决该问题。[MySQL 8.4 metadata privileges](https://dev.mysql.com/doc/refman/8.4/en/information-schema-introduction.html)

复核不能仅依赖旧连接还能执行某条 SQL。MySQL 的表/列、数据库级和静态全局权限变更具有不同生效时机；这里比较 SHOW GRANTS 的当前输出，真实持连接撤权和 pool/session 行为仍必须实测。[MySQL 8.4 privilege changes](https://dev.mysql.com/doc/refman/8.4/en/privilege-changes.html)

## 结构指纹与边界

固定 SQL 读取当前库 TABLES、COLUMNS、INDEXES，以及本库出站和所有库入站 FK；元数据不能提供动态 SQL 标识符。每条记录以字符串数组规范化，按字节排序，加 `clawmanager.download-gc.metadata.v1/<kind>` 域计算 hash。NULL default 与空字符串区分，不含索引 cardinality 等易变采样值。每类最多 10,000 行，单字段最多 16 KiB，总量最多 16 MiB。必需表必须为 InnoDB base table，082 状态固定；针对原组删除目标的跨库 FK 或 CASCADE/SET NULL 即便被重新固定 hash 也拒绝。

这些指纹不含触发器/存储程序的完整定义，也不锁住特权 DBA 的 DDL。因此完整 `Early` 仍须验证受审的独立 schema/trigger 观察和 DDL freeze，不能把本组件当成完整 schema 授权。后面的 L3/L4/L5 owner、artifact、全部直接/逻辑引用、hold/lease/grant 与物理容量策略也继续必需；本组件没有替它们制造放行结果。

新五根/52 项执行 collector 和实际前置守卫，但 grants、catalog、082 行和 SQL transport 均为模型；覆盖 L1/L2/L3 顺序、四种引用、提示替换、当前角色/权限和结构变更、危险 FK、晚写回滚与失败副本不复活；与原七根/73 合计十二根/125。准确来源、完整包、探针和清理范围见页首回执。尚无真实 GC 受限账号回执，未执行远端、安装依赖、批准正式 schema/grants 或启用生产 GC；原六项继续未完成。
