# D 校验详情历史观察的一致性校验（2026-10-22）

状态：一份运行文件与一份新测试已写回工作区，隔离和写回后的完整包验证通过，临时源码、缓存和测试构建产物已精确清理。现有 artifact-verification 历史详情和报告登记绑定已经实现，本轮补其共同控制读取层中的跨字段约束，不建立另一套报告读取，也不改公共 schema、迁移或生产权限。

原 validDetailObservedArtifact 只核对状态和原因各自属于闭集、usable 与 none 是否配对，因而 staging、deleting、delete_failed、deleted、corrupt 均可能与 usable=true/none 一起通过。公开详情直接使用这份历史投影，会把矛盾记录呈现为可用。已有 backup 详情及 promotion 控制验证都要求可用 backup 处于 committed；历史观察也不能用可用标记解释一个非 committed 状态。

另一个缺口是 restored_usable 只有 enum 校验；原公共 builder 阻止 health 的 false→true，但共同控制贡献仍会接受该变化，也会接受 health/已可用/仍不可用/变为不可用的“恢复”标签。本轮把必要条件置于共同读取层，后续 builder 只能收到一致的贡献。

新增规则：

- 有本地 backup 生命周期状态时，usable=true 必须对应 committed；usable 与 none 的原有配对继续核对。
- health 不得把 false 变为 true。
- decision_reason=restored_usable 必须同时为 full、usable_before=false、usable_after=true。

catalog_import 的本地 backup 状态仍为 null，并保留合法的已记录可用/不可用布尔值。现行机器合同与 067 迁移的 usable_before/after 均为非空 boolean；本轮不将其改成 nullable，也不根据前端的防御性显示逻辑推导后端合同。全量校验的合法恢复、保持可用及仍不可用等观察应原样返回。

没有追加 SQL 或读取当前 provider。矛盾记录在原 RepeatableRead 事务中返回零贡献/ErrUnavailable，跳过后续详情构造与最终授权重查，不提交事务，原事务回滚；不修写数据库历史。完整合法记录继续走原授权重查和提交边界。公开 HTTP 沿用既有错误映射，不把坏记录序列化成部分详情。

两个新增测试根覆盖私有控制读取和公开校验详情。非 committed 的 before/after 组合共 20 项；backup/catalog_import 的恢复决策矩阵共 48 项。full 夹具同步调整 check mode 为 artifact_full，避免错误的模式绑定掩盖实际断言。原代码对照实际准确失败 44 个指定叶子，24 项合法或既有拒绝行为控制均通过；这不是编译或夹具故障。

此为历史字段一致性校验，不证明写入器确实读取同一 immutable version、不授予 C 状态变更权，也不声明该对象现在可下载。原数据写入/生产角色/真实 SQL/完整三类其余详情和原六项仍按各自证据验收；不改旧 eligibility 或批准字段。

验证证据前缀：docs/evidence/d-verification-consistency-20261022-c679b793。候选先在冻结来源中运行原代码对照和完整 systembackupread 包，再精确写回一份运行文件及一份新测试，运行当前完整包并核对选定输入前后摘要。仅用已有依赖，所有测试/构建与临时源码统一放在准确 owner 下，结束后精确清理，最终以准备/native 回执为准。

最终本地结果：新增两个根测试及 68 个子场景全部通过；隔离与写回后完整 systembackupread 包各 97 主/943 条通过事件，default vet、268 项项目输入及保守运行资产和文件集合前后复核通过。冻结来源共 1558 份，SHA-256 为 b6213d78bc7b90868c4139ec1069d341892b30b97ae56b62ed655ca4d226d12e，不将其他 Owner 的并发来源等同为整棵当前工作树的验收。

[准备回执](evidence/d-verification-consistency-20261022-c679b793-preparation.json)、[native 与清理回执](evidence/d-verification-consistency-20261022-c679b793-native.json)和[独立复核程序](evidence/d-verification-consistency-20261022-c679b793-review.mjs)保存原始/测试后字节、完整测试和反例结果。本轮准确 owner 及 2915 份文件已删除，另以文件系统 stat 确认目录不存在。未安装依赖或执行远端 SQL；读取层对这些矛盾记录返回 ErrUnavailable，既有 HTTP 映射为 503/not_ready；实际生产来源、C 同版本验证及完整端到端仍待验收。
