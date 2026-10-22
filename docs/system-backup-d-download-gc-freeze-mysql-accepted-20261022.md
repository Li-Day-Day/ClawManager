# D GC freeze 前置实验实际接收（2026-10-22）

【2026-10-22 当前本地入口扩为 42 项，新增八项实际待跑】[当前来源、证据和命令](system-backup-d-gc-owner-lifecycle-20261022.md)保留原 34 项并新增八项生产连接所有者生命周期实验，已完成本地复验及产物清理。本文的 34 项来源和日志继续作为历史记录；当前 phase/dispatch 两份字节已升级，旧复核脚本的当前文件一致性要求会拒绝这一差异，不把旧结果改写为当前 42 项实测。请以新说明的来源清单和最终 42 项标记运行并接收。

已接收 MySQL 8.4.8 上 34/34 项实际结果，父测试 0.60 秒，最终退出码 0。25 类 DDL 各有对应 holder 与 waiter 的不同连接、不同线程及明确 backup-lock ticket；另有 9 项权限、事务和会话控制通过。结果仅覆盖合成夹具中的备份锁前置行为。

[完整日志](evidence/d-download-gc-freeze-remote-20261022-084739-1604f031.txt)、[来源清单](evidence/d-download-gc-freeze-remote-20261022-084739-1604f031-source.json)、[验收回执](evidence/d-download-gc-freeze-actual-accepted-20261022.json)与[复核脚本](evidence/d-download-gc-freeze-actual-review-20261022.mjs)共同固定本次结果。来源清单 1,519 份文件，摘要为 b2557fd28e16cbb419be616164d33123cfc473dfdc0c317d098311c0f85f8b8d；六份已准备文件逐一匹配此前发布版本。迁移重放为 001..081、96 份正式文件。没有把并发变化的整棵当前工作树纳入验收。

- 探针 binary SHA-256：6fe2bdf93660958dbea2506844ea2859bfbda5575928995a0873befc06d35852。
- 输入 SHA-256：d9c5e055812f2467ed0377337e864ee94e082c13b0cc53d7f4b150c9b8e329c0。
- namespace：sbk-mig-261022013337-65ef；UID：081b70f6-ce4a-42e8-a672-49847e31324e。

日志报告 namespace、远端 scratch 和本地缓存清理完成，准确的本地自有目录已另行确认不存在。没有独立登录集群复查远端清理。日志中的 socket close 消息予以保留；本次接收依据完整用例、限定范围的 PASS、清理标记和最终退出码 0。

本轮没有安装依赖，复核者没有执行远端命令。freeze_adapter=not_wired、full_gc=not_run、role_approval=no、human_mfa=no、provider_read=no、production_approval=no 均保持原义。

接下来的 D 优先事项：

1. 补齐同一连接的锁获取、事务结束、有界释放与物理丢弃协议，明确取消和丢失 COMMIT 回包时的结果分类；先用证据证明清理结果，再接入 Collect。
2. 补齐批准的角色与权限漂移门禁、完整 metadata capture/expected digests、全局锁顺序及规模干扰实验；按[十二组协议要求](evidence/d-gc-backup-lock-protocol-requirements-20261021.json)逐项验收。
3. 执行完整 collector 的 owner/capacity/nonce/audit 原子性回归，再补原六项的真实链路及部署矩阵。

此前的[探针准备和操作者命令](system-backup-d-download-gc-freeze-mysql-20261021.md)保留为历史记录。34/34 不代表上述协议、生产角色或原六项已经完成。
