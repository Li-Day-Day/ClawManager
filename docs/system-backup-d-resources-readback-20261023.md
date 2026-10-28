# D 恢复后单事务只读验收候选

【2026-10-23 实际专项接收补记】操作者补充的完整终端记录已归档；同轮二进制/输入摘要、十二个根下子项、根测试、完整迁移和准确清理经接收器核对，[实际 readback 回执](evidence/d-resources-readback-actual-accepted-20261023.json)接收隔离 MySQL 存储专项。原 step-0 四行编码损坏及另一测试名的 CP936 转码保留原样；另外在本地对原来源中的 122 份完整 resources 包/模块/合同输入逐字节冻结补跑，71 根、843 条通过事件，源码前后核对通过、临时源码/缓存/产物全部删除。补证不是原日志修复，也没有重跑远端。接收器增量回归 64/64 通过，证据见 `evidence/d-resources-readback-evidence-repair-tests-20261023-r3.txt`。

本次范围仍是 `isolated_synthetic_readback_only`：合成 registry/proof、无 FK 的 LIKE 存储夹具；不接收完整恢复、C 扫描语义、实际 FK、DDL freeze 或生产资格。原来源中与此专项无关的并行修改单列在回执中，没有声称全工作树相同。下文“实际 MySQL 尚未执行”等描述保留为候选初次交接时的历史状态。

2026-10-23。B/C 生产输入仍未交付；四张扫描表尚无 C 同版本领域决定。为后续完整恢复组合已有边界，新增私有 `verifyRestoreReadback`，不是生产适配器或公开资格入口。

## 流程和前置条件

入口先检查准确数据库、完整 proof 适配、正行/字段字节预算（拒绝 MaxInt64 行预算哨兵溢出）、冻结 v12 registry 的 resources/35 控制表闭集，以及九表完整预期列/行/ID。缺适配器（包括接口内 typed nil）、未冻结/漂移 registry 或不完整预期候选均不开始数据库事务。

预期行深拷贝封存，registry 的选定决策在回调前确定；调用方不得并发改写原输入。开始唯一 ReadOnly+RepeatableRead 事务后，依次执行：

1. B Target proof 在准确事务上认证目标身份、完整 schema、隔离与新 SELECT-only 凭据，证明恢复写凭据不可达。
2. Candidate proof 认证九表全部预期值、受审 normalizer、准确来源/目标/映射/版本/控制证据及本事务绑定；回调只收到另一份深副本，不能改写内部比较视图。
3. 对 35 张控制表逐一确认 BASE TABLE/InnoDB，再执行 `SELECT 1 ... LIMIT 1`；任一行存在立即拒绝，不做无界 COUNT，也不把 schema_migrations 当作源控制行。
4. 同一事务内执行既有九表 UTC/InnoDB/完整列名/显式 SQL 文本/预算读取，与内部封存预期逐字段比较。
5. Final proof 再认证当前权限、目标隔离/schema/freeze、写凭据销毁及候选绑定仍有效；复查 context，再提交只读事务，提交确认后再次检查 context。

任何 proof、SQL、字段比较、取消或结束不确定都返回失败，没有局部成功报告，也不输出行正文或原 driver 错误。提交前失败尝试回滚；显式回滚失败报告 outcome unknown。database/sql 已结束的事务可能返回 ErrTxDone，不由此声称独立确认了清理；结果原本仍是失败。提交已经尝试后不再用 Rollback 声称确认结束；Commit 失败或成功后取消均不得返回成功。proof 适配器提前 Commit/Rollback 也不能绕过最终完成检查。

## 尚未证明的事实

这三个 proof 只是私有组装接口，尚无 B 生产实现；闭包返回 nil、布尔值、证据 ID 或保存的历史 valid 标记均不是证明。B 的实际适配必须认证具体全部字段、完整空表、来源/目标、准确事务/时钟/fence、schema-hash/列类型/default/FK/index、业务权限及当前 source/capability freshness。新私有回调不构成已冻结共享合同。当前真实 registry 未冻结，真实调用应在打开事务前被拒绝。

读取预期相等也不证明 normalization 合法；预期必须先通过受审 D/A normalizer 和真实 B/C proof。合成测试中的任意值/假 proof 仅验证组装及拒绝边界，不认证业务合法性。DDL 元数据不是 RR 数据快照本身，B 必须提供并最终复查受审 DDL freeze/实际 schema；行数/保留字节限制也不是 SQL 计划或物理内存证明。此实现不写业务数据、不删除控制行、不启用配置、不开放网络，不自动把读回成功提升为恢复/生产资格。

## 验证与交接

新增测试检查同一个事务和 proof 次序、35 张控制表逐表拒绝、缺失/typed nil/草案前置拒绝、begin/proof/SQL/字段/预算/commit/rollback 失败、proof 改写预期/调用方/registry、提前结束事务及四个取消阶段。合成 driver 使用同一连接的完整只读流程；实际 MySQL RR/权限/DDL freeze 和恢复整链尚未执行。

A 原 egress 私有候选与 49 根/453 条冻结测试已按其原程序接收，范围保留，新增只读验收候选待 A/B 增量评审。完整 resources 包实际结束、来源/集合和准确清理按同轮独立回执核对。未安装依赖、执行远端、改正式 registry/批准或发送外部消息。五表离线候选、四张 C 扫描表、B 生产 writer/proof、真实读回/启动门禁、freeze/完整 GC 及原六项仍须分别完成。
