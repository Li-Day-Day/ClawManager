# A：canonical 回填事务编排候选

2026-10-16 更新：[A 具体授权组合八项 MySQL](system-backup-a-maintenance-authority-mysql-handoff-20261015.md)已[限定接收](evidence/a-maintenance-authority-mysql-accepted-sbk-mig-261016011333-1fdd.json)，实际调用本服务的 apply/observe，完整八项和清理均通过，不重跑。该 root 覆盖授权组合及相应真实暂存/回滚，不执行 D 的独立七项 root；下方旧 16:33 中断记录及其远端清理未知状态继续保留，不由新的 namespace 清理替代。真实授权/原文、正式迁移与生产接线仍未完成。

2026-10-15 远测状态更新：[16:33 操作者日志](evidence/d-canonical-backfill-remote-20261015163349.txt)在 17:23:39 以“管道已被停止”结束，[A 中断核对](evidence/a-canonical-backfill-mysql-interrupted-20261015.json)确认本地 Linux 编译已完成、准确 source/构建目录及 67 个 fixture 均已删除。日志没有七项实际 SQL root、namespace、远端成功或清理证据；不能记作通过，也不能由中断推断远端 scratch 未创建。本轮没有远端查询或重启任务。新增[八项 A 具体授权组合探针](system-backup-a-maintenance-authority-mysql-handoff-20261015.md)已单独完成本地准备，实际 MySQL 同样待操作者验收，两者不互相替代。

最新 [A grant/source 组合校验层](system-backup-a-config-maintenance-authority-handoff-20261015.md)已通过单独 r2 冻结回归：五个强制部署来源、完整绑定和原事实/截止复查，与本服务实际 SQL transport 组合的写入及独立观察均验证。完整 1,888 项检查、八项撤保护反例和准确清理见其限定回执。它不提供真实 authenticator、原归档、当前安装或容量适配，不把合成事实变为运行 grant；本服务的真实 MySQL 和生产门禁保持独立。

本增量依据 [A 原写入/回填合同](system-backup-a-config-canonical-write-handoff-20261014.md)，复用 D 已有的全行锁定读取和 082 维护收据存储，在 `backend/internal/systembackupsecurity/config_canonical_backfill.go` 实现私有事务候选。代码没有生产构造入口或 HTTP 路由；具体安装运行授权、旧 canonical 原文件及可信来源适配仍未交付。没有通过合成主体、grant 摘要、示例配置或可见的 hash 获得实际写权限。

## 完整调用路径

`apply` 是明确的新写尝试：

1. 在任何 SQL/权限/来源/容量回调前复制请求及完整原文字节，核对受信目标/installation/稳定维护 actor、请求摘要、准确原文 hash/size 和严格 ConfigValues canonical 形式。
2. 开启调用者拥有的 RepeatableRead 事务，读取准确 server UUID/database/数据库 UTC；要求用途专属的 `AuthorizeWrite` 验证实际主体、当前 grant/撤销/时间、原归档及 schema/catalog/migration pins，固定 admission 原截止。
3. 锁定并核对原配置全部列与 row fingerprint。查永久 key；已有同请求收据须再取得独立当前 observation admission，最终复查后返回原始字节，不补审计、容量或 canonical 写。不同 hash 保持 conflict。
4. 新请求生成随机 receipt/request correlation，向必需容量适配传递原文实际写入量、两条审计正文准确长度和收据最大合法长度。容量适配必须额外核算实际物理 row/index 开销、既有分配、并发预留及 installation 生命周期保留；这些 payload 长度不等于物理容量证明。
5. 重新核对原行；插入真实 intent 并取得该次 INSERT 的 ID；仅在原字段为 NULL 时做准确 target/id/version/hash/size 的 canonical 单列 CAS；插入真实 result，再原子暂存并重载维护收据。相同原文字节跳过 CAS，准确记录 wrote=false，仍有本次授权、容量和两条真实审计。
6. 复查预留、相同 grant/来源 admission、完整收据/审计/配置快照，再取得新的 target/UTC 样本；数据库时间不得早于内部收据扫描的最新观察，且须仍在原 admission/容量截止之前。所有回调结束后才提交；拒绝或失败回滚整个尝试。

审计和收据仍沿用原闭集脱敏表示，不保存原始 canonical、旧作者/原因、原归档地址或权限材料。原 066、081/082 提案、actor/grant/request/row/provenance 摘要和公开 Operation profile 不由本增量改变。

## 提交不明与独立观察

COMMIT 报错或确认后请求取消只返回空结果和私有 `config_maintenance_commit_unknown`，不返回推测的成功收据，也不自动重跑、重新生成 correlation、补写审计或转入观察。

调用者可以之后显式调用 `observe`：使用原 target/actor/action/key/完整请求事实和独立的当前 observation admission，在新事务中核对原配置与完整收据，最终重新授权后返回原收据字节。观察方法没有 INSERT/UPDATE/写容量调用；缺席经过最终授权/时间检查后返回 missing。原写 grant 已撤销时，单独合法的 observation admission 仍可工作；它不能通过 fallback 变为新的写授权。

这里的 `configMaintenanceAuthority` 和 admission 是部署内部依赖接口，不是新的 grant 文件、issuer、签名或来源认证协议。三个方法均强制存在，接口 nil/typed nil admission 或 reservation 均拒绝；测试适配是明确合成边界，不能部署为实际认证器。

## 数据库时钟贯穿

D 同期复查修正了本候选初版审计 INSERT 的精度：正式 `001` 的 `audit_logs.created_at` 为不带 fsp 的 TIMESTAMP，默认秒精度。向较低精度列写入小数时间通常会舍入，除非启用专门的截断模式，见 [MySQL 8.4 官方说明](https://dev.mysql.com/doc/refman/8.4/en/fractional-seconds.html)。初版 `UTC_TIMESTAMP(6)` 在半秒后可能进位，使审计时间晚于紧接着采样的收据时间。当前审计 INSERT 改为整秒 `UTC_TIMESTAMP()`，数据库准入/截止与收据 DATETIME(6) 仍使用微秒时钟，正式表不改。D 新增半秒、秒末和跨日四个独立精度用例；该修订与本轮 SQL 时钟传播同时纳入 r2，首轮不能为这项修订背书。

收据存储增加私有 `recheckAt`，返回本次成功复查的最新 SQL 时间；原 `recheck` 保持原签名。missing 使用可由 `errors.Is` 识别的私有 absence error 保存内部原行扫描时间，不返回可用收据。事务服务将这两种观察传递到最终 clock 下界，避免只和更早的入口时间比较而放过局部时钟倒退。错误正文仍为固定码，不附带目标或原文。

## 验证与保留范围

操作者后续 [15:25:47 存储专项](evidence/d-maintenance-receipt-remote-20261015152547.txt)已由 A [限定接收](evidence/a-maintenance-receipt-mysql-accepted-sbk-mig-261015074138-2f70.json)：7 个顶层场景、9 个约束子项、真实 config 行锁等待、完整 migration 和清理均核对。该探针调用 D 的测试编排及私有 storage，不调用本服务的 apply/observe，也未包含本轮后补的最新 SQL 时钟传播和审计秒精度修订，因此不能用来关闭本服务的真实 MySQL 验收。

[A 独立 SQL transport 测试](../backend/internal/systembackupsecurity/config_canonical_backfill_a_test.go)覆盖 NULL fill/no-change 的完整顺序、只改单列、真实 INSERT audit ID、容量 payload、原字节重放、写与观察权限分离、两种未知提交结局、整笔回滚、缺失/typed nil 适配、永久 key、回调字节所有权、撤权/来源漂移、最终 SQL row/audit/canonical 漂移、原截止不续期，以及正常/倒退数据库时钟。测试 transport 自行保留已提交状态，后续观察回滚不会删除历史收据；它不证明 InnoDB 约束、并发或原子性。

[冻结验证脚本](../scripts/system-backup-a-config-backfill-service-validation.ps1)先跑定向用例，再用两个独立临时 Go overlay 验证四项最终截止和两项最新 SQL 观察的有效反例，随后运行未修改副本的完整 security/config 两包及默认 vet。首轮冻结后补了 SQL 最新观察传播，因此首轮即使通过也不是最终候选验收；最终回执须绑定包含该修订的后续清单。所有轮次保留原日志/清单，结束删除自有 cache/tmp/telemetry、overlay、源码和测试产物，不安装依赖或自动 SSH。

完整事务候选通过本地验证也不关闭实际主体/grant/source/capacity/retention 适配、082 真实 MySQL、081/082 正式迁移及生产部署门禁。D 的纯维护收据探针与本服务的全部调用路径分别验收，不能将先前 writer 14 项或旧存储模型的 PASS 当作本次真实数据库证明。

D 已另行准备[完整事务探针与操作者命令](system-backup-d-config-maintenance-receipt-review-20261015.md)，使用专属 `-BackfillServiceOnly` profile。它的 tagged 编译、Linux 二进制/胶囊与实际远测按其自身冻结回执接收，不据本页普通 Go 回归认定已完成；A 本轮未执行该远程命令。

操作者 16:03:58 的[完整事务尝试](evidence/d-canonical-backfill-remote-20261015160358.txt)已因 SSH 不可用在启动前终止，见[A 独立范围记录](evidence/a-canonical-backfill-mysql-not-started-20261015.json)：本地准备完成，但没有 namespace RUN 或服务 MySQL root，67 个本地 fixture 路径和准确源码 owner 已确认清理。它不是数据库断言失败或真实 SQL 通过。16:33:49 的[新尝试](evidence/d-canonical-backfill-remote-20261015163349.txt)另用新时间戳；没有完整新回执前，不关闭本服务 MySQL 待办，也不重跑已接收的 writer/纯收据专项。

## r2 冻结接收

[最终本地日志](evidence/a-config-backfill-service-local-20261015-r2.txt)和[限定验收记录](evidence/a-config-backfill-service-review-20261015.json)固定 1,258 项输入，摘要 `0e4f973709ed91234f8009053f0e060de9deec1990e224394aa41500a9b4ddd5`。定向 11 主测试/50 子用例通过，包括 D 新增审计精度用例；未修改副本的完整 security/config 两包 239 主测试/1,558 子用例，共 1,797 项检查通过。定向与完整套件重复覆盖不叠加。两个 overlay 分别检出四项最终截止和两项最新 SQL 观察的准确断言失败，均为预期 exit 1；正常门禁默认 vet、exit 0，无工具或断言重试。

本轮 `.tmp-a-evidence-88f451ba05524945a10bbd78625d2d4e`、`.tmp-d-index-cache-c120124a3deb4d79859250ac2635c4d5` 及其源码/cache/tmp/telemetry/overlay 已删除，92 个不同 fixture 路径独立确认不存在。12 项重点实现/测试/DDL/工具 pin 与当前文件匹配，原 A 写入合同、维护摘要合同和正式 066 原字节不变；归档时只有 D 后续 `config_maintenance_receipt_mysql_test.go` 与冻结版不同，该改动另验。未执行 tagged MySQL 编译、SSH、实际回填、签发 grant 或生产路由装配。

[首轮日志](evidence/a-config-backfill-service-local-20261015.txt)及[替代记录](evidence/a-config-backfill-service-superseded-20261015.json)保留原冻结 1,254 项输入：完整 234/1,548（1,782 项）通过，四项截止反例有效，准确目录及 92 个 fixture 清理。首轮未包含 SQL 最新观察传播、提交取消、输入预算及 D 审计精度修订，不据此接收最终候选；本次没有覆盖或改写它的历史结论。
