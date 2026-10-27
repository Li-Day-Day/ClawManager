# A：GC task 实际 prune 失败的约束冲突

【最新实际十八项已接收】D `154631-7f8bf868` 新轮完成实际 MySQL 8.4.8、96 文件 fresh replay 和完整十八项，原三个 prune 子例均 PASS。[A 独立复核](system-backup-a-download-gc-task-mysql-review-20261021.md)核对 143 项，包括原组件/隔离谓词锁等价、实际 record lock、排除父 FK 等待及十八库/原 UID/两端清理/退出 0；接收器 37 项检查通过。原十五过三败与首次本地工具崩溃仍保留。仅资格组件专项关闭；历史升级等价性、073 staging、生产角色/完整 GC 不扩展接收。以下“待新回执”为本轮前历史记录。

【后续修正已独立复核】D 已增加 `081_fix_system_backup_prune_item_identity.sql`，原 070 字节保持，原子替换同名 CHECK 的一处引用 ID 谓词，保留全部 FK 与其他 identity/计划/location 条件。当前迁移目录为 96 文件。[A 新普通回执](evidence/a-prune-identity-baseline-accepted-20261021.json)核对初轮失败与完整 controller 重测、六包 919/6,332 覆盖、owner 两包 5,019 全保留、tagged seed 4/29、跨平台及清理；未执行新迁移或实际 SQL。D GC task 十八项与历史升级等价性仍待新回执；073 staging 的类似格式问题不由这处修正扩大接收。下文是 95 文件失败轮的原始诊断。

[独立失败核对](evidence/a-download-gc-task-prune-failure-reviewed-20261021.json)保留 D `134319-dfd8756c` 原轮：本地两包 5,019 项和 packaged seed 13 项通过后进入 MySQL 8.4.8，实际十八项十五过三败，根 FAIL、外层 exit 1。`prune_reference`、`empty_prune_range`、`late_prune_reference` 均因 prune INSERT 的 3819 失败；空范围例明确报告 `chk_sb_prune_item_identity`。原文字 PASS 不替代真实根事件。十八子库、namespace 原 UID 与两端清理由原日志报告，准确本地源码目录独立缺席；本记录未连接服务器或执行新构建。

正式 067 的 backup public ID CHECK 要求 `sbk_8-4-4-4-12`。正式 070 的 `chk_sb_prune_item_identity` 却要求 artifact public ID 为 `sbk_8-4-4-12`，少了一组；该 artifact 字段同时通过准确安装/public ID 外键指向 backup。因此改短测试 ID 也不能同时满足父表 identity 与子表 CHECK/FK，不能将其作为夹具规避。

两份正式 DDL 的准确字节已与失败轮 source 清单核对。离线核对同时证明标准五组示例通过 backup、被 prune 拒绝；四组示例通过 prune、被 backup 拒绝。这解释了当前首个数据库阻断，但尚未证明对齐后所有其他 prune CHECK、绑定或锁断言都会通过。

待单独修订的目标是让 prune artifact identity 与它引用的 backup identity 使用同一个五组格式，保留安装、schema、其他 identity 条件及全部 FK/CHECK。正式历史迁移的兼容方式与 catalog/source 变化应在该修订中明确处理；本轮没有修改共享 DDL、关闭约束或应用迁移。073 staging 的 `backup_public_id` 也出现四组格式，需随关联引用核对，不能从当前十八项推断它已通过实际 SQL。

修订后须以新来源和完整本地 gate 重测原十八项，尤其确认 prune INSERT 本身成功，随后才判断引用保护、晚插入拒绝及实际空范围锁。空范围用例仍要求原组件与隔离谓词具有相同实际锁集合，并排除父表 FK 行等待；不能用等待时长代替。准确用例/root、同轮 catalog/probe/runner、十八子库/原 UID/两端清理、最终 postcheck 和 exit 0 齐全后才接收。A owner 十一项和受限角色十项保持各自独立范围，producer 已接收十八项不由此重跑。
