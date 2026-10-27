# D 索引 v2-r2 联合远程验收

日期：2026-10-14。结论：本轮隔离 MySQL 联合验收通过，关闭新版写流基线、HTTP 夹具冲突修复及最新 execution/promotion 数据库专项的验收缺口。分组索引、代表性负载与正式迁移仍待完成。

## 同轮证据

[原始 transcript](evidence/d-admin-read-index-mysql-remote-20261014-v2-r2.txt) SHA-256 为 `3af8edc2f8a6ed47b4368c71d106696eeba2e35804f7168c32cb324443205c27`。run `sbk-mig-261014071158-68a6`，namespace UID `8d32d1ec-db06-4a0d-a82e-38c312b28a67`，MySQL 8.4.8。94 个正式迁移准确重放；索引 scope 为 measurement_version=2。

[完整测量报告](evidence/system-backup-d-admin-read-index-report-20261014-v2-r2.json)由现有严格汇总器解析原始回执生成；[验收及统计记录](evidence/system-backup-d-admin-read-index-acceptance-20261014-v2-r2.json)另核对 A/HTTP 指纹、父子测试及当前限定源码。首轮成功报告和 v2 失败回执均保留原字节。

| 探针 | 同轮 SHA-256 |
| --- | --- |
| 索引 | `692faec48834efd3d75fd73756518a63d21abe58120e5673d7e7ae537b103207` |
| 候选索引 DDL | `ed1d7a7b64375b69dd34e25f588afad87d7c4bbd4600e8e0e915c93d869a4874` |
| A/D full-schema | `c4ba30b52786f437e49b5ec21e8290c760361f6bcba1729e593f85cb89b48385` |
| HTTP | `2adc8f11dfef91f67584ecf22774f05238de2e19cceb38a856b19074f097b64c` |
| 迁移 runner | `0b867cb471b6c5b1b6d529977c079c9a85fbb577e013ca71889b6673263e24ab` |
| migration catalog | `0de7fd12672eccc8b51fd38b6e3dd49e6342fe3e52da247267e9cd02ba420d93` |

本地与远端探针/runner 摘要一致；A/D 和 HTTP 摘要与修复后本地回执一致，full-schema、HTTP 和汇总器三份限定源码也与该本地记录一致。这不声称整个依赖图冻结。

`TestDAdminReadIndexCandidateMySQL`、`TestAAdminReadAuthorityMySQL`、`TestDAdminReadFullSchemaMySQL`、`TestDAdminReadLiveHTTPMySQL` 全部 PASS。full-schema 下 execution/双连接快照、控制计数/跨安装、promotion/可用性丢失三项子测试均 PASS。HTTP 覆盖四类任务列表、续页、operation、200/400/401/403/503、安装隔离及撤权；不代表完整总览或详情 HTTP。

171 对索引前后查询返回行数及完整结果摘要一致。测量库 `didx_ad827cbf650f671c9f39b095`、准确 UID namespace、远端 scratch、本地缓存全部报告 CLEANED，最终 `D_ADMIN_READ_INDEX_REMOTE_EXIT=0`，无实际 CLEANUP_PENDING。开头两条 TerminatingError 属于随后明确 PASS 的派发拒绝负测；完整远程阶段无失败测试。SSH 关闭提示未破坏最终 PASS/清理/退出记录。本次仅接收归档回执，未另查远端。

## 写流基线与性能取舍

两段无 DDL 基线各 30 个完整 insert/delete 对、五表各 6 对，次序为 before→DDL→after。DDL 耗时 2.233 秒，145 个完整写入对中 144 个与 DDL 区间重叠。

| 写流阶段 | P50（ms） | P95（ms） |
| --- | ---: | ---: |
| DDL 前无 DDL | 2.227 | 11.374 |
| DDL 重叠子集 | 2.580 | 88.088 |
| DDL 后无 DDL | 3.396 | 48.028 |

重叠子集 P95 为前基线的 7.745 倍、后基线的 1.834 倍。顺序阶段、宿主负载、缓存和表占比仍可能影响结果；这是客户端整对耗时，不能将比值直接解释为生产锁等待或 DDL 因果增量。

以下为同一 query/args 的 after/before 比值再按组取中位数，小于 1 表示本轮观测更快；不是所有样本合并后的总体分位数。

| 表 | MAX(id) P50/P95 | 无筛选页 P50/P95 | 状态页 P50/P95 |
| --- | --- | --- | --- |
| backups | 0.319 / 0.056 | 1.118 / 1.024 | 0.962 / 1.283 |
| drills | 0.241 / 0.098 | 1.055 / 1.170 | 1.038 / 1.407 |
| preflights | 0.300 / 0.081 | 1.108 / 1.276 | 1.025 / 1.150 |
| artifact verifications | 0.181 / 0.070 | 0.962 / 0.986 | 0.922 / 0.905 |
| operations | 0.258 / 0.414 | 1.264 / 1.069 | 不适用 |

新增二级索引分配空间合计 8,650,752 字节（8.25 MiB）。MAX(id) 各组改善，但分页并无普遍收益，部分读写指标退化，九条候选继续不整体转正式 migration。下一步拆分无状态/状态候选，使用代表性分布、真实 FK、并发及交错测量确定读写预算和保留决议；canonical 配置正式化独立推进。

本次未运行测试构建、安装依赖、连接远端或修改生产批准。新增 JSON 是验收证据，不是测试构建产物。完整 Owner 来源、生产适配、实际升级/激活和页面端到端仍待各自验收。
