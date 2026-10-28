# A：完整 GC owner 本地候选复审

2026-10-26。结论是 [限定接收](evidence/a-gc-full-owner-reviewed-20261026.json)准确冻结来源 `093f6b84d87d70bafc2819b351d1d36874dea32cd35e89420461f218e8eb8def` 的显式 Full owner 调用链，**不批准生产完整 GC**，不把新 bootstrap 工作树纳入该轮覆盖。

公开 Collect 的 opt-in Full 配置现在确实进入固定 freeze owner，保留原 Early 角色与 nil-Freeze 路径的历史范围。Full 需要独立部署的原 domain Policy 同时实现完整协议准入；仅有旧 Policy、结构摘要或合成允许回调不能启用。实际原策略和现场批准未交付，本次没有补造。

| 核对项 | 当前结果 |
| --- | --- |
| 准确来源 | 1,644 份 manifest 的闭集、唯一排序、大小/hash 和完整摘要通过；八份 GC 源码/脚本当前字节与该冻结来源一致。 |
| 完整测试 | evidence 与 gcmetadata 两包 409 根/3,493 条逐 RUN/PASS 原生事件，零失败/跳过；旧 evidence 3,179 条逐名保留。 |
| 公开 Full 路径 | 四根/33 条事件，包括 task 及 system capability producer 的公开 Collect 成功、late producer authority/hold 变更共同回滚。 |
| 权限与身份 | 独立 Full grants 闭集和完整原 SHOW GRANTS hash；额外/混合权限、转义收件人、跨库/通配、重 pin 未知表拒绝；worker 与 observer 区分。 |
| 原绑定与时序 | scope 绑定原 config、worker row、peer、期限；同一 fresh session 持锁后独立 observer、单一 RR 事务、真实 work、ticket、原 completion/finalizer、唯一 commit。 |
| 失败与游标 | late 事实变化共同回滚；commit/rollback/release unknown 不伪称安全释放、不推进 batch 游标。 |
| 编译与清理 | Linux tagged compile exit 0；原来源后检成立；五个准确 owner 独立确认不存在。该轮未记录 Linux 二进制 hash，不作为实际远端 binary 验收。 |

独立复核入口为 `node docs/evidence/a-gc-full-owner-review-20261026.mjs --check`。它不重跑 Go，不覆写 D 的请求或原回执，不把 current-tree ready 当接收条件。D 请求固定 hash 为 `0c1ff055817ef0e1499ecfc4b377a7922bff8aa78e8b579a72ffb2a17e4fa840`，其中后续 bootstrap 变化与冻结来源分开。首轮 15ff 的完整包 600 秒超时保留为失败；中间 c561 只保留自身准确范围。

原 A 要求补充的公开 system 路径与 Full 权限闭集反例已纳入最终冻结版本，未发现需要本次再改 GC 源码的静态阻断。原私有 finalizer 的一次性 completion、动态不可比较 context 拒绝、末次 SQL 样本、中间回退及 after-ticket 检查仍在旧库存和本轮完整包中保留。

仍缺真实原 domain/protocol authority、完整领域策略和十二组实际 MySQL 协议，尤其空集合到新 routine/view/event 的 DDL 窗口、释放/接管与物理容量。MySQL 官方说明 backup lock 的文件及特定操作保护范围；不能仅凭这段说明推断所有程序元数据都已冻结。这是本次验收的边界判断，实际范围须用准确 profile 验证。[MySQL 8.4 backup lock](https://dev.mysql.com/doc/refman/8.4/en/lock-instance-for-backup.html)、[metadata locking](https://dev.mysql.com/doc/refman/8.4/en/metadata-locking.html)。

因此，本地 owner 链已被实现和验证，部署装配与实际协议仍未验收；旧角色十项、生命周期四十二项也不替代新的 Full profile。后续 bootstrap 修改如进入该包的实际 Go 依赖，须由共同新门禁匹配新字节，不能沿用本轮整树 ready。
