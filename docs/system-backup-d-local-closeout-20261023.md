# D：排除远测的本地收尾

【2026-10-26 当前入口】准确 GC 实现、23项冻结原生验证、演练 tagged 修复及 A owner 本地最终签收已完成，原测试/构建产物已清理；修复后实际演练十九项由另一路限定接收。阶段来源为原2099，随后新增的 bootstrap candidate 消费代码仍须完成接线、测试和独立复核。准确边界见 [10月26日本地收尾](system-backup-d-local-closeout-20261026.md)。以下原轮次记录保持历史含义。

【2026-10-26 当前进度】旧 r4 已中断并准确清理，不是当前完整通过。私有 finalizer 与固定内部候选已落盘，修复完整动态可比较检查，保留最后 SQL 样本并新增中间回退/前进、原 reservation 台账及晚发引用等回归。新冻结来源 1,629 项，SHA `41b8e16788574aeebc44ec42890ed596624ea70bf179bd7708ca515e88d9dd16`。当前原生门禁尚未完成；运行中入口的 detached 点参数存在静态风险，是否影响本轮以实际 native 结果为准；原轮全部通过时直接接收，只有实际失败才启用同源修正补测。原脚本保持不变，不把局部通过记为全轮通过。准确状态见 `evidence/d-d-local-coordination-20261023.json`；最终仍需新来源完整验证、F1–F10 复审及产物清理。

【2026-10-23 writer 增量接收】[九项 writer 专项已接收](evidence/d-resources-writer-actual-accepted-20261023.json)，不再列为待重跑远测。其二进制、namespace 和清理均绑定独立 writer 轮次；本地完整包证据在 122 份输入及命令完全相同时显式跨轮复用，原损坏日志保留。独立补证检查 15/15，通过事实限无 FK、合成 proof 的九表事务存储专项；真实 FK、演练十九项、完整恢复和其他工作不因此完成。

【2026-10-23 readback 增量接收】用户另行补充原远测完整输出后，[十二项 readback 专项已接收](evidence/d-resources-readback-actual-accepted-20261023.json)。原损坏日志未改写；相同 122 份包/模块/合同输入本地补跑 71 根/843 条通过事件，产物已清理；接收器最新增量回归 64/64。无需重复远测这十二项。本补记仅覆盖隔离合成 proof 的读回存储专项，writer 九项、真实 FK、演练十九项及其他远测状态各自保持独立；下文“没有执行真实 MySQL”描述原本地收尾阶段。

本轮范围来自用户指令“做除了远测的部分”：完成可独立实现的 GC 装配前置、当前版本本地回归与编译、增量复核材料和交接更新。没有执行 SSH、kubectl、真实 MySQL、权限发放或生产启用，也没有安装依赖。正式合同/registry 及 A/B/C 签收保持各自原范围。

## 已落地实现与交接

- GC 删除工作拆为私有 `collectInTransaction`，复用传入事务；原 `Collect` 继续拥有连接和唯一 commit/rollback。新增完整 SQL/state 合成模型与 freeze owner 的组合回归，覆盖共同提交、工作后调用者拒绝、末次锁观察失败、最后删除失败及无关 context 前置拒绝。
- [GC 装配方案](system-backup-d-gc-work-handoff-20261023.md)逐阶段回应 A 的权限 profile、全局锁位置、唯一事务、metadata 完整性、末次守卫、未知结果、取消、容量和清理预算要求。该文是可审阅方案，A/D 联合批准仍待取得，不能由本轮代签。
- freeze 私有协议验证入口新增 A 的 typed nil 回归文件；旧两文件回执只保留原范围。
- 原完整门禁发现既有 HTTP fixture 的初始化时钟/容量期限与 native deadline 调度问题。现在只在首次 Admit 前采样模拟 SQL 时钟，并重新验证同一 signed header 的预期 oracle；public/internal 仍无 proof 要求。native expiry 对照保留正常原 reservation，在 buffered write 后、独立 result budget 开始前等待，再在末次 result clock 跨过原 deadline。producer 独立 result 容量报告按实际 SQL 样本更新；原 admission 行和 deadline 不变，另保留确定的 stale/fresh 容量与 stale SQL 反例。生产守卫和授权/保留时限没有修改。
- 资源恢复 readback、writer 的十二/九项实际专项已由独立回执接收，本聊天没有执行远测，不要求重跑。真实 FK 十项与演练十九项继续只描述本地准备，未把 seed/编译记成已运行 SQL。
- 四套接收器首轮 153 项保留历史日志；当前准确版本为 [157 项证明](evidence/d-readiness-receivers-8ebd755ee44f4c4caa08f2ec05b0047a.json)，64+52+27+14，来源前后核对、原始日志和退出全部绑定，最终汇总消费该证明，不重复测试。
- 已完成 A nonce/CA 非实现者评审及[准确 r2 增量复审](system-backup-d-a-nonce-ca-review-20261023-r2.md)，发现并关闭 D-A-CA-01 的 CA Binding 输出保护缺口。原修改意见和旧反例保留；该复审不批准原材料/实际权限/跨资源或生产。

## 验证入口与证据规则

新增本地专用入口，无远测参数：

```powershell
& .\docs\evidence\d-local-closeout-validation-r2-20261023.ps1
```

使用已有 Node/Go/模块缓存，禁止依赖下载。源码选择与原 `Get-DIndexSourceFiles` 一致，使用同步字节复制、前后集合/字节检查和快照后检；Node 复制器自身不启动子进程。测试覆盖完整 evidence、producer、resources、read、security、server 普通包；资源三个 seed、演练十九项 seed、原 Admin SQL seed；Linux resources、HTTP、SQL 探针、迁移 runner 与 server 编译。所有原生命令分别留存日志与退出，不以外层 exit 0 替代测试结果。

当前 r2 为 15 个独立原生命令：HTTP/native/producer 七根定向诊断、六个包逐包普通全测（没有 `-run` 或跳过）、三个 seed 阶段和五个 Linux 构建。Go 包串行 `-p=1`；全包测试进程上限 45 分钟，沿用 A 完整门禁预算，不改变代码里的五秒/原 admission/native/context 时限。PowerShell AST、实际调用表及原生句柄分别核对。`TEMP/TMP`、Go cache/tmp、源码及二进制均处于准确自有 owner，结束后清理。

每轮 receipt 记录准确 snapshot、步骤和二进制 SHA、owner 删除及零远测/零安装。最终汇总必须要求新回归根与子项通过、完整包通过、seed 精确命中、五份 Linux 二进制和来源后检齐全；不接收失败、跳过、仅编译或源码漂移为本地通过。并行源码变化只允许留下失败回执后新开一轮，不能修改历史结果。运行后删除本轮源码副本、缓存、临时文件和全部测试/构建二进制；保留交付日志和哈希清单。

完整门禁运行期间，使用 `d-local-closeout-cache-seed-20261023.mjs` 只读复制同工作区已有 Go 编译缓存至本轮自有 cache，逐条记录大小/摘要，先 data 后 action，以临时文件与原子链接发布且不覆盖已有条目。没有修改 peer 目录、重启测试、安装依赖或复用测试结果；所有实际测试继续 `-count=1`。复制出的缓存也是本轮产物，必须随准确 owner 删除。此操作只减少冷编译，不能替代源码、用例、退出码或清理证明。

上述复制属于失败历史轮；后续 handoff 的 5,725 条也随 c182 失败轮准确清理。当前 r4 使用新 53f39288 自有 owner/1,625 份来源，无复用已删除缓存。原 20 分钟全包轮的真实断言失败/超时，以及 c182 定向轮发现的非敏感分类采样错误，均保留日志与失败回执，没有覆盖为成功。新结果必须单独签收。

原包装器的源码复制失败及清理记录保留：`d-gc-work-full-local-20261023*-console.txt`、`d-local-closeout-drill-20261023*.json.result.json`、`d-resources-mysql-20261023-151235-75de10fc.json`。这些轮次在构建前退出，不能算作测试通过。

最终验证结果以本轮机器汇总为准；本文不沿用旧 68/826、71/843、102/976 或旧来源批准来背书当前新增代码。

并行任务后来修改了 `scripts/system-backup-a-nonce-bootstrap-validation.ps1` 和 `scripts/system-backup-d-independent-work-review.mjs`。本轮入口及六个 Go 测试包不调用或引用这两份独立验证器；最终复核单列它们的冻结/当前摘要，不声称全工作树逐字节相同。所有受测 backend、合同、夹具及实际执行入口必须保持准确版本；其他未知漂移仍拒绝。

## 移交给后续阶段的事项

| 事项 | 本轮完成边界 | 仍需取得 |
| --- | --- | --- |
| 九表 readback/事务 writer | 实现、本地准备；十二项 readback 与九项 writer 已分别按独立回执接收并核对清理 | 完整恢复仍需真实 B/C proof、启动门禁及其他完整整链要求；FK 专项另列 |
| 扫描任务 FK 排程 | A 已修复代码，本地回归和真实 FK 专项准备 | 带真实 FK 的改挂、晚失败/回滚；不以 CREATE TABLE LIKE 无 FK 专项替代 |
| 演练历史详情 | 历史 DTO/真实路由/前端，十九项专项及本地准备 | 十九项实际 HTTP/MySQL 接收与 A/B 准确版本增量评审 |
| GC | 同事务工作阶段、合成集成回归、D 装配提案 | A/D 协议/权限共同决定、真实锁观察/取消/接管、完整 metadata/Policy、物理容量、完整 Collect 验收 |
| 完整恢复与其余当前详情 | 保留现有接口、失败关闭和依赖交接 | B proof/runner/isolation/startup、C 四扫描表语义/provider/catalog、其余当前权威读源及四部署真实整链 |

本轮十五阶段不替代 A1 原 owner 的十三个 packaged seeds、同名 detached seeds 或 Linux evidence owner probe。已提供准确活动 source/cache/receipt 给 A1 在其自有命名空间补齐；双方不重复普通包或复用不相同来源的基线。原 owner 目录按用户要求在本轮结束后清理，不留长期编译产物。

原已接收的历史详情十六项、GC 前置/连接生命周期四十二项和前端合成浏览器验收不重跑、不扩大范围。B/C 未交付、原 strict gate 和原六项整体验收的不足不能记为 D 本地收尾已解决。
