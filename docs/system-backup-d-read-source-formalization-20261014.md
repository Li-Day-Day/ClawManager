# D：配置读源、分页索引和总览正式化交接

【2026-10-14 A 后续交付】[A canonical 写入/回填交接](system-backup-a-config-canonical-write-handoff-20261014.md)补充了 A 已评审的权限、strong-auth/nonce、幂等和事务审计实现要求，见[机器合同](evidence/a-config-canonical-write-contract-20261014.json)及[签收指纹](evidence/a-config-canonical-write-signoff-20261014.json)。D 可继续实现 update/rollback 和独立离线维护收据。具体安装写授权及旧版本原始 canonical 文件仍暂无，真实回填不能执行；下面材料审计保留历史核对状态。该 A 角色评审不是人工/部署签名或 v12 整体冻结。

【2026-10-14 材料核对】[仓库材料审计](evidence/system-backup-d-canonical-materials-audit-20261014.json)确认当前只有配置 mutation 草案、候选 bootstrap 和只读回填核对；正式独立写授权/幂等审计交付及安装/版本绑定的旧 canonical 原文登记“暂无”。例子、fixture 和旧 schema pin 的 lab 包不能替代原文或批准。依据用户“先检查，没有就是暂无”的答复，不再重复询问这些路径；正式迁移/生产写入和旧行回填仍待实际材料。

日期：2026-10-14。依据当前源码、v12 主计划和归档回执。本页给出下一轮可执行的候选验证和评审输入；不代替 A/B/C 签收，不执行实际安装升级。

## 配置快照：进入正式迁移评审

[配置 HTTP 与 bootstrap 交接](system-backup-d-config-http-candidate-20261013.md)末尾的完整回执已关闭 `bootstrap_canonical_commit_and_receipt_rollback` 专项：真实 bootstrap 提交准确 canonical 字节，后置操作收据失败时配置、安装状态、操作和审计全部回滚。该回执的 synthetic admission 不能证明生产 Owner 准入。此前开发流程中“真实 bootstrap 提交/回滚尚未完成”已过期；当前剩余的是正式迁移与生产装配。

候选仍采用可空 `MEDIUMBLOB`；准确字节、长度、JSON、hash 和全部展开列由读取器联合校验。旧行 NULL 必须继续失败关闭。正式追加迁移只新增该列和现有候选 CHECK，不在 DDL 中猜测、合成或回填 JSON，也不修改 `066` 的已发布字节。canonical 与分页索引应分别评审和编号，避免配置正确性依赖一个尚未完成负载取舍的索引决定。

| 决议 | 现有输入 | 正式化验收 |
| --- | --- | --- |
| A/D 确认准确快照及旧行失效语义 | canonical 候选 DDL、hash/size/展开列校验与 HTTP/真实 bootstrap 限定专项 | 明确接受旧行 NULL 时 503，禁止以只读权限授权 UPDATE；旧行回填的独立写授权、审计和容量由 A/D 另定 |
| D 分配追加 migration 并更新 schema 材料 | 当前 94 文件 catalog；候选列尚未编号 | 保留旧 migration 字节，更新 inventory/schema hash；fresh replay 与受审历史路径各自验证，不沿用候选 DDL 指纹作为正式目录批准 |
| D/A 装配生产新写入口 | `ConfigBootstrapService.CanonicalSnapshot` 同事务候选路径 | 正式列就绪后按受审部署启用；所有后续 config update/rollback 写入也必须从同一已验证对象生成展开列和准确快照，不得仅切 bootstrap 开关 |
| D/A 回填原版本 | `VerifyConfigBackfillSource` 当前只读核对器 | 原始受审文件逐版本绑定安装/hash/size/展开列，在真正写事务内重新核对并记录审计；事务外的只读回执不能作为写权限或抵消并发变化 |

当前没有可授权旧行写入的正式 backfill 服务，也没有完整 config update/rollback 写路径；这两项需要 A 的权限/幂等/审计合同后再接线。缺少原文的版本维持 NULL，不改变旧 hash。

## 分页索引：新增隔离测量入口

`scripts/system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadIndexCandidate` 新增独立档位，不能与 canonical 档位组合。无 `-Remote` 时仅离线跑现有测试、输入/分布/采样检查及 Linux 探针编译；不连接数据库、不安装依赖，结束清理专用构建目录。

远端仍由操作者从仓库根目录运行并保存完整输出：

```powershell
Set-Location 'C:\Users\zhanghui08\Desktop\clawmanager\ClawManager'
$log = 'docs/evidence/d-admin-read-index-mysql-remote-20261014.txt'
Start-Transcript -Path $log
try {
  & .\scripts\system-backup-a-evidence-validation.ps1 -AdminReadOnly -AdminReadIndexCandidate -Remote -BuildParallelism 1 -SshTarget 'root@10.130.14.23'
  if (-not $?) { throw 'D admin read index MySQL measurement failed' }
  Write-Output 'D_ADMIN_READ_INDEX_REMOTE_EXIT=0'
} finally {
  Stop-Transcript
}
```

新探针先核对 run namespace/UID、server UUID、正式 066/067 账本和候选 DDL 摘要，再创建随机 `didx_` 数据库，用 `CREATE TABLE LIKE` 克隆五张正式表。**LIKE 不复制 FK**，这项测量不证明真实任务写入的 FK、权限或恢复正确性。候选 ALTER 仅在随机库执行，源库五表的 `SHOW CREATE TABLE` 指纹须在前后相同；随机库由独立清理超时删除，外层仍清理准确 UID namespace 和两端目录。

每张表合成 12,000 行，安装分布为 20%/70%/10%，每七行一条 failed，其余 pending；创建和 reconcile 时间刻意不随 id 单调，避免时间索引偶然掩盖排序成本。查询复用正式 reader 的完整投影、谓词和参数形状，测量三个安装的 MAX(id)、第一页/中段续页、limit 51/501，以及四类任务的 pending/failed 筛选。前后结果摘要须相同。每条查询记录原始 `EXPLAIN ANALYZE` 与绑定值；一次预热后采样 30 次，记录获取全部列的客户端 P50/P95。另记录 30 次 autocommit 插入/状态更新、secondary index 分配空间及整组候选 DDL 耗时。执行 DDL 时另一个连接对额外合成行连续 autocommit 插入/删除，记录与 DDL 区间实际重叠的写入对数量和 P50/P95；没有重叠则拒绝该测量，测量后删除额外行并恢复自增位置，保持基准页不变。

输出采用 `D_ADMIN_INDEX_REVIEW` JSON 行，包含 phase/table/SQL/args/plan/分布/结果摘要/耗时。只有 `TestDAdminReadIndexCandidateMySQL` PASS、`PASS d-admin-read-index-candidate-mysql`、探针/DDL/迁移指纹、随机库与相同 UID namespace/两端 `CLEANED`、最终 `D_ADMIN_READ_INDEX_REMOTE_EXIT=0` 都齐全且没有 `CLEANUP_PENDING`，才记录本轮限定专项完成。

取得完整 transcript 后运行以下本地命令输出 JSON 对照报告：

```powershell
node .\scripts\system-backup-d-admin-read-index-report.mjs .\docs\evidence\d-admin-read-index-mysql-remote-20261014.txt
```

汇总器要求同一 scope、准确指纹、正式迁移重放、全部 171 对查询、每表两个阶段的分布/写入/空间、相同结果摘要及完整清理/退出标记；缺项或漂移直接拒绝，不把部分输出拼成通过。报告保留原始计划和绑定参数，并固定 `production_approved=false`。本地合成 transcript 测试仅验证汇总器的接受/拒绝边界，不是性能测量回执。

该入口提供**合成、热缓存、单连接查询**基线，排除 A 授权和 HTTP 延迟；DDL 阶段只使用一条合成插入/删除流。它不能替代真实分布、冷缓存、并发读写、线上写入阻塞和应用端延迟测量，也不自动批准九条候选索引。取得回执后先比较扫描/排序与收益，再决定保留、调整或移除候选；正式 migration 编号继续等待性能决议。

### 本地验收（2026-10-14）

`-AdminReadOnly -AdminReadIndexCandidate -BuildParallelism 1` 本地退出 0：A 读授权、D 完整读取包、Gin 定向测试、MySQL seed、Linux A/D/HTTP/索引探针与迁移工具编译通过；最终源码另以带标签的 `TestDAdminReadIndexSeed` 保留 vet 复查通过。共享合同 70/70、回执汇总 16/16、PowerShell/Git Bash 语法与规范化评审输入指纹核对均通过。[机器回执](evidence/system-backup-d-admin-read-index-local-20261014.json)记录本轮源码和四个二进制指纹，索引探针为 `ac08bf5d3aecc8b4d8beb5f96203a57aa32eb686e62f53e9db7a6172ae49e7d9`，候选 DDL 的 LF 规范化摘要为 `ed1d7a7b64375b69dd34e25f588afad87d7c4bbd4600e8e0e915c93d869a4874`。脚本报告 `CLEANED local-registration-build-cache=True`，另核对本轮准确临时目录已不存在。未安装依赖、未保留测试构建产物，未运行真实 MySQL。当前 Docker 引擎不可用；Git Bash 语法检查在沙箱信号管道拒绝后以只读 `-n` 检查通过。

### 远程测量已接收（2026-10-14）

[完整远程回执及 D 决议](system-backup-d-admin-read-index-remote-20261014.md)记录 run `sbk-mig-261014021937-5c65`：171 对结果一致、源表结构未变、DDL 与 109 次写入对重叠、A/D/HTTP 及总览新增子断言 PASS，准确 UID namespace/数据库/两端目录报告清理，最终退出 0。汇总器已生成[完整机器报告](evidence/system-backup-d-admin-read-index-report-20261014.json)。本轮索引二进制为 `32c93ba108f03b880dbfc771107af4fe1c811e6052b98a24e001e99e2a8a46ed`；上方本地回执仍保留早前输入，不能覆盖为新指纹。合成热缓存测量收益混合，写入/尾延迟和 8.25 MiB 新增空间须继续评审，九条候选暂不整体编号正式 migration。相同成功套件无需重跑。

索引后续准备：[相同写流的 DDL 前后基线](system-backup-d-index-writer-baseline-20261014.md)补齐首轮对照缺口，report v2 强制两段完整基线及 DDL 重叠子集，原回执保持旧版范围。新版真实测量、分组候选和代表性负载仍需操作者新证据，不据本地测试编号 migration。

## 总览：逐字段权威来源交接

`OverviewResource` 的 wire shape 保持 v12 闭集；当前 HTTP `/system-backup-overview` 仍返回 503。D 不用 fixture、进程缓存或 Prometheus 生成 live 事实。下表是对现有字段的接线请求，不新增公共规则。

| 字段组 | 当前可定位来源 | 仍缺的接线/签收 |
| --- | --- | --- |
| schema/installation/config/effective/monitoring/matrix | 065 installation state、066 active config、D controller 的安装 CAS；A 当前受信安装授权 | 在同一授权事务固定 active version 与 row version，确认 controller 投影和受审部署开关一致；不能单凭 `config.enabled` 输出 effective_enabled |
| active_task_count / finalization_unknown_count | 067 四类任务状态 | D 按主计划和各状态闭集定义准确非终态集合；冻结是否包含其他任务类别，禁止四类页首条数冒充全量计数 |
| active_operation_count | 066 operation pending/running | D 同事务安装范围精确计数，不从分页长度推算 |
| baseline_present / backup_recovery_readiness | 069 当前 matrix 的 active promotion、源 backup/drill 绑定及七类依赖健康 | D/A/B/C 提供当前准确版本、资格和健康事实，按主计划派生；没有 baseline 必须 false，有 baseline 不等于 readiness 为 true |
| controller_health / database_health | D controller/数据库的持久化观察 | D 交付观测记录、过期和状态判定；一次 SELECT 成功或 Pod Running 不能替代健康观察 |
| artifact_target_health / catalog_health | C committed artifact/catalog 的准确版本和观测 | C 提供持久化来源及当前/过期判定，不能由任务 succeeded 或 MinIO 连通性代推 |
| evidence_store_health | A evidence/provider 当前准确身份版本和证明 | A 提供持久化观察、有效期和失败语义，不能把历史 lab PASS 当作当前健康 |
| source_writer_state | B writer registry、participant/capture 观察及 A 注册证明 | A/B 签收完整性、drift 和未知状态来源，不以“未查询到写者”输出 clean |
| cleanup_backlog_count / ownership_resolution_backlog_count | B restore/staging/Job 资源、C catalog/prune、D operation 归属 | 各 Owner 冻结计数单位、状态集合和去重键；仅数 failed cleanup operation 会遗漏无 operation 的资源，不足以开门 |
| shortage_failure_domains | 受审 failure-domain registry、C 当前 usable artifact、D 资格/hold 与恢复点事实 | A/C/D 明确同一观测时点、域归属、版本、去重和最小副本门槛；当前缺完整权威适配 |
| observed_at | 目标数据库 UTC 时点 | 由同一读事务取得，不能用浏览器/本机时钟给持久化事实重新计时 |

组装入口应沿用 `ScopeProvider.AuthorizeRead` → 固定安装/config → 各 Owner 同事务只读事实 → 全字段闭集/关系检查 → `RecheckRead` → 确认 COMMIT 后返回；授权/SQL/Owner 读取失败不返回部分资源。缺少必需事实时保持 503，只有合同允许且 Owner 已定义的观测未知状态才可输出 `unknown`，不能把缺失适配一律换成 unknown/0/false。

下一轮验收覆盖跨安装、config/matrix 变更、授权撤销竞争、陈旧观察、缺/坏证明、baseline 依赖漂移、backlog 去重和失败零部分结果，再接真实 HTTP 与浏览器。当前这个字段表不构成 Owner 签收或页面上线证据。

2026-10-14 后续：[总览控制表读取组件](system-backup-d-overview-control-20261014.md)已落代码，在同一受信事务固定安装/config 并读取四类任务及 Operation 的完整分状态计数，提供后续 Owner 同事务组装接点。组件禁止直接序列化，不制造完整 active-task 汇总或健康/资格事实；完整总览 HTTP 继续未就绪。真实 MySQL 新增子断言已在本轮索引档位回执明确 PASS，A/D 二进制与本地编译摘要一致；该限定缺口已关闭。

同日再后续：[当前 promotion 数据库记录贡献](system-backup-d-promotion-control-read-20261014.md)补当前安装/matrix 的 active 行、准确 backup/drill/evidence/创建配置绑定及同事务 builder；保留创建版本与当前版本差异，可用性丢失不删除基线记录。新来源仍禁止直接序列化，不派生当前七组健康或 readiness；新的真实 MySQL 子断言待新回执，完整 Owner 语义和总览仍待完成。
