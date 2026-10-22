# D 下载组 GC 的 L1 审计引用与权限前置守卫

【2026-10-21 从生命周期结论推进到实际连接边界】[新连接归属回执](evidence/d-gc-connection-preparation-20261021.json)已接收 Collect 专属 `Conn.BeginTx(RR)` 及事务结束后的坏连接丢弃：新增三根/34，连同 publisher 夹具五根/50、冻结五完整包 775/6,581、合入后 GC/publisher 51/661、默认 vet、来源 postcheck 和准确产物清理通过。原六项模型发现中的 Tx-only 接线风险已在此局部实现中处理，旧回执继续绑定旧代码。grants/公共 registry.begin/原守卫与唯一 commit 均保持，当前没有取得 backup lock 或批准 BACKUP_ADMIN；首次池会话状态、有界真实释放及其错误结果、worker/global-lock 顺序、完整 policy 和十二类实际 MySQL 验证继续待交付。

回执同时保留 r1 publisher 的 `absence_expired_during_staging` 唯一失败叶子：原日志缺少阶段计数，未断言其确切历史失败位置。旧 150 ms 测试 proof 可能在进入 staging 前用尽，此时生产允许合法收敛为 write_unknown。最终测试先确认仍有效地进入 Source，再等待同一份原 expiry 到达，确认 STS 仍有效、原 expiry 未更新、无 PUT/finish；另补已在进入 staging 前过期的 proof 对照，核对不开正文/不 PUT并收敛 write_unknown。仅测试夹具变更，publisher 运行代码和过期规则未放宽。发布时另有四份审计文件并发变化，已独立列入[上下文](evidence/d-gc-connection-published-context-20261021.json)，不以冻结五包结果扩大背书。无依赖安装或远端执行。

【2026-10-21 freeze 接线前的连接生命周期结论】[Go 独立实验及源码复核](evidence/d-gc-freeze-session-accepted-20261021.json)完成六根/六项、默认 vet、无失败/跳过，核对 Go 1.26.1、缓存 mysql driver v1.9.0 与当前 collector/registry/权限输入，准确自有源码副本/cache/tmp/telemetry 已清理。仅保留模型源、日志与审查材料，未安装依赖、连接 MySQL 或修改运行代码；v2 观察包字节也复核未变。这六项验证 Go `database/sql` 在明确假驱动语义下的连接生命周期，不是 MySQL 全局锁或完整 GC 验收。

MySQL 8.4.8 的 backup-lock 实现使用 `BACKUP_LOCK/SHARED/MDL_EXPLICIT`；routine 的 create/drop/alter 通过对象锁路径请求冲突的 IX backup lock。因此它值得作为候选实际测试，不能因 routine 没有单独数据文件就认定其必然绕过 backup lock。view/table/trigger/event、账号和跨库 FK 的完整路径及实际等待仍需独立证明。[backup-lock 实现](https://github.com/mysql/mysql-server/blob/mysql-8.4.8/sql/sql_backup_lock.cc)、[对象名锁](https://github.com/mysql/mysql-server/blob/mysql-8.4.8/sql/lock.cc)、[routine 实现](https://github.com/mysql/mysql-server/blob/mysql-8.4.8/sql/sp.cc)。上游 tag/release commit 是来源线索，不是部署中 MySQL 二进制的字节证明。

当前 collector 的 `r.begin` 调用 `DB.BeginTx`，完成后不再持有那条物理连接。实验确认，在 session-duration lock 模型下，commit/rollback 后旧 `Tx` 不能执行 UNLOCK，而归还池的 session 仍可带锁；普通 `Conn.Close` 也会归还池。缓存 driver 的 `ResetSession` 只做存活/busy 检查，不能当成 server reset/解锁。专属 `Conn.BeginTx` 才能在提交后继续持有同一连接执行清理；`Conn.Raw` 返回 `driver.ErrBadConn` 的路径能让 Go 丢弃连接。取消事务及提交响应丢失分支也已验证，不能把可能已提交说成回滚成功。现有 collector 尚未执行 backup lock，这里识别的是接线风险，不是已发生的生产锁泄漏。

[候选约束与十二类实际验证条件](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)据此明确：不能只向 `Early` 增加一句 LOCK；须先设计 collector 对专属物理连接、单个 RR 事务、提交/回滚结果、同连接解锁/丢弃与批次停止的完整所有权边界。不能提前解锁、借 `DB.Exec` 猜同一 session，或用另一条可能先失效的连接替代提交期间的保护。当前 worker 全局权限只接受 REFERENCES，会拒绝 BACKUP_ADMIN；新 global capability、worker 准入与全局锁/原行锁顺序、池独占/临时表残留、session 设置和全局 DDL 影响均需评审。权限检查不放宽，不使用 root 回退。实际锁须以准确 connection/thread 对应的 P_S BACKUP LOCK granted/pending 行及释放后结果证明，不能把超时当锁证据；假驱动物理 close 也不证明真实 server 已释放锁。[锁生命周期](https://dev.mysql.com/doc/refman/8.4/en/lock-instance-for-backup.html)、[metadata_locks](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-metadata-locks-table.html)。完整来源 policy、期望摘要、实际 collector 和原六项继续未完成。

【2026-10-21 v2 视图 CREATE/event 来源本地准备】[新回执](evidence/d-gc-view-create-preparation-20261021.json)登记隔离与合入后各 **12 主/276 项**、默认 vet、无失败/跳过、源码复核与准确自有目录[清理](evidence/d-gc-view-create-cleanup-20261021.json)。本轮 1,463 输入 SHA `6a9d07eb33c79bcc3798e2dd0e843135cc91691e552a8d0b3f6bcd068711576b`；v1 回执保留原冻结范围，当前包使用 v2。相对基线仅修改本包两个既有文件、增加两个文件；A 并发增加的 journal 测试及两个修改另列，不受此包测试背书。首轮 Windows 文件占用导致未运行测试，第二轮仅内部 helper 测试漏带 deadline；原 exit 1/来源均保留，最终只修正测试 context，未改变生产条件。没有安装依赖或执行远端。

当前每轮先关闭 VIEWS 的目录结果集，再在同一观察连接上按每个准确 schema/name 执行 `SHOW CREATE VIEW`，对象名分别用反引号引用并将内部反引号加倍。返回必须恰为一行/一个结果集，名称和创建时字符集/排序规则须与先前目录行一致；缺行、多行、额外结果集、NULL/非 CREATE/非法 UTF-8、查询/扫描/关闭失败和取消均拒绝，不返回部分观察。完整原文只纳入独立 `ViewCreates` 摘要及 Combined，不公开正文；只改 ALGORITHM 而保持 INFORMATION_SCHEMA.VIEWS 不变的模型对照必须改变 Combined。`ORIGINATOR` 纳入 event 投影，要求 canonical uint32，变化也必须改变摘要。上述读取没有执行 CREATE、调用视图、改变权限或开启事务。[SHOW CREATE VIEW](https://dev.mysql.com/doc/refman/8.4/en/show-create-view.html)、[标识符引用规则](https://dev.mysql.com/doc/refman/8.4/en/identifiers.html)、[EVENTS 字段](https://dev.mysql.com/doc/refman/8.4/en/information-schema-events-table.html)。

固定目录仍为七种语句，完成一轮为九次固定读取加 N 次 SHOW（N 为本轮 view 数，最多 10,000）；最终 identity/grants 在全部 SHOW 之后复查，原五秒 context 上限不变。目录单格仍为 16 KiB，完整 CREATE 上限为 32 KiB，全部六域共用原 16 MiB 分帧总额；精确边界、累计预算、关闭旧结果集及 SQL 名称引用均有对照。这些约束不证明数据库扫描/查询次数能在实际规模下完成，也不限制驱动收到 SHOW 响应时的初始包分配；实际账号、packet 配置、SQL mode/输出形式与元数据变化/撤权/连接失效仍需 MySQL 正负例。当前没有解析程序依赖、批准期望摘要、实现完整 `Early` 或贯穿 collector 提交的 DDL freeze，原六项继续未完成。

【2026-10-21 程序元数据观察组件本地准备】新增独立 `systembackupgcmetadata` 包，仅依赖标准库。[独立回执](evidence/d-gc-program-observer-preparation-20261021.json)登记隔离副本与合入后各一次 **9 主/243 项**检查、默认 vet、无失败/跳过及前后源码复核；两个发布文件与已测字节一致。候选 1,460 输入 SHA `129f1378b6da482eeae0e21ffaa14a5e247d57b86a20a8c2f3158e78c891f79a`，相对原 1,458 输入副本仅增加两个文件。原四包回执之后的 A 并发变化单列，不受本包测试背书；本次没有新整轮四包通过声明。自有 source/cache/tmp/telemetry 已按准确标记与源码复核[清理](evidence/d-gc-program-observer-cleanup-20261021.json)，日志保留，未安装依赖或执行远端。

该组件在独立观察连接上读取 identity、当前 grants、trigger、routine、parameter、event、view，再复查 identity/grants，共七种固定语句、每轮九次查询。部署须另行审查并固定 server/database/非 root 账号、MySQL 8.4 版本和 grants 摘要；候选观察账号要求全局 SELECT、SHOW VIEW、SHOW_ROUTINE、TRIGGER、EVENT，当前角色 NONE，拒绝 schema 限权、额外权限、角色、proxy、GRANT OPTION、partial-revoke 语句及前后变化。TRIGGER/EVENT 本身含程序 DDL 权力，该账号不等于只读角色，不能借给 GC worker；本组件不发 GRANT，也没有批准现场账号。

五域按完整对象键排序、长度分帧，区分 SQL NULL/空值并保留 UTF-8 原字节；正文 NULL/空/超长、长度不符、重复/逆序、查询/扫描/关闭失败均返回统一错误和零观察值。routine 与参数同源交叉核对，函数 ordinal 0 的返回类型/字符集/精度必须匹配，后续 ordinal 连续。每域最多 10,000 行并有第 10,001 行探测，每格最多 16 KiB、五域累计分帧数据最多 16 MiB；原 context 不放宽，整轮最多五秒。这些是返回数据/本地处理界限，不是数据库扫描或锁量证明。摘要仅表示这轮观察：整行增删会改变摘要，仍需另行受审的期望摘要、完整性对照及依赖 policy，不能因 `Read` 成功就批准回收。

上述为 v1 的历史准备范围：当时 VIEWS 投影没有 `ALGORITHM`/`SHOW CREATE VIEW`，EVENTS 也未包含复制来源 `ORIGINATOR`；上方 v2 已补两处本地观察，实际 SQL 与投影之外的元数据仍未完成，不能标为完整程序来源。[MySQL VIEWS 字段](https://dev.mysql.com/doc/refman/8.4/en/information-schema-views-table.html)、[SHOW CREATE VIEW](https://dev.mysql.com/doc/refman/8.4/en/show-create-view.html)、[EVENTS 字段](https://dev.mysql.com/doc/refman/8.4/en/information-schema-events-table.html)。v1 的九次读取是顺序观察；v2 同样不提供原子目录、事务锁或 DDL freeze，不实现 `GCGuard`，未接生产 policy/路由/调度。实际 MySQL 的完整可见性正负例、观察连接撤权/失效、跨库程序变化、从观察贯穿 collector 写入和提交的 freeze 均待证明；下列原 `Early` 权限候选继续独立审查。

【2026-10-21 当前完整性审查】[来源与 schema-freeze 需求清单](evidence/d-download-gc-source-freeze-requirements-20261021.json)把本组件的四个实际指纹域与尚缺的 trigger/routine/parameter/event/view 观察逐项分开，准备九条只读采集规格、八类待实际验证的条件；没有运行 SQL、批准角色或实现完整 freeze。三张 catalog/import/scan 来源表仍缺正式 schema；11 条 evidence FK 声明仅为保留 envelope 的来源盘点，不能代替原组引用语义。下方 r73 是原历史本地接收，本组件仍不能独立作为完整 `Early`。

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

这项授权不等于 schema freeze。`LOCK TABLES` 会在加锁前隐式提交当前事务，而开始新事务会释放原显式表锁；不能把它直接插入现有 collector 的 RR 事务来补 freeze。若改为另一种事务/连接协议，必须独立证明原组、墓碑、容量仍为一次已知提交，不能沿用当前单事务验收。[MySQL 8.4 table-lock/transaction interaction](https://dev.mysql.com/doc/refman/8.4/en/lock-tables.html)

程序元数据必须独立证明完整可见性：trigger 需要其表上的 TRIGGER 权限；routine 的“能看到一行”和“正文完整可见”是两件事，只有 CREATE/ALTER ROUTINE 或 EXECUTE 等权限时正文可能为 NULL。参数/函数返回类型、视图定义、definer/security、SQL mode/字符集及 event 调度也不能只凭当前四个结构 hash 推断。缺权限、查询成功但漏行、NULL 正文、截断/超量、观察连接失效都应保留未就绪；不能给 worker 临时加 DDL/program 权限来掩盖来源不足。[TRIGGERS](https://dev.mysql.com/doc/refman/8.4/en/information-schema-triggers-table.html)、[ROUTINES](https://dev.mysql.com/doc/refman/8.4/en/information-schema-routines-table.html)、[PARAMETERS](https://dev.mysql.com/doc/refman/8.4/en/information-schema-parameters-table.html)、[VIEWS](https://dev.mysql.com/doc/refman/8.4/en/information-schema-views-table.html)。

元数据按权限过滤，因此仅能看到已授予 SELECT 的几张表不足以证明没有其他入站引用。本候选要求全局 REFERENCES 作为跨库 FK 元数据可见性的前提，不授予 CREATE/ALTER。由“一对象的某项权限可提供对应元数据可见性”推导出的这套具体角色仍待真实账号验证，不能据此在生产授予全局权限；受审的独立元数据观察/DDL-freeze 方案也可在完整 policy 中解决该问题。[MySQL 8.4 metadata privileges](https://dev.mysql.com/doc/refman/8.4/en/information-schema-introduction.html)

复核不能仅依赖旧连接还能执行某条 SQL。MySQL 的表/列、数据库级和静态全局权限变更具有不同生效时机；这里比较 SHOW GRANTS 的当前输出，真实持连接撤权和 pool/session 行为仍必须实测。[MySQL 8.4 privilege changes](https://dev.mysql.com/doc/refman/8.4/en/privilege-changes.html)

## 结构指纹与边界

固定 SQL 读取当前库 TABLES、COLUMNS、INDEXES，以及本库出站和所有库入站 FK；元数据不能提供动态 SQL 标识符。每条记录以字符串数组规范化，按字节排序，加 `clawmanager.download-gc.metadata.v1/<kind>` 域计算 hash。NULL default 与空字符串区分，不含索引 cardinality 等易变采样值。每类最多 10,000 行，单字段最多 16 KiB，总量最多 16 MiB。必需表必须为 InnoDB base table，082 状态固定；针对原组删除目标的跨库 FK 或 CASCADE/SET NULL 即便被重新固定 hash 也拒绝。

这些指纹不含触发器/存储程序的完整定义，也不锁住特权 DBA 的 DDL。因此完整 `Early` 仍须验证受审的独立 schema/trigger 观察和 DDL freeze，不能把本组件当成完整 schema 授权。后面的 L3/L4/L5 owner、artifact、全部直接/逻辑引用、hold/lease/grant 与物理容量策略也继续必需；本组件没有替它们制造放行结果。

新五根/52 项执行 collector 和实际前置守卫，但 grants、catalog、082 行和 SQL transport 均为模型；覆盖 L1/L2/L3 顺序、四种引用、提示替换、当前角色/权限和结构变更、危险 FK、晚写回滚与失败副本不复活；与原七根/73 合计十二根/125。准确来源、完整包、探针和清理范围见页首回执。尚无真实 GC 受限账号回执，未执行远端、安装依赖、批准正式 schema/grants 或启用生产 GC；原六项继续未完成。
