# D 分页候选索引远程测量接收与评审

【最新后续：2026-10-14】[v2-r2 联合验收](system-backup-d-admin-read-index-v2-r2-remote-20261014.md)已补齐同轮两段无 DDL 写流基线和 HTTP 修复验收；execution/控制计数/promotion 也通过。以下原报告保留首轮范围，“新版仍需新回执”现已关闭；分组索引、代表性负载和正式迁移仍待完成。

日期：2026-10-14。结论：本轮隔离候选测试通过；九条索引的正式 migration 暂不编号，生产批准保持 false。查询结果正确性、真实数据库执行和完整清理已验收，性能取舍仍需代表性负载与分组候选复测。

## 回执与范围

操作者提供的[完整 transcript](evidence/d-admin-read-index-mysql-remote-20261014.txt) SHA-256 为 `405cbe5cd4ef9cda2ee2ca0528c803590f632b2148b0bdc4a14d69011a94b998`。run `sbk-mig-261014021937-5c65`，namespace UID `1313a1b6-8a80-4090-9a6f-14c06783bc7a`，MySQL 8.4.8；94 个正式迁移文件准确重放。

| 输入 | SHA-256 |
| --- | --- |
| 迁移 runner | `0b867cb471b6c5b1b6d529977c079c9a85fbb577e013ca71889b6673263e24ab` |
| 迁移 catalog | `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93` |
| 索引探针（本地与远端一致） | `32c93ba108f03b880dbfc771107af4fe1c811e6052b98a24e001e99e2a8a46ed` |
| 候选索引 DDL（LF 规范化） | `ed1d7a7b64375b69dd34e25f588afad87d7c4bbd4600e8e0e915c93d869a4874` |
| A/D 正式读取探针（本地与远端一致） | `c59a371d22d0437cd5d078ac18810d8aeb6d06162034ffb1892140ebef083658` |
| HTTP 探针（本地与远端一致） | `cc4e44f1437436747039ccd5790e1f5b1e58f039ed67cfc395628c1fc0e479d6` |

五表各 12,000 行，安装分布 20%/70%/10%，状态为 pending/failed。171 对新增索引前后查询覆盖 MAX(id)、第一页/中段页、limit 51/501 及任务状态筛选，返回行数及完整结果摘要均一致。随机测量库 `didx_e5e549684d111c0423c6515e` 的候选 DDL 没有改变源库五表 SHOW CREATE 指纹。LIKE 克隆没有复制外键，性能数据排除授权及 HTTP 耗时。

`TestDAdminReadIndexCandidateMySQL`、A 授权、D 正式 schema 读取、真实 HTTP 专项均 PASS；其中新增 `overview_control_complete_counts_and_installation_isolation` 也 PASS。A/D 二进制摘要与[总览本地编译回执](evidence/system-backup-d-overview-control-local-20261014.json)相同，接收这项新增真实 MySQL 断言，无需另跑相同输入。完整总览 HTTP 仍未开放。

测量库、准确 UID namespace、远端 scratch 和本地构建缓存均报告 CLEANED；最终 `D_ADMIN_READ_INDEX_REMOTE_EXIT=0`，没有 CLEANUP_PENDING。Windows 编译崩溃由既有 helper 重试恢复；SSH 关闭提示之后仍有完整 PASS、清理和退出 0，不据此判失败。此处依据归档原文接收，未重新查询远端清理状态，也未运行远程命令。

## 本轮性能观测

[完整机器报告](evidence/system-backup-d-admin-read-index-report-20261014.json)由回执汇总器验证全部覆盖、指纹、结果一致性及清理后生成，保留原始 SQL、参数与 EXPLAIN ANALYZE；[统计摘录](evidence/system-backup-d-admin-read-index-analysis-20261014.json)按同一 table/kind/args 配对，分别计算每对 P50、P95 的 after/before 比值，再取该查询组的中位数。下面数字小于 1 表示本轮观测更快，不是合并全部样本后的总体延迟分位数。

| 表 | MAX(id) P50/P95 比值（3 对） | 无筛选页 P50/P95 比值（12 对） | 状态页 P50/P95 比值（24 对） | 新增二级索引分配字节 |
| --- | --- | --- | --- | ---: |
| backups | 0.176 / 0.198 | 0.941 / 1.239 | 0.924 / 1.166 | 2,031,616 |
| drills | 0.253 / 0.209 | 1.042 / 1.073 | 0.847 / 1.188 | 2,031,616 |
| preflights | 0.230 / 0.233 | 1.046 / 1.029 | 0.879 / 1.003 | 1,015,808 |
| artifact verifications | 0.198 / 0.191 | 1.013 / 0.984 | 0.980 / 1.168 | 1,032,192 |
| operations | 0.260 / 0.238 | 1.062 / 0.963 | 不适用 | 2,539,520 |

15 个 MAX(id) 都更快，after 计划为 `Rows fetched before execution`，没有显示具体索引名，不能把名称匹配为零解释成未使用索引。60 个无筛选页中只有 10 个 after 计划明确采用候选索引；96 个状态页中为 40 个。无筛选页显式排序从 20 个降为 15 个，状态页从 56 个降为 28 个；其他查询仍常用 PRIMARY 或旧索引，候选不会普遍消除排序或改善尾延迟。

| 表 | 插入 P50 前→后（µs） | 插入 P95 前→后（µs） | 状态更新 P50 前→后（µs） | 状态更新 P95 前→后（µs） |
| --- | --- | --- | --- | --- |
| backups | 1,342→1,091 | 3,730→5,046 | 1,535→1,243 | 2,038→1,999 |
| drills | 918→1,107 | 2,185→3,226 | 1,073→1,108 | 5,700→2,025 |
| preflights | 1,388→1,441 | 2,114→8,097 | 1,563→1,519 | 4,838→2,107 |
| artifact verifications | 668→1,344 | 1,253→3,761 | 665→1,398 | 1,782→2,178 |
| operations | 643→1,034 | 874→2,005 | 763→1,068 | 1,141→1,553 |

60,000 行合成数据新增二级索引分配空间合计 8,650,752 字节（8.25 MiB）。整组 DDL 耗时约 1.933 秒；110 次插入/删除写入对中 109 次与 DDL 区间重叠，写入对 P50/P95 为 2.982/55.151 ms。没有不执行 DDL 的对应并发写流基线，不能用这些数字量化新增 DDL 导致的阻塞。

存在明显的局部退化：artifact sparse 首段 failed/51 页 P50 为 960→2,099 µs，backup foreign 首段无筛选/51 页 P95 为 1,207→12,139 µs，两者 after 均没有选择候选索引。artifact sparse 中段 failed/51 选择候选索引，但 P95 为 1,575→11,572 µs。这是一次先 before 后 after 的热缓存合成测量；宿主负载、阶段顺序及缓存都可能影响结果，不能直接把这些差异归因于索引。

## D 评审决定与后续输入

1. 接收本轮正确性与隔离测量回执，关闭“没有真实 MySQL 测量”和“总览控制计数新断言未执行”两个限定缺口。
2. 九条候选继续保留在评审 SQL，暂不整体转正式迁移。优先拆分无状态与状态索引分别测量，确认 MAX(id)/状态续页收益是否能以更少索引取得，并单独复核 artifact/operation 的写入成本；本轮一起添加九条无法归因到单条索引。生产查询不增加 FORCE INDEX。
3. 后续由操作者取得受审的代表性安装/状态/数据量、真实 FK 和并发读写条件，在重复/交错阶段中记录扫描、排序、读写 P50/P95、空间、DDL 无变更基线及锁等待。预算和保留/调整/移除决议确定后再编号 migration。
4. canonical 配置列独立评审，不等待索引整组批准。实际历史库升级、生产部署/授权、完整总览 Owner 来源与浏览器验收仍分别待完成。本 run 没有批准这些范围。

后续：[DDL 写流前后基线增量](system-backup-d-index-writer-baseline-20261014.md)已补入新版探针和报告协议，供下一轮独立测量；本页及其原机器回执保留首轮范围，没有补造基线。新版的真实 MySQL 结果仍需新回执。
