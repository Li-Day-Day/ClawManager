# A：GC 连接归属与当前合并源码复核

后续 HTTP 两份输入已按[独立五秒预算记录](system-backup-a-download-failure-budget-review-20261021.md)完成另外一轮冻结 6,598 项的限定复核，未追记到本轮 6,591 项或改变原回执；七份读取源码及新增测试仍另行待审。

已完成[独立冻结合并验收](evidence/a-gc-connection-integration-accepted-20261021-r1.json)：1,466 份输入、五完整包 779 根/6,591 项通过；测试清单准确等于 A 原四包 6,280 项与 D 原五包 6,581 项的并集。security 255/2,011、evidence 362/3,001、read 75/519、producer 75/784、metadata 12/276。包内及脱离源码 seed 各 22 项、Windows/Linux probe、Linux migration runner、默认 vet、冻结 postcheck、最终退出 0 均通过，自有源码/缓存/二进制目录已删除并独立确认，没有安装依赖或执行实际 SQL。

owner/角色接收器新增第六份 SHA 固定基线，两包 617 根/5,012 项，原五份完整清单保留。[接收器同步验证](evidence/a-gc-connection-integration-receipt-readers-preparation-20261021.json)通过 owner 56、角色 43 项解析器与十一份真实日志 CLI 拒绝，实际 SQL 回执零新增。

接收后又出现 `http.go`、七份 `systembackupread` 普通源码及其新增测试的并行变化，本记录不接受这些输入，也不宣称当前整树通过。原实时复核器会因后续漂移而拒绝，这是来源守卫的预期行为；[冻结回执复核器](evidence/a-gc-connection-integration-frozen-check-20261021.mjs)只读检查原回执 SHA、原始证据、完整清单并集、九份连接/日志受测源码及清理，另行列出当前漂移，不修改历史接收文件。

源码检查的限定结论：

- Collect 的生产变化仅在事务取得及 defer 块：借入专属 `sql.Conn`，通过它启动原 RR 事务，并核对原 server/database/SQL 时间。反向还原这两处后与原 collector SHA 一致，原 policy、nonce/引用/保留期限/容量、删除顺序和唯一 commit 保持。
- 事务先结束，再对同一 Conn 以 `Raw`/`driver.ErrBadConn` 丢弃会话，最后 Close；没有在另一池连接执行清理 SQL，也没有新事务、重试、授权回退或新增 LOCK/UNLOCK INSTANCE。
- 新连接三根/34 项覆盖已知/未知提交、拒绝、回滚失败、取消、回调 panic、初始化/身份/游标失败和 Close 报错。真实 collector 模型另核对原组、墓碑及容量的提交/回滚。已核对本机 Go `database/sql` 的 Raw/ErrBadConn 与 Conn.Close 实现，不能把归还连接池等同于物理断开或服务端释放。
- `close_error` 模型刻意保留远端可能仍持锁状态，同时要求旧会话不再被池复用。本地结论只到池丢弃；没有服务端释放、清理延迟上界或完整 DDL freeze 证明。借用的也可能是既有池连接，不能声称新建物理会话、池独占或已清除临时表/用户变量。
- publisher 生产源码未修改。新夹具分别覆盖原 absence proof 在 staging 内到期与尚未接受就到期的两条路径，保留原到期时间及 staged-entry/零 PUT 断言；原 r1 失败记录保留。

新元数据观察包的十二根/276 项纳入本轮五包，仍只接受只读模型/投影和数据预算范围，不代替现场完整可见性、受审期望摘要、BACKUP_ADMIN、全局锁序与跨提交 freeze。实际 SQL、provider、容量/运行卷、完整 GC policy 和生产启用继续待验收。
