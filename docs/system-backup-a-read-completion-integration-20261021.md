# A：读取事务提交后取消与合并验证

已完成[独立合并验收](evidence/a-read-completion-integration-accepted-20261021-r1.json)：稳定冻结 1,468 输入，SHA `d60a33c9af589ad886e560f2391832df409f771e37880fd4d1a6619776b98d7e`。五完整包 783 根/6,759 项通过，准确等于原 6,598 项加新增 161 项；security 255/2,011、evidence 365/3,008、read 76/680、producer 75/784、metadata 12/276。没有失败或跳过，默认 vet、包内/脱离源码 seed 各 22、Windows/Linux probe 与 Linux migration runner、前后来源校验、最终退出 0 均通过。自有源码/缓存/二进制目录已删除并独立确认，未安装依赖或执行实际 SQL。

owner/角色接收器保留第七份 SHA 固定普通基线，两包 620 根/5,019 项，原六份完整清单保持。新内存合成日志只验证接收逻辑，不计实际 SQL；[同步验证记录](evidence/a-read-completion-integration-receipt-readers-preparation-20261021.json)记录 owner 57、角色 43 项解析器与十一真实 CLI 拒绝。

清理后核对，全部 1,468 个原输入仍逐字节匹配；另发现并行新增 `backend/internal/systembackupread/task_check_control.go` 和 `task_check_control_test.go`，不在本冻结来源内，未由本回执接收。当前整树保持未批准，新来源仍须匹配受审普通输入，不能跳过新增文件的基线要求。

源码与反例复核确认：Go 的 `database/sql.Tx.Commit` 先检查事务上下文，再调用驱动 Commit，驱动返回后没有再次检查原请求上下文。因此驱动可以在请求取消后仍返回提交成功，读取者必须在交付结果前检查自己的原请求。

D 修改七份生产源码的八处提交判断，包含任务列表的空列表和非空列表两个分支。每处在原 Commit 返回错误之外，再检查 `ctx.Err()`，失败返回零值和 `ErrUnavailable`；缺失资源不返回已授权的 404，分页不返回游标或元数据。反向去掉这八个条件后与原冻结生产文件 SHA 一致，SQL、隔离级别、原授权及最终复查、提交次数、查询顺序均未改变。提交已完成后不声称回滚成功，不添加提交重试。

新测试经过实际 `database/sql` 事务和驱动 Commit 包装器，在驱动确认返回前取消原请求。40 种读取场景分别覆盖健康、提交时取消、提交错误，共一根/161 项；包含配置读取/历史/回填、Operation 详情/列表、Overview 控制贡献和四类任务详情/执行/控制/事件/列表及缺失/空结果。配置回填原有提交后检查，因此旧代码该项已通过；其余 39 种旧代码晚返回准确重现。原反例保留 39 叶子、39 场景父节点及总根共 79 个失败。健康与提交错误各 40 叶子通过，避免错误夹具使全部路径一概失败。

最早探针因缺失任务夹具选错 connector 而未完成；其准确自有进程终止记录、部分输出和退出 1 均保留，不接受为通过。r2 只修新测试夹具，再用同一份测试分别执行旧/修复生产版本。D r2 定向 1/161 与完整 read/security 两包 331/2,691 通过；本轮 A 另冻结合并的完整五包，将 HTTP、日志和连接修改纳入同轮集成，全部 6,759 项和构建/清理通过。

范围仍是读取完成边界。不能据此批准完整 Detail/Overview 的其他 owner 来源、实际 MySQL、完整 GC policy 或生产启用。

只读复核：`node docs/evidence/a-read-completion-integration-review-20261021.mjs --check`。
