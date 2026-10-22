# D GC 连接生命周期完整 42 项实际接收

2026-10-22，本轮接收 [15:57 新运行日志](evidence/d-download-gc-owner-lifecycle-remote-20261022-155741-ad6ff1fd.txt)及[同轮来源清单](evidence/d-download-gc-owner-lifecycle-remote-20261022-155741-ad6ff1fd-source.json)。[机器回执](evidence/d-gc-owner-lifecycle-actual-accepted-20261022.json)与[复核程序](evidence/d-gc-owner-lifecycle-actual-review-20261022.mjs)固定原始日志摘要、来源清单摘要和接收范围。此前 14:40 的 41/42 失败记录保留，不改为成功。

本次 MySQL 8.4.8 上两个实际父测试均通过，完整 42/42：原 34 项前置实验加 8 项连接所有者生命周期。25 类 DDL 均有准确 holder/waiter 的不同连接/线程与 backup-lock 等待记录；8 组均确认原线程持有 ticket、提交/回滚/解锁结果分类、canary、原 ticket 消失及不同 ID 的新连接。COMMIT/ROLLBACK/UNLOCK 回包丢失三项均有 wire_ok_dropped=true，保留 unknown，不因独立观察到数据库结果就改成客户端已知成功。

取消场景原 connection=68/thread=417，独立观察约 5.002 秒后 ticket 消失，预算 40 秒，canary=0，新连接=70；该身份属于本次 namespace，不能与旧失败轮同数字身份混同。其余七项观察预算为 5 秒。六条微秒耗时在 Windows 日志中记录为“碌s”；复核程序保留原值，并用可重现的 UTF-8 微秒符号被 GBK 解码关系单列规范值，不改写原日志。该规范化只处理单位，不改变任何通过、权限或事务结论。

- 来源摘要：`31353f64be59645bcbee973d238b8754176faa4b5e198d7f159b7c3c1631bd7f`。清单摘要算法、无重复文件、稳定复制、日志来源 marker 和修复回执九份关键输入均已核对；关键输入与接收时当前字节匹配。
- 探针二进制：`c48a38797ce39ab65ed371e91b75be5110020c510d746cd89cfd185233c8f272`，本地构建 marker 与远端完整 phase marker 相同。
- 正式迁移重放：001..081、96 份，catalog 摘要 `0a2fc9ee709ffe6935679ed0923414f0607b2d34bf55ba615e7f431f8411bffe`。
- namespace：`sbk-mig-261022090541-3520`，UID：`a34978ab-85b8-4351-be8b-a2a76c72d01d`。
- 完整运行最终 `download_gc_owner_lifecycle_exit=0`；日志报告准确 namespace、remote scratch 和本地 cache 清理，并通过 frozen postcheck。外层准确目录 `.tmp-d-index-cache-8d328c9da08b4c2facd2e8d5c2a6d613` 已独立确认不存在。未独立登录集群复查远端清理，日志的 socket close 消息保留。

本次只接收合成夹具中的实际 SQL 前置和连接所有者行为。freeze_adapter=not_wired、full_gc=not_run、role_approval=no、human_mfa=no、provider_read=no、production_approval=no 保持原义；整棵当前工作树、完整 Collect 和十二组生产协议未因此通过。复核者没有执行远端命令或安装依赖。旧“新完整 42 项待运行”的记录至此成为历史；后续应推进受审 freeze 接线及完整 GC，而非重复已接收的本次专项。
