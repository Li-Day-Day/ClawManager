# A 对恢复后单事务只读组合候选的增量安全复审

2026-10-23，范围为 D readback 请求绑定的 190 份来源。接收私有组合候选和对应冻结合成测试边界；没有 B 生产 proof、正式冻结 registry 或实际 MySQL，因此不批准真实恢复验收或启用。

已静态核对：缺 DB、typed-nil Target、Candidate/Final 回调、完整预期或合法预算时拒绝；真实草案 registry 在事务前拒绝。先固定控制表闭集并深拷贝完整九表预期，再开启唯一 ReadOnly/RepeatableRead 事务，Candidate 只能取得另一份深副本。35 个控制表逐个确认 BASE TABLE/InnoDB 并作 LIMIT 1 存在性检查，不用无界 COUNT，不把 schema_migrations 当成源控制数据。九表读取与逐字段比较使用同一事务，任何 proof/SQL/比较/取消失败均不交付局部成功。

Final 之后仍检查取消、确认 Commit，再检查取消；提前结束事务、Commit 失败或完成后取消不得返回成功。提交前错误尝试 Rollback，Rollback 异常保持结束不确定；ErrTxDone 不证明独立清理，原错误仍失败。Commit 已尝试后不以 Rollback 宣称确认结果。错误不输出原值或 driver 原错误，函数不写业务数据或产生公开资格。

生产组装前，B 必须实际认证 Target、全部九表预期、normalizer/source/target/版本/时钟/fence、schema-hash/列类型/NULL/default/FK/index、新 SELECT-only 身份及写凭据不可达。Final 必须认证可信的当前权限、撤销、隔离/schema/freeze 与候选绑定，不能把 RR 初始视图的重复读取当成新鲜事实。当前接口允许测试闭包返回 nil，只是私有接线缝隙，不是生产 proof 实现或已冻结共享合同；实际调用仍需完整合同和非实现 owner 复审。

相等不证明 normalization 合法；控制表空也不证明 target/source 真实性或启动安全。metadata 不自动属于 RR 数据快照，DDL freeze 和实际 schema 必须单独认证。保留字节/行预算不证明执行计划或 driver/物理内存上限。后续服务启动、北向/网络/镜像启用另行验收，不把只读成功提升为恢复资格。

A 独立接收核对 33 份冻结输入、190 份请求来源、完整包 63 根/678 条通过事件及旧 602 条逐名保留；11 个前置拒绝、35 表逐表拒绝、17 个失败、3 个 proof 改写与 4 个晚取消场景，准确 owner 缺席/清理匹配。没有重跑 Go、安装依赖或执行实际 SQL。范围仅对应冻结字节，正式 registry 和批准字段不变。
