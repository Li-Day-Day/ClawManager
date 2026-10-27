# A：canonical 维护收据的审计锚点复查

【2026-10-15 存储专项真实 MySQL 已接收】[操作者新日志](evidence/d-maintenance-receipt-remote-20261015152547.txt)的 7 个顶层场景和 9 个约束子项均 PASS；准确配置行的 InnoDB 锁等待已观察，94 个正式 migration 重放成功。A 独立核对 binary/inputs/source 摘要、准确 namespace/UID 清理、7 份 owned installation 行清理及 67 个本地 fixture 路径不存在，见[限定接收](evidence/a-maintenance-receipt-mysql-accepted-sbk-mig-261015074138-2f70.json)。这是旧冻结存储候选的真实 SQL 证明；本页下方当时的“082 真实 MySQL 待办”据此关闭该存储范围，无需重跑。新的[完整回填事务候选](system-backup-a-config-backfill-service-handoff-20261015.md)、审计秒精度与最新 SQL 时钟传播另验，真实 grant/归档来源和正式迁移仍未交付。

评审范围是 D 的私有 082 收据存储组件及调用者事务内的复查，不是完整回填服务、实际来源认证或运行授权。原 [A 写入合同](system-backup-a-config-canonical-write-handoff-20261014.md)要求最终 guard 重新核对审计；[D 存储候选](system-backup-d-config-maintenance-receipt-review-20261015.md)已核对真实审计行、准确作用域、闭集脱敏正文及时间顺序。

## 发现与修订

此前组件固定了两个 audit ID、收据正文和收据时间，但每次重载仅验证审计时间满足 `intent <= result <= receipt`。在调用者自己的同一事务中，后续 SQL 仍可修改已经锁定的审计行。把 intent 或 result 时间替换为另一个仍合法、仍有正确顺序的 UTC 微秒时间，不会改变 audit ID、正文或收据，旧检查无法发现这类替换。

`config_maintenance_receipt_sql.go` 现在将首次验证得到的 request correlation、intent 时间和 result 时间存入私有 `configMaintenanceAuditPair`。暂存 INSERT 后重载必须与 INSERT 前的两条审计观察一致；已有收据快照的最终 recheck 必须与原观察一致。比较使用时间瞬间 `Equal`，不把 Go location 对象身份当作 SQL 事实。公开收据、摘要算法、唯一键、DDL 及原合同字节均不因本修订改变。

## 独立检查

[A 测试](../backend/internal/systembackupsecurity/config_maintenance_receipt_a_test.go)从原模型取得独立 SQL 审计事实，在两个边界分别尝试四种合法时间替换：intent 提前/推后、result 提前/推后。所有替换保持原审计 ID、原闭集正文和合法时间顺序；Stage 必须返回 unavailable 和空快照，最终 recheck 必须失败，存储组件不能自行提交、回滚或补写。

正向检查将 SQL JSON 的空白压缩，并把时间换成等价的零时区 location，要求通过且保留原收据字节。这避免把 MySQL JSON 的合法序列化差异当作审计事实替换。

[冻结验证脚本](../scripts/system-backup-a-config-maintenance-receipt-validation.ps1)先运行维护收据用例，再通过临时 Go overlay 仅使两处时间绑定拒绝条件失效，要求准确出现上述八个断言失败及 exit 1；编译错误、其他测试失败或没有执行八项均不算有效反例。随后使用未修改副本运行完整 security/config 两包，默认 vet，不安装依赖，结束清理本轮 cache/tmp/telemetry、overlay 和源码副本。实际结果及源码 pin 以 [本轮日志](evidence/a-config-maintenance-receipt-local-20261015.txt)和后续限定验收为准。

## 冻结验证结果

[限定验收记录](evidence/a-config-maintenance-receipt-review-20261015.json)固定 1,250 项输入，源码摘要 `d96af5e141bb8a9c68533768a39c421f27e7c43a750627b27f2874e7c2888fd8`。定向 14 主测试/121 子用例通过；完整 security/config 两包 227 主测试/1,508 子用例，共 1,735 项检查通过。定向与完整套件有重复覆盖，不相加。撤保护分支准确出现四项 Stage、四项 Recheck 的断言失败，进程 exit 1；原始冻结源码未变。正常门禁默认 vet、exit 0，无断言或工具重试。

两处准确 owner（`.tmp-a-evidence-a4218184e67f42afb6949a36f02d2855`、`.tmp-d-index-cache-54e6a15c5d8b45658c1d637ca243ede2`）均已删除，日志的 92 个不同临时 fixture 路径独立确认不存在。九项收据/行读取/摘要/DDL/本轮验证工具输入与当前文件匹配，原 A 写入合同、维护摘要合同和正式 066 的原字节均保持不变。

验证期间 D 的维护收据 MySQL 探针、共享 validation 和两份 writer 派发文件发生后续变更，并新增 maintenance phase 脚本。这五项不据本轮接收；本轮也没有执行带 MySQL tag 的编译或真实 MySQL。已有 writer 14 项远测属于此前冻结候选，不覆盖本次审计时间修订。

## 剩余边界

这些检查使用实际 `database/sql` API 和测试 transport。它们不证明真实 InnoDB 并发、审计/收据/原文的原子提交或未知 COMMIT 观察；082 隔离 MySQL 探针另行验收。审计内容验证也不能证明其 ID 确由当前维护事务新插入，该事实仍须由完整事务服务保存真实 INSERT 结果。

后续服务仍须提供独立认证的维护主体、用途写授权/观察授权、原 canonical 文件和可信来源、目标/schema/catalog/migration pin、容量与保留策略、NULL→准确原文的唯一写入和最终授权/source guard。此修订不创建这些材料，不签发 grant，不挂载路由，不安装 081/082，也不执行历史回填。
