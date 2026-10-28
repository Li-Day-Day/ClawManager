# A2：cleanup collector 原文映射复核

本次只读复核原方案、066/067/073/077 迁移及当前非测试 Go 源码。不运行 Go、SQL、SSH、Docker 或 PromQL，不修改已冻结来源或旧验收回执。

结论：不能笼统地把 collector 设计全部留给用户。原文已足以确定资源闭集、阈值来源和首次自动 drill 分支的逻辑起点；D 可以继续实现持久化绑定、完整读取和状态校验。现有表结构和纯告警 predicate 尚不足以证明完整生产采集。

| 项目 | 原文已经确定 | 尚需实现或验证 |
| --- | --- | --- |
| 清理资源范围 | [方案:628](../system-backup-restore-division-plan.md:628)明确七种 P0 authority：namespace、volume_snapshot、mysql_instance、redis_instance、redis_keyspace、object_prefix、workspace_root。PVC/Pod/PV/VSC 属于子资源或派生观察，不另建 P0 直接删除权限。 | 077 的 resource_type 只有语法 CHECK，读取时仍须检查语义闭集；未知类型不能静默忽略。 |
| 冻结预算 | [方案:336](../system-backup-restore-division-plan.md:336)明确 cleanup_deadline_seconds 为 60..21600、默认 3600；[方案:806](../system-backup-restore-division-plan.md:806)要求任务级阈值取 immutable config snapshot。067:200–203、256、266 提供 drill snapshot、长度/hash 和版本 FK。 | 校验并解码 owner 的原快照；不能读取当前 active config 代替。FK 和 JSON_VALID 本身不验证 JSON 内容 SHA 或业务字段相等。 |
| 首次自动 drill 清理 | [方案:632](../system-backup-restore-division-plan.md:632)要求 succeeded 与 not_started→pending 同一终态 CAS；[方案:234](../system-backup-restore-division-plan.md:234)要求 finished_at 仅终态写入。因此在该特定首次分支，finished_at 可作为进入 pending 的数据库时间，预算来自该 drill 快照；不必凭空新增一个不同起点。 | 必须实现并证明同一 CAS 使用同一数据库时钟、finished_at 后续不改，以及当前读到的仍是首次自动分支。仅凭 succeeded + cleanup_status=pending/running 无法排除后来显式重试。 |
| 显式 cleanup / 重试 | [方案:633、640](../system-backup-restore-division-plan.md:633)要求新 operation、独立 claim、row-version CAS 和新 key 重试；[方案:238](../system-backup-restore-division-plan.md:238)规定异步 operation 从 created_at 起计且接管不延长。066:319–321、327、344–347 已有 type/target/retry/deadline/time。 | 将本轮资源/父任务清理绑定到正确 operation，校验 origin、operation_type、target identity、重试链及原子更新。073:43 和 077:39 的数字 id FK 不单独保证这些语义。不能把首次 drill finished_at 用作新 operation 的起点，也不能把 task cleanup budget 与 operation budget 默认为同一值。 |
| 自动 backup staging | [方案:18、149](../system-backup-restore-division-plan.md:18)要求 staging 清理在成功终态/acceptance 之前完成；073:23–34 只有 lifecycle、cleanup_result、可空 operation link、claim、created_at/updated_at。 | 不能用 backup finished_at；它可能尚为 NULL。resource created_at 是 intent 创建时间，updated_at 随 claim/reconcile 改变，都不能证明首次清理线性化时间。D 可实现该状态转换的稳定首次时间/预算绑定及接管不重置，不需要用户另行设计。该复核不指定唯一迁移形态。 |
| 明文残留与完整性 | [方案:637](../system-backup-restore-division-plan.md:637)要求 PVC 删除后仍须 CSI/provider 证明承载明文数据的 PV 回收、删除或安全重置；[方案:631](../system-backup-restore-division-plan.md:631)要求恢复 creating intent 或将未知所有权告警。 | namespace 不是 volume 类型不代表它没有残留卷；不能只按 resource_type=volume_snapshot 计数，更不能用 namespace 已删/普通 404 代替介质回收证明。077 的 lifecycle/observed identity 无独立 PV 明文回收证明字段。D 可定义并校验绑定的只读事实输入；实际 CSI/provider 证明仍须对应执行者提供。 |

当前 `CleanupAlertCollection` 仅接收 Complete、ObservedAt、Age、ImmutableDeadline、ResidualVolume（`backend/internal/systembackupcontroller/controller_state_alerts.go:26–38`）；类型注释明确 owner collection/persistence 不在 predicate 内。本次对 backend 非测试 Go 的 cleanup_status / cleanup_operation_id 搜索只找到 DTO、read model 和 GC 引用，没有找到执行上述自动/显式清理 CAS 的实现。该搜索不等于对动态 SQL 或外部执行者不存在的证明。

D 现在可以具体推进：按上述分支建立稳定 owner 时钟和预算；补原子操作绑定；在同一一致读取时钟下完整枚举 owner 和资源，拒绝截断/未知/错 origin/错 target/无证明；将 provider 事实适配进只读输入并保留未知。已明确的七类资源、数值范围和首次自动 drill 起点不再列为“等待用户设计”。实际 provider 创建/删除、现场介质证明及真实整链仍不因源码映射成立而接收。

另：A2 本轮实际执行 `node docs/evidence/a-owner-current-support-source-review-20261027.mjs --check`，退出 0，确认 1720 份当前来源摘要 `6bf973bd11709b14fa04c13175aadfbd126020be3a10a8c514596b5dd29cb9ca`；原 1718 份来源与新增两份 PromQL 准备脚本分别保留各自验收范围。尚未发现本聊天手工远测日志目录，231 项 PromQL 未据此接收。
