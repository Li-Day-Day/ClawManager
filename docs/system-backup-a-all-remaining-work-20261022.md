# A 剩余工作执行记录

目标：执行本对话列出的全部剩余工作，保持原验收范围。对应机器进度为 `docs/evidence/a-remaining-work-execution-20261022.json`。进度记录不是批准或测试结果，完成须逐项查验原始证据。

本轮已收尾，按用户“做完这轮后先暂停”暂停后续工作，原范围保持。[收尾记录](evidence/a-round-pause-reviewed-20261022.json)核对 CA 候选本包测试、Linux 构建回执与准确 owner 缺席；未接生产、未代替非实现 owner 评审，27 个资源缺项保持。owner 2700 秒门禁以真实断言失败结束：EOF 场景预期 206、实际 403，evidence 包 735.025 秒后失败，未进入远程 SQL，准确 outer owner 已清理。固定夹具 SQL 时钟与生产五秒新鲜度检查可能有关，但尚未确定根因或修复；恢复后先诊断，不以重试或放宽生产期限关闭失败。

typed 引用层已按三个完整包、29 项现有向量、Linux 构建、374 份输入和清理完成限定接收；真实资源仍未准入。owner 15:33 本地轮的 900 秒框架超时仍保留[原失败独立回执](evidence/a-owner-local-timeout-reviewed-20261022.json)。仅 owner 专项框架预算改为 2700 秒，原全部测试/default vet/生产期限保留，派发回归在 PowerShell 7/5.1 均通过；后续真实断言失败不能归为同一次框架超时。

D 已以独立接收材料确认收到 A 六表“需修改”意见，没有改写原 request 或批准字段。D 后续 typed-nil 修复也已 [由 A 独立复核](evidence/a-d-resources-proof-presence-accepted-20261022.json)：十个旧失败叶子、十二项对照、修复后完整 resources 包 27 根/139 条通过事件、十八份当前输入/文件集合和准确清理均匹配；两份旧运行文件可由单条件反向恢复并匹配原 SHA。该结果仅签收缺失 proof 的拒绝，不改变六表策略结论、不认证真实 B proof 或恢复写入。

历史详情构建修复也已 [独立接收](evidence/a-verification-detail-build-repair-accepted-20261022.json)：原 1,569 份冻结来源、普通/游标测试、SQL seed、Linux 管理/HTTP 探针和迁移程序构建、冻结 postcheck、child exit 0 及准确 outer/观察到的 inner owner 缺席均核对。后来 owner-only 总预算改动可反向恢复并精确匹配原 harness SHA，没有扩大为当前整树通过。实际十六项仍待新远测回执；目录中新增远测日志在未出现完整结束/退出与清理材料前不接收，也不凭空文件判断进程已停止。

六表意见完成后，D 并行修改了 `control_exclusion.go` 和 `verifier.go`，旧来源检查准确拒绝。已从本轮仍持有的准确冻结源码找回原 SHA 对应字节，与其余来源组成 [31 文件历史胶囊](evidence/a-resources-normalization-source-capsule-20261022.json)；原方案、原意见和原回执均不改写。[漂移记录](evidence/a-resources-normalization-current-drift-20261022.json)单列新字节，尚未批准。`node docs/evidence/a-resources-normalization-review-20261022.mjs --check` 检查原评审；加 `--check-current` 才要求当前源码仍完全匹配，当前应拒绝。历史“需修改”不变成新运行代码的通过结论。

| 项目 | 本轮推进 | 尚须完成的原要求 |
| --- | --- | --- |
| D 六表的 A 安全评审 | [逐表意见](system-backup-a-resources-normalization-review-20261022.md)与[源码绑定回执](evidence/a-resources-normalization-review-20261022.json)已交付，六表均为“需修改” | D 修订实现后重新核对；B/C 各自的真实性、映射、能力和意见不由 A 代签 |
| bootstrap 安全资源 | [typed 解码与十五种单用途对应提案](system-backup-a-bootstrap-reference-binding-20261022.md)限定验证已通过；原合同仍为 draft；CA 候选本包及 Linux 构建通过、准确 owner 清理完成 | 具体解析/真实权限/能力、历史保留及跨资源校验；非实现 owner 评审；显式装配。当前 27 个缺项不因格式解码或候选代码减少 |
| owner 十一项实际 SQL | 新完整本地门禁真实断言失败，原日志保留，未进入远程 SQL | 先定位并修复 EOF 返回 403；再取得新完整来源基线独立接收、实际十一项、锁观察、同轮来源/二进制与 namespace UID/两端清理回执 |
| 历史详情十六项 | 查明用户 15:02 轮缺少游标实现；补齐普通/游标测试和 tagged 历史探针构建列表，原冻结门禁/构建及清理已独立接收 | 操作者用新时间戳完整实际运行、独立接收十六项；新来源不继承原冻结整树通过。原失败日志不能改成通过 |
| GC 四十二项 | [A 独立复核](evidence/a-d-gc-lifecycle-repair-reviewed-20261022.json)已确认原实际 41/42、整体退出 1；D 取消观察修复的两完整包 5,091 条通过事件、seed、跨平台构建与准确 owner 清理证据匹配 | 修复后的新完整 42 项实际运行及独立接收；freeze adapter 和完整 GC 仍未完成。原自定义 PASS 不算父测试成功 |
| 现场部署与真实整链 | 既有模板/采集入口继续复用；用户本轮确认安装受控材料“未准备” | 当前 config/原 grant/registry-ref 映射、受审镜像与连接、正式 SQL 身份/grants、data/report/journal 物理证据/容量/隔离、TLS、真实人登录/MFA/provider、HTTP 和恢复整链实际验收 |

D 的 GC 扫描结束修复也已运行既有两份离线复核：旧实现十二个准确失败叶子、修复后 26 条事件、完整 evidence 包 374 根/3,080 条通过事件及 owner 缺席均匹配。原整包包装器因 tagged 输入并发变化退出 1，保留该事实，只接收剔除未参与 tagged 文件后普通输入一致的范围，不拿此记录证明当前整树或新的 42 项 SQL。

不重复已接收的隔离审计十七项、角色十项、GC 任务资格十八项、原 freeze 前置三十四项和成本五项。新 42 项 profile 内保留原三十四项是完整专项的必需组成，不是把旧回执拼接成新成功。

现场缺材料时不生成假 apply 包、不创建代用授权、不拿功能测试 allowlist 当生产许可。需要原始凭据的 SSH 步骤由已有有权限操作者在原 PowerShell 会话输入，公共交接只保存受控路径和脱敏回执。此目标按用户要求暂停，没有登记整体完成；恢复时从上述真实失败和未完成项接续。
