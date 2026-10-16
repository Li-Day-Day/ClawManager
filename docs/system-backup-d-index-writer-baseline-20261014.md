# D 候选索引 DDL 写流基线增量

【分组增量：2026-10-14】[page/status/all 两轮对照](system-backup-d-index-group-review-20261014.md)已补闭集子集选择、实际 DDL 摘要、正反序六项独立环境及联合汇总入口；旧版/v2-r2 回执保留原范围。分组真实 MySQL 和代表性负载仍需新回执，不重跑已通过的旧九条整组输入。

【最新验收：2026-10-14 v2-r2 已通过】[联合远程回执与决议](system-backup-d-admin-read-index-v2-r2-remote-20261014.md)已核对新版两段写流基线、171 对查询一致、A/D/HTTP 全部 PASS、准确 UID 清理和最终退出 0。execution/快照竞争、控制计数、promotion 三项子断言同轮通过，无需另跑相同输入。下方 v2 失败与重跑命令保留过程记录；真实 MySQL/HTTP 修复验收不再待执行。分组索引、代表性负载与正式迁移仍待完成。

日期：2026-10-14。此增量补齐[首轮索引评审](system-backup-d-admin-read-index-remote-20261014.md)指出的测量缺口：旧回执有 DDL 期间写流，但没有相同写流在无 DDL 时的对照，不能量化新增 DDL 的写入影响。本轮没有新增正式 migration 或生产批准。

操作者已运行新版，[v2 原始回执](evidence/d-admin-read-index-mysql-remote-20261014-v2.txt)的索引探针及 A/D full-schema（含 execution、控制计数、promotion 三项子测试）通过，但后续 HTTP 因 fixture public_id 重复失败。full-schema promotion 与 HTTP 都写入全局唯一的 `sbk_00000000-0000-4000-8000-000000000091`；已把 full-schema 的各类资源 ID 分配到 UUID 前缀 `000000d1`，保留 HTTP 的 `00000000`。没有更改唯一键、SQL 约束或放宽断言。[失败审计](evidence/system-backup-d-admin-read-index-v2-failed-20261014.json)保存完整身份和限定观测；本轮整体退出 1，不能生成成功报告。

该回执记录了测量数据库、准确 namespace/UID、远程临时目录和本地缓存清理完成，没有实际 `CLEANUP_PENDING` 标记。原汇总器误将异常提示 `retain any CLEANUP_PENDING identity` 当成清理告警；修复后仍拒绝该回执，原因改为缺少最终 wrapper exit=0。不得补写退出 0 或覆盖失败回执。下一轮使用下方 `v2-r2` 文件。

[修复后本地验证](evidence/system-backup-d-http-fixture-fix-local-20261014.json)与[原始输出](evidence/system-backup-d-http-fixture-fix-local-20261014.txt)：读取授权、D 读取包、HTTP、带标签 seed 和默认 vet 通过，Linux A/D、HTTP 探针及迁移 CLI 编译成功；汇总器 43 项测试通过，旧成功报告解析结果完全一致，真实 v2 失败回执仍被拒绝，矛盾的远程 FAIL/退出 0 也被拒绝。一次已知 Windows vet `0xc0000043` 崩溃由既有 helper 保留 vet 重试后恢复。新 A/D 探针 SHA-256 为 `c4ba30b52786f437e49b5ec21e8290c760361f6bcba1729e593f85cb89b48385`；HTTP 和迁移 CLI 指纹未变。本轮未安装依赖或连接远端，独立缓存与二进制已删除并确认准确目录不存在。真实 MySQL/HTTP 联合修复验收仍待下方完整重跑。

## 新版探针与报告

[隔离探针](../backend/internal/systembackupread/page_index_mysql_test.go)现在输出 `measurement_version=2`，在候选 ALTER 前、后各执行 30 对无 DDL 的 autocommit insert/delete，五表各 6 对。两次基线与 DDL 后台写流共用同一函数、表轮转、额外 fixture 行构造和单对计时逻辑。SQL 失败立即停止，不重试失败写入，不把半个 insert/delete 计为完成样本；正常 stop 信号在成对边界响应，取消/SQL 错误可能打断一对，其残留由 run-owned 随机库的最终删除回收。每段正常结束删除额外行并重置隔离库自增位置，保持原 171 对页结果基准不变。

DDL 记录保留原全部写入对的 P50/P95，另增加仅选取与 DDL 时间区间重叠的写入对 P50/P95 和每表数量。对边界使用严格重叠判定：写入恰好在 DDL 开始前结束、或恰好在结束后开始，均不进入该子集。子集计时仍是整对 insert/delete 的客户端耗时，不是精确的服务器锁等待时长。

[汇总器](../scripts/system-backup-d-admin-read-index-report.mjs)对新版强制要求：准确两段基线、各 30 个完整样本/均衡五表、autocommit 且无 DDL、基线记录按 before→DDL→after 排列；DDL 整体/重叠子集的每表数量与总数一致且不越界、写流上限为 10,000、分位数合法。缺少任一段、混合版本、降级或不完整输出均拒绝。

完整新版报告新增 `ddl_writer_baselines` 和 `ddl_overlapping_pair_ratio_to_no_ddl`，分别用重叠写入对的 P50/P95 除以前/后基线相应分位数；基线因微秒取整为零时输出 null，不合成有限值或 Infinity。原先的总写入对分位数不用于这些比值。

这些仍是顺序执行、合成数据、热缓存、单条写流的观测。DDL 子集的表占比可能与均衡基线不同，宿主负载和缓存也会变；不能仅凭比值把全部差异归因于 DDL，更不能宣称已测得生产锁等待预算。LIKE 没有复制 FK，授权/HTTP 耗时仍由独立功能专项验证。分组索引、真实分布、并发负载和正式性能取舍继续待完成。

## 本地与历史证据

汇总器 36 项本地测试已通过，覆盖完整新版报告、缺失/重复/错误基线、分布漂移、DDL 子集计数、零基线、版本降级、记录次序与不可能的基线总耗时。对已有[首轮完整 transcript](evidence/d-admin-read-index-mysql-remote-20261014.txt)再次解析后，与归档机器报告逐字段完全相同；没有修改原始回执或给旧数据补造基线。历史报告仍只证明旧版范围。

Go 的本地 seed 增加共用写流的完整成对/均衡、insert/delete 故障、取消/停止/循环上限及时间区间边界断言，不连接 MySQL。带标签 seed（1 个顶层/含子测试 10 项）与默认 vet 通过，Linux tagged 探针编译通过，最终退出 0；二进制 SHA-256 为 `ba5661274b2ea62a582b0654d9465bfcfe691b45e86f0d2cc5502857b3b9e285`。[本轮机器回执](evidence/system-backup-d-index-writer-baseline-local-20261014.json)登记源码、原始本地输出与清理，专用缓存和二进制已删除并另查准确目录不存在。未安装依赖，也未运行远程测试；编译不是数据库执行结果。

## 操作者下一轮完整命令

当前独立档位自动使用新版探针，无需修改 A 的其他验证 profile。保留新的原始文件，不覆盖首轮证据：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
& {
  $ErrorActionPreference = 'Stop'
  $log = 'docs/evidence/d-admin-read-index-mysql-remote-20261014-v2-r2.txt'
  if (Test-Path -LiteralPath $log) { throw 'Refusing to overwrite existing remote evidence' }
  Start-Transcript -Path $log
  try {
    & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadIndexCandidate -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
    if (-not $?) { throw 'D admin read index writer-baseline validation failed' }
    Write-Output 'D_ADMIN_READ_INDEX_REMOTE_EXIT=0'
  } finally {
    Stop-Transcript
  }
  node .\scripts\system-backup-d-admin-read-index-report.mjs $log
  if ($LASTEXITCODE -ne 0) { throw 'D admin index report rejected the remote evidence' }
}
```

验收需新 scope 的 `measurement_version=2`、两段无 DDL 基线和重叠写入记录、171 对结果一致、所有 A/D/HTTP 和迁移门禁 PASS、输入/二进制摘要一致、准确 UID 与数据库/两端目录清理和最终退出 0。同轮当前 A/D 探针还会包含[新增详情执行/双连接快照断言](system-backup-d-task-execution-read-20261014.md)；若该子测试同轮 PASS，可按其准确探针指纹分别接收，无需另外重跑相同输入的独立详情档位。

本地不运行远程测试。正式索引编号、canonical 配置迁移、Owner 详情/总览来源、生产适配及实际安装升级仍由各自门禁控制。
