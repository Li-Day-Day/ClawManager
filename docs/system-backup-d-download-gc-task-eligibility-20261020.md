# D：下载 GC 的实际任务资格组件

本增量新增 `SQLDownloadGCTaskEligibility`，作为完整 `DownloadRetentionGCPolicy.Lock` 必须完成的具体任务来源检查之一。它读取正式 067/068/069/073/077 的实际列，覆盖 backup、drill、preflight、artifact_verify；不实现 `Early`，不能单独当作完整 GC policy。没有默认安装、角色、路由或调度，也没有触发 provider 删除。

## 资格与原始来源

- 锁定原 owner 和准确本地 backup。每一行独立验证安装、类型、schema、版本、创建时间、终态、完成时间及自己的原始 `deadline_at`；两者的原期限都必须到达。没有从 parent 或当前 TTL 推导 child 的期限。未结束任务、未完成/将来完成、待 reconcile、未过期或不完整的 controller claim 均拒绝。过期但完整的旧 claim 可接受，并保留在后续复核中。
- artifact 只允许已经 `deleted` 且不可用，或 `staging/not_committed` 且从未开始/完成 commit。committed（包括不可用）、deleting、delete_failed、corrupt、提交结果未知均不满足此条件。即使 artifact 已 deleted，manual/promotion hold 仍然阻断。
- 非 backup 的源必须是准确本地 backup。先读取提示选择 backup key，先锁 backup 再锁 child，随后独立比较锁定 child 的源。catalog_import 和 system/producer、staging、resource、promotion、prune 等其他 owner 继续拒绝，等待其原始绑定与实际适配器；不伪造期限。
- drill 的 cleanup 必须是 `succeeded` 或尚未开始且无资源记录；retained、pending、running、failed、partial_failed 或非 none 的清理错误均阻断。backup staging 与 drill restore inventory 只能剩下 absent/deleted 的收敛记录；staging 的 cleanup_result 必须 succeeded。错误、残留、活动/半对 claim、其他安装、重复/乱序/超量记录均拒绝。
- backup 及原 child 的 incoming retry 范围、backup/drill 的 promotion 范围必须为空。这里保留所有仍存在的 promotion/retry 记录的保护，不用已变为 false 的 hold flag 或 promotion 状态代替其引用生命周期。相关记录须由自己的受审回收流程先处理。
- 锁住 backup 的 lease-state/source-lease 范围，并对 child 额外锁 holder 范围，避免漏掉指向其他来源的矛盾租约。过期 lease 可保留；必须核对安装、source、generation/mode、holder/purpose、TTL、heartbeat/expiry、配置版本与 owner。过期等值可接受；未过期、错误来源、缺 state、跨安装、类型错误均拒绝。

## 复核与回收事务

guard 绑定同一事务、完整原 `DownloadRetentionGCScope` 和准确 backup key。复查使用已经取得的相同键/范围进行 current locking read，不重新读取提示或换 parent，不使用 RR 的旧一致性快照。所有已接受事实必须与原快照相同：即使新资源已经 deleted、行版本仍符合条件或期限仍已过期，也不能在中途换成另一份事实。复查时间不能倒退；失败状态由值副本共享，复制 guard 不能恢复授权。

范围没有按安装、活动状态或是否到期缩小，避免把矛盾来源当作没有引用。九个必需表必须完整可见且为 InnoDB 基表；缺表、视图、其他引擎和重复元数据行均拒绝。该类型检查不能代替外层完整结构/权限指纹和 DDL freeze。每类 inventory/lease 最多 10,000 行；查询失败、权限不足和超量均失败，不当作空范围。所有 SQL 标识符来自关闭的四任务表集合，外部内容只作参数。组件只读/锁定，不开启嵌套事务、不提交、不变更 owner、claim、期限或资源。

collector 模型组合这个真实组件，并检查在写墓碑、删结果之后出现 hold、已收敛资源、promotion 或 lease state 时，原组、墓碑和容量记账整组回滚。它没有代替实际 MySQL 的锁等待、空范围覆盖或全局跨参与者死锁证明。parent→child→引用/inventory/lease 是此组件的候选顺序，仍需与所有生产写入者一起审查及实际并发验证。

## 仍需交付

完整 policy 仍缺其他 Operation/audit/nonce/evidence/logical/FK 引用、源 artifact 的其他任务/导入依赖、system producer 原始绑定、当前工作授权/撤权、privileged trigger/program 观察与 DDL freeze。前置 grants/结构指纹必须与本组件所需表/权限一起受审，不能仅靠查询成功推断完整元数据可见性。当前组件不解除这些门禁，也不启用生产回收。

原四任务链十二项实际 SQL 已接收范围保持不变。producer 十八项仍待操作者远测回执；本组件的本地模型和编译不能替代实际 SQL、现场容量或[原六项](system-backup-d-six-scope-readiness-20261015.md)交付。

## 验证

r74 首次冻结 1,439 输入后，Windows asm/compile 以 `0xc0000043` 退出，未执行测试。r75 重新冻结时 A 并发新增角色探针与脚本，完整来源改为 1,441；D 三份改动未变，但默认 vet 抓到新增测试辅助函数的 variadic 转发错误，仍未执行测试。原失败及来源全部保留，不把这两轮改为成功。

修正测试 key 为 canonical 数组，并加入九个必需 InnoDB 基表的实际检查及负例后，r76 定向 **18 个 GC 主测试/242 项含子项检查**全通过，其中本组件 **6/117**。默认 vet、两次冻结源码 postcheck、整体退出 0 和准确快照清理通过；1,442 输入 SHA `0ce20792189a9d2b75b8c70b20f51f78b2fda136b7288b3367c3e5d078826078`。本轮没有安装依赖或连接远端。

r77 完全同源运行 security/evidence/read/producer 四完整包，**722 主/5,855 含子项**全通过，无失败或跳过，默认 vet 和普通包 postcheck 通过。其中 evidence 为 317/2,541，GC 为 18/242，新任务组件 6/117。随后 Linux 交叉编译的 Windows `vet.exe` 以 `0xc0000043` 退出；该轮整体 exit 1、缺最终 postcheck 继续保留，不称单次整轮成功。

r78 使用准确相同的 1,442 来源与自有缓存补做 tagged-only 本地准备：三个 seed/22、tagged seed/22、脱离源码/22、Windows/Linux probe、Linux migration runner、两次 postcheck 及整体退出 0。四完整包没有重跑，默认 vet 没有关闭。准确构建摘要及普通包/补证各自来源见[独立复核](evidence/d-download-gc-task-20261020-r78-review.json)。

[清理回执](evidence/d-download-gc-task-cleanup-20261020.json)确认五个准确快照及一个自有缓存共六目录均已不存在；没有临时草稿或构建二进制遗留，没有安装依赖或执行远端。接收时当前 1,442 输入集合及字节零漂移，正式 95 文件 catalog 和 producer v2 胶囊不变。

实际查询计划、索引选择、空范围锁覆盖、跨写入者死锁与规模验证尚未完成。此处只接收具体 SQL 检查代码及模型事务组合，不能当作实际 MySQL task/lease/hold 并发或完整生产 GC 的验收。
