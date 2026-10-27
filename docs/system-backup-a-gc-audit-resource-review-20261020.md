# A：GC 审计 resource_id 的独立类型回归

【2026-10-20 16:24 独立验证已完成】[r4 独立回执](evidence/a-gc-audit-resource-accepted-20261020-r4.json)接收新冻结 1,446 输入，SHA `04c9f4e42ba2df4bef2192eed1e70b84d66fd5a64cc8d21723199176d1e939df`。正常四项检查、三组 overlay 错误注入及 evidence 完整包 332 主/2,800 含子项全部满足各自预期；普通检查无失败/跳过，注入检查只有指定断言失败，没有编译错误或其他失败。默认 vet、`-count=1`、冻结来源后置核对、最终退出 0 和全部自有源码/缓存/overlay 清理齐全，未安装依赖或执行远测。归档时当前全部构建输入集合和字节匹配，但不据此声称整个工作树或完整生产 GC 已验收。

这补齐了先前“正向用例通过，但错误注入尚未执行”的缺口：把 INT 错改为 VARCHAR 会准确触发 `published_int`/`wrong_type`；重新引入公开 SOP 与整数列比较会触发 `published_int`；放行未发布 FK 会触发 `unexpected_fk`。正式 001 的 INT 与外层重新固定 metadata pin 的前提均独立核对，不用模型自身的期望表证明正式类型，也不把任意提前拒绝当成正确反例。

验证工具现在只以 `gofmt -l` 检查格式，不再写工作树；五阶段都在只读源码副本内执行。工具在 `docs/evidence` 中，不属于远测冻结输入。r4 使用 3,841 份既有编译缓存文件的只读副本，测试全部实际重跑；复制的缓存由本轮接管并在 finally 清理，中转目录也已删除，原 D 缓存未移动或删除。不受信的工作区根目录被缓存接管守卫拒绝，未开始 Go 或移动路径，准确临时目录已清理，见[反例日志](evidence/a-gc-audit-resource-20261020-cache-guard-native.txt)。

下文 r1/r2 的失败与暂停属于历史状态；r3 的完整包失败也保留，不改记为通过。当前完成范围以 r4 的原始日志、JSONL、来源和回执为准，实际 SQL、受限角色、完整 GC policy 与生产批准继续待交付。

本轮发现新的直接引用组件把 `audit_logs.resource_id` 期望为 VARCHAR，并用公开 Operation ID 查询它；正式 `001_init_schema.sql` 的该列为 INT，后续正式迁移没有更改这一类型。此前模型用 `gcDirectColumns` 自身生成列类型，因此不能发现这种期望与正式 schema 的差异。

核对写入端后，采用并行实现中的修正：保留 INT 元数据校验，移除公开 `sop_...` 与遗留 INT resource 的错误比较。`downloadIntentInsertSQL` 等备份审计写入将 resource_id 留为 NULL，公开 Operation 身份位于 JSON；不能因存在一个整数列，就推断它绑定私有 Operation 主键。此处不新增这种未发布的数值关联，也不修改正式表或迁移。

## 独立回归范围

新增 A 测试 `TestAGCDirectAuditResourcePublishedInteger`，直接以正式 INT 覆盖模型列类型，不从生产期望表推导这一事实：

1. 正式 INT、原组其他条件满足时可回收，且实际记录的引用查询没有错误的 legacy resource 比较。
2. 列改为 VARCHAR 后，即使重新采集外层结构指纹，内层关闭的引用目录仍拒绝。
3. 给该列新增指向 Operation 私有 PK 的未发布 FK 后，即使外层重新采集 pin，仍拒绝；合法列类型不等于允许任意新 FK。

验证脚本计划在拥有的临时目录中用 Go overlay 分别注入错误类型、重新引入公开字符串比较、放行未发布 FK。每次只运行独立 A 根，并要求恰好预定叶子失败；编译错误、其他测试失败或跳过均不算成功抓到错误。overlay 不改工作树，结束后与快照、缓存一起清理。只有定向回归和错误注入验证均通过后，才对原来源运行 evidence 完整包和默认 vet。本轮在定向回归失败后停止，没有执行这些后续阶段。

## 历史验证状态（r1/r2）

本轮已结束，结果为失败，按用户“做完这轮先停一下”的要求暂停。首轮在测试前因为并行实现变化触发精确 counterfactual 绑定检查而停止，exit 1 和清理记录保留；没有执行 Go 测试/构建阶段。

第二轮冻结来源 1,445 个文件，SHA-256 为 `4c7d1c7664dc8c84498883f315b470310b7c979b8451c0560e1b54a7773309d6`。离线、默认 vet 的定向测试实际运行三个子用例：`wrong_type`、`unexpected_fk` 通过，`published_int` 返回 `permission_denied` 而失败，根测试随之失败，退出码为 1。没有编译错误或跳过；错误注入三个阶段、完整 evidence 包及最终来源后置校验均未执行。两个拒绝用例通过不能证明拒绝来自预期的内层规则，仍需正向用例和错误注入验证支持。

独立核对已重算来源清单摘要，核对原始 JSONL 的运行、通过与失败集合、退出和清理标记，并确认本轮拥有的快照、构建缓存及 overlay 目录不存在。没有安装依赖，没有远程执行。失败原因目前只定位到正向用例被拒绝，尚不能判断是 A fixture 还是 collector 整合问题；恢复工作后应先调查这一点，不将本轮视为通过证据。

失败记录：[a-gc-audit-resource-failed-20261020-r2.json](evidence/a-gc-audit-resource-failed-20261020-r2.json)。原始日志和来源清单保留在 `docs/evidence/a-gc-audit-resource-20261020-r2-*`。

## r3 失败与 r4 新轮

[r3 失败回执](evidence/a-gc-audit-resource-failed-20261020-r3.json)固定 1,446 输入，SHA `019ccdc41fa9767b8edc3ac18fca96e32962b9bb0fdf96d345f5fe0f4143be6c`。正常四项和三组错误注入均符合预期；完整包 2,798 项中 2,785 通过，`TestDownloadRetentionGCTaskCollectorLateArtifactDependenciesRollback` 的十二个子用例及根共十三项失败。该旧测试把 ExecContext 的写入语句放到读取查询历史中查找，实际报错为 `concrete dependency guard/target write not exercised`；源码后置核对未执行，整体退出 1，自有产物已清理。

当前 D 测试改用实际写入历史，并更严格比较原 Operation、admission、nonce、result 与两条 audit 的回滚结果。r4 重新冻结并执行全部五个阶段，没有沿用 r3 的普通包通过结论；原十三项在新完整包中全部通过。相对 r3，变化的是两份 D 测试和 D native 验证脚本，业务源码相同。新回执逐项核对每个 RUN 的终态、准确的预期失败集合、两份历史失败、正式 INT、来源摘要及全部自有目录缺席。

本轮不执行实际 MySQL，不验证 SQL 的真实类型转换、受限角色、范围锁或完整 GC policy。真实 SQL owner 十一项、早期受限账号十项继续按原顺序等待用户回执，不增加已通过九项/二十四项的重复远测。当前 collector/reference 整合仍须自己的来源、完整回归及现场验证，不能仅凭这里的模型检查批准生产删除。
