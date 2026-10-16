# D：canonical 回填的事务内旧行扫描与复查

本增量接收 [A 行指纹/来源摘要交付](system-backup-a-config-backfill-identity-handoff-20261015.md)及[修订 2 的正式 CHECK 约束](evidence/a-config-backfill-identity-contract-20261015-r2.json)，补上真实 SQL 行到 `a-config-canonical-backfill-row.v1` 的转换。实现位于 `backend/internal/systembackupsecurity/config_canonical_backfill_row.go`，为同包后续维护事务使用的私有组件。它只读取调用者提供的事务；不开始、提交或回滚事务，不更新配置，不创建收据或授权，不安装 081/082，也没有 CLI/HTTP/生产接线。

## 实际扫描边界

先冻结 2..262144 字节的准确 JCS 原文，再核对连接的 server UUID / database。按准确 installation / version 执行 `SELECT * ... FOR UPDATE`，读取完整旧行。选择完整行是为了主动发现新增、缺失或重复列；不从输入 ConfigValues 拼出“正确旧行”再声称数据库匹配。

当前闭集为正式 066 的 137 列，加独立 081 候选的 nullable canonical 列，共 138 列。列名排序、LF 连接且无尾 LF 的 SHA 为 `652956166534da92c7545d04b057310cc0f62029baa4b6d15ea41c39b69c4356`。列集合漂移立即拒绝，不能静默忽略新不可变列。这个闭集不是已安装 DDL / catalog 的批准；正式 writer 仍须独立验证受审 schema/catalog/migration pins。

遵循 A 修订 2 和正式 066 的 OCTET_LENGTH CHECK：created_by 为 1..128 UTF-8 字节，change_reason 为 NULL 或 1..512 UTF-8 字节，拒绝空非 NULL 原因，不按 VARCHAR 字符容量放宽。SQL 行 ID 以完整 unsigned-64 十进制保留；version / row_version / size、nullable copied_from、created_by、nullable change_reason、UTC DATETIME(6) 及全部 126 个展开列均来自实际扫描。拒绝 float64、缺失、损失小数位、时间偏移/舍入和不匹配值。调用 A codec 核对原 hash/size、完整 canonical、全部展开列，并只保留内部行摘要；不记录或返回包含旧原因的行指纹 JSON。

canonical 列另行区分 SQL NULL 与准确原文。空字节不是 NULL，已有不同字节拒绝；same-byte 观察也不代表允许 no-change 写入。数据库结束时的身份与 UTC 时刻在同一个查询中核对。私有结果绑定准确 `sql.Tx`，最终复查重新扫描全部原行并比较不可变摘要、canonical 状态和单调时刻；即使 NULL→原文也会被这个只读复查视为变化。合法写事务须另外显式执行唯一允许的转换，并原子持久化真实 audit / maintenance receipt。

列名和输入字节都在 SQL 回调之前冻结。已核对本机 Go 的 `database/sql.Rows.Columns()` 直接返回 driver 名称 slice，而 Scan 到 `*any` 会复制 byte slice；本组件独立复制列名，防止 driver Close 复用缓冲区改变已验证的列/值对应。取消、缺行、多行、读取/Close 错误、最后目标变化均返回完全空的观察结果，保持调用者的事务所有权。

## 授权和来源仍独立

这个结果不是 `VerifiedConfigBackfillSource` 的读授权升级，不是 grant、历史来源认证或回填写权限。后续维护 writer 必须先验证独立维护 actor / purpose-specific grant、当前撤权、准确目标/key、A 维护 request hash、schema/catalog/migration pins，认证真实原归档及 manifest，再把本次从锁定行算出的摘要和来源摘要分别与已认证 grant / request 比较。

实际旧原文和安装写授权仍为“暂无”，来源认证 issuer/manifest wire profile 仍待交付；不会从默认配置或旧 SQL 展开值反向重建原文。正式 066 原文保持已签收 SHA，081/082 留在 docs 提案。完整维护事务、授权/来源适配、审计/容量/收据和真实 MySQL 尚未由本组件完成。

## 验证与复现

模型 SQL transport 使用 A/独立 Node 向量提供实际行单元格，核对准确锁定查询、参数、完整列集合和 caller-owned transaction。逐个改变所有 126 个实际展开列必须拒绝；另覆盖所有旧元数据、最大 unsigned ID、合法 Unicode SQL 字节预算、NULL/空白原因及空非 NULL 拒绝、float/decimal/时区错误、驱动复用、输入冻结、各 SQL 阶段取消、同事务最终漂移和正式 066 的准确列名 pin。此处模型证据不证明 MySQL 锁行为或运行 grant。

在仓库根目录调用现有冻结入口，可复验完整 security / config composition 和 A response-content 定向回归。它使用已安装依赖、默认 vet、GOPROXY/GOSUMDB off，并在 finally 删除该轮 cache/tmp/telemetry、二进制和源码副本。

```powershell
$backfillStamp = Get-Date -Format 'yyyyMMddHHmmss'
& .\scripts\system-backup-d-config-mutation-local-validation.ps1 `
    -BuildParallelism 2 `
    -SourceManifestPath (Join-Path $PWD "docs/evidence/d-config-backfill-row-$backfillStamp-source.json")
```

[r25 最终冻结回执](evidence/system-backup-d-config-writer-fixture-fix-local-20261015-r25.json)接收完整安全包 195 主 / 1,293 子测试，本组件定向 9 主 / 195 子已包含其中，不重复计数。临时 overlay 分别移除列名副本和最终 target/UTC 绑定，两个指定断言必须失败、native exit 1；真实源码未改，完整入口 exit 0。另有两种 seed 模式、独立 Node 修订 2 四项与 Linux 编译通过，默认 vet、无重试。全部 1,243 输入终态无漂移，18 个重点源码 pin 一致，69 个生成路径确认删除，未安装依赖、执行 SSH、SQL 写入或提升 migration。

[r22 准备记录](evidence/system-backup-d-config-backfill-row-local-20261015-r22.json)保留原通过范围，不能继续支持旧 A 字符预算/空原因假设；[r24 两项失败](evidence/system-backup-d-config-writer-fixture-fix-local-20261015-r24.json)保留，没有重试失败断言，修订后的事实遵循正式 066 CHECK。writer 首轮共享夹具失败与本地修复记录保留；后续 [writer 真实 MySQL 回执](evidence/system-backup-d-config-writer-mysql-accepted-20261015.json)已接收 8 项 writer 和 6 项 A 安全子用例。本组件及后续维护收据模型不计入该轮真实 SQL 覆盖。


后续已增加[私有维护收据 SQL 存储候选](system-backup-d-config-maintenance-receipt-review-20261015.md)，采用本组件的完整行观察及 A 摘要规则；完整维护服务、实际来源/运行授权、真实 082 MySQL 和生产接线仍未完成。
