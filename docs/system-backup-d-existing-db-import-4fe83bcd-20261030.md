# D 独立交付：`4fe83bcd` 现库导入 profile

状态：已固定现场完整 ledger，并完成对 `4fe83bcd` Git blob 原字节的只读审计；
未执行现库迁移，未取得现库可导入证明。
此工作不包含 Runtime 镜像下载、构建或部署。

## 已核对的拒绝边界

- 现场测试库为 MySQL 8.4.8、`clawmanager`、server UUID
  `f1f5f76a-95f5-11f1-b08e-366835b4a029`；用户只读查询给出的
  `schema_migrations` 为 **97 行**，包含
  `080_add_system_backup_registration_runtime.sql`，并存在
  `system_maintenance_participants`。按 `ORDER BY filename` 导出的文件名
  LF 列表 SHA-256 为
  `5d303453289c28d0b8abf7abab8b3abe15ad605079feb01e599d919b53068903`。
  这些是 ledger 身份证据，不构成 schema 或数据等价证明。
- 现场完整文件名列表保存在
  [d-existing-db-ledger-20261030.txt](evidence/d-existing-db-ledger-20261030.txt)，
  恰为 97 行；审计脚本在运行前校验上述完整文件 SHA-256，拒绝 CRLF、
  重复项、非 ASCII 名称及输入变更。该列表来自用户在远侧的只读查询，
  尚未通过独立数据库连接再次采集。
- `4fe83bcde5a8a693dddb2635e9a3e397d6e3472e` 中旧备份迁移以
  `065_add_system_backup_control_metadata_core.sql` 至
  `080_add_system_backup_registration_runtime.sql` 命名；当前仓库迁移
  包含重编号的 `096_backup_v2_*` 至 `109_backup_v2_*`，还增加后续迁移。
  文件名相似不证明 SQL 或现存数据等价。
- 该 Git 提交的数据库迁移目录有 **137 个 SQL 文件**，其中 081、082
  在现场未应用；即便只取其余 135 项，现场 97 项也并不相同。
  当前目录有 168 项，旧目录中有 20 个文件名不再存在，当前目录有 51
  个新增文件名。不能把现场当作“4fe83bcd 仅缺 081/082”的库。
- 实际集合核对：现场 97 项中 **3 项不在 `4fe83bcd`**（
  `045_update_workbuddy_windows_runtime.sql`、`046_add_instance_pvc_name.sql`、
  `047_add_instance_runtime_variant.sql`）；旧提交有 **43 项未在现场 ledger**；
  现场有 **21 项不在当前 catalog**，当前 catalog 有 **92 项未在现场 ledger**。
  现场与旧提交及当前 catalog 的三方同名 SQL **0 项原字节不同**。
  此比较只对旧提交中能找到的原始 blob 成立；那 3 项的执行 SQL 来源
  尚未确认，原字节、摘要及 schema 效果仍需单独核对。
- 当前 `MigrationHistoryReview` 仅允许“当前 catalog 全部已应用、仅
  `109_backup_v2_add_system_backup_registration_runtime.sql` 待应用”的
  特定场景。现场 080 ledger 不满足这个合同。普通
  `system-backup-migrate --apply` 会拒绝未知历史项；不能为了让它通过
  而改写历史 ledger、直接重放旧 SQL，或仅替换 source SHA。

## 可重复运行的本地只读审计

在仓库根目录运行（无需现场数据库凭据，也不会写数据库）：

```powershell
py -3 -B scripts/system-backup-d-legacy-ledger-audit.py `
  --ledger-file docs/evidence/d-existing-db-ledger-20261030.txt `
  --expected-ledger-sha256 5d303453289c28d0b8abf7abab8b3abe15ad605079feb01e599d919b53068903
py -3 -B scripts/system-backup-d-legacy-ledger-audit.test.py
```

脚本直接从固定 Git 提交读取 blob 原字节；Windows `git archive` 会在这个
仓库导出 CRLF，不能用其输出计算旧 SQL 摘要。JSON 中
`schema_equivalence_verified=false` 与 `migration_authorized=false` 是固定
拒绝边界，不是可更改的准入开关。

## 两条环境路径

**空白隔离测试库**：创建独立 MySQL 8.4.8 实例及空库，记录其真实
`@@server_uuid` 和 `DATABASE()`，使用当前构建内嵌 catalog 的
`system-backup-migrate --catalog-only` 取得精确 SHA，然后用独立私有
DSN 文件调用 `--apply`。此路径从空库顺序执行当前 migration；不能把
测试环境已有的 080 库称为空库，也不能把测试库原 server UUID 复制成
新库授权 pin。

**现库升级**：先制作隔离的数据库副本并保留原始迁移 ledger、表定义、
索引、外键、数据行数及关键主键/外键关系。导入 profile 必须固定原
server UUID/database、原始历史 SQL 字节与摘要、当前 catalog SHA、
审核人及审核引用；逐项证明旧迁移的实际表/列/约束和新版预期的关系，
为差异提供版本化 DDL/数据修复。先在副本上执行并验证可重跑、失败后的
恢复和应用查询；再制定现场升级及回退步骤。新库初始化成功不替代这条路径。

## 本 profile 的交付出口

1. 已从 `4fe83bcd` Git blob 提取该提交的 137 项 SQL 原字节摘要，并与现场
   **完整** 97 行 ledger 核对文件名；仍需定位 3 项额外历史 SQL 的真实
   来源，并采集现场实际 schema 与数据关系，不猜测 ledger 或表结构。
2. 固定旧→新版本化映射；对创建表、列类型、唯一键、外键、索引、默认值、
   时间语义及已有数据做差异测试。无法证明等价的项明确列为修复 DDL，
   不自动标为已应用。
3. 用隔离 MySQL 副本验证 080→目标 catalog 升级、重复运行、部分 DDL
   失败恢复，以及用户、实例、runtime binding、participant 主键和关系保留。
4. 提供独立的 `--preflight`、`--apply` 输入和现场回退命令；均绑定实际
   server UUID、库名、catalog、历史 SQL 摘要。输出不能含 DSN 或密钥。

第 1 项仅部分完成，第 2–4 项未完成，因此现库升级和备份准入仍关闭。
