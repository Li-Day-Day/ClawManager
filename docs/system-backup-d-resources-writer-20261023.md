# D 资源恢复事务写入候选

【2026-10-26 外键十项实际限定接收】[D 机器回执](evidence/d-resources-writer-fk-actual-accepted-20261026.json)及[操作者原输出摘录](evidence/d-resources-writer-fk-operator-20261026-2a9906c3.txt)绑定 `sbk-mig-261026005733-6904` / UID `c95e7743-0206-4aa5-a2fb-b76f74757a07`，MySQL 8.4.8、96 份迁移。`CREATE TABLE LIKE` 基础夹具之后，探针重装并核对 migration-063 的 job_items/reports → jobs 两条声明外键与 canonical 库一致、CASCADE 与 checks=1；四种改挂、显式父子删除、服务器级联回滚、孤儿 1452、晚失败回滚、改挂后末次拒绝、插入父行后 UNIQUE 冲突回滚共十项全部通过。probe SHA `0019f127cc720316782e88759202e7a520f7056412e35a77d574fea18dfb6f14`、migration SHA `e95539bd4434f8720e95f21afae3bea66e4078b18ad36156f838572a03856ffb` 和 inputs SHA 与同轮准备回执及操作者输出一致。

原 step-0 日志第 404–407 行控制台编码损坏原样保留；122 份普通包/模块/合同输入与既有 `c5fe0b025c054ef4b239bc8cc6c71f81` 原生补证逐字节相同，显式复用其 71 根/843 条通过证据。没有修复原日志、冒称新跑 Go 或替换本轮远测。1,629 份冻结文件在接收时全部匹配；D 状态文档在本轮单独更新。seed 三根、四步 exit 0、准确本地 owner 缺席已核对；账号/数据库、同 UID namespace、远端 scratch 清理由日志确认，未独立查询远端。SSH `IO is still pending` 两条输出保留，其后清理成功、包装器 error=null、终端 `resources_writer_fk_exit=0` 均齐全。

旧 A 接收器要求子项 PASS 位于根 PASS 之前，不能接收本次 Go 延后输出的十条汇总。新增独立 D 接收器同时检查两种合法顺序，保持 A 和公共接收器冻结字节。48/48 项接收检查通过；首轮子进程派发 EPERM 日志保留，改用同进程模式后通过。没有安装依赖、重跑远端或生成测试构建产物。可重放：

```powershell
node --test --test-isolation=none docs/evidence/d-resources-writer-fk-actual-review-20261026.test.mjs
node docs/evidence/d-resources-writer-fk-actual-review-20261026.mjs docs/evidence/d-resources-mysql-20261026-084808-2a9906c3.json docs/evidence/d-resources-writer-fk-operator-20261026-2a9906c3.txt docs/evidence/d-resources-local-recheck-c5fe0b025c054ef4b239bc8cc6c71f81.json docs/evidence/d-resources-writer-fk-actual-accepted-20261026.json --check
```

接收仅限两条声明 FK 的真实 MySQL 存储/事务实验；不认证通用 FK/UNIQUE、触发器、四张扫描表 C 语义、B/C 实际 proof、临时双父行物理容量或 DDL freeze，不代签 A。完整恢复/GC、生产装配和原六项整体仍未完成；历史等价、human MFA、配置启用仍为 false。下方 2026-10-23 “真实 FK 待跑”保留其历史含义。

【2026-10-23 实际专项接收】[writer 九项实际回执](evidence/d-resources-writer-actual-accepted-20261023.json)已核对操作者提供的同轮完整远端输出、准确二进制/输入摘要、九个子项/根测试、迁移及 namespace UID/账号/数据库/scratch 清理，终端退出为 0。原本地日志仍有控制台编码损坏，原件保留；完整包/模块/合同的 122 份输入与此前原生补跑逐字节相同，显式跨轮复用那份 71 根/843 条本地证据，没有声称新跑本地或替换 writer 远测。独立 D 补证检查 15/15 通过，公共接收器/测试继续保持冻结版本。

本次仅接收 `nine_storage_tables_transaction_only_synthetic_proofs`；LIKE 夹具无 FK，业务 proof/registry 为合成。不接收真实 FK、B/C 业务事实、完整恢复或生产资格，也没有代签 A。此次九项无需重跑；真实 FK 专项及演练等其他远测各自保持独立。

`backend/internal/systembackupresources/restore_write.go` 提供私有 `applyRestoreWriteInTransaction`，供后续受审 B 适配在共同恢复事务中调用。它不创建事务、不提交、不启用服务。生产入口、正式 registry 和批准状态保持待交付。

输入必须同时包含九张表的完整目标写前行集与归一化后行集，空表也须声明完整列。只接受闭集表列、规范 ID 和总行数/值字节预算。输入在 proof 回调前复制，传给回调的副本不与写入计划共享可变值。

写入前要求冻结 registry、同事务目标证明和候选证明。随后检查实际 InnoDB/完整列，按固定顺序锁定完整主键范围（包括空范围），逐字段核对目标当前值并检查 35 张控制表为空。只执行绑定参数的 DELETE、UPDATE、INSERT；删除子表优先，写入父表优先，北向设置 UPDATE 同时检查旧 version。任一 SQL 错误、影响行数不是一、容量超限或取消都返回失败，不使用 REPLACE、IGNORE、upsert、关闭 FK 或 DDL 绕过冲突。

写前和写后字段读取均使用 `FOR UPDATE` 当前读取，不使用共同 RR 事务可能已建立的旧一致性快照。测试保留“旧快照与计划相同、当前目标已变更”的对照，要求在任何 DML 前拒绝。

写后在同一事务逐字段读回全部九表，再检查控制表和最终权限。返回成功只表示未提交的数据与候选一致；调用方任何后续失败必须整体回滚，最终提交前还须完成共同恢复事务的权限/fence 检查。独立 SELECT-only 读回、写凭据销毁和启动门禁仍由完整恢复编排执行。

Target proof 必须认证实际目标身份、隔离、事务级别、UTC/strict 会话、时钟/fence、完整 schema（含 FK/触发器）及持续 DDL/启动封锁。Candidate proof 必须认证写前/写后行集与 dump/checkpoint、逐表领域规则、映射、占用及目标版本的绑定。三个回调都是受信适配接口；测试中的允许回调只用于合成验证，不能作为生产证明。

验证复用已有无依赖入口：

```powershell
& .\scripts\system-backup-d-resources-rules-validation.ps1
```

新增存储型合成 driver 实际应用参数并让 SQL reader 读取待提交状态，覆盖九表增删改、NULL/空串、参数化正文、完整锁顺序、CAS、回调输入隔离、全部变更步骤错误/影响行数失败、写前漂移、结构变化、控制表迟到行、读回转换和取消。它不证明实际 MySQL 锁范围、FK、触发器、权限、DDL freeze 或生产 normalizer 正确。

本轮完整包结果为 **68 个主测试、826 条通过事件，零失败/跳过，默认 vet，exit 0**；新增 writer 三个主测试及子项共 76 条通过事件。[实际回执](evidence/d-resources-rules-local-d25149d0a27c4a7395680767a8f40802.json)确认冻结及当前来源/集合一致，准确自有目录及 893 份文件已删除。原首轮[失败回执](evidence/d-resources-rules-local-707446ecef2d48b0ba3552ddd937f7ea.json)保留两个控制表负例使用不存在表名的错误；改用已登记 `system_backups` 后重跑完整包，未删除断言。首轮准确自有目录及 893 份文件也已清理。两轮均未安装依赖或执行远端 SQL。

后续仍需 B 的同版本真实适配、C 四张扫描表领域规则及 A/B 增量评审，然后执行真实事务/并发/回滚与独立只读验收。完整 GC 与其余页面的实际 Owner 读源继续是原目标中的未完成项。

## 实际 MySQL 专项入口

新增 tagged `TestDResourcesWriteMySQL`，复用原 namespace/UID/server 标记、完整迁移 ledger、run-owned 子库及 SELECT-only 临时账号；不使用生产库。默认只做本地完整包、两类 seed、Linux 探针和迁移 runner 的编译准备：

```powershell
& .\scripts\system-backup-d-resources-mysql-validation.ps1 -WriterOnly
```

操作者在既有获准测试入口执行实际九项：

```powershell
& .\scripts\system-backup-d-resources-mysql-validation.ps1 -WriterOnly -Remote
```

九项分别验证：九表 UPDATE 提交后独立只读读回、空目标完整 INSERT、完整 DELETE、共同事务后续失败回滚、最后权限失败回滚、最后一表 NOT NULL SQL 失败回滚、已建立旧 RR 快照时拒绝当前目标漂移、现存主键行锁阻断竞争 UPDATE、空主键范围锁阻断 INSERT。最后一表故障必须先观察到前序审计表已修改，才认可该回滚用例到达实际写入。锁用例要求竞争连接返回 MySQL 1205，不能只以本地等待时间推断已加锁。

不加 `-WriterOnly` 仍只运行原十二项 readback；两套实际用例各自使用明确根测试名及最终 PASS 标记，不合并旧回执。该专项的目标 proof/registry/候选允许回调仍为合成输入，四张扫描表只验证存储；CREATE TABLE LIKE 不带 FK，不证明 B/C normalizer、最小写权限、完整 FK/trigger/DDL freeze、凭据销毁或启动门禁。实际 SQL 的结果必须另收同轮完整回执，本地编译通过不能记为九项已执行。

本地准备[实际回执](evidence/d-resources-mysql-20261023-115030-c1084801.json)的四个原生命令均 exit 0：完整 resources 包 68 主/826 条通过事件且无失败/跳过，两个 tagged seed 通过，Linux tagged probe 与 embedded migration runner 构建通过。冻结输入含 96 份迁移及合成 registry，并完成最终冻结源码核对；准确 owner `.tmp-d-index-cache-c1084801d3de424fb85334299f05169d` 已自动删除且另行核验不存在。未安装依赖、未请求远端。PowerShell AST 解析与既有 Git Bash 的只读语法检查通过；首次沙箱 Bash 因信号管道拒绝未启动，获准在沙箱外执行同一 `-n` 后 exit 0。

用户本轮再次确认 B/C 尚未交付，要求继续 D 可独立工作。本次交付不把这一确认改写为完整恢复、完整 GC 或其余真实详情已完成。
