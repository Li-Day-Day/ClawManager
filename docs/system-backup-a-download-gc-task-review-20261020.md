# A：GC 任务资格组件限定复核

[A 独立回执](evidence/a-download-gc-task-independent-accepted-20261020-r78.json)限定接收 D 原 r77/r78 冻结来源中的任务资格组件与模型组合，不接收正在修改的当前 collector/reference 整合。本轮只读原始日志、清单和代码并写评审记录，没有重复测试、构建或安装依赖，没有清理或修改 D 的目录。

## 已核对的原始证据

- 原 r76 定向 18 根/242 项；原 r77 四完整包 722 根/5,855 项，全部 RUN/PASS 配对，无测试失败/跳过，默认 vet 和普通包来源 postcheck 通过。
- 原 r77 后续 Linux probe 的 Windows vet 工具退出 `0xc0000043`，整轮 exit 1、缺最终 postcheck 保留，不能写成单轮整体成功。
- r78 与 r76/r77 的有序来源清单完全相同，1,442 输入 SHA `0ce20792189a9d2b75b8c70b20f51f78b2fda136b7288b3367c3e5d078826078`。r78 只补三个 seed/22、脱离源码/22、Windows/Linux probe 和 migration runner；默认 vet、最终 postcheck、exit 0 齐全，没有重跑四完整包。
- 五个准确快照及一个自有缓存共六目录均已独立确认不存在；本轮未删除任何目录。95 文件正式 catalog 不变。
- A 角色探针 r2 来源清单的路径、大小、字节与上述 D 来源逐项相同。其逻辑 SHA 不同，原因是有序文件清单顺序不同：首次差异为 `backup_sessions.go` 与 `backup_sessions_test.go` 的位置；两份摘要均独立重算成立。不得把两个 aggregate SHA 当作相同，也不把排序差异误记成源码字节变化。

| 新任务资格测试根 | 含子项检查 |
| --- | ---: |
| FourOwnersAndOriginalDeadlines | 9 |
| ProtectedFactsDeny | 47 |
| InventoryAndExpiredLeaseRanges | 25 |
| LateChangesPoisonAllCopies | 15 |
| SQLFailuresAndConfiguration | 15 |
| CollectorRollbackAndFinalRecheck | 6 |
| 合计 | 117 |

## 组件审查结论

`SQLDownloadGCTaskEligibility` 针对 backup、drill、preflight、artifact_verify 检查原始任务行和准确的本地 backup。child 提示只选择要锁的 backup；实际锁定 child 后再次比较 source，不能重新读取提示换 parent。parent 与 child 分别检查自身的 `deadline_at`、终态、完成时间和 controller claim，不从当前 TTL 或 parent 期限推导 child 期限。

backup 必须 deleted/不可用，或从未开始/完成 commit 的 staging/not_committed；manual/promotion hold、仍保留的 promotion/retry 记录均阻断。inventory 只接受收敛记录；lease/state 覆盖源和 child holder 两种范围，检查安装、generation/mode、holder/purpose、过期与 TTL 等事实。查询没有以安装、活动或到期状态过滤掉矛盾行。四任务以外的 owner 和 catalog_import 继续拒绝。

guard 固定同一事务、原 scope 和 backup key，复查原范围并比较全部原事实；时间不能倒退，失败状态由副本共享。原模型组合验证了写墓碑/删除结果之后出现 hold、已收敛资源、promotion 或 lease state 时整组回滚。该结论只属于原冻结 collector；当前正在修改的 collector 不在此验收内。

## 当前并行变化未接收

核对时任务资格 `.go` 和 `_test.go` 仍匹配 r78。以下新阶段内容排除：新增 `download_retention_gc_references.go`；已变化的 `download_retention_gc.go`、`download_retention_gc_test.go`、`download_retention_gc_early_test.go`。独立回执保留其名称，不用旧 5,855 项通过为当前整个工作树背书；后续新增文件同样不自动进入本次范围。

这三份已变文件造成独立检查在“全工作树仍与 r78 相同”的条件下停止，未产生接收记录。确认任务组件本身未变后，本次明确转为原 r78 任务组件的历史限定复核，并将当前 collector/reference 整合留待新来源和新回执，不跳过未通过的当前整合门禁。

## 必须保留的后续门禁

九表的 InnoDB 基表检查不能证明完整列/FK/index/CHECK/trigger/program 或元数据可见性，仍须准确权限/结构 pin、特权观察和 DDL freeze。已准备的[受限账号十项](system-backup-a-download-gc-role-mysql-handoff-20261020.md)只验证早期组件的候选权限，未覆盖本任务组件全部读表权限，也不批准完整 GC 角色。

实际执行计划、空范围覆盖、跨参与者锁顺序和规模仍未验证。模型的“相同查询键”不等于实际 InnoDB 只锁目标行：锁范围与扫描的索引范围有关，缺少适用索引时可能扩大。特别是正式 lease-state 索引以 installation 开头，当前谓词为避免漏掉跨安装矛盾而未加安装过滤；holder 查询也不能据模型断言其实际索引路径。应在隔离 MySQL 中检查计划与竞争写入，不以添加状态过滤来制造空范围。[MySQL 8.4 锁范围说明](https://dev.mysql.com/doc/refman/8.4/en/innodb-locks-set.html)

完整 policy 还缺其他 Operation/audit/nonce/evidence/逻辑/FK 引用、artifact 的其他任务/导入依赖、system producer 原始绑定、当前 worker 授权、真实材料/物理容量、批次及墓碑二次回收。真实 SQL owner 十一项和受限账号十项仍由用户执行并提供回执；已接收的 MFA 九项、准入/结果二十四项不重跑。生产 GC、正式 schema 和角色批准均未放行。
