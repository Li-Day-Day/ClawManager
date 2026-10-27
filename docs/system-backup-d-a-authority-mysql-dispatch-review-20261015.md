# D 对 A 新授权组合 MySQL 专项的分发复核

【r38 后续】新增 seed 和 tagged 编译已进入 A 最终本地准备，[D 独立接收](system-backup-d-a-authority-preparation-review-20261015.md)确认当前 1,265 输入无漂移、测试计数及清理。下文 r35 是当时分发/日志修正范围；其编译 pending 已由新本地证据推进，实际八项 MySQL 仍未执行。前端当前为 r37，等用户构建截图。

A 已在共享仓库新增 `TestAConfigMaintenanceAuthorityMySQL`、独立 phase、包装器和 `ConfigMaintenanceAuthorityOnly` 档位。D 不再复制该探针。本轮检查它与原 writer/security/storage/backfill-service 四个档位的分发兼容性，并修正一处新测试日志的证据表述；没有运行远端或 Go 构建。

[D r35 机器记录](evidence/system-backup-d-a-authority-dispatch-review-20261015-r35.json)、[原始检查日志](evidence/system-backup-d-a-authority-dispatch-local-20261015-r35.txt)和[检查前后固定的输入](evidence/system-backup-d-a-authority-dispatch-source-20261015-r35.json)记录 exit 0：原四个 D 档位、A 新独立档位及既有 11 项 evidence 分发全部通过。检查实际解析/求值脚本中的 assignment，核对准确 binary/seed/phase、三处 Bash preflight 声明、fresh 全目录入口、摘要绑定和混用档位在创建目录/构建/远端动作前拒绝。它不是实际 Bash 执行、Linux 编译或 MySQL。

## 当前新探针的限定范围

源码实际构造 `pinnedConfigMaintenanceAuthority`，并交给 `newConfigCanonicalBackfillService`，而非旧的 test-only admission。代码列出八组：错绑 grant、独立观察、同 grant 版本原字节漂移、归档验证代次变化、当前安装 catalog pin 变化，以及 grant/source/capacity 在暂存结果后的到期。

除前置错绑外，拒绝场景均要求在原 sql.Tx 中确认 canonical/双审计/收据已暂存，再触发错误并在事务结束后核对零提交效果。每组比较完整 installation_state，不改变 active/deployment/监控。独立观察分支在写授权拒绝后验证原字节观察，且不重新预留容量；写用途观察及写入回落观察均应拒绝。真实运行八组仍待准确冻结/构建及远端回执，不能把源码中的断言当作已经发生的 SQL 结果。

CurrentTarget 只有 UUID/database 检查来自 SQL，其 schema/catalog/ledger facts 仍为合成；grant/holder/archive/容量也仍是合成供应者。成功 marker 明确 `synthetic_verified_facts=yes actual_authentication=no production_approval=no`。复用 maintenance 输入胶囊仅用于 schema/表示和隔离准备，不能作为授权文档。

## 本轮实际修正

原通用日志在 `grant_target_mismatch` 分支也声称“actual SQL effects observed and rolled back”，但该分支在 archive/reserve 前拒绝，没有要求观察暂存写入。D 已仅拆分日志：错绑分支报告前置拒绝、无已提交效果；其余分支保留实际暂存/回滚表述，并继续受 `p.reached` 及 `f.assert` 约束。没有改变断言、SQL、等待期限或生产代码。

修改后的 Go 文件经现有 gofmt `-d` 解析通过、无格式差异，没有产生构建产物。当前摘要单独记录在 r35，与分发检查前的文件摘要区别保留。分发脚本摘要未变；本轮未取得该新 Go 摘要对应的 tagged 构建或真实 SQL 回执，不能借用 r34 的未加 tag 模型回归或旧七组服务探针。

没有安装依赖、自动 SSH 或重启操作者任务，也不请求重跑已接收的 writer/storage/index。前端 r33 摘要保持不变，供用户按原入口测试截图。r34 对私有 authority 本体的限定接收仍按自己的冻结输入成立；新探针/分发增量有单独的 pending 验证范围。真实运行授权、原 canonical 来源、生产适配和六项整体目标均未关闭。
